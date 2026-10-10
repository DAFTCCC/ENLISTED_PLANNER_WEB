import { formatDate, localDate, minutes } from "./dates";
import { taskCompletionError } from "./workflow";
import type { Delegation, PlannerState, Task } from "./types";

export const RECIPIENT_STATUSES = [
  "Accepted",
  "In progress",
  "Blocked",
  "Submitted",
  "Declined",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export interface TaskerOffer {
  kind: "enlisted-planner-tasker-offer";
  version: 1;
  delegation: Pick<
    Delegation,
    "id" | "taskId" | "recipientName" | "recipientEmail" | "sentOn"
  >;
  supervisorName: string;
  task: {
    id: string;
    title: string;
    date: string;
    suspenseTime: string;
    priority: Task["priority"];
    estimatedMinutes: number | null;
    notes: string;
    projectTitle: string;
    prerequisites: { id: string; title: string; completed: boolean }[];
  };
}

export interface TaskerUpdate {
  kind: "enlisted-planner-tasker-update";
  version: 1;
  delegationId: string;
  taskId: string;
  recipientName: string;
  recipientEmail: string;
  offeredOn: string;
  updatedOn: string;
  status: RecipientStatus;
  progress: number;
  blocker: string;
  notes: string;
}

/** A real backend must authenticate recipients and enforce ownership server-side. */
export interface DelegationTransport {
  publishOffer(offer: TaskerOffer): Promise<{ remoteId: string }>;
  submitUpdate(remoteId: string, update: TaskerUpdate): Promise<void>;
  readUpdates(remoteId: string): Promise<TaskerUpdate[]>;
}

const MAX_PACKET_BYTES = 100_000;
function fail(message: string): never {
  throw new Error(message);
}
function record(
  value: unknown,
  fields: string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in result))
  )
    fail(`${label} has missing or unsupported fields.`);
  return result;
}
function textField(
  value: unknown,
  label: string,
  required = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 20_000 ||
    (required && !value.trim())
  )
    fail(`${label} must be ${required ? "nonempty " : ""}text.`);
}
function dateField(
  value: unknown,
  label: string,
  required = true,
): asserts value is string {
  textField(value, label, required);
  if (!value && !required) return;
  try {
    formatDate(value);
  } catch {
    fail(`${label} must be a valid YYYY-MM-DD calendar date.`);
  }
}
function emailField(value: unknown) {
  textField(value, "Recipient email");
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    fail("Recipient email is invalid.");
}
function progressField(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  )
    fail("Progress must be a whole number from 0 to 100.");
}
function parseJson(raw: string): unknown {
  if (new TextEncoder().encode(raw).length > MAX_PACKET_BYTES)
    fail("Tasker packets must be under 100 KB.");
  try {
    return JSON.parse(raw);
  } catch {
    return fail("This is not valid tasker packet JSON.");
  }
}

