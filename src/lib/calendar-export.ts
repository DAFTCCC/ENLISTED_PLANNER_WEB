import { addDays, minutes, occursOn } from "./dates";
import type { CalendarEvent, PlannerState } from "./types";

export type CalendarEntryKind = "block" | "task" | "event" | "follow-up";
export interface CalendarEntry {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  kind: CalendarEntryKind;
  category: string;
  detail: string;
  notes: string;
  completed: boolean;
}
export interface CalendarExportOptions {
  from: string;
  to: string;
  includeBlocks?: boolean;
  includeTasks?: boolean;
  includeEvents?: boolean;
  includeFollowUps?: boolean;
  includeCompleted?: boolean;
  includeNotes?: boolean;
  alarmMinutes?: number;
}

export const MAX_CALENDAR_DAYS = 366;
export const MAX_CALENDAR_ENTRIES = 5_000;
export const MAX_CALENDAR_BYTES = 10 * 1024 * 1024;

/** Finite snapshots keep recurrence expansion predictable in other calendar apps. */
export function calendarRange(from: string, to: string): string[] {
  try {
    addDays(from, 0);
    addDays(to, 0);
  } catch {
    throw new Error("Choose a valid start date and end date.");
  }
  if (to < from) throw new Error("The end date must follow the start date.");
  const dates: string[] = [];
  let date = from;
  while (date <= to) {
    if (dates.length === MAX_CALENDAR_DAYS)
      throw new Error(`Choose a range of ${MAX_CALENDAR_DAYS} days or fewer.`);
    dates.push(date);
    if (date === to) break;
    date = addDays(date, 1);
  }
  return dates;
}

