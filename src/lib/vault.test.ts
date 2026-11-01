import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IncorrectPasscodeError,
  PLANNER_STORAGE_KEY,
  VAULT_KEY,
  changePasscode,
  disableVault,
  enableVault,
  flushVaultWrites,
  isSealed,
  isVaultConfigured,
  isVaultUnlocked,
  onVaultProblem,
  openFromStorage,
  passcodeProblem,
  readPlannerRaw,
  resetVaultSessionForTests,
  sealForStorage,
  unlockVault,
  writePlannerRaw,
} from "./vault";

const fast = { iterations: 1000 };
const plan = JSON.stringify({ version: 3, note: "SSgt Doe feedback notes" });

describe("passcode lock", () => {
  beforeEach(() => {
    localStorage.clear();
    resetVaultSessionForTests();
  });
  afterEach(() => resetVaultSessionForTests());

  it("passes straight through to plaintext storage while the lock is off", () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    expect(readPlannerRaw()).toBe(plan);
    writePlannerRaw("{}");
    expect(localStorage.getItem(PLANNER_STORAGE_KEY)).toBe("{}");
    expect(isVaultConfigured()).toBe(false);
  });

  it("encrypts the saved plan and removes the plaintext copy", async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    await enableVault("correct horse", fast);
    expect(localStorage.getItem(PLANNER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VAULT_KEY)).not.toContain("Doe");
    expect(readPlannerRaw()).toBe(plan);
  });

  it("requires the right passcode and keeps edits across sessions", async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    await enableVault("correct horse", fast);
    writePlannerRaw(plan.replace("notes", "notes v2"));
    await flushVaultWrites();
    resetVaultSessionForTests();
    expect(isVaultUnlocked()).toBe(false);
    await expect(unlockVault("wrong horse")).rejects.toBeInstanceOf(
      IncorrectPasscodeError,
    );
    await unlockVault("correct horse");
    expect(readPlannerRaw()).toContain("notes v2");
  });

  it("changes the passcode without touching the plan", async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    await enableVault("correct horse", fast);
    await changePasscode("correct horse", "battery staple", fast);
    resetVaultSessionForTests();
    await expect(unlockVault("correct horse")).rejects.toBeInstanceOf(
      IncorrectPasscodeError,
    );
    await unlockVault("battery staple");
    expect(readPlannerRaw()).toBe(plan);
  });

  it("turns off by restoring the exact plaintext plan", async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    await enableVault("correct horse", fast);
    await disableVault("correct horse");
    expect(localStorage.getItem(PLANNER_STORAGE_KEY)).toBe(plan);
    expect(localStorage.getItem(VAULT_KEY)).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("seals recovery copies with the unlocked key", async () => {
    await enableVault("correct horse", fast);
    const sealed = await sealForStorage(plan);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("Doe");
    expect(await openFromStorage(sealed)).toBe(plan);
    expect(await openFromStorage(plan)).toBe(plan);
  });

  it("refuses plaintext writes from a tab that has not unlocked", async () => {
    await enableVault("correct horse", fast);
    resetVaultSessionForTests();
    expect(() => writePlannerRaw(plan)).toThrow(/another tab/);
    expect(localStorage.getItem(PLANNER_STORAGE_KEY)).toBeNull();
  });

  it("blocks a save that would overwrite another tab's encrypted plan", async () => {
    localStorage.setItem(PLANNER_STORAGE_KEY, plan);
    await enableVault("correct horse", fast);
    const problems: boolean[] = [];
    onVaultProblem((problem) => problems.push(problem.blockWrites));
    const other = localStorage.getItem(VAULT_KEY)!.replace(
      '"updatedAt":"',
      '"updatedAt":"other-',
    );
    localStorage.setItem(VAULT_KEY, other);
    writePlannerRaw("{}");
    await flushVaultWrites();
    expect(problems).toEqual([true]);
    expect(localStorage.getItem(VAULT_KEY)).toBe(other);
  });

  it("validates new passcodes", () => {
    expect(passcodeProblem("short", "short")).toMatch(/at least 8/);
    expect(passcodeProblem("long enough", "different")).toMatch(/match/);
    expect(passcodeProblem("long enough", "long enough")).toBe("");
  });
});
