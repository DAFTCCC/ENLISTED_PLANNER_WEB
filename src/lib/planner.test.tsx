import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
  usePlanner,
} from "./planner";
import type { PlannerState } from "./types";
import { removePlannerRecord } from "./relationships";

function wrapper({ children }: { children: ReactNode }) {
  return <PlannerProvider>{children}</PlannerProvider>;
}

const v2Collections = [
  "projects",
  "objectives",
  "contacts",
  "developmentActions",
  "disciplinePlans",
  "meetings",
  "battleRhythms",
  "careerPlans",
] as const;

function legacyState() {
  const legacy = populatedState() as unknown as Record<string, unknown>;
  legacy.version = 1;
  for (const key of [
    ...v2Collections,
    "weeklyReviews",
    "planningPreferences",
    "careerRequirements",
    "delegations",
    "reminderPreferences",
  ])
    delete legacy[key];
  return legacy;
}

function linkedState(): PlannerState {
  const state = populatedState();
  state.contacts = [
    {
      id: "contact-1",
      name: "Resource partner",
      role: "Advisor",
      agency: "Support agency",
      phone: "555-0100",
      email: "advisor@example.test",
      location: "Building 1",
      notes: "Office hours",
    },
  ];
  state.members[0] = {
    ...state.members[0],
    team: "Section A",
    contactId: "contact-1",
    role: "Wingman",
  };
  state.objectives = [
    {
      id: "objective-1",
      title: "Improve readiness",
      level: "Wing",
      parentId: "",
      mission: "Prepare the team",
      measure: "Qualifications complete",
      targetDate: "2027-01-01",
      notes: "User interpretation",
    },
    {
      id: "objective-2",
      title: "Finish section training",
      level: "Section",
      parentId: "objective-1",
      mission: "Train together",
      measure: "Course completions",
      targetDate: "2026-12-01",
      notes: "Local objective",
    },
  ];
  state.projects = [
    {
      id: "project-1",
      title: "Training sprint",
      objective: "Close qualification gaps",
      startDate: "2026-10-01",
      dueDate: "2026-12-01",
      status: "Active",
      ownerId: "member-1",
      objectiveId: "objective-2",
      resources: "Two instructors",
      risks: "Schedule changes",
      successMeasure: "Complete courses",
      baseline: "20%",
      target: "100%",
      actual: "40%",
      notes: "Coordinate coverage",
      swot: {
        strengths: "Experienced instructors",
        weaknesses: "Limited time",
        opportunities: "Shared sessions",
        threats: "Mission surge",
      },
    },
  ];
  state.meetings = [
    {
      id: "meeting-1",
      title: "Training coordination",
      date: "2026-10-12",
      time: "14:00",
      objective: "Assign actions",
      participants: ["External advisor", "Casey"],
      agenda: "Review needs",
      decisions: "Book training",
      nextDate: "2026-10-19",
      notes: "Keep minutes",
    },
  ];
  state.tasks[0] = {
    ...state.tasks[0],
    projectId: "project-1",
    assigneeId: "member-1",
    objectiveId: "objective-2",
    meetingId: "meeting-1",
    careerPlanId: "career-1",
    requestor: "Section lead",
    suspenseTime: "16:00",
    status: "Open",
    dependencyIds: ["prerequisite"],
    notes: "Bring course notes",
    estimatedMinutes: 60,
    kind: "Task",
  };
  state.tasks.push({
    id: "prerequisite",
    title: "Reserve room",
    date: "",
    completed: false,
    priority: "Normal",
    status: "Open",
    dependencyIds: [],
    kind: "Milestone",
  });
  state.battleRhythms = [
    {
      id: "rhythm-1",
      title: "Review training",
      mga: "Leading People",
      frequency: "Quarterly",
      startDate: "2026-10-08",
      startTime: "09:00",
      endTime: "10:00",
      category: "Development",
      notes: "Bring training roster",
    },
  ];
  state.blocks[0] = {
    ...state.blocks[0],
    taskId: "task-1",
    rhythmId: "rhythm-1",
    completed: false,
  };
  state.developmentActions = [
    {
      id: "development-1",
      memberId: "member-1",
      title: "Complete course",
      kind: "Training",
      dueDate: "2026-11-01",
      status: "Planned",
      notes: "Arrange coverage",
      taskId: "task-1",
    },
  ];
  state.disciplinePlans = [
    {
      id: "discipline-1",
      memberId: "member-1",
      title: "Clarify expectations",
      expectation: "Timely communication",
      observedGap: "Missed check-in",
      supportPlan: "Provide clear schedule",
      followUpDate: "2026-10-20",
      consultation: "Requested",
      status: "Monitoring",
      notes: "Preparation only",
    },
  ];
  state.events[0] = {
    ...state.events[0],
    recurrence: "Quarterly",
    developmentActionId: "development-1",
  };
  state.captures[0] = {
    ...state.captures[0],
    impact: "Reduced wait time",
    evidence: "Training log",
    mga: "Leading People",
    alq: "Inclusion and teamwork",
    projectId: "project-1",
    taskId: "task-1",
    objectiveId: "objective-2",
    memberIds: ["member-1"],
  };
  state.goals[0] = {
    ...state.goals[0],
    objectiveId: "objective-2",
    source: "Estimate",
    sourceRef: "career-plan:career-1",
  };
  state.careerPlans = [
    {
      id: "career-1",
      title: "Prepare review package",
      pathway: "WAPS",
      dueDate: "2027-01-01",
      afsc: "User entered",
      cycle: "User cycle",
      status: "Preparing",
      checklist: [
        {
          id: "check-1",
          label: "Verify current guidance",
          completed: false,
          taskId: "task-1",
        },
      ],
      notes: "Ask personnel office",
      sourceUrl: "https://www.afpc.af.mil/",
      lastVerified: "2026-10-09",
    },
  ];
  return state;
}

