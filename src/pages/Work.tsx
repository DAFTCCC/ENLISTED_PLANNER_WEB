import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Flag,
  FolderKanban,
  ListChecks,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { addDays, formatDate, localDate, minutes } from "../lib/dates";
import { durationLabel } from "../lib/time-blocks";
import { removePlannerRecord } from "../lib/relationships";
import {
  buildRhythmPlan,
  dependencyError,
  isTaskOverdue,
  projectProgress,
  taskBlockers,
  taskCompletionError,
  taskStatus,
  workSummary,
} from "../lib/workflow";
import type { BattleRhythm, Meeting, Project, Task } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import "./professional.css";
import "./work.css";

type Tab = "projects" | "taskers" | "meetings" | "rhythm";
type DeleteTarget = {
  kind: "projects" | "tasks" | "meetings" | "battleRhythms";
  id: string;
  title: string;
};
const tabs: { id: Tab; label: string; icon: typeof FolderKanban }[] = [
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "taskers", label: "Taskers", icon: ListChecks },
  { id: "meetings", label: "Meetings", icon: Users },
  { id: "rhythm", label: "Battle rhythm", icon: Repeat2 },
];
const majorAreas: BattleRhythm["mga"][] = [
  "Executing the Mission",
  "Leading People",
  "Managing Resources",
  "Improving the Unit",
];
const frequencies: BattleRhythm["frequency"][] = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Yearly",
];
const projectStatuses: Project["status"][] = [
  "Planned",
  "Active",
  "On hold",
  "Complete",
];
const taskStatuses = ["Open", "In progress", "Blocked", "Done"] as const;
const dateLimits = { min: "0001-01-01", max: "9999-12-31" };

