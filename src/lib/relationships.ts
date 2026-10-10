import type { CalendarEvent, PlannerState, Task } from "./types";
import { localDate } from "./dates";

export type PlannerRecordCollection =
  | "tasks"
  | "projects"
  | "members"
  | "objectives"
  | "contacts"
  | "developmentActions"
  | "disciplinePlans"
  | "meetings"
  | "battleRhythms"
  | "careerPlans"
  | "goals"
  | "careerRequirements"
  | "weeklyReviews"
  | "delegations";

type EventLink =
  | "memberId"
  | "developmentActionId"
  | "disciplinePlanId"
  | "meetingId"
  | "goalId";

const eventKinds = {
  members: ["member", "memberId"],
  developmentActions: ["developmentAction", "developmentActionId"],
  disciplinePlans: ["disciplinePlan", "disciplinePlanId"],
  meetings: ["meeting", "meetingId"],
  goals: ["goal", "goalId"],
} as const;

/** Delete one record while retaining the work and evidence that referred to it. */
export function removePlannerRecord(
  state: PlannerState,
  collection: PlannerRecordCollection,
  id: string,
): void {
  // A missing target is a no-op, so a stale delete action cannot clear newer links.
  if (!state[collection].some((record) => record.id === id)) return;
  const records = state[collection];
  for (let index = records.length - 1; index >= 0; index--) {
    if (records[index].id === id) records.splice(index, 1);
  }

  switch (collection) {
    case "tasks":
      for (const review of state.weeklyReviews)
        review.carriedTaskIds = review.carriedTaskIds.filter(
          (taskId) => taskId !== id,
        );
      for (const delegation of state.delegations)
        if (delegation.taskId === id) delegation.taskId = "";
      for (const block of state.blocks)
        if (block.taskId === id) delete block.taskId;
      for (const capture of state.captures)
        if (capture.taskId === id) delete capture.taskId;
      for (const action of state.developmentActions)
        if (action.taskId === id) delete action.taskId;
      for (const plan of state.careerPlans)
        for (const item of plan.checklist)
          if (item.taskId === id) delete item.taskId;
      for (const task of state.tasks)
        if (task.dependencyIds?.includes(id))
          task.dependencyIds = task.dependencyIds.filter(
            (dependency) => dependency !== id,
          );
      break;
    case "projects":
      for (const task of state.tasks)
        if (task.projectId === id) delete task.projectId;
      for (const capture of state.captures)
        if (capture.projectId === id) delete capture.projectId;
      break;
    case "members":
      for (const task of state.tasks)
        if (task.assigneeId === id) delete task.assigneeId;
      for (const project of state.projects)
        if (project.ownerId === id) project.ownerId = "";
      for (const member of state.members)
        if (member.supervisorId === id) delete member.supervisorId;
      for (const capture of state.captures)
        if (capture.memberIds?.includes(id))
          capture.memberIds = capture.memberIds.filter(
            (memberId) => memberId !== id,
          );
      for (const action of state.developmentActions)
        if (action.memberId === id) action.memberId = "";
      for (const plan of state.disciplinePlans)
        if (plan.memberId === id) plan.memberId = "";
      break;
    case "objectives":
      for (const objective of state.objectives)
        if (objective.parentId === id) objective.parentId = "";
      for (const project of state.projects)
        if (project.objectiveId === id) project.objectiveId = "";
      for (const task of state.tasks)
        if (task.objectiveId === id) delete task.objectiveId;
      for (const capture of state.captures)
        if (capture.objectiveId === id) delete capture.objectiveId;
      for (const goal of state.goals)
        if (goal.objectiveId === id) delete goal.objectiveId;
      break;
    case "contacts":
      for (const member of state.members)
        if (member.contactId === id) delete member.contactId;
      break;
    case "meetings":
      for (const task of state.tasks)
        if (task.meetingId === id) delete task.meetingId;
      break;
    case "battleRhythms":
      for (const block of state.blocks)
        if (block.rhythmId === id) delete block.rhythmId;
      break;
    case "careerPlans":
      for (const task of state.tasks)
        if (task.careerPlanId === id) delete task.careerPlanId;
      for (const goal of state.goals)
        if (goal.sourceRef === `career-plan:${id}`) delete goal.sourceRef;
      break;
  }

  if (collection in eventKinds) {
    const [kind, link] = eventKinds[collection as keyof typeof eventKinds];
    const generatedId = `linked:${kind}:${id}`;
    state.events = state.events.filter((event) => event.id !== generatedId);
    for (const event of state.events)
      if (event[link] === id) delete event[link];
  }
}

