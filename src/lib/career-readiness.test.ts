import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  blankCareerRequirement,
  careerReadinessSummary,
  careerRequirementError,
  careerRequirementReview,
  careerRequirementScope,
} from "./career-readiness";
import type { CareerRequirement, Profile } from "./types";

const profile = (changes: Partial<Profile> = {}): Profile => ({
  ...defaultState().profile,
  rank: "SSgt",
  afsc: "3F0X1",
  ...changes,
});
const requirement = (
  changes: Partial<CareerRequirement> = {},
): CareerRequirement => ({
  ...blankCareerRequirement(profile()),
  id: "qualification",
  title: "Complete the unit qualification",
  ...changes,
});

describe("qualification scope", () => {
  it("matches enlisted grade aliases without crossing recorded service or component", () => {
    expect(
      careerRequirementScope(requirement({ rank: "E-5" }), profile()).scope,
    ).toBe("Applicable");
    expect(
      careerRequirementScope(requirement({ rank: "Staff Sergeant" }), profile())
        .scope,
    ).toBe("Applicable");
    expect(
      careerRequirementScope(
        requirement(),
        profile({ service: "Space Force", rank: "Sgt" }),
      ).scope,
    ).toBe("Outside profile");
    expect(
      careerRequirementScope(requirement(), profile({ component: "Guard" }))
        .scope,
    ).toBe("Outside profile");
  });
  it("includes unscoped records without inventing missing profile values", () => {
    const result = careerRequirementScope(
      requirement({ service: "Any", component: "Any", rank: "", afsc: "" }),
      profile({ rank: "", afsc: "" }),
    );
    expect(result).toEqual({ scope: "Applicable", missing: [] });
  });
  it("reports missing grade and specialty instead of claiming a match", () => {
    expect(
      careerRequirementScope(requirement(), profile({ rank: "", afsc: "" })),
    ).toEqual({
      scope: "Needs profile detail",
      missing: ["rank", "AFSC or specialty"],
    });
    expect(
      careerRequirementScope(requirement(), profile({ rank: "TSgt", afsc: "" }))
        .scope,
    ).toBe("Outside profile");
  });
  it("matches exact specialty codes ignoring presentation but not skill-level differences or prefixes", () => {
    expect(
      careerRequirementScope(requirement(), profile({ afsc: "3f-0 x1" })).scope,
    ).toBe("Applicable");
    expect(
      careerRequirementScope(requirement(), profile({ afsc: "3F051" })).scope,
    ).toBe("Outside profile");
    expect(
      careerRequirementScope(requirement({ afsc: "3F" }), profile()).scope,
    ).toBe("Outside profile");
  });
  it("supports exact unrecognized rank names without treating them as official grades", () => {
    expect(
      careerRequirementScope(
        requirement({ rank: "Apprentice" }),
        profile({ rank: "apprentice" }),
      ).scope,
    ).toBe("Applicable");
    expect(
      careerRequirementScope(requirement({ rank: "Apprentice" }), profile())
        .scope,
    ).toBe("Outside profile");
  });
});

