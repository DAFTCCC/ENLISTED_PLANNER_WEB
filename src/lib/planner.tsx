import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PlannerState } from "./types";
import { synchronizePlannerState } from "./relationships";
import { saveAutomaticBackup } from "./automatic-backups";

export const STORAGE_KEY = "enlisted-planner:v1";

export function defaultState(): PlannerState {
  return {
    version: 3,
    profile: {
      name: "",
      service: "Air Force",
      rank: "",
      component: "Active Duty",
      dateOfRank: "",
      dateOfEntry: "",
      role: "Individual",
      onboarded: false,
    },
    blocks: [],
    tasks: [],
    events: [],
    captures: [],
    goals: [],
    members: [],
    projects: [],
    objectives: [],
    contacts: [],
    developmentActions: [],
    disciplinePlans: [],
    meetings: [],
    battleRhythms: [],
    careerPlans: [],
    weeklyReviews: [],
    planningPreferences: {
      workingDays: [1, 2, 3, 4, 5],
      dayStart: "08:00",
      dayEnd: "17:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      maxBlockMinutes: 90,
      eventBufferMinutes: 30,
    },
    careerRequirements: [],
    delegations: [],
    reminderPreferences: {
      enabled: false,
      leadMinutes: 30,
      includeTasks: true,
      includeEvents: true,
      includeFollowUps: true,
    },
    budget: {
      income: 0,
      housing: 0,
      transport: 0,
      food: 0,
      insurance: 0,
      debt: 0,
      savings: 0,
      other: 0,
    },
    fitness: {
      distance: 2,
      minutes: 0,
      seconds: 0,
      goalMinutes: 0,
      cardioScore: 0,
      strengthScore: 0,
      coreScore: 0,
    },
    habits: [
      {
        id: "habit-movement",
        title: "Make time for movement",
        category: "Fitness",
        completedDates: [],
      },
      {
        id: "habit-capture",
        title: "Capture one accomplishment",
        category: "Education",
        completedDates: [],
      },
      {
        id: "habit-plan",
        title: "Review tomorrow’s plan",
        category: "Mental well-being",
        completedDates: [],
      },
    ],
  };
}

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid planner backup: ${path} ${reason}.`);
}

function object(
  value: unknown,
  path: string,
  keys: string[],
  optionalKeys: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "must be an object");
  const record = value as Record<string, unknown>;
  for (const key of keys)
    if (!Object.prototype.hasOwnProperty.call(record, key))
      invalid(`${path}.${key}`, "is missing");
  for (const key of Object.keys(record))
    if (!keys.includes(key) && !optionalKeys.includes(key))
      invalid(`${path}.${key}`, "is not supported");
  return record;
}

function string(value: unknown, path: string, nonempty = false): void {
  if (typeof value !== "string" || (nonempty && !value.trim()))
    invalid(path, nonempty ? "must be a nonempty string" : "must be a string");
}

function boolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") invalid(path, "must be true or false");
}

function number(value: unknown, path: string, maximum = Infinity): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  )
    invalid(
      path,
      `must be a finite number between 0 and ${maximum === Infinity ? "the supported numeric limit" : maximum}`,
    );
}

function choice(
  value: unknown,
  path: string,
  choices: readonly string[],
): void {
  if (typeof value !== "string" || !choices.includes(value))
    invalid(path, `must be one of ${choices.join(", ")}`);
}

function date(value: unknown, path: string, optional = false): void {
  if (optional && value === "") return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(path, "must be a calendar date in YYYY-MM-DD format");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number(value.slice(0, 4)) < 1 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid(path, "must be a real calendar date");
}

function time(
  value: unknown,
  path: string,
  allowEnd = false,
  optional = false,
): void {
  if (optional && value === "") return;
  if (
    typeof value !== "string" ||
    (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) &&
      !(allowEnd && value === "24:00"))
  )
    invalid(path, "must be a valid time in HH:mm format");
}

function rows(
  value: unknown,
  path: string,
  validate: (record: Record<string, unknown>, path: string) => void,
  keys: string[],
  optionalKeys: string[] = [],
): void {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const location = `${path}[${index}]`;
    const record = object(entry, location, keys, optionalKeys);
    string(record.id, `${location}.id`, true);
    if (ids.has(record.id as string))
      invalid(`${location}.id`, "duplicates another entry");
    ids.add(record.id as string);
    validate(record, location);
  });
}

const majorAreas = [
  "Executing the Mission",
  "Leading People",
  "Managing Resources",
  "Improving the Unit",
];
const leadershipQualities = [
  "Job proficiency",
  "Initiative",
  "Adaptability",
  "Inclusion and teamwork",
  "Emotional intelligence",
  "Communication",
  "Stewardship",
  "Accountability",
  "Decision making",
  "Innovation",
];

function strings(
  item: Record<string, unknown>,
  path: string,
  fields: string[],
): void {
  for (const field of fields) string(item[field], `${path}.${field}`);
}

function optionalStrings(
  item: Record<string, unknown>,
  path: string,
  fields: string[],
): void {
  for (const field of fields)
    if (item[field] !== undefined) string(item[field], `${path}.${field}`);
}

function stringList(value: unknown, path: string, unique = false): void {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  value.forEach((entry, index) => string(entry, `${path}[${index}]`));
  if (unique && new Set(value).size !== value.length)
    invalid(path, "contains duplicate entries");
}

/** Reference checks also protect links when an in-memory draft is edited. */
export function assertPlannerReferences(state: PlannerState): void {
  const ids = {
    tasks: new Set(state.tasks.map((item) => item.id)),
    projects: new Set(state.projects.map((item) => item.id)),
    members: new Set(state.members.map((item) => item.id)),
    objectives: new Set(state.objectives.map((item) => item.id)),
    contacts: new Set(state.contacts.map((item) => item.id)),
    developmentActions: new Set(
      state.developmentActions.map((item) => item.id),
    ),
    disciplinePlans: new Set(state.disciplinePlans.map((item) => item.id)),
    meetings: new Set(state.meetings.map((item) => item.id)),
    battleRhythms: new Set(state.battleRhythms.map((item) => item.id)),
    goals: new Set(state.goals.map((item) => item.id)),
    careerPlans: new Set(state.careerPlans.map((item) => item.id)),
  };
  function reference(
    value: unknown,
    path: string,
    collection: keyof typeof ids,
  ) {
    if (value === undefined || value === "") return;
    if (typeof value !== "string" || !ids[collection].has(value))
      invalid(path, `references a missing ${collection} record`);
  }
  for (const [index, item] of state.blocks.entries()) {
    reference(item.taskId, `blocks[${index}].taskId`, "tasks");
    reference(item.rhythmId, `blocks[${index}].rhythmId`, "battleRhythms");
  }
  for (const [index, item] of state.tasks.entries()) {
    const path = `tasks[${index}]`;
    reference(item.projectId, `${path}.projectId`, "projects");
    reference(item.assigneeId, `${path}.assigneeId`, "members");
    reference(item.objectiveId, `${path}.objectiveId`, "objectives");
    reference(item.meetingId, `${path}.meetingId`, "meetings");
    reference(item.careerPlanId, `${path}.careerPlanId`, "careerPlans");
    item.dependencyIds?.forEach((id, dependency) =>
      reference(id, `${path}.dependencyIds[${dependency}]`, "tasks"),
    );
  }
  for (const [index, item] of state.events.entries()) {
    const path = `events[${index}]`;
    reference(item.memberId, `${path}.memberId`, "members");
    reference(
      item.developmentActionId,
      `${path}.developmentActionId`,
      "developmentActions",
    );
    reference(
      item.disciplinePlanId,
      `${path}.disciplinePlanId`,
      "disciplinePlans",
    );
    reference(item.meetingId, `${path}.meetingId`, "meetings");
    reference(item.goalId, `${path}.goalId`, "goals");
  }
  for (const [index, item] of state.captures.entries()) {
    const path = `captures[${index}]`;
    reference(item.projectId, `${path}.projectId`, "projects");
    reference(item.taskId, `${path}.taskId`, "tasks");
    reference(item.objectiveId, `${path}.objectiveId`, "objectives");
    item.memberIds?.forEach((id, member) =>
      reference(id, `${path}.memberIds[${member}]`, "members"),
    );
  }
  for (const [index, item] of state.goals.entries())
    reference(item.objectiveId, `goals[${index}].objectiveId`, "objectives");
  for (const [index, item] of state.members.entries()) {
    reference(item.supervisorId, `members[${index}].supervisorId`, "members");
    reference(item.contactId, `members[${index}].contactId`, "contacts");
  }
  for (const [index, item] of state.projects.entries()) {
    reference(item.ownerId, `projects[${index}].ownerId`, "members");
    reference(item.objectiveId, `projects[${index}].objectiveId`, "objectives");
  }
  for (const [index, item] of state.objectives.entries())
    reference(item.parentId, `objectives[${index}].parentId`, "objectives");
  for (const [index, item] of state.developmentActions.entries()) {
    reference(
      item.memberId,
      `developmentActions[${index}].memberId`,
      "members",
    );
    reference(item.taskId, `developmentActions[${index}].taskId`, "tasks");
  }
  for (const [index, item] of state.disciplinePlans.entries())
    reference(item.memberId, `disciplinePlans[${index}].memberId`, "members");
  for (const [index, item] of state.careerPlans.entries())
    item.checklist.forEach((check, checkIndex) =>
      reference(
        check.taskId,
        `careerPlans[${index}].checklist[${checkIndex}].taskId`,
        "tasks",
      ),
    );
  for (const [index, item] of state.weeklyReviews.entries())
    item.carriedTaskIds.forEach((id, taskIndex) =>
      reference(
        id,
        `weeklyReviews[${index}].carriedTaskIds[${taskIndex}]`,
        "tasks",
      ),
    );
  for (const [index, item] of state.delegations.entries())
    reference(item.taskId, `delegations[${index}].taskId`, "tasks");

  // Kahn's algorithm avoids stack overflow for a long, valid dependency chain.
  function acyclic<T extends { id: string }>(
    items: T[],
    edges: (item: T) => string[],
    path: string,
  ) {
    const graph = new Map(
      items.map((item) => [item.id, edges(item).filter(Boolean)]),
    );
    const degrees = new Map(items.map((item) => [item.id, 0]));
    for (const links of graph.values())
      for (const id of links) degrees.set(id, (degrees.get(id) ?? 0) + 1);
    const queue = [...degrees]
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id);
    for (let index = 0; index < queue.length; index++) {
      for (const id of graph.get(queue[index]) ?? []) {
        const remaining = (degrees.get(id) ?? 0) - 1;
        degrees.set(id, remaining);
        if (remaining === 0) queue.push(id);
      }
    }
    if (queue.length !== items.length) invalid(path, "contains a cycle");
  }
  acyclic(state.objectives, (item) => [item.parentId], "objectives.parentId");
  acyclic(
    state.tasks,
    (item) => item.dependencyIds ?? [],
    "tasks.dependencyIds",
  );
  acyclic(
    state.members,
    (item) => [item.supervisorId ?? ""],
    "members.supervisorId",
  );
}

function validateV2Extensions(state: Record<string, unknown>): void {
  (state.blocks as Array<Record<string, unknown>>).forEach((item, index) =>
    optionalStrings(item, `blocks[${index}]`, ["taskId", "rhythmId"]),
  );
  (state.tasks as Array<Record<string, unknown>>).forEach((item, index) => {
    const path = `tasks[${index}]`;
    optionalStrings(item, path, [
      "projectId",
      "assigneeId",
      "objectiveId",
      "meetingId",
      "careerPlanId",
      "requestor",
      "notes",
    ]);
    if (item.completedOn !== undefined)
      date(item.completedOn, `${path}.completedOn`, true);
    if (item.suspenseTime !== undefined)
      time(item.suspenseTime, `${path}.suspenseTime`, false, true);
    if (item.status !== undefined)
      choice(item.status, `${path}.status`, [
        "Open",
        "In progress",
        "Blocked",
        "Done",
      ]);
    if (item.kind !== undefined)
      choice(item.kind, `${path}.kind`, ["Task", "Milestone"]);
    if (item.estimatedMinutes !== undefined)
      number(item.estimatedMinutes, `${path}.estimatedMinutes`);
    if (item.dependencyIds !== undefined)
      stringList(item.dependencyIds, `${path}.dependencyIds`, true);
    if (
      item.status !== undefined &&
      (item.status === "Done") !== item.completed
    )
      invalid(path, "must keep status and completed consistent");
  });
  (state.events as Array<Record<string, unknown>>).forEach((item, index) =>
    optionalStrings(item, `events[${index}]`, [
      "memberId",
      "developmentActionId",
      "disciplinePlanId",
      "meetingId",
      "goalId",
    ]),
  );
  (state.captures as Array<Record<string, unknown>>).forEach((item, index) => {
    const path = `captures[${index}]`;
    optionalStrings(item, path, [
      "impact",
      "evidence",
      "projectId",
      "taskId",
      "objectiveId",
    ]);
    if (item.mga !== undefined)
      choice(item.mga, `${path}.mga`, ["", ...majorAreas]);
    if (item.alq !== undefined)
      choice(item.alq, `${path}.alq`, ["", ...leadershipQualities]);
    if (item.memberIds !== undefined)
      stringList(item.memberIds, `${path}.memberIds`, true);
  });
  (state.goals as Array<Record<string, unknown>>).forEach((item, index) => {
    const path = `goals[${index}]`;
    optionalStrings(item, path, ["objectiveId", "sourceRef"]);
    if (item.source !== undefined)
      choice(item.source, `${path}.source`, ["User entered", "Estimate"]);
  });
  (state.members as Array<Record<string, unknown>>).forEach((item, index) => {
    const path = `members[${index}]`;
    optionalStrings(item, path, ["team", "supervisorId", "contactId"]);
    if (item.role !== undefined)
      choice(item.role, `${path}.role`, [
        "Teammate",
        "Wingman",
        "Supervisor",
        "Senior leader",
        "Resource",
      ]);
  });
  rows(
    state.projects,
    "projects",
    (item, path) => {
      strings(item, path, [
        "title",
        "objective",
        "ownerId",
        "objectiveId",
        "resources",
        "risks",
        "successMeasure",
        "baseline",
        "target",
        "actual",
        "notes",
      ]);
      date(item.startDate, `${path}.startDate`, true);
      date(item.dueDate, `${path}.dueDate`, true);
      choice(item.status, `${path}.status`, [
        "Planned",
        "Active",
        "On hold",
        "Complete",
      ]);
      const swot = object(item.swot, `${path}.swot`, [
        "strengths",
        "weaknesses",
        "opportunities",
        "threats",
      ]);
      strings(swot, `${path}.swot`, [
        "strengths",
        "weaknesses",
        "opportunities",
        "threats",
      ]);
    },
    [
      "id",
      "title",
      "objective",
      "startDate",
      "dueDate",
      "status",
      "ownerId",
      "objectiveId",
      "resources",
      "risks",
      "successMeasure",
      "baseline",
      "target",
      "actual",
      "notes",
      "swot",
    ],
  );
  rows(
    state.objectives,
    "objectives",
    (item, path) => {
      strings(item, path, ["title", "parentId", "mission", "measure", "notes"]);
      date(item.targetDate, `${path}.targetDate`, true);
      choice(item.level, `${path}.level`, [
        "Personal",
        "Section",
        "Squadron",
        "Group",
        "Wing",
        "MAJCOM",
        "Service",
        "National",
      ]);
    },
    [
      "id",
      "title",
      "level",
      "parentId",
      "mission",
      "measure",
      "targetDate",
      "notes",
    ],
  );
  rows(
    state.contacts,
    "contacts",
    (item, path) =>
      strings(item, path, [
        "name",
        "role",
        "agency",
        "phone",
        "email",
        "location",
        "notes",
      ]),
    ["id", "name", "role", "agency", "phone", "email", "location", "notes"],
  );
  rows(
    state.developmentActions,
    "developmentActions",
    (item, path) => {
      strings(item, path, ["memberId", "title", "notes"]);
      optionalStrings(item, path, ["taskId"]);
      date(item.dueDate, `${path}.dueDate`, true);
      choice(item.kind, `${path}.kind`, [
        "Training",
        "Mentoring",
        "Feedback",
        "Responsibility",
      ]);
      choice(item.status, `${path}.status`, [
        "Planned",
        "In progress",
        "Complete",
      ]);
    },
    ["id", "memberId", "title", "kind", "dueDate", "status", "notes"],
    ["taskId"],
  );
  rows(
    state.disciplinePlans,
    "disciplinePlans",
    (item, path) => {
      strings(item, path, [
        "memberId",
        "title",
        "expectation",
        "observedGap",
        "supportPlan",
        "notes",
      ]);
      date(item.followUpDate, `${path}.followUpDate`, true);
      choice(item.consultation, `${path}.consultation`, [
        "Not started",
        "Requested",
        "Completed",
      ]);
      choice(item.status, `${path}.status`, ["Open", "Monitoring", "Closed"]);
    },
    [
      "id",
      "memberId",
      "title",
      "expectation",
      "observedGap",
      "supportPlan",
      "followUpDate",
      "consultation",
      "status",
      "notes",
    ],
  );
  rows(
    state.meetings,
    "meetings",
    (item, path) => {
      strings(item, path, [
        "title",
        "objective",
        "agenda",
        "decisions",
        "notes",
      ]);
      stringList(item.participants, `${path}.participants`);
      date(item.date, `${path}.date`, true);
      date(item.nextDate, `${path}.nextDate`, true);
      time(item.time, `${path}.time`, false, true);
    },
    [
      "id",
      "title",
      "date",
      "time",
      "objective",
      "participants",
      "agenda",
      "decisions",
      "nextDate",
      "notes",
    ],
  );
  rows(
    state.battleRhythms,
    "battleRhythms",
    (item, path) => {
      strings(item, path, ["title", "notes"]);
      date(item.startDate, `${path}.startDate`);
      time(item.startTime, `${path}.startTime`);
      time(item.endTime, `${path}.endTime`, true);
      if ((item.endTime as string) <= (item.startTime as string))
        invalid(path, "must end after it starts on the same day");
      choice(item.mga, `${path}.mga`, majorAreas);
      choice(item.frequency, `${path}.frequency`, [
        "Daily",
        "Weekly",
        "Monthly",
        "Quarterly",
        "Yearly",
      ]);
      choice(item.category, `${path}.category`, [
        "Duty",
        "Development",
        "Fitness",
        "Personal",
      ]);
    },
    [
      "id",
      "title",
      "mga",
      "frequency",
      "startDate",
      "startTime",
      "endTime",
      "category",
      "notes",
    ],
  );
  rows(
    state.careerPlans,
    "careerPlans",
    (item, path) => {
      strings(item, path, ["title", "afsc", "cycle", "notes", "sourceUrl"]);
      date(item.dueDate, `${path}.dueDate`, true);
      date(item.lastVerified, `${path}.lastVerified`, true);
      choice(item.pathway, `${path}.pathway`, [
        "Junior enlisted",
        "BTZ",
        "WAPS",
        "SNCO board",
        "Guardian development",
        "Component specific",
      ]);
      choice(item.status, `${path}.status`, [
        "Preparing",
        "Ready for review",
        "Complete",
      ]);
      rows(
        item.checklist,
        `${path}.checklist`,
        (entry, entryPath) => {
          string(entry.label, `${entryPath}.label`);
          boolean(entry.completed, `${entryPath}.completed`);
          optionalStrings(entry, entryPath, ["taskId"]);
        },
        ["id", "label", "completed"],
        ["taskId"],
      );
    },
    [
      "id",
      "title",
      "pathway",
      "dueDate",
      "afsc",
      "cycle",
      "status",
      "checklist",
      "notes",
      "sourceUrl",
      "lastVerified",
    ],
  );
  assertPlannerReferences(state as unknown as PlannerState);
}

function validateV3Extensions(state: Record<string, unknown>): void {
  const preferences = object(state.planningPreferences, "planningPreferences", [
    "workingDays",
    "dayStart",
    "dayEnd",
    "breakStart",
    "breakEnd",
    "maxBlockMinutes",
    "eventBufferMinutes",
  ]);
  if (
    !Array.isArray(preferences.workingDays) ||
    preferences.workingDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(preferences.workingDays).size !== preferences.workingDays.length
  )
    invalid(
      "planningPreferences.workingDays",
      "must contain unique weekday numbers from 0 to 6",
    );
  time(preferences.dayStart, "planningPreferences.dayStart");
  time(preferences.dayEnd, "planningPreferences.dayEnd", true);
  if ((preferences.dayEnd as string) <= (preferences.dayStart as string))
    invalid("planningPreferences", "must end after working hours start");
  time(preferences.breakStart, "planningPreferences.breakStart", false, true);
  time(preferences.breakEnd, "planningPreferences.breakEnd", true, true);
  if (
    Boolean(preferences.breakStart) !== Boolean(preferences.breakEnd) ||
    (preferences.breakStart &&
      (preferences.breakEnd as string) <= (preferences.breakStart as string))
  )
    invalid(
      "planningPreferences",
      "must have an ordered break or leave both break times empty",
    );
  number(
    preferences.maxBlockMinutes,
    "planningPreferences.maxBlockMinutes",
    480,
  );
  if (
    !Number.isInteger(preferences.maxBlockMinutes) ||
    (preferences.maxBlockMinutes as number) < 1
  )
    invalid(
      "planningPreferences.maxBlockMinutes",
      "must be a positive whole number",
    );
  number(
    preferences.eventBufferMinutes,
    "planningPreferences.eventBufferMinutes",
    180,
  );
  if (!Number.isInteger(preferences.eventBufferMinutes))
    invalid("planningPreferences.eventBufferMinutes", "must be a whole number");
  const reminders = object(state.reminderPreferences, "reminderPreferences", [
    "enabled",
    "leadMinutes",
    "includeTasks",
    "includeEvents",
    "includeFollowUps",
  ]);
  for (const key of [
    "enabled",
    "includeTasks",
    "includeEvents",
    "includeFollowUps",
  ])
    boolean(reminders[key], `reminderPreferences.${key}`);
  number(reminders.leadMinutes, "reminderPreferences.leadMinutes", 10080);
  if (!Number.isInteger(reminders.leadMinutes))
    invalid("reminderPreferences.leadMinutes", "must be a whole number");
  const weeks = new Set<string>();
  rows(
    state.weeklyReviews,
    "weeklyReviews",
    (item, path) => {
      strings(item, path, ["wins", "lessons", "nextFocus"]);
      date(item.weekStart, `${path}.weekStart`);
      date(item.reviewedOn, `${path}.reviewedOn`);
      if (weeks.has(item.weekStart as string))
        invalid(`${path}.weekStart`, "duplicates another weekly review");
      weeks.add(item.weekStart as string);
      stringList(item.carriedTaskIds, `${path}.carriedTaskIds`, true);
      const metrics = object(item.metrics, `${path}.metrics`, [
        "plannedMinutes",
        "completedBlockMinutes",
        "completedTaskCount",
        "captureCount",
      ]);
      for (const key of Object.keys(metrics))
        number(metrics[key], `${path}.metrics.${key}`);
    },
    [
      "id",
      "weekStart",
      "reviewedOn",
      "wins",
      "lessons",
      "nextFocus",
      "carriedTaskIds",
      "metrics",
    ],
  );
  rows(
    state.careerRequirements,
    "careerRequirements",
    (item, path) => {
      strings(item, path, [
        "title",
        "evidence",
        "notes",
        "sourceUrl",
        "rank",
        "afsc",
      ]);
      choice(item.area, `${path}.area`, [
        "PME",
        "Training",
        "Certification",
        "Records",
        "Experience",
      ]);
      choice(item.status, `${path}.status`, [
        "Planned",
        "In progress",
        "Complete",
      ]);
      choice(item.service, `${path}.service`, [
        "Any",
        "Air Force",
        "Space Force",
      ]);
      choice(item.component, `${path}.component`, [
        "Any",
        "Active Duty",
        "Guard",
        "Reserve",
      ]);
      for (const key of [
        "dueDate",
        "completedDate",
        "expiresDate",
        "lastVerified",
      ])
        date(item[key], `${path}.${key}`, true);
    },
    [
      "id",
      "title",
      "area",
      "status",
      "dueDate",
      "completedDate",
      "expiresDate",
      "evidence",
      "notes",
      "sourceUrl",
      "lastVerified",
      "service",
      "component",
      "rank",
      "afsc",
    ],
  );
  rows(
    state.delegations,
    "delegations",
    (item, path) => {
      strings(item, path, [
        "taskId",
        "recipientName",
        "recipientEmail",
        "blocker",
        "notes",
      ]);
      optionalStrings(item, path, ["remoteId"]);
      choice(item.status, `${path}.status`, [
        "Offered",
        "Accepted",
        "In progress",
        "Blocked",
        "Submitted",
        "Closed",
        "Declined",
      ]);
      date(item.sentOn, `${path}.sentOn`);
      date(item.updatedOn, `${path}.updatedOn`);
      number(item.progress, `${path}.progress`, 100);
    },
    [
      "id",
      "taskId",
      "recipientName",
      "recipientEmail",
      "status",
      "sentOn",
      "updatedOn",
      "progress",
      "blocker",
      "notes",
    ],
    ["remoteId"],
  );
}

/** Validate every persisted field before replacing the current plan. No data is silently dropped. */
export function parsePlannerData(raw: string): PlannerState {
  if (new TextEncoder().encode(raw).byteLength > 10 * 1024 * 1024)
    throw new Error(
      "Planner backup is too large. Choose a JSON backup smaller than 10 MB.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose an exported planner backup.",
    );
  }
  const newCollections = [
    "projects",
    "objectives",
    "contacts",
    "developmentActions",
    "disciplinePlans",
    "meetings",
    "battleRhythms",
    "careerPlans",
  ];
  const version =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).version
      : undefined;
  if (version !== 1 && version !== 2 && version !== 3)
    invalid(
      "planner.version",
      "is unsupported; this app accepts version 1, 2, and 3 backups",
    );
  const v3Fields = [
    "weeklyReviews",
    "planningPreferences",
    "careerRequirements",
    "delegations",
    "reminderPreferences",
  ];
  const state = object(parsed, "planner", [
    "version",
    "profile",
    "blocks",
    "tasks",
    "events",
    "captures",
    "goals",
    "members",
    "budget",
    "fitness",
    "habits",
    ...(version !== 1 ? newCollections : []),
    ...(version === 3 ? v3Fields : []),
  ]);
  const profile = object(
    state.profile,
    "profile",
    [
      "name",
      "service",
      "rank",
      "component",
      "dateOfRank",
      "dateOfEntry",
      "role",
      "onboarded",
    ],
    version === 3 ? ["afsc"] : [],
  );
  optionalStrings(profile, "profile", ["afsc"]);
  string(profile.name, "profile.name");
  string(profile.rank, "profile.rank");
  choice(profile.service, "profile.service", ["Air Force", "Space Force"]);
  choice(profile.component, "profile.component", [
    "Active Duty",
    "Guard",
    "Reserve",
  ]);
  choice(profile.role, "profile.role", [
    "Individual",
    "Supervisor",
    "Senior leader",
  ]);
  date(profile.dateOfRank, "profile.dateOfRank", true);
  date(profile.dateOfEntry, "profile.dateOfEntry", true);
  boolean(profile.onboarded, "profile.onboarded");
  rows(
    state.blocks,
    "blocks",
    (item, path) => {
      date(item.date, `${path}.date`);
      time(item.start, `${path}.start`);
      time(item.end, `${path}.end`, true);
      if ((item.end as string) <= (item.start as string))
        invalid(path, "must end after it starts on the same day");
      string(item.title, `${path}.title`);
      string(item.notes, `${path}.notes`);
      boolean(item.completed, `${path}.completed`);
      choice(item.category, `${path}.category`, [
        "Duty",
        "Development",
        "Fitness",
        "Personal",
      ]);
    },
    ["id", "date", "start", "end", "title", "category", "notes", "completed"],
    version !== 1 ? ["taskId", "rhythmId"] : [],
  );
  rows(
    state.tasks,
    "tasks",
    (item, path) => {
      string(item.title, `${path}.title`);
      date(item.date, `${path}.date`, true);
      boolean(item.completed, `${path}.completed`);
      choice(item.priority, `${path}.priority`, ["High", "Normal", "Low"]);
    },
    ["id", "title", "date", "completed", "priority"],
    version !== 1
      ? [
          "projectId",
          "assigneeId",
          "objectiveId",
          "meetingId",
          "careerPlanId",
          "requestor",
          "suspenseTime",
          "status",
          "dependencyIds",
          "notes",
          "estimatedMinutes",
          "kind",
          ...(version === 3 ? ["completedOn"] : []),
        ]
      : [],
  );
  rows(
    state.events,
    "events",
    (item, path) => {
      string(item.title, `${path}.title`);
      date(item.date, `${path}.date`);
      time(item.time, `${path}.time`, false, true);
      choice(item.category, `${path}.category`, [
        "Personal",
        "Career",
        "Training",
        "Administrative",
      ]);
      choice(item.recurrence, `${path}.recurrence`, [
        "None",
        "Weekly",
        "Monthly",
        ...(version !== 1 ? ["Quarterly", "Yearly"] : []),
      ]);
      choice(item.source, `${path}.source`, ["User entered", "Estimate"]);
    },
    ["id", "title", "date", "time", "category", "recurrence", "source"],
    version !== 1
      ? [
          "memberId",
          "developmentActionId",
          "disciplinePlanId",
          "meetingId",
          "goalId",
        ]
      : [],
  );
  rows(
    state.captures,
    "captures",
    (item, path) => {
      for (const key of ["title", "context", "actions", "outcome", "lessons"])
        string(item[key], `${path}.${key}`);
      date(item.date, `${path}.date`);
      choice(item.category, `${path}.category`, [
        "Mission",
        "Leadership",
        "Development",
        "Community",
      ]);
      if (!Array.isArray(item.tags))
        invalid(`${path}.tags`, "must be an array");
      item.tags.forEach((tag, index) => string(tag, `${path}.tags[${index}]`));
    },
    [
      "id",
      "title",
      "date",
      "category",
      "context",
      "actions",
      "outcome",
      "lessons",
      "tags",
    ],
    version !== 1
      ? [
          "impact",
          "evidence",
          "mga",
          "alq",
          "projectId",
          "taskId",
          "objectiveId",
          "memberIds",
        ]
      : [],
  );
  rows(
    state.goals,
    "goals",
    (item, path) => {
      string(item.title, `${path}.title`);
      string(item.category, `${path}.category`);
      date(item.targetDate, `${path}.targetDate`, true);
      number(item.progress, `${path}.progress`, 100);
    },
    ["id", "title", "targetDate", "category", "progress"],
    version !== 1 ? ["objectiveId", "source", "sourceRef"] : [],
  );
  rows(
    state.members,
    "members",
    (item, path) => {
      for (const key of ["name", "rank", "focus", "notes"])
        string(item[key], `${path}.${key}`);
      date(item.nextFeedback, `${path}.nextFeedback`, true);
    },
    ["id", "name", "rank", "focus", "nextFeedback", "notes"],
    version !== 1 ? ["team", "supervisorId", "contactId", "role"] : [],
  );
  const budgetKeys = [
    "income",
    "housing",
    "transport",
    "food",
    "insurance",
    "debt",
    "savings",
    "other",
  ];
  const budget = object(state.budget, "budget", budgetKeys);
  for (const key of budgetKeys) number(budget[key], `budget.${key}`);
  const fitness = object(
    state.fitness,
    "fitness",
    [
      "distance",
      "minutes",
      "seconds",
      "goalMinutes",
      "cardioScore",
      "strengthScore",
      "coreScore",
    ],
    ["bodyCompositionScore"],
  );
  for (const key of ["distance", "minutes", "goalMinutes"])
    number(fitness[key], `fitness.${key}`);
  number(fitness.seconds, "fitness.seconds", 59);
  number(fitness.cardioScore, "fitness.cardioScore", 60);
  number(fitness.strengthScore, "fitness.strengthScore", 20);
  // Older plans used a 60/20/20 scale; keep accepting those saved values.
  number(fitness.coreScore, "fitness.coreScore", 20);
  if (fitness.bodyCompositionScore !== undefined)
    number(fitness.bodyCompositionScore, "fitness.bodyCompositionScore", 20);
  rows(
    state.habits,
    "habits",
    (item, path) => {
      string(item.title, `${path}.title`);
      string(item.category, `${path}.category`);
      if (!Array.isArray(item.completedDates))
        invalid(`${path}.completedDates`, "must be an array");
      item.completedDates.forEach((day, index) =>
        date(day, `${path}.completedDates[${index}]`),
      );
      if (new Set(item.completedDates).size !== item.completedDates.length)
        invalid(`${path}.completedDates`, "contains duplicate dates");
    },
    ["id", "title", "category", "completedDates"],
  );
  // Validate each historical schema before adding fields. Merely reading old
  // data keeps its saved bytes intact until an edit or explicit import.
  if (version === 1) for (const key of newCollections) state[key] = [];
  if (version !== 3) {
    const defaults = defaultState() as unknown as Record<string, unknown>;
    for (const key of v3Fields) state[key] = defaults[key];
    state.version = 3;
  }
  validateV3Extensions(state);
  validateV2Extensions(state);
  return state as unknown as PlannerState;
}

interface LoadedPlanner {
  state: PlannerState;
  storageError: string | null;
  allowWrites: boolean;
  savedRaw: string | null | undefined;
}

function loadPlanner(): LoadedPlanner {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null)
      return {
        state: defaultState(),
        storageError: null,
        allowWrites: true,
        savedRaw: null,
      };
    try {
      return {
        state: parsePlannerData(raw),
        storageError: null,
        allowWrites: true,
        savedRaw: raw,
      };
    } catch {
      return {
        state: defaultState(),
        storageError:
          "Saved planner data could not be read. It has been preserved. Export your current plan, then import a valid backup or reset data to resume saving.",
        allowWrites: false,
        savedRaw: raw,
      };
    }
  } catch {
    return {
      state: defaultState(),
      storageError:
        "Browser storage is unavailable. Changes will remain in this session; export a backup before closing this page.",
      allowWrites: true,
      savedRaw: undefined,
    };
  }
}

interface PlannerContextValue {
  state: PlannerState;
  mutate: (updater: (draft: PlannerState) => void) => boolean;
  reset: () => void;
  importData: (raw: string) => void;
  exportData: () => string;
  storageError: string | null;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const loaded = useRef<LoadedPlanner | null>(null);
  if (!loaded.current) loaded.current = loadPlanner();
  const [state, setState] = useState(loaded.current.state);
  const [storageError, setStorageError] = useState(loaded.current.storageError);
  const allowWrites = useRef(loaded.current.allowWrites);
  const savedRaw = useRef(loaded.current.savedRaw);
  const savedState = useRef(loaded.current.state);
  const currentState = useRef(state);
  currentState.current = state;

  useEffect(() => {
    function externalChange(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === savedRaw.current) return;
        if (currentState.current !== savedState.current) {
          allowWrites.current = false;
          setStorageError(
            "Your saved planner changed in another tab. This tab’s edits remain available to export, and the other saved plan has been preserved. Import a backup or reset data when you are ready to replace it.",
          );
          return;
        }
        let external: PlannerState;
        try {
          external = raw === null ? defaultState() : parsePlannerData(raw);
        } catch {
          allowWrites.current = false;
          setStorageError(
            "Saved planner data changed in another tab and could not be read. It has been preserved. Export your current plan, then import a valid backup or reset data to resume saving.",
          );
          return;
        }
        savedRaw.current = raw;
        savedState.current = external;
        currentState.current = external;
        allowWrites.current = true;
        setState(external);
        setStorageError(null);
      } catch {
        setStorageError(
          "Browser storage is unavailable. Changes will remain in this session; export a backup before closing this page.",
        );
      }
    }
    window.addEventListener("storage", externalChange);
    return () => window.removeEventListener("storage", externalChange);
  }, []);

  useEffect(() => {
    if (!allowWrites.current || state === savedState.current) return;
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw.current === undefined && existing === null)
        savedRaw.current = null;
      if (existing !== savedRaw.current) {
        allowWrites.current = false;
        setStorageError(
          "Your saved planner changed in another tab. This tab’s edits remain available to export, and the other saved plan has been preserved. Import a backup or reset data when you are ready to replace it.",
        );
        return;
      }
      const raw = JSON.stringify(state);
      window.localStorage.setItem(STORAGE_KEY, raw);
      savedRaw.current = raw;
      savedState.current = state;
      setStorageError(null);
    } catch {
      setStorageError(
        "Your latest changes could not be saved in this browser. Storage may be full or unavailable. Export a backup before closing this page.",
      );
    }
  }, [state]);

  function allowReplacement() {
    try {
      savedRaw.current = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      savedRaw.current = undefined;
    }
    allowWrites.current = true;
  }

  const value: PlannerContextValue = {
    state,
    storageError,
    mutate(updater) {
      const current = currentState.current;
      const draft = structuredClone(current);
      try {
        updater(draft);
        synchronizePlannerState(draft, current);
        assertPlannerReferences(draft);
      } catch (error) {
        setStorageError(
          `Your changes could not be applied. ${error instanceof Error ? error.message : "Check linked records and try again."}`,
        );
        return false;
      }
      currentState.current = draft;
      setState(draft);
      return true;
    },
    reset() {
      void saveAutomaticBackup(
        JSON.stringify(currentState.current),
        "Before reset",
      ).catch(() => {});
      allowReplacement();
      const fresh = defaultState();
      currentState.current = fresh;
      setState(fresh);
    },
    importData(raw) {
      const imported = parsePlannerData(raw);
      void saveAutomaticBackup(
        JSON.stringify(currentState.current),
        "Before replacement",
      ).catch(() => {});
      allowReplacement();
      currentState.current = imported;
      setState(imported);
    },
    exportData() {
      return JSON.stringify(currentState.current);
    },
  };
  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context)
    throw new Error("usePlanner must be used inside PlannerProvider.");
  return context;
}
