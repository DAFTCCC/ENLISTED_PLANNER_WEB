import { addDays } from "./dates";
import type { CareerPlan, PlannerState, Profile } from "./types";

export const CAREER_RULE_VERSION = "Career preparation templates — 2026-10-10";
export const CAREER_SOURCES = {
  promotions: "https://www.afpc.af.mil/Promotion/",
  myFSS: "https://myfss.us.af.mil/",
  publications: "https://www.e-publishing.af.mil/",
  evaluation: "https://www.afpc.af.mil/Evaluation/",
  guardian: "https://www.spaceforce.mil/",
};
export const CAREER_PATHWAYS: CareerPlan["pathway"][] = [
  "Junior enlisted",
  "BTZ",
  "WAPS",
  "SNCO board",
  "Guardian development",
  "Component specific",
];

/** Grade aliases are used to suggest preparation, never to certify eligibility. */
export function enlistedGrade(rank: string): number | null {
  const normalized = rank.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, number> = {
    AB: 1,
    AIRMANBASIC: 1,
    AMN: 2,
    AIRMAN: 2,
    A1C: 3,
    AIRMANFIRSTCLASS: 3,
    SRA: 4,
    SENIORAIRMAN: 4,
    SSGT: 5,
    STAFFSERGEANT: 5,
    SGT: 5,
    SERGEANT: 5,
    TSGT: 6,
    TECHNICALSERGEANT: 6,
    MSGT: 7,
    MASTERSERGEANT: 7,
    SMSGT: 8,
    SENIORMASTERSERGEANT: 8,
    CMSGT: 9,
    CHIEFMASTERSERGEANT: 9,
    SPC1: 1,
    SPECIALIST1: 1,
    SPECIALISTONE: 1,
    SPC2: 2,
    SPECIALIST2: 2,
    SPECIALISTTWO: 2,
    SPC3: 3,
    SPECIALIST3: 3,
    SPECIALISTTHREE: 3,
    SPC4: 4,
    SPECIALIST4: 4,
    SPECIALISTFOUR: 4,
  };
  if (/^E[1-9]$/.test(normalized)) return Number(normalized[1]);
  return aliases[normalized] ?? null;
}

export function suggestedPathway(profile: Profile): CareerPlan["pathway"] {
  if (profile.service === "Space Force") return "Guardian development";
  if (profile.component !== "Active Duty") return "Component specific";
  const grade = enlistedGrade(profile.rank);
  if (grade === 3) return "BTZ";
  if (grade !== null && grade <= 3) return "Junior enlisted";
  if (grade === 4 || grade === 5) return "WAPS";
  if (grade !== null && grade >= 6) return "SNCO board";
  return "Junior enlisted";
}

export function careerStageGuidance(profile: Profile): string {
  const grade = enlistedGrade(profile.rank);
  if (grade === null)
    return "Set your enlisted grade in Settings so the preparation prompts match your career stage.";
  if (grade === 9)
    return "E-9 is the highest enlisted grade. Use this workspace to mentor board candidates, review records, and plan senior leadership development or transition milestones.";
  if (profile.service === "Space Force")
    return "Use the current Guardian process for your grade; confirm service-specific advancement and development requirements with your personnel office.";
  if (profile.component !== "Active Duty")
    return "Prepare for your component's current pathway and position requirements with your unit or servicing personnel office.";
  if (grade <= 2)
    return "Confirm time-in-grade advancement, training completion, and any contract-specific provisions with personnel.";
  if (grade === 3)
    return "Prepare for Senior Airman advancement and, when applicable, the unit's competitive BTZ process.";
  if (grade <= 5)
    return "Organize records, current study references, and your confirmed test appointment for the applicable WAPS cycle.";
  return "Use the current board charge and functional-community records review to guide sustained leadership and development.";
}

