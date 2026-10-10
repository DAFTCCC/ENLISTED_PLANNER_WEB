import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import BackupRecovery from "./BackupRecovery";

const backups = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  status: {
    phase: "ready" as const,
    lastSavedAt: "2026-10-10T10:00:00.000Z",
    message: "Copies are available.",
  },
}));

vi.mock("../lib/automatic-backups", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/automatic-backups")>();
  return {
    ...actual,
    listAutomaticBackups: backups.list,
    readAutomaticBackup: backups.read,
    saveAutomaticBackup: backups.save,
    deleteAutomaticBackup: backups.remove,
    deleteAllAutomaticBackups: backups.clear,
    getAutomaticBackupStatus: () => backups.status,
    subscribeAutomaticBackups: () => () => {},
    listenForBackupChanges: () => () => {},
  };
});

const summary = {
  id: "old-copy",
  createdAt: "2026-10-09T10:00:00.000Z",
  reason: "Automatic",
  bytes: 1500,
  readable: true,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  const current = defaultState();
  current.profile.onboarded = true;
  current.profile.name = "Current plan";
  current.tasks = [
    {
      id: "current",
      title: "Current task",
      date: "2026-10-12",
      priority: "Normal",
      completed: false,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  const older = structuredClone(current);
  older.profile.name = "Recovered plan";
  older.tasks[0].title = "Recovered task";
  older.planningPreferences.dayStart = "09:00";
  older.reminderPreferences.leadMinutes = 60;
  backups.list.mockResolvedValue([summary]);
  backups.read.mockResolvedValue(JSON.stringify(older));
  backups.save.mockResolvedValue(summary);
  backups.remove.mockResolvedValue(undefined);
  backups.clear.mockResolvedValue(undefined);
});
afterEach(cleanup);

function renderRecovery() {
  render(
    <PlannerProvider>
      <BackupRecovery />
    </PlannerProvider>,
  );
}
function saved() {
  return parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
}

describe("recovery copy actions", () => {
  it("validates and confirms restoration, saves the current plan first, and retains full version 3 preferences", async () => {
    renderRecovery();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Restore recovery copy/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(saved().profile.name).toBe("Current plan");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Replace with recovery copy",
      }),
    );
    await waitFor(() => expect(saved().profile.name).toBe("Recovered plan"));
    expect(backups.save).toHaveBeenCalledWith(
      expect.stringContaining("Current task"),
      "Before recovery restore",
    );
    expect(saved().tasks[0].title).toBe("Recovered task");
    expect(saved().planningPreferences.dayStart).toBe("09:00");
    expect(saved().reminderPreferences.leadMinutes).toBe(60);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("preserves the current plan when the protective copy cannot be saved", async () => {
    backups.save.mockRejectedValue(
      new Error(
        "Recovery storage is full. Download your current planner first.",
      ),
    );
    renderRecovery();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Restore recovery copy/ }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Replace with recovery copy",
      }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toMatch(
        /storage is full/,
      ),
    );
    expect(saved().profile.name).toBe("Current plan");
    expect(saved().tasks[0].title).toBe("Current task");
  });

  it("does not replace a current plan if previously valid recovery bytes become unreadable", async () => {
    backups.read.mockResolvedValue("not-json");
    renderRecovery();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Restore recovery copy/ }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /valid JSON/,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved().profile.name).toBe("Current plan");
    expect(backups.save).not.toHaveBeenCalled();
  });

  it("keeps unreadable copies visible with restore disabled and requires confirmation for deletion", async () => {
    backups.list.mockResolvedValue([
      {
        ...summary,
        readable: false,
        problem: "Its format cannot be read. It has been preserved.",
      },
    ]);
    renderRecovery();
    const restore = await screen.findByRole("button", {
      name: /^Restore recovery copy/,
    });
    expect((restore as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/format cannot be read/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete recovery copy / }),
    );
    expect(backups.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete recovery copy" }),
    );
    await waitFor(() =>
      expect(backups.remove).toHaveBeenCalledWith("old-copy"),
    );
    expect(saved().tasks[0].title).toBe("Current task");
  });

  it("requires explicit confirmation to remove every archive and preserves the active plan", async () => {
    renderRecovery();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete all recovery copies" }),
    );
    expect(backups.clear).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Permanently delete all copies",
      }),
    );
    await waitFor(() => expect(backups.clear).toHaveBeenCalledTimes(1));
    expect(saved().tasks[0].title).toBe("Current task");
  });

  it("shows unavailable background storage without impersonating a failed user action", async () => {
    backups.list.mockRejectedValue(
      new DOMException("blocked", "SecurityError"),
    );
    renderRecovery();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /blocking automatic recovery/,
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(saved().tasks[0].title).toBe("Current task");
  });
});
