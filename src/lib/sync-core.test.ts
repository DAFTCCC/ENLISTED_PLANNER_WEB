import { describe, expect, it, vi } from "vitest";
import { defaultState } from "./planner";
import type { PlannerState } from "./types";
import {
  mergePlannerStates,
  synchronizePlan,
  type PlannerSyncTransport,
} from "./sync-core";

function fixture(): PlannerState {
  const state = defaultState();
  state.profile.onboarded = true;
  state.profile.name = "Taylor";
  state.tasks = [
    {
      id: "task",
      date: "2026-10-12",
      title: "Prepare briefing",
      priority: "High",
      completed: false,
      notes: "Original notes",
    },
  ];
  return state;
}

describe("three-way planner merge", () => {
  it("combines independent fields, independent records, and all version 3 preferences without modifying input", () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks[0].title = "Prepare readiness briefing";
    local.planningPreferences.dayStart = "09:00";
    local.careerRequirements = [
      {
        id: "pme",
        title: "Complete PME",
        area: "PME",
        status: "Planned",
        dueDate: "2026-12-01",
        completedDate: "",
        expiresDate: "",
        evidence: "",
        notes: "",
        sourceUrl: "",
        lastVerified: "",
        service: "Any",
        component: "Any",
        rank: "",
        afsc: "",
      },
    ];
    remote.tasks[0].notes = "Include readiness trends";
    remote.reminderPreferences.enabled = true;
    remote.tasks.push({
      id: "remote-task",
      date: "2026-10-13",
      title: "Review meeting actions",
      priority: "Normal",
      completed: false,
    });
    const result = mergePlannerStates(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.state?.tasks[0]).toMatchObject({
      title: "Prepare readiness briefing",
      notes: "Include readiness trends",
    });
    expect(result.state?.tasks.map((task) => task.id)).toEqual([
      "task",
      "remote-task",
    ]);
    expect(result.state?.careerRequirements).toEqual(local.careerRequirements);
    expect(result.state?.planningPreferences.dayStart).toBe("09:00");
    expect(result.state?.reminderPreferences.enabled).toBe(true);
    expect(base.tasks[0].title).toBe("Prepare briefing");
    expect(local.tasks).toHaveLength(1);
  });

  it("merges a deletion with an unrelated edit while preserving remaining records", () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks = [];
    remote.profile.afsc = "3D1X1";
    const result = mergePlannerStates(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.state?.tasks).toEqual([]);
    expect(result.state?.profile.afsc).toBe("3D1X1");
  });

  it("returns both values and an escaped field path instead of silently selecting a divergent edit", () => {
    const base = fixture();
    base.tasks[0].id = "task/one~two";
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks[0].date = "2026-10-14";
    remote.tasks[0].date = "2026-10-15";
    const result = mergePlannerStates(base, local, remote);
    expect(result.state).toBeNull();
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: "/tasks/task~1one~0two/date",
        kind: "changed-on-both-devices",
        base: "2026-10-12",
        local: "2026-10-14",
        remote: "2026-10-15",
      }),
    ]);
  });

  it("requires review when one device deletes a record that another edits", () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks = [];
    remote.tasks[0].notes = "Ready to review";
    const result = mergePlannerStates(base, local, remote);
    expect(result.state).toBeNull();
    expect(result.conflicts[0]).toMatchObject({
      path: "/tasks/task",
      kind: "deleted-and-edited",
      local: undefined,
      remote: remote.tasks[0],
    });
  });

  it("stops if independent edits would create a dangling relationship", () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks = [];
    remote.blocks = [
      {
        id: "block",
        date: "2026-10-12",
        start: "09:00",
        end: "09:30",
        title: "Prepare briefing",
        category: "Duty",
        notes: "",
        completed: false,
        taskId: "task",
      },
    ];
    const result = mergePlannerStates(base, local, remote);
    expect(result.state).toBeNull();
    expect(result.conflicts[0].kind).toBe("invalid-merged-plan");
    expect(result.conflicts[0].message).toMatch(/taskId/);
  });

  it("treats an ordered primitive preference as one decision rather than inventing a new combination", () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.planningPreferences.workingDays = [1, 2, 3, 4];
    remote.planningPreferences.workingDays = [2, 3, 4, 5];
    expect(mergePlannerStates(base, local, remote)).toMatchObject({
      state: null,
      conflicts: [
        expect.objectContaining({ path: "/planningPreferences/workingDays" }),
      ],
    });
  });

  it("accepts matching edits made on both devices", () => {
    const base = fixture();
    const local = structuredClone(base);
    local.tasks[0].title = "Deliver briefing";
    expect(
      mergePlannerStates(base, local, structuredClone(local)).state,
    ).toEqual(local);
  });
});

