import { describe, expect, it } from "vitest";
import { removePlannerRecord, synchronizePlannerState } from "./relationships";
import type { PlannerRecordCollection } from "./relationships";
import type { CalendarEvent, PlannerState, Task } from "./types";

function emptyState(): PlannerState {
  return {
    version: 2,
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
    habits: [],
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
      distance: 1.5,
      minutes: 0,
      seconds: 0,
      goalMinutes: 0,
      cardioScore: 0,
      strengthScore: 0,
      coreScore: 0,
    },
  };
}

function task(id = "task", overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: "Prepare brief",
    date: "2026-10-20",
    completed: false,
    status: "Open",
    priority: "Normal",
    notes: "Retain task context",
    ...overrides,
  };
}

function linkedWork(): PlannerState {
  const state = emptyState();
  state.tasks.push(task());
  state.blocks.push(
    {
      id: "morning",
      title: "Research",
      date: "2026-10-19",
      start: "09:00",
      end: "10:00",
      category: "Duty",
      notes: "Initial work",
      completed: false,
      taskId: "task",
    },
    {
      id: "afternoon",
      title: "Write brief",
      date: "2026-10-20",
      start: "13:00",
      end: "14:00",
      category: "Duty",
      notes: "Finish work",
      completed: false,
      taskId: "task",
    },
  );
  return state;
}

function event(
  id: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: "Custom reminder",
    date: "2026-10-20",
    time: "09:30",
    category: "Personal",
    recurrence: "Quarterly",
    source: "Estimate",
    ...overrides,
  };
}

function populatedState(): PlannerState {
  const state = linkedWork();
  state.tasks[0] = task("task", {
    projectId: "project",
    assigneeId: "member",
    objectiveId: "objective",
    meetingId: "meeting",
    careerPlanId: "career",
  });
  state.tasks.push(
    task("other-task", {
      dependencyIds: ["task"],
      notes: "Dependency explanation",
    }),
  );
  state.blocks[0].rhythmId = "rhythm";
  state.members.push(
    {
      id: "member",
      name: "Alex",
      rank: "SrA",
      focus: "Mentoring",
      nextFeedback: "2026-10-25",
      notes: "Existing feedback",
    },
    {
      id: "other-member",
      name: "Sam",
      rank: "SSgt",
      focus: "Training",
      nextFeedback: "",
      notes: "Supervisor history",
      supervisorId: "member",
      contactId: "contact",
    },
  );
  state.projects.push({
    id: "project",
    title: "Improvement",
    objective: "Reduce delays",
    startDate: "2026-10-01",
    dueDate: "2026-11-01",
    status: "Active",
    ownerId: "member",
    objectiveId: "objective",
    resources: "Existing resources",
    risks: "Timing",
    successMeasure: "Minutes saved",
    baseline: "30",
    target: "15",
    actual: "",
    notes: "Project history",
    swot: {
      strengths: "Team",
      weaknesses: "Time",
      opportunities: "Automation",
      threats: "Capacity",
    },
  });
  state.objectives.push(
    {
      id: "objective",
      title: "Mission",
      level: "Section",
      parentId: "",
      mission: "Readiness",
      measure: "Availability",
      targetDate: "2026-12-01",
      notes: "Mission context",
    },
    {
      id: "child-objective",
      title: "Child",
      level: "Personal",
      parentId: "objective",
      mission: "Support",
      measure: "Time",
      targetDate: "",
      notes: "Keep child context",
    },
  );
  state.contacts.push({
    id: "contact",
    name: "Resource",
    role: "Advisor",
    agency: "Unit",
    phone: "",
    email: "",
    location: "",
    notes: "Contact notes",
  });
  state.developmentActions.push({
    id: "action",
    memberId: "member",
    title: "Practice briefing",
    kind: "Training",
    dueDate: "2026-11-02",
    status: "In progress",
    notes: "Development history",
    taskId: "task",
  });
  state.disciplinePlans.push({
    id: "discipline",
    memberId: "member",
    title: "Follow up on expectations",
    expectation: "On time",
    observedGap: "Delay",
    supportPlan: "Check resources",
    followUpDate: "2026-11-03",
    consultation: "Requested",
    status: "Monitoring",
    notes: "Preparation history",
  });
  state.meetings.push({
    id: "meeting",
    title: "Team review",
    date: "2026-10-21",
    time: "14:00",
    objective: "Decide next steps",
    participants: ["member", "Alex", "Guest"],
    agenda: "Review",
    decisions: "Keep decisions",
    nextDate: "2026-10-28",
    notes: "Meeting history",
  });
  state.battleRhythms.push({
    id: "rhythm",
    title: "Weekly review",
    mga: "Leading People",
    frequency: "Weekly",
    startDate: "2026-10-20",
    startTime: "09:00",
    endTime: "10:00",
    category: "Duty",
    notes: "Review context",
  });
  state.careerPlans.push({
    id: "career",
    title: "Prepare cycle",
    pathway: "WAPS",
    dueDate: "2026-12-01",
    afsc: "",
    cycle: "User cycle",
    status: "Preparing",
    checklist: [
      { id: "item", label: "Prepare", completed: false, taskId: "task" },
    ],
    notes: "Career history",
    sourceUrl: "",
    lastVerified: "",
  });
  state.goals.push({
    id: "goal",
    title: "Development goal",
    targetDate: "2026-11-04",
    category: "Development",
    progress: 25,
    objectiveId: "objective",
    source: "Estimate",
  });
  state.captures.push({
    id: "capture",
    title: "Historical accomplishment",
    date: "2026-10-01",
    category: "Mission",
    context: "Original context",
    actions: "Original actions",
    outcome: "Original outcome",
    lessons: "Original lesson",
    tags: ["evidence"],
    taskId: "task",
    projectId: "project",
    objectiveId: "objective",
    memberIds: ["member", "other-member"],
  });
  return state;
}