const storageMethods = {
  getItem: localStorage.getItem,
  setItem: localStorage.setItem,
};
function restoreStorageMethods() {
  // happy-dom's Storage proxy hides method descriptors, so spy restoration needs
  // the original bound methods to be explicitly restored between tests.
  for (const [name, method] of Object.entries(storageMethods)) {
    Object.defineProperty(localStorage, name, {
      value: method,
      configurable: true,
      writable: true,
    });
  }
}

function populatedState() {
  const state = defaultState();
  state.profile = {
    name: "Alex",
    service: "Air Force",
    rank: "A1C",
    component: "Active Duty",
    dateOfRank: "2025-02-01",
    dateOfEntry: "2024-02-01",
    role: "Supervisor",
    onboarded: true,
  };
  state.blocks = [
    {
      id: "block-1",
      date: "2026-10-08",
      start: "22:00",
      end: "24:00",
      title: "Study",
      category: "Development",
      notes: "Chapter 2",
      completed: true,
    },
  ];
  state.tasks = [
    {
      id: "task-1",
      title: "Prepare feedback",
      date: "2026-10-09",
      completed: false,
      priority: "High",
    },
  ];
  state.events = [
    {
      id: "event-1",
      title: "Training",
      date: "2026-10-31",
      time: "08:15",
      category: "Training",
      recurrence: "Monthly",
      source: "User entered",
    },
  ];
  state.captures = [
    {
      id: "capture-1",
      title: "Improved process",
      date: "2026-10-08",
      category: "Mission",
      context: "Long backlog",
      actions: "Simplified checks",
      outcome: "Saved 4 hours",
      lessons: "Document the process",
      tags: ["team", "process"],
    },
  ];
  state.goals = [
    {
      id: "goal-1",
      title: "Complete course",
      targetDate: "2026-12-01",
      category: "Education",
      progress: 40,
    },
  ];
  state.members = [
    {
      id: "member-1",
      name: "Casey",
      rank: "SrA",
      focus: "Qualifications",
      nextFeedback: "2026-11-01",
      notes: "Discuss training goals",
    },
  ];
  state.budget = {
    income: 3000,
    housing: 800,
    transport: 150,
    food: 250,
    insurance: 100,
    debt: 200,
    savings: 500,
    other: 100,
  };
  state.fitness = {
    distance: 1.5,
    minutes: 12,
    seconds: 30,
    goalMinutes: 11.5,
    cardioScore: 50,
    strengthScore: 18,
    coreScore: 19,
  };
  state.habits[0].completedDates = ["2026-10-08"];
  return state;
}

beforeEach(() => {
  restoreStorageMethods();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreStorageMethods();
});

