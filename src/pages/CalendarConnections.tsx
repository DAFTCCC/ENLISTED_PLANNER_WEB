import { useState, type FormEvent } from "react";
import { Bell, CalendarPlus, Download } from "lucide-react";
import { usePlanner } from "../lib/planner";
import { addDays, localDate } from "../lib/dates";
import {
  calendarEntries,
  exportCalendar,
  type CalendarExportOptions,
} from "../lib/calendar-export";
import { notificationPermission } from "../lib/reminders";
import "./calendar-connections.css";

export { ReminderRunner } from "../lib/reminders";

export default function CalendarConnections() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [options, setOptions] = useState<CalendarExportOptions>({
    from: today,
    to: addDays(today, 30),
    includeBlocks: true,
    includeTasks: true,
    includeEvents: true,
    includeFollowUps: true,
    includeCompleted: false,
    includeNotes: false,
  });
  const [includeAlerts, setIncludeAlerts] = useState(false);
  const [permission, setPermission] = useState(notificationPermission);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const preferences = state.reminderPreferences;
  let count: number | null = null;
  let rangeError = "";
  try {
    count = calendarEntries(state, options).length;
  } catch (reason) {
    rangeError =
      reason instanceof Error ? reason.message : "Check the export date range.";
  }

  function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const exported = exportCalendar(state, {
        ...options,
        ...(includeAlerts ? { alarmMinutes: preferences.leadMinutes } : {}),
      });
      if (!exported.count) {
        setError(
          "There are no entries in this range. Choose another range or include completed records.",
        );
        return;
      }
      const blob = new Blob([exported.text], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `enlisted-planner-${options.from}-to-${options.to}.ics`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice(
        `Calendar download started with ${exported.count} ${exported.count === 1 ? "entry" : "entries"}. Import the .ics file into your calendar.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The calendar could not be exported.",
      );
    }
  }

  async function enableReminders() {
    setError("");
    setNotice("");
    const current = notificationPermission();
    setPermission(current);
    if (current === "unsupported") {
      setError(
        "This browser does not support notifications. Calendar file alerts remain available.",
      );
      return;
    }
    if (current === "denied") {
      setError(
        "Notifications are blocked. Change this site's notification permission in your browser settings, then return here.",
      );
      return;
    }
    setRequesting(true);
    try {
      const granted =
        current === "granted"
          ? current
          : await Notification.requestPermission();
      setPermission(granted);
      if (granted === "granted") {
        const saved = mutate((next) => {
          next.reminderPreferences.enabled = true;
        });
        if (saved !== false)
          setNotice(
            "Browser reminders enabled. Keep the planner open and visible for reminder checks.",
          );
      } else {
        mutate((next) => {
          next.reminderPreferences.enabled = false;
        });
        setNotice(
          granted === "denied"
            ? "Notifications were blocked. You can change this in browser site settings."
            : "Permission was not granted. Browser reminders remain off.",
        );
      }
    } catch {
      setError(
        "Notification permission could not be requested. Use browser site settings or calendar file alerts.",
      );
    } finally {
      setRequesting(false);
    }
  }

  return (
    <details className="panel calendar-connections">
      <summary>
        <CalendarPlus size={19} />
        <span>Calendar connections & reminders</span>
      </summary>
      <div className="calendar-connections-content">
        <section aria-labelledby="calendar-export-heading">
          <h3 id="calendar-export-heading">Use your regular calendar</h3>
          <p className="calendar-connection-help">
            Download a calendar file for Google Calendar, Outlook, Apple
            Calendar, or another app that imports .ics files. Dates and times
            use the local calendar time shown in your planner.
          </p>
          <form onSubmit={download} className="calendar-connection-form">
            <div className="form-grid">
              <label className="field">
                <span>Export start date</span>
                <input
                  type="date"
                  required
                  value={options.from}
                  onChange={(event) =>
                    setOptions({ ...options, from: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Export end date</span>
                <input
                  type="date"
                  required
                  value={options.to}
                  onChange={(event) =>
                    setOptions({ ...options, to: event.target.value })
                  }
                />
              </label>
            </div>
            <fieldset className="calendar-connection-checks">
              <legend>Include in the calendar file</legend>
              {(
                [
                  ["includeBlocks", "Daily time blocks"],
                  ["includeTasks", "Tasker deadlines"],
                  ["includeEvents", "Calendar events"],
                  ["includeFollowUps", "Targets and teammate follow-ups"],
                  ["includeCompleted", "Completed records"],
                  [
                    "includeNotes",
                    "Record notes (may contain personal information)",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(options[key])}
                    onChange={(event) =>
                      setOptions({ ...options, [key]: event.target.checked })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={includeAlerts}
                  onChange={(event) => setIncludeAlerts(event.target.checked)}
                />
                <span>
                  Calendar alerts · {preferences.leadMinutes} minutes before
                </span>
              </label>
            </fieldset>
            <p className="calendar-connection-help">
              This is a snapshot with up to 366 days. Repeating events are
              expanded within that range. Later changes stay in the planner;
              importing the file again may create duplicates in your calendar
              app.
            </p>
            {rangeError && (
              <p className="calendar-connection-error" role="alert">
                {rangeError}
              </p>
            )}
            <div className="calendar-connection-actions">
              <button
                className="button primary"
                type="submit"
                disabled={count === null || count === 0}
              >
                <Download size={16} />
                Export calendar (.ics)
              </button>
              <span>
                {count !== null
                  ? `${count} ${count === 1 ? "entry" : "entries"} selected`
                  : "Check dates"}
              </span>
            </div>
          </form>
          <details className="calendar-import-help">
            <summary>How to import the file</summary>
            <p>
              Google Calendar: on the web, open Settings → Import & export and
              choose the file and destination calendar. Outlook: use Add
              calendar → Upload from file, or open the file in the desktop app.
              Apple Calendar: open the file or choose File → Import. A separate
              planner calendar makes future replacement easier.
            </p>
            <p>
              Calendar apps decide how imported alerts behave. All-day alerts
              use 09:00 local time; a timed event without an end time is a
              checkpoint, not an assumed meeting duration.
            </p>
          </details>
        </section>
        <section
          className="calendar-browser-reminders"
          aria-labelledby="browser-reminders-heading"
        >
          <h3 id="browser-reminders-heading">
            <Bell size={18} />
            Browser reminders
          </h3>
          <p className="calendar-connection-help">
            Optional notifications on this device. The planner checks while it
            is open and visible; it cannot guarantee reminders after you close
            it or the device sleeps. All-day deadlines and follow-ups use 09:00
            local time. Notification text keeps record titles and private
            teammate details off the lock screen.
          </p>
          <p className="calendar-reminder-status">
            Permission:{" "}
            <strong>
              {permission === "granted"
                ? "Granted"
                : permission === "denied"
                  ? "Blocked"
                  : permission === "unsupported"
                    ? "Unavailable in this browser"
                    : "Not requested"}
            </strong>{" "}
            · Planner reminders:{" "}
            <strong>
              {preferences.enabled && permission === "granted" ? "On" : "Off"}
            </strong>
          </p>
          <div className="calendar-connection-actions">
            <button
              className="button secondary"
              type="button"
              disabled={requesting || permission === "unsupported"}
              onClick={() => void enableReminders()}
            >
              <Bell size={16} />
              {requesting
                ? "Requesting permission…"
                : permission === "granted"
                  ? "Enable browser reminders"
                  : "Request browser notifications"}
            </button>
            {preferences.enabled && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  mutate((next) => {
                    next.reminderPreferences.enabled = false;
                  });
                  setNotice("Browser reminders turned off in the planner.");
                }}
              >
                Turn reminders off
              </button>
            )}
          </div>
          <label className="field calendar-reminder-lead">
            <span>Reminder lead time (minutes)</span>
            <input
              type="number"
              min="0"
              max="10080"
              step="1"
              value={preferences.leadMinutes}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value <= 10_080)
                  mutate((next) => {
                    next.reminderPreferences.leadMinutes = value;
                  });
              }}
            />
          </label>
          <fieldset className="calendar-connection-checks">
            <legend>Browser reminder sources</legend>
            {(
              [
                ["includeTasks", "Tasker deadlines"],
                ["includeEvents", "Events and time blocks"],
                ["includeFollowUps", "Targets and teammate follow-ups"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(event) =>
                    mutate((next) => {
                      next.reminderPreferences[key] = event.target.checked;
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        </section>
        {error && (
          <p className="calendar-connection-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="calendar-connection-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
