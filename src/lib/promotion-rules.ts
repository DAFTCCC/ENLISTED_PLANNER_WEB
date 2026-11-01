import type { Profile } from "./types";

/**
 * Versioned, sourced minimum promotion requirements for Air Force active-duty
 * enlisted members. Each rule names its governing reference and how it was
 * checked so outdated rules are visible instead of silently trusted.
 *
 * Update procedure: confirm each value against the current DAFI 36-2502 (and
 * any guidance memorandum) on e-Publishing, then change `reviewedOn`, the
 * rule's `source`, and the ruleset `id`.
 */

export type Grade =
  | "AB"
  | "Amn"
  | "A1C"
  | "SrA"
  | "SSgt"
  | "TSgt"
  | "MSgt"
  | "SMSgt"
  | "CMSgt";

export interface RuleSource {
  reference: string;
  /** Date of the governing document or change, as published. */
  documentDate: string;
  url: string;
  /** "official" = read in the governing document; "secondary" = taken from a reference summary and not yet confirmed in the document. */
  confidence: "official" | "secondary";
}

export interface GradeRule {
  from: Grade;
  to: Grade;
  toTitle: string;
  method: "Time-based" | "WAPS" | "SNCO evaluation board";
  minTigMonths: number;
  minTisMonths: number;
  requirements: string[];
  pecd?: string;
  promotionCycle?: string;
  source: RuleSource;
}

const dafi = "https://static.e-publishing.af.mil/production/1/af_a1/publication/dafi36-2502/dafi36-2502.pdf";

const table21: RuleSource = {
  reference:
    "DAFI 36-2502, Table 2.1 (minimum eligibility) and Table 1.4 (PECD and cycle), as replaced by DAFGM 2023-01",
  documentDate: "2023-05-04",
  url: dafi,
  confidence: "official",
};

const juniorTime: RuleSource = {
  reference:
    "DAFI 36-2502, para 2.1, as summarized in the 2026 USAF Digital Planner (p. 84)",
  documentDate: "2021-04-16",
  url: dafi,
  confidence: "secondary",
};

export const PROMOTION_RULESET = {
  id: "usaf-active-enlisted-2026-11-01",
  service: "Air Force" as const,
  component: "Active Duty" as const,
  reviewedOn: "2026-11-01",
  computationNote:
    "Per DAFI 36-2502 Table 2.1, time in grade is computed on the first day of the month before the month promotions are made, and time in service on the first day of the last month of the promotion cycle. Dates here show when you reach each minimum; whether you are eligible for a specific cycle depends on those computation dates and your promotion eligibility status.",
  rules: [
    {
      from: "AB",
      to: "Amn",
      toTitle: "Airman",
      method: "Time-based",
      minTigMonths: 6,
      minTisMonths: 0,
      requirements: ["Promotion eligibility status maintained"],
      source: juniorTime,
    },
    {
      from: "Amn",
      to: "A1C",
      toTitle: "Airman First Class",
      method: "Time-based",
      minTigMonths: 10,
      minTisMonths: 0,
      requirements: [
        "Promotion eligibility status maintained",
        "Six-year enlistees are promoted to A1C after technical training or 20 weeks of it, whichever comes first",
      ],
      source: juniorTime,
    },
    {
      from: "SrA",
      to: "SSgt",
      toTitle: "Staff Sergeant",
      method: "WAPS",
      minTigMonths: 6,
      minTisMonths: 36,
      requirements: ["5-skill level", "Enlisted PME in residence (see Table 2.1, Note 9)"],
      pecd: "31 March",
      promotionCycle: "1 September through 1 August",
      source: table21,
    },
    {
      from: "SSgt",
      to: "TSgt",
      toTitle: "Technical Sergeant",
      method: "WAPS",
      minTigMonths: 23,
      minTisMonths: 60,
      requirements: ["7-skill level"],
      pecd: "31 January",
      promotionCycle: "1 August through 1 July",
      source: table21,
    },
    {
      from: "TSgt",
      to: "MSgt",
      toTitle: "Master Sergeant",
      method: "SNCO evaluation board",
      minTigMonths: 24,
      minTisMonths: 96,
      requirements: ["7-skill level", "Enlisted PME in residence (see Table 2.1, Note 9)"],
      pecd: "30 November",
      promotionCycle: "1 August through 1 July",
      source: table21,
    },
    {
      from: "MSgt",
      to: "SMSgt",
      toTitle: "Senior Master Sergeant",
      method: "SNCO evaluation board",
      minTigMonths: 20,
      minTisMonths: 132,
      requirements: [
        "7-skill level",
        "8 years cumulative enlisted service",
        "Associate's degree or higher",
      ],
      pecd: "30 September",
      promotionCycle: "1 April through 1 March",
      source: table21,
    },
    {
      from: "SMSgt",
      to: "CMSgt",
      toTitle: "Chief Master Sergeant",
      method: "SNCO evaluation board",
      minTigMonths: 21,
      minTisMonths: 168,
      requirements: [
        "9-skill level",
        "10 years cumulative enlisted service",
        "Associate's degree or higher",
      ],
      pecd: "31 July",
      promotionCycle: "1 January through 1 December",
      source: table21,
    },
  ] as GradeRule[],
};