describe("backup validation", () => {
  it("round-trips every planner collection and tool without losing data", () => {
    const original = populatedState();
    expect(parsePlannerData(JSON.stringify(original))).toEqual(original);
  });

  it("starts with no fabricated user profile or plan entries", () => {
    const state = defaultState();
    expect(state.profile.name).toBe("");
    expect(state.profile.rank).toBe("");
    expect(state.profile.onboarded).toBe(false);
    for (const key of [
      "blocks",
      "tasks",
      "events",
      "captures",
      "goals",
      "members",
    ] as const)
      expect(state[key]).toEqual([]);
    expect(
      state.habits.every((habit) => habit.completedDates.length === 0),
    ).toBe(true);
  });

  it("returns fresh default objects for independent plans", () => {
    const first = defaultState();
    first.habits[0].completedDates.push("2026-10-08");
    expect(defaultState().habits[0].completedDates).toEqual([]);
  });

  it.each([
    [
      "unsupported version",
      (value: Record<string, unknown>) => {
        value.version = 99;
      },
    ],
    [
      "missing collection",
      (value: Record<string, unknown>) => {
        delete value.members;
      },
    ],
    [
      "unknown data",
      (value: Record<string, unknown>) => {
        value.unknown = "do not silently discard";
      },
    ],
    [
      "malformed collection",
      (value: Record<string, unknown>) => {
        value.tasks = {};
      },
    ],
    [
      "invalid enum",
      (value: Record<string, unknown>) => {
        (value.profile as Record<string, unknown>).service = "Navy";
      },
    ],
    [
      "string boolean",
      (value: Record<string, unknown>) => {
        (value.profile as Record<string, unknown>).onboarded = "true";
      },
    ],
    [
      "nonexistent date",
      (value: Record<string, unknown>) => {
        (value.profile as Record<string, unknown>).dateOfRank = "2026-02-30";
      },
    ],
    [
      "unsupported zero year",
      (value: Record<string, unknown>) => {
        (value.profile as Record<string, unknown>).dateOfRank = "0000-02-01";
      },
    ],
    [
      "negative budget",
      (value: Record<string, unknown>) => {
        (value.budget as Record<string, unknown>).income = -1;
      },
    ],
    [
      "wrong numeric type",
      (value: Record<string, unknown>) => {
        (value.budget as Record<string, unknown>).income = "3000";
      },
    ],
    [
      "score over component maximum",
      (value: Record<string, unknown>) => {
        (value.fitness as Record<string, unknown>).coreScore = 21;
      },
    ],
    [
      "seconds over minute boundary",
      (value: Record<string, unknown>) => {
        (value.fitness as Record<string, unknown>).seconds = 60;
      },
    ],
    [
      "bad habit date",
      (value: Record<string, unknown>) => {
        (value.habits as Array<Record<string, unknown>>)[0].completedDates = [
          "not-a-date",
        ];
      },
    ],
    [
      "duplicate completion date",
      (value: Record<string, unknown>) => {
        (value.habits as Array<Record<string, unknown>>)[0].completedDates = [
          "2026-10-08",
          "2026-10-08",
        ];
      },
    ],
  ])("rejects %s", (_description, change) => {
    const value = defaultState() as unknown as Record<string, unknown>;
    change(value);
    expect(() => parsePlannerData(JSON.stringify(value))).toThrow(
      /Invalid planner backup/,
    );
  });

  it("rejects malformed JSON and oversized files with readable errors", () => {
    expect(() => parsePlannerData("{broken")).toThrow(/not valid JSON/);
    expect(() => parsePlannerData(" ".repeat(10 * 1024 * 1024 + 1))).toThrow(
      /too large/,
    );
  });

  it("measures the backup limit in UTF-8 bytes, matching uploaded file size", () => {
    expect(() => parsePlannerData("é".repeat(5 * 1024 * 1024 + 1))).toThrow(
      /too large/,
    );
  });

  it("rejects duplicate entry identities", () => {
    const value = populatedState();
    value.tasks.push({ ...value.tasks[0] });
    expect(() => parsePlannerData(JSON.stringify(value))).toThrow(
      /duplicates another entry/,
    );
  });

  it("accepts all-day events and optional unscheduled dates", () => {
    const value = populatedState();
    value.events[0].time = "";
    value.tasks[0].date = "";
    value.goals[0].targetDate = "";
    value.members[0].nextFeedback = "";
    expect(parsePlannerData(JSON.stringify(value))).toEqual(value);
  });

  it("allows midnight as a block endpoint but rejects it as an event timestamp", () => {
    const value = populatedState();
    expect(parsePlannerData(JSON.stringify(value)).blocks[0].end).toBe("24:00");
    value.events[0].time = "24:00";
    expect(() => parsePlannerData(JSON.stringify(value))).toThrow(/valid time/);
  });

  it("rejects an invalid or reversed time block without accepting rollover", () => {
    const value = populatedState();
    value.blocks[0].end = "24:01";
    expect(() => parsePlannerData(JSON.stringify(value))).toThrow(/valid time/);
    value.blocks[0].end = "21:59";
    expect(() => parsePlannerData(JSON.stringify(value))).toThrow(/end after/);
  });
});