describe("linked task and block completion", () => {
  it("leaves a task open until every linked block is completed", () => {
    const before = linkedWork();
    const draft = structuredClone(before);
    draft.blocks[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0].completed).toBe(false);
    expect(draft.tasks[0].status).toBe("Open");
    const next = structuredClone(draft);
    next.blocks[1].completed = true;
    synchronizePlannerState(next, draft);
    expect(next.tasks[0].completed).toBe(true);
    expect(next.tasks[0].status).toBe("Done");
  });

  it.each(["completed", "status"] as const)(
    "propagates explicit task %s completion to all linked blocks",
    (field) => {
      const before = linkedWork();
      const draft = structuredClone(before);
      if (field === "completed") draft.tasks[0].completed = true;
      else draft.tasks[0].status = "Done";
      synchronizePlannerState(draft, before);
      expect(draft.tasks[0]).toMatchObject({ completed: true, status: "Done" });
      expect(draft.blocks.every((block) => block.completed)).toBe(true);
    },
  );

  it("reopening one block reopens its task while retaining other completed work", () => {
    const before = linkedWork();
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    const draft = structuredClone(before);
    draft.blocks[0].completed = false;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: false, status: "Open" });
    expect(draft.blocks.map((block) => block.completed)).toEqual([false, true]);
  });

  it.each(["completed", "status"] as const)(
    "propagates explicit task %s reopening to all blocks",
    (field) => {
      const before = linkedWork();
      before.tasks[0].completed = true;
      before.tasks[0].status = "Done";
      before.blocks.forEach((block) => {
        block.completed = true;
      });
      const draft = structuredClone(before);
      if (field === "completed") draft.tasks[0].completed = false;
      else draft.tasks[0].status = "In progress";
      synchronizePlannerState(draft, before);
      expect(draft.tasks[0]).toMatchObject({
        completed: false,
        status: field === "status" ? "In progress" : "Open",
      });
      expect(draft.blocks.every((block) => !block.completed)).toBe(true);
    },
  );

  it("reopens completed tasks when newly scheduled work is incomplete", () => {
    const before = linkedWork();
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    const draft = structuredClone(before);
    draft.blocks.push({
      ...draft.blocks[0],
      id: "new-block",
      completed: false,
    });
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0].completed).toBe(false);
    expect(draft.blocks[0].completed).toBe(true);
  });

  it("keeps nonterminal task status and unrelated blocks independent", () => {
    const before = linkedWork();
    before.tasks[0].status = "Blocked";
    before.blocks.push({
      ...before.blocks[0],
      id: "unrelated",
      taskId: undefined,
    });
    const draft = structuredClone(before);
    draft.blocks[2].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      completed: false,
      status: "Blocked",
    });
    expect(draft.blocks.slice(0, 2).every((block) => !block.completed)).toBe(
      true,
    );
  });

  it("normalizes imported task status without needing a previous state", () => {
    const state = linkedWork();
    state.tasks[0].status = "Done";
    synchronizePlannerState(state);
    expect(state.tasks[0].completed).toBe(true);
    expect(state.blocks.every((block) => block.completed)).toBe(true);
  });

  it("does not complete unscheduled tasks and fills consistent legacy statuses", () => {
    const state = emptyState();
    state.tasks.push(
      task("legacy", { status: undefined }),
      task("complete", { status: undefined, completed: true }),
    );
    synchronizePlannerState(state);
    expect(state.tasks.map((record) => record.status)).toEqual([
      "Open",
      "Done",
    ]);
  });

  it("preserves historical task completion when an unrelated note changes", () => {
    const before = linkedWork();
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    const draft = structuredClone(before);
    draft.tasks[0].notes = "Additional historical context";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      completed: true,
      status: "Done",
      notes: "Additional historical context",
    });
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });

  it("reopens legacy completed tasks and their blocks when a working status is explicitly selected", () => {
    const before = linkedWork();
    before.tasks[0].completed = true;
    delete before.tasks[0].status;
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    const draft = structuredClone(before);
    draft.tasks[0].status = "In progress";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      completed: false,
      status: "In progress",
    });
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });
});

