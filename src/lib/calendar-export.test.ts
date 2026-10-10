import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  calendarEntries,
  calendarRange,
  escapeCalendarText,
  exportCalendar,
  foldCalendarLine,
} from "./calendar-export";
import type { CalendarEvent } from "./types";

const options = { from: "2026-10-10", to: "2026-10-20" };
const timestamp = new Date("2026-10-10T23:00:00Z");
const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "appointment",
  title: "Appointment",
  date: "2026-10-10",
  time: "",
  recurrence: "None",
  category: "Personal",
  source: "User entered",
  ...overrides,
});
const unfold = (value: string) => value.replace(/\r\n[ \t]/g, "");
const records = (value: string) =>
  unfold(value)
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((record) => record.split("END:VEVENT\r\n")[0]);

describe("interoperable calendar snapshots", () => {
  it("preserves floating wall-clock times, all-day dates and midnight boundaries without UTC shifts", () => {
    const state = defaultState();
    state.blocks.push({
      id: "night",
      title: "Night work",
      date: "2026-10-10",
      start: "23:00",
      end: "24:00",
      category: "Duty",
      notes: "Private notes",
      completed: false,
    });
    state.tasks.push({
      id: "task",
      title: "Submit package",
      date: "2026-10-11",
      priority: "High",
      completed: false,
    });
    const exported = exportCalendar(state, options, timestamp);
    expect(exported.count).toBe(2);
    const [block, task] = records(exported.text);
    expect(block).toContain("DTSTART:20261010T230000\r\nDTEND:20261011T000000");
    expect(task).toContain(
      "DTSTART;VALUE=DATE:20261011\r\nDTEND;VALUE=DATE:20261012",
    );
    expect(exported.text).toContain("DTSTAMP:20261010T230000Z");
    expect(exported.text).not.toContain("Private notes");
    expect(exported.text).not.toMatch(/DTSTART[^\r]*Z/);
    expect(exported.text).not.toMatch(/(?<!\r)\n/);
    expect(exported.text).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    expect(exported.text).toMatch(/END:VCALENDAR\r\n$/);
  });

  it("escapes text, folds multibyte UTF-8 safely and keeps identifiers stable across exports", () => {
    const state = defaultState();
    const title =
      "Review, plans; \\ details\nBEGIN:VEVENT\n" + "部署😀".repeat(30);
    state.events.push(event({ title, source: "Estimate" }));
    const first = exportCalendar(state, options, timestamp).text;
    const second = exportCalendar(
      state,
      { ...options, to: "2026-10-30" },
      new Date("2026-10-11T01:00:00Z"),
    ).text;
    expect(
      first
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    expect(unfold(first)).toContain(
      "SUMMARY:Review\\, plans\\; \\\\ details\\nBEGIN:VEVENT\\n" +
        "部署😀".repeat(30),
    );
    expect(records(first)).toHaveLength(1);
    expect(first.match(/UID:[^\r]+/)?.[0]).toBe(
      second.match(/UID:[^\r]+/)?.[0],
    );
    expect(first).toContain("Estimate");
    expect(escapeCalendarText("Valid\u0000\u0003 text\nMore")).toBe(
      "Valid text\\nMore",
    );
    expect(unfold(foldCalendarLine("SUMMARY:" + "😀".repeat(30)))).toBe(
      "SUMMARY:" + "😀".repeat(30),
    );
  });

  it("expands only recurring occurrences inside the selected range, without inventing February 31", () => {
    const state = defaultState();
    state.events.push(
      event({ id: "weekly", date: "2026-01-20", recurrence: "Weekly" }),
    );
    state.events.push(
      event({ id: "monthly", date: "2026-01-31", recurrence: "Monthly" }),
    );
    const entries = calendarEntries(state, {
      from: "2026-01-01",
      to: "2026-02-28",
    });
    expect(
      entries
        .filter((entry) => entry.id.startsWith("event:weekly"))
        .map((entry) => entry.date),
    ).toEqual([
      "2026-01-20",
      "2026-01-27",
      "2026-02-03",
      "2026-02-10",
      "2026-02-17",
      "2026-02-24",
    ]);
    expect(
      entries
        .filter((entry) => entry.id.startsWith("event:monthly"))
        .map((entry) => entry.date),
    ).toEqual(["2026-01-31"]);
    const output = exportCalendar(
      state,
      { from: "2026-01-01", to: "2026-02-28" },
      timestamp,
    );
    expect(output.count).toBe(7);
    expect(output.text).not.toContain("RRULE:");
    expect(
      new Set(
        records(output.text).map((record) => record.match(/UID:[^\r]+/)?.[0]),
      ).size,
    ).toBe(7);
  });

  it("deduplicates live source follow-ups covered by recurring linked events and excludes completed work", () => {
    const state = defaultState();
    state.members.push({
      id: "member",
      name: "Avery",
      rank: "SSgt",
      focus: "",
      nextFeedback: "2026-10-17",
      notes: "",
    });
    state.events.push(
      event({
        id: "feedback",
        date: "2026-10-10",
        recurrence: "Weekly",
        memberId: "member",
      }),
    );
    state.developmentActions.push({
      id: "development",
      memberId: "member",
      title: "Finished training",
      kind: "Training",
      dueDate: "2026-10-17",
      status: "Complete",
      notes: "",
      taskId: "done",
    });
    state.tasks.push({
      id: "done",
      title: "Finished training",
      date: "2026-10-17",
      priority: "Normal",
      completed: true,
    });
    state.events.push(
      event({
        id: "finished",
        date: "2026-10-17",
        developmentActionId: "development",
      }),
    );
    expect(calendarEntries(state, options).map((entry) => entry.id)).toEqual([
      "event:feedback:2026-10-10",
      "event:feedback:2026-10-17",
    ]);
    expect(
      calendarEntries(state, {
        ...options,
        includeEvents: false,
        includeTasks: false,
      }).map((entry) => entry.id),
    ).toEqual(["feedback:member"]);
    expect(
      calendarEntries(state, { ...options, includeCompleted: true }).some(
        (entry) => entry.id === "task:done",
      ),
    ).toBe(true);
  });

  it("exports linked career targets once, plus qualification renewal dates even after completion", () => {
    const state = defaultState();
    state.careerPlans.push({
      id: "career",
      title: "WAPS preparation",
      pathway: "WAPS",
      dueDate: "2026-10-15",
      afsc: "",
      cycle: "",
      status: "Preparing",
      checklist: [],
      notes: "",
      sourceUrl: "",
      lastVerified: "",
    });
    state.goals.push({
      id: "goal",
      title: "WAPS preparation",
      targetDate: "2026-10-15",
      category: "Career",
      progress: 0,
      sourceRef: "career-plan:career",
    });
    state.careerRequirements = [
      {
        id: "qualification",
        title: "Certification",
        area: "Certification",
        status: "Complete",
        dueDate: "2026-10-12",
        completedDate: "2026-10-10",
        expiresDate: "2026-10-19",
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
    expect(calendarEntries(state, options).map((entry) => entry.id)).toEqual([
      "goal:goal",
      "requirement-expiry:qualification",
    ]);
  });

  it("requires explicit notes and alarms and sets all-day alerts relative to 09:00", () => {
    const state = defaultState();
    state.blocks.push({
      id: "block",
      title: "Work",
      date: "2026-10-10",
      start: "10:00",
      end: "11:00",
      category: "Duty",
      notes: "Evidence link",
      completed: false,
    });
    state.tasks.push({
      id: "task",
      title: "Deadline",
      date: "2026-10-11",
      completed: false,
      priority: "Normal",
    });
    const defaultText = exportCalendar(state, options, timestamp).text;
    expect(defaultText).not.toContain("VALARM");
    expect(defaultText).not.toContain("Evidence link");
    const withAlerts = exportCalendar(
      state,
      { ...options, includeNotes: true, alarmMinutes: 15 },
      timestamp,
    ).text;
    expect(withAlerts).toContain("Evidence link");
    expect(withAlerts).toContain("TRIGGER:-PT15M");
    expect(withAlerts).toContain("TRIGGER:PT525M");
    expect(
      exportCalendar(state, { ...options, alarmMinutes: 1440 }, timestamp).text,
    ).toContain("TRIGGER:-PT900M");
    expect(() =>
      exportCalendar(state, { ...options, alarmMinutes: -1 }),
    ).toThrow("Calendar alerts");
  });

  it("rejects invalid or excessive ranges and event counts, including the supported year boundaries", () => {
    expect(() => calendarRange("2026-02-30", "2026-03-10")).toThrow(
      "valid start date",
    );
    expect(() => calendarRange("2026-10-20", "2026-10-10")).toThrow("end date");
    expect(() => calendarRange("2026-01-01", "2027-01-02")).toThrow("366 days");
    expect(calendarRange("2024-01-01", "2024-12-31")).toHaveLength(366);
    expect(calendarRange("9999-12-30", "9999-12-31")).toHaveLength(2);
    const state = defaultState();
    state.events = Array.from({ length: 5001 }, (_, index) =>
      event({ id: `event-${index}` }),
    );
    expect(() => exportCalendar(state, options)).toThrow(
      "too many calendar entries",
    );
    state.events = [event({ date: "9999-12-31" })];
    expect(
      exportCalendar(state, { from: "9999-12-31", to: "9999-12-31" }, timestamp)
        .text,
    ).toContain("DTSTART;VALUE=DATE:99991231");
  });

  it("bounds actual escaped file size and allows a smaller export that excludes notes", () => {
    const state = defaultState();
    state.tasks = Array.from({ length: 4 }, (_, index) => ({
      id: `task-${index}`,
      title: "Tasker",
      date: "2026-10-10",
      priority: "Normal" as const,
      completed: false,
      notes: "\\,;".repeat(500_000),
    }));
    expect(() =>
      exportCalendar(state, { ...options, includeNotes: true }, timestamp),
    ).toThrow("exceeds 10 MB");
    expect(exportCalendar(state, options, timestamp).count).toBe(4);
  });
});
