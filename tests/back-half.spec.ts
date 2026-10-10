import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const legacyPlan = {
  version: 1,
  profile: {
    name: "Legacy Airman",
    service: "Air Force",
    rank: "SSgt",
    component: "Active Duty",
    dateOfRank: "2024-01-01",
    dateOfEntry: "2020-01-01",
    role: "Supervisor",
    onboarded: true,
  },
  blocks: [
    {
      id: "legacy-block",
      date: "2026-10-09",
      start: "09:00",
      end: "10:00",
      title: "Preserved legacy planning",
      category: "Duty",
      notes: "Original block note",
      completed: false,
    },
  ],
  tasks: [
    {
      id: "legacy-task",
      title: "Preserved legacy priority",
      date: "2026-10-09",
      completed: false,
      priority: "High",
    },
  ],
  events: [],
  captures: [
    {
      id: "legacy-capture",
      title: "Original legacy accomplishment",
      date: "2026-10-09",
      category: "Mission",
      context: "Original context",
      actions: "Original action",
      outcome: "Original result",
      lessons: "",
      tags: ["legacy"],
    },
  ],
  goals: [
    {
      id: "legacy-goal",
      title: "Preserved legacy milestone",
      targetDate: "2030-01-01",
      category: "Education",
      progress: 20,
    },
  ],
  members: [
    {
      id: "legacy-member",
      name: "Taylor Wingman",
      rank: "SrA",
      focus: "Training",
      nextFeedback: "2030-01-01",
      notes: "Original feedback note",
    },
  ],
  budget: {
    income: 1000,
    housing: 200,
    transport: 0,
    food: 100,
    insurance: 0,
    debt: 0,
    savings: 100,
    other: 0,
  },
  fitness: {
    distance: 1.5,
    minutes: 12,
    seconds: 0,
    goalMinutes: 11,
    cardioScore: 50,
    strengthScore: 15,
    coreScore: 15,
  },
  habits: [],
};