describe("dependency-aware linked completion", () => {
  it("preserves unrelated edits across 10,000 completed tasks in a reverse dependency chain", () => {
    const before = emptyState();
    before.tasks = Array.from({ length: 10_000 }, (_, index) =>
      task(`task-${index}`, {
        completed: true,
        status: "Done",
        dependencyIds: index < 9_999 ? [`task-${index + 1}`] : [],
      }),
    );
    const draft = structuredClone(before);
    draft.profile.name = "Updated name";
    expect(() => synchronizePlannerState(draft, before)).not.toThrow();
    expect(draft.profile.name).toBe("Updated name");
    expect(
      draft.tasks.every(
        (record) => record.completed && record.status === "Done",
      ),
    ).toBe(true);
  });

  it("keeps fully worked tasks open while a prerequisite is unfinished", () => {
    const before = linkedWork();
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks.push(task("prerequisite"));
    const draft = structuredClone(before);
    draft.blocks.forEach((block) => {
      block.completed = true;
    });
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: false, status: "Open" });
    expect(draft.blocks.every((block) => block.completed)).toBe(true);
  });

  it("rejects direct Done before prerequisites finish and restores the prior working status", () => {
    const before = linkedWork();
    before.tasks[0].status = "In progress";
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks.push(task("prerequisite"));
    const draft = structuredClone(before);
    draft.tasks[0].status = "Done";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      completed: false,
      status: "In progress",
    });
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });

  it("resolves simultaneous dependency completions regardless of task array order", () => {
    const before = linkedWork();
    before.tasks[0].dependencyIds = ["middle"];
    before.tasks.push(
      task("middle", { dependencyIds: ["first"] }),
      task("first"),
    );
    const draft = structuredClone(before);
    draft.tasks.forEach((record) => {
      record.completed = true;
    });
    synchronizePlannerState(draft, before);
    expect(
      draft.tasks.every(
        (record) => record.completed && record.status === "Done",
      ),
    ).toBe(true);
    expect(draft.blocks.every((block) => block.completed)).toBe(true);
  });

  it("finishes already-completed block work when its remaining prerequisite finishes", () => {
    const before = linkedWork();
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks.push(task("prerequisite"));
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    const draft = structuredClone(before);
    draft.tasks[1].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.tasks.every((record) => record.completed)).toBe(true);
  });

  it("reopens dependent task completion when a prerequisite reopens without erasing its worked blocks", () => {
    const before = linkedWork();
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    before.tasks.push(
      task("prerequisite", { completed: true, status: "Done" }),
    );
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    const draft = structuredClone(before);
    draft.tasks[1].completed = false;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: false, status: "Open" });
    expect(draft.blocks.every((block) => block.completed)).toBe(true);
  });
});

