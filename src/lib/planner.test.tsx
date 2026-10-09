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

function wrapper({ children }: { children: ReactNode }) {
  return <PlannerProvider>{children}</PlannerProvider>;
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
        value.version = 2;
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
