import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import type { Capture } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import "./professional.css";

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
      capture.tags.length,
  );
function CaptureDetails({ capture }: { capture: Capture }) {
  const { mutate } = usePlanner();
  const [tagDraft, setTagDraft] = useState(capture.tags.join(", "));
  const update = (
    key: "context" | "actions" | "outcome" | "lessons" | "category",
    value: string,
  ) =>
    mutate((next) => {
      const current = next.captures.find((item) => item.id === capture.id);
      if (current) Object.assign(current, { [key]: value });
    });
  return (
    <div
      className="professional-capture-details"
      id={`capture-details-${capture.id}`}
    >
      <div className="professional-heading-row" style={{ marginBottom: 18 }}>
        <div>
          <h3>Build your career record</h3>
          <p className="small muted">
            Add the details that will help you tell the story later.
          </p>
        </div>
        <span className="small professional-icon muted">
          <Check size={14} /> Auto-saved
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
          Background &amp; context
          <textarea
            value={capture.context}
            onChange={(event) => update("context", event.target.value)}
            placeholder="What was the situation, challenge, or responsibility?"
            maxLength={10000}
          />
        </label>
        <label className="field">
          Your actions
          <textarea
            value={capture.actions}
            onChange={(event) => update("actions", event.target.value)}
            placeholder="What did you do? Who did you lead or support?"
            maxLength={10000}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Outcomes &amp; impact
          <textarea
            value={capture.outcome}
            onChange={(event) => update("outcome", event.target.value)}
            placeholder="What changed? Include useful numbers, scope, and mission impact."
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
    </div>
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
        <span className="badge">
          {state.captures.length}{" "}
          {state.captures.length === 1 ? "capture" : "captures"}
        </span>
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
    </div>
  );
}
