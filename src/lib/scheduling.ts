import { addDays, localDate, minutes, occursOn, timeString } from "./dates";
import type {
  PlannerState,
  PlanningPreferences,
  Task,
  TimeBlock,
} from "./types";

type Interval = { start: number; end: number };
type Point = { date: string; minute: number };
export interface ScheduleSuggestion {
  block: TimeBlock;
  reason: string;
}
export interface ScheduleResult {
  suggestions: ScheduleSuggestion[];
  unscheduled: { taskId: string; reason: string }[];
  availableMinutes: number;
}
export interface PlanningTime {
  date: string;
  time: string;
}
const PROPOSAL_LIMIT = 500;

/** Read device-local time; round forward so a proposed block never starts in the past. */
export function currentPlanningTime(value = new Date()): PlanningTime {
  let date = localDate(value);
  let minute = value.getHours() * 60 + value.getMinutes();
  if (value.getSeconds() || value.getMilliseconds()) minute += 1;
  if (minute === 1440) {
    date = addDays(date, 1);
    minute = 0;
  }
  return { date, time: timeString(minute) };
}

/** Recovery checks use the actual minute, never the forward-rounded proposal clock. */
export function currentRecoveryTime(value = new Date()): PlanningTime {
  return {
    date: localDate(value),
    time: timeString(value.getHours() * 60 + value.getMinutes()),
  };
}

/** Return only ended, unfinished allocations for taskers accepted into a replacement plan. */
export function missedTaskAllocations(
  state: PlannerState,
  taskIds: string[],
  now: PlanningTime = currentRecoveryTime(),
): TimeBlock[] {
  addDays(now.date, 0);
  const minute = minutes(now.time),
    tasks = new Set(taskIds);
  return state.blocks
    .filter(
      (block) =>
        block.taskId &&
        tasks.has(block.taskId) &&
        !block.completed &&
        (block.date < now.date ||
          (block.date === now.date && minutes(block.end) <= minute)),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.id.localeCompare(b.id),
    );
}

/** Require the exact historical allocations shown in the review before detaching any link. */
export function recoverySelectionError(
  state: PlannerState,
  preview: TimeBlock[],
  taskIds: string[],
  now: PlanningTime = currentRecoveryTime(),
): string | null {
  const selected = new Set(taskIds);
  const reviewed = preview.filter(
    (block) => block.taskId && selected.has(block.taskId),
  );
  const latest = missedTaskAllocations(state, taskIds, now);
  return JSON.stringify(reviewed) === JSON.stringify(latest)
    ? null
    : "Missed allocations changed or another block has ended. Generate proposals again to review the recovery history.";
}

export function planningPreferencesError(
  preferences: PlanningPreferences,
): string | null {
  if (
    !Array.isArray(preferences.workingDays) ||
    preferences.workingDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(preferences.workingDays).size !== preferences.workingDays.length
  )
    return "Choose each working day only once.";
  try {
    if (
      minutes(preferences.dayStart) >= minutes(preferences.dayEnd) ||
      minutes(preferences.dayStart) >= 1440
    )
      return "Working hours must end after they start. Split overnight duty across two days.";
    if (Boolean(preferences.breakStart) !== Boolean(preferences.breakEnd))
      return "Set both break times or leave both blank.";
    if (
      preferences.breakStart &&
      minutes(preferences.breakStart) >= minutes(preferences.breakEnd)
    )
      return "Your break must end after it starts.";
  } catch {
    return "Enter valid working hours and break times.";
  }
  if (
    !Number.isInteger(preferences.maxBlockMinutes) ||
    preferences.maxBlockMinutes < 1 ||
    preferences.maxBlockMinutes > 480
  )
    return "Maximum block length must be a whole number from 1 to 480 minutes.";
  if (
    !Number.isInteger(preferences.eventBufferMinutes) ||
    preferences.eventBufferMinutes < 0 ||
    preferences.eventBufferMinutes > 180
  )
    return "Appointment buffer must be a whole number from 0 to 180 minutes.";
  return null;
}

