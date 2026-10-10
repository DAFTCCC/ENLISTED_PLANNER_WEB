import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Save,
} from "lucide-react";
import { addDays, formatDate, localDate } from "../lib/dates";
import { usePlanner } from "../lib/planner";
import {
  buildWeeklyReview,
  carryForwardReasons,
  createWeeklyReview,
  reviewDuration,
  reviewWeek,
  type WeeklyReflection,
} from "../lib/weekly-review";
import type { Page, WeeklyReview as SavedWeeklyReview } from "../lib/types";
import SchedulingAssistant from "./SchedulingAssistant";
import "./professional.css";
import "./weekly-review.css";

interface Props {
  onOpenDay?: (date: string) => void;
  onNavigate?: (page: Page) => void;
}

const reflectionFor = (review?: SavedWeeklyReview): WeeklyReflection => ({
  wins: review?.wins ?? "",
  lessons: review?.lessons ?? "",
  nextFocus: review?.nextFocus ?? "",
  carriedTaskIds: [...(review?.carriedTaskIds ?? [])],
});

export default function WeeklyReview({ onOpenDay, onNavigate }: Props) {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [weekStart, setWeekStart] = useState(() => reviewWeek(today).start);
  const [reflection, setReflection] = useState(() =>
    reflectionFor(
      state.weeklyReviews.find(
        (review) => review.weekStart === reviewWeek(today).start,
      ),
    ),
  );
  const unsavedDrafts = useRef(new Map<string, WeeklyReflection>());
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const summary = useMemo(
    () => buildWeeklyReview(state, weekStart, today),
    [state, weekStart, today],
  );
  const savedReview = state.weeklyReviews.find(
    (review) => review.weekStart === weekStart,
  );
  const candidateIds = useMemo(
    () => new Set(summary.carryCandidates.map((task) => task.id)),
    [summary],
  );
  const selectedIds = reflection.carriedTaskIds.filter((id) =>
    candidateIds.has(id),
  );
  const filteredTasks = useMemo(() => {
    const memberNames = new Map(
      state.members.map((member) => [member.id, member.name]),
    );
    const projectNames = new Map(
      state.projects.map((project) => [project.id, project.title]),
    );
    const query = search.toLowerCase();
    return summary.carryCandidates.filter((task) =>
      `${task.title} ${memberNames.get(task.assigneeId ?? "") ?? ""} ${projectNames.get(task.projectId ?? "") ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [summary, state.members, state.projects, search]);
  const taskReasons = useMemo(
    () =>
      new Map(
        filteredTasks
          .slice(0, 100)
          .map((task) => [
            task.id,
            carryForwardReasons(task, state, today).join(" · "),
          ]),
      ),
    [filteredTasks, state, today],
  );
  let previousWeek: string | null = null;
  try {
    previousWeek = addDays(weekStart, -7);
  } catch {
    /* Calendar boundary. */
  }

  function selectWeek(value: string) {
    if (!value) return;
    try {
      const next = reviewWeek(value).start;
      unsavedDrafts.current.set(weekStart, reflection);
      setWeekStart(next);
      setReflection(
        unsavedDrafts.current.get(next) ??
          reflectionFor(
            state.weeklyReviews.find((review) => review.weekStart === next),
          ),
      );
      setSearch("");
      setNotice("");
      setError("");
    } catch {
      setError("Choose a valid calendar date between years 1 and 9999.");
    }
  }

  function saveReview(event: FormEvent) {
    event.preventDefault();
    const id = savedReview?.id ?? crypto.randomUUID();
    let removed = 0;
    let acceptedCarriedIds = selectedIds;
    const saved = mutate((next) => {
      const existing = next.weeklyReviews.find(
        (review) => review.weekStart === weekStart,
      );
      const record = createWeeklyReview(
        next,
        weekStart,
        localDate(),
        reflection,
        existing?.id ?? id,
      );
      removed = reflection.carriedTaskIds.length - record.carriedTaskIds.length;
      acceptedCarriedIds = record.carriedTaskIds;
      if (existing) Object.assign(existing, record);
      else next.weeklyReviews.push(record);
    });
    if (!saved) {
      setError(
        "The review could not be saved. Your reflection is still here; resolve the storage issue and try again.",
      );
      setNotice("");
      return;
    }
    setError("");
    setReflection((current) => ({
      ...current,
      carriedTaskIds: acceptedCarriedIds,
    }));
    unsavedDrafts.current.delete(weekStart);
    setNotice(
      `Weekly review saved. Task suspenses and existing blocks are unchanged.${removed ? " Completed or removed taskers were excluded from carry-forward choices." : ""} Apply scheduling proposals below to add next week's blocks.`,
    );
  }

  const navigate = (page: Page, label: string) =>
    onNavigate ? (
      <button
        className="button secondary small"
        type="button"
        onClick={() => onNavigate(page)}
      >
        {label}
        <ArrowRight size={14} />
      </button>
    ) : null;

  return (
    <div className="weekly-review professional-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFLECT · ADJUST · PLAN</div>
          <h1>Weekly review</h1>
          <p className="muted">
            Review what happened, close the gaps, and choose next week's work.
          </p>
        </div>
        <span className="weekly-review-mark">
          <ClipboardCheck size={28} />
        </span>
      </div>

      <section className="panel weekly-review-week" aria-label="Review week">
        <div className="professional-inline">
          <button
            className="button secondary"
            type="button"
            disabled={!previousWeek}
            aria-label="Previous review week"
            onClick={() => previousWeek && selectWeek(previousWeek)}
          >
            <ChevronLeft size={18} />
          </button>
          <label className="field">
            <span>Week containing</span>
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={weekStart}
              onChange={(event) => selectWeek(event.target.value)}
            />
          </label>
          <button
            className="button secondary"
            type="button"
            disabled={!summary.nextWeek}
            aria-label="Next review week"
            onClick={() =>
              summary.nextWeek && selectWeek(summary.nextWeek.start)
            }
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => selectWeek(today)}
          >
            This week
          </button>
        </div>
        <p className="muted">
          {formatDate(summary.week.start)} – {formatDate(summary.week.end)} ·
          Monday–Sunday
        </p>
        {summary.week.end >= today && summary.week.start <= today && (
          <p className="weekly-review-help">
            This week is still in progress. These totals reflect your saved
            records so far.
          </p>
        )}
      </section>

      {error && (
        <div className="weekly-review-notice" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="weekly-review-notice" role="status">
          {notice}
        </div>
      )}

      <div className="weekly-review-metrics" aria-label="Current weekly totals">
        <div className="professional-stat">
          <span>Planned block time</span>
          <strong>{reviewDuration(summary.metrics.plannedMinutes)}</strong>
        </div>
        <div className="professional-stat">
          <span>Completed block time</span>
          <strong>
            {reviewDuration(summary.metrics.completedBlockMinutes)}
          </strong>
        </div>
        <div className="professional-stat">
          <span>Dated task completions</span>
          <strong>{summary.metrics.completedTaskCount}</strong>
        </div>
        <div className="professional-stat">
          <span>Accomplishments recorded</span>
          <strong>{summary.metrics.captureCount}</strong>
        </div>
      </div>
      <p className="weekly-review-help weekly-review-metric-note">
        Block totals use their scheduled duration and saved completion status;
        they are not tracked hours. Task completions count only recorded
        completion dates.
        {summary.unknownCompletionDates > 0 &&
          ` ${summary.unknownCompletionDates} completed tasker${summary.unknownCompletionDates === 1 ? " has" : "s have"} no completion date and ${summary.unknownCompletionDates === 1 ? "is" : "are"} excluded.`}{" "}
        Later edits can change these live totals; saved reviews retain their
        totals.
      </p>

      <div className="professional-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <CheckCheck size={18} /> What moved forward
            </h2>
            {navigate("captures", "Review accomplishments")}
          </div>
          <div className="weekly-review-section">
            <dl className="weekly-review-balance">
              {summary.categories.map((item) => (
                <div key={item.category}>
                  <dt>{item.category}</dt>
                  <dd>
                    {reviewDuration(item.completedMinutes)} completed /{" "}
                    {reviewDuration(item.plannedMinutes)} planned
                  </dd>
                </div>
              ))}
            </dl>
            {summary.completedTasks.length > 0 ? (
              <>
                <h3>Completed taskers</h3>
                <ul className="weekly-review-list">
                  {summary.completedTasks.slice(0, 8).map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{formatDate(task.completedOn!)}</span>
                    </li>
                  ))}
                </ul>
                {summary.completedTasks.length > 8 && (
                  <p className="weekly-review-help">
                    Showing 8 of {summary.completedTasks.length} dated
                    completions.
                  </p>
                )}
              </>
            ) : (
              <p className="weekly-review-help">
                No dated task completions are recorded for this week. Completed
                blocks and accomplishments can still show your progress.
              </p>
            )}
            {(summary.uncapturedTasks.length > 0 ||
              summary.captureGaps.length > 0) && (
              <div className="weekly-review-prompt">
                <h3>Results worth documenting</h3>
                {summary.uncapturedTasks.length > 0 && (
                  <>
                    <p>
                      {summary.uncapturedTasks.length} completed tasker
                      {summary.uncapturedTasks.length === 1
                        ? " has"
                        : "s have"}{" "}
                      no linked accomplishment. Record the actual result and
                      supporting evidence.
                    </p>
                    <ul>
                      {summary.uncapturedTasks.slice(0, 6).map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                  </>
                )}
                {summary.captureGaps.length > 0 && (
                  <p>
                    {summary.captureGaps.length} accomplishment
                    {summary.captureGaps.length === 1
                      ? " needs"
                      : "s need"}{" "}
                    actions or an outcome:{" "}
                    {summary.captureGaps
                      .slice(0, 6)
                      .map((capture) => capture.title)
                      .join("; ")}
                    .
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>
              <CalendarCheck2 size={18} /> Gaps & follow-ups
            </h2>
            {navigate("work", "Review taskers")}
          </div>
          <div className="weekly-review-section">
            <p className="weekly-review-help">
              Open records due by this week's end, assessed against today's
              saved state.
            </p>
            <h3>
              {summary.overdueTasks.length} overdue tasker
              {summary.overdueTasks.length === 1 ? "" : "s"}
            </h3>
            {summary.overdueTasks.length > 0 ? (
              <ul className="weekly-review-list">
                {summary.overdueTasks.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong>
                    <span>Suspense {formatDate(task.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="weekly-review-help">
                No open tasker suspenses have passed by today's date in this
                review window.
              </p>
            )}
            <h3>
              {summary.unfinishedBlocks.length} unfinished block
              {summary.unfinishedBlocks.length === 1 ? "" : "s"}
            </h3>
            <p className="weekly-review-help">
              Review past blocks for completion or more time. Blocks later this
              week may simply be upcoming.
            </p>
            <ul className="weekly-review-list">
              {summary.unfinishedBlocks.slice(0, 4).map((block) => (
                <li key={block.id}>
                  <div>
                    <strong>{block.title}</strong>
                    <span>
                      {formatDate(block.date)} · {block.start}–{block.end}
                    </span>
                  </div>
                  {onOpenDay && (
                    <button
                      className="button secondary small"
                      type="button"
                      aria-label={`Review block: ${block.title}`}
                      onClick={() => onOpenDay(block.date)}
                    >
                      Open day
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <h3>
              {summary.followUps.length} teammate follow-up
              {summary.followUps.length === 1 ? "" : "s"}
            </h3>
            <ul className="weekly-review-list">
              {summary.followUps.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {formatDate(item.date)} · {item.detail}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {summary.followUps.length > 0 &&
              navigate("leadership", "Review teammate follow-ups")}
          </div>
        </section>
      </div>

      <form className="panel weekly-review-reflection" onSubmit={saveReview}>
        <div className="panel-heading">
          <h2>Your reflection & next-week choices</h2>
          {savedReview && (
            <span className="muted">
              Saved {formatDate(savedReview.reviewedOn)}
            </span>
          )}
        </div>
        <div className="weekly-review-section">
          <div className="form-grid">
            <label className="field">
              <span>Wins & outcomes</span>
              <textarea
                rows={4}
                value={reflection.wins}
                placeholder="What changed because of your work? Use results you can support."
                onChange={(event) =>
                  setReflection({ ...reflection, wins: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Lessons & adjustments</span>
              <textarea
                rows={4}
                value={reflection.lessons}
                placeholder="What helped, what slipped, and what should change?"
                onChange={(event) =>
                  setReflection({ ...reflection, lessons: event.target.value })
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Next week's focus</span>
            <textarea
              rows={3}
              value={reflection.nextFocus}
              placeholder="Choose the result that matters most next week."
              onChange={(event) =>
                setReflection({ ...reflection, nextFocus: event.target.value })
              }
            />
          </label>
          <div className="professional-heading-row">
            <div>
              <h3>Carry forward into next week's plan</h3>
              <p className="weekly-review-help">
                Select unfinished taskers to consider. Their deadlines stay
                unchanged; review overdue suspenses with the requestor before
                rescheduling.
              </p>
            </div>
            <span className="weekly-review-selected">
              {selectedIds.length} selected
            </span>
          </div>
          <label className="field weekly-review-search">
            <span>Find carry-forward taskers</span>
            <input
              type="search"
              value={search}
              placeholder="Tasker, project, or teammate"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {filteredTasks.length > 0 ? (
            <div className="weekly-review-task-choices">
              {filteredTasks.slice(0, 100).map((task) => (
                <label className="weekly-review-task-choice" key={task.id}>
                  <input
                    type="checkbox"
                    aria-label={`Carry forward: ${task.title}`}
                    checked={selectedIds.includes(task.id)}
                    onChange={(event) =>
                      setReflection({
                        ...reflection,
                        carriedTaskIds: event.target.checked
                          ? [...selectedIds, task.id]
                          : selectedIds.filter((id) => id !== task.id),
                      })
                    }
                  />
                  <div>
                    <strong>{task.title}</strong>
                    <span>{taskReasons.get(task.id)}</span>
                    {task.estimatedMinutes != null && (
                      <span>{task.estimatedMinutes} minutes estimated</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="weekly-review-help">
              {search
                ? "No matching taskers. Try another search."
                : "No unfinished taskers need carrying into this planning window."}
            </p>
          )}
          {filteredTasks.length > 100 && (
            <p className="weekly-review-help">
              Showing the first 100 of {filteredTasks.length} taskers. Use
              search to find other work.
            </p>
          )}
          <div className="weekly-review-save">
            <p className="weekly-review-help">
              Saving records your reflection, choices, and current totals.
              Scheduling proposals require a separate review below.
            </p>
            <button className="button primary" type="submit">
              <Save size={16} />
              Save weekly review
            </button>
          </div>
        </div>
      </form>

      {summary.nextWeek ? (
        selectedIds.length > 0 ? (
          <SchedulingAssistant
            key={`${weekStart}:${selectedIds.join(",")}`}
            taskIds={selectedIds}
            from={summary.nextWeek.start}
            to={summary.nextWeek.end}
            onOpenDay={onOpenDay}
          />
        ) : (
          <section className="panel weekly-review-planning-empty">
            <h2>Plan next week</h2>
            <p className="weekly-review-help">
              Select carry-forward taskers above to review scheduling proposals
              for {formatDate(summary.nextWeek.start)} –{" "}
              {formatDate(summary.nextWeek.end)}. You choose which blocks to
              add.
            </p>
          </section>
        )
      ) : (
        <p className="weekly-review-help">
          The selected week reaches the supported calendar limit. Choose an
          earlier week to plan ahead.
        </p>
      )}

      {state.weeklyReviews.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Saved review history</h2>
            <span className="muted">
              {state.weeklyReviews.length} review
              {state.weeklyReviews.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="weekly-review-section">
            <p className="weekly-review-help">
              These totals are snapshots from when each review was saved. Open a
              review to read or update its reflection.
            </p>
            <div className="weekly-review-history">
              {[...state.weeklyReviews]
                .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
                .map((review) => (
                  <button
                    key={review.id}
                    type="button"
                    className={`weekly-review-history-item${review.weekStart === weekStart ? " selected" : ""}`}
                    aria-label={`Open review for ${formatDate(review.weekStart)}`}
                    onClick={() => selectWeek(review.weekStart)}
                  >
                    <strong>Week of {formatDate(review.weekStart)}</strong>
                    <span>
                      {reviewDuration(review.metrics.completedBlockMinutes)}{" "}
                      completed /{" "}
                      {reviewDuration(review.metrics.plannedMinutes)} planned ·{" "}
                      {review.metrics.completedTaskCount} dated task completions
                      · {review.metrics.captureCount} accomplishments
                    </span>
                    {review.nextFocus && <span>Focus: {review.nextFocus}</span>}
                    <span>
                      Reviewed {formatDate(review.reviewedOn)} ·{" "}
                      {review.carriedTaskIds.length} carried forward
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