function setCompletion(task: Task, completed: boolean): void {
  task.completed = completed;
  task.status = completed
    ? "Done"
    : task.status && task.status !== "Done"
      ? task.status
      : "Open";
}

function synchronizeCompletion(
  draft: PlannerState,
  previous?: PlannerState,
): void {
  const previousTasks = new Map(previous?.tasks.map((task) => [task.id, task]));
  const previousBlocks = new Map(
    previous?.blocks.map((block) => [block.id, block]),
  );
  const previousActions = new Map(
    previous?.developmentActions.map((action) => [action.id, action]),
  );
  const previousPlans = new Map(
    previous?.careerPlans.map((plan) => [plan.id, plan]),
  );
  const currentPlans = new Map(
    draft.careerPlans.map((plan) => [plan.id, plan]),
  );
  const previousChecklist = new Map(
    previous?.careerPlans.map((plan) => [
      plan.id,
      new Map(plan.checklist.map((item) => [item.id, item])),
    ]),
  );
  const blocksByTask = new Map<string, PlannerState["blocks"]>();
  for (const block of draft.blocks) {
    if (!block.taskId) continue;
    const linked = blocksByTask.get(block.taskId) ?? [];
    linked.push(block);
    blocksByTask.set(block.taskId, linked);
  }
  const actionsByTask = new Map<string, PlannerState["developmentActions"]>();
  for (const action of draft.developmentActions) {
    if (!action.taskId) continue;
    const linked = actionsByTask.get(action.taskId) ?? [];
    linked.push(action);
    actionsByTask.set(action.taskId, linked);
  }
  const checklistByTask = new Map<
    string,
    {
      planId: string;
      item: PlannerState["careerPlans"][number]["checklist"][number];
    }[]
  >();
  for (const plan of draft.careerPlans) {
    for (const item of plan.checklist) {
      if (!item.taskId) continue;
      const linked = checklistByTask.get(item.taskId) ?? [];
      linked.push({ planId: plan.id, item });
      checklistByTask.set(item.taskId, linked);
    }
  }
  const candidates = new Map<
    string,
    { completed: boolean; explicit: boolean }
  >();
  for (const task of draft.tasks) {
    const before = previousTasks.get(task.id);
    const blocks = blocksByTask.get(task.id) ?? [];
    const completedChanged = before && before.completed !== task.completed;
    const statusChanged = before && before.status !== task.status;
    let explicitCompletion = Boolean(
      completedChanged ||
      (statusChanged &&
        (before.completed ||
          before.status === "Done" ||
          task.status === "Done")),
    );

    // Existing screens toggle completed; newer screens change status. The field
    // actually changed by the caller is authoritative, including reopening.
    let completed = completedChanged
      ? task.completed
      : statusChanged
        ? task.status === "Done"
        : task.completed || task.status === "Done";

    // Structured development and career work can complete or reopen a task.
    // Direct edits to the task take precedence if both were edited together.
    if (!explicitCompletion) {
      const changedActions = (actionsByTask.get(task.id) ?? []).filter(
        (action) => {
          const oldAction = previousActions.get(action.id);
          return oldAction
            ? (oldAction.taskId !== action.taskId &&
                action.status === "Complete") ||
                (oldAction.status !== action.status &&
                  (oldAction.status === "Complete" ||
                    action.status === "Complete"))
            : action.status === "Complete";
        },
      );
      const changedChecklist = (checklistByTask.get(task.id) ?? []).filter(
        ({ planId, item }) => {
          const oldItem = previousChecklist.get(planId)?.get(item.id);
          return oldItem
            ? oldItem.completed !== item.completed ||
                (oldItem.taskId !== item.taskId && item.completed)
            : item.completed;
        },
      );
      const signals = [
        ...changedActions.map((action) => ({
          completed: action.status === "Complete",
          status:
            action.status === "In progress"
              ? ("In progress" as const)
              : ("Open" as const),
        })),
        ...changedChecklist.map(({ item }) => ({
          completed: item.completed,
          status: "Open" as const,
        })),
      ];
      if (signals.length) {
        const reopened = signals.find((signal) => !signal.completed);
        completed = !reopened;
        explicitCompletion = true;
        if (reopened) task.status = reopened.status;
      }
    }

    if (!explicitCompletion && before && blocks.length) {
      // A task represents all of its scheduled work, rather than just one block.
      // Historical incomplete blocks do not undo an existing completed task on
      // an unrelated edit; reopening or adding incomplete work does.
      const reopened = blocks.some((block) => {
        const oldBlock = previousBlocks.get(block.id);
        return (
          !block.completed &&
          (oldBlock?.taskId !== task.id || oldBlock.completed)
        );
      });
      if (reopened) completed = false;
      else if (blocks.every((block) => block.completed)) completed = true;
    } else if (!explicitCompletion && !before && !completed && blocks.length) {
      completed = blocks.every((block) => block.completed);
    }
    candidates.set(task.id, {
      completed,
      explicit: explicitCompletion || (!before && completed),
    });
  }

  // Resolve dependencies without recursion, including long imported chains.
  // Final candidates make simultaneous completions independent of array order.
  const tasks = new Map(draft.tasks.map((task) => [task.id, task]));
  const resolved = new Map<string, boolean>();
  const waiting = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const ready: string[] = [];
  for (const task of draft.tasks) {
    const dependencies = new Set(task.dependencyIds ?? []);
    waiting.set(task.id, dependencies.size);
    if (!dependencies.size) ready.push(task.id);
    for (const dependency of dependencies) {
      const linked = dependents.get(dependency) ?? [];
      linked.push(task.id);
      dependents.set(dependency, linked);
    }
  }
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    const task = tasks.get(id)!;
    resolved.set(
      id,
      Boolean(candidates.get(id)?.completed) &&
        (task.dependencyIds ?? []).every(
          (dependency) => resolved.get(dependency) === true,
        ),
    );
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = waiting.get(dependent)! - 1;
      waiting.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  for (const task of draft.tasks) {
    const candidate = candidates.get(task.id)!;
    const completed = resolved.get(task.id) === true;
    if (candidate.explicit && (!candidate.completed || completed)) {
      for (const block of blocksByTask.get(task.id) ?? [])
        block.completed = completed;
    }
    if (candidate.completed && !completed && task.status === "Done") {
      const before = previousTasks.get(task.id);
      task.status =
        before?.status && before.status !== "Done" ? before.status : "Open";
    }
    setCompletion(task, completed);
  }

  for (const action of draft.developmentActions) {
    const linkedTask = action.taskId && tasks.get(action.taskId);
    if (!linkedTask) continue;
    if (linkedTask.completed) action.status = "Complete";
    else if (action.status === "Complete") action.status = "Planned";
  }
  for (const [taskId, linked] of checklistByTask) {
    const linkedTask = tasks.get(taskId);
    if (!linkedTask) continue;
    for (const { planId, item } of linked) {
      item.completed = linkedTask.completed;
      const oldItem = previousChecklist.get(planId)?.get(item.id);
      if (!oldItem || oldItem.taskId !== taskId || oldItem.label === item.label)
        continue;
      if (linkedTask.title === oldItem.label) linkedTask.title = item.label;
      else if (
        linkedTask.title ===
        `${previousPlans.get(planId)?.title}: ${oldItem.label}`
      )
        linkedTask.title = `${currentPlans.get(planId)?.title}: ${item.label}`;
    }
  }
}

