import { addDays, formatDate, minutes } from "./dates";
import type { BattleRhythm, Task, TimeBlock } from "./types";

export function taskStatus(
  task: Task,
): "Open" | "In progress" | "Blocked" | "Done" {
  return task.completed
    ? "Done"
    : task.status === "Done"
      ? "Open"
      : (task.status ?? "Open");
}

export function taskBlockers(task: Task, tasks: Task[]): Task[] {
  const dependencies = new Set(task.dependencyIds ?? []);
  return tasks.filter(
    (item) => dependencies.has(item.id) && taskStatus(item) !== "Done",
  );
}

export function taskCompletionError(task: Task, tasks: Task[]): string | null {
  const blockers = taskBlockers(task, tasks);
  return blockers.length
    ? `Complete ${blockers.map((item) => `“${item.title}”`).join(", ")} before marking “${task.title}” done.`
    : null;
}

/** Check the proposed graph, including edits to existing taskers. */
export function dependencyError(candidate: Task, tasks: Task[]): string | null {
  const dependencies = candidate.dependencyIds ?? [];
  if (dependencies.includes(candidate.id))
    return "A tasker cannot depend on itself.";
  if (new Set(dependencies).size !== dependencies.length)
    return "Choose each prerequisite only once.";
  const graph = new Map(
    tasks
      .filter((task) => task.id !== candidate.id)
      .map((task) => [task.id, task]),
  );
  graph.set(candidate.id, candidate);
  for (const id of dependencies)
    if (!graph.has(id))
      return "A selected prerequisite no longer exists. Choose another tasker.";
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: { id: string; exiting: boolean }[] = [
    { id: candidate.id, exiting: false },
  ];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.exiting) {
      visiting.delete(current.id);
      visited.add(current.id);
      continue;
    }
    if (visiting.has(current.id))
      return "These prerequisites create a dependency cycle. Remove the link that points back to this tasker.";
    if (visited.has(current.id)) continue;
    visiting.add(current.id);
    stack.push({ id: current.id, exiting: true });
    for (const next of [
      ...(graph.get(current.id)?.dependencyIds ?? []),
    ].reverse())
      stack.push({ id: next, exiting: false });
  }
  return null;
}

export function isTaskOverdue(
  task: Task,
  today: string,
  time?: string,
): boolean {
  if (taskStatus(task) === "Done" || !task.date) return false;
  return (
    task.date < today ||
    (task.date === today &&
      !!time &&
      !!task.suspenseTime &&
      task.suspenseTime < time)
  );
}

export function workSummary(tasks: Task[], today: string, time?: string) {
  const pending = tasks.filter((task) => taskStatus(task) !== "Done");
  return {
    open: pending.length,
    overdue: pending.filter((task) => isTaskOverdue(task, today, time)).length,
    blocked: pending.filter(
      (task) =>
        taskStatus(task) === "Blocked" || taskBlockers(task, tasks).length > 0,
    ).length,
    completed: tasks.length - pending.length,
    estimatedMinutes: pending.reduce(
      (total, task) => total + (task.estimatedMinutes ?? 0),
      0,
    ),
  };
}

export function projectProgress(projectId: string, tasks: Task[]) {
  const linked = tasks.filter((task) => task.projectId === projectId);
  const done = linked.filter((task) => taskStatus(task) === "Done").length;
  return {
    total: linked.length,
    done,
    percent: linked.length ? Math.round((done / linked.length) * 100) : 0,
    milestones: linked.filter((task) => task.kind === "Milestone").length,
    estimatedMinutes: linked
      .filter((task) => taskStatus(task) !== "Done")
      .reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0),
  };
}

export interface RhythmPlan {
  blocks: TimeBlock[];
  skipped: { date: string; reason: string }[];
  error: string | null;
}

/** Preview a bounded calendar window. Missing monthly anchor days are skipped. */
export function buildRhythmPlan(
  rhythm: BattleRhythm,
  from: string,
  to: string,
  existing: TimeBlock[],
  idFactory: () => string = () => crypto.randomUUID(),
): RhythmPlan {
  const result: RhythmPlan = { blocks: [], skipped: [], error: null };
  let start: number, end: number;
  try {
    formatDate(rhythm.startDate);
    formatDate(from);
    formatDate(to);
  } catch {
    return {
      ...result,
      error: "Choose valid start and generation dates with four-digit years.",
    };
  }
  if (!rhythm.title.trim())
    return { ...result, error: "Give your battle rhythm a title." };
  if (from > to)
    return {
      ...result,
      error: "The generation end date must be on or after its start date.",
    };
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000;
  if (span > 365)
    return {
      ...result,
      error: "Generate up to 366 days at a time. Choose a shorter date range.",
    };
  try {
    start = minutes(rhythm.startTime);
    end = minutes(rhythm.endTime);
  } catch {
    return { ...result, error: "Choose valid start and end times." };
  }
  if (start >= 1440 || end <= start)
    return {
      ...result,
      error:
        "End time must follow start time on the same day. Split overnight rhythms into two schedules.",
    };
  const frequencies = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"];
  if (!frequencies.includes(rhythm.frequency))
    return { ...result, error: "Choose a supported recurrence frequency." };
  const anchor = new Date(`${rhythm.startDate}T00:00:00Z`);
  for (let offset = 0; offset <= span; offset++) {
    const date = addDays(from, offset);
    if (date < rhythm.startDate) continue;
    const current = new Date(`${date}T00:00:00Z`);
    const daysSince = (current.getTime() - anchor.getTime()) / 86_400_000;
    const monthsSince =
      (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      current.getUTCMonth() -
      anchor.getUTCMonth();
    const sameDay = current.getUTCDate() === anchor.getUTCDate();
    const occurs =
      rhythm.frequency === "Daily" ||
      (rhythm.frequency === "Weekly" && daysSince % 7 === 0) ||
      (rhythm.frequency === "Monthly" && sameDay) ||
      (rhythm.frequency === "Quarterly" && sameDay && monthsSince % 3 === 0) ||
      (rhythm.frequency === "Yearly" && sameDay && monthsSince % 12 === 0);
    if (!occurs) continue;
    const blocks = existing.filter((block) => block.date === date);
    if (blocks.some((block) => block.rhythmId === rhythm.id)) {
      result.skipped.push({
        date,
        reason: "Already generated for this rhythm.",
      });
      continue;
    }
    const overlap = blocks.find(
      (block) => minutes(block.start) < end && minutes(block.end) > start,
    );
    if (overlap) {
      result.skipped.push({
        date,
        reason: `Overlaps “${overlap.title}” (${overlap.start}–${overlap.end}).`,
      });
      continue;
    }
    result.blocks.push({
      id: idFactory(),
      date,
      start: rhythm.startTime,
      end: rhythm.endTime,
      title: rhythm.title.trim(),
      category: rhythm.category,
      notes: rhythm.notes,
      completed: false,
      rhythmId: rhythm.id,
    });
  }
  return result;
}
