import { describe, expect, it } from "vitest";
import { blockError, durationLabel, totalPlannedMinutes } from "./time-blocks";
import type { TimeBlock } from "./types";

const existing: TimeBlock = {
  id: "existing",
  date: "2026-10-08",
  start: "09:00",
  end: "10:00",
  title: "Mission focus",
  category: "Duty",
  notes: "",
  completed: false,
};
const candidate = (overrides: Partial<TimeBlock> = {}): TimeBlock => ({
  ...existing,
  id: "new",
  title: "New plan",
  ...overrides,
});

describe("time block validation", () => {
  it.each([
    ["the same interval", "09:00", "10:00"],
    ["starting inside the existing block", "09:30", "10:30"],
    ["ending inside the existing block", "08:30", "09:30"],
    ["contained by the existing block", "09:15", "09:45"],
    ["containing the existing block", "08:00", "11:00"],
  ])(
    "rejects %s and identifies the conflicting plan",
    (_description, start, end) => {
      expect(blockError(candidate({ start, end }), [existing])).toMatch(
        /overlaps “Mission focus”/,
      );
    },
  );

  it.each([
    ["08:00", "09:00"],
    ["10:00", "11:00"],
  ])("accepts adjacent blocks at %s–%s", (start, end) => {
    expect(blockError(candidate({ start, end }), [existing])).toBeNull();
  });

  it("allows changing a block without conflicting against itself", () => {
    expect(
      blockError({ ...existing, start: "09:15", end: "10:15" }, [existing]),
    ).toBeNull();
  });

  it("ignores blocks on other dates, including completed blocks", () => {
    expect(
      blockError(candidate({ date: "2026-10-09" }), [existing]),
    ).toBeNull();
    expect(blockError(candidate(), [{ ...existing, completed: true }])).toMatch(
      /overlaps/,
    );
  });

  it.each([
    "2026-02-30",
    "2026-04-31",
    "2025-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "0000-01-01",
    "10/08/2026",
    "",
  ])("rejects an impossible or unsupported calendar date %s", (date) => {
    expect(blockError(candidate({ date }), [])).toBe("Choose a valid date.");
  });

  it("accepts a real leap date", () => {
    expect(blockError(candidate({ date: "2028-02-29" }), [])).toBeNull();
  });

  it.each([
    { start: "24:00", end: "24:00" },
    { start: "10:00", end: "09:59" },
    { start: "09:00", end: "09:00" },
    { start: "23:00", end: "01:00" },
  ])(
    "rejects zero, reversed, or overnight duration $start–$end",
    (interval) => {
      expect(blockError(candidate(interval), [])).toMatch(
        /End time must be after start time/,
      );
    },
  );

  it.each(["24:01", "25:00", "9:00", "09:60", ""])(
    "rejects invalid clock values %s",
    (start) => {
      expect(blockError(candidate({ start }), [])).toBe(
        "Choose valid start and end times.",
      );
    },
  );

  it("accepts midnight as the end of the current day", () => {
    expect(
      blockError(candidate({ start: "23:00", end: "24:00" }), []),
    ).toBeNull();
  });

  it("requires an actual title", () => {
    expect(blockError(candidate({ title: "   " }), [])).toBe(
      "Give your time block a title.",
    );
  });
});

describe("daily time summaries", () => {
  it("totals planned time across completed and uncompleted blocks and midnight", () => {
    const blocks = [
      existing,
      candidate({ start: "10:00", end: "10:30", completed: true }),
      candidate({ start: "23:00", end: "24:00" }),
    ];
    expect(totalPlannedMinutes(blocks)).toBe(150);
    expect(durationLabel(totalPlannedMinutes(blocks))).toBe("2h 30m");
    expect(durationLabel(totalPlannedMinutes([]))).toBe("0m");
    expect(durationLabel(1440)).toBe("24h");
  });
});
