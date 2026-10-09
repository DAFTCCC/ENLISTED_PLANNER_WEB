import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  CalendarDays,
  Clock3,
  Check,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
  X,
  Flag,
  ArrowUpRight,
  Sparkles,
  Pencil,
  Printer,
  Maximize2,
  GripVertical,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import {
  addDays,
  localDate,
  formatDate,
  minutes,
  timeString,
  occursOn,
} from "../lib/dates";
import {
  blockError,
  durationLabel,
  totalPlannedMinutes,
} from "../lib/time-blocks";
import type { BlockCategory, TimeBlock } from "../lib/types";

const categories: BlockCategory[] = [
  "Duty",
  "Development",
  "Fitness",
  "Personal",
];
const categoryDescriptions = {
  Duty: "Mission & responsibilities",
  Development: "Learn & grow",
  Fitness: "Move & recharge",
  Personal: "Life beyond the uniform",
};
interface Props {
  date: string;
  setDate: (date: string) => void;
  onCalendar: () => void;
  onCaptures: () => void;
}

export default function Today({
  date,
  setDate,
  onCalendar,
  onCaptures,
}: Props) {
  const { state, mutate } = usePlanner();
  const [editing, setEditing] = useState<TimeBlock | null>(null);
  const [repeat, setRepeat] = useState("once");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [fullDay, setFullDay] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{
    id: string;
    pixels: number;
  } | null>(null);
  const pointerDrag = useRef<{
    block: TimeBlock;
    initialY: number;
    moved: boolean;
  } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const blocks = state.blocks
    .filter((block) => block.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
  const tasks = state.tasks.filter((task) => task.date === date);
  const events = state.events.filter((event) => occursOn(event, date));
  const completed = blocks.filter((block) => block.completed).length;
  const planned = totalPlannedMinutes(blocks);
  const startHour =
    fullDay ||
    blocks.some(
      (block) => minutes(block.start) < 360 || minutes(block.end) > 1320,
    )
      ? 0
      : 6;
  const endHour = startHour === 0 ? 24 : 22;
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => i + startHour,
  );
  const isToday = date === localDate();

  function newBlock(start = "09:00", end = "10:00") {
    setError("");
    setRepeat("once");
    setEditing({
      id: crypto.randomUUID(),
      date,
      start,
      end,
      title: "",
      category: "Duty",
      notes: "",
      completed: false,
    });
  }
  function editBlock(block: TimeBlock) {
    setEditing({ ...block });
    setError("");
    setRepeat("once");
  }
  function saveBlock(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const existing = state.blocks.some((block) => block.id === editing.id);
    let candidates: TimeBlock[];
    try {
      candidates = Array.from(
        { length: !existing && repeat === "week" ? 7 : 1 },
        (_, index) => ({
          ...editing,
          title: editing.title.trim(),
          date: addDays(editing.date, index),
          id: index ? crypto.randomUUID() : editing.id,
        }),
      );
    } catch {
      setError(
        "Choose a valid date. Repeating blocks must stay within the supported calendar years (0001–9999).",
      );
      return;
    }
    for (const candidate of candidates) {
      const issue = blockError(candidate, state.blocks);
      if (issue) {
        setError(
          `${candidates.length > 1 ? `${formatDate(candidate.date)}: ` : ""}${issue}`,
        );
        return;
      }
    }
    mutate((draft) => {
      draft.blocks = draft.blocks
        .filter((block) => block.id !== editing.id)
        .concat(candidates);
    });
    setNotice(
      candidates.length > 1
        ? "Your time block was added to seven days."
        : existing
          ? "Time block updated."
          : "Time block added.",
    );
    setEditing(null);
  }
  function removeBlock(block: TimeBlock) {
    if (
      !window.confirm(`Delete “${block.title}” from ${formatDate(block.date)}?`)
    )
      return;
    mutate((draft) => {
      draft.blocks = draft.blocks.filter((item) => item.id !== block.id);
    });
    setEditing(null);
    setNotice("Time block deleted.");
  }
  function startDrag(event: PointerEvent<HTMLSpanElement>, block: TimeBlock) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDrag.current = { block, initialY: event.clientY, moved: false };
    setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLSpanElement>) {
    const drag = pointerDrag.current;
    if (!drag) return;
    const pixels = event.clientY - drag.initialY;
    if (Math.abs(pixels) > 4) drag.moved = true;
    if (drag.moved) setDragOffset({ id: drag.block.id, pixels });
  }
  function cancelDrag() {
    pointerDrag.current = null;
    setDragging(false);
    setDragOffset(null);
  }
  function finishDrag(event: PointerEvent<HTMLSpanElement>) {
    const drag = pointerDrag.current;
    const bounds = timelineRef.current?.getBoundingClientRect();
    cancelDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag?.moved || !bounds) return;
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY >= bounds.bottom
    ) {
      setNotice("Drop within the schedule to reschedule a block.");
      return;
    }
    const block = drag.block;
    const newStart =
      startHour * 60 +
      Math.floor((((event.clientY - bounds.top) / 64) * 60) / 15) * 15;
    const newEnd = newStart + minutes(block.end) - minutes(block.start);
    if (newEnd > 1440) {
      setNotice(
        "That block would extend past midnight. Choose an earlier time.",
      );
      return;
    }
    const moved = {
      ...block,
      start: timeString(newStart),
      end: timeString(newEnd),
    };
    const issue = blockError(moved, state.blocks);
    if (issue) {
      setNotice(issue);
      return;
    }
    mutate((draft) => {
      draft.blocks = draft.blocks.map((item) =>
        item.id === block.id ? moved : item,
      );
    });
    setNotice(`Moved ${block.title} to ${moved.start}.`);
  }
  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    mutate((draft) => {
      draft.tasks.push({
        id: crypto.randomUUID(),
        title: taskTitle.trim(),
        date,
        completed: false,
        priority: "Normal",
      });
    });
    setTaskTitle("");
  }
  function quickCapture(event: FormEvent) {
    event.preventDefault();
    if (!captureTitle.trim()) return;
    mutate((draft) => {
      draft.captures.unshift({
        id: crypto.randomUUID(),
        title: captureTitle.trim(),
        date,
        category: "Mission",
        context: "",
        actions: "",
        outcome: "",
        lessons: "",
        tags: [],
      });
    });
    setCaptureTitle("");
    setNotice("Win captured. Add details in Career records when you’re ready.");
  }

  return (
    <>
      <div className="page-heading today-heading">
        <div>
          <p className="eyebrow">YOUR PERSONAL MISSION CONTROL</p>
          <h1>
            Make room for what matters<span>.</span>
          </h1>
          <p className="muted">
            A purposeful day. A stronger you. A career you own.
          </p>
        </div>
        <button
          className="button secondary desktop-only"
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print day
        </button>
      </div>
      <section className="date-bar" aria-label="Day navigation">
        <div className="date-title">
          <div className="date-icon">
            <CalendarDays size={22} />
          </div>
          <div>
            <h2>
              {formatDate(date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
            <span>
              {isToday ? "TODAY" : formatDate(date, { year: "numeric" })}{" "}
              <span className="date-divider">/</span>{" "}
              {state.profile.service === "Space Force" ? "GUARDIAN" : "AIRMAN"}{" "}
              DAILY PLANNER
            </span>
          </div>
        </div>
        <div className="date-controls">
          <button
            className="icon-button"
            aria-label="Previous day"
            disabled={date === "0001-01-01"}
            onClick={() => setDate(addDays(date, -1))}
          >
            <ArrowLeft size={18} />
          </button>
          <button className="button ghost" onClick={() => setDate(localDate())}>
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next day"
            disabled={date === "9999-12-31"}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ArrowRight size={18} />
          </button>
          <input
            aria-label="Choose day"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={date}
            onChange={(e) => {
              try {
                if (e.target.value) {
                  addDays(e.target.value, 0);
                  setDate(e.target.value);
                }
              } catch {
                setNotice(
                  "Choose a calendar date between years 0001 and 9999.",
                );
              }
            }}
          />
        </div>
      </section>
      <section className="day-stats" aria-label="Daily summary">
        <div>
          <div className="stat-icon gold">
            <Clock3 size={19} />
          </div>
          <div>
            <p>Time intentionally planned</p>
            <strong>{durationLabel(planned)}</strong>
            <span> of 24 hours</span>
          </div>
        </div>
        <div>
          <div className="stat-icon green">
            <CheckCircle2 size={19} />
          </div>
          <div>
            <p>Blocks completed</p>
            <strong>
              {completed}
              <span> / {blocks.length}</span>
            </strong>
          </div>
        </div>
        <div>
          <div className="stat-icon blue">
            <Flag size={19} />
          </div>
          <div>
            <p>Priorities accomplished</p>
            <strong>
              {tasks.filter((task) => task.completed).length}
              <span> / {tasks.length}</span>
            </strong>
          </div>
        </div>
      </section>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="day-layout">
        <section className="panel schedule-panel">
          <div className="panel-heading">
            <div>
              <h2>Your day, by design</h2>
              <p className="muted small">
                Give your priorities a place on the calendar.
              </p>
            </div>
            <button className="button primary" onClick={() => newBlock()}>
              <Plus size={17} /> Add time block
            </button>
          </div>
          <div className="schedule-subhead">
            <div className="legend">
              {categories.map((category) => (
                <span key={category}>
                  <i className={`category-dot ${category.toLowerCase()}`} />
                  {category}
                </span>
              ))}
            </div>
            <button
              className="icon-button"
              title={fullDay ? "Show daytime hours" : "Show all 24 hours"}
              aria-label={fullDay ? "Show daytime hours" : "Show all 24 hours"}
              onClick={() => setFullDay(!fullDay)}
            >
              <Maximize2 size={15} />
            </button>
          </div>
          <div className={`schedule-scroll ${dragging ? "is-dragging" : ""}`}>
            <div
              className="timeline"
              ref={timelineRef}
              style={{ height: hours.length * 64 }}
            >
              {hours.map((hour) => (
                <div className="hour-row" key={hour}>
                  <span className="hour-label">{timeString(hour * 60)}</span>
                  <button
                    className="hour-slot"
                    aria-label={`Add time block at ${timeString(hour * 60)}`}
                    onClick={() =>
                      newBlock(
                        timeString(hour * 60),
                        timeString(Math.min(1440, (hour + 1) * 60)),
                      )
                    }
                  >
                    <Plus size={13} />
                    <span>Add a block</span>
                  </button>
                </div>
              ))}
              {!blocks.length && (
                <div className="schedule-empty">
                  <div className="empty-clock">
                    <Clock3 size={27} />
                  </div>
                  <h3>Your time is your most valuable resource.</h3>
                  <p>
                    Make space for the mission, your goals,
                    <br />
                    and the things that keep you grounded.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => newBlock()}
                  >
                    <Plus size={16} /> Plan your first block
                  </button>
                  <span>Start small. Even 30 minutes counts.</span>
                </div>
              )}
              {blocks.map((block) => {
                const duration = minutes(block.end) - minutes(block.start);
                return (
                  <article
                    key={block.id}
                    className={`time-block ${block.category.toLowerCase()} ${block.completed ? "completed" : ""} ${duration < 35 ? "compact" : ""}`}
                    style={{
                      top:
                        ((minutes(block.start) - startHour * 60) * 64) / 60 + 2,
                      height: Math.max(25, (duration * 64) / 60 - 4),
                      transform:
                        dragOffset?.id === block.id
                          ? `translateY(${dragOffset.pixels}px)`
                          : undefined,
                      zIndex: dragOffset?.id === block.id ? 5 : undefined,
                    }}
                    aria-label={`${block.title}, ${block.start} to ${block.end}`}
                  >
                    <span
                      className="block-drag-handle"
                      onPointerDown={(e) => startDrag(e, block)}
                      onPointerMove={moveDrag}
                      onPointerUp={finishDrag}
                      onPointerCancel={cancelDrag}
                      title="Drag to reschedule"
                      aria-label={`Drag ${block.title} to reschedule`}
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      className="block-complete"
                      aria-label={`${block.completed ? "Mark incomplete" : "Complete"} ${block.title}`}
                      onClick={() =>
                        mutate((draft) => {
                          const item = draft.blocks.find(
                            (item) => item.id === block.id,
                          );
                          if (item) item.completed = !item.completed;
                        })
                      }
                    >
                      {block.completed ? <Check size={13} /> : null}
                    </button>
                    <button
                      className="block-content"
                      onClick={() => editBlock(block)}
                    >
                      <strong>{block.title}</strong>
                      <span>
                        {block.start} – {block.end} <i>·</i>{" "}
                        {durationLabel(duration)}{" "}
                        {duration >= 60 && (
                          <>
                            <i>·</i> {block.category}
                          </>
                        )}
                      </span>
                      {duration >= 90 && block.notes && <p>{block.notes}</p>}
                    </button>
                    <button
                      className="block-edit"
                      aria-label={`Edit ${block.title}`}
                      onClick={() => editBlock(block)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="schedule-footer">
            <span>
              <Clock3 size={14} /> Local time · 24-hour format
            </span>
            <span>Drag blocks to reschedule, or select to edit.</span>
          </div>
        </section>
        <aside className="day-aside">
          <section className="panel priorities-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Flag size={17} />
                <h2>Daily priorities</h2>
              </div>
              <span className="badge">{tasks.length}</span>
            </div>
            <p className="muted small">
              The few things that move today forward.
            </p>
            <div className="priority-list">
              {tasks.length ? (
                tasks.map((task) => (
                  <div
                    className={`priority-item ${task.completed ? "done" : ""}`}
                    key={task.id}
                  >
                    <button
                      className="task-check"
                      aria-label={`${task.completed ? "Reopen" : "Complete"} priority ${task.title}`}
                      onClick={() =>
                        mutate((draft) => {
                          const item = draft.tasks.find(
                            (item) => item.id === task.id,
                          );
                          if (item) item.completed = !item.completed;
                        })
                      }
                    >
                      {task.completed && <Check size={13} />}
                    </button>
                    <span>{task.title}</span>
                    <button
                      className="icon-button subtle"
                      aria-label={`Schedule priority ${task.title}`}
                      title="Give this priority a time block"
                      onClick={() => {
                        newBlock();
                        setEditing({
                          id: crypto.randomUUID(),
                          date,
                          start: "09:00",
                          end: "09:30",
                          title: task.title,
                          category: "Duty",
                          notes: "",
                          completed: false,
                        });
                      }}
                    >
                      <Clock3 size={14} />
                    </button>
                    <button
                      className="icon-button subtle"
                      aria-label={`Delete priority ${task.title}`}
                      onClick={() => {
                        if (window.confirm(`Delete priority “${task.title}”?`))
                          mutate((draft) => {
                            draft.tasks = draft.tasks.filter(
                              (item) => item.id !== task.id,
                            );
                          });
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-inline">
                  What deserves your attention today?
                </p>
              )}
            </div>
            <form className="inline-add" onSubmit={addTask}>
              <input
                aria-label="New daily priority"
                placeholder="Add a priority…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                maxLength={160}
              />
              <button
                className="icon-button"
                aria-label="Add priority"
                disabled={!taskTitle.trim()}
              >
                <Plus size={18} />
              </button>
            </form>
          </section>
          <section className="panel balance-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Sparkles size={17} />
                <h2>Make space for all of you</h2>
              </div>
            </div>
            {categories.map((category) => {
              const total = totalPlannedMinutes(
                blocks.filter((block) => block.category === category),
              );
              return (
                <div className="balance-row" key={category}>
                  <i className={`category-dot ${category.toLowerCase()}`} />
                  <div>
                    <strong>{category}</strong>
                    <p>{categoryDescriptions[category]}</p>
                  </div>
                  <span>{total ? durationLabel(total) : "—"}</span>
                </div>
              );
            })}
            <div className="balance-bar">
              {categories.map((category) => {
                const total = totalPlannedMinutes(
                  blocks.filter((block) => block.category === category),
                );
                return (
                  total > 0 && (
                    <span
                      key={category}
                      className={category.toLowerCase()}
                      style={{
                        width: `${(total / Math.max(planned, 1)) * 100}%`,
                      }}
                    />
                  )
                );
              })}
            </div>
          </section>
          <section className="capture-widget">
            <div className="heading-with-icon">
              <Pencil size={17} />
              <h2>Don’t let a win slip away.</h2>
            </div>
            <p>A small note today. A stronger career record tomorrow.</p>
            <form onSubmit={quickCapture}>
              <label className="sr-only" htmlFor="quick-win">
                Capture an accomplishment
              </label>
              <textarea
                id="quick-win"
                placeholder="What did you make happen today?"
                value={captureTitle}
                onChange={(e) => setCaptureTitle(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <button
                className="button capture-button"
                disabled={!captureTitle.trim()}
              >
                <Plus size={15} /> Capture a win
              </button>
            </form>
            <button className="text-button" onClick={onCaptures}>
              View career records <ArrowUpRight size={14} />
            </button>
          </section>
          {events.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>On your calendar</h2>
                <button
                  className="icon-button"
                  aria-label="Open calendar"
                  onClick={onCalendar}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
              {events.map((event) => (
                <div className="calendar-mini-event" key={event.id}>
                  <CalendarDays size={16} />
                  <div>
                    <strong>{event.title}</strong>
                    <p className="muted small">
                      {event.time || "All day"} · {event.source}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="daily-quote">
            <p>
              “Excellence is a habit.
              <br />
              Build it into your day.”
            </p>
            <span>ONE AIRMAN. ONE PLANNER. AN ENTIRE CAREER.</span>
          </div>
        </aside>
      </div>
      {editing && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">OWN YOUR TIME</p>
                <h2 id="block-title">
                  {state.blocks.some((block) => block.id === editing.id)
                    ? "Edit time block"
                    : "Add time block"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close time block dialog"
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveBlock}>
              <label className="field">
                What are you making time for?
                <input
                  autoFocus
                  required
                  maxLength={160}
                  placeholder="e.g. Focus work, PT, study time"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Date
                  <input
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    required
                    value={editing.date}
                    onChange={(e) =>
                      setEditing({ ...editing, date: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Category
                  <select
                    aria-label="Category"
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        category: e.target.value as BlockCategory,
                      })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Start time
                  <input
                    type="time"
                    required
                    value={editing.start}
                    onChange={(e) =>
                      setEditing({ ...editing, start: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  End time
                  {editing.end === "24:00" ? (
                    <select
                      value="24:00"
                      onChange={(e) =>
                        setEditing({ ...editing, end: e.target.value })
                      }
                    >
                      <option value="24:00">Midnight (end of day)</option>
                      <option value="23:59">23:59</option>
                    </select>
                  ) : (
                    <input
                      type="time"
                      required
                      value={editing.end}
                      onChange={(e) =>
                        setEditing({ ...editing, end: e.target.value })
                      }
                    />
                  )}
                </label>
              </div>
              <label className="field">
                Notes <span className="muted">(optional)</span>
                <textarea
                  rows={3}
                  maxLength={3000}
                  placeholder="The focus, preparation, or details you’ll want later."
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
              {!state.blocks.some((block) => block.id === editing.id) && (
                <label className="field">
                  Repeat
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  >
                    <option value="once">This day only</option>
                    <option value="week">Daily for 7 days</option>
                  </select>
                </label>
              )}
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                {state.blocks.some((block) => block.id === editing.id) && (
                  <button
                    type="button"
                    className="button danger ghost"
                    onClick={() => removeBlock(editing)}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="button primary">Save time block</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
