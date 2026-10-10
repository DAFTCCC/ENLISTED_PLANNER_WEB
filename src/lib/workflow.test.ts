import { describe, expect, it } from "vitest";
import {
  buildRhythmPlan,
  dependencyError,
  isTaskOverdue,
  projectProgress,
  taskBlockers,
  taskCompletionError,
  taskStatus,
  workSummary,
} from "./workflow";
import type { BattleRhythm, Task, TimeBlock } from "./types";

function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    date: "2026-10-10",
    completed: false,
    priority: "Normal",
    ...changes,
  };
}
function rhythm(changes: Partial<BattleRhythm> = {}): BattleRhythm {
  return {
    id: "rhythm",
    title: "Mission review",
    mga: "Executing the Mission",
    frequency: "Weekly",
    startDate: "2026-10-10",
    startTime: "09:00",
    endTime: "10:00",
    category: "Duty",
    notes: "Prepare decisions.",
    ...changes,
  };
}
function block(
  id: string,
  date: string,
  changes: Partial<TimeBlock> = {},
): TimeBlock {
  return {
    id,
    date,
    title: id,
    start: "09:00",
    end: "10:00",
    category: "Duty",
    notes: "",
    completed: false,
    ...changes,
  };
}

describe("work dependencies and workload", () => {
  it("validates a deep imported dependency chain without overflowing the call stack", () => {
    const tasks = Array.from({ length: 10000 }, (_, index) =>
      task(`deep-${index}`, {
        dependencyIds: index ? [`deep-${index - 1}`] : [],
      }),
    );
    expect(dependencyError(tasks[tasks.length - 1], tasks)).toBeNull();
    expect(
      dependencyError(
        { ...tasks[0], dependencyIds: [tasks[tasks.length - 1].id] },
        tasks,
      ),
    ).toMatch(/cycle/);
  });
  it("checks edited dependency graphs and rejects direct, missing, and multi-node cycles", () => {
    const tasks = [
      task("a"),
      task("b", { dependencyIds: ["a"] }),
      task("c", { dependencyIds: ["b"] }),
    ];
    expect(dependencyError(task("a", { dependencyIds: ["c"] }), tasks)).toMatch(
      /cycle/,
    );
    expect(dependencyError(task("a", { dependencyIds: ["a"] }), tasks)).toMatch(
      /itself/,
    );
    expect(
      dependencyError(task("a", { dependencyIds: ["missing"] }), tasks),
    ).toMatch(/no longer exists/);
    expect(
      dependencyError(task("c", { dependencyIds: ["a", "b"] }), tasks),
    ).toBeNull();
    expect(tasks[0].dependencyIds).toBeUndefined();
  });

  it("names unfinished prerequisites and releases the dependent when they are completed", () => {
    const first = task("Collect evidence");
    const second = task("Review evidence", { dependencyIds: [first.id] });
    expect(taskBlockers(second, [first, second])).toEqual([first]);
    expect(taskCompletionError(second, [first, second])).toContain(
      "“Collect evidence”",
    );
    first.completed = true;
    first.status = "Done";
    expect(taskCompletionError(second, [first, second])).toBeNull();
    expect(taskStatus(first)).toBe("Done");
  });

  it("distinguishes date deadlines, same-day suspense times, and unscheduled work", () => {
    expect(
      isTaskOverdue(
        task("past", { date: "2026-10-09" }),
        "2026-10-10",
        "09:00",
      ),
    ).toBe(true);
    expect(
      isTaskOverdue(
        task("equal", { suspenseTime: "09:00" }),
        "2026-10-10",
        "09:00",
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        task("expired", { suspenseTime: "09:00" }),
        "2026-10-10",
        "09:01",
      ),
    ).toBe(true);
    expect(isTaskOverdue(task("no time"), "2026-10-10", "23:59")).toBe(false);
    expect(isTaskOverdue(task("unscheduled", { date: "" }), "2026-10-10")).toBe(
      false,
    );
    expect(
      isTaskOverdue(
        task("done", { date: "2026-10-09", completed: true }),
        "2026-10-10",
      ),
    ).toBe(false);
  });

  it("rolls up actual linked actions and remaining estimates without inventing availability", () => {
    const tasks = [
      task("done", {
        projectId: "project",
        completed: true,
        estimatedMinutes: 60,
      }),
      task("open", {
        projectId: "project",
        estimatedMinutes: 90,
        date: "2026-10-09",
      }),
      task("milestone", {
        projectId: "project",
        kind: "Milestone",
        dependencyIds: ["open"],
        estimatedMinutes: 30,
      }),
      task("other", {
        projectId: "other",
        status: "Blocked",
        estimatedMinutes: 120,
      }),
    ];
    expect(projectProgress("project", tasks)).toEqual({
      total: 3,
      done: 1,
      percent: 33,
      milestones: 1,
      estimatedMinutes: 120,
    });
    expect(workSummary(tasks, "2026-10-10")).toEqual({
      open: 3,
      overdue: 1,
      blocked: 2,
      completed: 1,
      estimatedMinutes: 240,
    });
    expect(projectProgress("empty", tasks).percent).toBe(0);
  });
});