describe("local planner persistence", () => {
  it("clones state before mutation and persists the new plan", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const previous = result.current.state;
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Alex";
      }),
    );
    expect(previous.profile.name).toBe("");
    expect(result.current.state.profile.name).toBe("Alex");
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).profile.name,
    ).toBe("Alex");
  });

  it("loads valid saved data without rewriting it on mount", () => {
    const saved = JSON.stringify(populatedState(), null, 2);
    localStorage.setItem(STORAGE_KEY, saved);
    const writes = vi.spyOn(window.localStorage, "setItem");
    const { result } = renderHook(() => usePlanner(), { wrapper });
    expect(result.current.state).toEqual(populatedState());
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  });

  it("preserves corrupted saved data through startup and edits until an explicit reset", () => {
    localStorage.setItem(STORAGE_KEY, "{valuable but malformed");
    const writes = vi.spyOn(window.localStorage, "setItem");
    const { result } = renderHook(() => usePlanner(), { wrapper });
    expect(result.current.storageError).toMatch(/preserved/);
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Temporary";
      }),
    );
    expect(result.current.state.profile.name).toBe("Temporary");
    expect(JSON.parse(result.current.exportData()).profile.name).toBe(
      "Temporary",
    );
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("{valuable but malformed");
    act(() => result.current.reset());
    expect(result.current.storageError).toBeNull();
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      defaultState(),
    );
  });

  it("preserves a backup with a valid JSON envelope but invalid nested data", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...defaultState(), budget: { income: 4000 } }),
    );
    const writes = vi.spyOn(window.localStorage, "setItem");
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Temporary";
      }),
    );
    expect(result.current.storageError).toMatch(/preserved/);
    expect(writes).not.toHaveBeenCalled();
  });

  it("rejects an invalid import without replacing the plan or saved data", () => {
    const saved = populatedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const original = result.current.state;
    expect(() => result.current.importData('{"version":1}')).toThrow(/missing/);
    expect(result.current.state).toBe(original);
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(saved);
  });

  it("imports and exports every field, and a valid import unlocks saving after corruption", () => {
    localStorage.setItem(STORAGE_KEY, "broken");
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const backup = populatedState();
    act(() => result.current.importData(JSON.stringify(backup)));
    expect(result.current.storageError).toBeNull();
    expect(JSON.parse(result.current.exportData())).toEqual(backup);
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      backup,
    );
  });

  it("reports quota failures, keeps edits exportable, and retries on the next change", () => {
    const writes = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Alex";
      }),
    );
    expect(result.current.storageError).toMatch(/could not be saved/);
    expect(JSON.parse(result.current.exportData()).profile.name).toBe("Alex");
    writes.mockRestore();
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.rank = "A1C";
      }),
    );
    expect(result.current.storageError).toBeNull();
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      profile: { name: "Alex", rank: "A1C" },
    });
  });

  it("continues in memory when storage cannot be read", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    const { result } = renderHook(() => usePlanner(), { wrapper });
    expect(result.current.storageError).toMatch(/unavailable/);
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "In memory";
      }),
    );
    expect(result.current.state.profile.name).toBe("In memory");
  });
});

function externalStorageChange(
  raw: string | null,
  key: string | null = STORAGE_KEY,
) {
  if (raw === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, raw);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue: raw,
      storageArea: localStorage,
    }),
  );
}

