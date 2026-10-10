import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import type { Capture, Project, StrategyObjective } from "./types";
import {
  ALQ_BY_MGA,
  buildPortfolioText,
  getCaptureObjectiveIds,
  getCapturePrompts,
  getObjectiveDescendantIds,
  getObjectivePath,
  getObjectiveRollup,
  MAJOR_GRADED_AREAS,
  wouldCreateObjectiveCycle,
} from "./alignment";

export const objectiveFixture = (
  id: string,
  parentId = "",
  level: StrategyObjective["level"] = "Personal",
): StrategyObjective => ({
  id,
  parentId,
  level,
  title: `${id} priority`,
  mission: "User-entered purpose",
  measure: "User-entered success measure",
  targetDate: "",
  notes: "",
});
export const projectFixture = (id = "project", objectiveId = ""): Project => ({
  id,
  title: "Training handover project",
  objective: "Build a handover",
  startDate: "",
  dueDate: "",
  status: "Active",
  ownerId: "",
  objectiveId,
  resources: "",
  risks: "",
  successMeasure: "Questions per handover",
  baseline: "10",
  target: "7",
  actual: "7",
  notes: "",
  swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
});
export const captureFixture = (id = "capture"): Capture => ({
  id,
  title: "Improved training handover",
  date: "2026-01-20",
  category: "Mission",
  context: "Original context",
  actions: "Created a checklist",
  impact: "Coordinated with 3 trainers",
  outcome: "Reduced questions from 10 to 7",
  evidence: "Local training log, 20 Jan 2026",
  lessons: "",
  tags: ["training"],
  mga: "Improving the Unit",
  alq: "Innovation",
});

describe("objective graph and linked result rollups", () => {
  it("blocks self and descendant parents, including preexisting cycles", () => {
    const objectives = [
      objectiveFixture("wing", "", "Wing"),
      objectiveFixture("squadron", "wing", "Squadron"),
      objectiveFixture("personal", "squadron"),
    ];
    expect(wouldCreateObjectiveCycle(objectives, "wing", "personal")).toBe(
      true,
    );
    expect(wouldCreateObjectiveCycle(objectives, "wing", "wing")).toBe(true);
    expect(wouldCreateObjectiveCycle(objectives, "personal", "wing")).toBe(
      false,
    );
    expect(wouldCreateObjectiveCycle(objectives, "personal", "")).toBe(false);
    const cyclic = [
      objectiveFixture("one", "two"),
      objectiveFixture("two", "one"),
    ];
    expect(wouldCreateObjectiveCycle(cyclic, "new", "one")).toBe(true);
    expect(getObjectivePath(cyclic, "one").map((item) => item.id)).toEqual([
      "one",
      "two",
    ]);
    expect(getObjectiveDescendantIds(cyclic, "one")).toEqual(["two"]);
  });

  it("traces from personal work toward organizational purpose", () => {
    const objectives = [
      objectiveFixture("national", "", "National"),
      objectiveFixture("wing", "national", "Wing"),
      objectiveFixture("personal", "wing"),
    ];
    expect(
      getObjectivePath(objectives, "personal").map((item) => item.id),
    ).toEqual(["personal", "wing", "national"]);
    expect(getObjectiveDescendantIds(objectives, "national")).toEqual([
      "wing",
      "personal",
    ]);
    expect(getObjectivePath(objectives, "missing")).toEqual([]);
  });

  it("counts inherited project/task links once and explains missing supporting evidence", () => {
    const state = defaultState();
    state.objectives = [
      objectiveFixture("wing", "", "Wing"),
      objectiveFixture("personal", "wing"),
    ];
    state.projects = [
      { ...projectFixture("project", "personal"), status: "Complete" },
    ];
    state.tasks = [
      {
        id: "task",
        title: "Test handover",
        date: "",
        completed: true,
        priority: "Normal",
        projectId: "project",
        objectiveId: "personal",
        status: "Done",
      },
    ];
    state.captures = [
      {
        ...captureFixture(),
        projectId: "project",
        taskId: "task",
        objectiveId: "personal",
      },
      { ...captureFixture("missing-evidence"), evidence: "", taskId: "task" },
    ];
    state.goals = [
      {
        id: "goal",
        title: "Training certification",
        targetDate: "2026-08-01",
        category: "Education",
        progress: 40,
        objectiveId: "personal",
      },
    ];
    expect(getCaptureObjectiveIds(state.captures[0], state)).toEqual([
      "personal",
    ]);
    const rollup = getObjectiveRollup(state, "wing");
    expect(rollup.projects).toHaveLength(1);
    expect(rollup.tasks).toHaveLength(1);
    expect(rollup.captures).toHaveLength(2);
    expect(rollup.goals).toEqual(state.goals);
    expect(rollup).toMatchObject({
      completedProjects: 1,
      completedTasks: 1,
      evidenceCount: 1,
      resultsCount: 2,
    });
    expect(rollup.gaps).toContain(
      "1 linked accomplishment needs supporting evidence.",
    );
    expect(getObjectiveRollup(state, "wing", false).captures).toEqual([]);
    expect(getObjectiveRollup(state, "wing", false).goals).toEqual([]);
    expect(getObjectiveRollup(state, "missing").objectiveIds).toEqual([]);
  });

  it("does not infer alignment from matching title or prose", () => {
    const state = defaultState();
    state.objectives = [objectiveFixture("one")];
    state.projects = [{ ...projectFixture(), objective: "one priority" }];
    state.captures = [
      { ...captureFixture(), title: "one priority", projectId: "project" },
    ];
    expect(getObjectiveRollup(state, "one").captures).toEqual([]);
    expect(getObjectiveRollup(state, "one").projects).toEqual([]);
  });
});

