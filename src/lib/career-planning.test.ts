import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  CAREER_PATHWAYS,
  careerEvidenceSummary,
  careerPlanReview,
  careerStageGuidance,
  careerTemplate,
  enlistedGrade,
  evaluationCheckpoints,
  referenceScod,
  safeSourceUrl,
  suggestedPathway,
} from "./career-planning";
import type { CareerPlan, Profile } from "./types";

const profile = (changes: Partial<Profile> = {}): Profile => ({
  ...defaultState().profile,
  rank: "SrA",
  ...changes,
});
const plan = (changes: Partial<CareerPlan> = {}): CareerPlan => {
  let count = 0;
  return {
    ...careerTemplate("WAPS", profile(), () => `step-${++count}`),
    id: "plan",
    ...changes,
  };
};

describe("career preparation rules", () => {
  it.each([
    ["E-5", 5],
    ["a1c", 3],
    ["Technical Sergeant", 6],
    ["Specialist 4", 4],
    ["Spc1", 1],
    ["CMSgt", 9],
    ["O-1", null],
    ["", null],
  ])(
    "recognizes grade %s without guessing unsupported ranks",
    (rank, expected) => expect(enlistedGrade(rank as string)).toBe(expected),
  );
  it.each([
    [profile({ rank: "AB" }), "Junior enlisted"],
    [profile({ rank: "A1C" }), "BTZ"],
    [profile({ rank: "SSgt" }), "WAPS"],
    [profile({ rank: "TSgt" }), "SNCO board"],
    [profile({ rank: "CMSgt" }), "SNCO board"],
    [profile({ component: "Reserve" }), "Component specific"],
    [profile({ component: "Guard" }), "Component specific"],
    [profile({ service: "Space Force", rank: "Spc3" }), "Guardian development"],
  ])("suggests %s preparation from stored profile", (value, expected) =>
    expect(suggestedPathway(value as Profile)).toBe(expected),
  );
  it("offers meaningful customizable steps for every pathway without claiming verification", () => {
    for (const pathway of CAREER_PATHWAYS) {
      let count = 0;
      const template = careerTemplate(
        pathway,
        profile(),
        () => `id-${++count}`,
      );
      expect(template.checklist.length).toBeGreaterThanOrEqual(5);
      expect(new Set(template.checklist.map((item) => item.id)).size).toBe(
        template.checklist.length,
      );
      expect(template.checklist.every((item) => !item.completed)).toBe(true);
      expect(template.lastVerified).toBe("");
      expect(template.dueDate).toBe("");
    }
  });
  it("treats chiefs as senior leaders and mentors rather than candidates for a higher enlisted grade", () => {
    expect(careerStageGuidance(profile({ rank: "CMSgt" }))).toContain(
      "highest enlisted grade",
    );
    expect(
      careerStageGuidance(profile({ rank: "E-9", service: "Space Force" })),
    ).toContain("mentor board candidates");
  });
  it("reports missing cycle, functional community, and verification from actual records", () => {
    const review = careerPlanReview(plan(), profile(), "2026-10-10");
    expect(review.gaps).toEqual(
      expect.arrayContaining([
        "Confirm and enter the unit or cycle suspense.",
        "Enter the promotion cycle you are preparing for.",
        "Record the applicable AFSC or functional community.",
        "Review current controlling guidance and record its source and checked date.",
      ]),
    );
    expect(review.nextStep).toBe(review.remaining[0].label);
    expect(review.completed).toBe(0);
  });
  it("flags open preparation marked ready, passed suspense, and service/component mismatch", () => {
    const review = careerPlanReview(
      plan({ dueDate: "2026-10-09", status: "Ready for review" }),
      profile({ service: "Space Force", component: "Reserve" }),
      "2026-10-10",
    );
    expect(review.overdue).toBe(true);
    expect(review.gaps.join(" ")).toContain("steps remain open");
    expect(review.gaps.join(" ")).toContain("Space Force");
    expect(review.gaps.join(" ")).toContain("component");
  });
  it("does not equate complete steps with promotion eligibility", () => {
    const value = plan({
      dueDate: "2027-03-01",
      cycle: "27E5",
      afsc: "test",
      lastVerified: "2026-10-10",
    });
    value.checklist.forEach((item) => {
      item.completed = true;
    });
    const review = careerPlanReview(value, profile(), "2026-10-10");
    expect(review.gaps).toEqual([]);
    expect(review.completed).toBe(value.checklist.length);
    expect(review.nextStep).toBe(
      "Ask your supervisor to review the completed preparation plan.",
    );
    expect(review).not.toHaveProperty("eligible");
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
    "not a url",
  ])("rejects unsafe source link %s", (value) =>
    expect(safeSourceUrl(value)).toBeNull(),
  );
  it("accepts HTTPS source references", () =>
    expect(safeSourceUrl("https://www.afpc.af.mil/Promotion/")).toBe(
      "https://www.afpc.af.mil/Promotion/",
    ));
  it("counts evidence only when the required stored fields are present", () => {
    const state = defaultState();
    state.captures = [
      {
        id: "capture",
        title: "Improved training",
        date: "2026-10-10",
        category: "Mission",
        context: "",
        actions: "Updated checklist",
        outcome: "Saved two hours",
        lessons: "",
        tags: [],
        impact: "More time on mission",
        mga: "Executing the Mission",
        alq: "Job proficiency",
      },
    ];
    expect(careerEvidenceSummary(state)).toMatchObject({
      captures: 1,
      measured: 1,
      aligned: 1,
      developmentOpen: 0,
    });
    state.captures[0].impact = "";
    expect(careerEvidenceSummary(state).measured).toBe(0);
  });
});

