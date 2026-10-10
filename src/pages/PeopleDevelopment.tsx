import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  GraduationCap,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { removePlannerRecord } from "../lib/relationships";
import { taskCompletionError } from "../lib/workflow";
import { formatDate, localDate } from "../lib/dates";
import type {
  DevelopmentAction,
  DisciplinePlan,
  PlannerState,
  Task,
} from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";

const emptyAction = (): Omit<DevelopmentAction, "id"> => ({
  memberId: "",
  title: "",
  kind: "Training",
  dueDate: "",
  status: "Planned",
  notes: "",
});
const emptyPlan = (): Omit<DisciplinePlan, "id"> => ({
  memberId: "",
  title: "",
  expectation: "",
  observedGap: "",
  supportPlan: "",
  followUpDate: "",
  consultation: "Not started",
  status: "Open",
  notes: "",
});
const actionTaskStatus = (action: DevelopmentAction): Task["status"] =>
  action.status === "Complete"
    ? "Done"
    : action.status === "In progress"
      ? "In progress"
      : "Open";
function syncActionTask(state: PlannerState, action: DevelopmentAction) {
  const task = state.tasks.find((item) => item.id === action.taskId);
  if (task)
    Object.assign(task, {
      title: action.title,
      date: action.dueDate,
      assigneeId: action.memberId,
      status: actionTaskStatus(action),
      completed: action.status === "Complete",
    });
}
function blockedDependencies(state: PlannerState, taskId: string) {
  const task = state.tasks.find((item) => item.id === taskId);
  return task ? taskCompletionError(task, state.tasks) : null;
}

