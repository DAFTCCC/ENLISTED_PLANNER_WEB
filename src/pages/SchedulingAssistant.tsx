import { useEffect, useId, useState } from "react";
import { CalendarClock, Check, SlidersHorizontal } from "lucide-react";
import { usePlanner } from "../lib/planner";
import { addDays, formatDate, localDate } from "../lib/dates";
import { durationLabel } from "../lib/time-blocks";
import {
  buildSchedule,
  currentPlanningTime,
  currentRecoveryTime,
  missedTaskAllocations,
  recoverySelectionError,
  planningPreferencesError,
  scheduleSelectionError,
  type ScheduleResult,
} from "../lib/scheduling";
import type { PlanningPreferences, TimeBlock } from "../lib/types";
import "./scheduling.css";

interface Props {
  taskIds?: string[];
  from?: string;
  to?: string;
  onOpenDay?: (date: string) => void;
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulingAssistant({
  taskIds,
  from,
  to,
  onOpenDay,
}: Props) {
  const { state, mutate } = usePlanner();
  const id = useId();
  const today = localDate();
  const [start, setStart] = useState(from ?? today);
  const [end, setEnd] = useState(to ?? addDays(today, 6));
  const [preferences, setPreferences] = useState<PlanningPreferences>(() => ({
    ...state.planningPreferences,
    workingDays: [...state.planningPreferences.workingDays],
  }));
  const [selectedTasks, setSelectedTasks] = useState<string[]>(
    taskIds ??
      state.tasks.filter((task) => !task.completed).map((task) => task.id),
  );
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [sourcePreferences, setSourcePreferences] = useState("");
  const [recoveryPreview, setRecoveryPreview] = useState<TimeBlock[]>([]);
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const incomingTaskIds = taskIds ? JSON.stringify(taskIds) : null;
  useEffect(() => {
    if (from) setStart(from);
    if (to) setEnd(to);
    if (incomingTaskIds !== null)
      setSelectedTasks(JSON.parse(incomingTaskIds) as string[]);
    setResult(null);
    setSelectedBlocks([]);
    setError("");
  }, [from, to, incomingTaskIds]);

  function invalidate() {
    setResult(null);
    setSelectedBlocks([]);
    setError("");
    setNotice("");
  }
  function preference<K extends keyof PlanningPreferences>(
    key: K,
    value: PlanningPreferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
    invalidate();
  }
  function generate() {
    setError("");
    setNotice("");
    try {
      if (!selectedTasks.length) {
        setResult(null);
        setError("Choose at least one unfinished tasker to plan.");
        return;
      }
      const proposals = buildSchedule(
        state,
        selectedTasks,
        start,
        end,
        preferences,
        currentPlanningTime(),
      );
      setRecoveryPreview(
        missedTaskAllocations(
          state,
          proposals.suggestions.map((item) => item.block.taskId!),
          currentRecoveryTime(),
        ).map((block) => ({ ...block })),
      );
      setSourcePreferences(JSON.stringify(state.planningPreferences));
      setResult(proposals);
      setSelectedBlocks(proposals.suggestions.map((item) => item.block.id));
    } catch (issue) {
      setResult(null);
      setSelectedBlocks([]);
      setError(
        issue instanceof Error
          ? issue.message
          : "Review the planning dates and working hours.",
      );
    }
  }
  function savePreferences() {
    const issue = planningPreferencesError(preferences);
    if (issue) {
      setError(issue);
      return;
    }
    const saved = mutate((next) => {
      next.planningPreferences = {
        ...preferences,
        workingDays: [...preferences.workingDays],
      };
    });
    if (!saved) {
      setError(
        "Working hours could not be saved. Review the planner storage message.",
      );
      return;
    }
    setError("");
    setNotice(
      "Working hours saved for future planning. Existing blocks were preserved.",
    );
  }
  function apply() {
    if (!result) return;
    const selected = new Set(selectedBlocks);
    let issue: string | null = null;
    // Provider supplies its latest state inside the mutation, including synchronous edits in other components.
    const applied = mutate((next) => {
      if (JSON.stringify(next.planningPreferences) !== sourcePreferences) {
        issue =
          "Saved working hours changed. Generate proposals again before applying these blocks.";
        return;
      }
      issue = scheduleSelectionError(
        next,
        selectedTasks,
        start,
        end,
        preferences,
        result.suggestions,
        selectedBlocks,
        currentPlanningTime(),
      );
      if (issue) return;
      const chosen = result.suggestions.filter((item) =>
        selected.has(item.block.id),
      );
      const recoveredTaskIds = [
        ...new Set(chosen.map((item) => item.block.taskId!)),
      ];
      const recoveryTime = currentRecoveryTime();
      issue = recoverySelectionError(
        next,
        recoveryPreview,
        recoveredTaskIds,
        recoveryTime,
      );
      if (issue) return;
      // Historical times and completion facts are retained; only the replaced task link is detached.
      for (const oldBlock of missedTaskAllocations(
        next,
        recoveredTaskIds,
        recoveryTime,
      ))
        delete oldBlock.taskId;
      for (const { block } of chosen)
        next.blocks.push({ ...block, id: crypto.randomUUID() });
      next.planningPreferences = {
        ...preferences,
        workingDays: [...preferences.workingDays],
      };
    });
    if (issue) {
      setError(issue);
      setNotice("");
      return;
    }
    if (!applied) {
      setError(
        "The schedule could not be applied. Review the planner storage message.",
      );
      return;
    }
    const count = selectedBlocks.length;
    setResult(null);
    setSelectedBlocks([]);
    setError("");
    setNotice(
      `${count} reviewed time ${count === 1 ? "block" : "blocks"} added. Tasker suspenses were preserved.`,
    );
  }
  const openTasks = state.tasks.filter((task) => !task.completed);
  const proposedTaskIds = [
    ...new Set(result?.suggestions.map((item) => item.block.taskId!) ?? []),
  ];
  const chooseId = (list: string[], value: string, checked: boolean) =>
    checked
      ? [...new Set([...list, value])]
      : list.filter((item) => item !== value);

  return (
    <section
      className="panel scheduling-assistant"
      aria-labelledby={`${id}-title`}
    >
      <div className="scheduling-heading">
        <div>
          <p className="eyebrow">MAKE ROOM FOR THE WORK</p>
          <h2 id={`${id}-title`}>
            <CalendarClock size={22} /> Scheduling assistant
          </h2>
        </div>
        <button
          type="button"
          className="button secondary"
          aria-expanded={showPreferences}
          onClick={() => setShowPreferences((current) => !current)}
        >
          <SlidersHorizontal size={16} /> Working hours
        </button>
      </div>
      <p className="scheduling-intro">
        Review a plan around fixed blocks, working days, breaks, suspenses, and
        prerequisites. Nothing changes until you apply the selected proposals.
      </p>
      <div className="form-grid scheduling-date-grid">
        <label className="field">
          Plan from
          <input
            type="date"
            value={start}
            max="9999-12-31"
            onChange={(event) => {
              setStart(event.target.value);
              invalidate();
            }}
          />
        </label>
        <label className="field">
          Plan through
          <input
            type="date"
            value={end}
            max="9999-12-31"
            onChange={(event) => {
              setEnd(event.target.value);
              invalidate();
            }}
          />
        </label>
      </div>
      {showPreferences && (
        <div className="scheduling-preferences">
          <fieldset className="scheduling-days">
            <legend>Working days</legend>
            {DAYS.map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={preferences.workingDays.includes(index)}
                  onChange={(event) =>
                    preference(
                      "workingDays",
                      event.target.checked
                        ? [...preferences.workingDays, index].sort()
                        : preferences.workingDays.filter(
                            (value) => value !== index,
                          ),
                    )
                  }
                />
                {day}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            <label className="field">
              Work starts
              <input
                type="time"
                value={preferences.dayStart}
                onChange={(event) => preference("dayStart", event.target.value)}
              />
            </label>
            <label className="field">
              Work ends
              <input
                type="text"
                inputMode="numeric"
                placeholder="17:00 or 24:00"
                value={preferences.dayEnd}
                onChange={(event) => preference("dayEnd", event.target.value)}
              />
            </label>
            <label className="field">
              Break starts
              <input
                type="time"
                value={preferences.breakStart}
                onChange={(event) =>
                  preference("breakStart", event.target.value)
                }
              />
            </label>
            <label className="field">
              Break ends
              <input
                type="time"
                value={preferences.breakEnd}
                onChange={(event) => preference("breakEnd", event.target.value)}
              />
            </label>
            <label className="field">
              Maximum block minutes
              <input
                type="number"
                min="1"
                max="480"
                step="1"
                value={preferences.maxBlockMinutes}
                onChange={(event) =>
                  preference("maxBlockMinutes", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              Appointment buffer minutes
              <input
                type="number"
                min="0"
                max="180"
                step="1"
                value={preferences.eventBufferMinutes}
                onChange={(event) =>
                  preference("eventBufferMinutes", Number(event.target.value))
                }
              />
            </label>
          </div>
          <p className="muted">
            Leave both break times blank for no planned break. Timed calendar
            entries and meetings reserve this buffer on each side; zero reserves
            one minute. All-day entries reserve no hours. Add fixed blocks for
            full appointment durations.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={savePreferences}
          >
            Save working hours
          </button>
        </div>
      )}
      <fieldset className="scheduling-task-picker">
        <legend>Taskers to plan</legend>
        {openTasks.length ? (
          <>
            <div className="scheduling-picker-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSelectedTasks(taskIds ?? openTasks.map((task) => task.id));
                  invalidate();
                }}
              >
                Select {taskIds ? "review taskers" : "all unfinished"}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSelectedTasks([]);
                  invalidate();
                }}
              >
                Clear selection
              </button>
            </div>
            <div className="scheduling-task-list">
              {openTasks.map((task) => (
                <label key={task.id}>
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={(event) => {
                      setSelectedTasks((current) =>
                        chooseId(current, task.id, event.target.checked),
                      );
                      invalidate();
                    }}
                  />
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.date
                        ? `Suspense ${formatDate(task.date)}${task.suspenseTime ? ` ${task.suspenseTime}` : ""}`
                        : "No suspense recorded"}{" "}
                      ·{" "}
                      {task.estimatedMinutes && task.estimatedMinutes > 0
                        ? durationLabel(Math.ceil(task.estimatedMinutes))
                        : "30m planning allowance; estimate missing"}
                      {task.assigneeId
                        ? ` · Owner: ${state.members.find((member) => member.id === task.assigneeId)?.name ?? "unavailable"}`
                        : ""}
                      {task.status === "Blocked" ? " · Blocked" : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Add unfinished taskers to propose a schedule.</p>
        )}
      </fieldset>
      <div className="scheduling-generate">
        <button
          className="button secondary"
          type="button"
          onClick={generate}
          disabled={!openTasks.length}
        >
          <CalendarClock size={16} /> Generate schedule proposals
        </button>
        <span className="muted">Up to 31 days · device-local time</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {result && (
        <div className="scheduling-results">
          <p className="scheduling-capacity">
            <strong>{durationLabel(result.availableMinutes)}</strong> free
            before proposals · {result.suggestions.length} proposed{" "}
            {result.suggestions.length === 1 ? "block" : "blocks"}
          </p>
          {proposedTaskIds.map((taskId) => {
            const proposals = result.suggestions.filter(
              (item) => item.block.taskId === taskId,
            );
            const allChecked = proposals.every((item) =>
              selectedBlocks.includes(item.block.id),
            );
            return (
              <article className="scheduling-proposal" key={taskId}>
                <label className="scheduling-proposal-choice">
                  <input
                    type="checkbox"
                    aria-label={`Include schedule for ${proposals[0].block.title}`}
                    checked={allChecked}
                    onChange={(event) =>
                      setSelectedBlocks((current) =>
                        event.target.checked
                          ? [
                              ...new Set([
                                ...current,
                                ...proposals.map((item) => item.block.id),
                              ]),
                            ]
                          : current.filter(
                              (value) =>
                                !proposals.some(
                                  (item) => item.block.id === value,
                                ),
                            ),
                      )
                    }
                  />
                  <strong>{proposals[0].block.title}</strong>
                </label>
                <p className="muted">{proposals[0].reason}</p>
                <ul>
                  {proposals.map(({ block }) => (
                    <li key={block.id}>
                      <span>
                        {formatDate(block.date)} · {block.start}–{block.end}
                      </span>
                      {onOpenDay && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onOpenDay(block.date)}
                        >
                          View day
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {recoveryPreview.some((block) => block.taskId === taskId) && (
                  <div className="scheduling-recovery">
                    <h3>Missed allocations replaced by this plan</h3>
                    <p>
                      Applying this tasker’s proposals removes its link from
                      these ended, unfinished blocks. Their titles, times, and
                      unfinished status stay in your history; completing the
                      replacement work will not mark these missed blocks
                      complete.
                    </p>
                    <ul>
                      {recoveryPreview
                        .filter((block) => block.taskId === taskId)
                        .map((block) => (
                          <li key={block.id}>
                            <span>
                              {block.title} · {formatDate(block.date)} ·{" "}
                              {block.start}–{block.end}
                            </span>
                          </li>
                        ))}
                    </ul>
                    {!allChecked && (
                      <p>
                        This recovery is excluded while this tasker’s proposed
                        schedule is unchecked.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!!result.unscheduled.length && (
            <div className="scheduling-unplanned">
              <h3>Needs attention or no new blocks</h3>
              <ul>
                {result.unscheduled.map((item) => (
                  <li key={item.taskId}>
                    <strong>
                      {state.tasks.find((task) => task.id === item.taskId)
                        ?.title ?? "Removed tasker"}
                    </strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!result.suggestions.length && (
            <button
              className="button primary"
              type="button"
              onClick={apply}
              disabled={!selectedBlocks.length}
            >
              <Check size={16} /> Apply selected schedule
            </button>
          )}
          <p className="muted scheduling-explanation">
            A proposal covers the full remaining effort before its suspense or
            explains why it cannot fit. Scheduled prerequisites reserve their
            place; finish them before marking dependent taskers complete. Past
            unfinished blocks stay in your history and do not count as completed
            effort. Suggestions use saved facts and planning allowances.
          </p>
        </div>
      )}
    </section>
  );
}