describe("evaluation calendar planning", () => {
  it.each([
    ["SrA", "2027-03-31"],
    ["SSgt", "2027-01-31"],
    ["TSgt", "2026-11-30"],
    ["MSgt", "2027-09-30"],
    ["SMSgt", "2027-07-31"],
    ["CMSgt", "2027-05-31"],
  ])(
    "marks %s closeout projection as an unverified PDF reference",
    (rank, expected) => {
      const result = referenceScod(profile({ rank }), "2026-10-10");
      expect(result?.date).toBe(expected);
      expect(result?.source).toBe("Estimate");
      expect(result?.sourceRef).toContain("2024");
      expect(result?.ruleVersion).toContain("not reverified");
    },
  );
  it("does not apply Air Force active-duty table to other components or unknown grades", () => {
    expect(
      referenceScod(profile({ component: "Guard" }), "2026-10-10"),
    ).toBeNull();
    expect(
      referenceScod(profile({ service: "Space Force" }), "2026-10-10"),
    ).toBeNull();
    expect(
      referenceScod(profile({ rank: "Unknown" }), "2026-10-10"),
    ).toBeNull();
    expect(referenceScod(profile({ rank: "SSgt" }), "9999-02-01")).toBeNull();
  });
  it("keeps confirmed closeout separate from estimated preparation dates across leap years", () => {
    expect(evaluationCheckpoints("2028-03-31")).toEqual([
      {
        title: "Evaluation: review goals and request feedback",
        date: "2027-10-03",
        source: "Estimate",
      },
      {
        title: "Evaluation: review accomplishments and records",
        date: "2028-01-01",
        source: "Estimate",
      },
      {
        title: "Evaluation: prepare evidence and confirm unit suspense",
        date: "2028-03-01",
        source: "Estimate",
      },
      {
        title: "Evaluation closeout",
        date: "2028-03-31",
        source: "User entered",
      },
    ]);
    expect(
      evaluationCheckpoints("2028-03-31", "Estimate").every(
        (item) => item.source === "Estimate",
      ),
    ).toBe(true);
  });
  it("skips offsets outside supported calendar years", () =>
    expect(evaluationCheckpoints("0001-01-01")).toEqual([
      {
        title: "Evaluation closeout",
        date: "0001-01-01",
        source: "User entered",
      },
    ]));
});
