import { useState, type FormEvent } from "react";
import { Check, Heart, Pencil, Plus, Trash2 } from "lucide-react";
import { usePlanner } from "../lib/planner";
import { localDate, formatDate } from "../lib/dates";
import type { Goal, Habit } from "../lib/types";
import "./tools-settings.css";

const categories = [
  "Fitness",
  "Mental well-being",
  "Social connection",
  "Education",
  "Family",
] as const;
const goalPrefix = "Readiness: ";
const emptyHabit = { title: "", category: "Fitness" };
const emptyGoal = { title: "", category: "Fitness", targetDate: "" };

function isSupportedDate(value: string): boolean {
  try {
    formatDate(value);
    return true;
  } catch {
    return false;
  }
}

export default function Readiness() {
  const { state, mutate } = usePlanner();
  const [date, setDate] = useState(localDate());
  const [habitDraft, setHabitDraft] = useState(emptyHabit);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState(emptyGoal);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [message, setMessage] = useState("");
  const goals = state.goals.filter((goal) =>
    goal.category.startsWith(goalPrefix),
  );
  const visibleHabits = state.habits.filter(
    (habit) => activeCategory === "All" || habit.category === activeCategory,
  );
  const completed = state.habits.filter((habit) =>
    habit.completedDates.includes(date),
  ).length;

  function saveHabit(event: FormEvent) {
    event.preventDefault();
    const title = habitDraft.title.trim();
    if (!title) return;
    mutate((draft) => {
      const existing = draft.habits.find((habit) => habit.id === editingHabit);
      if (existing)
        Object.assign(existing, { title, category: habitDraft.category });
      else
        draft.habits.push({
          id: crypto.randomUUID(),
          title,
          category: habitDraft.category,
          completedDates: [],
        });
    });
    setMessage(editingHabit ? "Habit updated." : "Habit added.");
    setEditingHabit(null);
    setHabitDraft(emptyHabit);
  }

  function editHabit(habit: Habit) {
    setEditingHabit(habit.id);
    setHabitDraft({ title: habit.title, category: habit.category });
  }

  function toggleHabit(id: string) {
    mutate((draft) => {
      const habit = draft.habits.find((item) => item.id === id);
      if (!habit) return;
      habit.completedDates = habit.completedDates.includes(date)
        ? habit.completedDates.filter((item) => item !== date)
        : [...habit.completedDates, date];
    });
  }

  function deleteHabit(habit: Habit) {
    if (!window.confirm(`Delete "${habit.title}" and its completion history?`))
      return;
    mutate((draft) => {
      draft.habits = draft.habits.filter((item) => item.id !== habit.id);
    });
    if (editingHabit === habit.id) {
      setEditingHabit(null);
      setHabitDraft(emptyHabit);
    }
  }

  function saveGoal(event: FormEvent) {
    event.preventDefault();
    const title = goalDraft.title.trim();
    if (!title) return;
    mutate((draft) => {
      const existing = draft.goals.find((goal) => goal.id === editingGoal);
      const changes = {
        title,
        category: `${goalPrefix}${goalDraft.category}`,
        targetDate: goalDraft.targetDate,
      };
      if (existing) Object.assign(existing, changes);
      else
        draft.goals.push({ id: crypto.randomUUID(), ...changes, progress: 0 });
    });
    setMessage(editingGoal ? "Goal updated." : "Goal added.");
    setEditingGoal(null);
    setGoalDraft(emptyGoal);
  }

  function editGoal(goal: Goal) {
    setEditingGoal(goal.id);
    setGoalDraft({
      title: goal.title,
      category: goal.category.slice(goalPrefix.length),
      targetDate: goal.targetDate,
    });
  }

  function deleteGoal(goal: Goal) {
    if (!window.confirm(`Delete "${goal.title}"?`)) return;
    mutate((draft) => {
      draft.goals = draft.goals.filter((item) => item.id !== goal.id);
    });
    if (editingGoal === goal.id) {
      setEditingGoal(null);
      setGoalDraft(emptyGoal);
    }
  }

  return (
    <div className="readiness-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">TAKE CARE OF THE WHOLE YOU</span>
          <h1>Personal readiness</h1>
          <p>
            Small daily commitments. A stronger foundation for everything ahead.
          </p>
        </div>
      </header>

      <section
        className="panel readiness-summary"
        aria-label="Daily readiness progress"
      >
        <div className="readiness-summary-icon">
          <Heart size={24} />
        </div>
        <div>
          <h2>Your daily check-in</h2>
          <p className="muted">
            {state.habits.length
              ? `${completed} of ${state.habits.length} habits completed for ${formatDate(date)}.`
              : "Choose a few habits that support your life, on and off duty."}
          </p>
        </div>
        <label className="field compact-date">
          <span>Check-in date</span>
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={date}
            onChange={(event) => {
              if (isSupportedDate(event.target.value))
                setDate(event.target.value);
            }}
            required
          />
        </label>
      </section>

      <div className="readiness-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Daily habits</h2>
              <p className="muted">Make room for what keeps you well.</p>
            </div>
            <span className="badge">{state.habits.length} habits</span>
          </div>
          <div className="category-filter" aria-label="Filter habits">
            {["All", ...categories].map((category) => (
              <button
                type="button"
                key={category}
                className={`category-chip ${activeCategory === category ? "active" : ""}`}
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          {visibleHabits.length ? (
            <div className="habit-list">
              {visibleHabits.map((habit) => (
                <div className="list-row habit-row" key={habit.id}>
                  <button
                    type="button"
                    className={`habit-check ${habit.completedDates.includes(date) ? "checked" : ""}`}
                    aria-label={`${habit.completedDates.includes(date) ? "Mark incomplete" : "Complete"}: ${habit.title}`}
                    aria-pressed={habit.completedDates.includes(date)}
                    onClick={() => toggleHabit(habit.id)}
                  >
                    {habit.completedDates.includes(date) && <Check size={18} />}
                  </button>
                  <div className="row-content">
                    <strong
                      className={
                        habit.completedDates.includes(date)
                          ? "completed-title"
                          : ""
                      }
                    >
                      {habit.title}
                    </strong>
                    <span className="muted small">
                      {habit.category} · {habit.completedDates.length}{" "}
                      {habit.completedDates.length === 1
                        ? "check-in"
                        : "check-ins"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit habit: ${habit.title}`}
                    onClick={() => editHabit(habit)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete habit: ${habit.title}`}
                    onClick={() => deleteHabit(habit)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Heart size={28} />
              <h3>
                {activeCategory === "All"
                  ? "Start with one small habit"
                  : `No ${activeCategory.toLowerCase()} habits yet`}
              </h3>
              <p>Try a daily walk, time with family, or 20 minutes of study.</p>
            </div>
          )}
          <form className="section-form" onSubmit={saveHabit}>
            <h3>{editingHabit ? "Edit habit" : "Add a habit"}</h3>
            <label className="field">
              <span>Habit</span>
              <input
                placeholder="e.g. Take a 20-minute walk"
                value={habitDraft.title}
                maxLength={150}
                onChange={(event) =>
                  setHabitDraft({ ...habitDraft, title: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>Area of readiness</span>
              <select
                value={habitDraft.category}
                onChange={(event) =>
                  setHabitDraft({ ...habitDraft, category: event.target.value })
                }
              >
                {!categories.some(
                  (category) => category === habitDraft.category,
                ) && <option>{habitDraft.category}</option>}
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="button primary" type="submit">
                <Plus size={16} />
                {editingHabit ? "Save habit" : "Add habit"}
              </button>
              {editingHabit && (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    setEditingHabit(null);
                    setHabitDraft(emptyHabit);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Readiness goals</h2>
              <p className="muted">Turn a personal priority into a plan.</p>
            </div>
          </div>
          {goals.length ? (
            <div className="readiness-goals">
              {goals.map((goal) => (
                <article className="readiness-goal" key={goal.id}>
                  <div className="goal-topline">
                    <div>
                      <span className="badge">
                        {goal.category.slice(goalPrefix.length)}
                      </span>
                      <h3>{goal.title}</h3>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit goal: ${goal.title}`}
                        onClick={() => editGoal(goal)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete goal: ${goal.title}`}
                        onClick={() => deleteGoal(goal)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="muted small">
                    {goal.targetDate
                      ? `Target: ${formatDate(goal.targetDate)}`
                      : "No target date set"}
                  </p>
                  <label className="goal-progress">
                    <span>
                      Progress <strong>{goal.progress}%</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={goal.progress}
                      aria-label={`Progress for ${goal.title}`}
                      onChange={(event) =>
                        mutate((draft) => {
                          const item = draft.goals.find(
                            (candidate) => candidate.id === goal.id,
                          );
                          if (item) item.progress = Number(event.target.value);
                        })
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>A goal worth making time for</h3>
              <p>Add a goal and update your progress as you go.</p>
            </div>
          )}
          <form className="section-form" onSubmit={saveGoal}>
            <h3>
              {editingGoal ? "Edit readiness goal" : "Add a readiness goal"}
            </h3>
            <label className="field">
              <span>Goal</span>
              <input
                placeholder="e.g. Finish my certification"
                value={goalDraft.title}
                maxLength={150}
                onChange={(event) =>
                  setGoalDraft({ ...goalDraft, title: event.target.value })
                }
                required
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Area</span>
                <select
                  value={goalDraft.category}
                  onChange={(event) =>
                    setGoalDraft({ ...goalDraft, category: event.target.value })
                  }
                >
                  {!categories.some(
                    (category) => category === goalDraft.category,
                  ) && <option>{goalDraft.category}</option>}
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>
                  Target date <span className="muted">(optional)</span>
                </span>
                <input
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={goalDraft.targetDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value || isSupportedDate(value))
                      setGoalDraft({ ...goalDraft, targetDate: value });
                  }}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="button primary" type="submit">
                <Plus size={16} />
                {editingGoal ? "Save goal" : "Add goal"}
              </button>
              {editingGoal && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setEditingGoal(null);
                    setGoalDraft(emptyGoal);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
      <p className="small muted readiness-note">
        This is a personal planning tool. For health concerns, seek support from
        a qualified professional or your installation’s support services.
      </p>
      <p role="status" className="visually-hidden">
        {message}
      </p>
    </div>
  );
}