function comparePoint(a: Point, b: Point): number {
  return a.date.localeCompare(b.date) || a.minute - b.minute;
}
function taskDeadline(task: Task): Point {
  return {
    date: task.date || "9999-12-31",
    minute: task.date && task.suspenseTime ? minutes(task.suspenseTime) : 1440,
  };
}
function effort(task: Task): number {
  return task.estimatedMinutes && task.estimatedMinutes > 0
    ? Math.ceil(task.estimatedMinutes)
    : 30;
}
function union(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of intervals
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result[result.length - 1];
    if (last && last.end >= item.start) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
function subtract(intervals: Interval[], busy: Interval[]): Interval[] {
  let result = intervals;
  for (const occupied of union(busy)) {
    result = result.flatMap((slot) => {
      if (occupied.end <= slot.start || occupied.start >= slot.end)
        return [slot];
      const pieces: Interval[] = [];
      if (occupied.start > slot.start)
        pieces.push({ start: slot.start, end: occupied.start });
      if (occupied.end < slot.end)
        pieces.push({ start: occupied.end, end: slot.end });
      return pieces;
    });
  }
  return result;
}
function duration(intervals: Interval[]): number {
  return intervals.reduce((total, item) => total + item.end - item.start, 0);
}

/** Count actual completed effort and still-usable allocations, avoiding overlapping double counts. */
function coverage(
  task: Task,
  blocks: TimeBlock[],
  now: PlanningTime,
  notBefore: Point = { date: now.date, minute: minutes(now.time) },
) {
  const deadline = taskDeadline(task);
  const completed = new Map<string, Interval[]>();
  const future = new Map<string, Interval[]>();
  for (const block of blocks) {
    if (block.taskId !== task.id) continue;
    const start = minutes(block.start),
      end = minutes(block.end);
    // A fixed allocation ending after the suspense does not establish on-time readiness.
    if (comparePoint({ date: block.date, minute: end }, deadline) > 0) continue;
    if (block.completed) {
      const existing = completed.get(block.date) ?? [];
      existing.push({ start, end });
      completed.set(block.date, existing);
    } else if (block.date >= now.date && block.date >= notBefore.date) {
      const usableStart = Math.max(
        start,
        block.date === now.date ? minutes(now.time) : 0,
        block.date === notBefore.date ? notBefore.minute : 0,
      );
      if (usableStart < end) {
        const existing = future.get(block.date) ?? [];
        existing.push({ start: usableStart, end });
        future.set(block.date, existing);
      }
    }
  }
  let credited = 0;
  for (const intervals of completed.values())
    credited += duration(union(intervals));
  let needed = Math.max(0, effort(task) - credited);
  let ready: Point =
    comparePoint(notBefore, { date: now.date, minute: minutes(now.time) }) > 0
      ? notBefore
      : { date: now.date, minute: minutes(now.time) };
  for (const date of [...future.keys()].sort()) {
    const slots = subtract(union(future.get(date)!), completed.get(date) ?? []);
    for (const slot of slots) {
      credited += slot.end - slot.start;
      if (needed > 0) {
        needed -= slot.end - slot.start;
        ready = { date, minute: slot.end };
      }
    }
  }
  return { remaining: Math.max(0, effort(task) - credited), ready };
}

/** Existing allocations are usable only when their full prerequisite chain is also ready. */
function existingReadiness(
  state: PlannerState,
  blocks: TimeBlock[],
  now: PlanningTime,
): Map<string, Point> {
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const ready = new Map<string, Point>();
  const children = new Map<string, string[]>(),
    remaining = new Map<string, number>();
  const queue: string[] = [];
  for (const task of state.tasks) {
    const parents = task.completed
      ? []
      : (task.dependencyIds ?? []).filter((id) => !tasks.get(id)?.completed);
    remaining.set(task.id, parents.length);
    if (!parents.length) queue.push(task.id);
    for (const parent of parents) {
      const rows = children.get(parent) ?? [];
      rows.push(task.id);
      children.set(parent, rows);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const task = tasks.get(queue[index])!;
    let earliest: Point = { date: now.date, minute: minutes(now.time) };
    let blocked = task.status === "Blocked";
    for (const parentId of task.completed ? [] : (task.dependencyIds ?? [])) {
      const parent = tasks.get(parentId);
      if (parent?.completed) continue;
      const available = ready.get(parentId);
      if (!available) {
        blocked = true;
        break;
      }
      if (comparePoint(available, earliest) > 0) earliest = available;
    }
    if (task.completed) ready.set(task.id, earliest);
    else if (!blocked) {
      const allocated = coverage(task, blocks, now, earliest);
      if (!allocated.remaining) ready.set(task.id, allocated.ready);
    }
    for (const child of children.get(task.id) ?? []) {
      remaining.set(child, remaining.get(child)! - 1);
      if (!remaining.get(child)) queue.push(child);
    }
  }
  return ready;
}

function planningDays(from: string, to: string): string[] {
  addDays(from, 0);
  addDays(to, 0);
  if (to < from)
    throw new RangeError("Choose an end date on or after the start date.");
  const dates: string[] = [];
  let date = from;
  while (date <= to && dates.length < 31) {
    dates.push(date);
    if (date === to) return dates;
    date = addDays(date, 1);
  }
  throw new RangeError("Plan up to 31 days at a time.");
}

/** Deadline-first, dependency-aware proposals. All existing time blocks stay fixed. */
export function buildSchedule(
  state: PlannerState,
  taskIds: string[],
  from: string,
  to: string,
  preferences: PlanningPreferences,
  now: PlanningTime = currentPlanningTime(),
): ScheduleResult {
  const preferenceError = planningPreferencesError(preferences);
  if (preferenceError) throw new RangeError(preferenceError);
  const dates = planningDays(from, to);
  addDays(now.date, 0);
  minutes(now.time);
  const daySet = new Set(preferences.workingDays);
  const free = new Map<string, Interval[]>();
  for (const date of dates) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!daySet.has(weekday) || date < now.date) {
      free.set(date, []);
      continue;
    }
    const start = Math.max(
      minutes(preferences.dayStart),
      date === now.date ? minutes(now.time) : 0,
    );
    const end = minutes(preferences.dayEnd);
    const busy: Interval[] = state.blocks
      .filter((block) => block.date === date)
      .map((block) => ({
        start: minutes(block.start),
        end: minutes(block.end),
      }));
    if (preferences.breakStart)
      busy.push({
        start: minutes(preferences.breakStart),
        end: minutes(preferences.breakEnd),
      });
    const buffer = preferences.eventBufferMinutes;
    // Buffers can cross midnight, including an appointment just outside the selected range.
    for (const offset of [-1, 0, 1]) {
      let appointmentDate: string;
      try {
        appointmentDate = addDays(date, offset);
      } catch {
        continue;
      }
      const eventTimes = state.events
        .filter((event) => event.time && occursOn(event, appointmentDate))
        .map((event) => minutes(event.time) + offset * 1440);
      // Meetings reserve the same buffer even before an optional calendar link is created.
      eventTimes.push(
        ...state.meetings
          .filter((meeting) => meeting.date === appointmentDate && meeting.time)
          .map((meeting) => minutes(meeting.time) + offset * 1440),
      );
      for (const time of eventTimes) {
        const start = Math.max(0, time - buffer),
          end = Math.min(1440, time + Math.max(1, buffer));
        if (start < end) busy.push({ start, end });
      }
    }
    free.set(date, start < end ? subtract([{ start, end }], busy) : []);
  }
  const availableMinutes = [...free.values()].reduce(
    (sum, intervals) => sum + duration(intervals),
    0,
  );
  const suggestions: ScheduleSuggestion[] = [],
    unscheduled: ScheduleResult["unscheduled"] = [];
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const selectedIds = [...new Set(taskIds)];
  const selected = new Map(
    selectedIds.filter((id) => tasks.has(id)).map((id) => [id, tasks.get(id)!]),
  );
  for (const id of selectedIds)
    if (!tasks.has(id))
      unscheduled.push({ taskId: id, reason: "This tasker no longer exists." });
  const children = new Map<string, string[]>(),
    indegree = new Map<string, number>();
  for (const task of selected.values()) {
    const parents = (task.dependencyIds ?? []).filter(
      (id) => selected.has(id) && !tasks.get(id)!.completed,
    );
    indegree.set(task.id, parents.length);
    for (const parent of parents) {
      const rows = children.get(parent) ?? [];
      rows.push(task.id);
      children.set(parent, rows);
    }
  }
  const effectiveDeadlines = new Map(
    [...selected.values()].map((task) => [task.id, taskDeadline(task)]),
  );
  // A prerequisite inherits an earlier selected dependent's deadline for ordering, never for storage.
  const topology: string[] = [],
    counts = new Map(indegree),
    queue = [...selected.keys()].filter((id) => !counts.get(id));
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    topology.push(id);
    for (const child of children.get(id) ?? []) {
      counts.set(child, counts.get(child)! - 1);
      if (!counts.get(child)) queue.push(child);
    }
  }
  for (const id of [...topology].reverse())
    for (const parent of selected.get(id)!.dependencyIds ?? []) {
      if (
        effectiveDeadlines.has(parent) &&
        comparePoint(
          effectiveDeadlines.get(id)!,
          effectiveDeadlines.get(parent)!,
        ) < 0
      )
        effectiveDeadlines.set(parent, effectiveDeadlines.get(id)!);
    }
  const priority = { High: 0, Normal: 1, Low: 2 };
  const compareIds = (a: string, b: string) =>
    comparePoint(effectiveDeadlines.get(a)!, effectiveDeadlines.get(b)!) ||
    priority[selected.get(a)!.priority] - priority[selected.get(b)!.priority] ||
    a.localeCompare(b);
  const ready = [...selected.keys()]
    .filter((id) => !indegree.get(id))
    .sort(compareIds);
  const planned = new Map<string, Point>();
  const processed = new Set<string>();
  const allocated = [...state.blocks];
  const existingReady = existingReadiness(state, allocated, now);
  while (ready.length) {
    const id = ready.shift()!,
      task = selected.get(id)!;
    processed.add(id);
    if (task.completed)
      unscheduled.push({
        taskId: id,
        reason: "Already complete; no new block is needed.",
      });
    else if (task.status === "Blocked")
      unscheduled.push({
        taskId: id,
        reason:
          "Marked Blocked. Resolve the recorded blocker before scheduling.",
      });
    else {
      const deadline = taskDeadline(task);
      let earliest: Point = {
        date: from > now.date ? from : now.date,
        minute: from > now.date ? 0 : minutes(now.time),
      };
      let blocker = "";
      for (const parentId of task.dependencyIds ?? []) {
        const parent = tasks.get(parentId);
        if (!parent) {
          blocker =
            "A prerequisite no longer exists. Repair its tasker link first.";
          break;
        }
        if (parent.completed) continue;
        const parentReady =
          planned.get(parentId) ?? existingReady.get(parentId);
        if (!parentReady) {
          blocker = `Prerequisite “${parent.title}” needs an on-time plan or completion first. Select it for planning or resolve its blocker.`;
          break;
        }
        if (comparePoint(parentReady, earliest) > 0) earliest = parentReady;
      }
      const ownCoverage = coverage(task, allocated, now, earliest);
      if (blocker) unscheduled.push({ taskId: id, reason: blocker });
      else if (
        comparePoint(deadline, { date: now.date, minute: minutes(now.time) }) <=
        0
      )
        unscheduled.push({
          taskId: id,
          reason:
            "Its suspense has passed. Confirm a new suspense or handle the overdue work manually; no deadline was changed.",
        });
      else if (ownCoverage.remaining === 0) {
        planned.set(id, ownCoverage.ready);
        unscheduled.push({
          taskId: id,
          reason:
            "Effort is already covered by completed work and on-time linked blocks; no extra block is needed.",
        });
      } else {
        let remaining = ownCoverage.remaining;
        const candidates: TimeBlock[] = [];
        let last: Point | null = null;
        for (const date of dates) {
          if (date < earliest.date || date > deadline.date || remaining <= 0)
            continue;
          for (const slot of free.get(date) ?? []) {
            let start = Math.max(
              slot.start,
              date === earliest.date ? earliest.minute : 0,
            );
            const end = Math.min(
              slot.end,
              date === deadline.date ? deadline.minute : 1440,
            );
            while (
              start < end &&
              remaining > 0 &&
              suggestions.length + candidates.length < PROPOSAL_LIMIT
            ) {
              const length = Math.min(
                preferences.maxBlockMinutes,
                remaining,
                end - start,
              );
              const finish = start + length;
              candidates.push({
                id: `proposal:${id}:${date}:${timeString(start)}:${timeString(finish)}`,
                date,
                start: timeString(start),
                end: timeString(finish),
                title: task.title,
                category: "Duty",
                notes:
                  "Accepted scheduling suggestion; existing commitments and appointment buffers preserved.",
                completed: false,
                taskId: id,
              });
              remaining -= length;
              start = finish;
              last = { date, minute: finish };
            }
          }
        }
        // Incomplete task allocations are not promised as a dependency-ready plan.
        if (remaining > 0) {
          const capacity = [...free.values()].reduce(
            (sum, intervals) => sum + duration(intervals),
            0,
          );
          unscheduled.push({
            taskId: id,
            reason:
              suggestions.length + candidates.length >= PROPOSAL_LIMIT
                ? "The 500-block proposal limit was reached. Apply a smaller batch and plan again."
                : `${ownCoverage.remaining} minutes remain, but only ${ownCoverage.remaining - remaining} fit before its suspense after prerequisites. ${capacity === 0 ? "No free working time remains in this range." : "Adjust working hours, reduce the selection, or review its effort and suspense."} No deadline was changed.`,
          });
        } else {
          for (const block of candidates) {
            free.set(
              block.date,
              subtract(free.get(block.date)!, [
                { start: minutes(block.start), end: minutes(block.end) },
              ]),
            );
            allocated.push(block);
          }
          let completion = last!;
          if (comparePoint(ownCoverage.ready, completion) > 0)
            completion = ownCoverage.ready;
          planned.set(id, completion);
          const reason = `${task.priority} priority${task.assigneeId ? `; owner ${state.members.find((member) => member.id === task.assigneeId)?.name ?? "unavailable"}` : ""}; ${task.date ? `suspense ${task.date}${task.suspenseTime ? ` at ${task.suspenseTime}` : ""}` : "no suspense recorded; planned within the selected range"}. ${task.dependencyIds?.length ? "Placed after prerequisite allocations. " : ""}${!task.estimatedMinutes || task.estimatedMinutes <= 0 ? "No positive effort estimate recorded; used a 30-minute planning allowance." : `${effort(task)} minutes of recorded effort; existing usable allocations deducted.`}`;
          suggestions.push(...candidates.map((block) => ({ block, reason })));
        }
      }
    }
    for (const child of children.get(id) ?? []) {
      indegree.set(child, indegree.get(child)! - 1);
      if (!indegree.get(child)) {
        let at = 0;
        while (at < ready.length && compareIds(ready[at], child) <= 0) at += 1;
        ready.splice(at, 0, child);
      }
    }
  }
  for (const id of selected.keys())
    if (!processed.has(id))
      unscheduled.push({
        taskId: id,
        reason:
          "A prerequisite cycle prevents planning. Repair the tasker links first.",
      });
  return { suggestions, unscheduled, availableMinutes };
}

