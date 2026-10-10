import { useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import { removePlannerRecord } from "../lib/relationships";
import {
  CAREER_PATHWAYS,
  CAREER_RULE_VERSION,
  CAREER_SOURCES,
  careerEvidenceSummary,
  careerPlanReview,
  careerStageGuidance,
  careerTemplate,
  evaluationCheckpoints,
  referenceScod,
  safeSourceUrl,
  suggestedPathway,
} from "../lib/career-planning";
import type { CareerPlan } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import "./career-planning.css";

export default function CareerPlanning() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const recommended = suggestedPathway(state.profile);
  const evidence = careerEvidenceSummary(state);
  const scod = referenceScod(state.profile, today);
  const [pathway, setPathway] = useState<CareerPlan["pathway"]>(recommended);
  const [editing, setEditing] = useState<CareerPlan | "new" | null>(null);
  const [draft, setDraft] = useState<Omit<CareerPlan, "id">>(() =>
    careerTemplate(recommended, state.profile, () => crypto.randomUUID()),
  );
  const [error, setError] = useState("");
  const [deletePlan, setDeletePlan] = useState<CareerPlan | null>(null);
  const [message, setMessage] = useState("");
  const [closeout, setCloseout] = useState("");
  const [closeoutReference, setCloseoutReference] = useState("");
  const [closeoutSource, setCloseoutSource] = useState<
    "User entered" | "Estimate"
  >("User entered");
  const [evaluationError, setEvaluationError] = useState("");
  const plans = [...state.careerPlans].sort(
    (a, b) =>
      Number(a.status === "Complete") - Number(b.status === "Complete") ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
  );

  function openPlan(plan: CareerPlan | "new") {
    const value =
      plan === "new"
        ? careerTemplate(pathway, state.profile, () => crypto.randomUUID())
        : { ...plan, checklist: plan.checklist.map((item) => ({ ...item })) };
    setDraft(value);
    setError("");
    setEditing(plan);
  }

  function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("Give this preparation plan a title.");
      return;
    }
    if (
      !isProfessionalDate(draft.dueDate, true) ||
      !isProfessionalDate(draft.lastVerified, true) ||
      draft.lastVerified > today
    ) {
      setError(
        "Enter real dates; a source checked date cannot be in the future.",
      );
      return;
    }
    if (draft.sourceUrl.trim() && !safeSourceUrl(draft.sourceUrl.trim())) {
      setError(
        "Use a complete HTTPS source link without embedded credentials, or leave it blank.",
      );
      return;
    }
    const labels = draft.checklist.map((item) => item.label.trim());
    if (labels.length > 50 || labels.some((label) => label.length > 500)) {
      setError(
        "Use up to 50 preparation steps, each no longer than 500 characters.",
      );
      return;
    }
    if (
      labels.some((label) => !label) ||
      new Set(labels).size !== labels.length
    ) {
      setError("Give every preparation step a distinct, nonempty label.");
      return;
    }
    const value: CareerPlan = {
      ...draft,
      id: editing === "new" ? crypto.randomUUID() : (editing as CareerPlan).id,
      title: draft.title.trim(),
      cycle: draft.cycle.trim(),
      afsc: draft.afsc.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      checklist: draft.checklist.map((item) => ({
        ...item,
        label: item.label.trim(),
      })),
    };
    mutate((next) => {
      const index = next.careerPlans.findIndex((item) => item.id === value.id);
      if (index < 0) next.careerPlans.push(value);
      else next.careerPlans[index] = value;
    });
    setEditing(null);
  }

  function makeTasker(plan: CareerPlan, item: CareerPlan["checklist"][number]) {
    mutate((next) => {
      const current = next.careerPlans
        .find((row) => row.id === plan.id)
        ?.checklist.find((row) => row.id === item.id);
      if (
        !current ||
        (current.taskId &&
          next.tasks.some((task) => task.id === current.taskId))
      )
        return;
      const taskId = crypto.randomUUID();
      next.tasks.push({
        id: taskId,
        title: item.label,
        date: plan.dueDate || today,
        completed: item.completed,
        priority: "Normal",
        status: item.completed ? "Done" : "Open",
        careerPlanId: plan.id,
        notes: `Career preparation: ${plan.title}${plan.cycle ? `; cycle ${plan.cycle}` : ""}${plan.afsc ? `; community ${plan.afsc}` : ""}${plan.sourceUrl ? `\nGuidance: ${plan.sourceUrl}` : ""}`,
      });
      current.taskId = taskId;
    });
    setMessage(
      `Linked “${item.label}” to a tasker. Open Projects & taskers to assign, schedule, and track the work.`,
    );
  }

  function planMilestone(plan: CareerPlan) {
    if (!plan.dueDate) {
      setMessage("Add a confirmed suspense to this preparation plan first.");
      return;
    }
    const sourceRef = `career-plan:${plan.id}`;
    mutate((next) => {
      let goal = next.goals.find((item) => item.sourceRef === sourceRef);
      if (!goal) {
        goal = {
          id: crypto.randomUUID(),
          title: plan.title,
          targetDate: plan.dueDate,
          category: "Promotion preparation",
          progress: 0,
          source: "User entered",
          sourceRef,
        };
        next.goals.push(goal);
      } else {
        goal.title = plan.title;
        goal.targetDate = plan.dueDate;
      }
      const event = next.events.find((item) => item.goalId === goal.id);
      if (event) {
        event.title = `Career suspense: ${plan.title}`;
        event.date = plan.dueDate;
      } else
        next.events.push({
          id: crypto.randomUUID(),
          title: `Career suspense: ${plan.title}`,
          date: plan.dueDate,
          time: "",
          category: "Career",
          recurrence: "None",
          source: "User entered",
          goalId: goal.id,
        });
    });
    setMessage(
      `Added or updated the milestone and calendar suspense for ${plan.title}.`,
    );
  }

  function addCheckpoints(event: FormEvent) {
    event.preventDefault();
    if (!isProfessionalDate(closeout)) {
      setEvaluationError("Enter a real evaluation closeout date first.");
      return;
    }
    const checkpoints = evaluationCheckpoints(closeout, closeoutSource);
    mutate((next) => {
      const sourceKey = `evaluation-closeout:${closeout}`;
      const sourceRef = `${sourceKey} | ${closeoutReference || "User-entered closeout planning; confirm applicability with personnel"}`;
      let goal = next.goals.find(
        (item) =>
          item.sourceRef === sourceKey ||
          item.sourceRef?.startsWith(`${sourceKey} | `),
      );
      if (!goal) {
        goal = {
          id: crypto.randomUUID(),
          title: "Evaluation closeout",
          targetDate: closeout,
          category: "Evaluation",
          progress: 0,
          source: closeoutSource,
          sourceRef,
        };
        next.goals.push(goal);
      } else {
        goal.source = closeoutSource;
        goal.sourceRef = sourceRef;
      }
      for (const checkpoint of checkpoints) {
        const prior = next.events.find(
          (item) => item.goalId === goal.id && item.title === checkpoint.title,
        );
        if (prior) {
          prior.date = checkpoint.date;
          prior.source = checkpoint.source;
        } else
          next.events.push({
            id: crypto.randomUUID(),
            ...checkpoint,
            time: "",
            category: "Career",
            recurrence: "None",
            goalId: goal.id,
          });
      }
    });
    setEvaluationError("");
    setMessage(
      "Evaluation milestone and preparation checkpoints are on your calendar. Earlier checkpoints stay visible for review.",
    );
  }

  return (
    <section
      className="career-planning-stack"
      aria-labelledby="career-preparation-heading"
    >
      <div className="professional-heading-row">
        <div>
          <h2 id="career-preparation-heading">
            Promotion and evaluation preparation
          </h2>
          <p className="muted small">
            Turn your next cycle into a reviewable plan with steps, sources, and
            calendar suspenses.
          </p>
        </div>
        <div className="career-template-picker">
          <label className="field">
            Preparation pathway
            <select
              value={pathway}
              onChange={(event) =>
                setPathway(event.target.value as CareerPlan["pathway"])
              }
            >
              {CAREER_PATHWAYS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button className="button primary" onClick={() => openPlan("new")}>
            <Plus size={16} /> Start preparation plan
          </button>
        </div>
      </div>
      <div className="professional-tip">
        <strong>Suggested for your profile: {recommended}.</strong>{" "}
        {state.profile.service} · {state.profile.component} ·{" "}
        {state.profile.rank || "Set your rank in Settings"}. Templates organize
        preparation; completing them does not certify eligibility or predict
        selection.
        <p className="small" style={{ marginBottom: 0 }}>
          {careerStageGuidance(state.profile)}
        </p>
      </div>
      {message && (
        <p className="small career-message" role="status">
          {message}
        </p>
      )}
      <div className="professional-two">
        <section className="panel">
          <div className="panel-heading">
            <h3>
              <BookOpen size={18} /> Evidence for your next review
            </h3>
          </div>
          <div className="career-evidence-grid">
            <div>
              <strong>{evidence.captures}</strong>
              <span>Accomplishment records</span>
            </div>
            <div>
              <strong>{evidence.measured}</strong>
              <span>Results and impact recorded</span>
            </div>
            <div>
              <strong>{evidence.aligned}</strong>
              <span>MGA and ALQ categorized</span>
            </div>
            <div>
              <strong>{evidence.developmentOpen}</strong>
              <span>Open teammate development actions</span>
            </div>
          </div>
          <p className="small muted">
            These counts describe saved records, not promotion potential. Use
            Accomplishments to add actions, results, impact, and supporting
            evidence; ask a supervisor or mentor to review accuracy.
          </p>
          <div className="career-source-links">
            <a
              href={CAREER_SOURCES.promotions}
              target="_blank"
              rel="noreferrer"
            >
              AFPC promotions <ExternalLink size={13} />
            </a>
            <a href={CAREER_SOURCES.myFSS} target="_blank" rel="noreferrer">
              myFSS cycle guidance <ExternalLink size={13} />
            </a>
            <a
              href={CAREER_SOURCES.publications}
              target="_blank"
              rel="noreferrer"
            >
              DAF publications <ExternalLink size={13} />
            </a>
          </div>
          <p className="small muted">
            {CAREER_RULE_VERSION}. Cycle-specific requirements need current
            verification. The supplied PDF includes older cycle tables; those
            are not treated as current promotion rules.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>
              <CalendarDays size={18} /> Evaluation and feedback checkpoints
            </h3>
          </div>
          {scod ? (
            <div className="career-scod-reference">
              <span className="badge">Unverified reference estimate</span>
              <p>
                <strong>{formatDate(scod.date)}</strong> is the next recurring
                closeout date suggested by the PDF's grade table.
              </p>
              <p className="small muted">{scod.caveat}</p>
              <details>
                <summary className="small">Source and currency</summary>
                <p className="small muted">
                  {scod.sourceRef}. {scod.ruleVersion}. Current official policy
                  could not be verified during this release.
                </p>
              </details>
              <button
                className="button ghost"
                onClick={() => {
                  setCloseout(scod.date);
                  setCloseoutSource("Estimate");
                  setCloseoutReference(
                    `${scod.sourceRef}; ${scod.ruleVersion}`,
                  );
                  setEvaluationError("");
                }}
              >
                Use reference estimate
              </button>
            </div>
          ) : (
            <p className="small muted">
              Enter a closeout confirmed for your service and component. The
              PDF's active-duty Air Force grade table is not applied to this
              profile.
            </p>
          )}
          <form onSubmit={addCheckpoints} className="career-closeout-form">
            <label className="field">
              Evaluation closeout date
              <input
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={closeout}
                onChange={(event) => {
                  setCloseout(event.target.value);
                  setCloseoutSource("User entered");
                  setCloseoutReference("");
                  setEvaluationError("");
                }}
                required
              />
            </label>
            <label className="field">
              Closeout date source
              <select
                value={closeoutSource}
                onChange={(event) =>
                  setCloseoutSource(event.target.value as typeof closeoutSource)
                }
              >
                <option>User entered</option>
                <option>Estimate</option>
              </select>
            </label>
            <p className="small muted">
              Adds a closeout milestone and planning checkpoints 180, 90, and 30
              days before it. These chosen preparation offsets are estimates;
              confirm actual feedback requirements and unit submission dates
              separately.
            </p>
            {evaluationError && (
              <p className="error-text small" role="alert">
                {evaluationError}
              </p>
            )}
            <button className="button secondary" type="submit">
              <Plus size={15} /> Add evaluation checkpoints
            </button>
          </form>
        </section>
      </div>
      {plans.length ? (
        <div className="card-grid">
          {plans.map((plan) => {
            const review = careerPlanReview(plan, state.profile, today);
            const sourceLink = safeSourceUrl(plan.sourceUrl);
            return (
              <article
                key={plan.id}
                className="professional-item career-plan-card"
              >
                <div className="professional-heading-row">
                  <span className="badge">{plan.pathway}</span>
                  <div className="professional-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit preparation plan: ${plan.title}`}
                      onClick={() => openPlan(plan)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete preparation plan: ${plan.title}`}
                      onClick={() => setDeletePlan(plan)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3>{plan.title}</h3>
                <div className="professional-meta">
                  <span>{plan.status}</span>
                  {plan.cycle && <span>Cycle {plan.cycle}</span>}
                  {plan.afsc && <span>AFSC {plan.afsc}</span>}
                  <span>
                    {plan.dueDate
                      ? `Suspense ${formatDate(plan.dueDate)}`
                      : "Suspense not confirmed"}
                  </span>
                  {review.overdue && (
                    <span className="badge professional-due">
                      Suspense passed
                    </span>
                  )}
                </div>
                <p className="small">
                  <strong>
                    {review.completed} / {review.total}
                  </strong>{" "}
                  preparation steps complete
                </p>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${review.total ? (100 * review.completed) / review.total : 0}%`,
                    }}
                  />
                </div>
                <div className="career-checklist">
                  {plan.checklist.map((item) => {
                    const linkedTask = state.tasks.find(
                      (task) => task.id === item.taskId,
                    );
                    return (
                      <div key={item.id} className="career-checklist-row">
                        <label
                          className={
                            item.completed
                              ? "career-step completed"
                              : "career-step"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={(event) =>
                              mutate((next) => {
                                const current = next.careerPlans
                                  .find((row) => row.id === plan.id)
                                  ?.checklist.find((row) => row.id === item.id);
                                if (current)
                                  current.completed = event.target.checked;
                              })
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                        {linkedTask ? (
                          <div className="career-linked-task">
                            <span>
                              Tasker: {linkedTask.title} ·{" "}
                              {linkedTask.status ||
                                (linkedTask.completed ? "Done" : "Open")}
                            </span>
                            <a href="#work">Open tasker</a>
                          </div>
                        ) : (
                          <button
                            className="button ghost career-make-task"
                            aria-label={`Make tasker: ${item.label}`}
                            onClick={() => makeTasker(plan, item)}
                          >
                            Make a tasker
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {review.gaps.length > 0 && (
                  <details className="career-gaps">
                    <summary>
                      {review.gaps.length} preparation gap
                      {review.gaps.length === 1 ? "" : "s"} to review
                    </summary>
                    <ul>
                      {review.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="small">
                  <strong>Next step:</strong> {review.nextStep}
                </p>
                {plan.notes && (
                  <details>
                    <summary className="small">Plan notes</summary>
                    <p className="small career-notes">{plan.notes}</p>
                  </details>
                )}
                <div className="career-plan-source">
                  {sourceLink ? (
                    <a href={sourceLink} target="_blank" rel="noreferrer">
                      Review source <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span>No current source recorded</span>
                  )}
                  <span>
                    {plan.lastVerified
                      ? `Source checked ${formatDate(plan.lastVerified)} (user recorded)`
                      : "Source not yet checked for this cycle"}
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => planMilestone(plan)}
                  disabled={!plan.dueDate}
                >
                  <CalendarDays size={15} /> Add or update calendar suspense
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel career-plan-empty">
          <ClipboardCheck size={26} />
          <h3>Your next opportunity needs a plan</h3>
          <p className="muted">
            Start with a pathway, customize its preparation steps, and record
            the guidance for your own cycle.
          </p>
        </div>
      )}
      {editing && (
        <ProfessionalDialog
          title={
            editing === "new"
              ? "Start a preparation plan"
              : "Edit preparation plan"
          }
          onClose={() => setEditing(null)}
        >
          <form onSubmit={savePlan}>
            <div className="professional-modal-body">
              <label className="field">
                Preparation plan title
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Pathway
                  <select
                    value={draft.pathway}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        pathway: event.target.value as CareerPlan["pathway"],
                      })
                    }
                  >
                    {CAREER_PATHWAYS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Plan status
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: event.target.value as CareerPlan["status"],
                      })
                    }
                  >
                    <option>Preparing</option>
                    <option>Ready for review</option>
                    <option>Complete</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  Promotion cycle
                  <input
                    maxLength={100}
                    placeholder="For example, 27E5 — confirm your cycle"
                    value={draft.cycle}
                    onChange={(event) =>
                      setDraft({ ...draft, cycle: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  AFSC or functional community
                  <input
                    maxLength={100}
                    value={draft.afsc}
                    onChange={(event) =>
                      setDraft({ ...draft, afsc: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field">
                Confirmed preparation suspense
                <input
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={draft.dueDate}
                  onChange={(event) =>
                    setDraft({ ...draft, dueDate: event.target.value })
                  }
                />
              </label>
              <fieldset className="career-step-editor">
                <legend>Preparation steps</legend>
                {draft.checklist.map((item, index) => (
                  <div key={item.id} className="career-step-edit-row">
                    <label className="field">
                      Preparation step {index + 1}
                      <input
                        required
                        maxLength={500}
                        value={item.label}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            checklist: draft.checklist.map((step) =>
                              step.id === item.id
                                ? { ...step, label: event.target.value }
                                : step,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove preparation step ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          checklist: draft.checklist.filter(
                            (step) => step.id !== item.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  disabled={draft.checklist.length >= 50}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      checklist: [
                        ...draft.checklist,
                        {
                          id: crypto.randomUUID(),
                          label: "",
                          completed: false,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} /> Add preparation step
                </button>
              </fieldset>
              <p className="small muted">
                Changing the pathway label keeps your customized steps. To load
                a different template, start a new plan with that pathway.
                Editing a step keeps its completion status and tasker link.
                Removing a step preserves its tasker in Projects & taskers.
              </p>
              <div className="form-grid">
                <label className="field">
                  Current guidance source URL
                  <input
                    type="url"
                    placeholder="https://…"
                    value={draft.sourceUrl}
                    onChange={(event) =>
                      setDraft({ ...draft, sourceUrl: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Source checked on
                  <input
                    type="date"
                    min="0001-01-01"
                    max={today}
                    value={draft.lastVerified}
                    onChange={(event) =>
                      setDraft({ ...draft, lastVerified: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field">
                Preparation notes
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                />
              </label>
              <p className="small muted">
                Your source checked date records your review. It does not mean
                the app independently verified eligibility or guidance.
              </p>
              {error && (
                <p className="error-text small" role="alert">
                  {error}
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
                <Check size={16} /> Save preparation plan
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deletePlan && (
        <ProfessionalDialog
          title="Delete preparation plan?"
          onClose={() => setDeletePlan(null)}
        >
          <p>
            This removes “{deletePlan.title}” and its checklist. Accomplishment
            records remain available.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeletePlan(null)}
            >
              Keep preparation plan
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) =>
                  removePlannerRecord(next, "careerPlans", deletePlan.id),
                );
                setDeletePlan(null);
              }}
            >
              Delete preparation plan
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </section>
  );
}
