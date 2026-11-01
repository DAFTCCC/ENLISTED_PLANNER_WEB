import { describe, expect, it } from "vitest";
import {
  PROMOTION_RULESET,
  addCalendarMonths,
  getGradeMilestones,
  normalizeGrade,
} from "./promotion-rules";
import type { Profile } from "./types";

const profile = (overrides: Partial<Profile>): Profile => ({
  name: "",
  service: "Air Force",
  component: "Active Duty",
  rank: "SrA",
  dateOfRank: "2024-03-31",
  dateOfEntry: "2022-01-15",
  role: "Individual",
  onboarded: true,
  ...overrides,
});

describe("sourced promotion rules", () => {
  it("every rule names its source, date, and confidence", () => {
    for (const rule of PROMOTION_RULESET.rules) {
      expect(rule.source.reference).toMatch(/DAFI 36-2502/);
      expect(rule.source.url).toMatch(/^https:\/\/static\.e-publishing\.af\.mil\//);
      expect(rule.source.documentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["official", "secondary"]).toContain(rule.source.confidence);
    }
  });

  it("matches DAFI 36-2502 Table 2.1 minimums for SSgt through CMSgt", () => {
    const minimums = Object.fromEntries(
      PROMOTION_RULESET.rules.map((rule) => [
        rule.to,
        [rule.minTigMonths, rule.minTisMonths / 12],
      ]),
    );
    expect(minimums).toMatchObject({
      SSgt: [6, 3],
      TSgt: [23, 5],
      MSgt: [24, 8],
      SMSgt: [20, 11],
      CMSgt: [21, 14],
    });
  });

  it("returns the later of the TIG and TIS dates", () => {
    const result = getGradeMilestones(profile({}));
    expect(result?.rule.to).toBe("SSgt");
    expect(result?.tigDate).toBe("2024-09-30");
    expect(result?.tisDate).toBe("2025-01-15");
    expect(result?.bothMinimumsDate).toBe("2025-01-15");
  });

  it("handles time-only junior grades and rank aliases", () => {
    const result = getGradeMilestones(
      profile({ rank: "ab", dateOfRank: "2026-08-31", dateOfEntry: "2026-08-31" }),
    );
    expect(result?.rule.to).toBe("Amn");
    expect(result?.tisDate).toBeNull();
    expect(result?.tigDate).toBe("2027-02-28");
    expect(normalizeGrade("E-8")).toBe("SMSgt");
    expect(normalizeGrade("Chief Master Sergeant")).toBe("CMSgt");
  });

  it("does not guess outside its scope", () => {
    expect(getGradeMilestones(profile({ rank: "A1C" }))).toBeNull();
    expect(getGradeMilestones(profile({ rank: "CMSgt" }))).toBeNull();
    expect(getGradeMilestones(profile({ service: "Space Force" }))).toBeNull();
    expect(getGradeMilestones(profile({ component: "Reserve" }))).toBeNull();
    expect(getGradeMilestones(profile({ dateOfRank: "2024-02-30" }))).toBeNull();
    expect(
      getGradeMilestones(profile({ dateOfRank: "2021-01-01" })),
    ).toBeNull();
  });

  it("clamps month arithmetic to short months", () => {
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2023-01-31", 1)).toBe("2023-02-28");
  });
});
