import { describe, expect, it } from "vitest";
import {
  ageBand,
  classifyAssessment,
  nextAssessmentMonths,
  parseClock,
  scoreEvent,
  scoreWaistToHeight,
  scoreWalk,
  waistToHeightRatio,
} from "./pfra";
import {
  PFRA_AGE_BANDS,
  PFRA_EVENT_CHARTS,
  type PfraEvent,
} from "./pfra-charts";

const clock = (value: string) => parseClock(value)!;

describe("PFRA chart data", () => {
  it("has every age and sex column, aligned with the points rows", () => {
    for (const [event, chart] of Object.entries(PFRA_EVENT_CHARTS)) {
      expect(Object.keys(chart.columns)).toHaveLength(18);
      for (const band of PFRA_AGE_BANDS)
        for (const sex of ["M", "F"])
          expect(chart.columns[`${band}|${sex}`], `${event} ${band} ${sex}`).toHaveLength(
            chart.points.length,
          );
      expect(chart.specialWarfare).toHaveLength(chart.points.length);
    }
  });

  it("only ever gets easier as points go down", () => {
    const lowerIsBetter = new Set<PfraEvent>(["run2mile"]);
    for (const [event, chart] of Object.entries(PFRA_EVENT_CHARTS) as Array<
      [PfraEvent, (typeof PFRA_EVENT_CHARTS)[PfraEvent]]
    >)
      for (const column of [...Object.values(chart.columns), chart.specialWarfare])
        for (let index = 1; index < column.length; index += 1)
          if (lowerIsBetter.has(event))
            expect(column[index]).toBeGreaterThan(column[index - 1]);
          else expect(column[index]).toBeLessThanOrEqual(column[index - 1]);
  });

  it("matches published minimums and maximums", () => {
    const run = PFRA_EVENT_CHARTS.run2mile.columns;
    expect(run["<25|M"].at(-1)).toBe(clock("19:45"));
    expect(run["60+|M"].at(-1)).toBe(clock("24:00"));
    expect(run["<25|F"][0]).toBe(clock("15:30"));
    expect(run["60+|F"].at(-1)).toBe(clock("29:40"));
    expect(PFRA_EVENT_CHARTS.hamr.columns["60+|M"].at(-1)).toBe(26);
    expect(PFRA_EVENT_CHARTS.hamr.columns["<25|M"][0]).toBe(87);
    expect(PFRA_EVENT_CHARTS.plank.columns["60+|M"].at(-1)).toBe(clock("0:55"));
  });
});

describe("PFRA scoring", () => {
  it("awards the highest row met for timed and counted events", () => {
    expect(scoreEvent("run2mile", "M", 22, clock("13:25"))?.points).toBe(50);
    expect(scoreEvent("run2mile", "M", 22, clock("13:26"))?.points).toBe(49.5);
    expect(scoreEvent("pushup", "M", 20, 65)?.points).toBe(14);
    expect(scoreEvent("plank", "F", 65, clock(":55"))?.points).toBe(3);
    expect(scoreEvent("hamr", "M", 47, 77)?.points).toBe(50);
  });

  it("checks the * minimum and gives 0 below it", () => {
    expect(scoreEvent("run2mile", "M", 24, clock("19:45"))).toMatchObject({
      points: 35,
      metMinimum: true,
    });
    expect(scoreEvent("run2mile", "M", 24, clock("19:46"))).toMatchObject({
      points: 0,
      metMinimum: false,
    });
  });

  it("keeps duplicated published thresholds and skips them for the next step", () => {
    const score = scoreEvent("pushup", "M", 32, 26);
    expect(score?.points).toBe(3);
    expect(score?.next).toEqual({ points: 3.5, threshold: 29 });
  });

  it("uses the single AFSPECWAR/EOD column regardless of age", () => {
    expect(scoreEvent("run2mile", "AFSPECWAR/EOD", 45, clock("17:15"))?.points).toBe(39);
    expect(scoreEvent("run2mile", "M", 22, clock("17:15"))?.points).toBe(38.5);
  });

  it("truncates the waist-to-height ratio like the chart's lookup table", () => {
    expect(waistToHeightRatio(29, 60.5)).toBe(0.47);
    expect(scoreWaistToHeight(36, 69)).toMatchObject({
      ratio: 0.52,
      points: 17,
      risk: "Moderate",
    });
    expect(scoreWaistToHeight(32, 58)).toMatchObject({ points: 12.5, risk: "High" });
    expect(scoreWaistToHeight(30, 66)).toMatchObject({ points: 20, risk: "Low" });
    expect(scoreWaistToHeight(44, 70)?.points).toBe(0);
    expect(scoreWaistToHeight(0, 70)).toBeNull();
  });

  it("scores the walk as pass/fail by age band", () => {
    expect(scoreWalk("M", 29, clock("16:16"))?.passed).toBe(true);
    expect(scoreWalk("M", 30, clock("16:19"))?.passed).toBe(false);
    expect(scoreWalk("F", 61, clock("18:53"))?.passed).toBe(true);
  });

  it("maps ages and rejects invalid input", () => {
    expect([ageBand(24), ageBand(25), ageBand(59), ageBand(60)]).toEqual([
      "<25",
      "25-29",
      "55-59",
      "60+",
    ]);
    expect(ageBand(16)).toBeNull();
    expect(parseClock("15:7")).toBeNull();
    expect(parseClock("15:60")).toBeNull();
    expect(scoreEvent("situp", "M", 16, 40)).toBeNull();
    expect(scoreEvent("situp", "M", 30, -1)).toBeNull();
  });
});

