import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  buildWeeklyReview,
  carryForwardReasons,
  createWeeklyReview,
  followingReviewWeek,
  reviewWeek,
} from "./weekly-review";
import type { Task } from "./types";

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: id,
  date: "",
  completed: false,
  priority: "Normal",
  ...overrides,
});

describe("weekly review facts and reflection snapshots", () => {
  it("uses calendar Mondays across month/year boundaries and safely stops at year 9999", () => {
    expect(reviewWeek("2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
    expect(reviewWeek("2026-03-08")).toEqual({
      start: "2026-03-02",
      end: "2026-03-08",
    });
    expect(reviewWeek("0001-01-01")).toEqual({
      start: "0001-01-01",
      end: "0001-01-07",
    });
    const last = reviewWeek("9999-12-31");
    expect(last).toEqual({ start: "9999-12-27", end: "9999-12-31" });
    expect(followingReviewWeek(last)).toBeNull();
    expect(() => reviewWeek("2026-02-30")).toThrow();
  });

  it("counts only dated task completions, while measuring completed blocks by their recorded schedule", () => {
    const state = defaultState();
    state.tasks = [
      task("done-now", {
        completed: true,
        completedOn: "2026-10-06",
        date: "2026-11-01",
      }),
      task("done-before", {
        completed: true,
        completedOn: "2026-10-04",
        date: "2026-10-06",
      }),
      task("legacy", { completed: true, date: "2026-10-05" }),
      task("later", { completed: true, completedOn: "2026-10-12" }),
      task("not-done", { completedOn: "2026-10-06" }),
    ];
    state.blocks = [
      {
        id: "complete",
        title: "Done",
        date: "2026-10-05",
        start: "09:00",
        end: "10:00",
        category: "Duty",
        notes: "",
        completed: true,
      },
      {
        id: "unfinished",
        title: "Read",
        date: "2026-10-06",
        start: "11:00",
        end: "11:30",
        category: "Development",
        notes: "",
        completed: false,
      },
      {
        id: "outside",
        title: "Next week",
        date: "2026-10-12",
        start: "09:00",
        end: "10:00",
        category: "Duty",
        notes: "",
        completed: true,
      },
    ];
    state.captures = [
      {
        id: "capture",
        title: "Study",
        date: "2026-10-07",
        category: "Development",
        context: "",
        actions: "Read the handbook",
        outcome: "Passed exercise",
        lessons: "",
        tags: [],
      },
    ];
    const summary = buildWeeklyReview(state, "2026-10-10", "2026-10-10");
    expect(summary.metrics).toEqual({
      plannedMinutes: 90,
      completedBlockMinutes: 60,
      completedTaskCount: 1,
      captureCount: 1,
    });
    expect(summary.completedTasks.map((item) => item.id)).toEqual(["done-now"]);
    expect(summary.unknownCompletionDates).toBe(1);
    expect(
      summary.categories.find((item) => item.category === "Development"),
    ).toEqual({
      category: "Development",
      plannedMinutes: 30,
      completedMinutes: 0,
    });
  });

  it("distinguishes missing results from linked evidence and open follow-ups from resolved ones", () => {
    const state = defaultState();
    state.tasks = [
      task("captured", { completed: true, completedOn: "2026-10-05" }),
      task("uncaptured", { completed: true, completedOn: "2026-10-06" }),
    ];
    state.captures = [
      {
        id: "older-linked",
        title: "Linked result",
        date: "2026-09-01",
        category: "Mission",
        context: "",
        actions: "",
        outcome: "",
        lessons: "",
        tags: [],
        taskId: "captured",
      },
      {
        id: "gap",
        title: "Needs outcome",
        date: "2026-10-06",
        category: "Mission",
        context: "",
        actions: "Updated procedure",
        outcome: "",
        lessons: "",
        tags: [],
      },
    ];
    state.members = [
      {
        id: "member",
        name: "Taylor",
        rank: "SrA",
        focus: "Training",
        nextFeedback: "2026-10-04",
        notes: "",
      },
    ];
    state.developmentActions = [
      {
        id: "open",
        memberId: "member",
        title: "Practice briefing",
        kind: "Mentoring",
        dueDate: "2026-10-07",
        status: "Planned",
        notes: "",
      },
      {
        id: "finished",
        memberId: "member",
        title: "Completed training",
        kind: "Training",
        dueDate: "2026-10-07",
        status: "Complete",
        notes: "",
      },
    ];
    state.disciplinePlans = [
      {
        id: "support",
        memberId: "member",
        title: "Review support",
        expectation: "",
        observedGap: "",
        supportPlan: "",
        followUpDate: "2026-10-09",
        consultation: "Requested",
        status: "Monitoring",
        notes: "",
      },
      {
        id: "closed",
        memberId: "member",
        title: "Closed support",
        expectation: "",
        observedGap: "",
        supportPlan: "",
        followUpDate: "2026-10-08",
        consultation: "Completed",
        status: "Closed",
        notes: "",
      },
    ];
    const summary = buildWeeklyReview(state, "2026-10-10", "2026-10-10");
    expect(summary.uncapturedTasks.map((item) => item.id)).toEqual([
      "uncaptured",
    ]);
    expect(summary.captureGaps.map((item) => item.id)).toEqual(["gap"]);
    expect(summary.followUps.map((item) => item.id)).toEqual([
      "member:member",
      "development:open",
      "discipline:support",
    ]);
    expect(summary.followUps[1].detail).toContain("Taylor");
  });

  it("records only chosen unfinished tasks without moving deadlines or blocks, and retains snapshot totals", () => {
    const state = defaultState();
    state.tasks = [
      task("overdue", { date: "2026-10-01" }),
      task("next-week", { date: "2026-10-15" }),
      task("not-chosen"),
      task("done", { completed: true, completedOn: "2026-10-05" }),
      task("far-future", { date: "2027-01-01" }),
    ];
    const before = structuredClone(state);
    const record = createWeeklyReview(
      state,
      "2026-10-10",
      "2026-10-10",
      {
        wins: "  Tested handover  ",
        lessons: " Delegate earlier ",
        nextFocus: " Finish guide ",
        carriedTaskIds: [
          "overdue",
          "next-week",
          "overdue",
          "done",
          "missing",
          "far-future",
        ],
      },
      "review",
    );
    expect(record.carriedTaskIds).toEqual(["overdue", "next-week"]);
    expect(record.wins).toBe("Tested handover");
    expect(record.metrics.completedTaskCount).toBe(1);
    expect(state).toEqual(before);
    state.tasks[3].completed = false;
    expect(record.metrics.completedTaskCount).toBe(1);
  });

  it("keeps undated and next-week work available but explains overdue deadlines and unfinished prerequisites", () => {
    const state = defaultState();
    state.members = [
      {
        id: "member",
        name: "Taylor",
        rank: "SrA",
        focus: "",
        nextFeedback: "",
        notes: "",
      },
    ];
    state.tasks = [
      task("inputs", { date: "2026-10-12" }),
      task("review", {
        date: "2026-10-06",
        assigneeId: "member",
        dependencyIds: ["inputs"],
      }),
      task("undated"),
      task("far", { date: "2026-11-01" }),
    ];
    const summary = buildWeeklyReview(state, "2026-10-10", "2026-10-10");
    expect(summary.carryCandidates.map((item) => item.id)).toEqual([
      "review",
      "inputs",
      "undated",
    ]);
    expect(summary.overdueTasks.map((item) => item.id)).toEqual(["review"]);
    const reasons = carryForwardReasons(
      state.tasks[1],
      state,
      "2026-10-10",
    ).join(" ");
    expect(reasons).toContain("Suspense 2026-10-06 has passed");
    expect(reasons).toContain("Prerequisites: inputs");
    expect(reasons).toContain("Assigned to Taylor");
  });
});