describe("explainable accomplishment review and portfolio", () => {
  it("maps all ten leadership qualities exactly once across the four MGAs", () => {
    const qualities = MAJOR_GRADED_AREAS.flatMap((area) => ALQ_BY_MGA[area]);
    expect(qualities).toHaveLength(10);
    expect(new Set(qualities).size).toBe(10);
    expect(ALQ_BY_MGA["Improving the Unit"]).toEqual([
      "Decision making",
      "Innovation",
    ]);
  });

  it("reports only empty fields or an explicit MGA/ALQ mismatch", () => {
    expect(getCapturePrompts(captureFixture())).toEqual([]);
    const incomplete = {
      ...captureFixture(),
      actions: "  ",
      evidence: "",
      mga: "" as const,
      alq: "" as const,
    };
    expect(getCapturePrompts(incomplete).map((prompt) => prompt.key)).toEqual([
      "actions",
      "evidence",
      "mga",
      "alq",
    ]);
    expect(
      getCapturePrompts({ ...captureFixture(), mga: "Leading People" }).map(
        (prompt) => prompt.key,
      ),
    ).toEqual(["alq-mismatch"]);
  });

  it("exports literal inputs grouped by MGA without filling absent outcomes or inventing facts", () => {
    const state = defaultState();
    state.objectives = [objectiveFixture("wing", "", "Wing")];
    state.projects = [projectFixture("project", "wing")];
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
    const entered = {
      ...captureFixture(),
      projectId: "project",
      memberIds: ["person"],
    };
    const quick = {
      ...captureFixture("quick"),
      title: "Quick note only",
      date: "2026-01-01",
      actions: "",
      context: "",
      impact: "",
      outcome: "",
      evidence: "",
      tags: [],
      mga: "" as const,
      alq: "" as const,
    };
    const text = buildPortfolioText([quick, entered], state);
    expect(text).toContain("Improving the Unit\n==================");
    expect(text).toContain("Action: Created a checklist");
    expect(text).toContain("Impact: Coordinated with 3 trainers");
    expect(text).toContain("Result: Reduced questions from 10 to 7");
    expect(text).toContain("Evidence: Local training log, 20 Jan 2026");
    expect(text).toContain("Alignment: Wing: wing priority");
    expect(text).toContain("People involved: SrA Casey");
    expect(text).toContain("Uncategorized");
    const quickText = text.split("Uncategorized")[1];
    expect(quickText).toContain("2026-01-01 — Quick note only");
    expect(quickText).not.toContain("Result:");
    expect(text).not.toMatch(/100%|exceptional|saved lives|mission success/i);
    expect(buildPortfolioText([], state)).toContain("No records selected.");
  });
});
