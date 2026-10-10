import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Award,
  CalendarDays,
  Check,
  Flag,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import { getPromotionEstimate } from "../lib/calculations";
import { removePlannerRecord } from "../lib/relationships";
import type { Goal } from "../lib/types";
import CareerPlanning from "./CareerPlanning";
import CareerReadiness from "./CareerReadiness";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import "./professional.css";

const categories = [
  "Career milestone",
  "Promotion preparation",
  "Education",
  "Certification",
  "Professional military education",
  "Award or decoration",
  "Evaluation",
  "Personal development",
];
const blankGoal = (): Omit<Goal, "id"> => ({
  title: "",
  targetDate: "",
  category: "Career milestone",
  progress: 0,
});
function elapsed(date: string, today: string) {
  if (!isProfessionalDate(date) || date > today) return "—";
  const start = new Date(`${date}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    end.getMonth() -
    start.getMonth();
  if (end.getDate() < start.getDate()) months--;
  if (months < 1) return "Under 1 month";
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  return [
    years ? `${years} yr${years === 1 ? "" : "s"}` : "",
    remaining ? `${remaining} mo` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Career() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [draft, setDraft] = useState(blankGoal);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<"All" | "In progress" | "Completed">(
    "All",
  );
  const [profileDraft, setProfileDraft] = useState({
    dateOfRank: state.profile.dateOfRank,
    dateOfEntry: state.profile.dateOfEntry,
  });
  const [datesSaved, setDatesSaved] = useState(false);
  const [datesError, setDatesError] = useState("");
  const [goalError, setGoalError] = useState("");
  const estimate = useMemo(
    () => getPromotionEstimate(state.profile),
    [state.profile],
  );
  const goals = [...state.goals]
    .filter(
      (goal) =>
        filter === "All" ||
        (filter === "Completed" ? goal.progress === 100 : goal.progress < 100),
    )
    .sort((a, b) =>
      a.progress === 100 && b.progress < 100
        ? 1
        : b.progress === 100 && a.progress < 100
          ? -1
          : (a.targetDate || "9999").localeCompare(b.targetDate || "9999"),
    );
  const completed = state.goals.filter((goal) => goal.progress === 100).length;
  const openGoal = (goal: Goal | "new") => {
    setGoalError("");
    setDraft(
      goal === "new"
        ? blankGoal()
        : {
            ...goal,
          },
    );
    setEditing(goal);
  };
  const saveGoal = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    if (!isProfessionalDate(draft.targetDate, true)) {
      setGoalError(
        "Choose a real target date between years 0001 and 9999, or leave it blank.",
      );
      return;
    }
    if (
      !Number.isFinite(draft.progress) ||
      draft.progress < 0 ||
      draft.progress > 100
    ) {
      setGoalError("Progress must be a number between 0 and 100.");
      return;
    }
    mutate((next) => {
      if (editing === "new")
        next.goals.push({
          ...draft,
          title: draft.title.trim(),
          id: crypto.randomUUID(),
        });
      else if (editing) {
        const goal = next.goals.find((item) => item.id === editing.id);
        if (goal) Object.assign(goal, { ...draft, title: draft.title.trim() });
      }
    });
    setEditing(null);
  };
  const saveDates = (event: FormEvent) => {
    event.preventDefault();
    if (
      !isProfessionalDate(profileDraft.dateOfEntry, true) ||
      !isProfessionalDate(profileDraft.dateOfRank, true) ||
      profileDraft.dateOfEntry > today ||
      profileDraft.dateOfRank > today
    ) {
      setDatesError(
        "Enter real profile dates on or before today, or leave optional dates blank.",
      );
      return;
    }
    if (
      profileDraft.dateOfEntry &&
      profileDraft.dateOfRank &&
      profileDraft.dateOfRank < profileDraft.dateOfEntry
    ) {
      setDatesError("Date of rank must be on or after your date of entry.");
      return;
    }
    mutate((next) => Object.assign(next.profile, profileDraft));
    setDatesError("");
    setDatesSaved(true);
  };

  return (
    <div className="professional-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BUILD YOUR NEXT CHAPTER</span>
          <h1>Career development</h1>
          <p>Your milestones, your progress, your future.</p>
        </div>
        <button className="button primary" onClick={() => openGoal("new")}>
          <Plus size={17} /> Add milestone
        </button>
      </div>
      <div className="professional-summary">
        <div className="professional-stat">
          <span>TIME IN SERVICE</span>
          <strong>{elapsed(state.profile.dateOfEntry, today)}</strong>
        </div>
        <div className="professional-stat">
          <span>TIME IN GRADE</span>
          <strong>{elapsed(state.profile.dateOfRank, today)}</strong>
        </div>
        <div className="professional-stat">
          <span>MILESTONES COMPLETED</span>
          <strong>
            {completed}
            <span> / {state.goals.length}</span>
          </strong>
        </div>
      </div>
      <div className="professional-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Award size={19} /> Career timeline
            </h2>
            <span className="badge">
              {state.profile.rank || "Your profile"}
            </span>
          </div>
          <p className="muted small">
            Keep your dates current to give your career planning a useful
            starting point.
          </p>
          <form onSubmit={saveDates}>
            <div className="form-grid">
              <label className="field">
                Date of entry
                <input
                  type="date"
                  min="0001-01-01"
                  value={profileDraft.dateOfEntry}
                  max={
                    isProfessionalDate(profileDraft.dateOfRank) &&
                    profileDraft.dateOfRank < today
                      ? profileDraft.dateOfRank
                      : today
                  }
                  onChange={(event) => {
                    setProfileDraft({
                      ...profileDraft,
                      dateOfEntry: event.target.value,
                    });
                    setDatesSaved(false);
                    setDatesError("");
                  }}
                />
              </label>
              <label className="field">
                Date of rank
                <input
                  type="date"
                  value={profileDraft.dateOfRank}
                  min={
                    isProfessionalDate(profileDraft.dateOfEntry)
                      ? profileDraft.dateOfEntry
                      : "0001-01-01"
                  }
                  max={today}
                  onChange={(event) => {
                    setProfileDraft({
                      ...profileDraft,
                      dateOfRank: event.target.value,
                    });
                    setDatesSaved(false);
                    setDatesError("");
                  }}
                />
              </label>
            </div>
            <div className="professional-inline" style={{ marginTop: 16 }}>
              <button className="button secondary" type="submit">
                Save dates
              </button>
              {datesSaved && (
                <span className="small professional-icon" role="status">
                  <Check size={15} /> Dates saved
                </span>
              )}
            </div>
            {datesError && (
              <p className="error-text small" role="alert">
                {datesError}
              </p>
            )}
          </form>
          {estimate ? (
            <div className="professional-estimate">
              <div className="professional-heading-row">
                <h3>Senior Airman planning estimate</h3>
                <span className="badge">Estimate</span>
              </div>
              <div className="estimate-dates" style={{ marginTop: 18 }}>
                <div>
                  <span className="muted small">Standard eligibility</span>
                  <strong>{formatDate(estimate.standardDate)}</strong>
                </div>
                <div>
                  <span className="muted small">BTZ consideration point</span>
                  <strong>{formatDate(estimate.btzDate)}</strong>
                </div>
              </div>
              <p className="small muted">
                Use these dates to start a conversation with your supervisor and
                servicing personnel office. Eligibility is an estimate, and BTZ
                selection is competitive.
              </p>
              <details>
                <summary className="small">
                  Assumptions &amp; rule version
                </summary>
                <ul>
                  {estimate.assumptions.map((assumption, i) => (
                    <li key={i}>{assumption}</li>
                  ))}
                </ul>
                <p className="small muted">
                  Rule version: {estimate.ruleVersion}
                </p>
              </details>
              <button
                className="button secondary"
                style={{ marginTop: 14 }}
                onClick={() => {
                  setGoalError("");
                  setDraft({
                    title: "Senior Airman promotion planning",
                    targetDate: estimate.standardDate,
                    category: "Promotion preparation",
                    progress: 0,
                    source: "Estimate",
                    sourceRef: estimate.ruleVersion,
                  });
                  setEditing("new");
                }}
              >
                <Plus size={15} /> Plan a milestone
              </button>
            </div>
          ) : (
            <div className="professional-tip" style={{ marginTop: 20 }}>
              <strong>Plan for your career stage.</strong>
              <br />
              Track testing, boards, evaluations, PME, education,
              certifications, and transition goals using milestones below.
              Automatic promotion estimates are available for Active Duty Air
              Force A1Cs with valid entry and rank dates. Other eligibility
              dates should be confirmed with your servicing personnel office.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <GraduationCap size={19} /> Make development intentional
            </h2>
          </div>
          <div className="professional-queue">
            <div className="professional-queue-row">
              <strong className="small">
                Prepare for your next opportunity
              </strong>
              <p className="small muted">
                Give testing, boards, PME, or a new responsibility a target date
                and track progress as you prepare.
              </p>
            </div>
            <div className="professional-queue-row">
              <strong className="small">Keep feedback on your calendar</strong>
              <p className="small muted">
                Use Calendar for your confirmed evaluation closeout, feedback
                sessions, and administrative deadlines. Dates you enter are
                labeled as user entered.
              </p>
            </div>
            <div className="professional-queue-row">
              <strong className="small">Document the work as you go</strong>
              <p className="small muted">
                Capture accomplishments while the details are fresh. Expand them
                into a record before your next evaluation or award package.
              </p>
            </div>
          </div>
          <div className="professional-tip" style={{ marginTop: 20 }}>
            The planner supports every enlisted grade. Confirm official
            promotion and evaluation requirements through your service's current
            guidance and personnel office.
          </div>
        </section>
      </div>
      <CareerPlanning />
      <CareerReadiness />
      <section>
        <div className="professional-heading-row" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0 }}>Your milestones</h2>
            <p className="muted small">
              A clear next step for every stage of your career.
            </p>
          </div>
          <label className="field" style={{ minWidth: 145 }}>
            Show
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as typeof filter)
              }
            >
              <option>All</option>
              <option>In progress</option>
              <option>Completed</option>
            </select>
          </label>
        </div>
        {goals.length ? (
          <div className="card-grid">
            {goals.map((goal) => (
              <article key={goal.id} className="professional-item">
                <div className="professional-heading-row">
                  <span className="badge">{goal.category}</span>
                  <div className="professional-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${goal.title}`}
                      onClick={() => openGoal(goal)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${goal.title}`}
                      onClick={() => setDeleteGoal(goal)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3 style={{ marginTop: 14 }}>{goal.title}</h3>
                <div className="professional-meta">
                  <span className="professional-icon">
                    <CalendarDays size={14} />
                    {goal.targetDate
                      ? formatDate(goal.targetDate)
                      : "No target date"}
                  </span>
                  {goal.targetDate &&
                    goal.targetDate < today &&
                    goal.progress < 100 && (
                      <span className="badge professional-due">
                        Target passed
                      </span>
                    )}
                  <span>{goal.source || "User entered"}</span>
                </div>
                {goal.sourceRef &&
                  !goal.sourceRef.startsWith("career-plan:") &&
                  !goal.sourceRef.startsWith("evaluation-closeout:") && (
                    <p className="small muted">Source: {goal.sourceRef}</p>
                  )}
                {goal.sourceRef?.startsWith("evaluation-closeout:") &&
                  goal.sourceRef.includes(" | ") && (
                    <p className="small muted">
                      Reference: {goal.sourceRef.split(" | ")[1]}
                    </p>
                  )}
                <div className="professional-goal-progress">
                  <label htmlFor={`progress-${goal.id}`}>
                    <span>
                      {goal.progress === 100 ? "Completed" : "Progress"}
                    </span>
                    <strong>{goal.progress}%</strong>
                  </label>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                  <input
                    id={`progress-${goal.id}`}
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={goal.progress}
                    onChange={(event) =>
                      mutate((next) => {
                        const current = next.goals.find(
                          (item) => item.id === goal.id,
                        );
                        if (current)
                          current.progress = Number(event.target.value);
                      })
                    }
                  />
                </div>
                <button
                  className="button ghost"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    mutate((next) => {
                      const current = next.goals.find(
                        (item) => item.id === goal.id,
                      );
                      if (current)
                        current.progress = current.progress === 100 ? 0 : 100;
                    })
                  }
                >
                  {goal.progress === 100 ? (
                    <ArrowUpRight size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {goal.progress === 100 ? "Reopen milestone" : "Mark complete"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel professional-empty">
            <Flag size={28} />
            <h3>
              {state.goals.length
                ? "No milestones in this view"
                : "What do you want to work toward?"}
            </h3>
            <p>
              {state.goals.length
                ? "Choose another filter to see your milestones."
                : "Add a goal, set a target date, and take the next step toward it."}
            </p>
            {!state.goals.length && (
              <button
                className="button primary"
                style={{ marginTop: 20 }}
                onClick={() => openGoal("new")}
              >
                <Plus size={16} /> Add your first milestone
              </button>
            )}
          </div>
        )}
      </section>
      {editing && (
        <ProfessionalDialog
          title={editing === "new" ? "Add a milestone" : "Edit milestone"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveGoal}>
            <div className="professional-modal-body">
              <label className="field">
                Milestone title
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="For example, complete my CCAF degree"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Category
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft({ ...draft, category: event.target.value })
                    }
                  >
                    {!categories.includes(draft.category) && (
                      <option>{draft.category}</option>
                    )}
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Target date
                  <input
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={draft.targetDate}
                    onChange={(event) => {
                      setDraft({ ...draft, targetDate: event.target.value });
                      setGoalError("");
                    }}
                  />
                </label>
              </div>
              <label className="field">
                Progress (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={draft.progress}
                  onChange={(event) =>
                    setDraft({ ...draft, progress: Number(event.target.value) })
                  }
                />
              </label>
              <p className="small muted">
                Your target is a{" "}
                {draft.source === "Estimate"
                  ? "calculated estimate"
                  : "user-entered planning date"}
                . It does not establish official eligibility.
              </p>
              {goalError && (
                <p className="error-text small" role="alert">
                  {goalError}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save milestone
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deleteGoal && (
        <ProfessionalDialog
          title="Delete milestone?"
          onClose={() => setDeleteGoal(null)}
        >
          <p>This will delete “{deleteGoal.title}” and its progress.</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteGoal(null)}
            >
              Keep milestone
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) => {
                  removePlannerRecord(next, "goals", deleteGoal.id);
                });
                setDeleteGoal(null);
              }}
            >
              Delete milestone
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