const CHECKLISTS: Record<CareerPlan["pathway"], readonly string[]> = {
  "Junior enlisted": [
    "Confirm grade, date of rank, entry date, and applicable advancement path with personnel",
    "Review required training, skill level, and commander recommendation with supervisor",
    "Confirm any contract-specific advancement provisions and official promotion date",
    "Agree on development goals and schedule a feedback conversation",
    "Capture measurable accomplishments and review personnel records",
  ],
  BTZ: [
    "Confirm the eligible quarter, unit suspense, and current BTZ process with personnel",
    "Review training completion and unit nomination requirements with supervisor",
    "Collect measurable mission, leadership, and development examples",
    "Review the package for accuracy with mentor or supervisor",
    "Practice explaining accomplishments and responsibilities for the unit's process",
    "Confirm submission and plan follow-up development regardless of selection",
  ],
  WAPS: [
    "Confirm cycle eligibility, PECD, CAFSC, and any ineligibility factors with personnel",
    "Review the current cycle's promotion data verification record and correct discrepancies",
    "Confirm required tests or exemptions and personal appointment with the testing office",
    "Obtain current AFH 1 and applicable career-field study references",
    "Protect recurring study time and review knowledge gaps",
    "Verify evaluations, decorations, and supporting records before the cycle suspense",
    "Review official results with a mentor and update the next development plan",
  ],
  "SNCO board": [
    "Confirm the current cycle's eligibility, PECD, records cutoff, and board instructions",
    "Read the current board's formal charge and record-review guidance",
    "Review evaluations, decorations, and career data for accuracy and completeness",
    "Document sustained mission impact, leadership, resource stewardship, and improvement",
    "Review required PME and developmental breadth with supervisor or SEL",
    "Request a records review from a mentor familiar with your functional community",
    "After results, use feedback to plan development rather than predict a future board score",
  ],
  "Guardian development": [
    "Confirm current Space Force advancement policy and process for your grade",
    "Review cycle or board instructions and eligibility with the servicing personnel office",
    "Check records, evaluations, required training, and PME for accuracy",
    "Agree on technical mastery, mission impact, and leadership development goals",
    "Seek Guardian mentorship and document measurable accomplishments",
    "Enter the confirmed unit or service suspense and review preparation progress",
  ],
  "Component specific": [
    "Confirm the applicable Guard or Reserve promotion pathway with your servicing office",
    "Verify grade requirements, position or vacancy considerations, and unit process",
    "Review training, PME, records, and any component-specific requirements",
    "Confirm the current board or package suspense and required documents",
    "Review development and promotion preparation with supervisor or mentor",
    "Record confirmed dates and update the plan when component guidance changes",
  ],
};

export function careerTemplate(
  pathway: CareerPlan["pathway"],
  profile: Profile,
  id: () => string,
): Omit<CareerPlan, "id"> {
  return {
    title: `${pathway} preparation`,
    pathway,
    dueDate: "",
    afsc: "",
    cycle: "",
    status: "Preparing",
    checklist: CHECKLISTS[pathway].map((label) => ({
      id: id(),
      label,
      completed: false,
    })),
    notes: `${CAREER_RULE_VERSION}. Preparation prompts only; confirm controlling requirements for ${profile.service}, ${profile.component}, and your cycle.`,
    sourceUrl:
      pathway === "Guardian development"
        ? CAREER_SOURCES.guardian
        : CAREER_SOURCES.promotions,
    lastVerified: "",
  };
}

