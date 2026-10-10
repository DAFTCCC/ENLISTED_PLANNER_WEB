import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
  usePlanner,
} from "./planner";
import { removePlannerRecord } from "./relationships";
import { localDate } from "./dates";
import type { PlannerState } from "./types";

const addedFields = [
  "weeklyReviews",
  "planningPreferences",
  "careerRequirements",
  "delegations",
  "reminderPreferences",
] as const;
const wrapper = ({ children }: { children: ReactNode }) => (
  <PlannerProvider>{children}</PlannerProvider>
);
beforeEach(() => localStorage.clear());
afterEach(cleanup);
function populated(): PlannerState {
  const state = defaultState();
  state.profile.name = "Preserved member";
  state.tasks = [
    {
      id: "task",
      title: "Prepare records",
      date: "2026-10-12",
      completed: false,
      priority: "High",
      status: "Open",
      estimatedMinutes: 45,
    },
  ];
  state.captures = [
    {
      id: "capture",
      title: "Original evidence",
      date: "2026-10-09",
      category: "Mission",
      context: "",
      actions: "Built a checklist",
      outcome: "Saved 20 minutes",
      lessons: "",
      tags: ["original"],
      taskId: "task",
      evidence: "Reviewed count",
    },
  ];
  return state;
}
function previousSchema() {
  const value = populated() as unknown as Record<string, unknown>;
  value.version = 2;
  for (const field of addedFields) delete value[field];
  return value;
}
function newRecords(): PlannerState {
  const state = populated();
  state.profile.afsc = "3F5X1";
  state.weeklyReviews = [
    {
      id: "review",
      weekStart: "2026-10-05",
      reviewedOn: "2026-10-10",
      wins: "Checklist completed",
      lessons: "Reserve time earlier",
      nextFocus: "Prepare records",
      carriedTaskIds: ["task"],
      metrics: {
        plannedMinutes: 120,
        completedBlockMinutes: 60,
        completedTaskCount: 1,
        captureCount: 1,
      },
    },
  ];
  state.careerRequirements = [
    {
      id: "requirement",
      title: "Review PME record",
      area: "PME",
      status: "Planned",
      dueDate: "2026-10-15",
      completedDate: "",
      expiresDate: "",
      evidence: "",
      notes: "Confirm with unit",
      sourceUrl: "https://www.afpc.af.mil/",
      lastVerified: "2026-10-10",
      service: "Air Force",
      component: "Active Duty",
      rank: "SSgt",
      afsc: "3F5X1",
    },
  ];
  state.delegations = [
    {
      id: "delegation",
      taskId: "task",
      recipientName: "Teammate",
      recipientEmail: "",
      status: "Offered",
      sentOn: "2026-10-10",
      updatedOn: "2026-10-10",
      progress: 0,
      blocker: "",
      notes: "Review together",
    },
  ];
  return state;
}
describe("version 3 durable planning", () => {
  it("migrates version 2 without altering its saved records or preferences from the prior schema", () => {
    const legacy = previousSchema();
    const migrated = parsePlannerData(JSON.stringify(legacy));
    expect(migrated.version).toBe(3);
    for (const [key, value] of Object.entries(legacy))
      if (key !== "version")
        expect(migrated[key as keyof PlannerState]).toEqual(value);
    for (const field of addedFields)
      expect(migrated[field]).toEqual(defaultState()[field]);
  });
  it("keeps saved v2 bytes until editing, then persists the full v3 plan", () => {
    const raw = JSON.stringify(previousSchema());
    localStorage.setItem(STORAGE_KEY, raw);
    const { result } = renderHook(usePlanner, { wrapper });
    expect(result.current.state.version).toBe(3);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    act(() => {
      result.current.mutate((draft) => {
        draft.profile.afsc = "3F5X1";
      });
    });
    const saved = parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.profile.afsc).toBe("3F5X1");
    expect(saved.tasks).toEqual(populated().tasks);
  });
  it("round trips review history, scoped career requirements, delegation, and preferences", () => {
    const state = newRecords();
    state.reminderPreferences.enabled = true;
    expect(parsePlannerData(JSON.stringify(state))).toEqual(state);
  });
  it.each([
    [
      "duplicate working days",
      (s: PlannerState) => {
        s.planningPreferences.workingDays = [1, 1];
      },
    ],
    [
      "unsupported weekday",
      (s: PlannerState) => {
        s.planningPreferences.workingDays = [7];
      },
    ],
    [
      "backward work hours",
      (s: PlannerState) => {
        s.planningPreferences.dayEnd = "07:00";
      },
    ],
    [
      "incomplete break",
      (s: PlannerState) => {
        s.planningPreferences.breakEnd = "";
      },
    ],
    [
      "backward break",
      (s: PlannerState) => {
        s.planningPreferences.breakEnd = "11:00";
      },
    ],
    [
      "zero maximum block",
      (s: PlannerState) => {
        s.planningPreferences.maxBlockMinutes = 0;
      },
    ],
    [
      "fractional block limit",
      (s: PlannerState) => {
        s.planningPreferences.maxBlockMinutes = 22.5;
      },
    ],
    [
      "unbounded event reserve",
      (s: PlannerState) => {
        s.planningPreferences.eventBufferMinutes = 181;
      },
    ],
    [
      "negative reminder lead",
      (s: PlannerState) => {
        s.reminderPreferences.leadMinutes = -1;
      },
    ],
    [
      "unknown qualification state",
      (s: PlannerState) => {
        (s.careerRequirements[0] as unknown as Record<string, unknown>).status =
          "Eligible";
      },
    ],
    [
      "impossible expiry",
      (s: PlannerState) => {
        s.careerRequirements[0].expiresDate = "2026-02-30";
      },
    ],
    [
      "unsupported service scope",
      (s: PlannerState) => {
        (
          s.careerRequirements[0] as unknown as Record<string, unknown>
        ).service = "Navy";
      },
    ],
    [
      "missing review task",
      (s: PlannerState) => {
        s.weeklyReviews[0].carriedTaskIds = ["missing"];
      },
    ],
    [
      "missing delegated task",
      (s: PlannerState) => {
        s.delegations[0].taskId = "missing";
      },
    ],
    [
      "invalid progress",
      (s: PlannerState) => {
        s.delegations[0].progress = 101;
      },
    ],
    [
      "unconfirmed completion date",
      (s: PlannerState) => {
        s.tasks[0].completedOn = "2026-13-01";
      },
    ],
  ])("rejects %s before replacement", (_name, change) => {
    const state = newRecords();
    change(state);
    expect(() => parsePlannerData(JSON.stringify(state))).toThrow(
      /Invalid planner backup/,
    );
  });
  it("permits paused availability and the midnight day boundary", () => {
    const state = defaultState();
    state.planningPreferences.workingDays = [];
    state.planningPreferences.dayEnd = "24:00";
    state.planningPreferences.breakStart = "";
    state.planningPreferences.breakEnd = "";
    expect(parsePlannerData(JSON.stringify(state))).toEqual(state);
  });
  it("rejects duplicate weekly records rather than replacing one silently", () => {
    const state = newRecords();
    state.weeklyReviews.push({ ...state.weeklyReviews[0], id: "other" });
    expect(() => parsePlannerData(JSON.stringify(state))).toThrow(
      /duplicates another weekly review/,
    );
  });
  it("stamps new completion, preserves unknown historical dates, and clears dates on reopening", () => {
    const state = populated();
    state.tasks.push({
      id: "historic",
      title: "Earlier work",
      date: "2020-01-01",
      completed: true,
      status: "Done",
      priority: "Normal",
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const { result } = renderHook(usePlanner, { wrapper });
    act(() => {
      result.current.mutate((draft) => {
        draft.tasks[0].completed = true;
      });
    });
    expect(result.current.state.tasks[0].completedOn).toBe(localDate());
    expect(result.current.state.tasks[1].completedOn).toBeUndefined();
    act(() => {
      result.current.mutate((draft) => {
        draft.tasks[0].completed = false;
      });
    });
    expect(result.current.state.tasks[0].completedOn).toBeUndefined();
  });
  it("retains reflections and delegation history when their source task is removed", () => {
    const state = newRecords();
    removePlannerRecord(state, "tasks", "task");
    expect(state.weeklyReviews[0]).toMatchObject({
      wins: "Checklist completed",
      carriedTaskIds: [],
    });
    expect(state.delegations[0]).toMatchObject({
      taskId: "",
      notes: "Review together",
    });
    expect(parsePlannerData(JSON.stringify(state))).toEqual(state);
  });
  it("exports the just-imported state and applies a following mutation in the same event", () => {
    const { result } = renderHook(usePlanner, { wrapper });
    const state = newRecords();
    let exported = "";
    act(() => {
      result.current.importData(JSON.stringify(state));
      exported = result.current.exportData();
      result.current.mutate((draft) => {
        draft.weeklyReviews[0].nextFocus = "Updated focus";
      });
    });
    expect(JSON.parse(exported).delegations).toEqual(state.delegations);
    expect(result.current.state.weeklyReviews[0].nextFocus).toBe(
      "Updated focus",
    );
  });
});
