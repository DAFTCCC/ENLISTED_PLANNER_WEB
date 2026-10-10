import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import { plannerInsights } from "./intelligence";
import type { Task } from "./types";

const task = (changes: Partial<Task> = {}): Task => ({
  id: "task",
  title: "Prepare package",
  date: "2026-10-15",
  completed: false,
  priority: "High",
  ...changes,
});
describe("explainable planner prompts", () => {
  it("does not invent records or recommendations on an empty plan", () => {
    expect(plannerInsights(defaultState(), "2026-10-10")).toEqual([]);
  });
  it("explains unfinished dependencies using their titles and stops when resolved", () => {
    const state = defaultState();
    state.tasks = [
      task({ dependencyIds: ["review"] }),
      task({ id: "review", title: "Review records", date: "" }),
    ];
    expect(
      plannerInsights(state, "2026-10-10").find(
        (item) => item.urgency === "Blocked",
      )?.explanation,
    ).toContain("Review records");
    state.tasks[1].completed = true;
    expect(
      plannerInsights(state, "2026-10-10").some(
        (item) => item.urgency === "Blocked",
      ),
    ).toBe(false);
  });
  it("compares effort with unfinished time allocated before the actual deadline", () => {
    const state = defaultState();
    state.tasks = [task({ estimatedMinutes: 120 })];
    state.blocks = [
      {
        id: "block",
        date: "2026-10-12",
        start: "09:00",
        end: "10:00",
        title: "Package",
        category: "Duty",
        completed: false,
        notes: "",
        taskId: "task",
      },
    ];
    expect(
      plannerInsights(state, "2026-10-10").find(
        (item) => item.id === "task-time:task",
      )?.explanation,
    ).toContain("60 minutes");
    state.blocks[0].end = "11:00";
    expect(
      plannerInsights(state, "2026-10-10").some(
        (item) => item.id === "task-time:task",
      ),
    ).toBe(false);
    state.blocks[0].date = "2026-10-16";
    expect(
      plannerInsights(state, "2026-10-10").find(
        (item) => item.id === "task-time:task",
      )?.explanation,
    ).toContain("no unfinished linked time block");
  });
  it("omits completed tasks and ranks overdue work ahead of preparation", () => {
    const state = defaultState();
    state.tasks = [
      task(),
      task({ id: "late", date: "2026-10-09" }),
      task({ id: "done", date: "2026-10-01", completed: true }),
    ];
    const prompts = plannerInsights(state, "2026-10-10");
    expect(prompts[0].id).toBe("task-due:late");
    expect(prompts.some((item) => item.id.includes("done"))).toBe(false);
  });
  it("counts only the portion of deadline-day work before a timed suspense", () => {
    const state = defaultState();
    state.tasks = [task({ estimatedMinutes: 60, suspenseTime: "10:00" })];
    state.blocks = [
      {
        id: "block",
        date: "2026-10-15",
        start: "15:00",
        end: "16:00",
        title: "Package",
        category: "Duty",
        completed: false,
        notes: "",
        taskId: "task",
      },
    ];
    const prompt = () =>
      plannerInsights(state, "2026-10-10").find(
        (item) => item.id === "task-time:task",
      );
    expect(prompt()?.explanation).toContain("no unfinished linked time block");
    expect(prompt()?.explanation).toContain("2026-10-15 at 10:00");

    state.blocks[0].start = "09:30";
    state.blocks[0].end = "10:30";
    expect(prompt()?.explanation).toContain("30 minutes");

    state.blocks[0].start = "09:00";
    expect(prompt()).toBeUndefined();
  });
  it("counts earlier-day work and a full deadline day when no time is specified", () => {
    const state = defaultState();
    state.tasks = [task({ estimatedMinutes: 60, suspenseTime: "00:00" })];
    state.blocks = [
      {
        id: "block",
        date: "2026-10-14",
        start: "23:00",
        end: "24:00",
        title: "Package",
        category: "Duty",
        completed: false,
        notes: "",
        taskId: "task",
      },
    ];
    const needsTime = () =>
      plannerInsights(state, "2026-10-10").some(
        (item) => item.id === "task-time:task",
      );
    expect(needsTime()).toBe(false);
    state.blocks[0].date = "2026-10-15";
    expect(needsTime()).toBe(true);
    state.tasks[0].suspenseTime = "";
    expect(needsTime()).toBe(false);
  });
  it("does not turn consultation records into a promotion eligibility decision", () => {
    const state = defaultState();
    state.disciplinePlans = [
      {
        id: "support",
        memberId: "",
        title: "Expectations review",
        expectation: "",
        observedGap: "",
        supportPlan: "",
        followUpDate: "2026-10-10",
        consultation: "Requested",
        status: "Monitoring",
        notes: "",
      },
    ];
    const prompts = plannerInsights(state, "2026-10-10");
    expect(prompts).toHaveLength(1);
    expect(prompts[0].page).toBe("leadership");
    expect(prompts[0].explanation).toContain("Requested");
  });
  it("supports the maximum date without overflowing the horizon", () => {
    const state = defaultState();
    state.tasks = [task({ date: "9999-12-31" })];
    expect(plannerInsights(state, "9999-12-31").length).toBeGreaterThan(0);
  });
});
