import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  formatDate,
  localDate,
  minutes,
  occursOn,
  timeString,
} from "./dates";
import type { CalendarEvent } from "./types";

function event(
  date: string,
  recurrence: CalendarEvent["recurrence"],
): CalendarEvent {
  return {
    id: "event",
    title: "Test event",
    date,
    time: "09:00",
    category: "Personal",
    recurrence,
    source: "User entered",
  };
}

afterEach(() => vi.useRealTimers());

describe("calendar dates", () => {
  it("uses the local calendar date and defaults to the current time", () => {
    const lateEvening = new Date(2026, 0, 2, 23, 30);
    expect(localDate(lateEvening)).toBe("2026-01-02");
    vi.useFakeTimers();
    vi.setSystemTime(lateEvening);
    expect(localDate()).toBe("2026-01-02");
  });

  it("preserves four-digit years before 100", () => {
    const earlyYear = new Date(0);
    earlyYear.setFullYear(9, 0, 2);
    expect(localDate(earlyYear)).toBe("0009-01-02");
    expect(addDays("0009-01-02", 1)).toBe("0009-01-03");
  });

  it("crosses month and year boundaries in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("observes Gregorian leap-year rules", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2000-02-28", 1)).toBe("2000-02-29");
    expect(addDays("2100-02-28", 1)).toBe("2100-03-01");
  });

  it("does not lose days at daylight-saving transitions", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("formats the supplied day without a timezone shift", () => {
    expect(formatDate("2026-01-02")).toBe("Jan 2, 2026");
    expect(
      formatDate("2026-01-02", {
        weekday: "long",
        timeZone: "Pacific/Honolulu",
      }),
    ).toBe("Friday");
  });

  it.each([
    "2026-02-29",
    "2024-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-1-2",
    "0000-01-01",
    "invalid",
  ])("rejects invalid date %s", (value) => {
    expect(() => addDays(value, 1)).toThrow(RangeError);
    expect(() => formatDate(value)).toThrow(RangeError);
  });

  it("rejects invalid date objects, fractional offsets, and year overflow", () => {
    expect(() => localDate(new Date(NaN))).toThrow(RangeError);
    expect(() => addDays("2026-01-01", 1.5)).toThrow(RangeError);
    expect(() => addDays("2026-01-01", Infinity)).toThrow(RangeError);
    expect(() => addDays("9999-12-31", 1)).toThrow(RangeError);
    expect(() => addDays("0001-01-01", -1)).toThrow(RangeError);
  });
});

describe("times", () => {
  it.each([
    ["00:00", 0],
    ["00:01", 1],
    ["09:05", 545],
    ["23:59", 1439],
    ["24:00", 1440],
  ] as const)("round trips %s", (time, value) => {
    expect(minutes(time)).toBe(value);
    expect(timeString(value)).toBe(time);
  });

  it.each(["24:01", "25:00", "23:60", "-1:00", "9:05", "09:5", "noon", ""])(
    "rejects invalid time %s",
    (time) => {
      expect(() => minutes(time)).toThrow(RangeError);
    },
  );

  it.each([-1, 1441, 5.5, NaN, Infinity])(
    "rejects invalid minute count %s",
    (value) => {
      expect(() => timeString(value)).toThrow(RangeError);
    },
  );
});

describe("event recurrence", () => {
  it("shows a one-time event only on its anchor date", () => {
    const once = event("2026-01-05", "None");
    expect(occursOn(once, "2026-01-05")).toBe(true);
    expect(occursOn(once, "2026-01-04")).toBe(false);
    expect(occursOn(once, "2026-01-06")).toBe(false);
  });

  it("repeats weekly from the anchor and never before it", () => {
    const weekly = event("2026-01-05", "Weekly");
    expect(occursOn(weekly, "2026-01-05")).toBe(true);
    expect(occursOn(weekly, "2026-01-12")).toBe(true);
    expect(occursOn(weekly, "2026-01-13")).toBe(false);
    expect(occursOn(weekly, "2025-12-29")).toBe(false);
  });

  it("maintains a weekly cadence across leap dates and daylight-saving changes", () => {
    expect(occursOn(event("2024-02-22", "Weekly"), "2024-02-29")).toBe(true);
    expect(occursOn(event("2026-03-01", "Weekly"), "2026-03-15")).toBe(true);
  });

  it("skips absent days for monthly events instead of moving to month end", () => {
    const monthly = event("2026-01-31", "Monthly");
    expect(occursOn(monthly, "2026-01-31")).toBe(true);
    expect(occursOn(monthly, "2026-02-28")).toBe(false);
    expect(occursOn(monthly, "2026-04-30")).toBe(false);
    expect(occursOn(monthly, "2026-05-31")).toBe(true);
    expect(occursOn(monthly, "2025-12-31")).toBe(false);
  });

  it("allows February 29 only in leap years for a monthly event on the 29th", () => {
    const monthly = event("2023-01-29", "Monthly");
    expect(occursOn(monthly, "2023-02-28")).toBe(false);
    expect(occursOn(monthly, "2024-02-29")).toBe(true);
    expect(occursOn(monthly, "2025-02-29")).toBe(false);
    expect(occursOn(monthly, "2025-03-29")).toBe(true);
  });

  it("rejects malformed anchors and target dates without rolling them into another day", () => {
    expect(occursOn(event("2026-02-30", "Monthly"), "2026-03-02")).toBe(false);
    expect(occursOn(event("2026-01-31", "Monthly"), "2026-04-31")).toBe(false);
  });

  it("repeats quarterly across years and skips nonexistent anchor days", () => {
    const quarterly = event("2026-01-31", "Quarterly");
    expect(occursOn(quarterly, "2026-04-30")).toBe(false);
    expect(occursOn(quarterly, "2026-07-31")).toBe(true);
    expect(occursOn(quarterly, "2026-08-31")).toBe(false);
    expect(occursOn(quarterly, "2027-01-31")).toBe(true);
    expect(occursOn(quarterly, "2025-10-31")).toBe(false);
  });

  it("repeats yearly without moving leap-day anchors", () => {
    const yearly = event("2024-02-29", "Yearly");
    expect(occursOn(yearly, "2025-02-28")).toBe(false);
    expect(occursOn(yearly, "2028-02-29")).toBe(true);
    expect(occursOn(yearly, "2028-03-29")).toBe(false);
  });
});