describe("development action and task completion", () => {
  it("completes linked task and blocks from an explicitly completed development action", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.developmentActions[0].status = "Complete";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: true, status: "Done" });
    expect(draft.blocks.every((block) => block.completed)).toBe(true);
    expect(draft.developmentActions[0].title).toBe(
      before.developmentActions[0].title,
    );
  });

  it("marks development actions complete from their linked task and reopens them with that task", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.tasks[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.developmentActions[0].status).toBe("Complete");
    const next = structuredClone(draft);
    next.blocks[0].completed = false;
    synchronizePlannerState(next, draft);
    expect(next.developmentActions[0].status).toBe("Planned");
    expect(next.developmentActions[0].notes).toBe("Development history");
  });

  it("reopens linked tasks and blocks when a completed development action restarts", () => {
    const before = populatedState();
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    before.developmentActions[0].status = "Complete";
    const draft = structuredClone(before);
    draft.developmentActions[0].status = "In progress";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      completed: false,
      status: "In progress",
    });
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
    expect(draft.developmentActions[0].status).toBe("In progress");
  });

  it("resets blocked development completion without completing its task or unfinished blocks", () => {
    const before = populatedState();
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks.push(task("prerequisite"));
    const draft = structuredClone(before);
    draft.developmentActions[0].status = "Complete";
    synchronizePlannerState(draft, before);
    expect(draft.developmentActions[0].status).toBe("Planned");
    expect(draft.tasks[0].completed).toBe(false);
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });

  it("preserves incomplete development status and screen-owned task titles, dates, and assignees", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.developmentActions[0].title = "Renamed development plan";
    draft.developmentActions[0].dueDate = "2026-12-01";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      title: "Prepare brief",
      date: "2026-10-20",
      assigneeId: "member",
    });
    expect(draft.developmentActions[0].status).toBe("In progress");
  });
});

describe("career checklist and task relationships", () => {
  it("completes linked task, blocks, and development work from a checklist entry", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.careerPlans[0].checklist[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: true, status: "Done" });
    expect(draft.blocks.every((block) => block.completed)).toBe(true);
    expect(draft.developmentActions[0].status).toBe("Complete");
  });

  it("updates linked checklist completion from the task and reopens it from a block", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.tasks[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.careerPlans[0].checklist[0].completed).toBe(true);
    const next = structuredClone(draft);
    next.blocks[0].completed = false;
    synchronizePlannerState(next, draft);
    expect(next.careerPlans[0].checklist[0].completed).toBe(false);
  });

  it("reopens linked task and scheduled work when a checklist entry is unchecked", () => {
    const before = populatedState();
    before.tasks[0].completed = true;
    before.tasks[0].status = "Done";
    before.blocks.forEach((block) => {
      block.completed = true;
    });
    before.careerPlans[0].checklist[0].completed = true;
    const draft = structuredClone(before);
    draft.careerPlans[0].checklist[0].completed = false;
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({ completed: false, status: "Open" });
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });

  it("denies checklist completion while task dependencies remain unfinished", () => {
    const before = populatedState();
    before.tasks[0].dependencyIds = ["prerequisite"];
    before.tasks.push(task("prerequisite"));
    const draft = structuredClone(before);
    draft.careerPlans[0].checklist[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.careerPlans[0].checklist[0].completed).toBe(false);
    expect(draft.tasks[0].completed).toBe(false);
    expect(draft.blocks.every((block) => !block.completed)).toBe(true);
  });

  it("leaves unlinked checklist entries independent", () => {
    const before = populatedState();
    before.careerPlans[0].checklist.push({
      id: "independent",
      label: "Review guidance",
      completed: true,
    });
    const draft = structuredClone(before);
    draft.tasks[0].completed = true;
    synchronizePlannerState(draft, before);
    expect(draft.careerPlans[0].checklist[1]).toEqual(
      before.careerPlans[0].checklist[1],
    );
  });

  it("updates generated task titles after checklist labels change while retaining the task ID and notes", () => {
    const before = populatedState();
    before.tasks[0].title = before.careerPlans[0].checklist[0].label;
    const draft = structuredClone(before);
    draft.careerPlans[0].checklist[0].label = "Prepare updated package";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0]).toMatchObject({
      id: "task",
      title: "Prepare updated package",
      notes: "Retain task context",
    });
    expect(draft.careerPlans[0].checklist[0].taskId).toBe("task");
  });

  it("preserves customized task titles after linked checklist labels change", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.careerPlans[0].checklist[0].label = "Prepare updated package";
    synchronizePlannerState(draft, before);
    expect(draft.tasks[0].title).toBe("Prepare brief");
  });
});

