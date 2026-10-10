import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  buildSchedule,
  currentPlanningTime,
  currentRecoveryTime,
  missedTaskAllocations,
  recoverySelectionError,
  planningPreferencesError,
  scheduleSelectionError,
  type PlanningTime,
} from "./scheduling";
import type { PlanningPreferences, Task, TimeBlock } from "./types";

const day = "2030-10-07"; // Monday.
const now: PlanningTime = { date: day, time: "08:00" };
const preferences: PlanningPreferences = {
  workingDays: [1, 2, 3, 4, 5],
  dayStart: "08:00",
  dayEnd: "17:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  maxBlockMinutes: 60,
  eventBufferMinutes: 15,
};
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  date: day,
  completed: false,
  priority: "Normal",
  estimatedMinutes: 60,
  ...extra,
});
const block = (
  id: string,
  start: string,
  end: string,
  extra: Partial<TimeBlock> = {},
): TimeBlock => ({
  id,
  date: day,
  start,
  end,
  title: id,
  category: "Duty",
  notes: "",
  completed: false,
  ...extra,
});
const plan = (tasks: Task[], blocks: TimeBlock[] = []) => ({
  ...defaultState(),
  tasks,
  blocks,
});
const total = (result: ReturnType<typeof buildSchedule>) =>
  result.suggestions.reduce((sum, { block: item }) => {
    const [startHour, startMinute] = item.start.split(":").map(Number),
      [endHour, endMinute] = item.end.split(":").map(Number);
    return sum + (endHour - startHour) * 60 + endMinute - startMinute;
  }, 0);

