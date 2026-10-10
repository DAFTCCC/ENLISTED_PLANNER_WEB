import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "./planner";
import {
  dueReminders,
  notificationPermission,
  readReminderLedger,
  REMINDER_LEDGER_KEY,
  reminderDate,
  sendBrowserReminder,
  writeReminderLedger,
} from "./reminders";

const now = new Date(2026, 9, 10, 8, 45, 0);
const seed = () => {
  const state = defaultState();
  state.reminderPreferences = {
    enabled: true,
    leadMinutes: 15,
    includeTasks: true,
    includeEvents: true,
    includeFollowUps: true,
  };
  state.tasks.push({
    id: "task",
    title: "Sensitive title",
    date: "2026-10-10",
    priority: "Normal",
    completed: false,
  });
  return state;
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("foreground reminder facts", () => {
  it("uses device-local 09:00 for all-day deadlines and only delivers near the chosen lead time", () => {
    const state = seed();
    const due = dueReminders(state, now);
    expect(due).toHaveLength(1);
    expect(due[0].dueAt).toBe(new Date(2026, 9, 10, 9, 0).getTime());
    expect(due[0].notifyAt).toBe(now.getTime());
    expect(dueReminders(state, new Date(2026, 9, 10, 8, 44, 59))).toEqual([]);
    expect(dueReminders(state, new Date(2026, 9, 10, 8, 49))).toHaveLength(1);
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 30))).toEqual([]);
  });
  it("respects opt-in, source toggles, live suspense times and completion", () => {
    const state = seed();
    state.tasks[0].suspenseTime = "10:00";
    state.events.push({
      id: "event",
      title: "Event",
      date: "2026-10-10",
      time: "09:00",
      category: "Personal",
      recurrence: "None",
      source: "User entered",
    });
    expect(dueReminders(state, now).map((item) => item.entryId)).toEqual([
      "event:event",
    ]);
    state.reminderPreferences.includeEvents = false;
    expect(dueReminders(state, now)).toEqual([]);
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 45))).toHaveLength(1);
    state.tasks[0].completed = true;
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 45))).toEqual([]);
    state.tasks[0].completed = false;
    state.reminderPreferences.enabled = false;
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 45))).toEqual([]);
  });
  it("finds next-day and long-lead deadlines without sending an old backlog", () => {
    const state = seed();
    state.tasks[0].date = "2026-10-11";
    state.reminderPreferences.leadMinutes = 1440;
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 0))).toHaveLength(1);
    state.tasks[0].date = "2026-10-17";
    state.reminderPreferences.leadMinutes = 10080;
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 0))).toHaveLength(1);
    state.tasks[0].date = "2026-10-03";
    expect(dueReminders(state, new Date(2026, 9, 10, 9, 0))).toEqual([]);
  });
  it("follows edited feedback dates, avoids linked-event duplicates and handles the midnight boundary", () => {
    const state = seed();
    state.tasks = [];
    state.members.push({
      id: "member",
      name: "Avery",
      rank: "SSgt",
      focus: "",
      notes: "",
      nextFeedback: "2026-10-10",
    });
    state.events.push({
      id: "event",
      title: "Feedback",
      date: "2026-10-10",
      time: "09:00",
      category: "Career",
      recurrence: "None",
      source: "User entered",
      memberId: "member",
    });
    expect(dueReminders(state, now)).toHaveLength(1);
    state.members[0].nextFeedback = "2026-10-11";
    state.events[0].date = "2026-10-11";
    expect(dueReminders(state, now)).toEqual([]);
    expect(reminderDate({ date: "2026-10-10", time: "24:00" })?.getTime()).toBe(
      new Date(2026, 9, 11, 0, 0).getTime(),
    );
    expect(
      reminderDate({ date: "0001-01-01", time: "09:00" })?.getFullYear(),
    ).toBe(1);
  });
});

describe("notification delivery and deduplication", () => {
  it("keeps a bounded, expiring ledger and tolerates blocked or unreadable storage", () => {
    const ms = now.getTime();
    const ledger = new Map(
      Array.from(
        { length: 700 },
        (_, index) => [`key-${index}`, ms - index] as [string, number],
      ),
    );
    ledger.set("expired", ms - 15 * 86_400_000);
    writeReminderLedger(localStorage, ledger, ms);
    const saved = readReminderLedger(localStorage, ms);
    expect(saved.size).toBe(500);
    expect(saved.has("expired")).toBe(false);
    expect(saved.has("key-0")).toBe(true);
    expect(saved.has("key-699")).toBe(false);
    localStorage.setItem(REMINDER_LEDGER_KEY, "unreadable");
    expect(readReminderLedger(localStorage, ms).size).toBe(0);
    expect(
      readReminderLedger(
        {
          getItem: () => {
            throw new Error("Blocked");
          },
        },
        ms,
      ).size,
    ).toBe(0);
    expect(() =>
      writeReminderLedger(
        {
          setItem: () => {
            throw new Error("Full");
          },
        },
        ledger,
        ms,
      ),
    ).not.toThrow();
  });
  it("never requests permission during delivery and keeps sensitive record titles out of notifications", async () => {
    const construct = vi.fn();
    const request = vi.fn();
    class BrowserNotification {
      static permission: NotificationPermission = "granted";
      static requestPermission = request;
      onclick = null;
      constructor(title: string, options: NotificationOptions) {
        construct(title, options);
      }
      close() {}
    }
    vi.stubGlobal("Notification", BrowserNotification);
    const due = dueReminders(seed(), now)[0];
    expect(await sendBrowserReminder(due)).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledWith(
      "Enlisted Planner reminder",
      expect.objectContaining({
        body: expect.stringContaining("tasker"),
        tag: due.key,
      }),
    );
    expect(JSON.stringify(construct.mock.calls)).not.toContain(
      "Sensitive title",
    );
    BrowserNotification.permission = "default";
    expect(await sendBrowserReminder(due)).toBe(false);
    expect(construct).toHaveBeenCalledTimes(1);
  });
  it("uses a registered service worker on supported devices and falls back if that delivery fails", async () => {
    const construct = vi.fn();
    class BrowserNotification {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();
      onclick = null;
      constructor(title: string, options: NotificationOptions) {
        construct(title, options);
      }
      close() {}
    }
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Notification", BrowserNotification);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({ showNotification }),
      },
    });
    const due = dueReminders(seed(), now)[0];
    expect(await sendBrowserReminder(due)).toBe(true);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(construct).not.toHaveBeenCalled();
    showNotification.mockRejectedValue(new Error("Unavailable"));
    expect(await sendBrowserReminder(due)).toBe(true);
    expect(construct).toHaveBeenCalledTimes(1);
  });
  it("reports unsupported browsers without attempting permission or delivery", async () => {
    vi.stubGlobal("Notification", undefined);
    expect(notificationPermission()).toBe("unsupported");
    expect(await sendBrowserReminder(dueReminders(seed(), now)[0])).toBe(false);
  });
});