describe("changes from other tabs", () => {
  it("synchronizes an idle tab with validated data without writing it again", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const external = populatedState();
    const raw = JSON.stringify(external, null, 2);
    localStorage.setItem(STORAGE_KEY, raw);
    const writes = vi.spyOn(window.localStorage, "setItem");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: raw,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.state).toEqual(external);
    expect(result.current.storageError).toBeNull();
    expect(writes).not.toHaveBeenCalled();
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "After sync";
      }),
    );
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      profile: { name: "After sync" },
      tasks: external.tasks,
    });
  });

  it("prevents a stale tab from silently deleting a plan saved by another tab", () => {
    const first = renderHook(() => usePlanner(), { wrapper });
    const second = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      first.result.current.mutate((draft) => {
        draft.tasks.push({
          id: "new-task",
          title: "Keep this task",
          date: "2026-10-08",
          completed: false,
          priority: "Normal",
        });
      }),
    );
    const savedByFirst = localStorage.getItem(STORAGE_KEY);
    act(() =>
      second.result.current.mutate((draft) => {
        draft.profile.name = "Second tab edit";
      }),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(savedByFirst);
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).tasks[0].title,
    ).toBe("Keep this task");
    expect(second.result.current.state.profile.name).toBe("Second tab edit");
    expect(JSON.parse(second.result.current.exportData()).profile.name).toBe(
      "Second tab edit",
    );
    expect(second.result.current.storageError).toMatch(
      /changed in another tab/,
    );
    act(() =>
      second.result.current.mutate((draft) => {
        draft.profile.rank = "A1C";
      }),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(savedByFirst);
  });

  it("preserves corrupt external data and keeps the current plan exportable", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(populatedState()));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => externalStorageChange("{broken external data"));
    expect(result.current.storageError).toMatch(/could not be read.*preserved/);
    expect(result.current.state.profile.name).toBe("Alex");
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Unsaved edit";
      }),
    );
    expect(JSON.parse(result.current.exportData()).profile.name).toBe(
      "Unsaved edit",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe("{broken external data");
    act(() => result.current.importData(JSON.stringify(populatedState())));
    expect(result.current.storageError).toBeNull();
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      populatedState(),
    );
  });

  it("keeps in-memory edits when an external event follows a failed save", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const writes = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Unsaved local edit";
      }),
    );
    expect(result.current.storageError).toMatch(/could not be saved/);
    writes.mockRestore();
    const external = populatedState();
    act(() => externalStorageChange(JSON.stringify(external)));
    expect(result.current.state.profile.name).toBe("Unsaved local edit");
    expect(result.current.storageError).toMatch(/changed in another tab/);
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      external,
    );
  });

  it("adopts the latest stored baseline for an intentional reset after a conflict", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const external = populatedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(external));
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Local edit";
      }),
    );
    expect(result.current.storageError).toMatch(/changed in another tab/);
    act(() => result.current.reset());
    expect(result.current.storageError).toBeNull();
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      defaultState(),
    );
  });

  it("reflects an external removal in an idle tab and ignores unrelated storage keys", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(populatedState()));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-application",
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.state.profile.name).toBe("Alex");
    act(() => externalStorageChange(null, null));
    expect(result.current.state).toEqual(defaultState());
    expect(result.current.storageError).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("exports a large accepted plan in a size that can be imported again", () => {
    const backup = defaultState();
    backup.tasks = Array.from({ length: 80_000 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      date: "",
      completed: false,
      priority: "Normal" as const,
    }));
    const compact = JSON.stringify(backup);
    expect(new TextEncoder().encode(compact).byteLength).toBeLessThan(
      10 * 1024 * 1024,
    );
    expect(
      new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength,
    ).toBeGreaterThan(10 * 1024 * 1024);
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => result.current.importData(compact));
    expect(parsePlannerData(result.current.exportData())).toEqual(backup);
  });
});

