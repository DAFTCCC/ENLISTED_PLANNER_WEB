import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "./planner";
import {
  BACKUP_BYTE_LIMIT,
  BACKUP_LIMIT,
  backupStorageMessage,
  chooseBackupRetention,
  getAutomaticBackupStatus,
  saveAutomaticBackup,
  type AutomaticBackup,
} from "./automatic-backups";

afterEach(() => vi.unstubAllGlobals());
function copy(index: number, bytes = 1000): AutomaticBackup {
  return {
    id: `copy-${index}`,
    createdAt: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    raw: "{}",
    reason: "Automatic",
    bytes,
  };
}

describe("automatic recovery retention", () => {
  it("retains the newest 12 copies and identifies exactly which old copies can be pruned", () => {
    const previous = Array.from({ length: 15 }, (_, index) => copy(index));
    const next = copy(15);
    const result = chooseBackupRetention(previous, next);
    expect(result.keep).toHaveLength(BACKUP_LIMIT);
    expect(result.keep[0]).toBe(next);
    expect(result.remove).toEqual(["copy-0", "copy-1", "copy-2", "copy-3"]);
    expect(previous).toHaveLength(15);
  });

  it("enforces the byte budget before the count limit", () => {
    const previous = [
      copy(0, 10 * 1024 * 1024),
      copy(1, 10 * 1024 * 1024),
      copy(2, 10 * 1024 * 1024),
    ];
    const result = chooseBackupRetention(previous, copy(3, 10 * 1024 * 1024));
    expect(
      result.keep.reduce((sum, item) => sum + item.bytes, 0),
    ).toBeLessThanOrEqual(BACKUP_BYTE_LIMIT);
    expect(result.keep.map((item) => item.id)).toEqual([
      "copy-3",
      "copy-2",
      "copy-1",
    ]);
    expect(result.remove).toEqual(["copy-0"]);
  });

  it("includes smaller older copies when a larger one no longer fits", () => {
    const result = chooseBackupRetention(
      [copy(0, 500), copy(1, BACKUP_BYTE_LIMIT)],
      copy(2, 1000),
    );
    expect(result.keep.map((item) => item.id)).toEqual(["copy-2", "copy-0"]);
    expect(result.remove).toEqual(["copy-1"]);
  });

  it("retains actual write order when a device clock moves backward", () => {
    const recent = { ...copy(15), sequence: 1 };
    const newest = { ...copy(0), sequence: 2 };
    const result = chooseBackupRetention([recent], newest);
    expect(result.keep.map((item) => item.id)).toEqual(["copy-0", "copy-15"]);
  });

  it("retains the latest writes when every snapshot has the same frozen timestamp", () => {
    const previous = Array.from({ length: 15 }, (_, index) => ({
      ...copy(index),
      createdAt: "2026-10-10T12:00:00.000Z",
      sequence: index + 1,
    }));
    const next = {
      ...copy(15),
      createdAt: previous[0].createdAt,
      sequence: 16,
    };
    const result = chooseBackupRetention(previous, next);
    expect(result.keep[0]).toBe(next);
    expect(result.keep.map((item) => item.sequence)).toEqual([
      16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5,
    ]);
    expect(result.remove).toEqual(["copy-0", "copy-1", "copy-2", "copy-3"]);
  });

  it("reports quota and restricted storage as actionable messages", () => {
    expect(
      backupStorageMessage(new DOMException("full", "QuotaExceededError")),
    ).toMatch(/full.*Download.*Settings/);
    expect(
      backupStorageMessage(new DOMException("denied", "SecurityError")),
    ).toMatch(/blocking.*Export/);
  });

  it("rejects unvalidated data before even opening recovery storage", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    const raw = JSON.stringify({
      ...defaultState(),
      accessToken: "must-never-be-copied",
    });
    await expect(saveAutomaticBackup(raw)).rejects.toThrow(/accessToken/);
    expect(open).not.toHaveBeenCalled();
  });

  it("exposes unavailable storage while preserving the supplied planner bytes", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const raw = JSON.stringify(defaultState());
    await expect(saveAutomaticBackup(raw)).rejects.toThrow(/IndexedDB/);
    expect(getAutomaticBackupStatus()).toMatchObject({ phase: "unavailable" });
    expect(raw).toBe(JSON.stringify(defaultState()));
  });
});
