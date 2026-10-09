import type { CalendarEvent } from "./types";

const DAY_MS = 86_400_000;

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // setUTCFullYear also handles years 1–99 without Date's 1900 offset.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function requireDate(value: string): Date {
  const date = parseDate(value);
  if (!date) throw new RangeError(`Invalid calendar date: ${value}`);
  return date;
}

function dateString(year: number, month: number, day: number): string {
  if (year < 1 || year > 9999)
    throw new RangeError("Calendar year must be between 1 and 9999");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The device's current calendar date, without converting it to UTC. */
export function localDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
  return dateString(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Calendar arithmetic is independent of daylight-saving transitions. */
export function addDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days))
    throw new RangeError("Days must be a finite integer");
  const date = requireDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Date is outside the supported range");
  return dateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(requireDate(value));
}

/** Convert a clock time or the end-of-day boundary into minutes since midnight. */
export function minutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Invalid time: ${time}`);
  const hours = Number(match[1]);
  const minute = Number(match[2]);
  if (hours > 24 || minute > 59 || (hours === 24 && minute !== 0))
    throw new RangeError(`Invalid time: ${time}`);
  return hours * 60 + minute;
}

export function timeString(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 1440) {
    throw new RangeError("Time must be an integer between 0 and 1440 minutes");
  }
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/** Recurrences begin at the event's anchor; missing monthly dates are skipped. */
export function occursOn(event: CalendarEvent, value: string): boolean {
  const anchor = parseDate(event.date);
  const date = parseDate(value);
  if (!anchor || !date || date.getTime() < anchor.getTime()) return false;
  switch (event.recurrence) {
    case "None":
      return date.getTime() === anchor.getTime();
    case "Weekly":
      return (date.getTime() - anchor.getTime()) % (7 * DAY_MS) === 0;
    case "Monthly":
      return date.getUTCDate() === anchor.getUTCDate();
    default:
      return false;
  }
}
