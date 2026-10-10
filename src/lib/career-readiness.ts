import { enlistedGrade, safeSourceUrl } from "./career-planning";
import { isProfessionalDate } from "../pages/professional-date";
import type { CareerRequirement, Profile } from "./types";

export const CAREER_REQUIREMENT_AREAS: CareerRequirement["area"][] = [
  "PME",
  "Training",
  "Certification",
  "Records",
  "Experience",
];
export const SOURCE_REVIEW_DAYS = 180;
export const RENEWAL_NOTICE_DAYS = 30;
export type RequirementScope =
  | "Applicable"
  | "Needs profile detail"
  | "Outside profile";

function normalized(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function daysBetween(from: string, to: string): number {
  return (
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    86_400_000
  );
}

/** Scope matches a saved profile; it does not establish official applicability. */
export function careerRequirementScope(
  requirement: CareerRequirement,
  profile: Profile,
): { scope: RequirementScope; missing: string[] } {
  if (
    (requirement.service !== "Any" &&
      requirement.service !== profile.service) ||
    (requirement.component !== "Any" &&
      requirement.component !== profile.component)
  )
    return { scope: "Outside profile", missing: [] };
  const missing: string[] = [];
  if (requirement.rank.trim()) {
    if (!profile.rank.trim()) missing.push("rank");
    else {
      const expected = enlistedGrade(requirement.rank);
      const actual = enlistedGrade(profile.rank);
      if (
        expected !== null && actual !== null
          ? expected !== actual
          : normalized(requirement.rank) !== normalized(profile.rank)
      )
        return { scope: "Outside profile", missing: [] };
    }
  }
  if (requirement.afsc.trim()) {
    if (!profile.afsc?.trim()) missing.push("AFSC or specialty");
    else if (normalized(requirement.afsc) !== normalized(profile.afsc))
      return { scope: "Outside profile", missing: [] };
  }
  return {
    scope: missing.length ? "Needs profile detail" : "Applicable",
    missing,
  };
}

export function blankCareerRequirement(
  profile: Profile,
): Omit<CareerRequirement, "id"> {
  return {
    title: "",
    area: "Training",
    status: "Planned",
    dueDate: "",
    completedDate: "",
    expiresDate: "",
    evidence: "",
    notes: "",
    sourceUrl: "",
    lastVerified: "",
    service: profile.service,
    component: profile.component,
    rank: profile.rank,
    afsc: profile.afsc || "",
  };
}

export function careerRequirementError(
  requirement: Omit<CareerRequirement, "id">,
  today: string,
): string {
  if (!requirement.title.trim()) return "Enter a qualification title.";
  for (const [label, value] of [
    ["Due date", requirement.dueDate],
    ["Completion date", requirement.completedDate],
    ["Expiry date", requirement.expiresDate],
    ["Source checked date", requirement.lastVerified],
  ]) {
    if (!isProfessionalDate(value, true))
      return `${label} must be a real calendar date, or left blank.`;
  }
  if (requirement.completedDate > today)
    return "Completion date must be on or before today.";
  if (requirement.lastVerified > today)
    return "Source checked date must be on or before today.";
  if (
    requirement.completedDate &&
    requirement.expiresDate &&
    requirement.expiresDate < requirement.completedDate
  )
    return "Expiry date must be on or after the completion date.";
  if (requirement.sourceUrl && !safeSourceUrl(requirement.sourceUrl))
    return "Use an HTTPS source URL without a username or password.";
  if (requirement.lastVerified && !requirement.sourceUrl)
    return "Add the source URL you checked, or clear its checked date.";
  return "";
}

export function careerRequirementReview(
  requirement: CareerRequirement,
  today: string,
) {
  const prompts: string[] = [];
  const expired = !!requirement.expiresDate && requirement.expiresDate < today;
  const renewalSoon =
    !!requirement.expiresDate &&
    !expired &&
    daysBetween(today, requirement.expiresDate) <= RENEWAL_NOTICE_DAYS;
  const overdue =
    requirement.status !== "Complete" &&
    !!requirement.dueDate &&
    requirement.dueDate < today;
  if (expired)
    prompts.push("The recorded expiry date has passed. Confirm renewal needs.");
  else if (renewalSoon)
    prompts.push(
      "The recorded expiry date is within 30 days. Plan a renewal review.",
    );
  if (overdue)
    prompts.push("This open qualification is past its recorded due date.");
  if (requirement.status === "Complete") {
    if (!requirement.evidence.trim())
      prompts.push("Add the evidence or record reference for this completion.");
    if (!requirement.completedDate)
      prompts.push("Record the actual completion date when known.");
  } else if (requirement.completedDate)
    prompts.push(
      "A completion date is recorded while the qualification is still open. Review its status.",
    );
  if (requirement.completedDate > today)
    prompts.push("The recorded completion date is in the future. Correct it.");
  if (
    requirement.completedDate &&
    requirement.expiresDate &&
    requirement.expiresDate < requirement.completedDate
  )
    prompts.push("The recorded expiry precedes completion. Review both dates.");
  if (!safeSourceUrl(requirement.sourceUrl) || !requirement.lastVerified)
    prompts.push(
      "Confirm applicability with your supervisor or servicing office and record the source you checked.",
    );
  else if (requirement.lastVerified > today)
    prompts.push("The source checked date is in the future. Correct it.");
  else if (daysBetween(requirement.lastVerified, today) >= SOURCE_REVIEW_DAYS)
    prompts.push(
      "The source was last checked at least 180 days ago. Consider reviewing it again.",
    );
  return {
    expired,
    renewalSoon,
    overdue,
    prompts,
    label: expired
      ? "Expiry passed"
      : renewalSoon
        ? "Renewal review"
        : overdue
          ? "Overdue"
          : requirement.status === "Complete"
            ? "Recorded complete"
            : requirement.status,
  };
}

export function careerReadinessSummary(
  requirements: CareerRequirement[],
  profile: Profile,
  today: string,
) {
  const scoped = requirements.filter(
    (item) => careerRequirementScope(item, profile).scope === "Applicable",
  );
  return {
    applicable: scoped.length,
    recordedComplete: scoped.filter((item) => item.status === "Complete")
      .length,
    renewalReviews: scoped.filter((item) => {
      const review = careerRequirementReview(item, today);
      return review.expired || review.renewalSoon;
    }).length,
    needsAttention: scoped.filter(
      (item) => careerRequirementReview(item, today).prompts.length > 0,
    ).length,
    needsProfile: requirements.filter(
      (item) =>
        careerRequirementScope(item, profile).scope === "Needs profile detail",
    ).length,
  };
}