describe("version 1 migration and linked version 2 backups", () => {
  it("migrates every legacy collection and field while adding empty linked collections", () => {
    const legacy = legacyState();
    const migrated = parsePlannerData(JSON.stringify(legacy));
    expect(migrated.version).toBe(3);
    for (const [key, value] of Object.entries(legacy))
      if (key !== "version")
        expect((migrated as unknown as Record<string, unknown>)[key]).toEqual(
          value,
        );
    for (const key of v2Collections) expect(migrated[key]).toEqual([]);
  });

  it("loads legacy storage without rewriting its original bytes, then saves version 3 on edit", () => {
    const raw = JSON.stringify(legacyState(), null, 2);
    localStorage.setItem(STORAGE_KEY, raw);
    const writes = vi.spyOn(localStorage, "setItem");
    const { result } = renderHook(() => usePlanner(), { wrapper });
    expect(result.current.state.version).toBe(3);
    expect(result.current.state.captures).toEqual(populatedState().captures);
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Updated name";
      }),
    );
    const saved = parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.version).toBe(3);
    expect(saved.captures).toEqual(populatedState().captures);
    expect(saved.profile.name).toBe("Updated name");
  });

  it("imports a legacy backup into a linked plan without dropping any legacy content", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedState()));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const legacy = legacyState();
    act(() => result.current.importData(JSON.stringify(legacy)));
    expect(parsePlannerData(result.current.exportData())).toEqual(
      parsePlannerData(JSON.stringify(legacy)),
    );
    expect(result.current.state.captures).toEqual(populatedState().captures);
    expect(result.current.state.projects).toEqual([]);
  });

  it("round-trips every new record, link, structured field and historical capture field exactly", () => {
    const original = linkedState();
    expect(parsePlannerData(JSON.stringify(original))).toEqual(original);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    expect(parsePlannerData(result.current.exportData())).toEqual(original);
  });

  it.each(v2Collections)(
    "requires the new %s collection in version 2",
    (collection) => {
      const state = linkedState() as unknown as Record<string, unknown>;
      delete state[collection];
      expect(() => parsePlannerData(JSON.stringify(state))).toThrow(
        /is missing/,
      );
    },
  );

  it.each([
    [
      "unknown project field",
      (state: PlannerState) => {
        (state.projects[0] as unknown as Record<string, unknown>).unknown =
          "retain or reject";
      },
    ],
    [
      "incomplete SWOT",
      (state: PlannerState) => {
        delete (state.projects[0].swot as unknown as Record<string, unknown>)
          .threats;
      },
    ],
    [
      "unknown task extension",
      (state: PlannerState) => {
        (state.tasks[0] as unknown as Record<string, unknown>).taskerId = "bad";
      },
    ],
    [
      "invalid task status",
      (state: PlannerState) => {
        state.tasks[0].status = "Closed" as never;
      },
    ],
    [
      "inconsistent task completion",
      (state: PlannerState) => {
        state.tasks[0].status = "Done";
      },
    ],
    [
      "invalid suspense time",
      (state: PlannerState) => {
        state.tasks[0].suspenseTime = "24:00";
      },
    ],
    [
      "negative estimated effort",
      (state: PlannerState) => {
        state.tasks[0].estimatedMinutes = -1;
      },
    ],
    [
      "invalid capture MGA",
      (state: PlannerState) => {
        state.captures[0].mga = "Mission" as never;
      },
    ],
    [
      "invalid capture ALQ",
      (state: PlannerState) => {
        state.captures[0].alq = "Leadership" as never;
      },
    ],
    [
      "duplicate capture member IDs",
      (state: PlannerState) => {
        state.captures[0].memberIds = ["member-1", "member-1"];
      },
    ],
    [
      "invalid career pathway",
      (state: PlannerState) => {
        state.careerPlans[0].pathway = "Guaranteed promotion" as never;
      },
    ],
    [
      "duplicate checklist identities",
      (state: PlannerState) => {
        state.careerPlans[0].checklist.push({
          ...state.careerPlans[0].checklist[0],
        });
      },
    ],
    [
      "invalid last verification date",
      (state: PlannerState) => {
        state.careerPlans[0].lastVerified = "2026-02-30";
      },
    ],
    [
      "invalid development status",
      (state: PlannerState) => {
        state.developmentActions[0].status = "Done" as never;
      },
    ],
    [
      "invalid discipline consultation",
      (state: PlannerState) => {
        state.disciplinePlans[0].consultation = "Approved" as never;
      },
    ],
    [
      "invalid meeting participants",
      (state: PlannerState) => {
        state.meetings[0].participants = [42 as never];
      },
    ],
    [
      "overnight battle rhythm",
      (state: PlannerState) => {
        state.battleRhythms[0].endTime = "08:00";
      },
    ],
    [
      "duplicate new record identity",
      (state: PlannerState) => {
        state.projects.push({ ...state.projects[0] });
      },
    ],
  ])(
    "rejects %s rather than discarding or changing it",
    (_description, change) => {
      const original = linkedState();
      change(original);
      expect(() => parsePlannerData(JSON.stringify(original))).toThrow(
        /Invalid planner backup/,
      );
    },
  );

  it.each([
    [
      "block task",
      (state: PlannerState) => {
        state.blocks[0].taskId = "missing";
      },
    ],
    [
      "block rhythm",
      (state: PlannerState) => {
        state.blocks[0].rhythmId = "missing";
      },
    ],
    [
      "task project",
      (state: PlannerState) => {
        state.tasks[0].projectId = "missing";
      },
    ],
    [
      "task assignee",
      (state: PlannerState) => {
        state.tasks[0].assigneeId = "missing";
      },
    ],
    [
      "task objective",
      (state: PlannerState) => {
        state.tasks[0].objectiveId = "missing";
      },
    ],
    [
      "task meeting",
      (state: PlannerState) => {
        state.tasks[0].meetingId = "missing";
      },
    ],
    [
      "task career plan",
      (state: PlannerState) => {
        state.tasks[0].careerPlanId = "missing";
      },
    ],
    [
      "career checklist task",
      (state: PlannerState) => {
        state.careerPlans[0].checklist[0].taskId = "missing";
      },
    ],
    [
      "task dependency",
      (state: PlannerState) => {
        state.tasks[0].dependencyIds = ["missing"];
      },
    ],
    [
      "event member",
      (state: PlannerState) => {
        state.events[0].memberId = "missing";
      },
    ],
    [
      "event development action",
      (state: PlannerState) => {
        state.events[0].developmentActionId = "missing";
      },
    ],
    [
      "event discipline plan",
      (state: PlannerState) => {
        state.events[0].disciplinePlanId = "missing";
      },
    ],
    [
      "event meeting",
      (state: PlannerState) => {
        state.events[0].meetingId = "missing";
      },
    ],
    [
      "event goal",
      (state: PlannerState) => {
        state.events[0].goalId = "missing";
      },
    ],
    [
      "capture project",
      (state: PlannerState) => {
        state.captures[0].projectId = "missing";
      },
    ],
    [
      "capture task",
      (state: PlannerState) => {
        state.captures[0].taskId = "missing";
      },
    ],
    [
      "capture objective",
      (state: PlannerState) => {
        state.captures[0].objectiveId = "missing";
      },
    ],
    [
      "capture member",
      (state: PlannerState) => {
        state.captures[0].memberIds = ["missing"];
      },
    ],
    [
      "goal objective",
      (state: PlannerState) => {
        state.goals[0].objectiveId = "missing";
      },
    ],
    [
      "member contact",
      (state: PlannerState) => {
        state.members[0].contactId = "missing";
      },
    ],
    [
      "member supervisor",
      (state: PlannerState) => {
        state.members[0].supervisorId = "missing";
      },
    ],
    [
      "project owner",
      (state: PlannerState) => {
        state.projects[0].ownerId = "missing";
      },
    ],
    [
      "project objective",
      (state: PlannerState) => {
        state.projects[0].objectiveId = "missing";
      },
    ],
    [
      "objective parent",
      (state: PlannerState) => {
        state.objectives[0].parentId = "missing";
      },
    ],
    [
      "development member",
      (state: PlannerState) => {
        state.developmentActions[0].memberId = "missing";
      },
    ],
    [
      "development task",
      (state: PlannerState) => {
        state.developmentActions[0].taskId = "missing";
      },
    ],
    [
      "discipline member",
      (state: PlannerState) => {
        state.disciplinePlans[0].memberId = "missing";
      },
    ],
  ])("rejects a missing %s reference", (_description, change) => {
    const original = linkedState();
    change(original);
    expect(() => parsePlannerData(JSON.stringify(original))).toThrow(
      /references a missing/,
    );
  });

  it("accepts intentionally blank links and free-form external meeting participant names", () => {
    const original = linkedState();
    original.projects[0].ownerId = "";
    original.developmentActions[0].memberId = "";
    original.disciplinePlans[0].memberId = "";
    original.tasks[0].projectId = "";
    original.members[0].supervisorId = "";
    original.meetings[0].participants = [
      "Someone outside the directory",
      "External organization",
    ];
    expect(parsePlannerData(JSON.stringify(original))).toEqual(original);
  });

  it.each([
    [
      "objective parent",
      (state: PlannerState) => {
        state.objectives[0].parentId = "objective-2";
      },
    ],
    [
      "task dependency",
      (state: PlannerState) => {
        state.tasks[1].dependencyIds = ["task-1"];
      },
    ],
    [
      "self dependency",
      (state: PlannerState) => {
        state.tasks[0].dependencyIds = ["task-1"];
      },
    ],
    [
      "self supervision",
      (state: PlannerState) => {
        state.members[0].supervisorId = "member-1";
      },
    ],
  ])("rejects a %s cycle", (_description, change) => {
    const original = linkedState();
    change(original);
    expect(() => parsePlannerData(JSON.stringify(original))).toThrow(
      /contains a cycle/,
    );
  });

  it("supports a long acyclic dependency chain without recursive-stack failure", () => {
    const original = defaultState();
    original.tasks = Array.from({ length: 10_000 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      date: "",
      completed: false,
      priority: "Normal",
      dependencyIds: index ? [`task-${index - 1}`] : [],
    }));
    expect(parsePlannerData(JSON.stringify(original)).tasks).toHaveLength(
      10_000,
    );
    original.tasks[0].dependencyIds = ["task-9999"];
    expect(() => parsePlannerData(JSON.stringify(original))).toThrow(
      /contains a cycle/,
    );
  });
});