describe("recorded readiness reviews", () => {
  it("flags imported inconsistent dates and invalid source references for correction", () => {
    const review = careerRequirementReview(
      requirement({
        status: "Complete",
        completedDate: "2027-01-01",
        expiresDate: "2026-12-31",
        evidence: "Record",
        sourceUrl: "javascript:alert(1)",
        lastVerified: "2026-10-10",
      }),
      "2026-10-10",
    );
    expect(review.prompts.join(" ")).toContain(
      "completion date is in the future",
    );
    expect(review.prompts.join(" ")).toContain("expiry precedes completion");
    expect(review.prompts.join(" ")).toContain("record the source you checked");
  });
  it("distinguishes completion from expired currency and calls for renewal", () => {
    const review = careerRequirementReview(
      requirement({
        status: "Complete",
        completedDate: "2025-10-09",
        expiresDate: "2026-10-09",
        evidence: "Certificate record",
        sourceUrl: "https://example.com/policy",
        lastVerified: "2026-10-10",
      }),
      "2026-10-10",
    );
    expect(review.label).toBe("Expiry passed");
    expect(review.expired).toBe(true);
    expect(review.overdue).toBe(false);
    expect(review.prompts).toEqual([
      "The recorded expiry date has passed. Confirm renewal needs.",
    ]);
  });
  it("uses calendar days across leap dates and includes the expiry day", () => {
    const base = requirement({ expiresDate: "2028-03-30" });
    expect(careerRequirementReview(base, "2028-02-29").renewalSoon).toBe(true);
    expect(careerRequirementReview(base, "2028-02-28").renewalSoon).toBe(false);
    expect(careerRequirementReview(base, "2028-03-30")).toMatchObject({
      expired: false,
      renewalSoon: true,
    });
    expect(careerRequirementReview(base, "2028-03-31").expired).toBe(true);
  });
  it("does not count a due date as overdue before the next calendar day or after completion", () => {
    const base = requirement({ dueDate: "2026-10-10" });
    expect(careerRequirementReview(base, "2026-10-10").overdue).toBe(false);
    expect(careerRequirementReview(base, "2026-10-11").overdue).toBe(true);
    expect(
      careerRequirementReview({ ...base, status: "Complete" }, "2026-10-11")
        .overdue,
    ).toBe(false);
  });
  it("asks for completion evidence and actual dates without fabricating either", () => {
    const base = requirement({ status: "Complete" });
    const review = careerRequirementReview(base, "2026-10-10");
    expect(review.label).toBe("Recorded complete");
    expect(review.prompts.join(" ")).toContain("evidence");
    expect(review.prompts.join(" ")).toContain("actual completion date");
    expect(base.completedDate).toBe("");
    expect(base.evidence).toBe("");
  });
  it("marks stale source checks as review prompts without asserting a policy validity period", () => {
    const base = requirement({
      sourceUrl: "https://example.com",
      lastVerified: "2026-01-01",
    });
    expect(careerRequirementReview(base, "2026-06-29").prompts).not.toContain(
      "The source was last checked at least 180 days ago. Consider reviewing it again.",
    );
    expect(careerRequirementReview(base, "2026-06-30").prompts).toContain(
      "The source was last checked at least 180 days ago. Consider reviewing it again.",
    );
    expect(
      careerRequirementReview(
        { ...base, lastVerified: "2027-01-01" },
        "2026-10-10",
      ).prompts,
    ).toContain("The source checked date is in the future. Correct it.");
  });
  it("counts only matched scope and keeps recorded completion separate from renewal needs", () => {
    const values = [
      requirement({
        id: "complete",
        status: "Complete",
        evidence: "Record",
        completedDate: "2025-10-01",
        expiresDate: "2026-10-01",
        sourceUrl: "https://example.com",
        lastVerified: "2026-10-10",
      }),
      requirement({ id: "other", service: "Space Force" }),
      requirement({ id: "unknown", afsc: "" }),
    ];
    const summary = careerReadinessSummary(
      values,
      profile({ afsc: "" }),
      "2026-10-10",
    );
    expect(summary).toEqual({
      applicable: 1,
      recordedComplete: 0,
      renewalReviews: 0,
      needsAttention: 1,
      needsProfile: 1,
    });
    expect(
      careerReadinessSummary(values, profile(), "2026-10-10"),
    ).toMatchObject({ applicable: 2, recordedComplete: 1, renewalReviews: 1 });
  });
});

describe("qualification edits", () => {
  it("copies profile scope into a blank draft without inventing requirements, dates, or evidence", () => {
    expect(blankCareerRequirement(profile())).toMatchObject({
      service: "Air Force",
      component: "Active Duty",
      rank: "SSgt",
      afsc: "3F0X1",
      title: "",
      status: "Planned",
      completedDate: "",
      lastVerified: "",
      sourceUrl: "",
      evidence: "",
    });
  });
  it("rejects impossible, future historical, and inconsistent expiry dates", () => {
    expect(
      careerRequirementError(
        requirement({ completedDate: "2026-02-30" }),
        "2026-10-10",
      ),
    ).toContain("real calendar date");
    expect(
      careerRequirementError(
        requirement({ completedDate: "2026-10-11" }),
        "2026-10-10",
      ),
    ).toContain("Completion date");
    expect(
      careerRequirementError(
        requirement({ lastVerified: "2026-10-11" }),
        "2026-10-10",
      ),
    ).toContain("Source checked date");
    expect(
      careerRequirementError(
        requirement({ completedDate: "2026-10-10", expiresDate: "2026-10-09" }),
        "2026-10-10",
      ),
    ).toContain("Expiry date");
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
  ])("rejects unsafe source %s", (sourceUrl) => {
    expect(
      careerRequirementError(requirement({ sourceUrl }), "2026-10-10"),
    ).toContain("HTTPS");
  });
  it("requires a source for a checked date but permits honest incomplete records", () => {
    expect(
      careerRequirementError(
        requirement({ lastVerified: "2026-10-10" }),
        "2026-10-10",
      ),
    ).toContain("source URL");
    expect(
      careerRequirementError(requirement({ status: "Complete" }), "2026-10-10"),
    ).toBe("");
    expect(
      careerRequirementError(
        requirement({ completedDate: "0001-01-01", expiresDate: "9999-12-31" }),
        "2026-10-10",
      ),
    ).toBe("");
  });
});