describe("linked calendar synchronization", () => {
  it("keeps calendar creation opt-in even when source records have dates", () => {
    const state = populatedState();
    synchronizePlannerState(state);
    expect(state.events).toEqual([]);
  });

  it("updates linked reminder dates while retaining user titles, sources, recurrence, and reminder times", () => {
    const before = populatedState();
    before.events = [event("manual", { memberId: "member" })];
    const draft = structuredClone(before);
    draft.members[0].nextFeedback = "2026-12-25";
    synchronizePlannerState(draft, before);
    expect(draft.events).toEqual([{ ...before.events[0], date: "2026-12-25" }]);
  });

  it("updates prior default titles and sources on random-ID linked reminders", () => {
    const before = populatedState();
    before.events = [
      event("manual-feedback", {
        memberId: "member",
        title: "Feedback: Alex",
        source: "User entered",
      }),
      event("manual-goal", {
        goalId: "goal",
        title: "Development goal",
        source: "Estimate",
        date: before.goals[0].targetDate,
      }),
    ];
    const draft = structuredClone(before);
    draft.members[0].name = "Jordan";
    draft.goals[0].title = "Updated goal";
    draft.goals[0].source = "User entered";
    synchronizePlannerState(draft, before);
    expect(draft.events[0]).toMatchObject({
      id: "manual-feedback",
      title: "Feedback: Jordan",
      source: "User entered",
    });
    expect(draft.events[1]).toMatchObject({
      id: "manual-goal",
      title: "Updated goal",
      source: "User entered",
    });
  });

  it("updates generated default titles when records are renamed and preserves custom titles", () => {
    const before = populatedState();
    before.events = [
      event("linked:member:member", {
        memberId: "member",
        title: "Feedback: Alex",
      }),
      event("linked:developmentAction:action", {
        developmentActionId: "action",
        title: "My preparation reminder",
      }),
    ];
    const draft = structuredClone(before);
    draft.members[0].name = "Jordan";
    draft.developmentActions[0].title = "Updated briefing preparation";
    synchronizePlannerState(draft, before);
    expect(draft.events[0].title).toBe("Feedback: Jordan");
    expect(draft.events[1].title).toBe("My preparation reminder");
    expect(draft.events.every((entry) => entry.source === "Estimate")).toBe(
      true,
    );
  });

  it("resolves generated IDs even when a calendar editor omitted their link field", () => {
    const state = populatedState();
    state.events = [event("linked:member:member")];
    synchronizePlannerState(state);
    expect(state.events[0]).toMatchObject({
      memberId: "member",
      date: "2026-10-25",
      title: "Custom reminder",
    });
  });

  it("uses the next meeting date and current meeting time for existing linked events", () => {
    const before = populatedState();
    before.events = [
      event("linked:meeting:meeting", {
        meetingId: "meeting",
        title: "Team review",
      }),
    ];
    const draft = structuredClone(before);
    draft.meetings[0].nextDate = "2026-11-10";
    draft.meetings[0].time = "16:00";
    synchronizePlannerState(draft, before);
    expect(draft.events[0]).toMatchObject({
      date: "2026-11-10",
      time: "16:00",
      recurrence: "Quarterly",
    });
    draft.meetings[0].nextDate = "";
    synchronizePlannerState(draft);
    expect(draft.events[0].date).toBe("2026-10-21");
  });

  it("removes unscheduled generated entries while retaining manual calendar history", () => {
    const before = populatedState();
    before.events = [
      event("linked:member:member", { memberId: "member" }),
      event("manual", { memberId: "member" }),
    ];
    const draft = structuredClone(before);
    draft.members[0].nextFeedback = "";
    synchronizePlannerState(draft, before);
    expect(draft.events).toEqual([before.events[1]]);
  });

  it("removes completed development, closed follow-up, and achieved-goal generated reminders", () => {
    const before = populatedState();
    before.events = [
      event("linked:developmentAction:action", {
        developmentActionId: "action",
      }),
      event("linked:disciplinePlan:discipline", {
        disciplinePlanId: "discipline",
      }),
      event("linked:goal:goal", { goalId: "goal" }),
      event("manual-goal", { goalId: "goal" }),
    ];
    const draft = structuredClone(before);
    draft.developmentActions[0].status = "Complete";
    draft.disciplinePlans[0].status = "Closed";
    draft.goals[0].progress = 100;
    synchronizePlannerState(draft, before);
    expect(draft.events).toEqual([before.events[3]]);
    draft.goals[0].progress = 25;
    synchronizePlannerState(draft);
    expect(draft.events).toHaveLength(1);
  });

  it("prunes orphan generated events and leaves unrelated user IDs intact", () => {
    const state = emptyState();
    state.events = [
      event("linked:member:missing"),
      event("linked:user:custom"),
    ];
    synchronizePlannerState(state);
    expect(state.events.map((entry) => entry.id)).toEqual([
      "linked:user:custom",
    ]);
  });

  it("preserves a goal reminder source explicitly customized by the user", () => {
    const before = populatedState();
    before.events = [
      event("linked:goal:goal", {
        goalId: "goal",
        source: "User entered",
        date: before.goals[0].targetDate,
      }),
    ];
    const draft = structuredClone(before);
    draft.goals[0].targetDate = "2026-12-01";
    synchronizePlannerState(draft, before);
    expect(draft.events[0]).toMatchObject({
      source: "User entered",
      date: "2026-12-01",
    });
  });

  it("preserves several newly created goal preparation checkpoint dates", () => {
    const before = populatedState();
    const draft = structuredClone(before);
    draft.events = [
      event("checkpoint-60", {
        goalId: "goal",
        title: "60-day checkpoint",
        date: "2026-09-05",
      }),
      event("checkpoint-30", {
        goalId: "goal",
        title: "30-day checkpoint",
        date: "2026-10-05",
      }),
      event("closeout", {
        goalId: "goal",
        title: "Development goal",
        date: "2026-11-04",
      }),
    ];
    synchronizePlannerState(draft, before);
    expect(draft.events.map((entry) => entry.date)).toEqual([
      "2026-09-05",
      "2026-10-05",
      "2026-11-04",
    ]);
  });

  it("moves an existing manual goal target reminder while preserving distinct checkpoint dates", () => {
    const before = populatedState();
    before.events = [
      event("checkpoint", {
        goalId: "goal",
        title: "Preparation",
        date: "2026-10-05",
      }),
      event("target", {
        goalId: "goal",
        title: "Development goal",
        date: before.goals[0].targetDate,
      }),
    ];
    const draft = structuredClone(before);
    draft.goals[0].targetDate = "2026-12-01";
    synchronizePlannerState(draft, before);
    expect(draft.events.map((entry) => entry.date)).toEqual([
      "2026-10-05",
      "2026-12-01",
    ]);
  });

  it("preserves estimated preparation provenance when a closeout source becomes user-entered", () => {
    const before = populatedState();
    before.events = [
      event("checkpoint-60", {
        goalId: "goal",
        title: "60-day preparation",
        date: "2026-09-05",
        source: "Estimate",
      }),
      event("checkpoint-30", {
        goalId: "goal",
        title: "30-day preparation",
        date: "2026-10-05",
        source: "Estimate",
      }),
      event("target", {
        goalId: "goal",
        title: "Development goal",
        date: before.goals[0].targetDate,
        source: "Estimate",
      }),
    ];
    const draft = structuredClone(before);
    draft.goals[0].source = "User entered";
    synchronizePlannerState(draft, before);
    expect(draft.events.map((entry) => entry.source)).toEqual([
      "Estimate",
      "Estimate",
      "User entered",
    ]);
  });
});