export function parseTaskerOffer(raw: string): TaskerOffer {
  const item = record(
    parseJson(raw),
    ["kind", "version", "delegation", "supervisorName", "task"],
    "Offer",
  );
  if (item.kind !== "enlisted-planner-tasker-offer" || item.version !== 1)
    fail("Choose an Enlisted Planner tasker offer, version 1.");
  textField(item.supervisorName, "Supervisor name");
  const delegation = record(
    item.delegation,
    ["id", "taskId", "recipientName", "recipientEmail", "sentOn"],
    "Delegation",
  );
  textField(delegation.id, "Delegation ID", true);
  textField(delegation.taskId, "Task ID", true);
  textField(delegation.recipientName, "Recipient name", true);
  emailField(delegation.recipientEmail);
  dateField(delegation.sentOn, "Offer date");
  const task = record(
    item.task,
    [
      "id",
      "title",
      "date",
      "suspenseTime",
      "priority",
      "estimatedMinutes",
      "notes",
      "projectTitle",
      "prerequisites",
    ],
    "Task",
  );
  for (const key of ["id", "title", "notes", "projectTitle"])
    textField(task[key], key, key === "id" || key === "title");
  if (task.id !== delegation.taskId) fail("Offer task IDs do not match.");
  dateField(task.date, "Suspense date", false);
  textField(task.suspenseTime, "Suspense time");
  if (task.suspenseTime) {
    try {
      if (minutes(task.suspenseTime) >= 1440)
        fail("Suspense time must be before midnight.");
    } catch {
      fail("Suspense time must be a valid HH:MM clock time.");
    }
  }
  if (!["High", "Normal", "Low"].includes(task.priority as string))
    fail("Task priority is invalid.");
  if (
    task.estimatedMinutes !== null &&
    (typeof task.estimatedMinutes !== "number" ||
      !Number.isFinite(task.estimatedMinutes) ||
      task.estimatedMinutes < 0)
  )
    fail("Estimated effort must be a finite nonnegative number.");
  if (!Array.isArray(task.prerequisites) || task.prerequisites.length > 1000)
    fail("Prerequisites must be a list of up to 1,000 taskers.");
  const ids = new Set<string>();
  for (const value of task.prerequisites) {
    const prerequisite = record(
      value,
      ["id", "title", "completed"],
      "Prerequisite",
    );
    textField(prerequisite.id, "Prerequisite ID", true);
    textField(prerequisite.title, "Prerequisite title", true);
    if (typeof prerequisite.completed !== "boolean")
      fail("Prerequisite completion must be true or false.");
    if (ids.has(prerequisite.id) || prerequisite.id === task.id)
      fail(
        "Prerequisite IDs must be distinct from one another and the tasker.",
      );
    ids.add(prerequisite.id);
  }
  return item as unknown as TaskerOffer;
}

export function parseTaskerUpdate(raw: string): TaskerUpdate {
  const item = record(
    parseJson(raw),
    [
      "kind",
      "version",
      "delegationId",
      "taskId",
      "recipientName",
      "recipientEmail",
      "offeredOn",
      "updatedOn",
      "status",
      "progress",
      "blocker",
      "notes",
    ],
    "Update",
  );
  if (item.kind !== "enlisted-planner-tasker-update" || item.version !== 1)
    fail("Choose an Enlisted Planner tasker update, version 1.");
  for (const key of [
    "delegationId",
    "taskId",
    "recipientName",
    "blocker",
    "notes",
  ])
    textField(item[key], key, !["blocker", "notes"].includes(key));
  emailField(item.recipientEmail);
  dateField(item.offeredOn, "Offer date");
  dateField(item.updatedOn, "Update date");
  if ((item.updatedOn as string) < (item.offeredOn as string))
    fail("An update cannot precede its offer.");
  if (!RECIPIENT_STATUSES.includes(item.status as RecipientStatus))
    fail(
      "Recipients can accept, report progress or blockers, submit work, or decline; only supervisors close taskers.",
    );
  progressField(item.progress);
  if (item.status === "Submitted" && item.progress !== 100)
    fail(
      "Submitted work must report 100% progress. The supervisor still confirms completion.",
    );
  if (item.status === "Blocked" && !(item.blocker as string).trim())
    fail("A blocked update needs a blocker description.");
  return item as unknown as TaskerUpdate;
}

export function buildTaskerOffer(
  state: PlannerState,
  delegation: Delegation,
): TaskerOffer {
  const task = state.tasks.find((value) => value.id === delegation.taskId);
  if (!task) fail("This tasker no longer exists.");
  const offer: TaskerOffer = {
    kind: "enlisted-planner-tasker-offer",
    version: 1,
    delegation: {
      id: delegation.id,
      taskId: delegation.taskId,
      recipientName: delegation.recipientName,
      recipientEmail: delegation.recipientEmail,
      sentOn: delegation.sentOn,
    },
    supervisorName: state.profile.name,
    task: {
      id: task.id,
      title: task.title,
      date: task.date,
      suspenseTime: task.suspenseTime ?? "",
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes ?? null,
      notes: task.notes ?? "",
      projectTitle:
        state.projects.find((project) => project.id === task.projectId)
          ?.title ?? "",
      prerequisites: (task.dependencyIds ?? []).map((id) => {
        const prerequisite = state.tasks.find((value) => value.id === id);
        if (!prerequisite)
          fail(
            "A prerequisite no longer exists. Review the tasker before offering it.",
          );
        return {
          id: prerequisite.id,
          title: prerequisite.title,
          completed: prerequisite.completed,
        };
      }),
    },
  };
  return parseTaskerOffer(JSON.stringify(offer));
}