describe("AFMAN 36-2905 rules", () => {
  const male = (event: PfraEvent, age: number, value: number) =>
    scoreEvent(event, "M", age, value);
  const body = scoreWaistToHeight(33, 70);

  it("reproduces the manual's WHtR example and measurement rounding", () => {
    // Para 3.15.4.2: 39.5 / 72 = 0.5486, truncated to 0.54.
    expect(scoreWaistToHeight(39.5, 72)).toMatchObject({ ratio: 0.54, points: 15 });
    // Para 3.15.4.5 / 3.15.2.3: waist down to 1/2 inch, height to nearest 1/2 inch.
    expect(scoreWaistToHeight(33.9, 69.8)).toMatchObject({
      recordedWaist: 33.5,
      recordedHeight: 70,
    });
  });

  it("classifies Excellent, Satisfactory, and Unsatisfactory", () => {
    expect(
      classifyAssessment({
        cardio: male("run2mile", 27, clock("14:00")),
        walkPassed: null,
        strength: male("pushup", 27, 55),
        core: male("situp", 27, 52),
        body,
      }),
    ).toMatchObject({ composite: 94, category: "Excellent", reasons: [] });
    expect(
      classifyAssessment({
        cardio: male("run2mile", 22, clock("16:16")),
        walkPassed: null,
        strength: male("pushup", 22, 52),
        core: male("situp", 22, 48),
        body: scoreWaistToHeight(37, 70),
      }),
    ).toMatchObject({ composite: 79, category: "Satisfactory" });
  });

  it("fails any missed component minimum even with a high composite", () => {
    const result = classifyAssessment({
      cardio: male("run2mile", 22, clock("13:25")),
      walkPassed: null,
      strength: male("pushup", 22, 67),
      core: male("situp", 22, 20),
      body,
    });
    expect(result?.composite).toBe(85);
    expect(result?.category).toBe("Unsatisfactory");
    expect(result?.reasons).toContain("Core endurance is below the minimum.");
  });

  it("body composition has no minimum", () => {
    expect(
      classifyAssessment({
        cardio: male("run2mile", 22, clock("13:25")),
        walkPassed: null,
        strength: male("pushup", 22, 67),
        core: male("situp", 22, 58),
        body: scoreWaistToHeight(44, 70),
      }),
    ).toMatchObject({ composite: 80, category: "Satisfactory" });
  });

  it("flags the Tier 2 body fat assessment only above 0.55 when unsatisfactory", () => {
    const failing = {
      cardio: male("run2mile", 22, clock("19:45")),
      walkPassed: null,
      strength: male("pushup", 22, 30),
      core: male("situp", 22, 33),
    };
    expect(
      classifyAssessment({ ...failing, body: scoreWaistToHeight(42, 70) })
        ?.bodyFatAssessmentRequired,
    ).toBe(true);
    // 38.5 / 70 = 0.55 exactly is not above .55.
    expect(
      classifyAssessment({ ...failing, body: scoreWaistToHeight(38.5, 70) })
        ?.bodyFatAssessmentRequired,
    ).toBe(false);
  });

  it("treats the walk as pass/fail with an estimated composite and no Excellent", () => {
    const strong = {
      cardio: null,
      strength: male("pushup", 22, 67),
      core: male("situp", 22, 58),
      body,
    };
    expect(classifyAssessment({ ...strong, walkPassed: true })).toMatchObject({
      composite: 100,
      estimated: true,
      category: "Satisfactory",
    });
    expect(classifyAssessment({ ...strong, walkPassed: false })?.category).toBe(
      "Unsatisfactory",
    );
  });

  it("waits for every component and sets the next due date", () => {
    expect(
      classifyAssessment({
        cardio: null,
        walkPassed: null,
        strength: male("pushup", 22, 67),
        core: male("situp", 22, 58),
        body,
      }),
    ).toBeNull();
    expect(nextAssessmentMonths("Excellent", "Active Duty")).toBe(6);
    expect(nextAssessmentMonths("Satisfactory", "Guard")).toBe(12);
    expect(nextAssessmentMonths("Unsatisfactory", "Reserve")).toBe(3);
  });
});
