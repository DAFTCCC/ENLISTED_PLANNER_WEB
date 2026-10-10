import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { addDays, localDate } from "../lib/dates";
import type { PlannerState } from "../lib/types";
import Leadership from "./Leadership";
import Support from "./Support";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
function seedMember(): PlannerState {
  const state = defaultState();
  state.members = [
    {
      id: "member",
      name: "Taylor",
      rank: "SrA",
      focus: "Train the team",
      nextFeedback: "",
      notes: "",
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}
const renderLeadership = () =>
  render(
    <PlannerProvider>
      <Leadership />
    </PlannerProvider>,
  );

function saveAction(title = "Lead training") {
  fireEvent.click(
    screen.getByRole("button", { name: "Add development action" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Action title"), {
    target: { value: title },
  });
  fireEvent.change(within(dialog).getByLabelText("Development due date"), {
    target: { value: addDays(localDate(), 7) },
  });
  fireEvent.change(within(dialog).getByLabelText("Tasker connection"), {
    target: { value: "create" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save development action" }),
  );
}

describe("connected people planning", () => {
  it("creates a development tasker, keeps its calendar date linked, and shares completion with assigned work", () => {
    seedMember();
    renderLeadership();
    saveAction();
    let saved = persisted();
    expect(saved.developmentActions).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({
      title: "Lead training",
      date: addDays(localDate(), 7),
      assigneeId: "member",
      completed: false,
    });
    expect(saved.developmentActions[0].taskId).toBe(saved.tasks[0].id);
    let card = screen.getByRole("article", {
      name: "Development action Lead training",
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "Add development to calendar" }),
    );
    expect(persisted().events).toHaveLength(1);
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Edit development action Lead training",
      }),
    );
    let dialog = screen.getByRole("dialog");
    const later = addDays(localDate(), 14);
    fireEvent.change(within(dialog).getByLabelText("Action title"), {
      target: { value: "Deliver training" },
    });
    fireEvent.change(within(dialog).getByLabelText("Development due date"), {
      target: { value: later },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save development action" }),
    );
    saved = persisted();
    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({
      title: "Deliver training",
      date: later,
    });
    expect(saved.events[0]).toMatchObject({
      title: "Deliver training",
      date: later,
      developmentActionId: saved.developmentActions[0].id,
    });
    card = screen.getByRole("article", {
      name: "Development action Deliver training",
    });
    fireEvent.change(within(card).getByLabelText("Development status"), {
      target: { value: "Complete" },
    });
    expect(persisted().tasks[0].completed).toBe(true);
    fireEvent.change(screen.getByLabelText("Development view"), {
      target: { value: "All development" },
    });
    fireEvent.click(
      screen.getByLabelText("Reopen assigned task Deliver training"),
    );
    expect(persisted().developmentActions[0].status).toBe("Planned");
    expect(persisted().tasks[0].completed).toBe(false);
    card = screen.getByRole("article", {
      name: "Development action Deliver training",
    });
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Delete development action Deliver training",
      }),
    );
    expect(persisted().developmentActions).toHaveLength(1);
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete action" }),
    );
    expect(persisted().developmentActions).toEqual([]);
    expect(persisted().tasks).toHaveLength(1);
    expect(persisted().events).toEqual([]);
  });

  it("shows why an assigned tasker cannot complete before its prerequisite", () => {
    const saved = seedMember();
    saved.tasks = [
      {
        id: "prerequisite",
        title: "Prepare material",
        date: localDate(),
        completed: false,
        priority: "Normal",
      },
      {
        id: "training",
        title: "Deliver training",
        date: localDate(),
        completed: false,
        priority: "Normal",
        assigneeId: "member",
        dependencyIds: ["prerequisite"],
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderLeadership();
    fireEvent.click(
      screen.getByLabelText("Complete assigned task Deliver training"),
    );
    expect(screen.getByRole("alert").textContent).toContain("Prepare material");
    expect(
      persisted().tasks.find((task) => task.id === "training")!.completed,
    ).toBe(false);
  });

  it("stores standards-and-support preparation and consultation without making disciplinary decisions", () => {
    seedMember();
    renderLeadership();
    fireEvent.click(
      screen.getByRole("button", { name: "Add preparation plan" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Preparation title"), {
      target: { value: "Clarify handover expectations" },
    });
    fireEvent.change(within(dialog).getByLabelText("Standard or expectation"), {
      target: { value: "Use the agreed handover checklist." },
    });
    fireEvent.change(within(dialog).getByLabelText("General observed gap"), {
      target: { value: "Some checklist steps need clarification." },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Support & improvement plan"),
      { target: { value: "Walk through the checklist together." } },
    );
    fireEvent.change(within(dialog).getByLabelText("Consultation status"), {
      target: { value: "Requested" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Preparation follow-up date"),
      { target: { value: addDays(localDate(), 3) } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save preparation plan" }),
    );
    let plan = persisted().disciplinePlans[0];
    expect(plan).toMatchObject({
      expectation: "Use the agreed handover checklist.",
      supportPlan: "Walk through the checklist together.",
      consultation: "Requested",
      status: "Open",
    });
    expect(plan).not.toHaveProperty("punishment");
    let card = screen.getByRole("article", {
      name: "Preparation plan Clarify handover expectations",
    });
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Add preparation follow-up to calendar",
      }),
    );
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Edit preparation plan Clarify handover expectations",
      }),
    );
    dialog = screen.getByRole("dialog");
    const later = addDays(localDate(), 5);
    fireEvent.change(
      within(dialog).getByLabelText("Preparation follow-up date"),
      { target: { value: later } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save preparation plan" }),
    );
    expect(persisted().events[0]).toMatchObject({
      disciplinePlanId: plan.id,
      date: later,
    });
    card = screen.getByRole("article", {
      name: "Preparation plan Clarify handover expectations",
    });
    fireEvent.change(within(card).getByLabelText("Consultation status"), {
      target: { value: "Completed" },
    });
    fireEvent.change(within(card).getByLabelText("Preparation status"), {
      target: { value: "Monitoring" },
    });
    plan = persisted().disciplinePlans[0];
    expect(plan.consultation).toBe("Completed");
    expect(plan.status).toBe("Monitoring");
  });

  it("preserves work and preparation history when a person is removed", () => {
    const saved = seedMember();
    saved.tasks = [
      {
        id: "task",
        title: "Keep tasker",
        date: "",
        completed: false,
        priority: "Normal",
        assigneeId: "member",
      },
    ];
    saved.developmentActions = [
      {
        id: "action",
        memberId: "member",
        title: "Keep development",
        kind: "Mentoring",
        dueDate: "",
        status: "Planned",
        notes: "Keep these notes",
        taskId: "task",
      },
    ];
    saved.disciplinePlans = [
      {
        id: "plan",
        memberId: "member",
        title: "Keep preparation",
        expectation: "",
        observedGap: "",
        supportPlan: "",
        followUpDate: "",
        consultation: "Not started",
        status: "Open",
        notes: "Keep support context",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderLeadership();
    fireEvent.click(screen.getByRole("button", { name: "Delete Taylor" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove team member",
      }),
    );
    const after = persisted();
    expect(after.members).toEqual([]);
    expect(after.tasks[0].assigneeId).toBeUndefined();
    expect(after.developmentActions[0]).toMatchObject({
      memberId: "",
      notes: "Keep these notes",
      taskId: "task",
    });
    expect(after.disciplinePlans[0]).toMatchObject({
      memberId: "",
      notes: "Keep support context",
    });
  });

  it("offers a development reminder only after a completed action is reopened", () => {
    const saved = seedMember();
    saved.developmentActions = [
      {
        id: "action",
        memberId: "member",
        title: "Finished mentoring",
        kind: "Mentoring",
        dueDate: addDays(localDate(), 7),
        status: "Complete",
        notes: "",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderLeadership();
    fireEvent.change(screen.getByLabelText("Development view"), {
      target: { value: "Completed development" },
    });
    let card = screen.getByRole("article", {
      name: "Development action Finished mentoring",
    });
    expect(
      within(card).queryByRole("button", {
        name: "Add development to calendar",
      }),
    ).toBeNull();
    expect(persisted().events).toEqual([]);

    fireEvent.change(within(card).getByLabelText("Development status"), {
      target: { value: "Planned" },
    });
    fireEvent.change(screen.getByLabelText("Development view"), {
      target: { value: "Active development" },
    });
    card = screen.getByRole("article", {
      name: "Development action Finished mentoring",
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "Add development to calendar" }),
    );
    expect(persisted().events[0]).toMatchObject({
      developmentActionId: "action",
      date: saved.developmentActions[0].dueDate,
    });
  });

  it("offers a follow-up reminder only after a closed preparation plan is reopened", () => {
    const saved = seedMember();
    saved.disciplinePlans = [
      {
        id: "plan",
        memberId: "member",
        title: "Finished support review",
        expectation: "",
        observedGap: "",
        supportPlan: "",
        followUpDate: addDays(localDate(), 7),
        consultation: "Completed",
        status: "Closed",
        notes: "",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderLeadership();
    fireEvent.change(screen.getByLabelText("Preparation view"), {
      target: { value: "Closed preparation" },
    });
    let card = screen.getByRole("article", {
      name: "Preparation plan Finished support review",
    });
    expect(
      within(card).queryByRole("button", {
        name: "Add preparation follow-up to calendar",
      }),
    ).toBeNull();
    expect(persisted().events).toEqual([]);

    fireEvent.change(within(card).getByLabelText("Preparation status"), {
      target: { value: "Monitoring" },
    });
    fireEvent.change(screen.getByLabelText("Preparation view"), {
      target: { value: "Active preparation" },
    });
    card = screen.getByRole("article", {
      name: "Preparation plan Finished support review",
    });
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Add preparation follow-up to calendar",
      }),
    );
    expect(persisted().events[0]).toMatchObject({
      disciplinePlanId: "plan",
      date: saved.disciplinePlans[0].followUpDate,
    });
  });
});

describe("local support directory", () => {
  it("matches a saved local agency to the selected need and keeps team records when the contact is removed", () => {
    render(
      <PlannerProvider>
        <Support />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("Name or local office name"),
      { target: { value: "Local readiness office" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Agency"), {
      target: { value: "MFRC" },
    });
    fireEvent.change(within(dialog).getByLabelText("Phone"), {
      target: { value: "555-0100" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save contact" }),
    );
    fireEvent.change(
      screen.getByLabelText("What kind of support are you looking for?"),
      { target: { value: "financial-emergency" } },
    );
    const resource = screen.getByRole("article", {
      name: "Support resource Military & Family Readiness Center",
    });
    expect(within(resource).getByText("Local readiness office")).toBeTruthy();
    expect(
      within(resource).getByRole("link", { name: "Call" }).getAttribute("href"),
    ).toMatch(/^tel:/);
    const contactCard = screen.getByRole("article", {
      name: "Contact Local readiness office",
    });
    fireEvent.click(
      within(contactCard).getByRole("button", { name: "Add to Leadership" }),
    );
    const contact = persisted().contacts[0];
    expect(persisted().members[0].contactId).toBe(contact.id);
    expect(
      within(contactCard).queryByRole("button", { name: "Add to Leadership" }),
    ).toBeNull();
    fireEvent.click(
      within(contactCard).getByRole("button", {
        name: "Delete contact Local readiness office",
      }),
    );
    expect(persisted().contacts).toHaveLength(1);
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove contact" }),
    );
    expect(persisted().contacts).toEqual([]);
    expect(persisted().members).toHaveLength(1);
    expect(persisted().members[0].contactId).toBeUndefined();
  });
});
