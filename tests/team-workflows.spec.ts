import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { PlannerState, Profile } from "../src/lib/types";

const errors = new WeakMap<Page, string[]>();
async function watchPage(page: Page) {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  // Honolulu: Saturday, October 10, 2026 at 10:00.
  await page.clock.install({ time: new Date("2026-10-10T20:00:00Z") });
}
test.beforeEach(async ({ page }) => {
  await watchPage(page);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function storedPlan(page: Page): Promise<PlannerState> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("enlisted-planner:v1")!),
  );
}
async function openPlanner(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore first", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
  await expect.poll(async () => (await storedPlan(page)).version).toBe(3);
}
async function seedPlanner(
  page: Page,
  update: Omit<Partial<PlannerState>, "profile"> & {
    profile?: Partial<Profile>;
  },
) {
  await openPlanner(page);
  await page.evaluate((changes) => {
    const current = JSON.parse(localStorage.getItem("enlisted-planner:v1")!);
    localStorage.setItem(
      "enlisted-planner:v1",
      JSON.stringify({
        ...current,
        ...changes,
        profile: { ...current.profile, ...changes.profile },
      }),
    );
  }, update);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
}
async function visit(page: Page, name: string) {
  const mobileMenu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("button", { name, exact: true }).first().click();
}

const members: PlannerState["members"] = [
  {
    id: "taylor",
    name: "Taylor",
    rank: "SrA",
    focus: "Training",
    nextFeedback: "",
    notes: "",
    contactId: "taylor-contact",
  },
];
const contacts: PlannerState["contacts"] = [
  {
    id: "taylor-contact",
    name: "Taylor",
    role: "Teammate",
    agency: "",
    phone: "",
    email: "taylor@example.com",
    location: "",
    notes: "",
  },
];
const projects: PlannerState["projects"] = [
  {
    id: "handover",
    title: "Handover",
    objective: "Make handovers clearer.",
    startDate: "2026-10-10",
    dueDate: "2026-10-23",
    status: "Active",
    ownerId: "taylor",
    objectiveId: "",
    resources: "",
    risks: "",
    successMeasure: "",
    baseline: "",
    target: "",
    actual: "",
    notes: "",
    swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
  },
];