export default function PeopleDevelopment() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [person, setPerson] = useState("all");
  const [actionFilter, setActionFilter] = useState("Active development");
  const [planFilter, setPlanFilter] = useState("Active preparation");
  const [actionEditing, setActionEditing] = useState<
    DevelopmentAction | "new" | null
  >(null);
  const [actionDraft, setActionDraft] = useState(emptyAction);
  const [taskConnection, setTaskConnection] = useState<
    "none" | "create" | "existing"
  >("none");
  const [taskId, setTaskId] = useState("");
  const [planEditing, setPlanEditing] = useState<DisciplinePlan | "new" | null>(
    null,
  );
  const [planDraft, setPlanDraft] = useState(emptyPlan);
  const [deleteAction, setDeleteAction] = useState<DevelopmentAction | null>(
    null,
  );
  const [deletePlan, setDeletePlan] = useState<DisciplinePlan | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const matchesPerson = (memberId: string) =>
    person === "all" ||
    (person === "unlinked" ? !memberId : memberId === person);
  const actions = [...state.developmentActions]
    .filter(
      (action) =>
        matchesPerson(action.memberId) &&
        (actionFilter === "All development" ||
          (actionFilter === "Completed development"
            ? action.status === "Complete"
            : action.status !== "Complete")),
    )
    .sort((a, b) =>
      (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"),
    );
  const plans = [...state.disciplinePlans]
    .filter(
      (plan) =>
        matchesPerson(plan.memberId) &&
        (planFilter === "All preparation" ||
          (planFilter === "Closed preparation"
            ? plan.status === "Closed"
            : plan.status !== "Closed")),
    )
    .sort((a, b) =>
      (a.followUpDate || "9999-12-31").localeCompare(
        b.followUpDate || "9999-12-31",
      ),
    );
  const nameFor = (memberId: string) =>
    state.members.find((member) => member.id === memberId)?.name ||
    "Person link cleared";
  const onCalendar = (
    key: "developmentActionId" | "disciplinePlanId",
    id: string,
  ) => state.events.some((event) => event[key] === id);
  const openAction = (action: DevelopmentAction | "new") => {
    setError("");
    setActionDraft(
      action === "new"
        ? {
            ...emptyAction(),
            memberId:
              person !== "all" && person !== "unlinked"
                ? person
                : state.members[0]?.id || "",
          }
        : {
            memberId: action.memberId,
            title: action.title,
            kind: action.kind,
            dueDate: action.dueDate,
            status: action.status,
            notes: action.notes,
            taskId: action.taskId,
          },
    );
    setTaskConnection(action !== "new" && action.taskId ? "existing" : "none");
    setTaskId(action !== "new" ? action.taskId || "" : "");
    setActionEditing(action);
  };
  const saveAction = (event: FormEvent) => {
    event.preventDefault();
    if (!actionDraft.title.trim()) {
      setError("Give this action a title.");
      return;
    }
    if (
      actionEditing === "new" &&
      !state.members.some((member) => member.id === actionDraft.memberId)
    ) {
      setError("Choose the person this action supports.");
      return;
    }
    if (!isProfessionalDate(actionDraft.dueDate, true)) {
      setError(
        "Choose a real due date between years 0001 and 9999, or leave it blank.",
      );
      return;
    }
    if (
      taskConnection === "existing" &&
      !state.tasks.some((task) => task.id === taskId)
    ) {
      setError("Choose a tasker to connect, or select no tasker.");
      return;
    }
    if (
      actionDraft.status === "Complete" &&
      taskConnection === "existing" &&
      blockedDependencies(state, taskId)
    ) {
      setError(
        blockedDependencies(state, taskId) ||
          "Complete the prerequisites first.",
      );
      return;
    }
    const id =
      actionEditing === "new" ? crypto.randomUUID() : actionEditing!.id;
    const linkedTaskId =
      taskConnection === "create"
        ? crypto.randomUUID()
        : taskConnection === "existing"
          ? taskId
          : "";
    const action: DevelopmentAction = {
      ...actionDraft,
      id,
      title: actionDraft.title.trim(),
      notes: actionDraft.notes.trim(),
    };
    if (linkedTaskId) action.taskId = linkedTaskId;
    else delete action.taskId;
    mutate((next) => {
      const index = next.developmentActions.findIndex((item) => item.id === id);
      if (index < 0) next.developmentActions.push(action);
      else next.developmentActions[index] = action;
      if (taskConnection === "create")
        next.tasks.push({
          id: linkedTaskId,
          title: action.title,
          date: action.dueDate,
          completed: action.status === "Complete",
          priority: "Normal",
          status: actionTaskStatus(action),
          assigneeId: action.memberId,
          kind: "Task",
          notes: action.notes,
        });
      else syncActionTask(next, action);
    });
    setActionEditing(null);
    setNotice(
      linkedTaskId
        ? "Development action and its linked tasker saved."
        : "Development action saved.",
    );
  };
  const setActionStatus = (
    action: DevelopmentAction,
    status: DevelopmentAction["status"],
  ) => {
    if (
      status === "Complete" &&
      action.taskId &&
      blockedDependencies(state, action.taskId)
    ) {
      setNotice(
        blockedDependencies(state, action.taskId) ||
          "Complete the prerequisites first.",
      );
      return;
    }
    mutate((next) => {
      const current = next.developmentActions.find(
        (item) => item.id === action.id,
      );
      if (current) {
        current.status = status;
        syncActionTask(next, current);
      }
    });
  };
  const scheduleAction = (action: DevelopmentAction) => {
    if (
      action.status === "Complete" ||
      !isProfessionalDate(action.dueDate) ||
      onCalendar("developmentActionId", action.id)
    )
      return;
    mutate((next) =>
      next.events.push({
        id: `linked:developmentAction:${action.id}`,
        title: action.title,
        date: action.dueDate,
        time: "",
        category: action.kind === "Training" ? "Training" : "Career",
        recurrence: "None",
        source: "User entered",
        developmentActionId: action.id,
      }),
    );
    setNotice(
      "Development date added to Calendar. Changes to this action will update the linked date.",
    );
  };
  const openPlan = (plan: DisciplinePlan | "new") => {
    setError("");
    setPlanDraft(
      plan === "new"
        ? {
            ...emptyPlan(),
            memberId:
              person !== "all" && person !== "unlinked"
                ? person
                : state.members[0]?.id || "",
          }
        : {
            memberId: plan.memberId,
            title: plan.title,
            expectation: plan.expectation,
            observedGap: plan.observedGap,
            supportPlan: plan.supportPlan,
            followUpDate: plan.followUpDate,
            consultation: plan.consultation,
            status: plan.status,
            notes: plan.notes,
          },
    );
    setPlanEditing(plan);
  };
  const savePlan = (event: FormEvent) => {
    event.preventDefault();
    if (!planDraft.title.trim()) {
      setError("Give this preparation plan a title.");
      return;
    }
    if (
      planEditing === "new" &&
      !state.members.some((member) => member.id === planDraft.memberId)
    ) {
      setError("Choose the person this plan supports.");
      return;
    }
    if (!isProfessionalDate(planDraft.followUpDate, true)) {
      setError(
        "Choose a real follow-up date between years 0001 and 9999, or leave it blank.",
      );
      return;
    }
    const plan: DisciplinePlan = {
      ...planDraft,
      id: planEditing === "new" ? crypto.randomUUID() : planEditing!.id,
      title: planDraft.title.trim(),
      expectation: planDraft.expectation.trim(),
      observedGap: planDraft.observedGap.trim(),
      supportPlan: planDraft.supportPlan.trim(),
      notes: planDraft.notes.trim(),
    };
    mutate((next) => {
      const index = next.disciplinePlans.findIndex(
        (item) => item.id === plan.id,
      );
      if (index < 0) next.disciplinePlans.push(plan);
      else next.disciplinePlans[index] = plan;
    });
    setPlanEditing(null);
    setNotice("Preparation plan saved.");
  };
  const schedulePlan = (plan: DisciplinePlan) => {
    if (
      plan.status === "Closed" ||
      !isProfessionalDate(plan.followUpDate) ||
      onCalendar("disciplinePlanId", plan.id)
    )
      return;
    mutate((next) =>
      next.events.push({
        id: `linked:disciplinePlan:${plan.id}`,
        title: `Follow-up: ${plan.title}`,
        date: plan.followUpDate,
        time: "",
        category: "Career",
        recurrence: "None",
        source: "User entered",
        disciplinePlanId: plan.id,
      }),
    );
    setNotice(
      "Preparation follow-up added to Calendar. Updates will stay linked to this plan.",
    );
  };

  return (
    <div className="professional-stack people-development">
      <div className="people-development-heading">
        <div>
          <span className="eyebrow">TURN CONVERSATIONS INTO ACTION</span>
          <h2>Development &amp; follow-through</h2>
        </div>
        <label className="field">
          Show person
          <select
            value={person}
            onChange={(event) => setPerson(event.target.value)}
          >
            <option value="all">All people</option>
            {state.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
            <option value="unlinked">Person link cleared</option>
          </select>
        </label>
      </div>
      {notice && (
        <p className="small professional-icon" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      <section aria-labelledby="development-actions-heading">
        <div className="professional-heading-row people-section-heading">
          <div>
            <h3 id="development-actions-heading">
              <GraduationCap size={19} /> Structured development
            </h3>
            <p className="small muted">
              Training, mentoring, feedback, and responsibilities with a clear
              next step.
            </p>
          </div>
          <button
            className="button primary"
            disabled={!state.members.length}
            onClick={() => openAction("new")}
          >
            <Plus size={16} /> Add development action
          </button>
        </div>
        <label className="field people-filter">
          Development view
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          >
            <option>Active development</option>
            <option>All development</option>
            <option>Completed development</option>
          </select>
        </label>
        {actions.length ? (
          <div className="card-grid">
            {actions.map((action) => {
              const task = state.tasks.find(
                (item) => item.id === action.taskId,
              );
              return (
                <article
                  className="professional-item people-action"
                  aria-label={`Development action ${action.title}`}
                  key={action.id}
                >
                  <div className="professional-heading-row">
                    <span className="badge">{action.kind}</span>
                    <div className="professional-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit development action ${action.title}`}
                        onClick={() => openAction(action)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete development action ${action.title}`}
                        onClick={() => setDeleteAction(action)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h4>{action.title}</h4>
                  <p className="small muted">{nameFor(action.memberId)}</p>
                  <div className="professional-meta">
                    <span className="professional-icon">
                      <CalendarDays size={14} />
                      {action.dueDate
                        ? formatDate(action.dueDate)
                        : "No due date"}
                    </span>
                    {action.dueDate &&
                      action.dueDate < today &&
                      action.status !== "Complete" && (
                        <span className="badge professional-due">Overdue</span>
                      )}
                  </div>
                  {action.notes && (
                    <p className="people-record-notes small">{action.notes}</p>
                  )}
                  {task && (
                    <p className="people-linked-record small">
                      <ClipboardCheck size={15} />
                      <a href="#work">Linked tasker: {task.title}</a>
                      <span className="muted">
                        {task.status || (task.completed ? "Done" : "Open")}
                      </span>
                    </p>
                  )}
                  <label className="field people-status-field">
                    Development status
                    <select
                      value={action.status}
                      onChange={(event) =>
                        setActionStatus(
                          action,
                          event.target.value as DevelopmentAction["status"],
                        )
                      }
                    >
                      <option>Planned</option>
                      <option>In progress</option>
                      <option>Complete</option>
                    </select>
                  </label>
                  {action.dueDate && action.status !== "Complete" && (
                    <button
                      className="button ghost"
                      disabled={onCalendar("developmentActionId", action.id)}
                      onClick={() => scheduleAction(action)}
                    >
                      {onCalendar("developmentActionId", action.id) ? (
                        <Check size={15} />
                      ) : (
                        <Plus size={15} />
                      )}
                      {onCalendar("developmentActionId", action.id)
                        ? "On calendar"
                        : "Add development to calendar"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel professional-empty">
            <GraduationCap size={25} />
            <h3>
              {state.developmentActions.length
                ? "No development actions in this view"
                : "Give development a clear next step"}
            </h3>
            <p>
              {!state.members.length
                ? "Add a team member above to plan training, mentoring, or a new responsibility."
                : "Create an action for a person, set a date, and connect a tasker when you want it in the work plan."}
            </p>
          </div>
        )}
      </section>
      <section aria-labelledby="discipline-preparation-heading">
        <div className="professional-heading-row people-section-heading">
          <div>
            <h3 id="discipline-preparation-heading">
              <ShieldCheck size={19} /> Progressive discipline preparation
            </h3>
            <p className="small muted">
              Clarify standards, plan support, and prepare the right
              consultation.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={!state.members.length}
            onClick={() => openPlan("new")}
          >
            <Plus size={16} /> Add preparation plan
          </button>
        </div>
        <div className="professional-tip people-discipline-limit">
          <strong>General preparation only.</strong> Keep official personnel and
          disciplinary case records in authorized systems. Confirm current
          standards and next steps with the appropriate chain of command and
          legal office. This planner does not choose punishments or determine
          eligibility.
        </div>
        <details className="people-consultation-prompts">
          <summary>Questions to prepare before acting</summary>
          <ul>
            <li>
              What standard was clearly set and communicated, and what support
              could help meet it?
            </li>
            <li>
              Who should review the proposed next step: supervisor, first
              sergeant, commander, legal, or another appropriate specialist?
            </li>
            <li>
              How could the next step affect the individual, the unit, and the
              mission?
            </li>
            <li>
              What follow-on effects need qualified review, such as evaluations,
              promotion, education, assignments, or security-related
              requirements?
            </li>
          </ul>
          <p className="small muted">
            Discussion prompts adapted from the planner’s page 80. Its examples
            are not a current policy decision table.{" "}
            <a href="#support">
              Find local consultation contacts in People &amp; support.
            </a>
          </p>
        </details>
        <label className="field people-filter">
          Preparation view
          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
          >
            <option>Active preparation</option>
            <option>All preparation</option>
            <option>Closed preparation</option>
          </select>
        </label>
        {plans.length ? (
          <div className="card-grid">
            {plans.map((plan) => (
              <article
                className="professional-item people-plan"
                aria-label={`Preparation plan ${plan.title}`}
                key={plan.id}
              >
                <div className="professional-heading-row">
                  <span className="badge">{plan.status}</span>
                  <div className="professional-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit preparation plan ${plan.title}`}
                      onClick={() => openPlan(plan)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete preparation plan ${plan.title}`}
                      onClick={() => setDeletePlan(plan)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h4>{plan.title}</h4>
                <p className="small muted">{nameFor(plan.memberId)}</p>
                <dl className="people-plan-summary">
                  {plan.expectation && (
                    <div>
                      <dt>Standard or expectation</dt>
                      <dd>{plan.expectation}</dd>
                    </div>
                  )}
                  {plan.observedGap && (
                    <div>
                      <dt>General concern</dt>
                      <dd>{plan.observedGap}</dd>
                    </div>
                  )}
                  {plan.supportPlan && (
                    <div>
                      <dt>Support &amp; improvement plan</dt>
                      <dd>{plan.supportPlan}</dd>
                    </div>
                  )}
                </dl>
                {plan.notes && (
                  <details className="people-plan-notes">
                    <summary>Consultation &amp; follow-on notes</summary>
                    <p className="people-record-notes small">{plan.notes}</p>
                  </details>
                )}
                <div className="professional-meta">
                  <span className="professional-icon">
                    <CalendarDays size={14} />
                    {plan.followUpDate
                      ? formatDate(plan.followUpDate)
                      : "No follow-up date"}
                  </span>
                  {plan.followUpDate &&
                    plan.followUpDate < today &&
                    plan.status !== "Closed" && (
                      <span className="badge professional-due">
                        Follow-up overdue
                      </span>
                    )}
                </div>
                <div className="form-grid people-plan-statuses">
                  <label className="field">
                    Consultation status
                    <select
                      value={plan.consultation}
                      onChange={(event) =>
                        mutate((next) => {
                          const current = next.disciplinePlans.find(
                            (item) => item.id === plan.id,
                          );
                          if (current)
                            current.consultation = event.target
                              .value as DisciplinePlan["consultation"];
                        })
                      }
                    >
                      <option>Not started</option>
                      <option>Requested</option>
                      <option>Completed</option>
                    </select>
                  </label>
                  <label className="field">
                    Preparation status
                    <select
                      value={plan.status}
                      onChange={(event) =>
                        mutate((next) => {
                          const current = next.disciplinePlans.find(
                            (item) => item.id === plan.id,
                          );
                          if (current)
                            current.status = event.target
                              .value as DisciplinePlan["status"];
                        })
                      }
                    >
                      <option>Open</option>
                      <option>Monitoring</option>
                      <option>Closed</option>
                    </select>
                  </label>
                </div>
                {plan.followUpDate && plan.status !== "Closed" && (
                  <button
                    className="button ghost"
                    disabled={onCalendar("disciplinePlanId", plan.id)}
                    onClick={() => schedulePlan(plan)}
                  >
                    {onCalendar("disciplinePlanId", plan.id) ? (
                      <Check size={15} />
                    ) : (
                      <Plus size={15} />
                    )}
                    {onCalendar("disciplinePlanId", plan.id)
                      ? "On calendar"
                      : "Add preparation follow-up to calendar"}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="panel professional-empty">
            <ShieldCheck size={25} />
            <h3>
              {state.disciplinePlans.length
                ? "No preparation plans in this view"
                : "Prepare the conversation with care"}
            </h3>
            <p>
              {!state.members.length
                ? "Add a team member to create a general standards-and-support preparation plan."
                : "Set clear expectations, plan support, record consultation progress, and revisit the agreed next step."}
            </p>
          </div>
        )}
      </section>
      {actionEditing && (
        <ProfessionalDialog
          title={
            actionEditing === "new"
              ? "Add development action"
              : "Edit development action"
          }
          onClose={() => setActionEditing(null)}
        >
          <form onSubmit={saveAction}>
            <div className="professional-modal-body">
              <label className="field">
                Action title
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={actionDraft.title}
                  onChange={(event) =>
                    setActionDraft({
                      ...actionDraft,
                      title: event.target.value,
                    })
                  }
                  placeholder="A clear training, mentoring, or responsibility step"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Person
                  <select
                    required={actionEditing === "new"}
                    value={actionDraft.memberId}
                    onChange={(event) =>
                      setActionDraft({
                        ...actionDraft,
                        memberId: event.target.value,
                      })
                    }
                  >
                    <option value="">Not linked</option>
                    {state.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Development kind
                  <select
                    value={actionDraft.kind}
                    onChange={(event) =>
                      setActionDraft({
                        ...actionDraft,
                        kind: event.target.value as DevelopmentAction["kind"],
                      })
                    }
                  >
                    <option>Training</option>
                    <option>Mentoring</option>
                    <option>Feedback</option>
                    <option>Responsibility</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  Development due date
                  <input
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={actionDraft.dueDate}
                    onChange={(event) => {
                      setActionDraft({
                        ...actionDraft,
                        dueDate: event.target.value,
                      });
                      setError("");
                    }}
                  />
                </label>
                <label className="field">
                  Development status
                  <select
                    value={actionDraft.status}
                    onChange={(event) =>
                      setActionDraft({
                        ...actionDraft,
                        status: event.target
                          .value as DevelopmentAction["status"],
                      })
                    }
                  >
                    <option>Planned</option>
                    <option>In progress</option>
                    <option>Complete</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Action notes
                <textarea
                  maxLength={5000}
                  value={actionDraft.notes}
                  onChange={(event) =>
                    setActionDraft({
                      ...actionDraft,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Desired outcome, useful preparation, and the agreed next step"
                />
              </label>
              <label className="field">
                Tasker connection
                <select
                  value={taskConnection}
                  onChange={(event) =>
                    setTaskConnection(
                      event.target.value as typeof taskConnection,
                    )
                  }
                >
                  <option value="none">No linked tasker</option>
                  <option value="create">Create a linked tasker</option>
                  <option value="existing">Link an existing tasker</option>
                </select>
              </label>
              {taskConnection === "existing" && (
                <label className="field">
                  Linked tasker
                  <select
                    required
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                  >
                    <option value="">Choose a tasker</option>
                    {state.tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {taskConnection !== "none" && (
                <p className="small muted">
                  The linked tasker follows this action's title, due date,
                  assignee, and completion state when you save. You can schedule
                  its time in Work &amp; taskers.
                </p>
              )}
              {taskConnection === "none" &&
                actionEditing !== "new" &&
                actionEditing.taskId && (
                  <p className="small muted">
                    The existing tasker will remain in your work plan with this
                    action link removed.
                  </p>
                )}
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
                onClick={() => setActionEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save development action
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {planEditing && (
        <ProfessionalDialog
          title={
            planEditing === "new"
              ? "Add preparation plan"
              : "Edit preparation plan"
          }
          onClose={() => setPlanEditing(null)}
        >
          <form onSubmit={savePlan}>
            <div className="professional-modal-body">
              <label className="field">
                Preparation title
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={planDraft.title}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, title: event.target.value })
                  }
                  placeholder="A standards, support, or follow-up conversation"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Person
                  <select
                    required={planEditing === "new"}
                    value={planDraft.memberId}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        memberId: event.target.value,
                      })
                    }
                  >
                    <option value="">Not linked</option>
                    {state.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Preparation follow-up date
                  <input
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={planDraft.followUpDate}
                    onChange={(event) => {
                      setPlanDraft({
                        ...planDraft,
                        followUpDate: event.target.value,
                      });
                      setError("");
                    }}
                  />
                </label>
              </div>
              <label className="field">
                Standard or expectation
                <textarea
                  maxLength={3000}
                  value={planDraft.expectation}
                  onChange={(event) =>
                    setPlanDraft({
                      ...planDraft,
                      expectation: event.target.value,
                    })
                  }
                  placeholder="What standard should be clarified and communicated?"
                />
              </label>
              <label className="field">
                General observed gap
                <textarea
                  maxLength={3000}
                  value={planDraft.observedGap}
                  onChange={(event) =>
                    setPlanDraft({
                      ...planDraft,
                      observedGap: event.target.value,
                    })
                  }
                  placeholder="A general performance or support concern; keep official case details in authorized systems"
                />
              </label>
              <label className="field">
                Support &amp; improvement plan
                <textarea
                  maxLength={5000}
                  value={planDraft.supportPlan}
                  onChange={(event) =>
                    setPlanDraft({
                      ...planDraft,
                      supportPlan: event.target.value,
                    })
                  }
                  placeholder="What training, resources, or clarification could help meet the standard?"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Consultation status
                  <select
                    value={planDraft.consultation}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        consultation: event.target
                          .value as DisciplinePlan["consultation"],
                      })
                    }
                  >
                    <option>Not started</option>
                    <option>Requested</option>
                    <option>Completed</option>
                  </select>
                </label>
                <label className="field">
                  Preparation status
                  <select
                    value={planDraft.status}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        status: event.target.value as DisciplinePlan["status"],
                      })
                    }
                  >
                    <option>Open</option>
                    <option>Monitoring</option>
                    <option>Closed</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Consultation &amp; follow-on questions
                <textarea
                  maxLength={5000}
                  value={planDraft.notes}
                  onChange={(event) =>
                    setPlanDraft({ ...planDraft, notes: event.target.value })
                  }
                  placeholder="Who should review the next step? What effects on the individual, unit, mission, or other programs need qualified review?"
                />
              </label>
              <p className="small muted">
                Preparation notes only. This plan records your
                standards-and-support conversation; it is not an official
                disciplinary record or a decision about consequences.
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
                onClick={() => setPlanEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save preparation plan
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deleteAction && (
        <ProfessionalDialog
          title="Delete development action?"
          onClose={() => setDeleteAction(null)}
        >
          <p>
            This removes “{deleteAction.title}” and its linked calendar event.
            Any tasker remains in your work plan.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteAction(null)}
            >
              Keep action
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) =>
                  removePlannerRecord(
                    next,
                    "developmentActions",
                    deleteAction.id,
                  ),
                );
                setDeleteAction(null);
              }}
            >
              Delete action
            </button>
          </div>
        </ProfessionalDialog>
      )}
      {deletePlan && (
        <ProfessionalDialog
          title="Delete preparation plan?"
          onClose={() => setDeletePlan(null)}
        >
          <p>
            This removes “{deletePlan.title}”, its preparation notes, and its
            linked calendar follow-up.
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
                  removePlannerRecord(next, "disciplinePlans", deletePlan.id),
                );
                setDeletePlan(null);
              }}
            >
              Delete preparation plan
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