describe("record deletion and historical evidence", () => {
  const targets: [PlannerRecordCollection, string][] = [
    ["tasks", "task"],
    ["projects", "project"],
    ["members", "member"],
    ["objectives", "objective"],
    ["contacts", "contact"],
    ["developmentActions", "action"],
    ["disciplinePlans", "discipline"],
    ["meetings", "meeting"],
    ["battleRhythms", "rhythm"],
    ["careerPlans", "career"],
    ["goals", "goal"],
  ];

  it.each(targets)(
    "deletes only the requested %s record and retains historical content",
    (collection, id) => {
      const state = populatedState();
      const before = structuredClone(state);
      removePlannerRecord(state, collection, id);
      for (const [other] of targets)
        expect(state[other]).toHaveLength(
          before[other].length - Number(other === collection),
        );
      expect(state.blocks).toHaveLength(before.blocks.length);
      expect(state.captures).toHaveLength(before.captures.length);
      expect(state.captures[0]).toMatchObject({
        title: before.captures[0].title,
        date: before.captures[0].date,
        context: before.captures[0].context,
        actions: before.captures[0].actions,
        outcome: before.captures[0].outcome,
      });
      expect(state.blocks[0]).toMatchObject({
        title: before.blocks[0].title,
        date: before.blocks[0].date,
        notes: before.blocks[0].notes,
      });
      expect(
        state.tasks.find((record) => record.id === "other-task")?.notes,
      ).toBe("Dependency explanation");
    },
  );

  it("detaches deleted tasks from scheduled blocks, captures, development actions, and dependency lists", () => {
    const state = populatedState();
    removePlannerRecord(state, "tasks", "task");
    expect(state.blocks.every((block) => block.taskId === undefined)).toBe(
      true,
    );
    expect(state.captures[0].taskId).toBeUndefined();
    expect(state.developmentActions[0].taskId).toBeUndefined();
    expect(state.careerPlans[0].checklist[0]).toMatchObject({
      label: "Prepare",
      completed: false,
    });
    expect(state.careerPlans[0].checklist[0].taskId).toBeUndefined();
    expect(state.tasks[0].dependencyIds).toEqual([]);
  });

  it("detaches projects from surviving taskers and captures", () => {
    const state = populatedState();
    removePlannerRecord(state, "projects", "project");
    expect(state.tasks[0].projectId).toBeUndefined();
    expect(state.captures[0].projectId).toBeUndefined();
  });

  it("detaches people while retaining development, preparation, meeting text, and associated action reminders", () => {
    const state = populatedState();
    state.events = [
      event("linked:member:member", { memberId: "member" }),
      event("manual-feedback", { memberId: "member" }),
      event("linked:developmentAction:action", {
        developmentActionId: "action",
        memberId: "member",
      }),
    ];
    const participants = [...state.meetings[0].participants];
    removePlannerRecord(state, "members", "member");
    expect(state.tasks[0].assigneeId).toBeUndefined();
    expect(state.projects[0].ownerId).toBe("");
    expect(state.members[0].supervisorId).toBeUndefined();
    expect(state.captures[0].memberIds).toEqual(["other-member"]);
    expect(state.developmentActions[0]).toMatchObject({
      memberId: "",
      notes: "Development history",
    });
    expect(state.disciplinePlans[0]).toMatchObject({
      memberId: "",
      notes: "Preparation history",
    });
    expect(state.meetings[0].participants).toEqual(participants);
    expect(state.events.map((entry) => entry.id)).toEqual([
      "manual-feedback",
      "linked:developmentAction:action",
    ]);
    expect(state.events.every((entry) => entry.memberId === undefined)).toBe(
      true,
    );
  });

  it("detaches objective descendants and every surviving alignment reference", () => {
    const state = populatedState();
    removePlannerRecord(state, "objectives", "objective");
    expect(state.objectives[0].parentId).toBe("");
    expect(state.projects[0].objectiveId).toBe("");
    expect(state.tasks[0].objectiveId).toBeUndefined();
    expect(state.captures[0].objectiveId).toBeUndefined();
    expect(state.goals[0].objectiveId).toBeUndefined();
  });

  it("detaches deleted contact, meeting, and rhythm references without deleting their work", () => {
    const state = populatedState();
    removePlannerRecord(state, "contacts", "contact");
    removePlannerRecord(state, "meetings", "meeting");
    removePlannerRecord(state, "battleRhythms", "rhythm");
    expect(state.members[1].contactId).toBeUndefined();
    expect(state.tasks[0].meetingId).toBeUndefined();
    expect(state.blocks[0].rhythmId).toBeUndefined();
    expect(state.blocks).toHaveLength(2);
    expect(state.tasks).toHaveLength(2);
  });

  it.each([
    [
      "developmentActions",
      "action",
      "developmentAction",
      "developmentActionId",
    ],
    ["disciplinePlans", "discipline", "disciplinePlan", "disciplinePlanId"],
    ["meetings", "meeting", "meeting", "meetingId"],
    ["goals", "goal", "goal", "goalId"],
  ] as const)(
    "removes generated %s reminders and detaches manually linked history",
    (collection, id, kind, link) => {
      const state = populatedState();
      const historical = event("manual", { [link]: id });
      state.events = [
        event(`linked:${kind}:${id}`, { [link]: id }),
        historical,
        event("other"),
      ];
      removePlannerRecord(state, collection, id);
      expect(state.events.map((entry) => entry.id)).toEqual([
        "manual",
        "other",
      ]);
      expect(state.events[0][link]).toBeUndefined();
      expect(state.events[0]).toMatchObject({
        title: historical.title,
        date: historical.date,
        source: historical.source,
        recurrence: historical.recurrence,
      });
    },
  );

  it("treats a stale delete for an absent target as a no-op", () => {
    const state = populatedState();
    const before = structuredClone(state);
    removePlannerRecord(state, "tasks", "missing");
    expect(state).toEqual(before);
  });

  it("detaches only the exact deleted career-plan goal source while preserving goal reminders", () => {
    const state = populatedState();
    state.goals[0].sourceRef = "career-plan:career";
    state.goals.push(
      {
        ...state.goals[0],
        id: "other-goal",
        sourceRef: "career-plan:career-extra",
      },
      {
        ...state.goals[0],
        id: "evaluation",
        sourceRef: "evaluation-closeout:2026-11-30",
      },
    );
    state.events.push(event("linked:goal:goal", { goalId: "goal" }));
    const events = structuredClone(state.events);
    removePlannerRecord(state, "careerPlans", "career");
    expect(state.tasks[0].careerPlanId).toBeUndefined();
    expect(state.goals[0].sourceRef).toBeUndefined();
    expect(state.goals[1].sourceRef).toBe("career-plan:career-extra");
    expect(state.goals[2].sourceRef).toBe("evaluation-closeout:2026-11-30");
    expect(state.events).toEqual(events);
  });
});
