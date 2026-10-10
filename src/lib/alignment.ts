import type {
  AirmanLeadershipQuality,
  Capture,
  MajorGradedArea,
  PlannerState,
  StrategyObjective,
  Task,
} from "./types";

export const MAJOR_GRADED_AREAS: readonly MajorGradedArea[] = [
  "Executing the Mission",
  "Leading People",
  "Managing Resources",
  "Improving the Unit",
];

export const ALQ_BY_MGA: Record<
  MajorGradedArea,
  readonly AirmanLeadershipQuality[]
> = {
  "Executing the Mission": ["Job proficiency", "Initiative", "Adaptability"],
  "Leading People": [
    "Inclusion and teamwork",
    "Emotional intelligence",
    "Communication",
  ],
  "Managing Resources": ["Stewardship", "Accountability"],
  "Improving the Unit": ["Decision making", "Innovation"],
};

export const STRATEGY_LEVELS: readonly StrategyObjective["level"][] = [
  "Personal",
  "Section",
  "Squadron",
  "Group",
  "Wing",
  "MAJCOM",
  "Service",
  "National",
];

/** Rejects both a new back-edge and a parent chain that is already cyclic. */
export function wouldCreateObjectiveCycle(
  objectives: StrategyObjective[],
  objectiveId: string,
  parentId: string,
): boolean {
  if (!parentId) return false;
  const visited = new Set<string>(objectiveId ? [objectiveId] : []);
  let current = parentId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    const parent = objectives.find((objective) => objective.id === current);
    if (!parent) return false;
    current = parent.parentId;
  }
  return false;
}

/** Starts with the selected objective, then walks toward its higher purpose. */
export function getObjectivePath(
  objectives: StrategyObjective[],
  objectiveId: string,
): StrategyObjective[] {
  const path: StrategyObjective[] = [];
  const visited = new Set<string>();
  let current = objectiveId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const objective = objectives.find((item) => item.id === current);
    if (!objective) break;
    path.push(objective);
    current = objective.parentId;
  }
  return path;
}

/** Descendants exclude the selected root and are bounded even for malformed graphs. */
export function getObjectiveDescendantIds(
  objectives: StrategyObjective[],
  objectiveId: string,
): string[] {
  const visited = new Set<string>([objectiveId]);
  const queue = [objectiveId];
  const descendants: string[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    for (const child of objectives.filter(
      (objective) => objective.parentId === queue[index],
    )) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child.id);
      queue.push(child.id);
    }
  }
  return descendants;
}

