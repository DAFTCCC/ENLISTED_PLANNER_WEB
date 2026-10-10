import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ChevronRight,
  Flag,
  Link2,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import {
  getCaptureObjectiveIds,
  getObjectiveDescendantIds,
  getObjectivePath,
  getObjectiveRollup,
  getTaskObjectiveIds,
  STRATEGY_LEVELS,
  wouldCreateObjectiveCycle,
} from "../lib/alignment";
import { removePlannerRecord } from "../lib/relationships";
import type { StrategyObjective } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import "./professional.css";
import "./strategy.css";

const blankObjective = (): Omit<StrategyObjective, "id"> => ({
  title: "",
  level: "Personal",
  parentId: "",
  mission: "",
  measure: "",
  targetDate: "",
  notes: "",
});

export default function Strategy() {
  const { state, mutate } = usePlanner();
  const [selectedId, setSelectedId] = useState(state.objectives[0]?.id || "");
  const [editing, setEditing] = useState<StrategyObjective | "new" | null>(
    null,
  );
  const [draft, setDraft] = useState(blankObjective());
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<StrategyObjective | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkDraft, setLinkDraft] = useState({
    project: "",
    task: "",
    capture: "",
    goal: "",
  });
  const [includeChildren, setIncludeChildren] = useState(true);
  const [notice, setNotice] = useState("");
  const selected =
    state.objectives.find((objective) => objective.id === selectedId) ||
    state.objectives[0];
  const rollup = selected
    ? getObjectiveRollup(state, selected.id, includeChildren)
    : null;
  const roots = state.objectives
    .filter(
      (objective) =>
        !objective.parentId ||
        !state.objectives.some((parent) => parent.id === objective.parentId),
    )
    .sort(
      (left, right) =>
        STRATEGY_LEVELS.indexOf(right.level) -
        STRATEGY_LEVELS.indexOf(left.level),
    );

  function openObjective(objective?: StrategyObjective, parentId = "") {
    setEditing(objective || "new");
    setDraft(
      objective
        ? { ...objective }
        : {
            ...blankObjective(),
            parentId,
            level:
              selected && parentId
                ? STRATEGY_LEVELS[
                    Math.max(0, STRATEGY_LEVELS.indexOf(selected.level) - 1)
                  ]
                : "Personal",
          },
    );
    setError("");
  }

  function saveObjective(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    if (!isProfessionalDate(draft.targetDate, true)) {
      setError("Choose a valid target date with a year between 1 and 9999.");
      return;
    }
    const id = editing && editing !== "new" ? editing.id : crypto.randomUUID();
    if (wouldCreateObjectiveCycle(state.objectives, id, draft.parentId)) {
      setError(
        "This parent would create a circular alignment. Choose another objective.",
      );
      return;
    }
    const parent = state.objectives.find(
      (objective) => objective.id === draft.parentId,
    );
    if (
      draft.parentId &&
      (!parent ||
        STRATEGY_LEVELS.indexOf(parent.level) <=
          STRATEGY_LEVELS.indexOf(draft.level))
    ) {
      setError(
        "Choose a parent at a higher level, or leave the objective unlinked.",
      );
      return;
    }
    mutate((next) => {
      const record = { ...draft, id, title: draft.title.trim() };
      const existing = next.objectives.find((objective) => objective.id === id);
      if (existing) Object.assign(existing, record);
      else next.objectives.push(record);
    });
    setSelectedId(id);
    setEditing(null);
    setNotice(
      "Objective saved. Your alignment and linked work have been updated.",
    );
  }

  function saveLinks(event: FormEvent) {
    event.preventDefault();
    if (!selected || !Object.values(linkDraft).some(Boolean)) return;
    mutate((next) => {
      const project = next.projects.find(
        (item) => item.id === linkDraft.project,
      );
      const task = next.tasks.find((item) => item.id === linkDraft.task);
      const capture = next.captures.find(
        (item) => item.id === linkDraft.capture,
      );
      const goal = next.goals.find((item) => item.id === linkDraft.goal);
      if (project) project.objectiveId = selected.id;
      if (task) task.objectiveId = selected.id;
      if (capture) capture.objectiveId = selected.id;
      if (goal) goal.objectiveId = selected.id;
    });
    setLinking(false);
    setLinkDraft({ project: "", task: "", capture: "", goal: "" });
    setNotice("Selected work linked to this objective.");
  }

  function tree(
    objective: StrategyObjective,
    ancestors: Set<string> = new Set(),
    depth = 0,
  ) {
    if (ancestors.has(objective.id)) return null;
    const visited = new Set(ancestors).add(objective.id);
    const children = state.objectives.filter(
      (child) => child.parentId === objective.id,
    );
    return (
      <li key={objective.id}>
        <button
          type="button"
          className={`strategy-tree-item ${selected?.id === objective.id ? "selected" : ""}`}
          style={{ paddingLeft: `${14 + Math.min(depth, 7) * 14}px` }}
          onClick={() => setSelectedId(objective.id)}
          aria-current={selected?.id === objective.id ? "true" : undefined}
        >
          <ChevronRight size={15} />
          <span>
            <span className="small muted">{objective.level}</span>
            <strong>{objective.title}</strong>
          </span>
        </button>
        {children.length > 0 && (
          <ul>{children.map((child) => tree(child, visited, depth + 1))}</ul>
        )}
      </li>
    );
  }

  const linkReason = (ids: string[]) =>
    ids
      .map((id) => state.objectives.find((objective) => objective.id === id))
      .filter(Boolean)
      .map((objective) => objective!.title)
      .join(", ");

  return (
    <div className="professional-stack strategy-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONNECT THE WORK TO ITS PURPOSE</span>
          <h1>Strategic alignment</h1>
          <p>
            Trace your priorities from daily work to the missions they support.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => openObjective()}
        >
          <Plus size={17} />
          Add objective
        </button>
      </header>
      <div className="strategy-guidance">
        <Flag size={19} />
        <p>
          Record the actual priorities of your organization, then connect your
          work. National and service priorities remain user entered. In
          objective notes, keep the source title, publication or verification
          date, and reference link so the context can be reviewed.
        </p>
      </div>
      <div className="strategy-layout">
        <section
          className="panel strategy-map"
          aria-labelledby="strategy-map-title"
        >
          <div className="panel-heading">
            <div>
              <h2 id="strategy-map-title">Alignment map</h2>
              <p className="small muted">
                Higher purpose → supporting priorities
              </p>
            </div>
            <span className="badge">{state.objectives.length}</span>
          </div>
          {roots.length ? (
            <ul className="strategy-tree">
              {roots.map((objective) => tree(objective))}
            </ul>
          ) : (
            <div className="professional-empty">
              <Target size={28} />
              <h3>Give your work a direction</h3>
              <p>
                Add a personal or organizational objective. Link supporting
                objectives as the picture develops.
              </p>
            </div>
          )}
          <div className="strategy-level-key">
            {[...STRATEGY_LEVELS].reverse().map((level) => (
              <span key={level}>{level}</span>
            ))}
          </div>
        </section>
        {selected && rollup ? (
          <div
            className="professional-stack strategy-detail"
            style={{ gap: 20 }}
          >
            <section
              className="panel"
              aria-labelledby="selected-objective-title"
            >
              <div className="professional-heading-row">
                <span className="badge">{selected.level} objective</span>
                <div className="professional-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit objective: ${selected.title}`}
                    onClick={() => openObjective(selected)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete objective: ${selected.title}`}
                    onClick={() => setDeleting(selected)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h2
                id="selected-objective-title"
                className="strategy-selected-title"
              >
                {selected.title}
              </h2>
              <nav
                className="strategy-trace"
                aria-label="Objective traceability"
              >
                {getObjectivePath(state.objectives, selected.id).map(
                  (objective, index) => (
                    <span key={objective.id}>
                      {index > 0 && <ArrowRight size={13} />}
                      <button
                        type="button"
                        onClick={() => setSelectedId(objective.id)}
                      >
                        {objective.level}: {objective.title}
                      </button>
                    </span>
                  ),
                )}
              </nav>
              <dl className="strategy-description">
                <div>
                  <dt>Mission & purpose</dt>
                  <dd>
                    {selected.mission || (
                      <span className="muted">Not recorded yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Success measure</dt>
                  <dd>
                    {selected.measure || (
                      <span className="muted">Not recorded yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Target date</dt>
                  <dd>
                    {selected.targetDate ? (
                      <span
                        className={
                          selected.targetDate < localDate()
                            ? "strategy-past-date"
                            : ""
                        }
                      >
                        {formatDate(selected.targetDate)}{" "}
                        <span className="small muted">
                          · user-entered target
                        </span>
                      </span>
                    ) : (
                      <span className="muted">No target date</span>
                    )}
                  </dd>
                </div>
              </dl>
              {selected.notes && (
                <div className="strategy-reference">
                  <strong>Notes & references</strong>
                  <p>{selected.notes}</p>
                </div>
              )}
              {selected.level !== "Personal" && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openObjective(undefined, selected.id)}
                >
                  <Plus size={15} />
                  Add supporting objective
                </button>
              )}
            </section>
            <section className="panel" aria-labelledby="strategy-rollup-title">
              <div className="panel-heading">
                <div>
                  <h2 id="strategy-rollup-title">Work & results</h2>
                  <p className="small muted">
                    Counts come from explicitly linked records.
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setLinkDraft({
                      project: "",
                      task: "",
                      capture: "",
                      goal: "",
                    });
                    setLinking(true);
                  }}
                >
                  <Link2 size={15} />
                  Link work
                </button>
              </div>
              <label className="strategy-child-toggle">
                <input
                  type="checkbox"
                  checked={includeChildren}
                  onChange={(event) => setIncludeChildren(event.target.checked)}
                />
                Include supporting objectives (
                {
                  getObjectiveDescendantIds(state.objectives, selected.id)
                    .length
                }
                )
              </label>
              <div className="professional-summary strategy-rollup">
                <div className="professional-stat">
                  <span>Projects complete</span>
                  <strong>
                    {rollup.completedProjects} / {rollup.projects.length}
                  </strong>
                </div>
                <div className="professional-stat">
                  <span>Tasks complete</span>
                  <strong>
                    {rollup.completedTasks} / {rollup.tasks.length}
                  </strong>
                </div>
                <div className="professional-stat">
                  <span>Records with evidence</span>
                  <strong>
                    {rollup.evidenceCount} / {rollup.captures.length}
                  </strong>
                </div>
              </div>
              <div className="strategy-linked-group">
                <h3>Projects</h3>
                {rollup.projects.length ? (
                  rollup.projects.map((project) => (
                    <article className="strategy-linked-row" key={project.id}>
                      <div>
                        <strong>{project.title}</strong>
                        <p className="small muted">
                          {project.status} · {linkReason([project.objectiveId])}
                        </p>
                        {(project.successMeasure || project.actual) && (
                          <p className="small">
                            <span className="muted">Measure: </span>
                            {project.successMeasure || "Not recorded"}
                            <br />
                            <span className="muted">Actual result: </span>
                            {project.actual || "Not recorded"}
                          </p>
                        )}
                      </div>
                      {project.objectiveId === selected.id && (
                        <button
                          type="button"
                          className="button ghost small"
                          aria-label={`Unlink project: ${project.title}`}
                          onClick={() =>
                            mutate((next) => {
                              const item = next.projects.find(
                                (record) => record.id === project.id,
                              );
                              if (item) item.objectiveId = "";
                            })
                          }
                        >
                          Unlink
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="small muted">No linked projects.</p>
                )}
              </div>
              <div className="strategy-linked-group">
                <h3>Tasks & milestones</h3>
                {rollup.tasks.length ? (
                  rollup.tasks.map((task) => (
                    <article className="strategy-linked-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <p className="small muted">
                          {task.completed ? "Done" : task.status || "Open"}
                          {task.date && ` · ${formatDate(task.date)}`} ·{" "}
                          {linkReason(getTaskObjectiveIds(task, state))}
                        </p>
                      </div>
                      {task.objectiveId === selected.id && (
                        <button
                          type="button"
                          className="button ghost small"
                          aria-label={`Unlink task: ${task.title}`}
                          onClick={() =>
                            mutate((next) => {
                              const item = next.tasks.find(
                                (record) => record.id === task.id,
                              );
                              if (item) item.objectiveId = "";
                            })
                          }
                        >
                          Unlink direct link
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="small muted">No linked tasks.</p>
                )}
              </div>
              <div className="strategy-linked-group">
                <h3>Career & readiness goals</h3>
                {rollup.goals.length ? (
                  rollup.goals.map((goal) => (
                    <article className="strategy-linked-row" key={goal.id}>
                      <div>
                        <strong>{goal.title}</strong>
                        <p className="small muted">
                          {goal.category} · {goal.progress}% complete
                          {goal.targetDate
                            ? ` · Target ${formatDate(goal.targetDate)}`
                            : " · No target date"}
                        </p>
                        <p className="small muted">
                          {goal.source || "User entered"} ·{" "}
                          {linkReason([goal.objectiveId || ""])}
                        </p>
                      </div>
                      {goal.objectiveId === selected.id && (
                        <button
                          type="button"
                          className="button ghost small"
                          aria-label={`Unlink goal: ${goal.title}`}
                          onClick={() =>
                            mutate((next) => {
                              const item = next.goals.find(
                                (record) => record.id === goal.id,
                              );
                              if (item) delete item.objectiveId;
                            })
                          }
                        >
                          Unlink direct link
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="small muted">
                    No linked goals. Connect an existing career or readiness
                    goal to show its progress here.
                  </p>
                )}
              </div>
              <div className="strategy-linked-group">
                <h3>Accomplishments</h3>
                <p className="small muted">
                  {rollup.resultsCount} of {rollup.captures.length} records have
                  a result entered.
                </p>
                {rollup.captures.length ? (
                  rollup.captures.map((capture) => (
                    <article className="strategy-linked-row" key={capture.id}>
                      <div>
                        <strong>{capture.title}</strong>
                        <p className="small muted">
                          {formatDate(capture.date)} ·{" "}
                          {capture.evidence?.trim()
                            ? "Evidence recorded"
                            : "Evidence needed"}
                        </p>
                        <p className="small">
                          {capture.outcome || "Result not recorded yet."}
                        </p>
                        <p className="small muted">
                          Aligned through:{" "}
                          {linkReason(getCaptureObjectiveIds(capture, state))}
                        </p>
                      </div>
                      {capture.objectiveId === selected.id && (
                        <button
                          type="button"
                          className="button ghost small"
                          aria-label={`Unlink accomplishment: ${capture.title}`}
                          onClick={() =>
                            mutate((next) => {
                              const item = next.captures.find(
                                (record) => record.id === capture.id,
                              );
                              if (item) item.objectiveId = "";
                            })
                          }
                        >
                          Unlink direct link
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="small muted">
                    No linked accomplishments. Connect a capture to its work or
                    objective.
                  </p>
                )}
              </div>
              {rollup.gaps.length > 0 && (
                <div className="strategy-gaps">
                  <h3>Planning gaps to review</h3>
                  <ul>
                    {rollup.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="small muted">
                A completion count reflects task or project status. It does not
                establish that the strategic objective has been achieved.
                Compare actual results with the success measure.
              </p>
            </section>
          </div>
        ) : (
          <section className="panel strategy-start">
            <Target size={38} />
            <h2>Start with a meaningful objective</h2>
            <p>
              What are you trying to accomplish, how will you know it worked,
              and which mission does it support?
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => openObjective()}
            >
              <Plus size={16} />
              Create your first objective
            </button>
          </section>
        )}
      </div>
      {notice && (
        <p className="small muted" role="status">
          {notice}
        </p>
      )}
      {editing && (
        <ProfessionalDialog
          title={
            editing === "new"
              ? "Add strategic objective"
              : "Edit strategic objective"
          }
          onClose={() => setEditing(null)}
        >
          <form className="professional-modal-body" onSubmit={saveObjective}>
            <label className="field">
              Objective title
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="The outcome you want to achieve"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Level
                <select
                  value={draft.level}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      level: event.target.value as StrategyObjective["level"],
                    })
                  }
                >
                  {STRATEGY_LEVELS.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Supports objective
                <select
                  value={draft.parentId}
                  onChange={(event) =>
                    setDraft({ ...draft, parentId: event.target.value })
                  }
                >
                  <option value="">None / top-level priority</option>
                  {state.objectives.map((objective) => (
                    <option
                      key={objective.id}
                      value={objective.id}
                      disabled={
                        wouldCreateObjectiveCycle(
                          state.objectives,
                          editing === "new" ? "" : editing.id,
                          objective.id,
                        ) ||
                        STRATEGY_LEVELS.indexOf(objective.level) <=
                          STRATEGY_LEVELS.indexOf(draft.level)
                      }
                    >
                      {objective.level}: {objective.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Mission & purpose
              <textarea
                value={draft.mission}
                maxLength={10000}
                onChange={(event) =>
                  setDraft({ ...draft, mission: event.target.value })
                }
                placeholder="Why does this objective matter to the mission or the people?"
              />
            </label>
            <label className="field">
              Success measure
              <textarea
                value={draft.measure}
                maxLength={10000}
                onChange={(event) =>
                  setDraft({ ...draft, measure: event.target.value })
                }
                placeholder="A verifiable outcome or measure of success"
              />
            </label>
            <label className="field">
              Target date (optional)
              <input
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.targetDate}
                onChange={(event) =>
                  setDraft({ ...draft, targetDate: event.target.value })
                }
              />
            </label>
            <label className="field">
              Notes & strategy references
              <textarea
                value={draft.notes}
                maxLength={20000}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                placeholder="Source title, publication or verification date, reference URL, and local context"
              />
            </label>
            <p className="small muted">
              Use current guidance supplied by your organization. References are
              your editable notes; this planner does not verify national or
              service priorities.
            </p>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button type="submit" className="button primary">
                Save objective
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {linking && selected && (
        <ProfessionalDialog
          title={`Link work to ${selected.title}`}
          onClose={() => setLinking(false)}
        >
          <form className="professional-modal-body" onSubmit={saveLinks}>
            <p className="small muted">
              Choose existing records. Saving sets their direct objective to
              this priority. Alignment inherited from a linked project or task
              is retained.
            </p>
            <label className="field">
              Project
              <select
                value={linkDraft.project}
                onChange={(event) =>
                  setLinkDraft({ ...linkDraft, project: event.target.value })
                }
              >
                <option value="">Do not change a project</option>
                {state.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                    {project.objectiveId
                      ? ` — currently ${linkReason([project.objectiveId])}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Task or milestone
              <select
                value={linkDraft.task}
                onChange={(event) =>
                  setLinkDraft({ ...linkDraft, task: event.target.value })
                }
              >
                <option value="">Do not change a task</option>
                {state.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                    {task.objectiveId
                      ? ` — currently ${linkReason([task.objectiveId])}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Accomplishment
              <select
                value={linkDraft.capture}
                onChange={(event) =>
                  setLinkDraft({ ...linkDraft, capture: event.target.value })
                }
              >
                <option value="">Do not change an accomplishment</option>
                {state.captures.map((capture) => (
                  <option key={capture.id} value={capture.id}>
                    {capture.date} — {capture.title}
                    {capture.objectiveId
                      ? ` — currently ${linkReason([capture.objectiveId])}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Career or readiness goal
              <select
                value={linkDraft.goal}
                onChange={(event) =>
                  setLinkDraft({ ...linkDraft, goal: event.target.value })
                }
              >
                <option value="">Do not change a goal</option>
                {state.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                    {goal.objectiveId
                      ? ` — currently ${linkReason([goal.objectiveId])}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {!state.projects.length &&
              !state.tasks.length &&
              !state.captures.length &&
              !state.goals.length && (
                <p className="small muted">
                  Create work, a career or readiness goal, or an accomplishment,
                  then return to link it.
                </p>
              )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setLinking(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!Object.values(linkDraft).some(Boolean)}
              >
                Save links
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deleting && (
        <ProfessionalDialog
          title="Delete this objective?"
          onClose={() => setDeleting(null)}
        >
          <p>
            This removes “{deleting.title}”. Supporting objectives become
            unlinked priorities. Projects, tasks, goals, and accomplishments are
            preserved and their direct links to this objective are cleared.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Keep objective
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                mutate((next) =>
                  removePlannerRecord(next, "objectives", deleting.id),
                );
                setSelectedId("");
                setDeleting(null);
                setNotice(
                  "Objective deleted. Linked records have been preserved.",
                );
              }}
            >
              Delete objective
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