interface LinkedEvent {
  id: string;
  recordId: string;
  link: EventLink;
  title: string;
  date: string;
  time: string;
  source: CalendarEvent["source"];
  active: boolean;
}

function linkedEvents(state: PlannerState): LinkedEvent[] {
  return [
    ...state.members.map((member): LinkedEvent => ({
      id: `linked:member:${member.id}`,
      recordId: member.id,
      link: "memberId",
      title: `Feedback: ${member.name}`,
      date: member.nextFeedback,
      time: "",
      source: "User entered",
      active: Boolean(member.nextFeedback),
    })),
    ...state.developmentActions.map((action): LinkedEvent => ({
      id: `linked:developmentAction:${action.id}`,
      recordId: action.id,
      link: "developmentActionId",
      title: action.title,
      date: action.dueDate,
      time: "",
      source: "User entered",
      active: Boolean(action.dueDate) && action.status !== "Complete",
    })),
    ...state.disciplinePlans.map((plan): LinkedEvent => ({
      id: `linked:disciplinePlan:${plan.id}`,
      recordId: plan.id,
      link: "disciplinePlanId",
      title: `Follow-up: ${plan.title}`,
      date: plan.followUpDate,
      time: "",
      source: "User entered",
      active: Boolean(plan.followUpDate) && plan.status !== "Closed",
    })),
    ...state.meetings.map((meeting): LinkedEvent => ({
      id: `linked:meeting:${meeting.id}`,
      recordId: meeting.id,
      link: "meetingId",
      title: meeting.title,
      date: meeting.date,
      time: meeting.time,
      source: "User entered",
      active: Boolean(meeting.date),
    })),
    ...state.goals.map((goal): LinkedEvent => ({
      id: `linked:goal:${goal.id}`,
      recordId: goal.id,
      link: "goalId",
      title: goal.title,
      date: goal.targetDate,
      time: "",
      source: goal.source ?? "User entered",
      active: Boolean(goal.targetDate) && goal.progress < 100,
    })),
  ];
}