function validDate(date: string, optional = true) {
  if (!date && optional) return true;
  try {
    formatDate(date);
    return true;
  } catch {
    return false;
  }
}
function dateLabel(date: string) {
  return date ? formatDate(date) : "No deadline";
}
function safeRangeEnd(date: string) {
  try {
    return addDays(date, 90);
  } catch {
    return "9999-12-31";
  }
}
function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    title: "",
    objective: "",
    startDate: localDate(),
    dueDate: "",
    status: "Planned",
    ownerId: "",
    objectiveId: "",
    resources: "",
    risks: "",
    successMeasure: "",
    baseline: "",
    target: "",
    actual: "",
    notes: "",
    swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
  };
}
function newTask(): Task {
  return {
    id: crypto.randomUUID(),
    title: "",
    date: localDate(),
    priority: "Normal",
    completed: false,
    status: "Open",
    projectId: "",
    assigneeId: "",
    objectiveId: "",
    meetingId: "",
    requestor: "",
    suspenseTime: "",
    dependencyIds: [],
    notes: "",
    estimatedMinutes: 30,
    kind: "Task",
  };
}
function newMeeting(): Meeting {
  return {
    id: crypto.randomUUID(),
    title: "",
    date: localDate(),
    time: "",
    objective: "",
    participants: [],
    agenda: "",
    decisions: "",
    nextDate: "",
    notes: "",
  };
}
function newRhythm(): BattleRhythm {
  return {
    id: crypto.randomUUID(),
    title: "",
    mga: "Executing the Mission",
    frequency: "Weekly",
    startDate: localDate(),
    startTime: "09:00",
    endTime: "09:30",
    category: "Duty",
    notes: "",
  };
}
function NotesField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={10000}
        placeholder={placeholder}
        rows={3}
        required={required}
      />
    </label>
  );
}
function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="work-detail">
      <span>{title}</span>
      <div>{children || <span className="muted">Not recorded</span>}</div>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FolderKanban;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="panel work-empty">
      <Icon size={31} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function Work({
  onOpenDay,
}: {
  onOpenDay: (date: string, taskId?: string) => void;
}) {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [tab, setTab] = useState<Tab>("projects");
  const [projectDraft, setProjectDraft] = useState<Project | null>(null);
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [meetingDraft, setMeetingDraft] = useState<Meeting | null>(null);
  const [rhythmDraft, setRhythmDraft] = useState<BattleRhythm | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [generating, setGenerating] = useState<BattleRhythm | null>(null);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(safeRangeEnd(today));
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("Active");
  const [projectFilter, setProjectFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [meetingFilter, setMeetingFilter] = useState("All");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const summary = workSummary(state.tasks, today, clock);
  const rhythmPlan = useMemo(
    () =>
      generating
        ? buildRhythmPlan(generating, rangeFrom, rangeTo, state.blocks)
        : null,
    [generating, rangeFrom, rangeTo, state.blocks],
  );
  const memberName = (id?: string) =>
    state.members.find((member) => member.id === id)?.name || "Unassigned";
  const memberOptions = state.members.map((member) => (
    <option value={member.id} key={member.id}>
      {member.rank ? `${member.rank} ` : ""}
      {member.name}
    </option>
  ));
  const projectOptions = state.projects.map((project) => (
    <option value={project.id} key={project.id}>
      {project.title}
    </option>
  ));
  const objectiveOptions = state.objectives.map((objective) => (
    <option value={objective.id} key={objective.id}>
      {objective.level} · {objective.title}
    </option>
  ));
  const taskers = [...state.tasks]
    .filter((task) => {
      const status = taskStatus(task);
      if (taskFilter === "Active" && status === "Done") return false;
      if (taskFilter === "Overdue" && !isTaskOverdue(task, today, clock))
        return false;
      if (
        taskFilter === "Blocked" &&
        !(
          status === "Blocked" ||
          (status !== "Done" && taskBlockers(task, state.tasks).length)
        )
      )
        return false;
      if (
        ["Open", "In progress", "Done"].includes(taskFilter) &&
        status !== taskFilter
      )
        return false;
      return (
        (!projectFilter || task.projectId === projectFilter) &&
        (ownerFilter === "all" || (task.assigneeId || "") === ownerFilter) &&
        `${task.title} ${task.requestor ?? ""} ${task.notes ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort(
      (a, b) =>
        Number(taskStatus(a) === "Done") - Number(taskStatus(b) === "Done") ||
        Number(isTaskOverdue(b, today, clock)) -
          Number(isTaskOverdue(a, today, clock)) ||
        { High: 0, Normal: 1, Low: 2 }[a.priority] -
          { High: 0, Normal: 1, Low: 2 }[b.priority] ||
        (a.date || "9999").localeCompare(b.date || "9999"),
    );
  const meetings = [...state.meetings]
    .filter(
      (meeting) =>
        meetingFilter === "All" ||
        (meetingFilter === "Upcoming"
          ? meeting.date >= today
          : meeting.date < today),
    )
    .sort(
      (a, b) =>
        Number(b.date >= today) - Number(a.date >= today) ||
        (a.date >= today
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date)) ||
        a.time.localeCompare(b.time),
    );
  const workloadOwners = [
    ...new Set(
      state.tasks
        .filter((task) => taskStatus(task) !== "Done")
        .map((task) => task.assigneeId || ""),
    ),
  ];

  function addTask(projectId = "", meetingId = "") {
    setError("");
    const meeting = state.meetings.find((item) => item.id === meetingId);
    setTaskDraft({
      ...newTask(),
      projectId,
      meetingId,
      requestor: meeting ? `Meeting: ${meeting.title}` : "",
      date:
        meeting?.nextDate && meeting.nextDate >= today
          ? meeting.nextDate
          : today,
    });
  }
  function toggleTask(task: Task) {
    if (taskStatus(task) !== "Done") {
      const issue = taskCompletionError(task, state.tasks);
      if (issue) {
        setNotice({ text: issue, error: true });
        return;
      }
    }
    mutate((draft) => {
      const item = draft.tasks.find((item) => item.id === task.id);
      if (item) {
        item.completed = taskStatus(task) !== "Done";
        item.status = item.completed ? "Done" : "Open";
      }
    });
  }
  function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!projectDraft) return;
    if (!projectDraft.title.trim() || !projectDraft.objective.trim()) {
      setError("Add a project title and a clear objective.");
      return;
    }
    if (
      !validDate(projectDraft.startDate) ||
      !validDate(projectDraft.dueDate)
    ) {
      setError("Choose valid project dates.");
      return;
    }
    if (
      projectDraft.startDate &&
      projectDraft.dueDate &&
      projectDraft.dueDate < projectDraft.startDate
    ) {
      setError("The due date must be on or after the start date.");
      return;
    }
    if (
      (projectDraft.ownerId &&
        !state.members.some((member) => member.id === projectDraft.ownerId)) ||
      (projectDraft.objectiveId &&
        !state.objectives.some(
          (objective) => objective.id === projectDraft.objectiveId,
        ))
    ) {
      setError(
        "A selected POC or strategic objective no longer exists. Update the selection.",
      );
      return;
    }
    const saved = {
      ...projectDraft,
      title: projectDraft.title.trim(),
      objective: projectDraft.objective.trim(),
    };
    mutate((draft) => {
      const index = draft.projects.findIndex(
        (project) => project.id === saved.id,
      );
      if (index < 0) draft.projects.push(saved);
      else draft.projects[index] = saved;
    });
    setProjectDraft(null);
    setNotice({
      text: "Project saved. Add taskers to turn the objective into a work plan.",
    });
  }
  function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!taskDraft) return;
    if (!taskDraft.title.trim()) {
      setError("Give your tasker a title.");
      return;
    }
    if (
      !validDate(taskDraft.date) ||
      (taskDraft.suspenseTime &&
        (!taskDraft.date ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(taskDraft.suspenseTime)))
    ) {
      setError(
        "Choose a valid deadline date and suspense time, or leave both optional fields blank.",
      );
      return;
    }
    if (
      !Number.isFinite(taskDraft.estimatedMinutes) ||
      (taskDraft.estimatedMinutes ?? 0) < 0
    ) {
      setError(
        "Estimated effort must be a finite number of minutes, zero or greater.",
      );
      return;
    }
    const references = [
      [taskDraft.projectId, state.projects],
      [taskDraft.assigneeId, state.members],
      [taskDraft.objectiveId, state.objectives],
      [taskDraft.meetingId, state.meetings],
    ] as const;
    if (
      references.some(
        ([id, records]) => id && !records.some((record) => record.id === id),
      )
    ) {
      setError(
        "A linked project, person, objective, or meeting no longer exists. Update the selection.",
      );
      return;
    }
    const issue =
      dependencyError(taskDraft, state.tasks) ||
      (taskDraft.status === "Done"
        ? taskCompletionError(taskDraft, state.tasks)
        : null);
    if (issue) {
      setError(issue);
      return;
    }
    const saved = {
      ...taskDraft,
      title: taskDraft.title.trim(),
      completed: taskDraft.status === "Done",
    };
    mutate((draft) => {
      const index = draft.tasks.findIndex((task) => task.id === saved.id);
      if (index < 0) draft.tasks.push(saved);
      else draft.tasks[index] = saved;
    });
    setTaskDraft(null);
    setNotice({
      text: saved.meetingId
        ? "Meeting action saved and connected to Taskers."
        : "Tasker saved. Give it time in your day when you are ready.",
    });
  }
  function saveMeeting(event: FormEvent) {
    event.preventDefault();
    if (!meetingDraft) return;
    if (
      !meetingDraft.title.trim() ||
      !validDate(meetingDraft.date, false) ||
      !validDate(meetingDraft.nextDate)
    ) {
      setError("Add a meeting title and valid meeting dates.");
      return;
    }
    if (
      meetingDraft.time &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingDraft.time)
    ) {
      setError("Choose a valid meeting time, or leave it blank.");
      return;
    }
    if (meetingDraft.nextDate && meetingDraft.nextDate < meetingDraft.date) {
      setError("The next meeting date must be on or after this meeting.");
      return;
    }
    const saved = {
      ...meetingDraft,
      title: meetingDraft.title.trim(),
      participants: meetingDraft.participants
        .map((name) => name.trim())
        .filter(Boolean),
    };
    mutate((draft) => {
      const index = draft.meetings.findIndex(
        (meeting) => meeting.id === saved.id,
      );
      if (index < 0) draft.meetings.push(saved);
      else draft.meetings[index] = saved;
    });
    setMeetingDraft(null);
    setNotice({
      text: "Meeting saved. Its date is connected to Calendar; record next steps as actions.",
    });
  }
  function saveRhythm(event: FormEvent) {
    event.preventDefault();
    if (!rhythmDraft) return;
    const check = buildRhythmPlan(
      rhythmDraft,
      rhythmDraft.startDate,
      rhythmDraft.startDate,
      [],
    );
    if (check.error) {
      setError(check.error);
      return;
    }
    const saved = { ...rhythmDraft, title: rhythmDraft.title.trim() };
    mutate((draft) => {
      const index = draft.battleRhythms.findIndex(
        (rhythm) => rhythm.id === saved.id,
      );
      if (index < 0) draft.battleRhythms.push(saved);
      else draft.battleRhythms[index] = saved;
    });
    setRhythmDraft(null);
    setNotice({
      text: "Battle rhythm saved. Generate time blocks for the date range you want to plan.",
    });
  }
  function generateBlocks() {
    if (
      !generating ||
      !rhythmPlan ||
      rhythmPlan.error ||
      !rhythmPlan.blocks.length
    )
      return;
    mutate((draft) => {
      const current = draft.battleRhythms.find(
        (rhythm) => rhythm.id === generating.id,
      );
      if (current)
        draft.blocks.push(
          ...buildRhythmPlan(current, rangeFrom, rangeTo, draft.blocks).blocks,
        );
    });
    setNotice({
      text: `${rhythmPlan.blocks.length} time blocks generated. ${rhythmPlan.skipped.length ? `${rhythmPlan.skipped.length} unavailable or already generated dates were skipped.` : "Review them in Day plan or Calendar."}`,
    });
    setGenerating(null);
  }
  function taskView(filter: string, project = "") {
    setTab("taskers");
    setTaskFilter(filter);
    setProjectFilter(project);
    setOwnerFilter("all");
    setQuery("");
  }

  return (
    <div className="work-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TURN INTENT INTO ACTION</p>
          <h1>Work &amp; mission</h1>
          <p className="muted">
            Clear objectives. Accountable next steps. A rhythm your team can
            sustain.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setError("");
            if (tab === "projects") setProjectDraft(newProject());
            if (tab === "taskers") addTask();
            if (tab === "meetings") setMeetingDraft(newMeeting());
            if (tab === "rhythm") setRhythmDraft(newRhythm());
          }}
        >
          <Plus size={17} />
          {tab === "projects"
            ? "Add project"
            : tab === "taskers"
              ? "Add tasker"
              : tab === "meetings"
                ? "Add meeting"
                : "Add rhythm"}
        </button>
      </div>
      <div className="work-summary">
        <button onClick={() => taskView("Active")}>
          <span className="work-stat-icon">
            <ListChecks size={19} />
          </span>
          <div>
            <span>Open actions</span>
            <strong>{summary.open}</strong>
          </div>
        </button>
        <button onClick={() => taskView("Overdue")}>
          <span className="work-stat-icon work-gold">
            <Flag size={19} />
          </span>
          <div>
            <span>Overdue suspenses</span>
            <strong>{summary.overdue}</strong>
          </div>
        </button>
        <button onClick={() => taskView("Blocked")}>
          <span className="work-stat-icon work-rose">
            <AlertTriangle size={19} />
          </span>
          <div>
            <span>Blocked actions</span>
            <strong>{summary.blocked}</strong>
          </div>
        </button>
        <div>
          <span className="work-stat-icon work-green">
            <Clock3 size={19} />
          </span>
          <div>
            <span>Estimated effort remaining</span>
            <strong>{durationLabel(summary.estimatedMinutes)}</strong>
          </div>
        </div>
      </div>
      <div
        className="work-tabs"
        role="tablist"
        aria-label="Work planning tools"
      >
        {tabs.map((item, index) => (
          <button
            id={`work-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`work-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              setTab(tabs[next].id);
              document.getElementById(`work-tab-${tabs[next].id}`)?.focus();
            }}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {notice && (
        <div
          className={`work-notice${notice.error ? " is-error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss work message"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <section
        id={`work-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`work-tab-${tab}`}
        className="work-panel"
      >
        {tab === "projects" && (
          <>
            <div className="work-section-intro">
              <h2>Projects with a purpose</h2>
              <p className="muted small">
                Define the outcome, identify resources and risks, and connect
                the taskers that get you there.
              </p>
            </div>
            {state.projects.length ? (
              <div className="work-project-grid">
                {state.projects.map((project) => {
                  const progress = projectProgress(project.id, state.tasks);
                  const openTasks = state.tasks.filter(
                    (task) =>
                      task.projectId === project.id &&
                      taskStatus(task) !== "Done",
                  );
                  return (
                    <article className="panel work-project" key={project.id}>
                      <div className="work-card-top">
                        <span
                          className={`badge work-status status-${project.status.toLowerCase().replaceAll(" ", "-")}`}
                        >
                          {project.status}
                        </span>
                        <div className="work-card-actions">
                          <button
                            className="icon-button"
                            aria-label={`Edit project: ${project.title}`}
                            onClick={() => {
                              setError("");
                              setProjectDraft(structuredClone(project));
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete project: ${project.title}`}
                            onClick={() =>
                              setDeleting({
                                kind: "projects",
                                id: project.id,
                                title: project.title,
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <h3>{project.title}</h3>
                      <p className="work-objective">{project.objective}</p>
                      <div className="work-meta">
                        <span>
                          <Users size={13} />
                          {memberName(project.ownerId)}
                        </span>
                        <span>
                          <CalendarDays size={13} />
                          {dateLabel(project.dueDate)}
                        </span>
                        {project.dueDate &&
                          project.dueDate < today &&
                          project.status !== "Complete" && (
                            <span className="work-overdue">Target passed</span>
                          )}
                      </div>
                      <div className="work-project-progress">
                        <div>
                          <span>
                            {progress.done} of {progress.total} taskers complete
                          </span>
                          <strong>{progress.percent}%</strong>
                        </div>
                        <progress
                          value={progress.done}
                          max={progress.total || 1}
                          aria-label={`${project.title}: ${progress.done} of ${progress.total} taskers complete`}
                        />
                      </div>
                      <div className="work-project-numbers">
                        <span>{progress.milestones} milestones</span>
                        <span>
                          {durationLabel(progress.estimatedMinutes)} estimated
                          work left
                        </span>
                      </div>
                      {project.status === "Complete" &&
                        openTasks.length > 0 && (
                          <p className="work-inline-warning">
                            Completion declared; {openTasks.length} linked
                            actions still need attention.
                          </p>
                        )}
                      <details className="work-disclosure">
                        <summary>Resources, measures &amp; SWOT</summary>
                        <div className="work-detail-grid">
                          <Detail title="Start date">
                            {project.startDate
                              ? formatDate(project.startDate)
                              : ""}
                          </Detail>
                          <Detail title="Aligned objective">
                            {
                              state.objectives.find(
                                (objective) =>
                                  objective.id === project.objectiveId,
                              )?.title
                            }
                          </Detail>
                          <Detail title="Resources & ideas">
                            {project.resources}
                          </Detail>
                          <Detail title="Risks & obstacles">
                            {project.risks}
                          </Detail>
                          <Detail title="Success measure">
                            {project.successMeasure}
                          </Detail>
                          <Detail title="Baseline / target / actual">{`Baseline: ${project.baseline || "Not recorded"} · Target: ${project.target || "Not recorded"} · Actual: ${project.actual || "Not recorded"}`}</Detail>
                        </div>
                        <div className="work-swot-grid">
                          {(
                            [
                              "strengths",
                              "weaknesses",
                              "opportunities",
                              "threats",
                            ] as const
                          ).map((key) => (
                            <Detail title={key} key={key}>
                              {project.swot[key]}
                            </Detail>
                          ))}
                        </div>
                        {project.notes && (
                          <Detail title="Planning notes">
                            {project.notes}
                          </Detail>
                        )}
                      </details>
                      <div className="work-card-footer">
                        <button
                          className="button secondary"
                          onClick={() => addTask(project.id)}
                        >
                          <Plus size={15} />
                          Add tasker
                        </button>
                        <button
                          className="button ghost"
                          onClick={() => taskView("All", project.id)}
                        >
                          View work plan <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={FolderKanban}
                title="Give the next mission a clear plan"
              >
                Start with an objective, a POC, and the date you want to
                deliver. Add taskers and milestones as the plan takes shape.
              </Empty>
            )}
          </>
        )}

        {tab === "taskers" && (
          <>
            <div className="work-section-intro">
              <h2>Taskers &amp; next actions</h2>
              <p className="muted small">
                Track who owns the work, what it depends on, and when it needs
                to be delivered.
              </p>
            </div>
            <div className="work-task-filters">
              <label className="field work-search">
                Search taskers
                <div>
                  <Search size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Title, requestor, or notes"
                  />
                </div>
              </label>
              <label className="field">
                Status
                <select
                  value={taskFilter}
                  onChange={(event) => setTaskFilter(event.target.value)}
                >
                  {[
                    "Active",
                    "All",
                    "Open",
                    "In progress",
                    "Blocked",
                    "Overdue",
                    "Done",
                  ].map((filter) => (
                    <option key={filter}>{filter}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Project
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                >
                  <option value="">All projects</option>
                  {projectOptions}
                </select>
              </label>
              <label className="field">
                POC
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                >
                  <option value="all">All people</option>
                  <option value="">Unassigned</option>
                  {memberOptions}
                </select>
              </label>
            </div>
            <div className="work-task-layout">
              <section
                className="panel work-task-list"
                aria-label="Tasker list"
              >
                {taskers.length ? (
                  taskers.map((task) => {
                    const status = taskStatus(task),
                      blockers = taskBlockers(task, state.tasks),
                      overdue = isTaskOverdue(task, today, clock);
                    const project = state.projects.find(
                      (project) => project.id === task.projectId,
                    );
                    return (
                      <article
                        className={`work-task${status === "Done" ? " is-done" : ""}`}
                        key={task.id}
                      >
                        <label className="work-task-checkbox">
                          <input
                            type="checkbox"
                            checked={status === "Done"}
                            aria-label={`${status === "Done" ? "Reopen" : "Complete"} tasker: ${task.title}`}
                            onChange={() => toggleTask(task)}
                          />
                        </label>
                        <div className="work-task-main">
                          <div className="work-task-title">
                            <h3>{task.title}</h3>
                            {task.kind === "Milestone" && (
                              <span className="badge">
                                <Target size={10} />
                                Milestone
                              </span>
                            )}
                            <span
                              className={`work-priority priority-${task.priority.toLowerCase()}`}
                            >
                              {task.priority}
                            </span>
                          </div>
                          <div className="work-meta">
                            <span>{status}</span>
                            <span>
                              <Users size={12} />
                              {memberName(task.assigneeId)}
                            </span>
                            <span className={overdue ? "work-overdue" : ""}>
                              <CalendarDays size={12} />
                              {dateLabel(task.date)}
                              {task.suspenseTime
                                ? ` · ${task.suspenseTime}`
                                : ""}
                              {overdue ? " · Overdue" : ""}
                            </span>
                            {project && <span>{project.title}</span>}
                            {task.estimatedMinutes ? (
                              <span>
                                {durationLabel(task.estimatedMinutes)} estimated
                              </span>
                            ) : null}
                          </div>
                          {blockers.length > 0 && status !== "Done" && (
                            <p className="work-blockers">
                              <AlertTriangle size={13} />
                              Waiting for:{" "}
                              {blockers
                                .map((blocker) => blocker.title)
                                .join(", ")}
                            </p>
                          )}
                          {task.requestor && (
                            <p className="work-requestor">
                              Requested by {task.requestor}
                            </p>
                          )}
                          {(task.notes ||
                            task.meetingId ||
                            task.objectiveId ||
                            task.careerPlanId) && (
                            <details className="work-task-notes">
                              {" "}
                              <summary>Notes &amp; connections</summary>
                              <p>{task.notes}</p>
                              {task.meetingId && (
                                <p className="small muted">
                                  Meeting:{" "}
                                  {state.meetings.find(
                                    (meeting) => meeting.id === task.meetingId,
                                  )?.title || "Unlinked"}
                                </p>
                              )}
                              {task.careerPlanId && (
                                <p className="small muted">
                                  Career plan:{" "}
                                  {state.careerPlans.find(
                                    (plan) => plan.id === task.careerPlanId,
                                  )?.title || "Unlinked"}
                                </p>
                              )}
                              {task.objectiveId && (
                                <p className="small muted">
                                  Objective:{" "}
                                  {state.objectives.find(
                                    (objective) =>
                                      objective.id === task.objectiveId,
                                  )?.title || "Unlinked"}
                                </p>
                              )}
                            </details>
                          )}
                          <div className="work-task-schedule">
                            <button
                              className="text-button"
                              disabled={status === "Done"}
                              aria-label={`Schedule tasker: ${task.title}`}
                              onClick={() => {
                                const linked = state.blocks
                                  .filter((block) => block.taskId === task.id)
                                  .sort((a, b) => a.date.localeCompare(b.date));
                                const scheduled =
                                  linked.find((block) => block.date >= today) ||
                                  linked[linked.length - 1];
                                if (scheduled) onOpenDay(scheduled.date);
                                else
                                  onOpenDay(
                                    task.date && task.date >= today
                                      ? task.date
                                      : today,
                                    task.id,
                                  );
                              }}
                            >
                              <Clock3 size={13} />
                              {state.blocks.some(
                                (block) => block.taskId === task.id,
                              )
                                ? "Review scheduled work"
                                : "Give it time in your day"}
                              <ArrowUpRight size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="work-card-actions">
                          <button
                            className="icon-button"
                            aria-label={`Edit tasker: ${task.title}`}
                            onClick={() => {
                              setError("");
                              setTaskDraft({
                                ...newTask(),
                                ...task,
                                status,
                                dependencyIds: [...(task.dependencyIds ?? [])],
                              });
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete tasker: ${task.title}`}
                            onClick={() =>
                              setDeleting({
                                kind: "tasks",
                                id: task.id,
                                title: task.title,
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="work-empty-inline">
                    <ListChecks size={27} />
                    <h3>
                      {state.tasks.length
                        ? "No taskers in this view"
                        : "Start with the next useful action"}
                    </h3>
                    <p>
                      {state.tasks.length
                        ? "Choose All or adjust your filters to see more taskers."
                        : "Add a tasker, identify the POC and suspense, then make room for the work in Day plan."}
                    </p>
                    {state.tasks.length > 0 && (
                      <button
                        className="button secondary"
                        onClick={() => taskView("All")}
                      >
                        Show all taskers
                      </button>
                    )}
                  </div>
                )}
              </section>
              <aside className="work-workload">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Workload by POC</h2>
                    <BriefcaseBusiness size={17} />
                  </div>
                  <p className="small muted">
                    Open actions and entered effort estimates. Scheduling adds
                    time blocks to the daily planner.
                  </p>
                  {workloadOwners.length ? (
                    workloadOwners.map((owner) => {
                      const owned = state.tasks.filter(
                        (task) =>
                          (task.assigneeId || "") === owner &&
                          taskStatus(task) !== "Done",
                      );
                      const estimate = owned.reduce(
                        (total, task) => total + (task.estimatedMinutes ?? 0),
                        0,
                      );
                      const scheduled = state.blocks
                        .filter(
                          (block) =>
                            !block.completed &&
                            owned.some((task) => task.id === block.taskId),
                        )
                        .reduce(
                          (total, block) =>
                            total + minutes(block.end) - minutes(block.start),
                          0,
                        );
                      return (
                        <button
                          className="work-owner"
                          key={owner || "unassigned"}
                          onClick={() => {
                            setOwnerFilter(owner);
                            setTaskFilter("Active");
                            setProjectFilter("");
                            setQuery("");
                          }}
                        >
                          <span>{memberName(owner)}</span>
                          <strong>{owned.length} actions</strong>
                          <small>
                            {durationLabel(estimate)} estimated ·{" "}
                            {durationLabel(scheduled)} scheduled
                          </small>
                        </button>
                      );
                    })
                  ) : (
                    <p className="small muted">
                      No open taskers. A little room for the next priority.
                    </p>
                  )}
                </section>
                <section className="panel work-prerequisite-note">
                  <AlertTriangle size={20} />
                  <h3>Unblock the next step</h3>
                  <p className="small muted">
                    Prerequisites create a clear sequence. Complete the named
                    prerequisite taskers before marking a dependent action done.
                  </p>
                  <p className="small muted">
                    A manual Blocked status can record another hold. Add the
                    reason in Notes so the next conversation is useful.
                  </p>
                </section>
              </aside>
            </div>
          </>
        )}

        {tab === "meetings" && (
          <>
            <div className="work-section-heading">
              <div className="work-section-intro">
                <h2>Meetings that move work forward</h2>
                <p className="muted small">
                  Prepare an objective and agenda. Leave with decisions, owners,
                  and a next step.
                </p>
              </div>
              <label className="field">
                Show meetings
                <select
                  value={meetingFilter}
                  onChange={(event) => setMeetingFilter(event.target.value)}
                >
                  <option>All</option>
                  <option>Upcoming</option>
                  <option>Past</option>
                </select>
              </label>
            </div>
            {meetings.length ? (
              <div className="work-meeting-grid">
                {meetings.map((meeting) => {
                  const actions = state.tasks.filter(
                    (task) => task.meetingId === meeting.id,
                  );
                  return (
                    <article className="panel work-meeting" key={meeting.id}>
                      <div className="work-card-top">
                        <span className="work-meeting-date">
                          <CalendarDays size={15} />
                          {formatDate(meeting.date)}
                          {meeting.time ? ` · ${meeting.time}` : ""}
                        </span>
                        <div className="work-card-actions">
                          <button
                            className="icon-button"
                            aria-label={`Edit meeting: ${meeting.title}`}
                            onClick={() => {
                              setError("");
                              setMeetingDraft(structuredClone(meeting));
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete meeting: ${meeting.title}`}
                            onClick={() =>
                              setDeleting({
                                kind: "meetings",
                                id: meeting.id,
                                title: meeting.title,
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <h3>{meeting.title}</h3>
                      <p className="work-objective">
                        {meeting.objective ||
                          "Add an objective to keep this conversation focused."}
                      </p>
                      {meeting.participants.length > 0 && (
                        <p className="work-participants">
                          <Users size={13} />
                          {meeting.participants.join(" · ")}
                        </p>
                      )}
                      <details className="work-disclosure">
                        <summary>Agenda, decisions &amp; notes</summary>
                        <Detail title="Agenda">{meeting.agenda}</Detail>
                        <Detail title="Decisions">{meeting.decisions}</Detail>
                        <Detail title="Notes">{meeting.notes}</Detail>
                      </details>
                      <div className="work-meeting-actions">
                        <div>
                          <h4>Next actions</h4>
                          <span>
                            {
                              actions.filter(
                                (action) => taskStatus(action) === "Done",
                              ).length
                            }
                            /{actions.length} complete
                          </span>
                        </div>
                        {actions.map((action) => (
                          <div className="work-meeting-action" key={action.id}>
                            <input
                              type="checkbox"
                              checked={taskStatus(action) === "Done"}
                              aria-label={`${taskStatus(action) === "Done" ? "Reopen" : "Complete"} meeting action: ${action.title}`}
                              onChange={() => toggleTask(action)}
                            />
                            <div>
                              <strong>{action.title}</strong>
                              <span>
                                {memberName(action.assigneeId)} ·{" "}
                                {dateLabel(action.date)}
                              </span>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Edit meeting action: ${action.title}`}
                              onClick={() => {
                                setError("");
                                setTaskDraft({
                                  ...newTask(),
                                  ...action,
                                  status: taskStatus(action),
                                  dependencyIds: [
                                    ...(action.dependencyIds ?? []),
                                  ],
                                });
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        ))}
                        {!actions.length && (
                          <p className="small muted">
                            Turn an agreed next step into a linked tasker.
                          </p>
                        )}
                        <button
                          className="button secondary"
                          onClick={() => addTask("", meeting.id)}
                        >
                          <Plus size={14} />
                          Add action
                        </button>
                      </div>
                      {meeting.nextDate && (
                        <div className="work-next-meeting">
                          <span>
                            Next meeting · {formatDate(meeting.nextDate)}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setError("");
                              setMeetingDraft({
                                ...newMeeting(),
                                title: meeting.title,
                                date: meeting.nextDate,
                                time: meeting.time,
                                objective: meeting.objective,
                                participants: [...meeting.participants],
                              });
                            }}
                          >
                            Prepare follow-up <ArrowUpRight size={13} />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={Users}
                title={
                  state.meetings.length
                    ? "No meetings in this view"
                    : "Make the next conversation count"
                }
              >
                {state.meetings.length
                  ? "Choose another view to find past or upcoming meetings."
                  : "Record the objective, people, and agenda. Capture decisions and create taskers directly from your meeting notes."}
              </Empty>
            )}
          </>
        )}

        {tab === "rhythm" && (
          <>
            <div className="work-section-intro">
              <h2>A repeatable rhythm for the mission</h2>
              <p className="muted small">
                Connect recurring work to a major graded area. Preview dates and
                protect the time you have already planned.
              </p>
            </div>
            {state.battleRhythms.length ? (
              <div className="work-rhythm-list">
                {state.battleRhythms.map((rhythm) => (
                  <article className="panel work-rhythm" key={rhythm.id}>
                    <div className="work-rhythm-heading">
                      <span className="work-rhythm-icon">
                        <Repeat2 size={23} />
                      </span>
                      <div>
                        <span className="work-frequency">
                          {rhythm.frequency}
                        </span>
                        <h3>{rhythm.title}</h3>
                        <p>{rhythm.mga}</p>
                      </div>
                      <div className="work-card-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit rhythm: ${rhythm.title}`}
                          onClick={() => {
                            setError("");
                            setRhythmDraft({ ...rhythm });
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete rhythm: ${rhythm.title}`}
                          onClick={() =>
                            setDeleting({
                              kind: "battleRhythms",
                              id: rhythm.id,
                              title: rhythm.title,
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="work-meta">
                      <span>
                        <CalendarDays size={13} />
                        Anchored {formatDate(rhythm.startDate)}
                      </span>
                      <span>
                        <Clock3 size={13} />
                        {rhythm.startTime}–{rhythm.endTime}
                      </span>
                      <span>{rhythm.category}</span>
                      <span>
                        {
                          state.blocks.filter(
                            (block) => block.rhythmId === rhythm.id,
                          ).length
                        }{" "}
                        generated blocks
                      </span>
                    </div>
                    {rhythm.notes && (
                      <p className="work-rhythm-notes">{rhythm.notes}</p>
                    )}
                    <div className="work-card-footer">
                      <span className="small muted">
                        Generate an explicit date range, then edit individual
                        blocks in Day plan.
                      </span>
                      <button
                        className="button secondary"
                        aria-label={`Generate time blocks: ${rhythm.title}`}
                        onClick={() => {
                          const from =
                            rhythm.startDate > today ? rhythm.startDate : today;
                          setRangeFrom(from);
                          setRangeTo(safeRangeEnd(from));
                          setGenerating(rhythm);
                        }}
                      >
                        <CalendarDays size={15} />
                        Generate time blocks
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty icon={Repeat2} title="Build a rhythm you can sustain">
                Plan daily, weekly, monthly, quarterly, or yearly commitments.
                Generate the next date range when you are ready to make room for
                them.
              </Empty>
            )}
            <div className="work-rhythm-note">
              <CircleCheck size={18} />
              <p>
                Monthly, quarterly, and yearly rhythms keep their anchor day.
                Months without that day are skipped. Generation checks overlaps
                and previous occurrences before adding blocks.
              </p>
            </div>
          </>
        )}
      </section>

      {projectDraft && (
        <ProfessionalDialog
          title={
            state.projects.some((project) => project.id === projectDraft.id)
              ? "Edit project"
              : "Add a project"
          }
          onClose={() => setProjectDraft(null)}
        >
          <form className="work-form" onSubmit={saveProject}>
            <label className="field">
              Project title
              <input
                autoFocus
                required
                maxLength={200}
                value={projectDraft.title}
                onChange={(event) =>
                  setProjectDraft({
                    ...projectDraft,
                    title: event.target.value,
                  })
                }
                placeholder="What are you delivering?"
              />
            </label>
            <NotesField
              label="Project objective"
              value={projectDraft.objective}
              onChange={(value) =>
                setProjectDraft({ ...projectDraft, objective: value })
              }
              placeholder="The problem to solve and the benefit to your team."
              required
            />
            <div className="form-grid">
              <label className="field">
                Start date
                <input
                  type="date"
                  {...dateLimits}
                  value={projectDraft.startDate}
                  onChange={(event) =>
                    setProjectDraft({
                      ...projectDraft,
                      startDate: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Due date
                <input
                  type="date"
                  {...dateLimits}
                  min={projectDraft.startDate || dateLimits.min}
                  value={projectDraft.dueDate}
                  onChange={(event) =>
                    setProjectDraft({
                      ...projectDraft,
                      dueDate: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Project status
                <select
                  value={projectDraft.status}
                  onChange={(event) =>
                    setProjectDraft({
                      ...projectDraft,
                      status: event.target.value as Project["status"],
                    })
                  }
                >
                  {projectStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Project POC
                <select
                  value={projectDraft.ownerId}
                  onChange={(event) =>
                    setProjectDraft({
                      ...projectDraft,
                      ownerId: event.target.value,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {memberOptions}
                </select>
              </label>
            </div>
            <label className="field">
              Strategic objective
              <select
                value={projectDraft.objectiveId}
                onChange={(event) =>
                  setProjectDraft({
                    ...projectDraft,
                    objectiveId: event.target.value,
                  })
                }
              >
                <option value="">No linked objective</option>
                {objectiveOptions}
              </select>
            </label>
            <details className="work-form-details">
              <summary>Resources, risks &amp; success measures</summary>
              <NotesField
                label="Resources & ideas"
                value={projectDraft.resources}
                onChange={(value) =>
                  setProjectDraft({ ...projectDraft, resources: value })
                }
              />
              <NotesField
                label="Risks & obstacles"
                value={projectDraft.risks}
                onChange={(value) =>
                  setProjectDraft({ ...projectDraft, risks: value })
                }
              />
              <NotesField
                label="Success measure"
                value={projectDraft.successMeasure}
                onChange={(value) =>
                  setProjectDraft({ ...projectDraft, successMeasure: value })
                }
                placeholder="How will you know this project is done?"
              />
              <div className="form-grid">
                {(["baseline", "target", "actual"] as const).map((key) => (
                  <label className="field work-capitalize" key={key}>
                    {key}
                    <input
                      value={projectDraft[key]}
                      onChange={(event) =>
                        setProjectDraft({
                          ...projectDraft,
                          [key]: event.target.value,
                        })
                      }
                      maxLength={500}
                    />
                  </label>
                ))}
              </div>
            </details>
            <details className="work-form-details">
              <summary>SWOT analysis</summary>
              <p className="small muted">
                Strengths and weaknesses describe your team. Opportunities and
                threats describe its environment.
              </p>
              <div className="form-grid">
                {(
                  [
                    "strengths",
                    "weaknesses",
                    "opportunities",
                    "threats",
                  ] as const
                ).map((key) => (
                  <NotesField
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={projectDraft.swot[key]}
                    onChange={(value) =>
                      setProjectDraft({
                        ...projectDraft,
                        swot: { ...projectDraft.swot, [key]: value },
                      })
                    }
                  />
                ))}
              </div>
            </details>
            <NotesField
              label="Planning notes"
              value={projectDraft.notes}
              onChange={(value) =>
                setProjectDraft({ ...projectDraft, notes: value })
              }
            />
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setProjectDraft(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save project
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}

      {taskDraft && (
        <ProfessionalDialog
          title={
            state.tasks.some((task) => task.id === taskDraft.id)
              ? "Edit tasker"
              : taskDraft.meetingId
                ? "Add a meeting action"
                : "Add a tasker"
          }
          onClose={() => setTaskDraft(null)}
        >
          <form className="work-form" onSubmit={saveTask}>
            <label className="field">
              Tasker title
              <input
                autoFocus
                required
                maxLength={300}
                value={taskDraft.title}
                onChange={(event) =>
                  setTaskDraft({ ...taskDraft, title: event.target.value })
                }
                placeholder="A specific action or milestone."
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Action type
                <select
                  value={taskDraft.kind}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      kind: event.target.value as Task["kind"],
                    })
                  }
                >
                  <option>Task</option>
                  <option>Milestone</option>
                </select>
              </label>
              <label className="field">
                Priority
                <select
                  value={taskDraft.priority}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      priority: event.target.value as Task["priority"],
                    })
                  }
                >
                  <option>High</option>
                  <option>Normal</option>
                  <option>Low</option>
                </select>
              </label>
              <label className="field">
                Deadline date
                <input
                  type="date"
                  {...dateLimits}
                  value={taskDraft.date}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      date: event.target.value,
                      suspenseTime: event.target.value
                        ? taskDraft.suspenseTime
                        : "",
                    })
                  }
                />
              </label>
              <label className="field">
                Suspense time (optional)
                <input
                  type="time"
                  disabled={!taskDraft.date}
                  value={taskDraft.suspenseTime}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      suspenseTime: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Tasker status
                <select
                  value={taskDraft.status}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      status: event.target.value as Task["status"],
                    })
                  }
                >
                  {taskStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Estimated effort (minutes)
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={taskDraft.estimatedMinutes}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      estimatedMinutes: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                Tasker POC
                <select
                  value={taskDraft.assigneeId}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      assigneeId: event.target.value,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {memberOptions}
                </select>
              </label>
              <label className="field">
                Project
                <select
                  value={taskDraft.projectId}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      projectId: event.target.value,
                    })
                  }
                >
                  <option value="">No linked project</option>
                  {projectOptions}
                </select>
              </label>
            </div>
            <label className="field">
              Requestor
              <input
                maxLength={300}
                value={taskDraft.requestor}
                onChange={(event) =>
                  setTaskDraft({ ...taskDraft, requestor: event.target.value })
                }
                placeholder="Personal, squadron staff, a customer, or another POC."
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Strategic objective
                <select
                  value={taskDraft.objectiveId}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      objectiveId: event.target.value,
                    })
                  }
                >
                  <option value="">No linked objective</option>
                  {objectiveOptions}
                </select>
              </label>
              <label className="field">
                Source meeting
                <select
                  value={taskDraft.meetingId}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      meetingId: event.target.value,
                    })
                  }
                >
                  <option value="">No linked meeting</option>
                  {state.meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title} · {formatDate(meeting.date)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="work-prerequisites">
              <legend>Prerequisite taskers</legend>
              <p className="small muted">
                Choose the actions that must finish first. Circular dependencies
                are prevented.
              </p>
              {state.tasks.filter((task) => task.id !== taskDraft.id).length ? (
                <div>
                  {state.tasks
                    .filter((task) => task.id !== taskDraft.id)
                    .map((task) => (
                      <label key={task.id}>
                        <input
                          type="checkbox"
                          checked={
                            taskDraft.dependencyIds?.includes(task.id) ?? false
                          }
                          onChange={(event) =>
                            setTaskDraft({
                              ...taskDraft,
                              dependencyIds: event.target.checked
                                ? [...(taskDraft.dependencyIds ?? []), task.id]
                                : taskDraft.dependencyIds?.filter(
                                    (id) => id !== task.id,
                                  ),
                            })
                          }
                        />
                        <span>
                          {task.title}
                          <small>{taskStatus(task)}</small>
                        </span>
                      </label>
                    ))}
                </div>
              ) : (
                <p className="small muted">
                  Add another tasker before setting a prerequisite.
                </p>
              )}
            </fieldset>
            <NotesField
              label="Tasker notes"
              value={taskDraft.notes ?? ""}
              onChange={(value) => setTaskDraft({ ...taskDraft, notes: value })}
              placeholder="Context, delivery requirements, or the reason this work is blocked."
            />
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setTaskDraft(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save tasker
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}

      {meetingDraft && (
        <ProfessionalDialog
          title={
            state.meetings.some((meeting) => meeting.id === meetingDraft.id)
              ? "Edit meeting"
              : "Add a meeting"
          }
          onClose={() => setMeetingDraft(null)}
        >
          <form className="work-form" onSubmit={saveMeeting}>
            <label className="field">
              Meeting title
              <input
                autoFocus
                required
                maxLength={200}
                value={meetingDraft.title}
                onChange={(event) =>
                  setMeetingDraft({
                    ...meetingDraft,
                    title: event.target.value,
                  })
                }
                placeholder="The conversation you want to prepare for."
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Meeting date
                <input
                  type="date"
                  {...dateLimits}
                  required
                  value={meetingDraft.date}
                  onChange={(event) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      date: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Meeting time (optional)
                <input
                  type="time"
                  value={meetingDraft.time}
                  onChange={(event) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      time: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <NotesField
              label="Meeting objective"
              value={meetingDraft.objective}
              onChange={(value) =>
                setMeetingDraft({ ...meetingDraft, objective: value })
              }
              placeholder="What outcome requires this conversation?"
            />
            <NotesField
              label="Participants (one per line)"
              value={meetingDraft.participants.join("\n")}
              onChange={(value) =>
                setMeetingDraft({
                  ...meetingDraft,
                  participants: value.split("\n"),
                })
              }
            />
            <NotesField
              label="Meeting agenda"
              value={meetingDraft.agenda}
              onChange={(value) =>
                setMeetingDraft({ ...meetingDraft, agenda: value })
              }
              placeholder="Topics, preparation, and the decisions to make."
            />
            <NotesField
              label="Decisions & outcomes"
              value={meetingDraft.decisions}
              onChange={(value) =>
                setMeetingDraft({ ...meetingDraft, decisions: value })
              }
            />
            <NotesField
              label="Meeting notes"
              value={meetingDraft.notes}
              onChange={(value) =>
                setMeetingDraft({ ...meetingDraft, notes: value })
              }
            />
            <label className="field">
              Next meeting date
              <input
                type="date"
                {...dateLimits}
                min={meetingDraft.date || dateLimits.min}
                value={meetingDraft.nextDate}
                onChange={(event) =>
                  setMeetingDraft({
                    ...meetingDraft,
                    nextDate: event.target.value,
                  })
                }
              />
            </label>
            <p className="small muted">
              After saving, add linked action taskers with an owner and
              deadline. Meeting dates appear in Calendar.
            </p>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setMeetingDraft(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save meeting
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}

      {rhythmDraft && (
        <ProfessionalDialog
          title={
            state.battleRhythms.some((rhythm) => rhythm.id === rhythmDraft.id)
              ? "Edit battle rhythm"
              : "Add a battle rhythm"
          }
          onClose={() => setRhythmDraft(null)}
        >
          <form className="work-form" onSubmit={saveRhythm}>
            <label className="field">
              Rhythm title
              <input
                autoFocus
                required
                maxLength={200}
                value={rhythmDraft.title}
                onChange={(event) =>
                  setRhythmDraft({ ...rhythmDraft, title: event.target.value })
                }
                placeholder="A regular meeting, review, or recurring commitment."
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Major graded area
                <select
                  value={rhythmDraft.mga}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      mga: event.target.value as BattleRhythm["mga"],
                    })
                  }
                >
                  {majorAreas.map((area) => (
                    <option key={area}>{area}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Frequency
                <select
                  value={rhythmDraft.frequency}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      frequency: event.target
                        .value as BattleRhythm["frequency"],
                    })
                  }
                >
                  {frequencies.map((frequency) => (
                    <option key={frequency}>{frequency}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Anchor date
                <input
                  type="date"
                  {...dateLimits}
                  required
                  value={rhythmDraft.startDate}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      startDate: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                Block category
                <select
                  value={rhythmDraft.category}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      category: event.target.value as BattleRhythm["category"],
                    })
                  }
                >
                  {["Duty", "Development", "Fitness", "Personal"].map(
                    (category) => (
                      <option key={category}>{category}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                Start time
                <input
                  type="time"
                  required
                  value={rhythmDraft.startTime}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      startTime: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                End time
                <input
                  type="time"
                  required
                  value={rhythmDraft.endTime}
                  onChange={(event) =>
                    setRhythmDraft({
                      ...rhythmDraft,
                      endTime: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <NotesField
              label="Location & preparation notes"
              value={rhythmDraft.notes}
              onChange={(value) =>
                setRhythmDraft({ ...rhythmDraft, notes: value })
              }
              placeholder="Where this happens and what you need to prepare."
            />
            <p className="small muted">
              The anchor controls the weekday or day of the month. Missing
              calendar days are skipped. Edits apply to future generation;
              existing time blocks remain individually editable.
            </p>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setRhythmDraft(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save rhythm
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}

      {generating && rhythmPlan && (
        <ProfessionalDialog
          title={`Generate time blocks: ${generating.title}`}
          onClose={() => setGenerating(null)}
        >
          <div className="work-form">
            <p className="small muted">
              {generating.frequency} · {generating.startTime}–
              {generating.endTime}. Preview up to 366 days, then add the
              available dates to Day plan.
            </p>
            <div className="form-grid">
              <label className="field">
                Generate from
                <input
                  type="date"
                  {...dateLimits}
                  required
                  value={rangeFrom}
                  onChange={(event) => setRangeFrom(event.target.value)}
                />
              </label>
              <label className="field">
                Generate through
                <input
                  type="date"
                  {...dateLimits}
                  required
                  value={rangeTo}
                  onChange={(event) => setRangeTo(event.target.value)}
                />
              </label>
            </div>
            {rhythmPlan.error ? (
              <p className="error-text" role="alert">
                {rhythmPlan.error}
              </p>
            ) : (
              <>
                <div className="work-generation-summary">
                  <span>
                    <strong>{rhythmPlan.blocks.length}</strong> available dates
                  </span>
                  <span>
                    <strong>{rhythmPlan.skipped.length}</strong> skipped dates
                  </span>
                </div>
                {rhythmPlan.blocks.length > 0 && (
                  <div
                    className="work-preview-dates"
                    aria-label="Available generation dates"
                  >
                    {rhythmPlan.blocks.slice(0, 8).map((block) => (
                      <span key={block.id}>
                        {formatDate(block.date, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    ))}
                    {rhythmPlan.blocks.length > 8 && (
                      <span>+{rhythmPlan.blocks.length - 8} more</span>
                    )}
                  </div>
                )}
                {rhythmPlan.skipped.length > 0 && (
                  <details className="work-form-details" open>
                    <summary>Review skipped dates</summary>
                    <div className="work-skipped-list">
                      {rhythmPlan.skipped.map((item) => (
                        <p key={item.date}>
                          <strong>{formatDate(item.date)}</strong>
                          <span>{item.reason}</span>
                        </p>
                      ))}
                    </div>
                  </details>
                )}
                {!rhythmPlan.blocks.length && !rhythmPlan.skipped.length && (
                  <p className="small muted">
                    No occurrences fall in this range. Quarterly and yearly
                    rhythms may need a longer window.
                  </p>
                )}
                <p className="small muted">
                  Only available dates will be generated. These are independent
                  blocks; editing the rhythm changes future generation.
                </p>
              </>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setGenerating(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!!rhythmPlan.error || !rhythmPlan.blocks.length}
                onClick={generateBlocks}
              >
                Generate {rhythmPlan.blocks.length} time blocks
              </button>
            </div>
          </div>
        </ProfessionalDialog>
      )}

      {deleting && (
        <ProfessionalDialog
          title={`Delete ${deleting.kind === "projects" ? "project" : deleting.kind === "tasks" ? "tasker" : deleting.kind === "meetings" ? "meeting" : "battle rhythm"}?`}
          onClose={() => setDeleting(null)}
        >
          <p>“{deleting.title}” will be removed. This cannot be undone.</p>
          <p className="small muted">
            {deleting.kind === "projects"
              ? "Linked taskers, time blocks, and career records are preserved and detached from this project."
              : deleting.kind === "tasks"
                ? "Associated time blocks and career records are preserved. Other taskers no longer list this action as a prerequisite."
                : deleting.kind === "meetings"
                  ? "Linked action taskers are preserved and detached from this meeting. Its linked calendar events are removed."
                  : "Generated time blocks are preserved and detached. This recurring schedule will no longer be available for generation."}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Keep{" "}
              {deleting.kind === "projects"
                ? "project"
                : deleting.kind === "tasks"
                  ? "tasker"
                  : deleting.kind === "meetings"
                    ? "meeting"
                    : "rhythm"}
            </button>
            <button
              className="button danger"
              onClick={() => {
                mutate((draft) =>
                  removePlannerRecord(draft, deleting.kind, deleting.id),
                );
                setDeleting(null);
                setNotice({
                  text: "Record removed. Its connected work has been preserved.",
                });
              }}
            >
              Delete{" "}
              {deleting.kind === "projects"
                ? "project"
                : deleting.kind === "tasks"
                  ? "tasker"
                  : deleting.kind === "meetings"
                    ? "meeting"
                    : "rhythm"}
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
