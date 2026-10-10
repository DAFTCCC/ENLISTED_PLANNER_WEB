import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { PlannerState, Profile } from "../src/lib/types";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  // Honolulu: Saturday, October 10, 2026 at 10:00. Next Monday is October 12.
  await page.clock.install({ time: new Date("2026-10-10T20:00:00Z") });
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
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
  changes: Omit<Partial<PlannerState>, "profile"> & {
    profile?: Partial<Profile>;
  },
) {
  await openPlanner(page);
  await page.evaluate((update) => {
    const current = JSON.parse(localStorage.getItem("enlisted-planner:v1")!);
    localStorage.setItem(
      "enlisted-planner:v1",
      JSON.stringify({
        ...current,
        ...update,
        profile: { ...current.profile, ...update.profile },
      }),
    );
  }, changes);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
}
async function visit(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).first().click();
}

test("weekly review preserves suspenses and schedules selected work around fixed blocks in prerequisite order", async ({
  page,
}) => {
  const tasks: PlannerState["tasks"] = [
    {
      id: "prepare",
      title: "Prepare briefing material",
      date: "2026-10-12",
      suspenseTime: "12:00",
      completed: false,
      priority: "High",
      status: "Open",
      estimatedMinutes: 60,
    },
    {
      id: "deliver",
      title: "Deliver the briefing",
      date: "2026-10-12",
      suspenseTime: "12:00",
      completed: false,
      priority: "High",
      status: "Open",
      estimatedMinutes: 60,
      dependencyIds: ["prepare"],
    },
    {
      id: "overdue",
      title: "Confirm the missed suspense",
      date: "2026-10-09",
      completed: false,
      priority: "Normal",
      status: "Open",
      estimatedMinutes: 30,
    },
    {
      id: "finished",
      title: "Completed records review",
      date: "2026-10-08",
      completed: true,
      completedOn: "2026-10-08",
      priority: "Normal",
      status: "Done",
    },
    {
      id: "legacy",
      title: "Legacy completion without a date",
      date: "2026-10-01",
      completed: true,
      priority: "Normal",
      status: "Done",
    },
  ];
  const fixed: PlannerState["blocks"][number] = {
    id: "fixed",
    date: "2026-10-12",
    start: "08:00",
    end: "09:00",
    title: "Fixed team commitment",
    category: "Duty",
    notes: "Keep this appointment.",
    completed: false,
  };
  const previous: PlannerState["blocks"][number] = {
    id: "completed-block",
    date: "2026-10-08",
    start: "08:00",
    end: "08:45",
    title: "Records review block",
    category: "Development",
    notes: "",
    completed: true,
  };
  await seedPlanner(page, {
    tasks,
    blocks: [fixed, previous],
    captures: [
      {
        id: "win",
        title: "Records corrected",
        date: "2026-10-08",
        category: "Development",
        context: "Record review",
        actions: "Corrected discrepancies",
        outcome: "Training records match completion evidence",
        lessons: "",
        tags: [],
      },
    ],
  });
  await visit(page, "Review & plan");
  await expect(
    page.getByRole("heading", { name: "Weekly review", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Week containing", { exact: true })).toHaveValue(
    "2026-10-05",
  );
  await expect(
    page.getByText(/1 completed tasker has no completion date and is excluded/),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Wins & outcomes", exact: true })
    .fill("Corrected the team's training records.");
  await page
    .getByRole("textbox", { name: "Lessons & adjustments", exact: true })
    .fill("Confirm requestor suspenses before rescheduling overdue work.");
  await page
    .getByRole("textbox", { name: "Next week's focus", exact: true })
    .fill("Prepare and deliver the briefing after the fixed commitment.");
  for (const title of [
    "Prepare briefing material",
    "Deliver the briefing",
    "Confirm the missed suspense",
  ])
    await page
      .getByRole("checkbox", { name: `Carry forward: ${title}`, exact: true })
      .check();
  await page
    .getByRole("button", { name: "Save weekly review", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Weekly review saved" }),
  ).toBeVisible();
  const reviewed = await storedPlan(page);
  expect(reviewed.weeklyReviews).toHaveLength(1);
  expect(reviewed.weeklyReviews[0]).toMatchObject({
    weekStart: "2026-10-05",
    reviewedOn: "2026-10-10",
    carriedTaskIds: ["prepare", "deliver", "overdue"],
    metrics: {
      plannedMinutes: 45,
      completedBlockMinutes: 45,
      completedTaskCount: 1,
      captureCount: 1,
    },
  });
  expect(reviewed.blocks).toEqual([fixed, previous]);
  expect(
    reviewed.tasks.map(({ id, date, suspenseTime }) => ({
      id,
      date,
      suspenseTime,
    })),
  ).toEqual(
    tasks.map(({ id, date, suspenseTime }) => ({ id, date, suspenseTime })),
  );

  const scheduler = page.getByRole("region", {
    name: "Scheduling assistant",
    exact: true,
  });
  await expect(scheduler.getByLabel("Plan from", { exact: true })).toHaveValue(
    "2026-10-12",
  );
  await scheduler
    .getByLabel("Plan through", { exact: true })
    .fill("2026-10-12");
  await scheduler
    .getByRole("button", { name: "Generate schedule proposals", exact: true })
    .click();
  await expect(
    scheduler.getByText("Oct 12, 2026 · 09:00–10:00", { exact: true }),
  ).toBeVisible();
  await expect(
    scheduler.getByText("Oct 12, 2026 · 10:00–11:00", { exact: true }),
  ).toBeVisible();
  await expect(scheduler.locator(".scheduling-unplanned")).toContainText(
    "Confirm the missed suspense",
  );
  expect((await storedPlan(page)).blocks).toEqual([fixed, previous]);
  // A dependent task cannot be accepted without the proposed prerequisite.
  await scheduler
    .getByRole("checkbox", {
      name: "Include schedule for Prepare briefing material",
      exact: true,
    })
    .uncheck();
  await scheduler
    .getByRole("button", { name: "Apply selected schedule", exact: true })
    .click();
  await expect(scheduler.getByRole("alert")).toContainText("prerequisite");
  expect((await storedPlan(page)).blocks).toEqual([fixed, previous]);
  await scheduler
    .getByRole("checkbox", {
      name: "Include schedule for Prepare briefing material",
      exact: true,
    })
    .check();
  await scheduler
    .getByRole("button", { name: "Apply selected schedule", exact: true })
    .click();
  await expect(scheduler.getByRole("status")).toContainText(
    "2 reviewed time blocks added",
  );
  const planned = await storedPlan(page);
  expect(planned.blocks.find((block) => block.id === "fixed")).toEqual(fixed);
  expect(
    planned.blocks.find((block) => block.taskId === "prepare"),
  ).toMatchObject({
    date: "2026-10-12",
    start: "09:00",
    end: "10:00",
    completed: false,
  });
  expect(
    planned.blocks.find((block) => block.taskId === "deliver"),
  ).toMatchObject({
    date: "2026-10-12",
    start: "10:00",
    end: "11:00",
    completed: false,
  });
  expect(planned.blocks.some((block) => block.taskId === "overdue")).toBe(
    false,
  );
  expect(
    planned.tasks.map(({ id, date, suspenseTime }) => ({
      id,
      date,
      suspenseTime,
    })),
  ).toEqual(
    tasks.map(({ id, date, suspenseTime }) => ({ id, date, suspenseTime })),
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Wins & outcomes", exact: true }),
  ).toHaveValue("Corrected the team's training records.");
  expect((await storedPlan(page)).blocks).toEqual(planned.blocks);
  await expect(
    page.getByRole("heading", { name: "Saved review history", exact: true }),
  ).toBeVisible();
});

test("career qualification retains real completion evidence, scope, expiry and checked-source dates after reload", async ({
  page,
}) => {
  await seedPlanner(page, { profile: { rank: "SSgt", afsc: "3F0X1" } });
  await visit(page, "Career progress");
  await page
    .getByRole("button", { name: "Add qualification", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add qualification",
    exact: true,
  });
  await dialog
    .getByLabel("Qualification title", { exact: true })
    .fill("Personnel systems certification");
  await dialog
    .getByRole("combobox", { name: "Qualification category", exact: true })
    .selectOption("Certification");
  await dialog
    .getByRole("combobox", { name: "Qualification status", exact: true })
    .selectOption("Complete");
  await dialog
    .getByLabel("Actual completion date", { exact: true })
    .fill("2025-10-09");
  await dialog
    .getByLabel("Qualification expiry date", { exact: true })
    .fill("2026-10-09");
  await dialog
    .getByLabel("Evidence or record reference", { exact: true })
    .fill("Certificate and completion date recorded in my training record.");
  await dialog
    .getByLabel("Qualification source URL", { exact: true })
    .fill("https://www.e-publishing.af.mil/");
  await dialog
    .getByLabel("Qualification source checked date", { exact: true })
    .fill("2026-01-01");
  await dialog
    .getByRole("button", { name: "Save qualification", exact: true })
    .click();
  let card = page.getByRole("article", {
    name: "Qualification Personnel systems certification",
    exact: true,
  });
  await expect(card).toContainText("Expiry passed");
  await expect(card).toContainText("at least 180 days ago");
  await expect(card).toContainText(
    "Certificate and completion date recorded in my training record.",
  );
  await expect(
    card.getByRole("link", { name: "Recorded source", exact: true }),
  ).toHaveAttribute("href", "https://www.e-publishing.af.mil/");
  const recorded = (await storedPlan(page)).careerRequirements;
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({
    status: "Complete",
    completedDate: "2025-10-09",
    expiresDate: "2026-10-09",
    lastVerified: "2026-01-01",
    rank: "SSgt",
    afsc: "3F0X1",
    service: "Air Force",
    component: "Active Duty",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Career readiness map", exact: true }),
  ).toBeVisible();
  card = page.getByRole("article", {
    name: "Qualification Personnel systems certification",
    exact: true,
  });
  await expect(card).toContainText("Checked by you: Jan 1, 2026");
  await expect(card).toContainText("Matches profile");
  await page
    .getByRole("combobox", { name: "Qualification view", exact: true })
    .selectOption("Needs attention");
  await expect(card).toBeVisible();
  expect((await storedPlan(page)).careerRequirements).toEqual(recorded);
});

test("calendar export downloads local times, midnight boundaries and alerts while excluding notes by default", async ({
  page,
}) => {
  await seedPlanner(page, {
    blocks: [
      {
        id: "morning",
        date: "2026-10-12",
        start: "08:45",
        end: "09:30",
        title: "Morning focus",
        category: "Duty",
        notes: "PRIVATE-BLOCK-NOTE",
        completed: false,
      },
      {
        id: "night",
        date: "2026-10-12",
        start: "23:00",
        end: "24:00",
        title: "Late planning",
        category: "Personal",
        notes: "PRIVATE-LATE-NOTE",
        completed: false,
      },
    ],
    tasks: [
      {
        id: "timed",
        title: "Timed package suspense",
        date: "2026-10-12",
        suspenseTime: "14:30",
        completed: false,
        priority: "High",
        notes: "PRIVATE-TASK-NOTE",
      },
      {
        id: "all-day",
        title: "All-day deadline",
        date: "2026-10-13",
        completed: false,
        priority: "Normal",
        notes: "PRIVATE-DEADLINE-NOTE",
      },
    ],
    events: [
      {
        id: "appointment",
        title: "Early appointment",
        date: "2026-10-13",
        time: "07:00",
        category: "Personal",
        recurrence: "None",
        source: "User entered",
      },
    ],
  });
  await visit(page, "Calendar");
  await page
    .getByText("Calendar connections & reminders", { exact: true })
    .click();
  await page
    .getByLabel("Export start date", { exact: true })
    .fill("2026-10-12");
  await page.getByLabel("Export end date", { exact: true }).fill("2026-10-13");
  await expect(
    page.getByRole("checkbox", {
      name: "Record notes (may contain personal information)",
      exact: true,
    }),
  ).not.toBeChecked();
  await page
    .getByLabel("Reminder lead time (minutes)", { exact: true })
    .fill("15");
  await page
    .getByRole("checkbox", {
      name: "Calendar alerts · 15 minutes before",
      exact: true,
    })
    .check();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export calendar (.ics)", exact: true })
    .click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe(
    "enlisted-planner-2026-10-12-to-2026-10-13.ics",
  );
  const text = (await readFile((await downloaded.path())!, "utf8")).replace(
    /\r\n[ \t]/g,
    "",
  );
  expect(text).toContain("BEGIN:VCALENDAR\r\n");
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  const events = text.split("BEGIN:VEVENT\r\n").slice(1);
  const entry = (title: string) =>
    events.find((event) => event.includes(`SUMMARY:${title}\r\n`))!;
  expect(entry("Morning focus")).toContain("DTSTART:20261012T084500\r\n");
  expect(entry("Morning focus")).toContain("DTEND:20261012T093000\r\n");
  expect(entry("Late planning")).toContain("DTSTART:20261012T230000\r\n");
  expect(entry("Late planning")).toContain("DTEND:20261013T000000\r\n");
  expect(entry("Timed package suspense")).toContain(
    "DTSTART:20261012T143000\r\n",
  );
  expect(entry("All-day deadline")).toContain(
    "DTSTART;VALUE=DATE:20261013\r\n",
  );
  expect(entry("All-day deadline")).toContain("DTEND;VALUE=DATE:20261014\r\n");
  expect(entry("Early appointment")).toContain("DTSTART:20261013T070000\r\n");
  expect(entry("Morning focus")).toContain(
    "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\n",
  );
  expect(entry("All-day deadline")).toContain("TRIGGER:PT525M\r\n");
  expect(text).not.toContain("PRIVATE-");
  expect((await storedPlan(page)).reminderPreferences.leadMinutes).toBe(15);
});

interface RecoveryCopy {
  id: string;
  createdAt: string;
  raw: string;
  reason: string;
  sequence?: number;
}
async function recoveryCopies(page: Page): Promise<RecoveryCopy[]> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (
      !databases.some(
        (database) => database.name === "enlisted-planner-recovery",
      )
    )
      return [];
    return new Promise<RecoveryCopy[]>((resolve, reject) => {
      const opening = indexedDB.open("enlisted-planner-recovery", 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const request = db
          .transaction("snapshots", "readonly")
          .objectStore("snapshots")
          .getAll();
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
        request.onsuccess = () => {
          const copies = request.result as RecoveryCopy[];
          db.close();
          resolve(
            copies.sort(
              (a, b) =>
                (b.sequence || 0) - (a.sequence || 0) ||
                b.createdAt.localeCompare(a.createdAt),
            ),
          );
        };
      };
    });
  });
}

test("automatic recovery restores a prior saved plan and retains the plan replaced", async ({
  page,
}) => {
  await seedPlanner(page, {
    profile: { name: "Original recovery profile", rank: "SSgt" },
    tasks: [
      {
        id: "keep",
        title: "Preserve this tasker",
        date: "2026-10-12",
        completed: false,
        priority: "Normal",
        status: "Open",
      },
    ],
  });
  await visit(page, "Settings & data");
  await expect
    .poll(async () =>
      (await recoveryCopies(page)).some(
        (copy) =>
          JSON.parse(copy.raw).profile.name === "Original recovery profile",
      ),
    )
    .toBe(true);
  await page
    .getByLabel("Preferred name (optional)", { exact: true })
    .fill("Updated recovery profile");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect
    .poll(async () =>
      (await recoveryCopies(page)).some(
        (copy) =>
          JSON.parse(copy.raw).profile.name === "Updated recovery profile",
      ),
    )
    .toBe(true);
  expect((await storedPlan(page)).profile.name).toBe(
    "Updated recovery profile",
  );
  const copies = await recoveryCopies(page);
  const originalIndex = copies.findIndex(
    (copy) => JSON.parse(copy.raw).profile.name === "Original recovery profile",
  );
  expect(originalIndex).toBeGreaterThanOrEqual(0);
  const recovery = page.getByRole("region", {
    name: "Automatic recovery copies",
    exact: true,
  });
  await expect(recovery.getByRole("article")).toHaveCount(copies.length);
  await recovery
    .getByRole("article")
    .nth(originalIndex)
    .getByRole("button", { name: /^Restore recovery copy / })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Restore this recovery copy?",
    exact: true,
  });
  expect((await storedPlan(page)).profile.name).toBe(
    "Updated recovery profile",
  );
  await confirmation
    .getByRole("button", { name: "Replace with recovery copy", exact: true })
    .click();
  await expect(
    page.getByLabel("Preferred name (optional)", { exact: true }),
  ).toHaveValue("Original recovery profile");
  expect((await storedPlan(page)).tasks[0].title).toBe("Preserve this tasker");
  await expect
    .poll(async () =>
      (await recoveryCopies(page)).some(
        (copy) =>
          JSON.parse(copy.raw).profile.name === "Updated recovery profile",
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByLabel("Preferred name (optional)", { exact: true }),
  ).toHaveValue("Original recovery profile");
  expect((await storedPlan(page)).profile.name).toBe(
    "Original recovery profile",
  );
});