async function visitModule(page: Page, name: string) {
  await page.getByRole("button", { name, exact: false }).first().click();
}
async function openEmptyPlanner(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore first", exact: true })
    .click();
}
async function storedPlan(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("enlisted-planner:v1")!),
  );
}
async function startCareerPlan(page: Page, title: string) {
  await visitModule(page, "Career progress");
  await page
    .getByRole("combobox", { name: "Preparation pathway", exact: true })
    .selectOption("WAPS");
  await page
    .getByRole("button", { name: "Start preparation plan", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Preparation plan title", { exact: true })
    .fill(title);
  await dialog.getByLabel("Promotion cycle", { exact: true }).fill("30E6");
  await dialog
    .getByLabel("AFSC or functional community", { exact: true })
    .fill("Test community");
  await dialog
    .getByLabel("Confirmed preparation suspense", { exact: true })
    .fill("2030-01-31");
  await dialog
    .getByLabel("Preparation step 1", { exact: true })
    .fill("Review my promotion records");
  await dialog
    .getByRole("button", { name: "Save preparation plan", exact: true })
    .click();
}

test("v1 migration preserves the existing plan and linked career data survives backup, import, and offline reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    if (!localStorage.getItem("enlisted-planner:v1"))
      localStorage.setItem("enlisted-planner:v1", JSON.stringify(value));
  }, legacyPlan);
  await page.goto("/");
  await startCareerPlan(page, "30E6 records preparation");
  await page
    .getByRole("button", {
      name: "Make tasker: Review my promotion records",
      exact: true,
    })
    .click();
  await page.getByLabel("Review my promotion records", { exact: true }).check();
  await page
    .getByRole("button", {
      name: "Add or update calendar suspense",
      exact: true,
    })
    .click();
  const migrated = await storedPlan(page);
  expect(migrated.version).toBe(3);
  expect(migrated.blocks[0]).toEqual(legacyPlan.blocks[0]);
  expect(migrated.captures[0]).toEqual(legacyPlan.captures[0]);
  expect(migrated.members[0]).toEqual(legacyPlan.members[0]);
  expect(migrated.budget).toEqual(legacyPlan.budget);
  expect(migrated.fitness).toEqual(legacyPlan.fitness);
  const careerPlan = migrated.careerPlans[0];
  const linkedTask = migrated.tasks.find(
    (task: { id: string }) => task.id === careerPlan.checklist[0].taskId,
  );
  expect(linkedTask.careerPlanId).toBe(careerPlan.id);
  expect(linkedTask.completed).toBe(true);
  expect(migrated.events[0].goalId).toBe(migrated.goals[1].id);
  await visitModule(page, "Settings & data");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: false })
    .click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.careerPlans[0].checklist[0].taskId).toBe(linkedTask.id);
  expect(
    backup.tasks.find((task: { id: string }) => task.id === linkedTask.id)
      .careerPlanId,
  ).toBe(careerPlan.id);
  for (const collection of [
    "projects",
    "objectives",
    "contacts",
    "developmentActions",
    "disciplinePlans",
    "meetings",
    "battleRhythms",
    "careerPlans",
  ])
    expect(Array.isArray(backup[collection])).toBe(true);
  backup.careerPlans[0].title = "Restored career preparation";
  await page
    .getByLabel("Choose planner backup", { exact: true })
    .setInputFiles({
      name: "planner-v2.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page
    .getByRole("button", { name: "Replace and import", exact: true })
    .click();
  await visitModule(page, "Career progress");
  await expect(
    page.getByRole("heading", {
      name: "Restored career preparation",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Restored career preparation",
      exact: true,
    }),
  ).toBeVisible();
  expect((await storedPlan(page)).careerPlans[0].checklist[0].taskId).toBe(
    linkedTask.id,
  );
  for (const [module, heading] of [
    ["Projects & taskers", "Work & mission"],
    ["Mission & priorities", "Strategic alignment"],
    ["Helping Hands", "People & support"],
  ]) {
    await visitModule(page, module);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(async () =>
      fetch("/uncached-back-half-probe", { cache: "no-store" })
        .then(() => false)
        .catch(() => true),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("strategic objectives connect accomplishment evidence and retain original capture notes", async ({
  page,
}) => {
  await openEmptyPlanner(page);
  await visitModule(page, "Mission & priorities");
  await page
    .getByRole("button", { name: "Add objective", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Objective title", { exact: true })
    .fill("Improve training handovers");
  await dialog
    .getByRole("combobox", { name: "Level", exact: true })
    .selectOption("Squadron");
  await dialog
    .getByLabel("Mission & purpose", { exact: true })
    .fill("Reduce lost training time between shifts.");
  await dialog
    .getByLabel("Success measure", { exact: true })
    .fill("Handover questions reduced by 30 percent.");
  await dialog
    .getByRole("button", { name: "Save objective", exact: true })
    .click();
  await visitModule(page, "Career records");
  await page
    .getByLabel("Quick note", { exact: true })
    .fill("Built a shared handover checklist");
  await page.getByRole("button", { name: "Capture it", exact: true }).click();
  await page
    .getByRole("button", { name: "Add the details", exact: true })
    .click();
  await page
    .getByLabel("Your actions", { exact: true })
    .fill("Created and tested a checklist across two shifts.");
  await page
    .getByLabel("Outcomes & impact", { exact: true })
    .fill("Follow-up questions reduced by 30 percent.");
  await page
    .getByLabel("Impact — how you did it", { exact: true })
    .fill("Worked with shift leads to standardize the handover.");
  await page
    .getByLabel("Evidence & source", { exact: true })
    .fill("Before/after handover count, reviewed by shift lead.");
  await page
    .getByRole("combobox", { name: "Major Graded Area", exact: true })
    .selectOption("Improving the Unit");
  await page
    .getByRole("combobox", { name: "Airman Leadership Quality", exact: true })
    .selectOption("Innovation");
  const objectives = (await storedPlan(page)).objectives;
  await page
    .getByRole("combobox", { name: "Direct strategic objective", exact: true })
    .selectOption(objectives[0].id);
  const capture = (await storedPlan(page)).captures[0];
  expect(capture.title).toBe("Built a shared handover checklist");
  expect(capture.objectiveId).toBe(objectives[0].id);
  expect(capture.alq).toBe("Innovation");
  await page.reload();
  await visitModule(page, "Mission & priorities");
  await expect(
    page.getByText("Built a shared handover checklist", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence recorded", { exact: false }),
  ).toBeVisible();
  await visitModule(page, "Career progress");
  await expect(
    page.getByText("MGA and ALQ categorized", { exact: true }),
  ).toBeVisible();
});

test("Helping Hands matches a saved local resource and connects a contact to Leadership", async ({
  page,
}) => {
  await openEmptyPlanner(page);
  await visitModule(page, "Helping Hands");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name or local office name", { exact: true })
    .fill("Local financial counselor");
  await dialog.getByLabel("Role", { exact: true }).fill("Resource agency");
  await dialog
    .getByLabel("Agency", { exact: true })
    .fill("Military & Family Readiness Center");
  await dialog
    .getByLabel("Location", { exact: true })
    .fill("Installation support office");
  await dialog
    .getByRole("button", { name: "Save contact", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "What kind of support are you looking for?",
      exact: true,
    })
    .selectOption({ label: "Emergency financial need" });
  await expect(
    page.getByText("Local financial counselor", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Add to Leadership", exact: true })
    .click();
  const value = await storedPlan(page);
  expect(value.members).toHaveLength(1);
  expect(value.members[0].contactId).toBe(value.contacts[0].id);
  await visitModule(page, "Leadership");
  await expect(
    page.getByRole("heading", {
      name: "Local financial counselor",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  expect((await storedPlan(page)).members[0].contactId).toBe(
    value.contacts[0].id,
  );
});

test("projects and assigned taskers enforce prerequisites and share completion with scheduled time", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    if (!localStorage.getItem("enlisted-planner:v1"))
      localStorage.setItem("enlisted-planner:v1", JSON.stringify(value));
  }, legacyPlan);
  await page.goto("/");
  await visitModule(page, "Mission & priorities");
  await page
    .getByRole("button", { name: "Add objective", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Objective title", { exact: true })
    .fill("Improve shift readiness");
  await dialog
    .getByRole("combobox", { name: "Level", exact: true })
    .selectOption("Squadron");
  await dialog
    .getByLabel("Success measure", { exact: true })
    .fill("All shifts use the readiness checklist.");
  await dialog
    .getByRole("button", { name: "Save objective", exact: true })
    .click();
  const objectiveId = (await storedPlan(page)).objectives[0].id;
  await visitModule(page, "Projects & taskers");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Project title", { exact: true })
    .fill("Shift readiness rollout");
  await dialog
    .getByLabel("Project objective", { exact: true })
    .fill("Deploy a reviewed checklist to all shifts.");
  await dialog
    .getByRole("combobox", { name: "Project POC", exact: true })
    .selectOption("legacy-member");
  await dialog
    .getByRole("combobox", { name: "Strategic objective", exact: true })
    .selectOption(objectiveId);
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  const projectId = (await storedPlan(page)).projects[0].id;
  await page.getByRole("button", { name: "Add tasker", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tasker title", { exact: true })
    .fill("Review readiness checklist");
  await dialog
    .getByRole("combobox", { name: "Tasker POC", exact: true })
    .selectOption("legacy-member");
  await dialog.getByLabel("Deadline date", { exact: true }).fill("2030-01-01");
  await dialog
    .getByRole("button", { name: "Save tasker", exact: true })
    .click();
  await page.getByRole("tab", { name: "Taskers", exact: true }).click();
  await page.getByRole("button", { name: "Add tasker", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tasker title", { exact: true })
    .fill("Brief the rollout");
  await dialog
    .getByRole("combobox", { name: "Tasker POC", exact: true })
    .selectOption("legacy-member");
  await dialog
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption(projectId);
  await dialog.getByLabel("Deadline date", { exact: true }).fill("2030-01-01");
  await dialog
    .getByLabel("Review readiness checklist", { exact: false })
    .check();
  await dialog
    .getByRole("button", { name: "Save tasker", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Complete tasker: Brief the rollout",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Review readiness checklist",
  );
  expect(
    (await storedPlan(page)).tasks.find(
      (task: { title: string }) => task.title === "Brief the rollout",
    ).completed,
  ).toBe(false);
  await page
    .getByRole("checkbox", {
      name: "Complete tasker: Review readiness checklist",
      exact: true,
    })
    .click();
  expect(
    (await storedPlan(page)).tasks.find(
      (task: { title: string }) => task.title === "Review readiness checklist",
    ).completed,
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Schedule tasker: Brief the rollout",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("What are you making time for?", { exact: true }),
  ).toHaveValue("Brief the rollout");
  await dialog.getByLabel("Start time", { exact: true }).fill("09:00");
  await dialog.getByLabel("End time", { exact: true }).fill("09:30");
  await dialog
    .getByRole("button", { name: "Save time block", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete Brief the rollout", exact: true })
    .click();
  const value = await storedPlan(page);
  const tasker = value.tasks.find(
    (task: { title: string }) => task.title === "Brief the rollout",
  );
  expect(tasker.completed).toBe(true);
  expect(
    value.blocks.find((block: { taskId: string }) => block.taskId === tasker.id)
      .completed,
  ).toBe(true);
  await visitModule(page, "Projects & taskers");
  await expect(
    page.getByText("2 of 2 taskers complete", { exact: true }),
  ).toBeVisible();
  await visitModule(page, "Mission & priorities");
  await expect(
    page.getByText("Shift readiness rollout", { exact: true }),
  ).toBeVisible();
  expect((await storedPlan(page)).projects[0].objectiveId).toBe(objectiveId);
});

test("meeting decisions create linked actions and quarterly rhythms generate explicit dates once", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2030-01-01T12:00:00Z") });
  await openEmptyPlanner(page);
  await visitModule(page, "Projects & taskers");
  await page.getByRole("tab", { name: "Meetings", exact: true }).click();
  await page.getByRole("button", { name: "Add meeting", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Meeting title", { exact: true })
    .fill("Readiness decision meeting");
  await dialog.getByLabel("Meeting date", { exact: true }).fill("2030-01-01");
  await dialog
    .getByLabel("Meeting agenda", { exact: true })
    .fill("Review the checklist and agree on rollout.");
  await dialog
    .getByLabel("Decisions & outcomes", { exact: true })
    .fill("Test the checklist on the next shift.");
  await dialog
    .getByRole("button", { name: "Save meeting", exact: true })
    .click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tasker title", { exact: true })
    .fill("Trial the agreed checklist");
  await dialog.getByLabel("Deadline date", { exact: true }).fill("2030-01-08");
  await dialog
    .getByRole("button", { name: "Save tasker", exact: true })
    .click();
  let value = await storedPlan(page);
  expect(value.tasks[0].meetingId).toBe(value.meetings[0].id);
  await visitModule(page, "Calendar");
  await expect(
    page.getByText("Readiness decision meeting", { exact: true }),
  ).toBeVisible();
  await visitModule(page, "Projects & taskers");
  await page.getByRole("tab", { name: "Battle rhythm", exact: true }).click();
  await page.getByRole("button", { name: "Add rhythm", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Rhythm title", { exact: true })
    .fill("Quarterly resource review");
  await dialog
    .getByRole("combobox", { name: "Frequency", exact: true })
    .selectOption("Quarterly");
  await dialog.getByLabel("Anchor date", { exact: true }).fill("2030-01-31");
  await dialog.getByLabel("Start time", { exact: true }).fill("07:00");
  await dialog.getByLabel("End time", { exact: true }).fill("07:30");
  await dialog
    .getByRole("button", { name: "Save rhythm", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Generate time blocks: Quarterly resource review",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Generate from", { exact: true }).fill("2030-01-01");
  await dialog
    .getByLabel("Generate through", { exact: true })
    .fill("2030-12-31");
  await dialog
    .getByRole("button", { name: "Generate 3 time blocks", exact: true })
    .click();
  value = await storedPlan(page);
  expect(value.blocks.map((block: { date: string }) => block.date)).toEqual([
    "2030-01-31",
    "2030-07-31",
    "2030-10-31",
  ]);
  expect(
    value.blocks.every(
      (block: { rhythmId: string }) =>
        block.rhythmId === value.battleRhythms[0].id,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Generate time blocks: Quarterly resource review",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Generate from", { exact: true }).fill("2030-01-01");
  await dialog
    .getByLabel("Generate through", { exact: true })
    .fill("2030-12-31");
  await expect(
    dialog.getByRole("button", { name: "Generate 0 time blocks", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await storedPlan(page)).blocks).toHaveLength(3);
});

test("teammate development links to taskers and improvement preparation schedules a follow-up", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    if (!localStorage.getItem("enlisted-planner:v1"))
      localStorage.setItem("enlisted-planner:v1", JSON.stringify(value));
  }, legacyPlan);
  await page.goto("/");
  await visitModule(page, "Leadership");
  await page
    .getByRole("button", { name: "Add development action", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Action title", { exact: true })
    .fill("Lead checklist training");
  await dialog
    .getByRole("combobox", { name: "Person", exact: true })
    .selectOption("legacy-member");
  await dialog
    .getByLabel("Development due date", { exact: true })
    .fill("2030-01-01");
  await dialog
    .getByRole("combobox", { name: "Tasker connection", exact: true })
    .selectOption({ label: "Create a linked tasker" });
  await dialog
    .getByRole("button", { name: "Save development action", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add development to calendar", exact: true })
    .click();
  let value = await storedPlan(page);
  expect(value.developmentActions[0].memberId).toBe("legacy-member");
  expect(
    value.tasks.find(
      (task: { id: string }) => task.id === value.developmentActions[0].taskId,
    ).assigneeId,
  ).toBe("legacy-member");
  expect(
    value.events.some(
      (event: { developmentActionId?: string }) =>
        event.developmentActionId === value.developmentActions[0].id,
    ),
  ).toBe(true);
  await visitModule(page, "Projects & taskers");
  await page.getByRole("tab", { name: "Taskers", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Complete tasker: Lead checklist training",
      exact: true,
    })
    .click();
  value = await storedPlan(page);
  expect(value.developmentActions[0].status).toBe("Complete");
  await visitModule(page, "Leadership");
  await page
    .getByRole("combobox", { name: "Development view", exact: true })
    .selectOption("All development");
  await expect(
    page.getByRole("article", {
      name: "Development action Lead checklist training",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add preparation plan", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Preparation title", { exact: true })
    .fill("Checklist standard follow-up");
  await dialog
    .getByRole("combobox", { name: "Person", exact: true })
    .selectOption("legacy-member");
  await dialog
    .getByLabel("Preparation follow-up date", { exact: true })
    .fill("2030-01-15");
  await dialog
    .getByLabel("Standard or expectation", { exact: true })
    .fill("Use the agreed checklist for each handover.");
  await dialog
    .getByLabel("General observed gap", { exact: true })
    .fill("Discuss the missed handover step using general factual notes.");
  await dialog
    .getByLabel("Support & improvement plan", { exact: true })
    .fill("Review the process, provide training, and check understanding.");
  await dialog
    .getByRole("combobox", { name: "Consultation status", exact: true })
    .selectOption("Requested");
  await dialog
    .getByRole("button", { name: "Save preparation plan", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Add preparation follow-up to calendar",
      exact: true,
    })
    .click();
  value = await storedPlan(page);
  expect(value.disciplinePlans[0].consultation).toBe("Requested");
  expect(
    value.events.some(
      (event: { disciplinePlanId?: string; date: string }) =>
        event.disciplinePlanId === value.disciplinePlans[0].id &&
        event.date === "2030-01-15",
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("article", {
      name: "Preparation plan Checklist standard follow-up",
      exact: true,
    }),
  ).toBeVisible();
});