describe("compare-and-swap sync boundary", () => {
  it("sends independent merged edits against the revision actually read from the server", async () => {
    const base = fixture();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.tasks[0].title = "Updated title";
    remote.profile.afsc = "1C0X2";
    const transport: PlannerSyncTransport = {
      read: vi.fn(async () => ({ revision: "revision-2", state: remote })),
      compareAndSwap: vi.fn(async (_revision, state) => ({
        status: "saved" as const,
        snapshot: { revision: "revision-3", state },
      })),
    };
    const result = await synchronizePlan(transport, {
      baseRevision: "revision-1",
      baseState: base,
      localState: local,
    });
    expect(result.status).toBe("saved");
    expect(transport.compareAndSwap).toHaveBeenCalledWith(
      "revision-2",
      expect.objectContaining({
        profile: expect.objectContaining({ afsc: "1C0X2" }),
        tasks: [expect.objectContaining({ title: "Updated title" })],
      }),
    );
  });

  it("does not write when two first-connection plans differ", async () => {
    const local = fixture();
    const remote = structuredClone(local);
    remote.tasks[0].title = "A different plan";
    const transport: PlannerSyncTransport = {
      read: async () => ({ revision: "revision-1", state: remote }),
      compareAndSwap: vi.fn(),
    };
    const result = await synchronizePlan(transport, {
      baseRevision: null,
      baseState: null,
      localState: local,
    });
    expect(result.status).toBe("conflict");
    expect(transport.compareAndSwap).not.toHaveBeenCalled();
  });

  it("creates a first cloud plan only with an empty expected revision", async () => {
    const local = fixture();
    const transport: PlannerSyncTransport = {
      read: async () => ({ revision: null, state: null }),
      compareAndSwap: vi.fn(async (_revision, state) => ({
        status: "saved" as const,
        snapshot: { revision: "revision-1", state },
      })),
    };
    expect(
      (
        await synchronizePlan(transport, {
          baseRevision: null,
          baseState: null,
          localState: local,
        })
      ).status,
    ).toBe("saved");
    expect(transport.compareAndSwap).toHaveBeenCalledWith(null, local);
  });

  it("exposes a racing server write for retry without repeatedly overwriting it", async () => {
    const base = fixture();
    const racing = structuredClone(base);
    racing.tasks[0].notes = "Added during synchronization";
    const transport: PlannerSyncTransport = {
      read: async () => ({ revision: "revision-1", state: base }),
      compareAndSwap: vi.fn(async () => ({
        status: "conflict" as const,
        snapshot: { revision: "revision-2", state: racing },
      })),
    };
    expect(
      await synchronizePlan(transport, {
        baseRevision: "revision-1",
        baseState: base,
        localState: base,
      }),
    ).toMatchObject({
      status: "retry",
      snapshot: { revision: "revision-2", state: racing },
    });
    expect(transport.compareAndSwap).toHaveBeenCalledTimes(1);
  });

  it("rejects a backend that reports success without retaining the sent plan", async () => {
    const local = fixture();
    const transport: PlannerSyncTransport = {
      read: async () => ({ revision: null, state: null }),
      compareAndSwap: async () => ({
        status: "saved" as const,
        snapshot: { revision: "revision-1", state: defaultState() },
      }),
    };
    await expect(
      synchronizePlan(transport, {
        baseRevision: null,
        baseState: null,
        localState: local,
      }),
    ).rejects.toThrow(/did not confirm/);
    expect(local.tasks).toHaveLength(1);
  });

  it("rejects partial snapshots before writing", async () => {
    const transport: PlannerSyncTransport = {
      read: async () => ({ revision: "revision-1", state: null }),
      compareAndSwap: vi.fn(),
    };
    await expect(
      synchronizePlan(transport, {
        baseRevision: null,
        baseState: null,
        localState: fixture(),
      }),
    ).rejects.toThrow(/incomplete/);
    expect(transport.compareAndSwap).not.toHaveBeenCalled();
  });
});