describe("battle rhythm generation", () => {
  it("anchors weekly occurrences and never schedules before the anchor", () => {
    const plan = buildRhythmPlan(rhythm(), "2026-10-01", "2026-10-24", []);
    expect(plan.blocks.map((item) => item.date)).toEqual([
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
    ]);
    expect(
      plan.blocks.every(
        (item) =>
          item.rhythmId === "rhythm" &&
          !item.completed &&
          item.notes === "Prepare decisions.",
      ),
    ).toBe(true);
  });

  it("uses true monthly and quarterly anchors, skipping nonexistent calendar days", () => {
    const monthly = buildRhythmPlan(
      rhythm({ frequency: "Monthly", startDate: "2026-01-31" }),
      "2026-01-01",
      "2026-04-30",
      [],
    );
    expect(monthly.blocks.map((item) => item.date)).toEqual([
      "2026-01-31",
      "2026-03-31",
    ]);
    const quarterly = buildRhythmPlan(
      rhythm({ frequency: "Quarterly", startDate: "2026-01-15" }),
      "2026-01-01",
      "2026-12-31",
      [],
    );
    expect(quarterly.blocks.map((item) => item.date)).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });

  it("keeps yearly month/day anchors and handles leap-day schedules honestly", () => {
    const leap = rhythm({ frequency: "Yearly", startDate: "2024-02-29" });
    expect(
      buildRhythmPlan(leap, "2025-02-01", "2025-03-01", []).blocks,
    ).toEqual([]);
    expect(
      buildRhythmPlan(leap, "2028-02-01", "2028-03-01", []).blocks.map(
        (item) => item.date,
      ),
    ).toEqual(["2028-02-29"]);
    const annual = rhythm({ frequency: "Yearly", startDate: "2025-10-10" });
    expect(
      buildRhythmPlan(annual, "2026-01-01", "2026-12-31", []).blocks.map(
        (item) => item.date,
      ),
    ).toEqual(["2026-10-10"]);
  });

  it("previews duplicate and overlapping dates while permitting adjacent work", () => {
    const existing = [
      block("duplicate", "2026-10-10", { rhythmId: "rhythm" }),
      block("conflict", "2026-10-11", { start: "09:30", end: "10:30" }),
      block("adjacent", "2026-10-12", { start: "10:00", end: "11:00" }),
      block("edited occurrence", "2026-10-13", {
        rhythmId: "rhythm",
        start: "11:00",
        end: "12:00",
      }),
    ];
    const original = structuredClone(existing);
    const plan = buildRhythmPlan(
      rhythm({ frequency: "Daily" }),
      "2026-10-10",
      "2026-10-13",
      existing,
    );
    expect(plan.blocks.map((item) => item.date)).toEqual(["2026-10-12"]);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.skipped[1].reason).toContain("conflict");
    expect(plan.skipped[2].reason).toContain("Already generated");
    expect(existing).toEqual(original);
    const repeated = buildRhythmPlan(
      rhythm({ frequency: "Daily" }),
      "2026-10-10",
      "2026-10-13",
      [...existing, ...plan.blocks],
    );
    expect(repeated.blocks).toEqual([]);
  });

  it("bounds generation and rejects invalid dates, reversed windows, and overnight times", () => {
    expect(
      buildRhythmPlan(
        rhythm({ frequency: "Daily", startDate: "2026-01-01" }),
        "2026-01-01",
        "2027-01-01",
        [],
      ).blocks,
    ).toHaveLength(366);
    expect(
      buildRhythmPlan(rhythm(), "2026-01-01", "2027-01-02", []).error,
    ).toMatch(/366 days/);
    expect(
      buildRhythmPlan(rhythm(), "2026-02-30", "2026-03-01", []).error,
    ).toMatch(/valid/);
    expect(
      buildRhythmPlan(rhythm(), "2026-10-11", "2026-10-10", []).error,
    ).toMatch(/on or after/);
    expect(
      buildRhythmPlan(
        rhythm({ startTime: "22:00", endTime: "01:00" }),
        "2026-10-10",
        "2026-10-10",
        [],
      ).error,
    ).toMatch(/overnight/);
    expect(
      buildRhythmPlan(
        rhythm({ startTime: "24:00", endTime: "24:00" }),
        "2026-10-10",
        "2026-10-10",
        [],
      ).error,
    ).toBeTruthy();
    expect(
      buildRhythmPlan(
        rhythm({ startTime: "23:00", endTime: "24:00" }),
        "2026-10-10",
        "2026-10-10",
        [],
      ).blocks[0].end,
    ).toBe("24:00");
  });
});
