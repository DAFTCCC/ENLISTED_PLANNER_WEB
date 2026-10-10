import { addDays, minutes } from "./dates";
import type { Page, PlannerState, Task } from "./types";

export interface PlannerInsight {
  id: string;
  title: string;
  explanation: string;
  page: Page;
  urgency: "Due" | "Blocked" | "Prepare";
}

/** Transparent planning prompts derived only from the user's saved records. */
export function plannerInsights(
  state: PlannerState,
  today: string,
): PlannerInsight[] {
  let horizon = today;
  try {
    horizon = addDays(today, 7);
  } catch {
    horizon = "9999-12-31";
  }
  const results: PlannerInsight[] = [];
  const add = (
    id: string,
    title: string,
    explanation: string,
    page: Page,
    urgency: PlannerInsight["urgency"],
  ) => results.push({ id, title, explanation, page, urgency });
  for (const task of state.tasks.filter((item) => !item.completed)) {
    const blockers = (task.dependencyIds ?? [])
      .map((id) => state.tasks.find((item) => item.id === id))
      .filter((item): item is Task => Boolean(item && !item.completed));
    if (task.date && task.date <= today)
      add(
        `task-due:${task.id}`,
        `${task.title}: ${task.date < today ? "overdue" : "due today"}`,
        `The suspense is ${task.date}${task.suspenseTime ? ` at ${task.suspenseTime}` : ""}. ${task.assigneeId ? `Owner: ${state.members.find((member) => member.id === task.assigneeId)?.name ?? "review owner"}.` : "No teammate is assigned."}`,
        "work",
        "Due",
      );
    if (blockers.length)
      add(
        `task-blocked:${task.id}`,
        `${task.title}: prerequisites unfinished`,
        `${blockers.map((item) => item.title).join(", ")} must be reviewed before this tasker can proceed.`,
        "work",
        "Blocked",
      );
    else if (task.status === "Blocked")
      add(
        `task-blocked:${task.id}`,
        `${task.title}: marked blocked`,
        task.notes?.trim() || "Review the blocker and agree on a next action.",
        "work",
        "Blocked",
      );
    if (task.date && task.date >= today && task.date <= horizon) {
      const allocated = state.blocks
        .filter(
          (block) =>
            block.taskId === task.id &&
            !block.completed &&
            block.date >= today &&
            block.date <= task.date,
        )
        .reduce((total, block) => {
          const end =
            block.date === task.date && task.suspenseTime
              ? Math.min(minutes(block.end), minutes(task.suspenseTime))
              : minutes(block.end);
          return total + Math.max(0, end - minutes(block.start));
        }, 0);
      if (
        !allocated ||
        (task.estimatedMinutes && allocated < task.estimatedMinutes)
      )
        add(
          `task-time:${task.id}`,
          `${task.title}: make time before the deadline`,
          allocated
            ? `${allocated} minutes are scheduled before ${task.date}${task.suspenseTime ? ` at ${task.suspenseTime}` : ""}; your effort estimate is ${task.estimatedMinutes} minutes.`
            : `Due ${task.date}${task.suspenseTime ? ` at ${task.suspenseTime}` : ""}, with no unfinished linked time block before the deadline.${task.estimatedMinutes ? ` Estimated effort: ${task.estimatedMinutes} minutes.` : ""}`,
          "work",
          "Prepare",
        );
    }
  }
  for (const project of state.projects.filter(
    (item) => item.status !== "Complete" && item.status !== "On hold",
  )) {
    if (project.dueDate && project.dueDate <= today)
      add(
        `project-due:${project.id}`,
        `${project.title}: review project suspense`,
        `Target date ${project.dueDate}; project status is ${project.status}. Confirm remaining work and the measured result.`,
        "work",
        "Due",
      );
    if (!project.objectiveId)
      add(
        `project-align:${project.id}`,
        `${project.title}: connect its purpose`,
        "This project has no linked organizational priority. Connect it to an objective to explain why the work matters.",
        "strategy",
        "Prepare",
      );
    const tasks = state.tasks.filter((task) => task.projectId === project.id);
    if (
      tasks.length &&
      tasks.every((task) => task.completed) &&
      !project.actual.trim()
    )
      add(
        `project-result:${project.id}`,
        `${project.title}: record the outcome`,
        "Every linked tasker is complete, but the actual result is blank. Compare the result with your success measure before closing the project.",
        "work",
        "Prepare",
      );
  }
  for (const member of state.members)
    if (member.nextFeedback && member.nextFeedback <= today)
      add(
        `feedback:${member.id}`,
        `Feedback with ${member.name}`,
        `Your next feedback date is ${member.nextFeedback}. Review development actions and assigned taskers before the conversation.`,
        "leadership",
        "Due",
      );
  for (const action of state.developmentActions)
    if (
      action.status !== "Complete" &&
      action.dueDate &&
      action.dueDate <= today
    )
      add(
        `development:${action.id}`,
        `${action.title}: development follow-up`,
        `${state.members.find((member) => member.id === action.memberId)?.name ?? "Teammate"} · ${action.kind} · due ${action.dueDate}.`,
        "leadership",
        "Due",
      );
  for (const plan of state.disciplinePlans)
    if (
      plan.status !== "Closed" &&
      plan.followUpDate &&
      plan.followUpDate <= today
    )
      add(
        `discipline:${plan.id}`,
        `${plan.title}: review the support plan`,
        `Follow-up ${plan.followUpDate}. Review the stated expectation, support provided, and consultation status (${plan.consultation}).`,
        "leadership",
        "Due",
      );
  for (const plan of state.careerPlans) {
    const remaining = plan.checklist.filter((item) => !item.completed).length;
    if (
      plan.status !== "Complete" &&
      plan.dueDate &&
      plan.dueDate <= horizon &&
      remaining
    )
      add(
        `career:${plan.id}`,
        `${plan.title}: ${remaining} preparation ${remaining === 1 ? "item" : "items"} remaining`,
        `Your planning target is ${plan.dueDate}. Review the checklist and confirm the controlling dates with your unit.`,
        "career",
        plan.dueDate <= today ? "Due" : "Prepare",
      );
  }
  for (const capture of state.captures) {
    if (capture.date < today.slice(0, 4) + "-01-01") continue;
    const missing = [
      !capture.actions.trim() && "your action",
      !capture.impact?.trim() && "the impact",
      !capture.outcome.trim() && "a measured result",
      !capture.mga && "a major graded area",
    ].filter(Boolean);
    if (missing.length)
      add(
        `capture:${capture.id}`,
        `${capture.title}: finish the career record`,
        `Still missing ${missing.join(", ")}. Your original quick capture remains preserved.`,
        "captures",
        "Prepare",
      );
  }
  const order = { Due: 0, Blocked: 1, Prepare: 2 };
  return results.sort((a, b) => order[a.urgency] - order[b.urgency]);
}