const aliases: Record<string, Grade> = {
  AB: "AB",
  "E-1": "AB",
  E1: "AB",
  "AIRMAN BASIC": "AB",
  AMN: "Amn",
  "E-2": "Amn",
  E2: "Amn",
  AIRMAN: "Amn",
  A1C: "A1C",
  "E-3": "A1C",
  E3: "A1C",
  "AIRMAN FIRST CLASS": "A1C",
  SRA: "SrA",
  "E-4": "SrA",
  E4: "SrA",
  "SENIOR AIRMAN": "SrA",
  SSGT: "SSgt",
  "E-5": "SSgt",
  E5: "SSgt",
  "STAFF SERGEANT": "SSgt",
  TSGT: "TSgt",
  "E-6": "TSgt",
  E6: "TSgt",
  "TECHNICAL SERGEANT": "TSgt",
  MSGT: "MSgt",
  "E-7": "MSgt",
  E7: "MSgt",
  "MASTER SERGEANT": "MSgt",
  SMSGT: "SMSgt",
  "E-8": "SMSgt",
  E8: "SMSgt",
  "SENIOR MASTER SERGEANT": "SMSgt",
  CMSGT: "CMSgt",
  "E-9": "CMSgt",
  E9: "CMSgt",
  "CHIEF MASTER SERGEANT": "CMSgt",
};

export function normalizeGrade(rank: unknown): Grade | null {
  if (typeof rank !== "string") return null;
  return aliases[rank.trim().toUpperCase()] ?? null;
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Calendar-month addition that clamps to the last day of short months. */
export function addCalendarMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const absolute = year * 12 + month - 1 + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export interface GradeMilestones {
  rule: GradeRule;
  tigDate: string;
  tisDate: string | null;
  bothMinimumsDate: string;
  rulesetId: string;
  reviewedOn: string;
  computationNote: string;
}

/**
 * Dates a member reaches the minimum time in grade and time in service for the
 * next grade. A1C is covered by getPromotionEstimate; CMSgt has no next grade.
 * Returns null outside Air Force active duty or without valid dates.
 */
export function getGradeMilestones(
  profile: Profile | null | undefined,
): GradeMilestones | null {
  if (
    !profile ||
    profile.service !== PROMOTION_RULESET.service ||
    profile.component !== PROMOTION_RULESET.component
  )
    return null;
  const grade = normalizeGrade(profile.rank);
  const rule = PROMOTION_RULESET.rules.find((entry) => entry.from === grade);
  if (!rule || !validDate(profile.dateOfRank)) return null;
  const tigDate = addCalendarMonths(profile.dateOfRank, rule.minTigMonths);
  let tisDate: string | null = null;
  if (rule.minTisMonths > 0) {
    if (!validDate(profile.dateOfEntry) || profile.dateOfRank < profile.dateOfEntry)
      return null;
    tisDate = addCalendarMonths(profile.dateOfEntry, rule.minTisMonths);
  }
  return {
    rule,
    tigDate,
    tisDate,
    bothMinimumsDate: tisDate && tisDate > tigDate ? tisDate : tigDate,
    rulesetId: PROMOTION_RULESET.id,
    reviewedOn: PROMOTION_RULESET.reviewedOn,
    computationNote: PROMOTION_RULESET.computationNote,
  };
}

/** Source for the existing A1C to SrA estimate. */
export const SENIOR_AIRMAN_SOURCE: RuleSource = {
  reference:
    "DAFI 36-2502, para 2.2.1 (SrA phase points) and para 2.3.1 (BTZ six months before the fully qualified phase point)",
  documentDate: "2021-04-16",
  url: dafi,
  confidence: "secondary",
};
