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
import type {
  Capture,
  PlannerState,
  Project,
  StrategyObjective,
} from "../lib/types";
import Captures from "./Captures";
import Strategy from "./Strategy";

const objective = (
  id: string,
  title: string,
  level: StrategyObjective["level"],
  parentId = "",
): StrategyObjective => ({
  id,
  title,
  level,
  parentId,
  mission: "Train a ready team",
  measure: "Verified handover questions",
  targetDate: "",
  notes: "Unit priority memo, verified 2026-01-02",
});
const project = (): Project => ({
  id: "project",
  title: "Training handover",
  objective: "Simplify handover",
  startDate: "",
  dueDate: "",
  status: "Active",
  ownerId: "",
  objectiveId: "",
  resources: "",
  risks: "",
  successMeasure: "Handover questions",
  baseline: "10",
  target: "7",
  actual: "7",
  notes: "",
  swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
});
const capture = (
  id = "capture",
  title = "Original training note",
  date = "2026-01-20",
): Capture => ({
  id,
  title,
  date,
  category: "Mission",
  context: "",
  actions: "",
  outcome: "",
  lessons: "",
  tags: [],
});
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
function saveFixture(state: PlannerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("strategy alignment workflows", () => {
  it("creates a supporting objective, attaches actual work, and rolls it up to a higher purpose", () => {
    const state = defaultState();
    state.objectives = [objective("wing", "Wing readiness", "Wing")];
    state.projects = [project()];
    state.tasks = [
      {
        id: "task",
        title: "Test the handover",
        date: "",
        priority: "Normal",
        completed: true,
      },
    ];
    state.captures = [
      {
        ...capture(),
        outcome: "Questions reduced from 10 to 7",
        evidence: "Training log",
      },
    ];
    state.goals = [
      {
        id: "goal",
        title: "Training certification",
        targetDate: "2026-08-01",
        category: "Education",
        progress: 40,
      },
    ];
    saveFixture(state);
    render(
      <PlannerProvider>
        <Strategy />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add supporting objective" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Objective title"), {
      target: { value: "Squadron training priority" },
    });
    fireEvent.change(within(dialog).getByLabelText("Level"), {
      target: { value: "Squadron" },
    });
    fireEvent.change(within(dialog).getByLabelText("Mission & purpose"), {
      target: { value: "Reduce training friction" },
    });
    fireEvent.change(within(dialog).getByLabelText("Success measure"), {
      target: { value: "Handover questions per shift" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save objective" }),
    );
    const added = persisted().objectives.find(
      (item) => item.title === "Squadron training priority",
    )!;
    expect(added.parentId).toBe("wing");
    fireEvent.click(screen.getByRole("button", { name: "Link work" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Project"), {
      target: { value: "project" },
    });
    fireEvent.change(within(dialog).getByLabelText("Task or milestone"), {
      target: { value: "task" },
    });
    fireEvent.change(within(dialog).getByLabelText("Accomplishment"), {
      target: { value: "capture" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Career or readiness goal"),
      { target: { value: "goal" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save links" }));
    expect(persisted().projects[0].objectiveId).toBe(added.id);
    expect(persisted().tasks[0].objectiveId).toBe(added.id);
    expect(persisted().captures[0].objectiveId).toBe(added.id);
    expect(persisted().goals[0]).toMatchObject({
      title: "Training certification",
      progress: 40,
      targetDate: "2026-08-01",
      objectiveId: added.id,
    });
    fireEvent.click(
      within(screen.getByRole("region", { name: "Alignment map" })).getByRole(
        "button",
        { name: /Wing readiness/ },
      ),
    );
    expect(screen.getByText("Questions reduced from 10 to 7")).toBeTruthy();
    expect(screen.getByText("Test the handover")).toBeTruthy();
    expect(screen.getByText("Training certification")).toBeTruthy();
    expect(screen.getByText(/Education · 40% complete · Target/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include supporting objectives (1)",
      }),
    );
    expect(screen.queryByText("Questions reduced from 10 to 7")).toBeNull();
    expect(screen.queryByText("Training certification")).toBeNull();
    expect(
      screen.getByRole("checkbox", {
        name: "Include supporting objectives (1)",
      }),
    ).toBeTruthy();
  });

  it("rejects a circular parent even if a disabled option is set programmatically", () => {
    const state = defaultState();
    state.objectives = [
      objective("wing", "Wing readiness", "Wing"),
      objective("section", "Section preparation", "Section", "wing"),
    ];
    saveFixture(state);
    render(
      <PlannerProvider>
        <Strategy />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit objective: Wing readiness" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Supports objective"), {
      target: { value: "section" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save objective" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /circular alignment/,
    );
    expect(persisted().objectives[0].parentId).toBe("");
  });

  it("deletes only a confirmed objective and preserves supporting work and original accomplishments", () => {
    const state = defaultState();
    state.objectives = [
      objective("wing", "Wing readiness", "Wing"),
      objective("section", "Section preparation", "Section", "wing"),
    ];
    state.projects = [{ ...project(), objectiveId: "wing" }];
    state.tasks = [
      {
        id: "task",
        title: "Prepare handover",
        date: "",
        completed: false,
        priority: "Normal",
        objectiveId: "wing",
      },
    ];
    state.captures = [{ ...capture(), objectiveId: "wing" }];
    state.goals = [
      {
        id: "goal",
        title: "Training certification",
        targetDate: "2026-08-01",
        category: "Education",
        progress: 40,
        objectiveId: "wing",
      },
    ];
    saveFixture(state);
    render(
      <PlannerProvider>
        <Strategy />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete objective: Wing readiness" }),
    );
    expect(persisted().objectives).toHaveLength(2);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete objective",
      }),
    );
    const next = persisted();
    expect(next.objectives).toHaveLength(1);
    expect(next.objectives[0].parentId).toBe("");
    expect(next.projects).toHaveLength(1);
    expect(next.tasks).toHaveLength(1);
    expect(next.captures[0]).toMatchObject({
      title: "Original training note",
      date: "2026-01-20",
    });
    expect(next.projects[0].objectiveId).toBe("");
    expect(next.tasks[0].objectiveId || "").toBe("");
    expect(next.captures[0].objectiveId || "").toBe("");
    expect(next.goals).toHaveLength(1);
    expect(next.goals[0]).toMatchObject({
      title: "Training certification",
      progress: 40,
      targetDate: "2026-08-01",
    });
    expect(next.goals[0].objectiveId || "").toBe("");
  });
});

describe("connected AIR records and portfolio", () => {
  it("records separate AIR and evidence, links real work and people, and preserves the original capture", () => {
    const state = defaultState();
    state.objectives = [objective("wing", "Wing readiness", "Wing")];
    state.projects = [{ ...project(), objectiveId: "wing" }];
    state.tasks = [
      {
        id: "task",
        title: "Test the handover",
        date: "",
        completed: false,
        priority: "Normal",
        projectId: "project",
      },
    ];
    state.members = [
      {
        id: "person",
        name: "Casey",
        rank: "SrA",
        focus: "",
        nextFeedback: "",
        notes: "",
      },
    ];
    state.captures = [capture()];
    saveFixture(state);
    render(
      <PlannerProvider>
        <Captures />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add the details" }));
    expect(screen.getByText(/Evidence is empty/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your actions"), {
      target: { value: "Built a checklist" },
    });
    fireEvent.change(screen.getByLabelText("Impact — how you did it"), {
      target: { value: "Worked with 3 trainers" },
    });
    fireEvent.change(screen.getByLabelText("Outcomes & impact"), {
      target: { value: "Reduced questions to 7" },
    });
    fireEvent.change(screen.getByLabelText("Evidence & source"), {
      target: { value: "Training log, 20 Jan 2026" },
    });
    fireEvent.change(screen.getByLabelText("Major Graded Area"), {
      target: { value: "Improving the Unit" },
    });
    fireEvent.change(screen.getByLabelText("Airman Leadership Quality"), {
      target: { value: "Innovation" },
    });
    fireEvent.change(screen.getByLabelText("Linked project"), {
      target: { value: "project" },
    });
    fireEvent.change(screen.getByLabelText("Linked task or milestone"), {
      target: { value: "task" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "SrA Casey" }));
    expect(persisted().captures[0]).toMatchObject({
      title: "Original training note",
      date: "2026-01-20",
      actions: "Built a checklist",
      impact: "Worked with 3 trainers",
      outcome: "Reduced questions to 7",
      evidence: "Training log, 20 Jan 2026",
      mga: "Improving the Unit",
      alq: "Innovation",
      projectId: "project",
      taskId: "task",
      memberIds: ["person"],
    });
    expect(screen.queryByText(/Evidence is empty/)).toBeNull();
    expect(
      screen.getByText(/AIR, evidence, and classification fields are filled/),
    ).toBeTruthy();
    expect(
      screen.getByText("Wing: Wing readiness", { selector: "li" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Major Graded Area"), {
      target: { value: "Leading People" },
    });
    expect(persisted().captures[0].alq).toBe("");
    expect(
      screen.getByText(/No Airman Leadership Quality is selected/),
    ).toBeTruthy();
  });

  it("exports only user-selected period and category records, including actual evidence and no invented narrative", async () => {
    const state = defaultState();
    state.captures = [
      {
        ...capture("selected", "Selected record"),
        actions: "Built a checklist",
        impact: "Coordinated 3 trainers",
        outcome: "Questions fell to 7",
        evidence: "Measured training log",
        mga: "Improving the Unit",
        alq: "Innovation",
      },
      {
        ...capture("other-category", "Community record"),
        category: "Community",
      },
      capture("outside-period", "February record", "2026-02-01"),
    ];
    saveFixture(state);
    let exported: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:portfolio";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <PlannerProvider>
        <Captures />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Build portfolio" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Portfolio start date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Portfolio end date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(within(dialog).getByLabelText("Portfolio category"), {
      target: { value: "Mission" },
    });
    const preview = within(dialog).getByLabelText("Portfolio text preview");
    expect(preview.textContent).toContain("Selected record");
    expect(preview.textContent).not.toMatch(/Community record|February record/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clear selection" }),
    );
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Download portfolio text",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /Selected record/ }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Download portfolio text" }),
    );
    const text = await (exported as unknown as Blob).text();
    expect(text).toContain("Improving the Unit");
    expect(text).toContain("Action: Built a checklist");
    expect(text).toContain("Impact: Coordinated 3 trainers");
    expect(text).toContain("Result: Questions fell to 7");
    expect(text).toContain("Evidence: Measured training log");
    expect(text).not.toMatch(
      /Community record|February record|exceptional|100%/,
    );
    expect(persisted().captures).toEqual(state.captures);
  });
});
