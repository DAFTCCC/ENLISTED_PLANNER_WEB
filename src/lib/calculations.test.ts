import { describe, expect, it } from "vitest";
import {
  calculateBudget,
  calculateFitness,
  getPromotionEstimate,
} from "./calculations";
import type { Budget, Fitness, Profile } from "./types";

const profile: Profile = {
  name: "Planner user",
  service: "Air Force",
  component: "Active Duty",
  rank: "A1C",
  dateOfEntry: "2023-01-15",
  dateOfRank: "2023-11-15",
  role: "Individual",
  onboarded: true,
};

describe("getPromotionEstimate", () => {
  it("uses the earlier route when 28 months in grade comes before 36 months in service", () => {
    const estimate = getPromotionEstimate({
      ...profile,
      dateOfRank: "2023-06-15",
    });
    expect(estimate?.standardDate).toBe("2025-10-15");
    expect(estimate?.btzDate).toBe("2025-04-15");
  });

  it("requires both time-in-service and time-in-grade thresholds for the combined route", () => {
    const estimate = getPromotionEstimate({
      ...profile,
      dateOfRank: "2025-01-15",
    });
    expect(estimate?.standardDate).toBe("2026-09-15");
    expect(estimate?.btzDate).toBe("2026-03-15");
  });

  it("uses the service threshold when it is later than the 20-month grade threshold", () => {
    expect(getPromotionEstimate(profile)?.standardDate).toBe("2026-01-15");
  });

  it("clamps month-end dates without rolling into the following month", () => {
    const estimate = getPromotionEstimate({
      ...profile,
      dateOfEntry: "2023-10-31",
      dateOfRank: "2023-10-31",
    });
    expect(estimate?.standardDate).toBe("2026-02-28");
    expect(estimate?.btzDate).toBe("2025-08-28");
  });

  it("handles leap-day service dates using calendar months", () => {
    const estimate = getPromotionEstimate({
      ...profile,
      dateOfEntry: "2024-02-29",
      dateOfRank: "2025-01-01",
    });
    expect(estimate?.standardDate).toBe("2027-02-28");
    expect(estimate?.btzDate).toBe("2026-08-28");
  });

  it.each(["A1C", "E3", "E-3", "Airman First Class", " a1c "])(
    "supports the A1C alias %s",
    (rank) => {
      expect(getPromotionEstimate({ ...profile, rank })).not.toBeNull();
    },
  );

  it.each([
    { service: "Space Force" as const },
    { component: "Guard" as const },
    { component: "Reserve" as const },
    { rank: "SrA" },
    { rank: "A1C trainee" },
    { rank: "" },
  ])(
    "does not invent promotion policies for unsupported profiles: %o",
    (patch) => {
      expect(getPromotionEstimate({ ...profile, ...patch })).toBeNull();
    },
  );

  it.each([
    "",
    "2023-02-29",
    "2023-04-31",
    "2023-13-01",
    "2023-1-15",
    "2023-01-15T00:00:00Z",
  ])("rejects invalid dates: %s", (dateOfEntry) => {
    expect(getPromotionEstimate({ ...profile, dateOfEntry })).toBeNull();
  });

  it("rejects missing profiles, reversed chronology, and dates outside representable output years", () => {
    expect(getPromotionEstimate(null)).toBeNull();
    expect(getPromotionEstimate(undefined)).toBeNull();
    expect(
      getPromotionEstimate({ ...profile, dateOfRank: "2022-01-01" }),
    ).toBeNull();
    expect(
      getPromotionEstimate({
        ...profile,
        dateOfEntry: "9999-01-01",
        dateOfRank: "9999-01-01",
      }),
    ).toBeNull();
  });

  it("includes dated assumptions and an explicit official-eligibility verification reminder", () => {
    const estimate = getPromotionEstimate(profile);
    expect(estimate?.ruleVersion).toContain("2026-10-08");
    expect(estimate?.assumptions.join(" ")).toMatch(
      /Verify current official Air Force rules/,
    );
    expect(estimate?.assumptions.join(" ")).toMatch(
      /selection is not guaranteed/,
    );
  });
});

const budget: Budget = {
  income: 4000,
  housing: 1000,
  transport: 300,
  food: 400,
  insurance: 100,
  debt: 200,
  savings: 600,
  other: 150,
};

describe("calculateBudget", () => {
  it("keeps savings separate from expenses and subtracts both from income", () => {
    expect(calculateBudget(budget)).toEqual({
      expenses: 2150,
      remaining: 1250,
      savingsRate: 15,
    });
  });

  it("shows a shortfall and savings percentages above 100 without hiding them", () => {
    const result = calculateBudget({ ...budget, income: 500, savings: 600 });
    expect(result.remaining).toBe(-2250);
    expect(result.savingsRate).toBe(120);
  });

  it("handles zero income and invalid entries without NaN or infinity", () => {
    expect(
      calculateBudget({
        ...budget,
        income: 0,
        housing: NaN,
        transport: Infinity,
        food: -1,
      }),
    ).toEqual({ expenses: 450, remaining: -1050, savingsRate: 0 });
    expect(calculateBudget(undefined)).toEqual({
      expenses: 0,
      remaining: 0,
      savingsRate: 0,
    });
  });
});

const fitness: Fitness = {
  distance: 1.5,
  minutes: 12,
  seconds: 30,
  goalMinutes: 12,
  cardioScore: 52,
  strengthScore: 17,
  coreScore: 18,
};

describe("calculateFitness", () => {
  it("calculates seconds per distance unit for the run and goal", () => {
    expect(calculateFitness(fitness)).toEqual({
      paceSeconds: 500,
      goalPaceSeconds: 480,
      totalScore: 87,
    });
  });

  it("sums user-entered scores while enforcing the 60/20/20 component limits", () => {
    expect(
      calculateFitness({
        ...fitness,
        cardioScore: 80,
        strengthScore: 25,
        coreScore: 23,
      }).totalScore,
    ).toBe(100);
    expect(
      calculateFitness({
        ...fitness,
        cardioScore: -1,
        strengthScore: NaN,
        coreScore: Infinity,
      }).totalScore,
    ).toBe(0);
  });

  it.each([0, -1, NaN, Infinity])(
    "safely handles invalid or zero distance: %s",
    (distance) => {
      const result = calculateFitness({ ...fitness, distance });
      expect(result.paceSeconds).toBe(0);
      expect(result.goalPaceSeconds).toBe(0);
    },
  );

  it("safely handles invalid durations and a missing fitness record", () => {
    expect(calculateFitness({ ...fitness, minutes: -1 }).paceSeconds).toBe(0);
    expect(calculateFitness({ ...fitness, seconds: NaN }).paceSeconds).toBe(0);
    expect(
      calculateFitness({ ...fitness, goalMinutes: Infinity }).goalPaceSeconds,
    ).toBe(0);
    expect(calculateFitness(null)).toEqual({
      paceSeconds: 0,
      goalPaceSeconds: 0,
      totalScore: 0,
    });
  });
});
