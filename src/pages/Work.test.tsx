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
import { addDays, localDate } from "../lib/dates";
import type { Project } from "../lib/types";
import Work from "./Work";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const saved = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
const renderWork = (onOpenDay = vi.fn()) => {
  render(
    <PlannerProvider>
      <Work onOpenDay={onOpenDay} />
    </PlannerProvider>,
  );
  return onOpenDay;
};
const project = (): Project => ({
  id: "project",
  title: "Handover improvement",
  objective: "Reduce rework.",
  startDate: localDate(),
  dueDate: "",
  status: "Active",
  ownerId: "",
  objectiveId: "",
  resources: "One study session.",
  risks: "Coverage.",
  successMeasure: "Minutes saved.",
  baseline: "20",
  target: "10",
  actual: "",
  notes: "",
  swot: {
    strengths: "Team experience.",
    weaknesses: "",
    opportunities: "",
    threats: "",
  },
});

describe("mission work UI", () => {
  it("reviews an existing scheduled block on its work day without opening another scheduling draft", () => {
    const initial = defaultState();
    initial.tasks = [
      {
        id: "scheduled-task",
        title: "Review inputs",
        date: addDays(localDate(), 5),
        priority: "Normal",
        completed: false,
      },
    ];
    initial.blocks = [
      {
        id: "scheduled-block",
        title: "Review inputs",
        date: localDate(),
        start: "09:00",
        end: "10:00",
        category: "Duty",
        notes: "",
        completed: false,
        taskId: "scheduled-task",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    const onOpenDay = renderWork();
    fireEvent.click(screen.getByRole("tab", { name: "Taskers" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Schedule tasker: Review inputs" }),
    );
    expect(onOpenDay).toHaveBeenCalledWith(localDate());
  });

  it("shows source connections even without notes and keeps metric labels when values are missing", () => {
    const initial = defaultState();
    initial.projects = [
      { ...project(), baseline: "", target: "10", actual: "" },
    ];
    initial.meetings = [
      {
        id: "meeting",
        title: "Mission review",
        date: localDate(),
        time: "",
        objective: "",
        participants: [],
        agenda: "",
        decisions: "",
        nextDate: "",
        notes: "",
      },
    ];
    initial.tasks = [
      {
        id: "action",
        title: "Refresh guide",
        date: "",
        priority: "Normal",
        completed: false,
        meetingId: "meeting",
        notes: "",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    renderWork();
    expect(
      screen.getByText(
        "Baseline: Not recorded · Target: 10 · Actual: Not recorded",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Taskers" }));
    expect(screen.getByText("Notes & connections")).toBeTruthy();
    expect(screen.getByText("Meeting: Mission review")).toBeTruthy();
  });

  it("creates a complete project, connects an assigned milestone, and schedules its task identity", () => {
    const initial = defaultState();
    initial.members = [
      {
        id: "owner",
        name: "Taylor",
        rank: "SrA",
        focus: "",
        nextFeedback: "",
        notes: "",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    const onOpenDay = renderWork();
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Project title"), {
      target: { value: "  Improve handover  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Project objective"), {
      target: { value: "Reduce repeated work." },
    });
    fireEvent.change(within(dialog).getByLabelText("Project POC"), {
      target: { value: "owner" },
    });
    fireEvent.change(within(dialog).getByLabelText("Resources & ideas"), {
      target: { value: "Team expertise." },
    });
    fireEvent.change(within(dialog).getByLabelText("Strengths"), {
      target: { value: "Experienced technicians." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save project" }),
    );
    expect(saved().projects[0]).toMatchObject({
      title: "Improve handover",
      objective: "Reduce repeated work.",
      ownerId: "owner",
      resources: "Team expertise.",
      swot: { strengths: "Experienced technicians." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tasker" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tasker title"), {
      target: { value: "Deliver review" },
    });
    fireEvent.change(within(dialog).getByLabelText("Action type"), {
      target: { value: "Milestone" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tasker POC"), {
      target: { value: "owner" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Estimated effort (minutes)"),
      { target: { value: "75" } },
    );
    const deadline = addDays(localDate(), 3);
    fireEvent.change(within(dialog).getByLabelText("Deadline date"), {
      target: { value: deadline },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save tasker" }),
    );
    const task = saved().tasks[0];
    expect(task).toMatchObject({
      kind: "Milestone",
      projectId: saved().projects[0].id,
      assigneeId: "owner",
      estimatedMinutes: 75,
    });
    fireEvent.click(screen.getByRole("button", { name: /View work plan/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Schedule tasker: Deliver review" }),
    );
    expect(onOpenDay).toHaveBeenCalledWith(deadline, task.id);
    expect(screen.getByText("1h 15m estimated · 0m scheduled")).toBeTruthy();
  });

  it("guards prerequisite completion and cyclic edits with a named error before saving", () => {
    const initial = defaultState();
    initial.tasks = [
      {
        id: "a",
        title: "Collect evidence",
        date: localDate(),
        priority: "Normal",
        completed: false,
      },
      {
        id: "b",
        title: "Submit packet",
        date: localDate(),
        priority: "High",
        completed: false,
        dependencyIds: ["a"],
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    renderWork();
    fireEvent.click(screen.getByRole("tab", { name: "Taskers" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Complete tasker: Submit packet" }),
    );
    expect(saved().tasks[1].completed).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain(
      "“Collect evidence”",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit tasker: Collect evidence" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /Submit packet/ }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save tasker" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toContain("cycle");
    expect(saved().tasks[0].dependencyIds).toBeUndefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Complete tasker: Collect evidence",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Complete tasker: Submit packet" }),
    );
    expect(
      saved().tasks.every((task) => task.completed && task.status === "Done"),
    ).toBe(true);
  });

  it("keeps meeting notes and decisions connected to accountable action taskers", () => {
    renderWork();
    fireEvent.click(screen.getByRole("tab", { name: "Meetings" }));
    fireEvent.click(screen.getByRole("button", { name: "Add meeting" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Meeting title"), {
      target: { value: "Training review" },
    });
    fireEvent.change(within(dialog).getByLabelText("Meeting objective"), {
      target: { value: "Choose the next training priority." },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Participants (one per line)"),
      { target: { value: "Taylor\nJordan" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Decisions & outcomes"), {
      target: { value: "Refresh the handover guide." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save meeting" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add action" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tasker title"), {
      target: { value: "Update the guide" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save tasker" }),
    );
    expect(saved().meetings[0]).toMatchObject({
      title: "Training review",
      decisions: "Refresh the handover guide.",
      participants: ["Taylor", "Jordan"],
    });
    expect(saved().tasks[0]).toMatchObject({
      meetingId: saved().meetings[0].id,
      requestor: "Meeting: Training review",
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Complete meeting action: Update the guide",
      }),
    );
    expect(saved().tasks[0].completed).toBe(true);
    expect(screen.getByText("1/1 complete")).toBeTruthy();
  });

  it("previews overlap exclusions and prevents regeneration duplicates without losing blocks on deletion", () => {
    const today = localDate(),
      next = addDays(today, 7);
    const initial = defaultState();
    initial.blocks = [
      {
        id: "existing",
        title: "Protected work",
        date: today,
        start: "09:00",
        end: "10:00",
        category: "Duty",
        notes: "",
        completed: false,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    renderWork();
    fireEvent.click(screen.getByRole("tab", { name: "Battle rhythm" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rhythm" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Rhythm title"), {
      target: { value: "Weekly review" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save rhythm" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate time blocks: Weekly review",
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Generate through"), {
      target: { value: next },
    });
    expect(within(dialog).getByText(/Overlaps “Protected work”/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Generate 1 time blocks" }),
    );
    expect(saved().blocks).toHaveLength(2);
    expect(saved().blocks[1]).toMatchObject({
      date: next,
      rhythmId: saved().battleRhythms[0].id,
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate time blocks: Weekly review",
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Generate through"), {
      target: { value: next },
    });
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Generate 0 time blocks",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(dialog).getByText("Already generated for this rhythm."),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete rhythm: Weekly review" }),
    );
    dialog = screen.getByRole("dialog");
    expect(saved().battleRhythms).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete rhythm" }),
    );
    expect(saved().battleRhythms).toEqual([]);
    expect(saved().blocks).toHaveLength(2);
    expect(saved().blocks[1].rhythmId).toBeUndefined();
  });

  it("requires project deletion confirmation and preserves detached linked work", () => {
    const initial = defaultState();
    initial.projects = [project()];
    initial.tasks = [
      {
        id: "action",
        title: "Review inputs",
        date: localDate(),
        priority: "Normal",
        completed: false,
        projectId: "project",
        notes: "Keep the evidence.",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    renderWork();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete project: Handover improvement",
      }),
    );
    expect(saved().projects).toHaveLength(1);
    let dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep project" }),
    );
    expect(saved().projects).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete project: Handover improvement",
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete project" }),
    );
    expect(saved().projects).toEqual([]);
    expect(saved().tasks[0]).toMatchObject({
      title: "Review inputs",
      notes: "Keep the evidence.",
    });
    expect(saved().tasks[0].projectId).toBeUndefined();
  });
});
