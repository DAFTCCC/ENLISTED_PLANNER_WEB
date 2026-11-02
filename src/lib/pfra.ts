import {
  PFRA_AGE_BANDS,
  PFRA_EVENT_CHARTS,
  PFRA_WALK_MAXIMUMS,
  PFRA_WHTR_CHART,
  type PfraAgeBand,
  type PfraEvent,
} from "./pfra-charts";

export type PfraChart = "M" | "F" | "AFSPECWAR/EOD";
export type PfraComponent = "cardio" | "strength" | "core";

export const PFRA_EVENTS: Record<
  PfraEvent,
  {
    label: string;
    component: PfraComponent;
    unit: "time" | "reps" | "shuttles";
    lowerIsBetter: boolean;
  }
> = {
  run2mile: { label: "2-mile run", component: "cardio", unit: "time", lowerIsBetter: true },
  hamr: { label: "20-meter HAMR", component: "cardio", unit: "shuttles", lowerIsBetter: false },
  pushup: { label: "Push-ups (1 minute)", component: "strength", unit: "reps", lowerIsBetter: false },
  handReleasePushup: { label: "Hand-release push-ups (2 minutes)", component: "strength", unit: "reps", lowerIsBetter: false },
  situp: { label: "Sit-ups (1 minute)", component: "core", unit: "reps", lowerIsBetter: false },
  reverseCrunch: { label: "Cross-leg reverse crunches (2 minutes)", component: "core", unit: "reps", lowerIsBetter: false },
  plank: { label: "Forearm plank", component: "core", unit: "time", lowerIsBetter: false },
};

export function ageBand(age: number): PfraAgeBand | null {
  if (!Number.isInteger(age) || age < 17 || age > 99) return null;
  if (age < 25) return "<25";
  if (age >= 60) return "60+";
  const start = Math.floor(age / 5) * 5;
  return PFRA_AGE_BANDS.find((band) => band === `${start}-${start + 4}`) ?? null;
}

/** Parses "m:ss" (or ":ss") into seconds; returns null if invalid. */
export function parseClock(value: string): number | null {
  const match = /^\s*(\d{0,3}):([0-5]\d)\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1] || 0) * 60 + Number(match[2]);
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface EventScore {
  points: number;
  /** False when the performance does not reach the chart's * minimum row. */
  metMinimum: boolean;
  minimum: number;
  /** The next better row, if any: what it takes to earn more points. */
  next: { points: number; threshold: number } | null;
}

function thresholds(event: PfraEvent, chart: PfraChart, age: number): number[] | null {
  const data = PFRA_EVENT_CHARTS[event];
  if (chart === "AFSPECWAR/EOD") return data.specialWarfare;
  const band = ageBand(age);
  return band ? (data.columns[`${band}|${chart}`] ?? null) : null;
}

/**
 * Scores one event: the points of the highest row whose standard the
 * performance meets. Performance below the * row earns 0 and fails the
 * component minimum.
 */
export function scoreEvent(
  event: PfraEvent,
  chart: PfraChart,
  age: number,
  performance: number,
): EventScore | null {
  if (!Number.isFinite(performance) || performance < 0) return null;
  const rows = thresholds(event, chart, age);
  if (!rows) return null;
  const { points } = PFRA_EVENT_CHARTS[event];
  const lower = PFRA_EVENTS[event].lowerIsBetter;
  const meets = (threshold: number) =>
    lower ? performance <= threshold : performance >= threshold;
  const index = rows.findIndex(meets);
  const minimum = rows[rows.length - 1];
  if (index === -1)
    return {
      points: 0,
      metMinimum: false,
      minimum,
      next: { points: points[points.length - 1], threshold: minimum },
    };
  // Skip rows with the same threshold so "next" is a real improvement.
  let better = index - 1;
  while (better >= 0 && rows[better] === rows[index]) better -= 1;
  return {
    points: points[index],
    metMinimum: true,
    minimum,
    next: better >= 0 ? { points: points[better], threshold: rows[better] } : null,
  };
}

export type WhtrRisk = "Low" | "Moderate" | "High";

/**
 * Waist-to-height ratio, truncated (not rounded) to two decimals as in the
 * chart's height-by-waist table, e.g. 29 in / 60.5 in = 0.479 -> 0.47.
 */
export function waistToHeightRatio(waistInches: number, heightInches: number): number | null {
  if (!(waistInches > 0) || !(heightInches > 0) || !Number.isFinite(waistInches / heightInches))
    return null;
  return Math.floor((waistInches / heightInches) * 100 + 1e-9) / 100;
}

export function scoreWaistToHeight(waistInches: number, heightInches: number): {
  ratio: number;
  points: number;
  risk: WhtrRisk;
} | null {
  const ratio = waistToHeightRatio(waistInches, heightInches);
  if (ratio === null) return null;
  const { points, ratios } = PFRA_WHTR_CHART;
  let index = ratios.findIndex((limit) => ratio <= limit + 1e-9);
  if (index === -1) index = ratios.length - 1;
  return {
    ratio,
    points: points[index],
    risk: ratio <= 0.49 + 1e-9 ? "Low" : ratio <= 0.54 + 1e-9 ? "Moderate" : "High",
  };
}

/** 2.0 km walk: pass/fail against the maximum time for age and sex. */
export function scoreWalk(chart: "M" | "F", age: number, seconds: number): {
  maximum: number;
  passed: boolean;
} | null {
  if (!Number.isInteger(age) || age < 17 || !(seconds > 0)) return null;
  const row = PFRA_WALK_MAXIMUMS.find((entry) => age <= entry.maxAge)!;
  return { maximum: row[chart], passed: seconds <= row[chart] };
}
