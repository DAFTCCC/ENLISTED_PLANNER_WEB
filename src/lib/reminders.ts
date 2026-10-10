import { useEffect, useRef } from "react";
import { usePlanner } from "./planner";
import { addDays, localDate, minutes } from "./dates";
import {
  calendarEntries,
  type CalendarEntry,
  type CalendarEntryKind,
} from "./calendar-export";
import type { PlannerState } from "./types";

export const REMINDER_LEDGER_KEY = "enlisted-planner:reminders:v1";
const LATE_WINDOW_MS = 5 * 60_000;
const LEDGER_LIMIT = 500;
const LEDGER_LIFETIME_MS = 14 * 86_400_000;
export interface DueReminder {
  key: string;
  entryId: string;
  date: string;
  time: string;
  kind: CalendarEntryKind;
  dueAt: number;
  notifyAt: number;
}

export function notificationPermission():
  NotificationPermission | "unsupported" {
  if (
    typeof Notification === "undefined" ||
    typeof Notification.requestPermission !== "function"
  )
    return "unsupported";
  return Notification.permission;
}

/** All-day items have an explicit 09:00 local reminder convention. */
export function reminderDate(
  entry: Pick<CalendarEntry, "date" | "time">,
): Date | null {
  const date = entry.date.split("-").map(Number);
  const clockMinutes = minutes(entry.time || "09:00");
  const result = new Date(0);
  result.setFullYear(date[0], date[1] - 1, date[2]);
  result.setHours(Math.floor(clockMinutes / 60), clockMinutes % 60, 0, 0);
  // Skip nonexistent wall-clock times at a daylight-saving transition.
  if (
    !Number.isFinite(result.getTime()) ||
    (clockMinutes < 1440 &&
      (localDate(result) !== entry.date ||
        result.getHours() * 60 + result.getMinutes() !== clockMinutes))
  )
    return null;
  return result;
}

/** No old backlog: only reminders within five minutes of their scheduled notification. */
export function dueReminders(
  state: PlannerState,
  now = new Date(),
): DueReminder[] {
  const preferences = state.reminderPreferences;
  if (!preferences?.enabled || !Number.isFinite(now.getTime())) return [];
  if (
    !Number.isInteger(preferences.leadMinutes) ||
    preferences.leadMinutes < 0 ||
    preferences.leadMinutes > 10_080
  )
    return [];
  const today = localDate(now);
  let from = today;
  let to = today;
  try {
    from = addDays(today, -1);
  } catch {
    /* First supported date. */
  }
  try {
    to = addDays(today, Math.ceil(preferences.leadMinutes / 1440) + 1);
  } catch {
    to = "9999-12-31";
  }
  const entries = calendarEntries(state, {
    from,
    to,
    includeBlocks: preferences.includeEvents,
    includeEvents: preferences.includeEvents,
    includeTasks: preferences.includeTasks,
    includeFollowUps: preferences.includeFollowUps,
  });
  const nowMs = now.getTime();
  const result: DueReminder[] = [];
  for (const entry of entries) {
    const due = reminderDate(entry);
    if (!due) continue;
    const dueAt = due.getTime();
    const notifyAt = dueAt - preferences.leadMinutes * 60_000;
    if (notifyAt <= nowMs && notifyAt >= nowMs - LATE_WINDOW_MS)
      result.push({
        key: `${entry.id}|${entry.date}|${entry.time || "09:00"}`,
        entryId: entry.id,
        date: entry.date,
        time: entry.time || "09:00",
        kind: entry.kind,
        dueAt,
        notifyAt,
      });
  }
  return result;
}

export function readReminderLedger(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): Map<string, number> {
  try {
    const raw = storage.getItem(REMINDER_LEDGER_KEY);
    if (!raw || raw.length > 200_000) return new Map();
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > LEDGER_LIMIT) return new Map();
    return new Map(
      value.filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          entry[0].length <= 4_096 &&
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1]) &&
          entry[1] <= now &&
          entry[1] > now - LEDGER_LIFETIME_MS,
      ),
    );
  } catch {
    return new Map();
  }
}

export function writeReminderLedger(
  storage: Pick<Storage, "setItem">,
  ledger: Map<string, number>,
  now = Date.now(),
): void {
  const recent = Array.from(ledger)
    .filter(([, timestamp]) => timestamp > now - LEDGER_LIFETIME_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEDGER_LIMIT);
  try {
    storage.setItem(REMINDER_LEDGER_KEY, JSON.stringify(recent));
  } catch {
    /* Session deduplication still works if storage is unavailable. */
  }
}

/** Notification text omits task titles and private teammate details on the lock screen. */
export async function sendBrowserReminder(
  reminder: DueReminder,
): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  const kind =
    reminder.kind === "block"
      ? "time block"
      : reminder.kind === "task"
        ? "tasker"
        : reminder.kind === "event"
          ? "calendar event"
          : "target or follow-up";
  const options: NotificationOptions = {
    body: `A ${kind} is scheduled for ${reminder.date} at ${reminder.time}. Open your planner to review it.`,
    tag: reminder.key,
    data: { page: "calendar" },
  };
  try {
    const registration =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (registration?.showNotification) {
      await registration.showNotification("Enlisted Planner reminder", options);
      return true;
    }
  } catch {
    /* Desktop constructor fallback if a service worker is unavailable. */
  }
  try {
    const notification = new Notification("Enlisted Planner reminder", options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Mounted once inside PlannerProvider. This deliberately does not request permission. */
export function ReminderRunner() {
  const { state } = usePlanner();
  const latest = useRef(state);
  const sent = useRef(new Map<string, number>());
  const running = useRef(false);
  latest.current = state;
  useEffect(() => {
    let alive = true;
    async function run() {
      if (
        !alive ||
        running.current ||
        document.visibilityState === "hidden" ||
        notificationPermission() !== "granted"
      )
        return;
      running.current = true;
      try {
        const work = async () => {
          const now = new Date();
          let storage: Storage | undefined;
          try {
            storage = window.localStorage;
          } catch {
            /* Session-only deduplication. */
          }
          const ledger = storage
            ? readReminderLedger(storage, now.getTime())
            : new Map<string, number>();
          for (const [key, timestamp] of sent.current)
            if (timestamp > now.getTime() - LEDGER_LIFETIME_MS)
              ledger.set(key, timestamp);
          sent.current = new Map(
            Array.from(ledger)
              .sort((a, b) => b[1] - a[1])
              .slice(0, LEDGER_LIMIT),
          );
          for (const reminder of dueReminders(latest.current, now)) {
            if (!alive || !latest.current.reminderPreferences.enabled) break;
            if (ledger.has(reminder.key)) continue;
            if (await sendBrowserReminder(reminder)) {
              ledger.set(reminder.key, now.getTime());
              sent.current.set(reminder.key, now.getTime());
              // Save each successful delivery before another tab gets the lock.
              if (storage) writeReminderLedger(storage, ledger, now.getTime());
              if (sent.current.size > LEDGER_LIMIT)
                sent.current = new Map(
                  Array.from(sent.current)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, LEDGER_LIMIT),
                );
            }
          }
        };
        if (typeof navigator !== "undefined" && navigator.locks?.request)
          await navigator.locks.request(
            "enlisted-planner:reminder-delivery",
            { ifAvailable: true },
            (lock) => (lock ? work() : undefined),
          );
        else await work();
      } catch {
        /* Notification or export limits must never interrupt the planner. */
      } finally {
        running.current = false;
      }
    }
    void run();
    const interval = window.setInterval(() => void run(), 30_000);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, []);
  return null;
}