export function getTaskObjectiveIds(task: Task, state: PlannerState): string[] {
  const project = state.projects.find((item) => item.id === task.projectId);
  return [
    ...new Set(
      [task.objectiveId, project?.objectiveId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
}

/** Shows explicit links and inherited links; it never infers a mission from prose. */
export function getCaptureObjectiveIds(
  capture: Capture,
  state: PlannerState,
): string[] {
  const project = state.projects.find((item) => item.id === capture.projectId);
  const task = state.tasks.find((item) => item.id === capture.taskId);
  return [
    ...new Set(
      [
        capture.objectiveId,
        project?.objectiveId,
        ...(task ? getTaskObjectiveIds(task, state) : []),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function getObjectiveRollup(
  state: PlannerState,
  objectiveId: string,
  includeDescendants = true,
) {
  const objectiveIds = state.objectives.some(
    (objective) => objective.id === objectiveId,
  )
    ? [
        objectiveId,
        ...(includeDescendants
          ? getObjectiveDescendantIds(state.objectives, objectiveId)
          : []),
      ]
    : [];
  const ids = new Set(objectiveIds);
  const projects = state.projects.filter((project) =>
    ids.has(project.objectiveId),
  );
  const tasks = state.tasks.filter((task) =>
    getTaskObjectiveIds(task, state).some((id) => ids.has(id)),
  );
  const captures = state.captures.filter((capture) =>
    getCaptureObjectiveIds(capture, state).some((id) => ids.has(id)),
  );
  const goals = state.goals.filter((goal) => ids.has(goal.objectiveId || ""));
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const evidenceCount = captures.filter((capture) =>
    capture.evidence?.trim(),
  ).length;
  const gaps: string[] = [];
  if (objective && !objective.mission.trim())
    gaps.push("No mission or purpose recorded for this objective.");
  if (objective && !objective.measure.trim())
    gaps.push("No success measure recorded for this objective.");
  if (!projects.length && !tasks.length && !goals.length)
    gaps.push(
      "No project, task, or goal is linked to this objective or its supporting objectives.",
    );
  if (captures.length > evidenceCount)
    gaps.push(
      `${captures.length - evidenceCount} linked ${captures.length - evidenceCount === 1 ? "accomplishment needs" : "accomplishments need"} supporting evidence.`,
    );
  return {
    objectiveIds,
    projects,
    tasks,
    captures,
    goals,
    completedProjects: projects.filter(
      (project) => project.status === "Complete",
    ).length,
    completedTasks: tasks.filter(
      (task) => task.completed || task.status === "Done",
    ).length,
    evidenceCount,
    resultsCount: captures.filter((capture) => capture.outcome.trim()).length,
    gaps,
  };
}

export interface CapturePrompt {
  key: string;
  message: string;
}

/** Every prompt corresponds to an empty field or an explicit category mismatch. */
export function getCapturePrompts(capture: Capture): CapturePrompt[] {
  const prompts: CapturePrompt[] = [];
  if (!capture.actions.trim())
    prompts.push({
      key: "actions",
      message: "Action is empty. Record what you personally did.",
    });
  if (!capture.impact?.trim())
    prompts.push({
      key: "impact",
      message:
        "Impact is empty. Explain how you carried out the work, including scope or reach when known.",
    });
  if (!capture.outcome.trim())
    prompts.push({
      key: "outcome",
      message:
        "Result is empty. Record what changed and why it mattered; use verified numbers when available.",
    });
  if (!capture.evidence?.trim())
    prompts.push({
      key: "evidence",
      message:
        "Evidence is empty. Add a source, measurement, or supporting reference you can verify.",
    });
  if (!capture.mga)
    prompts.push({
      key: "mga",
      message:
        "No Major Graded Area is selected. Choose the area that best fits this work, or leave it uncategorized while you review.",
    });
  if (!capture.alq)
    prompts.push({
      key: "alq",
      message:
        "No Airman Leadership Quality is selected. Choose a quality supported by the actual accomplishment.",
    });
  else if (!capture.mga || !ALQ_BY_MGA[capture.mga].includes(capture.alq))
    prompts.push({
      key: "alq-mismatch",
      message:
        "The selected quality does not belong to the selected Major Graded Area. Review both selections.",
    });
  return prompts;
}

/** A faithful collection of user inputs; this does not generate a performance statement. */
export function buildPortfolioText(
  captures: Capture[],
  state: PlannerState,
): string {
  const lines = [
    "ENLISTED PLANNER — ACCOMPLISHMENT PORTFOLIO",
    "User-entered records for review. Verify facts and sources before official use.",
    "",
  ];
  const groups: (MajorGradedArea | "")[] = [...MAJOR_GRADED_AREAS, ""];
  for (const group of groups) {
    const records = captures
      .filter((capture) => (capture.mga || "") === group)
      .sort((left, right) => left.date.localeCompare(right.date));
    if (!records.length) continue;
    lines.push(
      group || "Uncategorized",
      "=".repeat((group || "Uncategorized").length),
      "",
    );
    for (const capture of records) {
      lines.push(
        `${capture.date} — ${capture.title}`,
        `Category: ${capture.category}`,
      );
      if (capture.alq) lines.push(`Airman Leadership Quality: ${capture.alq}`);
      const fields = [
        ["Background", capture.context],
        ["Action", capture.actions],
        ["Impact", capture.impact],
        ["Result", capture.outcome],
        ["Evidence", capture.evidence],
        ["Lessons & next steps", capture.lessons],
      ];
      for (const [label, value] of fields)
        if (value?.trim()) lines.push(`${label}: ${value}`);
      if (capture.tags.length) lines.push(`Tags: ${capture.tags.join(", ")}`);
      const project = state.projects.find(
        (item) => item.id === capture.projectId,
      );
      const task = state.tasks.find((item) => item.id === capture.taskId);
      if (project) lines.push(`Project: ${project.title}`);
      if (task) lines.push(`Task: ${task.title}`);
      const involved = state.members.filter((member) =>
        capture.memberIds?.includes(member.id),
      );
      if (involved.length)
        lines.push(
          `People involved: ${involved.map((member) => [member.rank, member.name].filter(Boolean).join(" ")).join(", ")}`,
        );
      const paths = getCaptureObjectiveIds(capture, state)
        .map((id) =>
          getObjectivePath(state.objectives, id)
            .map((objective) => `${objective.level}: ${objective.title}`)
            .join(" → "),
        )
        .filter(Boolean);
      if (paths.length) lines.push(`Alignment: ${paths.join(" | ")}`);
      lines.push("");
    }
  }
  if (!captures.length) lines.push("No records selected.");
  return lines.join("\n");
}
