import { addDays, minutes } from "./dates";
import type {
  BlockCategory,
  Page,
  PlannerState,
  Task,
  WeeklyReview,
} from "./types";

export interface ReviewWeek {
  start: string;
  end: string;
}

/** Monday–Sunday calendar weeks, independent of the device's UTC offset. */
export function reviewWeek(containingDate: string): ReviewWeek {
  addDays(containingDate, 0);
  const weekday = new Date(`${containingDate}T00:00:00Z`).getUTCDay();
  const start = addDays(containingDate, -((weekday + 6) % 7));
  let end: string;
  try {
    end = addDays(start, 6);
  } catch {
    end = "9999-12-31";
  }
  return { start, end };
}

export function followingReviewWeek(week: ReviewWeek): ReviewWeek | null {
  try {
    return reviewWeek(addDays(week.start, 7));
  } catch {
    return null;
  }
}

export interface ReviewFollowUp {
  id: string;
  title: string;
  date: string;
  detail: string;
  page: Page;
}

export function buildWeeklyReview(
  state: PlannerState,
  containingDate: string,
  asOf: string,
) {
  const week = reviewWeek(containingDate);
  addDays(asOf, 0);
  const nextWeek = followingReviewWeek(week);
  const memberNames = new Map(
    state.members.map((member) => [member.id, member.name]),
  );
  const capturedTaskIds = new Set(
    state.captures.flatMap((capture) =>
      capture.taskId ? [capture.taskId] : [],
    ),
  );
  const within = (date: string) =>
    !!date && date >= week.start && date <= week.end;
  const blocks = state.blocks.filter((block) => within(block.date));
  const duration = (block: (typeof blocks)[number]) =>
    minutes(block.end) - minutes(block.start);
  const completedTasks = state.tasks.filter(
    (task) => task.completed && !!task.completedOn && within(task.completedOn),
  );
  const captures = state.captures.filter((capture) => within(capture.date));
  const pending = state.tasks.filter((task) => !task.completed);
  const scheduledIds = new Set(
    blocks.flatMap((block) => (block.taskId ? [block.taskId] : [])),
  );
  const carryCandidates = pending
    .filter(
      (task) =>
        !task.date ||
        task.date <= (nextWeek?.end ?? week.end) ||
        scheduledIds.has(task.id),
    )
    .sort(
      (a, b) =>
        (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") ||
        a.title.localeCompare(b.title),
    );
  const overdueTasks = pending.filter(
    (task) => !!task.date && task.date <= week.end && task.date < asOf,
  );
  const followUps: ReviewFollowUp[] = [];
  for (const member of state.members) {
    if (member.nextFeedback && member.nextFeedback <= week.end)
      followUps.push({
        id: `member:${member.id}`,
        title: `Feedback with ${member.name}`,
        date: member.nextFeedback,
        detail: member.focus || "Review their goals and assigned work.",
        page: "leadership",
      });
  }
  for (const action of state.developmentActions) {
    if (
      action.status !== "Complete" &&
      action.dueDate &&
      action.dueDate <= week.end
    )
      followUps.push({
        id: `development:${action.id}`,
        title: action.title,
        date: action.dueDate,
        detail: `${action.kind} · ${memberNames.get(action.memberId) || "Review teammate"}`,
        page: "leadership",
      });
  }
  for (const plan of state.disciplinePlans) {
    if (
      plan.status !== "Closed" &&
      plan.followUpDate &&
      plan.followUpDate <= week.end
    )
      followUps.push({
        id: `discipline:${plan.id}`,
        title: plan.title,
        date: plan.followUpDate,
        detail: `Support follow-up · ${memberNames.get(plan.memberId) || "Review teammate"}`,
        page: "leadership",
      });
  }
  followUps.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
  const categories: {
    category: BlockCategory;
    plannedMinutes: number;
    completedMinutes: number;
  }[] = ["Duty", "Development", "Fitness", "Personal"].map((category) => {
    const matching = blocks.filter((block) => block.category === category);
    return {
      category: category as BlockCategory,
      plannedMinutes: matching.reduce((sum, block) => sum + duration(block), 0),
      completedMinutes: matching
        .filter((block) => block.completed)
        .reduce((sum, block) => sum + duration(block), 0),
    };
  });
  return {
    week,
    nextWeek,
    metrics: {
      plannedMinutes: blocks.reduce((sum, block) => sum + duration(block), 0),
      completedBlockMinutes: blocks
        .filter((block) => block.completed)
        .reduce((sum, block) => sum + duration(block), 0),
      completedTaskCount: completedTasks.length,
      captureCount: captures.length,
    },
    categories,
    completedTasks,
    unknownCompletionDates: state.tasks.filter(
      (task) => task.completed && !task.completedOn,
    ).length,
    unfinishedBlocks: blocks.filter((block) => !block.completed),
    overdueTasks,
    followUps,
    captures,
    captureGaps: captures.filter(
      (capture) => !capture.actions.trim() || !capture.outcome.trim(),
    ),
    uncapturedTasks: completedTasks.filter(
      (task) => !capturedTaskIds.has(task.id),
    ),
    carryCandidates,
  };
}

export function carryForwardReasons(
  task: Task,
  state: PlannerState,
  asOf: string,
): string[] {
  const reasons: string[] = [];
  if (!task.date) reasons.push("No suspense recorded");
  else if (task.date < asOf)
    reasons.push(
      `Suspense ${task.date} has passed; agree on recovery before scheduling`,
    );
  else
    reasons.push(
      `Suspense ${task.date}${task.suspenseTime ? ` at ${task.suspenseTime}` : ""}`,
    );
  const blockers = (task.dependencyIds ?? [])
    .map((id) => state.tasks.find((item) => item.id === id))
    .filter((item): item is Task => !!item && !item.completed);
  if (blockers.length)
    reasons.push(
      `Prerequisites: ${blockers.map((item) => item.title).join(", ")}`,
    );
  else if (task.status === "Blocked")
    reasons.push("Marked blocked; review the blocker first");
  if (task.assigneeId) {
    const member = state.members.find((item) => item.id === task.assigneeId);
    if (member)
      reasons.push(`Assigned to ${member.name}; coordinate their availability`);
  }
  const project = state.projects.find((item) => item.id === task.projectId);
  if (project) reasons.push(`Project: ${project.title}`);
  const objective = state.objectives.find(
    (item) => item.id === (task.objectiveId || project?.objectiveId),
  );
  if (objective) reasons.push(`Priority: ${objective.title}`);
  return reasons;
}

export interface WeeklyReflection {
  wins: string;
  lessons: string;
  nextFocus: string;
  carriedTaskIds: string[];
}

/** Saving a reflection records choices and metrics. It does not alter suspenses or blocks. */
export function createWeeklyReview(
  state: PlannerState,
  containingDate: string,
  reviewedOn: string,
  reflection: WeeklyReflection,
  id: string,
): WeeklyReview {
  const summary = buildWeeklyReview(state, containingDate, reviewedOn);
  const candidates = new Set(summary.carryCandidates.map((task) => task.id));
  return {
    id,
    weekStart: summary.week.start,
    reviewedOn,
    wins: reflection.wins.trim(),
    lessons: reflection.lessons.trim(),
    nextFocus: reflection.nextFocus.trim(),
    carriedTaskIds: [...new Set(reflection.carriedTaskIds)].filter((taskId) =>
      candidates.has(taskId),
    ),
    metrics: { ...summary.metrics },
  };
}

export function reviewDuration(value: number): string {
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  return hours
    ? `${hours}h${remainder ? ` ${remainder}m` : ""}`
    : `${remainder}m`;
}