describe("reviewed scheduling proposals", () => {
  it("preserves fixed commitments, break time, recurring event buffers, and selected working days", () => {
    const state = plan(
      [task("focus", { estimatedMinutes: 480, date: "2030-10-08" })],
      [block("fixed", "08:00", "09:00")],
    );
    state.events = [
      {
        id: "weekly",
        title: "Appointment",
        date: "2030-09-30",
        time: "10:00",
        category: "Personal",
        recurrence: "Weekly",
        source: "User entered",
      },
    ];
    const original = JSON.stringify(state);
    const result = buildSchedule(
      state,
      ["focus"],
      day,
      "2030-10-08",
      preferences,
      now,
    );
    expect(result.availableMinutes).toBe(870);
    expect(total(result)).toBe(480);
    for (const { block: item } of result.suggestions.filter(
      (item) => item.block.date === day,
    )) {
      expect(item.start >= "09:00").toBe(true);
      expect(item.end <= "09:45" || item.start >= "10:15").toBe(true);
      expect(item.end <= "12:00" || item.start >= "13:00").toBe(true);
    }
    expect(JSON.stringify(state)).toBe(original);
    const weekend = buildSchedule(
      state,
      ["focus"],
      "2030-10-12",
      "2030-10-13",
      preferences,
      now,
    );
    expect(weekend.availableMinutes).toBe(0);
    expect(weekend.suggestions).toHaveLength(0);
  });

  it("counts completed effort, ignores missed allocations, and starts after the device-local cutoff", () => {
    const state = plan(
      [task("partial", { estimatedMinutes: 62.5 })],
      [
        block("done", "08:00", "08:30", { taskId: "partial", completed: true }),
        block("missed", "08:30", "09:00", { taskId: "partial" }),
      ],
    );
    const result = buildSchedule(state, ["partial"], day, day, preferences, {
      date: day,
      time: "10:07",
    });
    expect(total(result)).toBe(33);
    expect(result.suggestions[0].block).toMatchObject({
      start: "10:07",
      end: "10:40",
    });
    expect(result.suggestions[0].reason).toContain(
      "63 minutes of recorded effort",
    );
  });

  it("honors timed suspenses without reserving incomplete proposals that prevent smaller tasks fitting", () => {
    const state = plan([
      task("too-large", {
        estimatedMinutes: 61,
        priority: "High",
        suspenseTime: "09:00",
      }),
      task("fits", { estimatedMinutes: 30, suspenseTime: "09:00" }),
    ]);
    const result = buildSchedule(
      state,
      ["too-large", "fits"],
      day,
      day,
      preferences,
      now,
    );
    expect(result.suggestions.map((item) => item.block.taskId)).toEqual([
      "fits",
    ]);
    expect(result.suggestions[0].block).toMatchObject({
      start: "08:00",
      end: "08:30",
    });
    expect(result.unscheduled[0].reason).toContain(
      "only 60 fit before its suspense",
    );
    expect(state.tasks[0].suspenseTime).toBe("09:00");
  });

  it("plans prerequisites before earlier-suspense dependent work without changing the prerequisite's deadline", () => {
    const state = plan([
      task("parent", { date: "2030-10-10" }),
      task("urgent", {
        suspenseTime: "10:00",
        dependencyIds: ["parent"],
        priority: "High",
      }),
      task("other", { suspenseTime: "11:00", priority: "High" }),
    ]);
    const result = buildSchedule(
      state,
      ["urgent", "other", "parent"],
      day,
      day,
      preferences,
      now,
    );
    expect(result.suggestions.map((item) => item.block.taskId)).toEqual([
      "parent",
      "urgent",
      "other",
    ]);
    expect(result.suggestions[1].block).toMatchObject({
      start: "09:00",
      end: "10:00",
    });
    expect(state.tasks[0].date).toBe("2030-10-10");
  });

  it("uses a valid existing prerequisite plan but rejects an unplanned prerequisite's prerequisite", () => {
    const state = plan(
      [
        task("ancestor"),
        task("parent", { dependencyIds: ["ancestor"] }),
        task("child", { dependencyIds: ["parent"] }),
      ],
      [block("parent-slot", "09:00", "10:00", { taskId: "parent" })],
    );
    let result = buildSchedule(state, ["child"], day, day, preferences, now);
    expect(result.suggestions).toHaveLength(0);
    expect(result.unscheduled[0].reason).toContain("Prerequisite “parent”");
    state.tasks[0].completed = true;
    result = buildSchedule(state, ["child"], day, day, preferences, now);
    expect(result.suggestions[0].block).toMatchObject({
      start: "10:00",
      end: "11:00",
    });
  });

  it("does not count prerequisite allocations finishing after their timed deadline or double-count overlaps", () => {
    const state = plan(
      [
        task("parent", { suspenseTime: "09:00" }),
        task("child", { dependencyIds: ["parent"] }),
      ],
      [block("late-parent", "08:30", "09:30", { taskId: "parent" })],
    );
    expect(
      buildSchedule(state, ["child"], day, day, preferences, now).suggestions,
    ).toHaveLength(0);
    const overlapping = plan(
      [task("focus", { estimatedMinutes: 90 })],
      [
        block("a", "08:00", "09:00", { taskId: "focus" }),
        block("b", "08:30", "09:00", { taskId: "focus" }),
      ],
    );
    expect(
      total(buildSchedule(overlapping, ["focus"], day, day, preferences, now)),
    ).toBe(30);
  });

  it("deducts usable existing allocations once and explicitly labels missing effort assumptions", () => {
    const state = plan(
      [
        task("allocated", { estimatedMinutes: 90 }),
        task("unknown", { estimatedMinutes: undefined }),
      ],
      [block("existing", "15:00", "16:00", { taskId: "allocated" })],
    );
    const result = buildSchedule(
      state,
      ["allocated", "unknown"],
      day,
      day,
      preferences,
      now,
    );
    expect(total(result)).toBe(60);
    expect(
      result.suggestions.find((item) => item.block.taskId === "unknown")!
        .reason,
    ).toContain("30-minute planning allowance");
    expect(
      total(
        buildSchedule(
          {
            ...state,
            blocks: [
              ...state.blocks,
              ...result.suggestions.map((item) => item.block),
            ],
          },
          ["allocated", "unknown"],
          day,
          day,
          preferences,
          now,
        ),
      ),
    ).toBe(0);
  });

  it("explains overdue, explicitly blocked, missing, and cyclic taskers without proposing work", () => {
    const state = plan([
      task("late", { suspenseTime: "07:00" }),
      task("blocked", { status: "Blocked" }),
      task("a", { dependencyIds: ["b"] }),
      task("b", { dependencyIds: ["a"] }),
    ]);
    const result = buildSchedule(
      state,
      ["late", "blocked", "missing", "a", "b"],
      day,
      day,
      preferences,
      now,
    );
    expect(result.suggestions).toHaveLength(0);
    expect(result.unscheduled).toHaveLength(5);
    expect(
      result.unscheduled.find((item) => item.taskId === "late")!.reason,
    ).toContain("suspense has passed");
    expect(
      result.unscheduled.find((item) => item.taskId === "a")!.reason,
    ).toContain("cycle");
  });

  it("guards finite ranges and settings while allowing empty working days and a midnight end", () => {
    const state = plan([task("task")]);
    expect(() =>
      buildSchedule(state, ["task"], day, "2030-11-07", preferences, now),
    ).toThrow("31 days");
    expect(() =>
      buildSchedule(state, ["task"], day, "2030-10-06", preferences, now),
    ).toThrow("end date");
    expect(
      planningPreferencesError({
        ...preferences,
        dayStart: "23:00",
        dayEnd: "24:00",
        breakStart: "",
        breakEnd: "",
      }),
    ).toBeNull();
    expect(
      buildSchedule(
        state,
        ["task"],
        day,
        day,
        { ...preferences, workingDays: [] },
        now,
      ).availableMinutes,
    ).toBe(0);
    expect(
      planningPreferencesError({ ...preferences, breakEnd: "" }),
    ).toContain("both break times");
  });

  it("rounds local clock readings forward across midnight", () => {
    const value = new Date(2030, 9, 7, 23, 59, 30);
    expect(currentPlanningTime(value)).toEqual({
      date: "2030-10-08",
      time: "00:00",
    });
  });

  it("rejects stale source records, new conflicts, elapsed proposal times, and missing selected prerequisites", () => {
    const state = plan([
      task("parent"),
      task("child", { dependencyIds: ["parent"] }),
    ]);
    const proposals = buildSchedule(
      state,
      ["parent", "child"],
      day,
      day,
      preferences,
      now,
    ).suggestions;
    const ids = proposals.map((item) => item.block.id);
    expect(
      scheduleSelectionError(
        state,
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        ids,
        now,
      ),
    ).toBeNull();
    expect(
      scheduleSelectionError(
        state,
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        [ids[1]],
        now,
      ),
    ).toContain("Include all required prerequisite blocks");
    expect(
      scheduleSelectionError(
        { ...state, blocks: [block("new", "08:00", "09:00")] },
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        ids,
        now,
      ),
    ).toContain("changed");
    expect(
      scheduleSelectionError(
        state,
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        ids,
        { date: day, time: "08:01" },
      ),
    ).toContain("changed");
    expect(
      scheduleSelectionError(
        {
          ...state,
          tasks: [task("parent", { completed: true }), state.tasks[1]],
        },
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        ids,
        now,
      ),
    ).toContain("changed");
  });

  it("requires all split prerequisite blocks and rechecks ancestors before dependent selections", () => {
    const state = plan([
      task("parent", { estimatedMinutes: 90 }),
      task("child", { dependencyIds: ["parent"] }),
    ]);
    const proposals = buildSchedule(
      state,
      ["parent", "child"],
      day,
      day,
      preferences,
      now,
    ).suggestions;
    const selected = proposals
      .filter(
        (item) =>
          item.block.taskId !== "parent" || item.block.start === "08:00",
      )
      .map((item) => item.block.id);
    expect(
      scheduleSelectionError(
        state,
        ["parent", "child"],
        day,
        day,
        preferences,
        proposals,
        selected,
        now,
      ),
    ).toContain("Include all required prerequisite blocks");
  });

  it("reserves timed meetings without calendar links and one minute for zero-buffer point events", () => {
    const state = plan([task("focus", { estimatedMinutes: 120 })]);
    state.meetings = [
      {
        id: "meeting",
        title: "Stand-up",
        date: day,
        time: "08:30",
        objective: "",
        participants: [],
        agenda: "",
        decisions: "",
        nextDate: "",
        notes: "",
      },
    ];
    const result = buildSchedule(
      state,
      ["focus"],
      day,
      day,
      { ...preferences, eventBufferMinutes: 0 },
      now,
    );
    expect(result.suggestions[0].block).toMatchObject({
      start: "08:00",
      end: "08:30",
    });
    expect(result.suggestions[1].block.start).toBe("08:31");
  });
  it("reserves appointment buffers crossing midnight even outside the selected range", () => {
    const state = plan([task("late", { estimatedMinutes: 30 })]);
    state.events = [
      {
        id: "early-next-day",
        title: "Early appointment",
        date: "2030-10-08",
        time: "00:05",
        category: "Personal",
        recurrence: "None",
        source: "User entered",
      },
    ];
    const result = buildSchedule(
      state,
      ["late"],
      day,
      day,
      {
        ...preferences,
        dayStart: "23:00",
        dayEnd: "24:00",
        breakStart: "",
        breakEnd: "",
        eventBufferMinutes: 30,
      },
      now,
    );
    expect(result.availableMinutes).toBe(35);
    expect(result.suggestions[0].block).toMatchObject({
      start: "23:00",
      end: "23:30",
    });
  });

  it("handles a ten-thousand-task prerequisite chain without recursion", () => {
    const tasks = Array.from({ length: 10_000 }, (_, index) =>
      task(`task-${index}`, {
        estimatedMinutes: 1,
        dependencyIds: index ? [`task-${index - 1}`] : [],
      }),
    );
    const state = plan(tasks);
    const result = buildSchedule(
      state,
      tasks.map((task) => task.id),
      day,
      day,
      { ...preferences, workingDays: [] },
      now,
    );
    expect(result.suggestions).toHaveLength(0);
    expect(result.unscheduled).toHaveLength(10_000);
    expect(result.unscheduled[result.unscheduled.length - 1].reason).toContain(
      "needs an on-time plan",
    );
  });
  it("reserves the original meeting time without inventing a follow-up time", () => {
    const state = plan([
      task("focus", { estimatedMinutes: 60, date: "2030-10-14" }),
    ]);
    state.meetings = [
      {
        id: "meeting",
        title: "Planning",
        date: day,
        time: "09:00",
        objective: "",
        participants: [],
        agenda: "",
        decisions: "",
        nextDate: "2030-10-14",
        notes: "",
      },
    ];
    const hours = {
      ...preferences,
      dayStart: "08:00",
      dayEnd: "10:00",
      breakStart: "",
      breakEnd: "",
    };
    const original = buildSchedule(state, ["focus"], day, day, hours, now);
    expect(original.availableMinutes).toBe(90);
    expect(
      original.suggestions.every(
        ({ block }) => block.end <= "08:45" || block.start >= "09:15",
      ),
    ).toBe(true);
    const followUp = buildSchedule(
      state,
      ["focus"],
      "2030-10-14",
      "2030-10-14",
      hours,
      now,
    );
    expect(followUp.availableMinutes).toBe(120);
    state.events = [
      {
        id: "linked-meeting",
        title: "Confirmed follow-up",
        date: "2030-10-14",
        time: "09:00",
        category: "Administrative",
        recurrence: "None",
        source: "User entered",
        meetingId: "meeting",
      },
    ];
    expect(
      buildSchedule(state, ["focus"], "2030-10-14", "2030-10-14", hours, now)
        .availableMinutes,
    ).toBe(90);
  });

  it("reviews only ended unfinished links and rejects changed recovery history", () => {
    const state = plan(
      [task("focus")],
      [
        block("missed", "06:00", "07:00", { taskId: "focus" }),
        block("done", "06:00", "07:00", { taskId: "focus", completed: true }),
        block("future", "08:00", "09:00", { taskId: "focus" }),
        block("other", "06:00", "07:00", { taskId: "other" }),
      ],
    );
    const recoveryTime = { date: day, time: "07:59" };
    const preview = missedTaskAllocations(state, ["focus"], recoveryTime);
    expect(preview.map((block) => block.id)).toEqual(["missed"]);
    expect(
      recoverySelectionError(state, preview, ["focus"], recoveryTime),
    ).toBeNull();
    const changed = {
      ...state,
      blocks: state.blocks.map((block) =>
        block.id === "missed" ? { ...block, title: "Changed history" } : block,
      ),
    };
    expect(
      recoverySelectionError(changed, preview, ["focus"], recoveryTime),
    ).toContain("Missed allocations changed");
    expect(
      recoverySelectionError(state, preview, ["focus"], {
        date: day,
        time: "09:01",
      }),
    ).toContain("another block has ended");
    expect(
      missedTaskAllocations(state, [], { date: day, time: "09:01" }),
    ).toEqual([]);
    const value = new Date(2030, 9, 7, 7, 59, 30);
    expect(currentRecoveryTime(value)).toEqual(recoveryTime);
    expect(currentPlanningTime(value).time).toBe("08:00");
    expect(
      missedTaskAllocations(state, ["focus"], currentRecoveryTime(value)).some(
        (block) => block.id === "future",
      ),
    ).toBe(false);
  });
});
