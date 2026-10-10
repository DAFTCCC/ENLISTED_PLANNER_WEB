import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Repeat2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { addDays, formatDate, localDate, occursOn } from "../lib/dates";
import type { CalendarEvent, Page } from "../lib/types";
import {
  eventSourcePage,
  linkedAgenda,
  sourceManagesEventDate,
} from "../lib/calendar-agenda";
import { taskCompletionError } from "../lib/workflow";
import "./calendar.css";
import CalendarConnections from "./CalendarConnections";

type EventDraft = Omit<CalendarEvent, "id"> & { id?: string };
const categories: CalendarEvent["category"][] = [
  "Personal",
  "Career",
  "Training",
  "Administrative",
];
const recurrences: CalendarEvent["recurrence"][] = [
  "None",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Yearly",
];
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const parseDate = (date: string) => new Date(`${date}T12:00:00`);

function shiftMonth(date: string, offset: number) {
  const value = parseDate(monthStart(date));
  value.setMonth(value.getMonth() + offset);
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
}

function timeLabel(time: string) {
  if (!time) return "All day";
  if (time === "24:00") return "Midnight";
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export default function Calendar({
  onOpenDay,
  onNavigate,
}: {
  onOpenDay: (date: string) => void;
  onNavigate?: (page: Page) => void;
}) {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [month, setMonth] = useState(monthStart(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpen = draft !== null || deleteTarget !== null;

  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    if (!dialog?.querySelector("input")) focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        setDeleteTarget(null);
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [dialogOpen]);

  const weekday = (parseDate(month).getDay() + 6) % 7;
  // Keep the first/last supported years usable when a grid cell crosses the date boundary.
  const days = Array.from({ length: 42 }, (_, index) => {
    try {
      return addDays(month, index - weekday);
    } catch {
      return null;
    }
  });
  const monthLabel = formatDate(month, { month: "long", year: "numeric" });
  const selectedEvents = state.events
    .filter((event) => occursOn(event, selectedDate))
    .sort((a, b) => a.time.localeCompare(b.time));
  const selectedBlocks = state.blocks
    .filter((block) => block.date === selectedDate)
    .sort((a, b) => a.start.localeCompare(b.start));
  const selectedTasks = state.tasks.filter(
    (task) => task.date === selectedDate,
  );
  const selectedGoals = state.goals.filter(
    (goal) =>
      goal.targetDate === selectedDate &&
      !selectedEvents.some((event) => event.goalId === goal.id),
  );
  const selectedLinked = linkedAgenda(state, selectedDate);
  const upcomingGoals = state.goals
    .filter(
      (goal) =>
        goal.targetDate && goal.targetDate >= today && goal.progress < 100,
    )
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 3);
  const selectedHasPlans =
    selectedEvents.length +
      selectedBlocks.length +
      selectedTasks.length +
      selectedGoals.length +
      selectedLinked.length >
    0;

  function openEditor(event?: CalendarEvent) {
    setError("");
    setDraft(
      event
        ? { ...event }
        : {
            title: "",
            date: selectedDate,
            time: "",
            category: "Personal",
            recurrence: "None",
            source: "User entered",
          },
    );
  }

  function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const existingEvent = state.events.find((event) => event.id === draft.id);
    if (
      existingEvent &&
      sourceManagesEventDate(existingEvent, state) &&
      draft.date !== existingEvent.date
    ) {
      setError(
        "This date follows its source plan. Change it in Career, Leadership, or Projects & taskers first.",
      );
      return;
    }
    if (!draft.title.trim() || !draft.date) {
      setError("Enter an event name and date.");
      return;
    }
    try {
      formatDate(draft.date);
    } catch {
      setError("Choose a valid date with a year between 0001 and 9999.");
      return;
    }
    const saved: CalendarEvent = {
      ...draft,
      id: draft.id ?? crypto.randomUUID(),
      title: draft.title.trim(),
    };
    mutate((data) => {
      const index = data.events.findIndex((item) => item.id === saved.id);
      if (index === -1) data.events.push(saved);
      else data.events[index] = saved;
    });
    setSelectedDate(saved.date);
    setMonth(monthStart(saved.date));
    setDraft(null);
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(date));
  }

  return (
    <div className="calendar-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE BIG PICTURE</p>
          <h1>Calendar</h1>
          <p className="muted">
            Make room for what matters. Your days, deadlines, and goals in one
            view.
          </p>
        </div>
        <button className="button primary" onClick={() => openEditor()}>
          <Plus size={18} /> Add event
        </button>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </p>
      )}

      <div className="calendar-layout">
        <section className="panel month-panel" aria-label="Monthly calendar">
          <div className="calendar-toolbar">
            <h2 aria-live="polite">{monthLabel}</h2>
            <div className="calendar-navigation">
              <button
                className="button secondary calendar-today-button"
                onClick={() => {
                  setMonth(monthStart(today));
                  setSelectedDate(today);
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Previous month"
                disabled={month === "0001-01-01"}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                disabled={month === "9999-12-01"}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {dayLabels.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((date, index) => {
              if (!date)
                return (
                  <span
                    className="calendar-day"
                    aria-hidden="true"
                    key={`boundary-${index}`}
                  />
                );
              const events = state.events.filter((event) =>
                occursOn(event, date),
              );
              const blockCount = state.blocks.filter(
                (block) => block.date === date,
              ).length;
              const taskCount = state.tasks.filter(
                (task) => task.date === date && !task.completed,
              ).length;
              const goalCount = state.goals.filter(
                (goal) =>
                  goal.targetDate === date &&
                  !events.some((event) => event.goalId === goal.id),
              ).length;
              const linkedCount = linkedAgenda(state, date).length;
              const isOutside = date.slice(0, 7) !== month.slice(0, 7);
              const counts = [
                events.length
                  ? `${events.length} event${events.length === 1 ? "" : "s"}`
                  : "",
                blockCount
                  ? `${blockCount} time block${blockCount === 1 ? "" : "s"}`
                  : "",
                taskCount
                  ? `${taskCount} task${taskCount === 1 ? "" : "s"} due`
                  : "",
                goalCount
                  ? `${goalCount} goal target${goalCount === 1 ? "" : "s"}`
                  : "",
                linkedCount
                  ? `${linkedCount} connected deadline${linkedCount === 1 ? "" : "s"}`
                  : "",
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  key={date}
                  type="button"
                  className={`calendar-day${isOutside ? " outside-month" : ""}${date === today ? " is-today" : ""}${date === selectedDate ? " is-selected" : ""}`}
                  aria-pressed={date === selectedDate}
                  aria-current={date === today ? "date" : undefined}
                  aria-label={`${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${counts ? `, ${counts}` : ", no plans"}`}
                  onClick={() => chooseDate(date)}
                >
                  <span className="calendar-day-number">
                    {Number(date.slice(-2))}
                  </span>
                  <span className="calendar-day-content" aria-hidden="true">
                    {events.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        className={`calendar-event-label event-${event.category.toLowerCase()}`}
                      >
                        {event.title}
                      </span>
                    ))}
                    {events.length > 2 && (
                      <span className="calendar-more">
                        +{events.length - 2} events
                      </span>
                    )}
                    <span className="calendar-day-markers">
                      {blockCount > 0 && (
                        <span className="calendar-mini-count block-count">
                          <i />
                          {blockCount}
                          <span className="calendar-count-word"> blocks</span>
                        </span>
                      )}
                      {taskCount > 0 && (
                        <span className="calendar-mini-count task-count">
                          <i />
                          {taskCount}
                          <span className="calendar-count-word"> due</span>
                        </span>
                      )}
                      {goalCount + linkedCount > 0 && (
                        <span className="calendar-mini-count goal-count">
                          <Target size={11} />
                          {goalCount + linkedCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i className="legend-dot block-dot" /> Time blocks
            </span>
            <span>
              <i className="legend-dot task-dot" /> Tasks due
            </span>
            <span>
              <Target size={12} /> Goal targets
            </span>
          </div>
          <p className="calendar-hint muted small">
            Select a date to see its plans. Event dates and goal targets are
            personal planning information.
          </p>
        </section>

        <aside className="calendar-agenda">
          <section className="panel agenda-panel" aria-label="Selected day">
            <div className="agenda-date-heading">
              <span className="agenda-day-number">
                {Number(selectedDate.slice(-2))}
              </span>
              <div>
                <p className="eyebrow">
                  {formatDate(selectedDate, { weekday: "long" })}
                </p>
                <h2>
                  {formatDate(selectedDate, { month: "long", year: "numeric" })}
                </h2>
              </div>
              {selectedDate === today && <span className="badge">Today</span>}
            </div>
            <button
              className="button primary calendar-plan-button"
              onClick={() => onOpenDay(selectedDate)}
            >
              Plan this day <ArrowUpRight size={17} />
            </button>
            {!selectedHasPlans && (
              <div className="empty-state calendar-day-empty">
                <CalendarDays size={30} />
                <h3>A little room to breathe.</h3>
                <p>
                  No plans for this day yet. Add an event or build your daily
                  time blocks.
                </p>
                <button
                  className="button secondary"
                  onClick={() => openEditor()}
                >
                  <Plus size={15} /> Add an event
                </button>
              </div>
            )}

            {selectedEvents.length > 0 && (
              <div className="agenda-section">
                <div className="agenda-section-title">
                  <h3>Events</h3>
                  <span>{selectedEvents.length}</span>
                </div>
                {selectedEvents.map((event) => (
                  <article className="agenda-event" key={event.id}>
                    <div
                      className={`agenda-event-indicator event-${event.category.toLowerCase()}`}
                    />
                    <div className="agenda-item-body">
                      <p className="agenda-item-time">
                        {timeLabel(event.time)}
                        {event.recurrence !== "None" && (
                          <>
                            <Repeat2 size={12} /> {event.recurrence}
                          </>
                        )}
                      </p>
                      <h4>{event.title}</h4>
                      <div className="agenda-item-labels">
                        <span>{event.category}</span>
                        <span
                          className={
                            event.source === "Estimate" ? "agenda-estimate" : ""
                          }
                        >
                          {event.source}
                        </span>
                      </div>
                    </div>
                    <div className="agenda-actions">
                      {eventSourcePage(event) && (
                        <button
                          className="icon-button"
                          aria-label={`Open source for ${event.title}`}
                          onClick={() =>
                            onNavigate
                              ? onNavigate(eventSourcePage(event)!)
                              : (window.location.hash = eventSourcePage(event)!)
                          }
                        >
                          <ArrowUpRight size={14} />
                        </button>
                      )}
                      {!sourceManagesEventDate(event, state) && (
                        <button
                          className="icon-button"
                          aria-label={`Edit ${event.title}`}
                          onClick={() => openEditor(event)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={`Delete ${event.title}`}
                        onClick={() => setDeleteTarget(event)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {selectedBlocks.length > 0 && (
              <div className="agenda-section">
                <div className="agenda-section-title">
                  <h3>Time blocks</h3>
                  <span>{selectedBlocks.length}</span>
                </div>
                {selectedBlocks.map((block) => (
                  <div
                    className={`agenda-block${block.completed ? " is-completed" : ""}`}
                    key={block.id}
                  >
                    <span className="agenda-block-icon">
                      {block.completed ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Clock3 size={16} />
                      )}
                    </span>
                    <div>
                      <p className="agenda-item-time">
                        {timeLabel(block.start)} – {timeLabel(block.end)}
                      </p>
                      <h4>{block.title}</h4>
                      <span className="muted small">
                        {block.category}
                        {block.completed ? " · Completed" : ""}
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  className="button ghost agenda-link"
                  onClick={() => onOpenDay(selectedDate)}
                >
                  Open daily planner <ArrowUpRight size={14} />
                </button>
              </div>
            )}

            {selectedTasks.length > 0 && (
              <div className="agenda-section">
                <div className="agenda-section-title">
                  <h3>Tasks due</h3>
                  <span>{selectedTasks.length}</span>
                </div>
                {selectedTasks.map((task) => (
                  <label
                    className={`agenda-task${task.completed ? " is-completed" : ""}`}
                    key={task.id}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => {
                        const issue = taskCompletionError(task, state.tasks);
                        if (!task.completed && issue) {
                          setNotice(issue);
                          return;
                        }
                        mutate((data) => {
                          const item = data.tasks.find(
                            (item) => item.id === task.id,
                          );
                          if (item) item.completed = !item.completed;
                        });
                      }}
                    />
                    <span>{task.title}</span>
                    {task.priority === "High" && (
                      <span className="agenda-high-priority">High</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {selectedGoals.length > 0 && (
              <div className="agenda-section">
                <div className="agenda-section-title">
                  <h3>Goal targets</h3>
                  <span>{selectedGoals.length}</span>
                </div>
                {selectedGoals.map((goal) => (
                  <div className="agenda-target" key={goal.id}>
                    <Target size={17} />
                    <div>
                      <h4>{goal.title}</h4>
                      <p className="muted small">
                        {goal.source === "Estimate"
                          ? "Estimated planning target"
                          : "User-set target"}{" "}
                        · {goal.progress}% complete
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedLinked.length > 0 && (
              <div className="agenda-section">
                <div className="agenda-section-title">
                  <h3>Connected plans</h3>
                  <span>{selectedLinked.length}</span>
                </div>
                {selectedLinked.map((item) => (
                  <button
                    className="agenda-source-plan"
                    key={item.id}
                    onClick={() =>
                      onNavigate
                        ? onNavigate(item.page)
                        : (window.location.hash = item.page)
                    }
                  >
                    <Target size={16} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel calendar-target-panel">
            <div className="panel-heading">
              <h2>On the horizon</h2>
              <Target size={18} />
            </div>
            <p className="muted small">
              The next steps in your personal and career plan.
            </p>
            {upcomingGoals.length ? (
              <div className="upcoming-goals">
                {upcomingGoals.map((goal) => (
                  <div className="upcoming-goal" key={goal.id}>
                    <span className="upcoming-goal-date">
                      {formatDate(goal.targetDate, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <h3>{goal.title}</h3>
                    <div className="upcoming-goal-progress">
                      <progress
                        value={goal.progress}
                        max={100}
                        aria-label={`${goal.title}: ${goal.progress}% complete`}
                      />
                      <span>{goal.progress}%</span>
                    </div>
                    <span className="muted small">
                      {goal.source === "Estimate"
                        ? "Estimated planning target"
                        : "User-set target"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="calendar-target-empty">
                <p>No upcoming goal targets yet.</p>
                <p className="muted small">
                  Add a goal in Career or Personal readiness to bring it into
                  your calendar.
                </p>
              </div>
            )}
            <p className="calendar-reference-note muted small">
              Planning estimates are labeled. Confirm official deadlines and
              eligibility through your personnel office.
            </p>
          </section>
        </aside>
      </div>
      <CalendarConnections />

      {dialogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDraft(null);
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="modal calendar-modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-modal-title"
          >
            {draft ? (
              <form onSubmit={saveEvent}>
                <div className="modal-header">
                  <div>
                    <p className="eyebrow">MAKE IT PART OF THE PLAN</p>
                    <h2 id="calendar-modal-title">
                      {draft.id ? "Edit event" : "Add an event"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close event form"
                    onClick={() => setDraft(null)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <label className="field">
                  Event name
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                    placeholder="e.g., Quarterly feedback session"
                    required
                    maxLength={120}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    Date
                    <input
                      type="date"
                      readOnly={Boolean(
                        draft.id &&
                        state.events.some(
                          (event) =>
                            event.id === draft.id &&
                            sourceManagesEventDate(event, state),
                        ),
                      )}
                      min="0001-01-01"
                      max="9999-12-31"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft({ ...draft, date: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    Time <span className="muted small">(optional)</span>
                    <input
                      type="time"
                      value={draft.time}
                      onChange={(event) =>
                        setDraft({ ...draft, time: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Category
                    <select
                      value={draft.category}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          category: event.target
                            .value as CalendarEvent["category"],
                        })
                      }
                    >
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Repeat
                    <select
                      value={draft.recurrence}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          recurrence: event.target
                            .value as CalendarEvent["recurrence"],
                        })
                      }
                    >
                      {recurrences.map((recurrence) => (
                        <option key={recurrence}>{recurrence}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  Date source
                  <select
                    value={draft.source}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        source: event.target.value as CalendarEvent["source"],
                      })
                    }
                  >
                    <option>User entered</option>
                    <option>Estimate</option>
                  </select>
                  <span className="muted small">
                    Use Estimate for a tentative planning date. Neither label
                    verifies an official deadline.
                  </span>
                </label>
                {draft.recurrence !== "None" && (
                  <p className="calendar-form-note small">
                    <Repeat2 size={15} />{" "}
                    {draft.id
                      ? "Changes apply to the entire recurring series."
                      : `This event repeats ${draft.recurrence.toLowerCase()} from its start date.`}
                    {draft.recurrence === "Monthly" &&
                      " Months without this calendar day are skipped."}
                  </p>
                )}
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </button>
                  <button className="button primary" type="submit">
                    {draft.id ? "Save changes" : "Add event"}
                  </button>
                </div>
              </form>
            ) : (
              deleteTarget && (
                <>
                  <div className="modal-header">
                    <h2 id="calendar-modal-title">
                      Delete{" "}
                      {deleteTarget.recurrence === "None"
                        ? "event"
                        : "recurring event"}
                      ?
                    </h2>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Close delete confirmation"
                      onClick={() => setDeleteTarget(null)}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p>
                    “{deleteTarget.title}” will be removed
                    {deleteTarget.recurrence !== "None"
                      ? ", including every occurrence in this recurring series"
                      : ""}
                    . This cannot be undone.
                  </p>
                  <div className="modal-actions">
                    <button
                      className="button secondary"
                      onClick={() => setDeleteTarget(null)}
                    >
                      Keep event
                    </button>
                    <button
                      className="button calendar-delete-button"
                      onClick={() => {
                        mutate((data) => {
                          data.events = data.events.filter(
                            (event) => event.id !== deleteTarget.id,
                          );
                        });
                        setDeleteTarget(null);
                      }}
                    >
                      Delete{" "}
                      {deleteTarget.recurrence === "None" ? "event" : "series"}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
