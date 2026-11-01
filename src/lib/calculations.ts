import type { Budget, Fitness, Profile } from "./types";

export interface PromotionEstimate {
  standardDate: string;
  btzDate: string;
  assumptions: string[];
  ruleVersion: string;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  )
    return null;
  return { year, month, day };
}

function addMonths(date: CalendarDate, months: number): string | null {
  const absoluteMonth = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  if (year < 1 || year > 9999) return null;
  const day = Math.min(date.day, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Planning estimate for Air Force active-duty A1C only. This does not determine
 * official eligibility, selection, or a promotion effective date.
 */
export function getPromotionEstimate(
  profile: Profile | null | undefined,
): PromotionEstimate | null {
  if (
    !profile ||
    profile.service !== "Air Force" ||
    profile.component !== "Active Duty"
  )
    return null;
  const rank =
    typeof profile.rank === "string" ? profile.rank.trim().toUpperCase() : "";
  if (!["A1C", "E3", "E-3", "AIRMAN FIRST CLASS"].includes(rank)) return null;

  const entry = parseCalendarDate(profile.dateOfEntry);
  const rankDate = parseCalendarDate(profile.dateOfRank);
  if (!entry || !rankDate || profile.dateOfRank < profile.dateOfEntry)
    return null;

  const timeInServiceDate = addMonths(entry, 36);
  const timeInGradeDate = addMonths(rankDate, 20);
  const alternateTimeInGradeDate = addMonths(rankDate, 28);
  if (!timeInServiceDate || !timeInGradeDate || !alternateTimeInGradeDate)
    return null;

  // The first route requires both thresholds; the alternate route requires 28 months TIG.
  const combinedThresholdDate =
    timeInServiceDate > timeInGradeDate ? timeInServiceDate : timeInGradeDate;
  const standardDate =
    combinedThresholdDate < alternateTimeInGradeDate
      ? combinedThresholdDate
      : alternateTimeInGradeDate;
  const standard = parseCalendarDate(standardDate);
  const btzDate = standard && addMonths(standard, -6);
  if (!btzDate) return null;

  return {
    standardDate,
    btzDate,
    ruleVersion: "Air Force active-duty A1C planning assumptions — 2026-10-08",
    assumptions: [
      "Standard estimate: the earlier of 36 months time in service AND 20 months time in grade, or 28 months time in grade.",
      "Below-the-zone (BTZ) planning date is six months before the standard estimate; selection is not guaranteed.",
      "Calendar-month arithmetic clamps dates to the final day of the target month when needed.",
      "Verify current official Air Force rules and your eligibility with your personnel office. This dated planning estimate does not account for individual eligibility restrictions or approval requirements.",
    ],
  };
}

function nonnegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Expenses exclude savings; remaining subtracts both expenses and savings. */
export function calculateBudget(budget: Budget | null | undefined): {
  expenses: number;
  remaining: number;
  savingsRate: number;
} {
  const income = nonnegative(budget?.income);
  const savings = nonnegative(budget?.savings);
  const expenses = finite(
    [
      budget?.housing,
      budget?.transport,
      budget?.food,
      budget?.insurance,
      budget?.debt,
      budget?.other,
    ].reduce<number>((total, value) => total + nonnegative(value), 0),
  );
  return {
    expenses,
    remaining: finite(income - expenses - savings),
    savingsRate: income > 0 ? finite((savings / income) * 100) : 0,
  };
}

/**
 * Component maximums for the Physical Fitness Assessment in effect July 1,
 * 2026: cardio 50, waist-to-height 20, strength 15, core 15.
 * Source: https://www.af.mil/Fitness/ (reviewed 2026-11-01).
 */
export const FITNESS_COMPONENT_MAXIMUMS = {
  cardioScore: 50,
  bodyCompositionScore: 20,
  strengthScore: 15,
  coreScore: 15,
} as const;
export const FITNESS_SCALE_SOURCE = {
  title: "Department of the Air Force, Culture of Fitness",
  url: "https://www.af.mil/Fitness/",
  effectiveDate: "2026-07-01",
  reviewedOn: "2026-11-01",
};

/** Scores are user-entered component points, not an official fitness conversion. */
export function calculateFitness(fitness: Fitness | null | undefined): {
  paceSeconds: number;
  goalPaceSeconds: number;
  totalScore: number;
  /** True when a saved entry exceeds a current maximum (from the old 60/20/20 scale). */
  exceedsCurrentScale: boolean;
} {
  const distance = nonnegative(fitness?.distance);
  const minutes = nonnegative(fitness?.minutes);
  const seconds = nonnegative(fitness?.seconds);
  const goalMinutes = nonnegative(fitness?.goalMinutes);
  const durationIsValid =
    fitness != null &&
    fitness.minutes === minutes &&
    fitness.seconds === seconds;
  return {
    paceSeconds:
      distance > 0 && durationIsValid
        ? finite((minutes * 60 + seconds) / distance)
        : 0,
    goalPaceSeconds: distance > 0 ? finite((goalMinutes * 60) / distance) : 0,
    totalScore: (
      Object.keys(FITNESS_COMPONENT_MAXIMUMS) as Array<
        keyof typeof FITNESS_COMPONENT_MAXIMUMS
      >
    ).reduce(
      (total, key) =>
        total +
        Math.min(FITNESS_COMPONENT_MAXIMUMS[key], nonnegative(fitness?.[key])),
      0,
    ),
    exceedsCurrentScale: (
      Object.keys(FITNESS_COMPONENT_MAXIMUMS) as Array<
        keyof typeof FITNESS_COMPONENT_MAXIMUMS
      >
    ).some(
      (key) => nonnegative(fitness?.[key]) > FITNESS_COMPONENT_MAXIMUMS[key],
    ),
  };
}