export function buildTaskerUpdate(
  offer: TaskerOffer,
  input: Pick<TaskerUpdate, "status" | "progress" | "blocker" | "notes">,
  updatedOn = localDate(),
): TaskerUpdate {
  return parseTaskerUpdate(
    JSON.stringify({
      kind: "enlisted-planner-tasker-update",
      version: 1,
      delegationId: offer.delegation.id,
      taskId: offer.task.id,
      recipientName: offer.delegation.recipientName,
      recipientEmail: offer.delegation.recipientEmail,
      offeredOn: offer.delegation.sentOn,
      updatedOn,
      ...input,
    }),
  );
}

export function updateReviewError(
  update: TaskerUpdate,
  state: PlannerState,
  today = localDate(),
): string | null {
  const delegation = state.delegations.find(
    (value) => value.id === update.delegationId,
  );
  if (!delegation || !state.tasks.some((task) => task.id === update.taskId))
    return "The referenced offer or tasker no longer exists in this planner.";
  if (
    delegation.taskId !== update.taskId ||
    delegation.recipientName !== update.recipientName ||
    delegation.recipientEmail.toLowerCase() !==
      update.recipientEmail.toLowerCase() ||
    delegation.sentOn !== update.offeredOn
  )
    return "The update does not match the offer's tasker, recipient, and offer date.";
  if (update.updatedOn > today)
    return "The update is dated in the future. Confirm the date with the recipient.";
  if (update.updatedOn < delegation.updatedOn)
    return "A newer update is already recorded. Ask the recipient for a current update.";
  if (delegation.status === "Closed")
    return "This tasker is already closed. Reopen the work before recording another update.";
  if (
    delegation.status === update.status &&
    delegation.progress === update.progress &&
    delegation.blocker === update.blocker &&
    delegation.notes === update.notes &&
    delegation.updatedOn === update.updatedOn
  )
    return "This update is already recorded.";
  return null;
}

/** Explicit owner approval is the only path from a portable packet to owned state. */
export function applyReviewedUpdate(
  state: PlannerState,
  update: TaskerUpdate,
  today = localDate(),
): void {
  update = parseTaskerUpdate(JSON.stringify(update));
  const error = updateReviewError(update, state, today);
  if (error) fail(error);
  const delegation = state.delegations.find(
    (value) => value.id === update.delegationId,
  )!;
  Object.assign(delegation, {
    status: update.status,
    updatedOn: update.updatedOn,
    progress: update.progress,
    blocker: update.blocker,
    notes: update.notes,
  });
  // Acceptance/submission is a delegation state, never evidence of task completion.
}

export function closeDelegationError(
  state: PlannerState,
  delegation: Delegation,
): string | null {
  const task = state.tasks.find((value) => value.id === delegation.taskId);
  if (!task) return "This tasker no longer exists.";
  if (delegation.status !== "Submitted")
    return "Record and review the recipient's submitted work before closing this tasker.";
  return taskCompletionError(task, state.tasks);
}

export function closeDelegation(
  state: PlannerState,
  id: string,
  today = localDate(),
): void {
  const delegation = state.delegations.find((value) => value.id === id);
  if (!delegation) fail("This offer no longer exists.");
  const error = closeDelegationError(state, delegation);
  if (error) fail(error);
  dateField(today, "Completion date");
  delegation.status = "Closed";
  delegation.updatedOn = today;
  delegation.progress = 100;
  const task = state.tasks.find((value) => value.id === delegation.taskId)!;
  if (!task.completed) task.completedOn = today;
  task.completed = true;
  task.status = "Done";
}