describe("linked provider mutations", () => {
  it("keeps completed work while awaiting a prerequisite, then updates linked career and development progress", () => {
    const original = linkedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        draft.blocks[0].completed = true;
      }),
    );
    expect(result.current.state.blocks[0].completed).toBe(true);
    expect(result.current.state.tasks[0]).toMatchObject({
      completed: false,
      status: "Open",
    });
    expect(result.current.state.careerPlans[0].checklist[0].completed).toBe(
      false,
    );
    act(() =>
      result.current.mutate((draft) => {
        draft.tasks[1].completed = true;
      }),
    );
    expect(result.current.state.tasks[0]).toMatchObject({
      completed: true,
      status: "Done",
    });
    expect(result.current.state.careerPlans[0].checklist[0].completed).toBe(
      true,
    );
    expect(result.current.state.developmentActions[0].status).toBe("Complete");
    act(() =>
      result.current.mutate((draft) => {
        draft.careerPlans[0].checklist[0].completed = false;
      }),
    );
    expect(result.current.state.tasks[0].completed).toBe(false);
    expect(result.current.state.blocks[0].completed).toBe(false);
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).developmentActions[0]
        .status,
    ).toBe("Planned");
  });

  it("keeps evaluation checkpoint dates intact through persistence and export", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        draft.goals.push({
          id: "evaluation",
          title: "Evaluation closeout",
          targetDate: "2027-06-01",
          category: "Evaluation",
          progress: 0,
          source: "Estimate",
        });
        for (const [index, date] of [
          "2027-04-02",
          "2027-05-02",
          "2027-06-01",
        ].entries())
          draft.events.push({
            id: `checkpoint-${index}`,
            title: `Preparation checkpoint ${index}`,
            date,
            time: "",
            category: "Career",
            recurrence: "None",
            source: "Estimate",
            goalId: "evaluation",
          });
      }),
    );
    expect(
      parsePlannerData(result.current.exportData()).events.map(
        (event) => event.date,
      ),
    ).toEqual(["2027-04-02", "2027-05-02", "2027-06-01"]);
    act(() =>
      result.current.mutate((draft) => {
        draft.goals[0].targetDate = "2027-07-01";
      }),
    );
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events.map(
        (event) => event.date,
      ),
    ).toEqual(["2027-04-02", "2027-05-02", "2027-07-01"]);
  });

  it("keeps linked task and block completion consistent in saved data", () => {
    const original = linkedState();
    original.tasks[0].dependencyIds = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        draft.tasks[0].completed = true;
      }),
    );
    expect(result.current.state.tasks[0]).toMatchObject({
      completed: true,
      status: "Done",
    });
    expect(result.current.state.blocks[0].completed).toBe(true);
    act(() =>
      result.current.mutate((draft) => {
        draft.blocks[0].completed = false;
      }),
    );
    expect(result.current.state.tasks[0]).toMatchObject({
      completed: false,
      status: "Open",
    });
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).tasks[0].completed,
    ).toBe(false);
  });

  it("rejects invalid draft links and cycles without losing the saved or current plan", () => {
    const original = linkedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    const raw = localStorage.getItem(STORAGE_KEY);
    act(() =>
      result.current.mutate((draft) => {
        draft.objectives[0].parentId = "objective-2";
      }),
    );
    expect(result.current.state).toEqual(original);
    expect(result.current.storageError).toMatch(/contains a cycle/);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    act(() =>
      result.current.mutate((draft) => {
        draft.tasks[0].assigneeId = "missing";
      }),
    );
    expect(result.current.state).toEqual(original);
    expect(result.current.storageError).toMatch(/references a missing/);
    act(() =>
      result.current.mutate((draft) => {
        draft.profile.name = "Valid change";
      }),
    );
    expect(result.current.storageError).toBeNull();
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).profile.name,
    ).toBe("Valid change");
  });

  it("uses deletion cleanup to preserve work and captures while detaching removed references", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedState()));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() =>
      result.current.mutate((draft) => {
        removePlannerRecord(draft, "projects", "project-1");
      }),
    );
    expect(result.current.state.projects).toEqual([]);
    expect(result.current.state.tasks[0].projectId).toBeUndefined();
    expect(result.current.state.captures[0].projectId).toBeUndefined();
    expect(result.current.state.captures[0].title).toBe("Improved process");
    expect(result.current.state.captures[0].date).toBe("2026-10-08");
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).captures[0].evidence,
    ).toBe("Training log");
  });

  it("does not lose sequential mutations made before React renders", () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.mutate((draft) => {
        draft.profile.name = "First change";
      });
      result.current.mutate((draft) => {
        draft.profile.rank = "A1C";
      });
    });
    expect(result.current.state.profile).toMatchObject({
      name: "First change",
      rank: "A1C",
    });
  });
});