test("pasted taskers require field review and an explicit calendar choice for a relative suspense", async ({
  page,
}) => {
  await seedPlanner(page, { members, contacts, projects, tasks: [] });
  await visit(page, "Projects & taskers");
  await page
    .getByRole("button", { name: "Import tasker text", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review taskers from pasted text",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "Email or meeting notes", exact: true })
    .fill(
      "From: Taylor\nSent: 2026-10-09\nSubject: Handover action items\nTask: Prepare report; Owner: Taylor; Due: 2026-10-20; Project: Handover; Effort: 45 minutes\nAction: Review handover by next Friday",
    );
  await dialog
    .getByRole("button", { name: "Extract draft taskers", exact: true })
    .click();
  const first = dialog.locator(".intake-draft").nth(0);
  const relative = dialog.locator(".intake-draft").nth(1);
  await expect(
    first.getByRole("combobox", { name: "Tasker owner", exact: true }),
  ).toHaveValue("taylor");
  await expect(
    first.getByRole("combobox", { name: "Tasker project", exact: true }),
  ).toHaveValue("handover");
  await expect(first.getByLabel("Suspense date", { exact: true })).toHaveValue(
    "2026-10-20",
  );
  await expect(
    relative.getByLabel("Suspense date", { exact: true }),
  ).toHaveValue("");
  await expect(relative).toContainText(
    "relative dates depend on when the sender wrote this",
  );
  expect((await storedPlan(page)).tasks).toEqual([]);

  await dialog
    .getByRole("button", { name: "Create 2 reviewed taskers", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Review and confirm each selected draft",
  );
  expect((await storedPlan(page)).tasks).toEqual([]);
  await first
    .getByRole("checkbox", { name: "Confirm draft 1 reviewed", exact: true })
    .check();
  await relative
    .getByLabel("Tasker title", { exact: true })
    .fill("Review handover");
  await relative
    .getByRole("combobox", { name: "Tasker owner", exact: true })
    .selectOption("taylor");
  await relative
    .getByRole("combobox", { name: "Tasker project", exact: true })
    .selectOption("handover");
  await relative
    .getByLabel("Suspense date", { exact: true })
    .fill("2026-10-23");
  await relative
    .getByRole("checkbox", { name: "Confirm draft 2 reviewed", exact: true })
    .check();
  // Any field edit invalidates the earlier review approval.
  await relative
    .getByLabel("Estimated effort (minutes)", { exact: true })
    .fill("30");
  await expect(
    relative.getByRole("checkbox", {
      name: "Confirm draft 2 reviewed",
      exact: true,
    }),
  ).not.toBeChecked();
  await relative
    .getByRole("checkbox", { name: "Confirm draft 2 reviewed", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Create 2 reviewed taskers", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await storedPlan(page)).tasks.length).toBe(2);
  const created = (await storedPlan(page)).tasks;
  expect(created[0]).toMatchObject({
    title: "Prepare report",
    date: "2026-10-20",
    assigneeId: "taylor",
    projectId: "handover",
    estimatedMinutes: 45,
    completed: false,
  });
  expect(created[1]).toMatchObject({
    title: "Review handover",
    date: "2026-10-23",
    assigneeId: "taylor",
    projectId: "handover",
    estimatedMinutes: 30,
    completed: false,
  });
  expect(created[1].notes).toContain("next Friday");
  await expect(
    page.getByRole("tab", { name: "Taskers", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Work & mission", exact: true }),
  ).toBeVisible();
  expect((await storedPlan(page)).tasks).toEqual(created);
});

test("two separate planners exchange actual downloaded tasker packets before supervisor-confirmed completion", async ({
  page,
  browser,
  baseURL,
}) => {
  const tasks: PlannerState["tasks"] = [
    {
      id: "input",
      title: "Confirm briefing inputs",
      date: "2026-10-09",
      completed: true,
      status: "Done",
      completedOn: "2026-10-09",
      priority: "Normal",
    },
    {
      id: "brief",
      title: "Prepare the handover brief",
      date: "2026-10-20",
      suspenseTime: "14:30",
      completed: false,
      status: "Open",
      priority: "High",
      assigneeId: "taylor",
      projectId: "handover",
      estimatedMinutes: 60,
      dependencyIds: ["input"],
      notes: "Return the updated briefing and a record of changes.",
    },
  ];
  await seedPlanner(page, {
    profile: { name: "Jordan", role: "Supervisor" },
    members,
    contacts,
    projects,
    tasks,
  });
  await visit(page, "Shared taskers");
  await expect(
    page.getByRole("heading", { name: "Team taskers", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare offer", exact: true })
    .click();
  const preparing = page.getByRole("dialog", {
    name: "Prepare a tasker offer",
    exact: true,
  });
  await expect(
    preparing.getByRole("combobox", { name: "Tasker", exact: true }),
  ).toHaveValue("brief");
  await expect(
    preparing.getByLabel("Recipient name", { exact: true }),
  ).toHaveValue("Taylor");
  await expect(
    preparing.getByLabel("Recipient email (optional)", { exact: true }),
  ).toHaveValue("taylor@example.com");
  await preparing
    .getByRole("button", { name: "Prepare offer packet", exact: true })
    .click();
  const offerDialog = page.getByRole("dialog", {
    name: "Tasker offer packet",
    exact: true,
  });
  const offerDownloadEvent = page.waitForEvent("download");
  await offerDialog
    .getByRole("button", { name: "Download packet", exact: true })
    .click();
  const offerDownload = await offerDownloadEvent;
  const offerPath = (await offerDownload.path())!;
  const offerBytes = await readFile(offerPath);
  const offered = JSON.parse(offerBytes.toString("utf8"));
  expect(offered).toEqual(
    JSON.parse(
      await offerDialog
        .getByRole("textbox", { name: "Packet JSON", exact: true })
        .inputValue(),
    ),
  );
  expect(offered).toMatchObject({
    kind: "enlisted-planner-tasker-offer",
    supervisorName: "Jordan",
    delegation: {
      recipientName: "Taylor",
      recipientEmail: "taylor@example.com",
      sentOn: "2026-10-10",
    },
    task: {
      title: "Prepare the handover brief",
      date: "2026-10-20",
      suspenseTime: "14:30",
      projectTitle: "Handover",
      prerequisites: [
        { id: "input", title: "Confirm briefing inputs", completed: true },
      ],
    },
  });
  expect(offerDownload.suggestedFilename()).toMatch(/^tasker-offer-.+\.json$/);
  await offerDialog
    .getByRole("button", { name: "Close packet", exact: true })
    .click();
  expect((await storedPlan(page)).delegations[0].status).toBe("Offered");
  expect(
    (await storedPlan(page)).tasks.find((task) => task.id === "brief")!
      .completed,
  ).toBe(false);

  const recipientContext = await browser.newContext({
    baseURL,
    timezoneId: "Pacific/Honolulu",
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const recipient = await recipientContext.newPage();
  await watchPage(recipient);
  try {
    await openPlanner(recipient);
    await visit(recipient, "Shared taskers");
    await recipient
      .getByRole("tab", { name: "Recipient workspace", exact: true })
      .click();
    await recipient
      .getByLabel("Load offer file", { exact: true })
      .setInputFiles({
        name: offerDownload.suggestedFilename(),
        mimeType: "application/json",
        buffer: offerBytes,
      });
    await expect(
      recipient.getByRole("textbox", { name: "Offer JSON", exact: true }),
    ).toHaveValue(offerBytes.toString("utf8"));
    await recipient
      .getByRole("button", { name: "Open offer", exact: true })
      .click();
    await expect(
      recipient.getByRole("heading", {
        name: "Prepare the handover brief",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recipient.getByText("Confirm briefing inputs — Complete", {
        exact: true,
      }),
    ).toBeVisible();
    await recipient
      .getByRole("combobox", { name: "Your update", exact: true })
      .selectOption("Submitted");
    await expect(
      recipient.getByLabel("Reported progress (%)", { exact: true }),
    ).toHaveValue("100");
    await recipient
      .getByRole("textbox", {
        name: "Progress notes and result evidence",
        exact: true,
      })
      .fill(
        "Updated briefing ready. Change log records the revised handover steps.",
      );
    await recipient
      .getByRole("button", { name: "Prepare update packet", exact: true })
      .click();
    const updateDialog = recipient.getByRole("dialog", {
      name: "Tasker update packet",
      exact: true,
    });
    const updateDownloadEvent = recipient.waitForEvent("download");
    await updateDialog
      .getByRole("button", { name: "Download packet", exact: true })
      .click();
    const updateDownload = await updateDownloadEvent;
    const updateBytes = await readFile((await updateDownload.path())!);
    const reported = JSON.parse(updateBytes.toString("utf8"));
    expect(reported).toMatchObject({
      kind: "enlisted-planner-tasker-update",
      delegationId: offered.delegation.id,
      taskId: "brief",
      recipientName: "Taylor",
      updatedOn: "2026-10-10",
      status: "Submitted",
      progress: 100,
      notes:
        "Updated briefing ready. Change log records the revised handover steps.",
    });
    expect(reported).toEqual(
      JSON.parse(
        await updateDialog
          .getByRole("textbox", { name: "Packet JSON", exact: true })
          .inputValue(),
      ),
    );
    expect((await storedPlan(recipient)).tasks).toEqual([]);
    expect((await storedPlan(recipient)).delegations).toEqual([]);
    expect((await storedPlan(page)).delegations[0].status).toBe("Offered");

    await page.getByLabel("Load update file", { exact: true }).setInputFiles({
      name: updateDownload.suggestedFilename(),
      mimeType: "application/json",
      buffer: updateBytes,
    });
    await expect(
      page.getByRole("textbox", { name: "Update JSON", exact: true }),
    ).toHaveValue(updateBytes.toString("utf8"));
    await page
      .getByRole("button", { name: "Review update", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Review recipient update",
      exact: true,
    });
    await expect(review).toContainText("Updated briefing ready");
    expect((await storedPlan(page)).delegations[0].status).toBe("Offered");
    await review
      .getByRole("button", { name: "Approve update", exact: true })
      .click();
    await expect
      .poll(async () => (await storedPlan(page)).delegations[0].status)
      .toBe("Submitted");
    expect(
      (await storedPlan(page)).tasks.find((task) => task.id === "brief")!
        .completed,
    ).toBe(false);
    await page
      .getByRole("button", {
        name: "Confirm completion: Prepare the handover brief",
        exact: true,
      })
      .click();
    const completing = page.getByRole("dialog", {
      name: "Confirm the completed work",
      exact: true,
    });
    expect(
      (await storedPlan(page)).tasks.find((task) => task.id === "brief")!
        .completed,
    ).toBe(false);
    await completing
      .getByRole("button", { name: "Close reviewed tasker", exact: true })
      .click();
    await expect
      .poll(async () => (await storedPlan(page)).delegations[0].status)
      .toBe("Closed");
    expect(
      (await storedPlan(page)).tasks.find((task) => task.id === "brief"),
    ).toMatchObject({
      completed: true,
      status: "Done",
      completedOn: "2026-10-10",
    });
    expect((await storedPlan(recipient)).tasks).toEqual([]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Team taskers", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".team-offer-card")).toContainText("Closed");
    expect(errors.get(recipient)).toEqual([]);
  } finally {
    await recipientContext.close();
  }
});