function isGenerated(id: string): boolean {
  return Object.values(eventKinds).some(([kind]) =>
    id.startsWith(`linked:${kind}:`),
  );
}

/** Reconcile linked work and calendar entries after a draft mutation. */
export function synchronizePlannerState(
  draft: PlannerState,
  previous?: PlannerState,
): void {
  synchronizeCompletion(draft, previous);
  const previousTasks = new Map(previous?.tasks.map((task) => [task.id, task]));
  for (const task of draft.tasks) {
    if (!task.completed) delete task.completedOn;
    else if (!previousTasks.get(task.id)?.completed && !task.completedOn)
      task.completedOn = localDate();
  }
  const linked = linkedEvents(draft);
  const previousLinked = new Map(
    previous && linkedEvents(previous).map((event) => [event.id, event]),
  );
  const activeGeneratedIds = new Set(
    linked.filter((event) => event.active).map((event) => event.id),
  );

  // Reserved generated entries follow their source. User calendar entries are
  // kept even when that source becomes unscheduled or complete.
  draft.events = draft.events.filter(
    (event) => !isGenerated(event.id) || activeGeneratedIds.has(event.id),
  );

  for (const descriptor of linked) {
    if (!descriptor.active) continue;
    const associated = draft.events.filter(
      (event) =>
        event[descriptor.link] === descriptor.recordId ||
        event.id === descriptor.id,
    );
    for (const event of associated) {
      const before = previousLinked.get(descriptor.id);
      // A goal may have several manually chosen preparation checkpoints. Only
      // its target reminder moves with the target date; distinct milestones keep
      // their dates rather than being collapsed onto the goal's closeout.
      const followsSource =
        descriptor.link !== "goalId" ||
        event.id === descriptor.id ||
        Boolean(before && event.date === before.date);
      if (followsSource) event.date = descriptor.date;
      // Keep a manually selected reminder time for all-day source records.
      if (descriptor.link === "meetingId") event.time = descriptor.time;
      if (event.id === descriptor.id)
        event[descriptor.link] = descriptor.recordId;
      if (before && followsSource && event.title === before.title)
        event.title = descriptor.title;
      if (before && followsSource && event.source === before.source)
        event.source = descriptor.source;
    }
  }
}