/** Rebuild against current source records/time and enforce prerequisite choices before writing. */
export function scheduleSelectionError(
  state: PlannerState,
  taskIds: string[],
  from: string,
  to: string,
  preferences: PlanningPreferences,
  proposals: ScheduleSuggestion[],
  selectedIds: string[],
  now: PlanningTime = currentPlanningTime(),
): string | null {
  if (!selectedIds.length)
    return "Select at least one proposed block to apply.";
  const selected = new Set(selectedIds);
  const chosen = proposals.filter((proposal) =>
    selected.has(proposal.block.id),
  );
  if (chosen.length !== selected.size)
    return "A selected proposal no longer exists. Generate proposals again.";
  let fresh: ScheduleResult;
  try {
    fresh = buildSchedule(state, taskIds, from, to, preferences, now);
  } catch (error) {
    return error instanceof Error ? error.message : "Generate proposals again.";
  }
  const freshById = new Map(
    fresh.suggestions.map((proposal) => [proposal.block.id, proposal]),
  );
  for (const proposal of chosen) {
    if (
      JSON.stringify(freshById.get(proposal.block.id)) !==
      JSON.stringify(proposal)
    )
      return "The plan or current time changed. Generate proposals again before applying these blocks.";
  }
  const blocks = [...state.blocks, ...chosen.map((proposal) => proposal.block)];
  const readiness = existingReadiness(state, blocks, now);
  for (const proposal of chosen) {
    const task = state.tasks.find((item) => item.id === proposal.block.taskId)!;
    for (const parentId of task.dependencyIds ?? []) {
      const parent = state.tasks.find((item) => item.id === parentId);
      if (parent?.completed) continue;
      if (!parent || parent.status === "Blocked")
        return "An unfinished prerequisite is unavailable. Review the tasker links first.";
      const parentReady = readiness.get(parentId);
      if (
        !parentReady ||
        comparePoint(parentReady, {
          date: proposal.block.date,
          minute: minutes(proposal.block.start),
        }) > 0
      )
        return `Include all required prerequisite blocks for “${parent.title}” before applying dependent work.`;
    }
  }
  for (const taskId of new Set(
    chosen.map((proposal) => proposal.block.taskId),
  )) {
    const allForTask = proposals.filter(
      (proposal) => proposal.block.taskId === taskId,
    );
    if (allForTask.some((proposal) => !selected.has(proposal.block.id)))
      return `Select all proposed blocks for “${allForTask[0].block.title}” so the accepted plan covers its full remaining effort.`;
  }
  return null;
}