/** Shared with foreground reminders; all dates come from live planner records. */
export function calendarEntries(
  state: PlannerState,
  options: CalendarExportOptions,
): CalendarEntry[] {
  const dates = calendarRange(options.from, options.to);
  const includeBlocks = options.includeBlocks !== false;
  const includeTasks = options.includeTasks !== false;
  const includeEvents = options.includeEvents !== false;
  const includeFollowUps = options.includeFollowUps !== false;
  const result: CalendarEntry[] = [];
  const within = (date: string) =>
    date && date >= options.from && date <= options.to;
  function add(entry: CalendarEntry) {
    if (!within(entry.date) || (!options.includeCompleted && entry.completed))
      return;
    if (result.length === MAX_CALENDAR_ENTRIES)
      throw new Error(
        "This range contains too many calendar entries. Choose a shorter range.",
      );
    result.push(entry);
  }
  const empty = {
    time: "",
    kind: "follow-up" as const,
    notes: "",
    completed: false,
  };
  if (includeBlocks)
    for (const block of state.blocks)
      add({
        ...empty,
        id: `block:${block.id}`,
        title: block.title,
        date: block.date,
        time: block.start,
        endTime: block.end,
        kind: "block",
        category: block.category,
        detail: `Time block · ${block.completed ? "Completed" : "Planned"}`,
        notes: block.notes,
        completed: block.completed,
      });
  if (includeTasks)
    for (const task of state.tasks) {
      const member = state.members.find((item) => item.id === task.assigneeId);
      add({
        ...empty,
        id: `task:${task.id}`,
        title: task.title,
        date: task.date,
        time: task.suspenseTime || "",
        kind: "task",
        category: "Tasker suspense",
        detail: `Tasker deadline · ${task.status || (task.completed ? "Done" : "Open")}${member ? ` · ${member.name}` : ""}`,
        notes: task.notes || "",
        completed: task.completed,
      });
    }
  const sourceIsComplete = (event: CalendarEvent) =>
    Boolean(
      (event.developmentActionId &&
        state.developmentActions.some(
          (action) =>
            action.id === event.developmentActionId &&
            action.status === "Complete",
        )) ||
      (event.disciplinePlanId &&
        state.disciplinePlans.some(
          (plan) =>
            plan.id === event.disciplinePlanId && plan.status === "Closed",
        )) ||
      (event.goalId &&
        state.goals.some(
          (goal) => goal.id === event.goalId && goal.progress >= 100,
        )),
    );
  if (includeEvents)
    for (const event of state.events)
      for (const date of dates)
        if (occursOn(event, date))
          add({
            ...empty,
            id: `event:${event.id}${event.recurrence === "None" ? "" : `:${date}`}`,
            title: event.title,
            date,
            time: event.time,
            kind: "event",
            category: event.category,
            detail: `Calendar event · ${event.source}${event.recurrence !== "None" ? ` · ${event.recurrence} occurrence` : ""}`,
            completed: sourceIsComplete(event),
          });
  if (includeFollowUps) {
    const covered = (key: keyof CalendarEvent, id: string, date: string) =>
      includeEvents &&
      state.events.some((event) => event[key] === id && occursOn(event, date));
    const coveredByTask = (id: string | undefined, date: string) =>
      includeTasks &&
      Boolean(
        id &&
        state.tasks.some(
          (task) =>
            task.id === id &&
            task.date === date &&
            (options.includeCompleted || !task.completed),
        ),
      );
    for (const goal of state.goals)
      if (!covered("goalId", goal.id, goal.targetDate))
        add({
          ...empty,
          id: `goal:${goal.id}`,
          title: goal.title,
          date: goal.targetDate,
          category: "Career target",
          detail: `Goal target · ${goal.source || "User entered"} · ${goal.progress}% complete`,
          completed: goal.progress >= 100,
        });
    for (const project of state.projects)
      add({
        ...empty,
        id: `project:${project.id}`,
        title: project.title,
        date: project.dueDate,
        category: "Project target",
        detail: `Project target · ${project.status}`,
        notes: project.notes,
        completed: project.status === "Complete",
      });
    for (const plan of state.careerPlans)
      if (
        !state.goals.some(
          (goal) =>
            goal.sourceRef === `career-plan:${plan.id}` &&
            goal.targetDate === plan.dueDate &&
            (options.includeCompleted || goal.progress < 100),
        )
      )
        add({
          ...empty,
          id: `career-plan:${plan.id}`,
          title: plan.title,
          date: plan.dueDate,
          category: "Career planning target",
          detail: `${plan.pathway} · ${plan.status}`,
          notes: plan.notes,
          completed: plan.status === "Complete",
        });
    for (const objective of state.objectives)
      add({
        ...empty,
        id: `objective:${objective.id}`,
        title: objective.title,
        date: objective.targetDate,
        category: "Strategic target",
        detail: `${objective.level} priority target`,
        notes: objective.notes,
      });
    for (const member of state.members)
      if (!covered("memberId", member.id, member.nextFeedback))
        add({
          ...empty,
          id: `feedback:${member.id}`,
          title: `Feedback: ${member.name}`,
          date: member.nextFeedback,
          category: "Teammate follow-up",
          detail: "Feedback conversation",
          notes: member.focus,
        });
    for (const action of state.developmentActions)
      if (
        !covered("developmentActionId", action.id, action.dueDate) &&
        !coveredByTask(action.taskId, action.dueDate)
      )
        add({
          ...empty,
          id: `development:${action.id}`,
          title: action.title,
          date: action.dueDate,
          category: "Development follow-up",
          detail: `${action.kind} · ${action.status}`,
          notes: action.notes,
          completed: action.status === "Complete",
        });
    for (const plan of state.disciplinePlans)
      if (!covered("disciplinePlanId", plan.id, plan.followUpDate))
        add({
          ...empty,
          id: `discipline:${plan.id}`,
          title: `Support review: ${plan.title}`,
          date: plan.followUpDate,
          category: "Teammate follow-up",
          detail: `Expectations follow-up · ${plan.status}`,
          notes: plan.notes,
          completed: plan.status === "Closed",
        });
    for (const meeting of state.meetings) {
      if (!covered("meetingId", meeting.id, meeting.date))
        add({
          ...empty,
          id: `meeting:${meeting.id}`,
          title: meeting.title,
          date: meeting.date,
          time: meeting.time,
          category: "Meeting",
          detail: "Meeting · user-entered time",
          notes: [meeting.objective, meeting.agenda].filter(Boolean).join("\n"),
        });
      if (
        meeting.nextDate &&
        meeting.nextDate !== meeting.date &&
        !covered("meetingId", meeting.id, meeting.nextDate)
      )
        add({
          ...empty,
          id: `meeting-next:${meeting.id}`,
          title: `Follow-up: ${meeting.title}`,
          date: meeting.nextDate,
          category: "Meeting",
          detail: "Next meeting date · time not set",
        });
    }
    for (const requirement of state.careerRequirements || []) {
      add({
        ...empty,
        id: `requirement:${requirement.id}`,
        title: requirement.title,
        date: requirement.dueDate,
        category: requirement.area,
        detail: `Qualification target · ${requirement.status}`,
        notes: requirement.notes,
        completed: requirement.status === "Complete",
      });
      add({
        ...empty,
        id: `requirement-expiry:${requirement.id}`,
        title: `${requirement.title} expires`,
        date: requirement.expiresDate,
        category: requirement.area,
        detail: "User-entered qualification expiry",
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.id.localeCompare(b.id),
  );
}

export function escapeCalendarText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 limits physical lines to 75 UTF-8 octets, including continuation space. */
export function foldCalendarLine(value: string): string {
  let line = "";
  let bytes = 0;
  const lines: string[] = [];
  for (const character of value) {
    const codepoint = character.codePointAt(0)!;
    const size =
      codepoint <= 0x7f
        ? 1
        : codepoint <= 0x7ff
          ? 2
          : codepoint <= 0xffff
            ? 3
            : 4;
    if (bytes + size > 75) {
      lines.push(line);
      line = " ";
      bytes = 1;
    }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join("\r\n");
}

function stamp(date: string, time: string): string {
  if (time === "24:00") return `${addDays(date, 1).replace(/-/g, "")}T000000`;
  minutes(time);
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

/** Floating local times avoid shifting planner dates through UTC during import. */
export function exportCalendar(
  state: PlannerState,
  options: CalendarExportOptions,
  generatedAt = new Date(),
): { text: string; count: number } {
  const entries = calendarEntries(state, options);
  if (
    options.alarmMinutes !== undefined &&
    (!Number.isInteger(options.alarmMinutes) ||
      options.alarmMinutes < 0 ||
      options.alarmMinutes > 10_080)
  )
    throw new Error(
      "Calendar alerts must be between 0 and 10,080 minutes before an entry.",
    );
  if (!Number.isFinite(generatedAt.getTime()))
    throw new Error("Invalid export timestamp.");
  const timestamp = generatedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const lines: string[] = [];
  const encoder = new TextEncoder();
  let byteCount = 0;
  function addLines(...values: string[]) {
    for (const value of values) {
      const folded = foldCalendarLine(value);
      byteCount += encoder.encode(folded).length + 2;
      if (byteCount > MAX_CALENDAR_BYTES)
        throw new Error(
          "This calendar file exceeds 10 MB. Choose a shorter range or exclude record notes.",
        );
      lines.push(folded);
    }
  }
  addLines(
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Enlisted Planner//Calendar Snapshot//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Enlisted Planner",
  );
  for (const entry of entries) {
    // Hex UTF-8 IDs are deterministic, opaque, and cannot inject calendar properties.
    const uid = Array.from(encoder.encode(entry.id), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    addLines(
      "BEGIN:VEVENT",
      `UID:${uid}@enlisted-planner.local`,
      `DTSTAMP:${timestamp}`,
      `SUMMARY:${escapeCalendarText(entry.title)}`,
    );
    if (entry.time) {
      addLines(`DTSTART:${stamp(entry.date, entry.time)}`);
      if (entry.endTime) addLines(`DTEND:${stamp(entry.date, entry.endTime)}`);
    } else {
      addLines(`DTSTART;VALUE=DATE:${entry.date.replace(/-/g, "")}`);
      // DTEND is exclusive; omit it only at the final supported calendar day.
      if (entry.date !== "9999-12-31")
        addLines(
          `DTEND;VALUE=DATE:${addDays(entry.date, 1).replace(/-/g, "")}`,
        );
    }
    const description = [
      entry.detail,
      options.includeNotes ? entry.notes : "",
      "Snapshot from Enlisted Planner. Changes do not sync automatically.",
    ]
      .filter(Boolean)
      .join("\n");
    addLines(
      `DESCRIPTION:${escapeCalendarText(description)}`,
      `CATEGORIES:${escapeCalendarText(entry.category)}`,
      `TRANSP:${entry.kind === "block" || entry.category === "Meeting" ? "OPAQUE" : "TRANSPARENT"}`,
    );
    if (options.alarmMinutes !== undefined && !entry.completed) {
      // All-day alerts use local 09:00 instead of midnight. The reference must be explicit.
      if (entry.time)
        addLines(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER:-PT${options.alarmMinutes}M`,
          "DESCRIPTION:Planner reminder",
          "END:VALARM",
        );
      else {
        const offset = 540 - options.alarmMinutes;
        addLines(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER:${offset < 0 ? "-" : ""}PT${Math.abs(offset)}M`,
          "DESCRIPTION:Planner reminder",
          "END:VALARM",
        );
      }
    }
    addLines("END:VEVENT");
  }
  addLines("END:VCALENDAR");
  return { text: lines.join("\r\n") + "\r\n", count: entries.length };
}
