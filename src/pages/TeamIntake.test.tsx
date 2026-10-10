import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { localDate } from "../lib/dates";
import { buildTaskerOffer, buildTaskerUpdate } from "../lib/delegation";
import TeamTaskers from "./TeamTaskers";
import TaskerIntake from "./TaskerIntake";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const saved = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
const setup = () => {
  const state = defaultState();
  state.members = [
    {
      id: "taylor",
      name: "Taylor",
      rank: "SrA",
      focus: "",
      nextFeedback: "",
      notes: "",
    },
  ];
  state.tasks = [
    {
      id: "task",
      title: "Review inputs",
      date: "2030-01-01",
      completed: false,
      priority: "High",
      assigneeId: "taylor",
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
};

describe("reviewed delegation and intake UI", () => {
  it("prepares a portable offer without sending or inventing recipient acceptance", () => {
    setup();
    render(
      <PlannerProvider>
        <TeamTaskers />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare offer" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Recipient name")).toHaveProperty(
      "value",
      "Taylor",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Prepare offer packet" }),
    );
    const packet = JSON.parse(
      (screen.getByLabelText("Packet JSON") as HTMLTextAreaElement).value,
    );
    expect(packet.delegation.recipientName).toBe("Taylor");
    expect(saved().delegations).toHaveLength(1);
    expect(saved().delegations[0].status).toBe("Offered");
    expect(saved().tasks[0].completed).toBe(false);
    expect(screen.getByText(/does not send an email/)).toBeTruthy();
  });

  it("requires owner review of submission, then separately confirms task completion", () => {
    const state = setup();
    const date = localDate();
    state.delegations = [
      {
        id: "offer",
        taskId: "task",
        recipientName: "Taylor",
        recipientEmail: "",
        status: "Offered",
        sentOn: date,
        updatedOn: date,
        progress: 0,
        blocker: "",
        notes: "",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const offer = buildTaskerOffer(state, state.delegations[0]);
    const update = buildTaskerUpdate(offer, {
      status: "Submitted",
      progress: 100,
      blocker: "",
      notes: "Guide ready for review.",
    });
    render(
      <PlannerProvider>
        <TeamTaskers />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Update JSON"), {
      target: { value: JSON.stringify(update) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review update" }));
    expect(saved().delegations[0].status).toBe("Offered");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Approve update",
      }),
    );
    expect(saved().delegations[0].status).toBe("Submitted");
    expect(saved().tasks[0].completed).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm completion: Review inputs" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close reviewed tasker",
      }),
    );
    expect(saved().delegations[0].status).toBe("Closed");
    expect(saved().tasks[0]).toMatchObject({
      completed: true,
      completedOn: localDate(),
    });
  });

  it("opens a recipient workspace and returns a blocker packet without editing the supervisor's task", () => {
    const state = setup();
    const offer = buildTaskerOffer(state, {
      id: "external",
      taskId: "task",
      recipientName: "Taylor",
      recipientEmail: "",
      status: "Offered",
      sentOn: localDate(),
      updatedOn: localDate(),
      progress: 0,
      blocker: "",
      notes: "",
    });
    render(
      <PlannerProvider>
        <TeamTaskers />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Recipient workspace" }));
    fireEvent.change(screen.getByLabelText("Offer JSON"), {
      target: { value: JSON.stringify(offer) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open offer" }));
    fireEvent.change(screen.getByLabelText("Your update"), {
      target: { value: "Blocked" },
    });
    fireEvent.change(screen.getByLabelText("Reported progress (%)"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Blocker or help needed"), {
      target: { value: "Need the latest inputs." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare update packet" }),
    );
    const update = JSON.parse(
      (screen.getByLabelText("Packet JSON") as HTMLTextAreaElement).value,
    );
    expect(update).toMatchObject({
      status: "Blocked",
      progress: 25,
      blocker: "Need the latest inputs.",
    });
    expect(saved().delegations).toHaveLength(0);
    expect(saved().tasks[0].completed).toBe(false);
  });

  it("keeps imported draft work inert until each selected draft is reviewed", () => {
    setup();
    const onCreated = vi.fn();
    render(
      <PlannerProvider>
        <TaskerIntake onCreated={onCreated} />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import tasker text" }));
    fireEvent.change(screen.getByLabelText("Email or meeting notes"), {
      target: {
        value:
          "Task: Prepare report; Owner: Taylor; Due: 2030-01-02\nTask: Review handover by next Friday",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Extract draft taskers" }),
    );
    expect(saved().tasks).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Create 2 reviewed taskers" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Review and confirm",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Include draft 2" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Confirm draft 1 reviewed" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create 1 reviewed tasker" }),
    );
    expect(saved().tasks).toHaveLength(2);
    expect(saved().tasks[1]).toMatchObject({
      title: "Prepare report",
      assigneeId: "taylor",
      date: "2030-01-02",
      status: "Open",
    });
    expect(onCreated).toHaveBeenCalledWith([saved().tasks[1].id]);
  });

  it("clears review approval when fields change and allows explicitly undated work", () => {
    setup();
    render(
      <PlannerProvider>
        <TaskerIntake />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import tasker text" }));
    fireEvent.change(screen.getByLabelText("Email or meeting notes"), {
      target: { value: "Task: Review handover by next Friday" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Extract draft taskers" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Confirm draft 1 reviewed" }),
    );
    fireEvent.change(screen.getByLabelText("Tasker title"), {
      target: { value: "Review handover" },
    });
    expect(
      screen.getByRole("checkbox", { name: "Confirm draft 1 reviewed" }),
    ).toHaveProperty("checked", false);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Confirm draft 1 reviewed" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create 1 reviewed tasker" }),
    );
    expect(saved().tasks[1].date).toBe("");
  });
});