export function safeSourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function careerPlanReview(
  plan: CareerPlan,
  profile: Profile,
  today: string,
) {
  const remaining = plan.checklist.filter((item) => !item.completed);
  const gaps: string[] = [];
  if (!profile.rank || enlistedGrade(profile.rank) === null)
    gaps.push(
      "Set a recognized enlisted grade in Settings to tailor preparation.",
    );
  if (!plan.dueDate) gaps.push("Confirm and enter the unit or cycle suspense.");
  if (
    (plan.pathway === "WAPS" || plan.pathway === "SNCO board") &&
    !plan.cycle.trim()
  )
    gaps.push("Enter the promotion cycle you are preparing for.");
  if (
    (plan.pathway === "WAPS" || plan.pathway === "SNCO board") &&
    !plan.afsc.trim()
  )
    gaps.push("Record the applicable AFSC or functional community.");
  if (!plan.sourceUrl || !safeSourceUrl(plan.sourceUrl) || !plan.lastVerified)
    gaps.push(
      "Review current controlling guidance and record its source and checked date.",
    );
  if (plan.lastVerified && plan.lastVerified > today)
    gaps.push("The source checked date is in the future; correct it.");
  if (!plan.checklist.length)
    gaps.push("Add preparation steps to make progress reviewable.");
  if (plan.status === "Ready for review" && remaining.length)
    gaps.push(
      "The plan is marked ready for review but preparation steps remain open.",
    );
  if (
    profile.service === "Space Force" &&
    (plan.pathway === "WAPS" || plan.pathway === "BTZ")
  )
    gaps.push(
      "This Air Force preparation template needs review against current Space Force guidance.",
    );
  if (
    profile.component !== "Active Duty" &&
    (plan.pathway === "WAPS" ||
      plan.pathway === "BTZ" ||
      plan.pathway === "SNCO board")
  )
    gaps.push(
      "Confirm that this pathway applies to your component; active-duty rules are not assumed.",
    );
  return {
    completed: plan.checklist.length - remaining.length,
    total: plan.checklist.length,
    remaining,
    gaps,
    overdue: Boolean(
      plan.dueDate && plan.dueDate < today && plan.status !== "Complete",
    ),
    nextStep:
      remaining[0]?.label ??
      (gaps[0] ||
        "Ask your supervisor to review the completed preparation plan."),
  };
}

export function careerEvidenceSummary(state: PlannerState) {
  return {
    captures: state.captures.length,
    measured: state.captures.filter((record) =>
      Boolean(record.outcome.trim() && record.impact?.trim()),
    ).length,
    aligned: state.captures.filter((record) =>
      Boolean(record.mga && record.alq),
    ).length,
    developmentOpen: state.developmentActions.filter(
      (action) => action.status !== "Complete",
    ).length,
  };
}

/** These are chosen preparation offsets, not policy-mandated feedback intervals. */
export function evaluationCheckpoints(
  closeout: string,
  closeoutSource: "User entered" | "Estimate" = "User entered",
) {
  return [
    { title: "Evaluation: review goals and request feedback", days: -180 },
    { title: "Evaluation: review accomplishments and records", days: -90 },
    {
      title: "Evaluation: prepare evidence and confirm unit suspense",
      days: -30,
    },
    { title: "Evaluation closeout", days: 0 },
  ].flatMap((item) => {
    try {
      return [
        {
          title: item.title,
          date: addDays(closeout, item.days),
          source: item.days === 0 ? closeoutSource : ("Estimate" as const),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function referenceScod(profile: Profile, today: string) {
  if (profile.service !== "Air Force" || profile.component !== "Active Duty")
    return null;
  const grade = enlistedGrade(profile.rank);
  if (grade === null) return null;
  const monthDay =
    grade <= 4
      ? "03-31"
      : (
          {
            5: "01-31",
            6: "11-30",
            7: "09-30",
            8: "07-31",
            9: "05-31",
          } as Record<number, string>
        )[grade];
  let year = Number(today.slice(0, 4));
  let date = `${String(year).padStart(4, "0")}-${monthDay}`;
  if (date < today) date = `${String(++year).padStart(4, "0")}-${monthDay}`;
  if (year > 9999) return null;
  return {
    date,
    source: "Estimate" as const,
    sourceRef:
      "2026 USAF Digital Planner, page 77: inherited 2024 evaluation timeline table",
    ruleVersion:
      "PDF reference table — not reverified against current DAF evaluation policy",
    caveat:
      "Confirm evaluation applicability, grade at closeout, and any adjusted closeout with your personnel office. This is a recurring date reference, not a confirmed evaluation requirement or unit submission suspense.",
  };
}
