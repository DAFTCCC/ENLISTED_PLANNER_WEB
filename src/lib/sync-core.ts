import { parsePlannerData } from "./planner";
import type { PlannerState } from "./types";

export interface SyncSnapshot {
  /** Opaque server revision, changed after every accepted write. */
  revision: string | null;
  state: PlannerState | null;
}

export interface MergeConflict {
  path: string;
  kind:
    | "changed-on-both-devices"
    | "deleted-and-edited"
    | "invalid-merged-plan"
    | "initial-plans-differ";
  message: string;
  base?: unknown;
  local?: unknown;
  remote?: unknown;
}

export type MergeResult =
  | { state: PlannerState; conflicts: [] }
  | { state: null; conflicts: MergeConflict[] };

export type CompareAndSwapResult =
  | { status: "saved"; snapshot: SyncSnapshot }
  | { status: "conflict"; snapshot: SyncSnapshot };

/** Implement with the existing authenticated backend, never browser secrets. */
export interface PlannerSyncTransport {
  read(): Promise<SyncSnapshot>;
  compareAndSwap(
    expectedRevision: string | null,
    state: PlannerState,
  ): Promise<CompareAndSwapResult>;
}

export interface SyncInput {
  baseRevision: string | null;
  baseState: PlannerState | null;
  localState: PlannerState;
}

export type SyncResult =
  | { status: "saved"; snapshot: SyncSnapshot }
  | { status: "conflict"; snapshot: SyncSnapshot; conflicts: MergeConflict[] }
  | { status: "retry"; snapshot: SyncSnapshot; proposed: PlannerState };

const missing = Symbol("missing");
type Value = unknown | typeof missing;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

function equal(a: Value, b: Value): boolean {
  if (a === missing || b === missing) return a === b;
  return canonical(a) === canonical(b);
}

function object(value: Value): value is Record<string, unknown> {
  return (
    value !== missing &&
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function childPath(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

function recordArrays(values: Value[]): boolean {
  return values.every(
    (value) =>
      Array.isArray(value) &&
      value.every((row) => object(row) && typeof row.id === "string"),
  );
}

function printable(value: Value): unknown {
  return value === missing ? undefined : structuredClone(value);
}

function mergeValue(
  base: Value,
  local: Value,
  remote: Value,
  path: string,
  conflicts: MergeConflict[],
): Value {
  if (equal(local, remote)) return local;
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;

  if (local === missing || remote === missing) {
    conflicts.push({
      path: path || "/",
      kind: "deleted-and-edited",
      message:
        "One device deleted this value while the other edited it. Choose which change to keep.",
      base: printable(base),
      local: printable(local),
      remote: printable(remote),
    });
    return missing;
  }

  if (object(local) && object(remote) && (object(base) || base === missing)) {
    const old = base === missing ? {} : base;
    const merged: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(old),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);
    for (const key of keys) {
      const value = mergeValue(
        Object.hasOwn(old, key) ? old[key] : missing,
        Object.hasOwn(local, key) ? local[key] : missing,
        Object.hasOwn(remote, key) ? remote[key] : missing,
        childPath(path, key),
        conflicts,
      );
      if (value !== missing)
        Object.defineProperty(merged, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    }
    return merged;
  }

  if (recordArrays([base, local, remote])) {
    const old = new Map((base as { id: string }[]).map((row) => [row.id, row]));
    const here = new Map(
      (local as { id: string }[]).map((row) => [row.id, row]),
    );
    const there = new Map(
      (remote as { id: string }[]).map((row) => [row.id, row]),
    );
    // Preserve the local display order and append independent remote additions.
    const ids = new Set([...here.keys(), ...there.keys(), ...old.keys()]);
    const merged: unknown[] = [];
    for (const id of ids) {
      const value = mergeValue(
        old.get(id) ?? missing,
        here.get(id) ?? missing,
        there.get(id) ?? missing,
        childPath(path, id),
        conflicts,
      );
      if (value !== missing) merged.push(value);
    }
    return merged;
  }

  conflicts.push({
    path: path || "/",
    kind: "changed-on-both-devices",
    message:
      "Both devices changed this value differently. Review both versions before saving.",
    base: printable(base),
    local: printable(local),
    remote: printable(remote),
  });
  return local;
}

/** Independent fields/records merge; divergent edits and broken links stop sync. */
export function mergePlannerStates(
  base: PlannerState,
  local: PlannerState,
  remote: PlannerState,
): MergeResult {
  const before = parsePlannerData(JSON.stringify(base));
  const here = parsePlannerData(JSON.stringify(local));
  const there = parsePlannerData(JSON.stringify(remote));
  const conflicts: MergeConflict[] = [];
  const result = mergeValue(before, here, there, "", conflicts);
  if (conflicts.length) return { state: null, conflicts };
  try {
    return { state: parsePlannerData(JSON.stringify(result)), conflicts: [] };
  } catch (error) {
    return {
      state: null,
      conflicts: [
        {
          path: "/",
          kind: "invalid-merged-plan",
          message:
            error instanceof Error
              ? error.message
              : "Combined changes break a planner connection. Review both plans.",
        },
      ],
    };
  }
}

function validSnapshot(snapshot: SyncSnapshot): SyncSnapshot {
  if (
    snapshot.revision !== null &&
    (typeof snapshot.revision !== "string" || !snapshot.revision)
  )
    throw new Error("The backend returned an invalid planner revision.");
  if ((snapshot.state === null) !== (snapshot.revision === null))
    throw new Error("The backend returned an incomplete planner snapshot.");
  return {
    revision: snapshot.revision,
    state:
      snapshot.state === null
        ? null
        : parsePlannerData(JSON.stringify(snapshot.state)),
  };
}

/** A racing server write returns retry; it is never overwritten automatically. */
export async function synchronizePlan(
  transport: PlannerSyncTransport,
  input: SyncInput,
): Promise<SyncResult> {
  const local = parsePlannerData(JSON.stringify(input.localState));
  const remote = validSnapshot(await transport.read());
  let proposed = local;
  if (remote.revision !== input.baseRevision) {
    if (!input.baseState || !remote.state) {
      if (!remote.state || !equal(local, remote.state))
        return {
          status: "conflict",
          snapshot: remote,
          conflicts: [
            {
              path: "/",
              kind: "initial-plans-differ",
              message:
                "These plans have no confirmed shared version. Review which plan to keep before connecting this device.",
              local,
              remote: remote.state,
            },
          ],
        };
    } else {
      const merged = mergePlannerStates(input.baseState, local, remote.state);
      if (!merged.state)
        return {
          status: "conflict",
          snapshot: remote,
          conflicts: merged.conflicts,
        };
      proposed = merged.state;
    }
  }
  const result = await transport.compareAndSwap(remote.revision, proposed);
  const snapshot = validSnapshot(result.snapshot);
  if (result.status === "conflict")
    return { status: "retry", snapshot, proposed };
  if (!snapshot.state || !equal(snapshot.state, proposed))
    throw new Error(
      "The backend did not confirm the planner version that was sent. Local data was preserved.",
    );
  if (snapshot.revision === remote.revision)
    throw new Error(
      "The backend did not advance the planner revision. Local data was preserved.",
    );
  return { status: "saved", snapshot };
}
