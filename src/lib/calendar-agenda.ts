import type { CalendarEvent, Page, PlannerState } from "./types";
import { occursOn } from "./dates";

export interface LinkedAgendaItem {
  id: string;
  title: string;
  detail: string;
  page: Page;
}

export function eventSourcePage(event: CalendarEvent): Page | null {
  if (event.memberId || event.developmentActionId || event.disciplinePlanId)
    return "leadership";
  if (event.meetingId) return "work";
  if (event.goalId) return "career";
  return null;
}

export function sourceManagesEventDate(
  event: CalendarEvent,
  state: PlannerState,
): boolean {
  if (
    event.memberId ||
    event.developmentActionId ||
    event.disciplinePlanId ||
    event.meetingId
  )
    return true;
  return Boolean(
    event.goalId &&
    (event.id === `linked:goal:${event.goalId}` ||
      state.goals.some(
        (goal) => goal.id === event.goalId && goal.targetDate === event.date,
      )),
  );
}

/** Read live source dates; omit a source when its linked calendar event already displays it. */
export function linkedAgenda(
  state: PlannerState,
  date: string,
): LinkedAgendaItem[] {
  const items: LinkedAgendaItem[] = [];
  for (const project of state.projects)
    if (project.dueDate === date)
      items.push({
        id: `project:${project.id}`,
        title: project.title,
        detail: `Project target · ${project.status}`,
        page: "work",
      });
  for (const plan of state.careerPlans)
    if (plan.dueDate === date)
      items.push({
        id: `career:${plan.id}`,
        title: plan.title,
        detail: `Career planning target · ${plan.pathway} · ${plan.status}`,
        page: "career",
      });
  for (const objective of state.objectives)
    if (objective.targetDate === date)
      items.push({
        id: `objective:${objective.id}`,
        title: objective.title,
        detail: `${objective.level} priority target`,
        page: "strategy",
      });
  for (const meeting of state.meetings) {
    if (
      meeting.date === date &&
      !state.events.some(
        (event) => event.meetingId === meeting.id && occursOn(event, date),
      )
    )
      items.push({
        id: `meeting:${meeting.id}`,
        title: meeting.title,
        detail: `Meeting${meeting.time ? ` · ${meeting.time}` : ""} · ${meeting.objective || "Review agenda"}`,
        page: "work",
      });
    if (
      meeting.nextDate === date &&
      meeting.nextDate !== meeting.date &&
      !state.events.some(
        (event) => event.meetingId === meeting.id && occursOn(event, date),
      )
    )
      items.push({
        id: `meeting-next:${meeting.id}`,
        title: `Follow-up: ${meeting.title}`,
        detail: "User-set next meeting date",
        page: "work",
      });
  }
  for (const member of state.members)
    if (
      member.nextFeedback === date &&
      !state.events.some(
        (event) => event.memberId === member.id && occursOn(event, date),
      )
    )
      items.push({
        id: `feedback:${member.id}`,
        title: `Feedback: ${member.name}`,
        detail: member.focus || "Development conversation",
        page: "leadership",
      });
  for (const action of state.developmentActions)
    if (
      action.dueDate === date &&
      !state.events.some(
        (event) =>
          event.developmentActionId === action.id && occursOn(event, date),
      )
    )
      items.push({
        id: `development:${action.id}`,
        title: action.title,
        detail: `${action.kind} · ${state.members.find((member) => member.id === action.memberId)?.name ?? "Teammate"} · ${action.status}`,
        page: "leadership",
      });
  for (const plan of state.disciplinePlans)
    if (
      plan.followUpDate === date &&
      plan.status !== "Closed" &&
      !state.events.some(
        (event) => event.disciplinePlanId === plan.id && occursOn(event, date),
      )
    )
      items.push({
        id: `discipline:${plan.id}`,
        title: `Support review: ${plan.title}`,
        detail: `Expectations follow-up · ${plan.status}`,
        page: "leadership",
      });
  return items;
}
