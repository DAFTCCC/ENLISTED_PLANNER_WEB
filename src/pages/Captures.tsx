import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Link2,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import type {
  AirmanLeadershipQuality,
  Capture,
  MajorGradedArea,
} from "../lib/types";
import {
  ALQ_BY_MGA,
  buildPortfolioText,
  getCaptureObjectiveIds,
  getCapturePrompts,
  getObjectivePath,
  MAJOR_GRADED_AREAS,
} from "../lib/alignment";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import "./professional.css";
import "./strategy.css";

const categories: Capture["category"][] = [
  "Mission",
  "Leadership",
  "Development",
  "Community",
];
const isDetailed = (capture: Capture) =>
  Boolean(
    capture.context.trim() ||
    capture.actions.trim() ||
    capture.outcome.trim() ||
    capture.lessons.trim() ||
    capture.tags.length ||
    capture.impact?.trim() ||
    capture.evidence?.trim() ||
    capture.mga ||
    capture.alq ||
    capture.projectId ||
    capture.taskId ||
    capture.objectiveId ||
    capture.memberIds?.length,
  );
function CaptureDetails({ capture }: { capture: Capture }) {
  const { state, mutate, storageError } = usePlanner();
  const [tagDraft, setTagDraft] = useState(capture.tags.join(", "));
  const update = (
    key:
      | "context"
      | "actions"
      | "outcome"
      | "lessons"
      | "category"
      | "impact"
      | "evidence"
      | "mga"
      | "alq"
      | "projectId"
      | "taskId"
      | "objectiveId",
    value: string,
  ) =>
    mutate((next) => {
      const current = next.captures.find((item) => item.id === capture.id);
      if (current) Object.assign(current, { [key]: value });
    });
  const prompts = getCapturePrompts(capture);
  const alignment = getCaptureObjectiveIds(capture, state);
  return (
    <div
      className="professional-capture-details"
      id={`capture-details-${capture.id}`}
    >
      <div className="professional-heading-row" style={{ marginBottom: 18 }}>
        <div>
          <h3>Build your career record</h3>
          <p className="small muted">
            Use Action, Impact, and Result to keep the work and its value clear.
            Your original note and date are preserved.
          </p>
        </div>
        <span className="small professional-icon muted">
          <Check size={14} /> {storageError ? "Session changes" : "Auto-saved"}
        </span>
      </div>
      <label className="field">
        Category
        <select
          value={capture.category}
          onChange={(event) => update("category", event.target.value)}
        >
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          Major Graded Area
          <select
            value={capture.mga || ""}
            onChange={(event) =>
              mutate((next) => {
                const current = next.captures.find(
                  (item) => item.id === capture.id,
                );
                if (!current) return;
                const mga = event.target.value as MajorGradedArea | "";
                current.mga = mga;
                if (
                  current.alq &&
                  (!mga || !ALQ_BY_MGA[mga].includes(current.alq))
                )
                  current.alq = "";
              })
            }
          >
            <option value="">Uncategorized / review later</option>
            {MAJOR_GRADED_AREAS.map((mga) => (
              <option key={mga}>{mga}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Airman Leadership Quality
          <select
            aria-label="Airman Leadership Quality"
            value={capture.alq || ""}
            onChange={(event) =>
              update("alq", event.target.value as AirmanLeadershipQuality)
            }
            disabled={!capture.mga}
          >
            <option value="">Choose a supported quality</option>
            {capture.mga &&
              ALQ_BY_MGA[capture.mga].map((alq) => (
                <option key={alq}>{alq}</option>
              ))}
          </select>
          <span className="small muted">
            Choose the area first, then a quality demonstrated by this work.
          </span>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Background &amp; context
          <textarea
            value={capture.context}
            onChange={(event) => update("context", event.target.value)}
            placeholder="What was the situation, challenge, or responsibility?"
            maxLength={10000}
          />
        </label>
        <label className="field">
          <span className="capture-air-key" aria-hidden="true">
            A · Action — what you did
          </span>
          Your actions
          <textarea
            aria-label="Your actions"
            value={capture.actions}
            onChange={(event) => update("actions", event.target.value)}
            placeholder="What did you do? Who did you lead or support?"
            maxLength={10000}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Impact — how you did it
          <textarea
            value={capture.impact || ""}
            onChange={(event) => update("impact", event.target.value)}
            placeholder="How did you carry out the work? Describe scope, effort, or who benefited, using verified details."
            maxLength={10000}
          />
        </label>
        <label className="field">
          <span className="capture-air-key" aria-hidden="true">
            R · Result — why it matters
          </span>
          Outcomes &amp; impact
          <textarea
            aria-label="Outcomes & impact"
            value={capture.outcome}
            onChange={(event) => update("outcome", event.target.value)}
            placeholder="What changed and why was it important? Record verified outcomes; keep implementation impact in its separate field."
            maxLength={10000}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Evidence &amp; source
          <textarea
            value={capture.evidence || ""}
            onChange={(event) => update("evidence", event.target.value)}
            placeholder="A measurement, source title, reference location, or verification date supporting the result. Enter only appropriate information."
            maxLength={10000}
          />
        </label>
        <label className="field">
          Lessons &amp; next steps
          <textarea
            value={capture.lessons}
            onChange={(event) => update("lessons", event.target.value)}
            placeholder="What did you learn? What would you do next?"
            maxLength={10000}
          />
        </label>
      </div>
      <div className="field">
        <label htmlFor={`capture-tags-${capture.id}`}>Tags</label>
        <input
          id={`capture-tags-${capture.id}`}
          aria-describedby={`capture-tags-hint-${capture.id}`}
          value={tagDraft}
          onChange={(event) => {
            setTagDraft(event.target.value);
            mutate((next) => {
              const current = next.captures.find(
                (item) => item.id === capture.id,
              );
              if (current)
                current.tags = [
                  ...new Set(
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ].slice(0, 20);
            });
          }}
          maxLength={500}
          placeholder="For example: training, process improvement, award"
        />
        <span id={`capture-tags-hint-${capture.id}`} className="small muted">
          Separate tags with commas. Your original capture and date remain
          attached to this record.
        </span>
      </div>
      <section
        className="capture-connections"
        aria-labelledby={`capture-connections-${capture.id}`}
      >
        <h4 id={`capture-connections-${capture.id}`}>
          <Link2 size={16} />
          Connect this accomplishment
        </h4>
        <div className="form-grid">
          <label className="field">
            Linked project
            <select
              value={capture.projectId || ""}
              onChange={(event) => update("projectId", event.target.value)}
            >
              <option value="">No project</option>
              {state.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Linked task or milestone
            <select
              value={capture.taskId || ""}
              onChange={(event) => update("taskId", event.target.value)}
            >
              <option value="">No task</option>
              {state.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Direct strategic objective
          <select
            value={capture.objectiveId || ""}
            onChange={(event) => update("objectiveId", event.target.value)}
          >
            <option value="">No direct objective</option>
            {state.objectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.level}: {objective.title}
              </option>
            ))}
          </select>
        </label>
        {state.members.length > 0 ? (
          <fieldset className="capture-members">
            <legend>People involved (optional)</legend>
            {state.members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={Boolean(capture.memberIds?.includes(member.id))}
                  onChange={(event) =>
                    mutate((next) => {
                      const current = next.captures.find(
                        (item) => item.id === capture.id,
                      );
                      if (!current) return;
                      const ids = new Set(current.memberIds || []);
                      if (event.target.checked) ids.add(member.id);
                      else ids.delete(member.id);
                      current.memberIds = [...ids];
                    })
                  }
                />
                {[member.rank, member.name].filter(Boolean).join(" ")}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="small muted">
            Add teammates in Leadership to connect people involved.
          </p>
        )}
        {alignment.length > 0 && (
          <div className="capture-alignment">
            <strong>Mission traceability</strong>
            <p className="small muted">
              From your direct objective and the objectives of linked work:
            </p>
            <ul>
              {alignment.map((id) => (
                <li key={id}>
                  {getObjectivePath(state.objectives, id)
                    .map(
                      (objective) => `${objective.level}: ${objective.title}`,
                    )
                    .join(" → ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section
        className="capture-prompts"
        aria-labelledby={`capture-review-${capture.id}`}
      >
        <h4 id={`capture-review-${capture.id}`}>Record review</h4>
        {prompts.length ? (
          <>
            <p className="small muted">
              These prompts are based on empty fields or a category mismatch.
              They do not judge the quality of your performance.
            </p>
            <ul>
              {prompts.map((prompt) => (
                <li key={prompt.key}>{prompt.message}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted">
            The AIR, evidence, and classification fields are filled. Review
            accuracy and source support before using this record.
          </p>
        )}
      </section>
    </div>
  );
}

function CapturePortfolio({ onClose }: { onClose: () => void }) {
  const { state } = usePlanner();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("All categories");
  const [mga, setMga] = useState("All areas");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const invalidRange = Boolean(from && to && from > to);
  const candidates = state.captures
    .filter(
      (capture) =>
        (!from || capture.date >= from) &&
        (!to || capture.date <= to) &&
        (category === "All categories" || capture.category === category) &&
        (mga === "All areas" ||
          (mga === "Uncategorized" ? !capture.mga : capture.mga === mga)),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const selected = candidates.filter((capture) => !excluded.has(capture.id));
  const text = buildPortfolioText(selected, state);
  function download() {
    if (invalidRange || !selected.length) return;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `enlisted-planner-portfolio-${localDate()}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Portfolio text download started.");
  }
  return (
    <ProfessionalDialog
      title="Build an accomplishment portfolio"
      onClose={onClose}
    >
      <div className="capture-portfolio">
        <p className="small muted">
          Choose your review period and records. The text groups your actual
          inputs by Major Graded Area; it does not generate or embellish a
          performance statement.
        </p>
        <div className="form-grid">
          <label className="field">
            Portfolio start date
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={from}
              onChange={(event) => {
                if (isProfessionalDate(event.target.value, true))
                  setFrom(event.target.value);
              }}
            />
          </label>
          <label className="field">
            Portfolio end date
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={to}
              onChange={(event) => {
                if (isProfessionalDate(event.target.value, true))
                  setTo(event.target.value);
              }}
            />
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            Portfolio category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>All categories</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Portfolio Major Graded Area
            <select
              value={mga}
              onChange={(event) => setMga(event.target.value)}
            >
              <option>All areas</option>
              {MAJOR_GRADED_AREAS.map((value) => (
                <option key={value}>{value}</option>
              ))}
              <option>Uncategorized</option>
            </select>
          </label>
        </div>
        {invalidRange && (
          <p className="error-text small" role="alert">
            The end date must be on or after the start date.
          </p>
        )}
        <div className="professional-heading-row">
          <h3>
            Select records ({selected.length} / {candidates.length})
          </h3>
          <div className="professional-actions">
            <button
              type="button"
              className="button ghost small"
              onClick={() => setExcluded(new Set())}
            >
              Select all
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={() =>
                setExcluded(
                  new Set([
                    ...excluded,
                    ...candidates.map((capture) => capture.id),
                  ]),
                )
              }
            >
              Clear selection
            </button>
          </div>
        </div>
        <div className="portfolio-records">
          {candidates.length ? (
            candidates.map((capture) => (
              <label key={capture.id}>
                <input
                  type="checkbox"
                  checked={!excluded.has(capture.id)}
                  onChange={(event) =>
                    setExcluded((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.delete(capture.id);
                      else next.add(capture.id);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>{capture.title}</strong>
                  <span className="small muted">
                    {formatDate(capture.date)} ·{" "}
                    {capture.mga || "Uncategorized"}
                  </span>
                </span>
              </label>
            ))
          ) : (
            <p className="small muted">No records match these filters.</p>
          )}
        </div>
        <details className="portfolio-preview">
          <summary>Preview portfolio text</summary>
          <pre aria-label="Portfolio text preview">{text}</pre>
        </details>
        {notice && (
          <p className="small muted" role="status">
            {notice}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="button primary"
            disabled={invalidRange || !selected.length}
            onClick={download}
          >
            <Download size={16} />
            Download portfolio text
          </button>
        </div>
      </div>
    </ProfessionalDialog>
  );
}

export default function Captures() {
  const { state, mutate } = usePlanner();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Capture["category"]>("Mission");
  const [date, setDate] = useState(localDate());
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [stageFilter, setStageFilter] = useState("All records");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Capture | null>(null);
  const [saved, setSaved] = useState(false);
  const [dateError, setDateError] = useState("");
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const detailedCount = state.captures.filter(isDetailed).length;
  const captures = useMemo(
    () =>
      [...state.captures]
        .filter((capture) => {
          const matchQuery = [
            capture.title,
            capture.context,
            capture.actions,
            capture.outcome,
            capture.impact || "",
            capture.evidence || "",
            capture.mga || "",
            capture.alq || "",
            capture.lessons,
            ...capture.tags,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase().trim());
          const matchCategory =
            categoryFilter === "All categories" ||
            capture.category === categoryFilter;
          const matchStage =
            stageFilter === "All records" ||
            (stageFilter === "Detailed records"
              ? isDetailed(capture)
              : !isDetailed(capture));
          return matchQuery && matchCategory && matchStage;
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.captures, query, categoryFilter, stageFilter],
  );
  const capture = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (!isProfessionalDate(date) || date > localDate()) {
      setDateError("Choose a real accomplishment date on or before today.");
      return;
    }
    setDateError("");
    mutate((next) =>
      next.captures.unshift({
        id: crypto.randomUUID(),
        title: title.trim(),
        date,
        category,
        context: "",
        actions: "",
        outcome: "",
        lessons: "",
        tags: [],
      }),
    );
    setTitle("");
    setSaved(true);
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="professional-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REMEMBER THE WORK THAT MATTERS</span>
          <h1>Quick capture</h1>
          <p>A few words now. A stronger career story later.</p>
        </div>
        <div className="professional-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setPortfolioOpen(true)}
          >
            <FileText size={17} />
            Build portfolio
          </button>
          <span className="badge">
            {state.captures.length}{" "}
            {state.captures.length === 1 ? "capture" : "captures"}
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Sparkles size={19} /> What did you accomplish?
          </h2>
          <span className="small muted">Start with one sentence</span>
        </div>
        <form onSubmit={capture}>
          <label className="field">
            Quick note
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
              required
              maxLength={500}
              placeholder="An accomplishment, an improvement, a moment worth remembering…"
            />
          </label>
          <div className="professional-inline" style={{ marginTop: 16 }}>
            <label className="field">
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as Capture["category"])
                }
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Accomplishment date
              <input
                required
                type="date"
                min="0001-01-01"
                max={localDate()}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setDateError("");
                }}
              />
            </label>
            <button
              className="button primary"
              type="submit"
              style={{ alignSelf: "end" }}
            >
              <Plus size={17} /> Capture it
            </button>
          </div>
          {dateError && (
            <p className="error-text small" role="alert">
              {dateError}
            </p>
          )}
          {saved && (
            <p
              className="small professional-icon"
              role="status"
              style={{ marginBottom: 0 }}
            >
              <Check size={15} /> Capture saved. Expand it below whenever you're
              ready.
            </p>
          )}
        </form>
      </section>
      <div className="professional-tip">
        <strong>Capture first. Develop the details later.</strong> Your original
        note stays attached to its date. Expand it with actions, measurable
        impact, and lessons for evaluations, awards, or development
        conversations. Keep sensitive or restricted information out of your
        records.
      </div>
      <section className="professional-stack" style={{ gap: 18 }}>
        <div className="professional-heading-row">
          <div>
            <h2 style={{ margin: 0 }}>Your career records</h2>
            <p className="muted small">
              {detailedCount} detailed{" "}
              {detailedCount === 1 ? "record" : "records"} ·{" "}
              {state.captures.length - detailedCount} quick notes
            </p>
          </div>
        </div>
        <div className="professional-filters">
          <label className="field search-field">
            Search records
            <div className="professional-search">
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes, details, and tags"
              />
            </div>
          </label>
          <label className="field">
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option>All categories</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Stage
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
            >
              <option>All records</option>
              <option>Quick notes</option>
              <option>Detailed records</option>
            </select>
          </label>
        </div>
        {captures.length ? (
          captures.map((item) => (
            <article className="professional-capture" key={item.id}>
              <div className="professional-capture-top">
                <div className="professional-heading-row">
                  <div className="professional-inline">
                    <span className="badge">{item.category}</span>
                    <span className="small muted professional-icon">
                      {isDetailed(item) ? (
                        <FileText size={14} />
                      ) : (
                        <StickyNote size={14} />
                      )}
                      {isDetailed(item) ? "Detailed record" : "Quick note"}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete capture: ${item.title}`}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3 style={{ marginTop: 14 }}>{item.title}</h3>
                <div className="professional-meta">
                  <span>{formatDate(item.date)}</span>
                  <span>Original capture</span>
                  {item.mga && <span>{item.mga}</span>}
                  {item.alq && <span>{item.alq}</span>}
                </div>
                {!expanded.has(item.id) &&
                  (item.outcome || item.actions || item.context) && (
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      {(item.outcome || item.actions || item.context).slice(
                        0,
                        240,
                      )}
                      {(item.outcome || item.actions || item.context).length >
                      240
                        ? "…"
                        : ""}
                    </p>
                  )}
                {item.tags.length > 0 && (
                  <div className="professional-tags">
                    {item.tags.map((tag) => (
                      <span className="professional-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  className="button ghost"
                  style={{ marginTop: 14 }}
                  aria-expanded={expanded.has(item.id)}
                  aria-controls={`capture-details-${item.id}`}
                  onClick={() => toggle(item.id)}
                >
                  {expanded.has(item.id) ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  {expanded.has(item.id)
                    ? "Close details"
                    : isDetailed(item)
                      ? "View & edit record"
                      : "Add the details"}
                </button>
              </div>
              {expanded.has(item.id) && <CaptureDetails capture={item} />}
            </article>
          ))
        ) : (
          <div className="panel professional-empty">
            <StickyNote size={28} />
            <h3>
              {state.captures.length
                ? "No records match your search"
                : "Good work deserves to be remembered"}
            </h3>
            <p>
              {state.captures.length
                ? "Try another search, category, or stage."
                : "Capture your first accomplishment above. You can add the full story whenever you have a moment."}
            </p>
            {state.captures.length > 0 && (
              <button
                className="button secondary"
                style={{ marginTop: 18 }}
                onClick={() => {
                  setQuery("");
                  setCategoryFilter("All categories");
                  setStageFilter("All records");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
      {deleting && (
        <ProfessionalDialog
          title="Delete this career record?"
          onClose={() => setDeleting(null)}
        >
          <p>This removes “{deleting.title}” and all of its details.</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Keep record
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) => {
                  next.captures = next.captures.filter(
                    (item) => item.id !== deleting.id,
                  );
                });
                setDeleting(null);
              }}
            >
              Delete record
            </button>
          </div>
        </ProfessionalDialog>
      )}
      {portfolioOpen && (
        <CapturePortfolio onClose={() => setPortfolioOpen(false)} />
      )}
    </div>
  );
}
