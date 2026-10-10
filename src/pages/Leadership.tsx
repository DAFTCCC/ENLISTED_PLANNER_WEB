import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import type { Member } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import { isProfessionalDate } from "./professional-date";
import { removePlannerRecord } from "../lib/relationships";
import { taskCompletionError } from "../lib/workflow";
import PeopleDevelopment from "./PeopleDevelopment";
import "./people.css";
import "./professional.css";

const blankMember = (): Omit<Member, "id"> => ({
  name: "",
  rank: "",
  focus: "",
  nextFeedback: "",
  notes: "",
  team: "",
  supervisorId: "",
  contactId: "",
  role: "Teammate",
});
const feedbackTitle = (member: Member) => `Feedback: ${member.name}`;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export default function Leadership() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [draft, setDraft] = useState(blankMember);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [logging, setLogging] = useState<Member | null>(null);
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionNotes, setSessionNotes] = useState("");
  const [nextFeedback, setNextFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [memberError, setMemberError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const scheduled = state.members.filter((member) => member.nextFeedback);
  const due = scheduled.filter((member) => member.nextFeedback <= today);
  const upcoming = [...scheduled]
    .sort((a, b) => a.nextFeedback.localeCompare(b.nextFeedback))
    .slice(0, 4);
  const members = useMemo(
    () =>
      [...state.members]
        .filter((member) =>
          [
            member.name,
            member.rank,
            member.focus,
            member.notes,
            member.team || "",
            member.role || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.members, query],
  );
  const openMember = (member: Member | "new") => {
    setMemberError("");
    setDraft(
      member === "new"
        ? blankMember()
        : {
            name: member.name,
            rank: member.rank,
            focus: member.focus,
            nextFeedback: member.nextFeedback,
            notes: member.notes,
            team: member.team || "",
            supervisorId: member.supervisorId || "",
            contactId: member.contactId || "",
            role: member.role || "Teammate",
          },
    );
    setEditing(member);
  };
  const saveMember = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    if (!isProfessionalDate(draft.nextFeedback, true)) {
      setMemberError(
        "Choose a real feedback date between years 0001 and 9999, or leave it blank.",
      );
      return;
    }
    if (editing !== "new" && editing && draft.supervisorId) {
      let candidate = draft.supervisorId;
      const visited = new Set<string>();
      while (candidate && !visited.has(candidate)) {
        if (candidate === editing.id) {
          setMemberError(
            "Choose a supervisor who does not create a circular reporting relationship.",
          );
          return;
        }
        visited.add(candidate);
        candidate =
          state.members.find((member) => member.id === candidate)
            ?.supervisorId || "";
      }
    }
    mutate((next) => {
      if (editing === "new")
        next.members.push({
          ...draft,
          name: draft.name.trim(),
          rank: draft.rank.trim(),
          focus: draft.focus.trim(),
          id: crypto.randomUUID(),
        });
      else if (editing) {
        const member = next.members.find((item) => item.id === editing.id);
        if (member)
          Object.assign(member, {
            ...draft,
            name: draft.name.trim(),
            rank: draft.rank.trim(),
            focus: draft.focus.trim(),
          });
      }
    });
    setEditing(null);
  };
  const openLog = (member: Member) => {
    setFeedbackError("");
    setLogging(member);
    setSessionDate(today);
    setSessionNotes("");
    setNextFeedback("");
  };
  const saveFeedback = (event: FormEvent) => {
    event.preventDefault();
    if (!logging || !sessionNotes.trim()) return;
    if (!isProfessionalDate(sessionDate) || sessionDate > today) {
      setFeedbackError("Choose a real session date on or before today.");
      return;
    }
    if (
      !isProfessionalDate(nextFeedback, true) ||
      (nextFeedback && nextFeedback < sessionDate)
    ) {
      setFeedbackError(
        "Choose a real follow-up date on or after the session date, or leave it blank.",
      );
      return;
    }
    mutate((next) => {
      const member = next.members.find((item) => item.id === logging.id);
      if (member) {
        member.notes = `${formatDate(sessionDate)} · Feedback\n${sessionNotes.trim()}${member.notes ? `\n\n${member.notes}` : ""}`;
        member.nextFeedback = nextFeedback;
      }
    });
    setNotice(`Feedback saved for ${logging.name}.`);
    setLogging(null);
  };
  const onCalendar = (member: Member) =>
    state.events.some((event) => event.memberId === member.id);
  const addToCalendar = (member: Member) => {
    if (!member.nextFeedback || onCalendar(member)) return;
    if (!isProfessionalDate(member.nextFeedback)) {
      setNotice(
        "Correct this member’s feedback date before adding it to Calendar.",
      );
      return;
    }
    mutate((next) =>
      next.events.push({
        id: `linked:member:${member.id}`,
        memberId: member.id,
        title: feedbackTitle(member),
        date: member.nextFeedback,
        time: "",
        category: "Career",
        recurrence: "None",
        source: "User entered",
      }),
    );
    setNotice(`Feedback for ${member.name} added to Calendar.`);
  };

  return (
    <div className="professional-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INVEST IN YOUR PEOPLE</span>
          <h1>Leadership</h1>
          <p>Make time for feedback, growth, and the next conversation.</p>
        </div>
        <button className="button primary" onClick={() => openMember("new")}>
          <UserPlus size={17} /> Add team member
        </button>
      </div>
      <div className="professional-summary">
        <div className="professional-stat">
          <span>TEAM MEMBERS</span>
          <strong>{state.members.length}</strong>
        </div>
        <div className="professional-stat">
          <span>FEEDBACK DUE</span>
          <strong>{due.length}</strong>
        </div>
        <div className="professional-stat">
          <span>SESSIONS PLANNED</span>
          <strong>{scheduled.length}</strong>
        </div>
      </div>
      {notice && (
        <p
          className="small professional-icon"
          role="status"
          style={{ margin: 0 }}
        >
          <Check size={16} />
          {notice}
        </p>
      )}
      <div className="professional-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <MessageSquare size={19} /> Next conversations
            </h2>
            <span className="badge">
              {due.length ? `${due.length} due` : "Feedback"}
            </span>
          </div>
          {upcoming.length ? (
            <div className="professional-queue">
              {upcoming.map((member) => (
                <div className="professional-queue-row" key={member.id}>
                  <div className="professional-heading-row">
                    <div>
                      <strong>
                        {member.rank ? `${member.rank} ` : ""}
                        {member.name}
                      </strong>
                      <p className="small muted">
                        {member.focus || "Development check-in"}
                      </p>
                      <p
                        className="small professional-icon"
                        style={{
                          color:
                            member.nextFeedback <= today
                              ? "var(--warning, #a76618)"
                              : undefined,
                        }}
                      >
                        <CalendarDays size={14} />
                        {formatDate(member.nextFeedback)}
                        {member.nextFeedback < today
                          ? " · Overdue"
                          : member.nextFeedback === today
                            ? " · Today"
                            : ""}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => openLog(member)}
                    >
                      Log feedback
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="professional-empty"
              style={{ padding: "22px 10px" }}
            >
              <Clock size={25} />
              <h3>No feedback scheduled</h3>
              <p>
                Add a feedback date to a team member to keep the next
                conversation in view.
              </p>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Users size={19} /> A little preparation goes a long way
            </h2>
          </div>
          <div className="professional-queue">
            <div className="professional-queue-row">
              <strong className="small">Before the conversation</strong>
              <p className="small muted">
                Review the person's development focus, listen to their goals,
                and choose a clear discussion topic.
              </p>
            </div>
            <div className="professional-queue-row">
              <strong className="small">Leave with a next step</strong>
              <p className="small muted">
                Record agreed actions and a follow-up date. Add the conversation
                to Calendar when you're ready.
              </p>
            </div>
            <div className="professional-queue-row">
              <strong className="small">Keep records appropriate</strong>
              <p className="small muted">
                Use brief development notes. Avoid sensitive personnel, medical,
                or restricted information. This planner does not replace
                official feedback records.
              </p>
            </div>
          </div>
        </section>
      </div>
      <section className="professional-stack" style={{ gap: 18 }}>
        <div className="professional-heading-row">
          <div>
            <h2 style={{ margin: 0 }}>Your team</h2>
            <p className="small muted">
              One place for development priorities and follow-ups.
            </p>
          </div>
          <label className="field" style={{ maxWidth: 260 }}>
            Search team
            <div className="professional-search">
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, rank, or focus"
              />
            </div>
          </label>
        </div>
        {members.length ? (
          <div className="card-grid">
            {members.map((member) => (
              <article className="professional-item" key={member.id}>
                <div className="professional-heading-row">
                  <div className="professional-person">
                    <span className="professional-avatar" aria-hidden="true">
                      {initials(member.name)}
                    </span>
                    <div>
                      <h3>{member.name}</h3>
                      <span className="small muted">
                        {member.rank || "Team member"}
                      </span>
                    </div>
                  </div>
                  <div className="professional-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${member.name}`}
                      onClick={() => openMember(member)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${member.name}`}
                      onClick={() => setDeleting(member)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="small" style={{ margin: "20px 0 10px" }}>
                  <span className="muted">Development focus</span>
                  <br />
                  <strong>
                    {member.focus || "Set a focus in this member’s details"}
                  </strong>
                </p>
                <div className="professional-meta">
                  <span className="professional-icon">
                    <CalendarDays size={14} />
                    {member.nextFeedback
                      ? `Next feedback: ${formatDate(member.nextFeedback)}`
                      : "No feedback date set"}
                  </span>
                  {member.nextFeedback && member.nextFeedback <= today && (
                    <span className="badge professional-due">
                      {member.nextFeedback === today ? "Today" : "Overdue"}
                    </span>
                  )}
                </div>
                <MemberConnections member={member} />
                {member.notes && (
                  <div className="professional-notes">{member.notes}</div>
                )}
                <div className="professional-inline" style={{ marginTop: 18 }}>
                  <button
                    className="button secondary"
                    onClick={() => openLog(member)}
                  >
                    <MessageSquare size={15} /> Log feedback
                  </button>
                  {member.nextFeedback && (
                    <button
                      className="button ghost"
                      disabled={onCalendar(member)}
                      onClick={() => addToCalendar(member)}
                    >
                      {onCalendar(member) ? (
                        <Check size={15} />
                      ) : (
                        <Plus size={15} />
                      )}
                      {onCalendar(member) ? "On calendar" : "Add to calendar"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel professional-empty">
            <Users size={30} />
            <h3>
              {state.members.length
                ? "No team members match"
                : "Help your people take their next step"}
            </h3>
            <p>
              {state.members.length
                ? "Try another name, rank, or development focus."
                : "Add the people you supervise or mentor, keep track of their priorities, and plan your next conversation."}
            </p>
            {!state.members.length && (
              <button
                className="button primary"
                style={{ marginTop: 20 }}
                onClick={() => openMember("new")}
              >
                <UserPlus size={16} /> Add your first team member
              </button>
            )}
          </div>
        )}
      </section>
      <PeopleDevelopment />
      {editing && (
        <ProfessionalDialog
          title={editing === "new" ? "Add a team member" : "Edit team member"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveMember}>
            <div className="professional-modal-body">
              <div className="form-grid">
                <label className="field">
                  Name
                  <input
                    autoFocus
                    required
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    maxLength={100}
                    placeholder="Name or preferred identifier"
                  />
                </label>
                <label className="field">
                  Rank
                  <input
                    value={draft.rank}
                    onChange={(event) =>
                      setDraft({ ...draft, rank: event.target.value })
                    }
                    maxLength={60}
                    placeholder="For example, SrA"
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  Team or section
                  <input
                    value={draft.team || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, team: event.target.value })
                    }
                    maxLength={160}
                    placeholder="A team, flight, or section"
                  />
                </label>
                <label className="field">
                  Relationship role
                  <select
                    value={draft.role || "Teammate"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        role: event.target.value as Member["role"],
                      })
                    }
                  >
                    {[
                      "Teammate",
                      "Wingman",
                      "Supervisor",
                      "Senior leader",
                      "Resource",
                    ].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  Supervisor
                  <select
                    value={draft.supervisorId || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, supervisorId: event.target.value })
                    }
                  >
                    <option value="">Not linked</option>
                    {state.members
                      .filter(
                        (member) =>
                          editing === "new" || member.id !== editing.id,
                      )
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Directory contact
                  <select
                    value={draft.contactId || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, contactId: event.target.value })
                    }
                  >
                    <option value="">Not linked</option>
                    {state.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.role ? ` · ${contact.role}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="small muted">
                Add local contact details in{" "}
                <a href="#support">People &amp; support</a>, then link them
                here.
              </p>
              <label className="field">
                Development focus
                <input
                  value={draft.focus}
                  onChange={(event) =>
                    setDraft({ ...draft, focus: event.target.value })
                  }
                  maxLength={240}
                  placeholder="A goal, training priority, or responsibility"
                />
              </label>
              <label className="field">
                Next feedback date
                <input
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={draft.nextFeedback}
                  onChange={(event) => {
                    setDraft({ ...draft, nextFeedback: event.target.value });
                    setMemberError("");
                  }}
                />
              </label>
              <label className="field">
                Development &amp; follow-up notes
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                  maxLength={20000}
                  placeholder="Discussion topics, agreed actions, and useful context"
                />
              </label>
              <p className="small muted">
                Store only appropriate development information. Your team
                records stay on this device.
              </p>
              {memberError && (
                <p className="error-text small" role="alert">
                  {memberError}
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
                Save team member
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {logging && (
        <ProfessionalDialog
          title={`Feedback with ${logging.name}`}
          onClose={() => setLogging(null)}
        >
          <form onSubmit={saveFeedback}>
            <div className="professional-modal-body">
              <label className="field">
                Session date
                <input
                  required
                  type="date"
                  min="0001-01-01"
                  value={sessionDate}
                  max={today}
                  onChange={(event) => {
                    setSessionDate(event.target.value);
                    setFeedbackError("");
                  }}
                />
              </label>
              <label className="field">
                Conversation &amp; agreed actions
                <textarea
                  autoFocus
                  required
                  value={sessionNotes}
                  onChange={(event) => setSessionNotes(event.target.value)}
                  maxLength={5000}
                  placeholder="What did you discuss? What are the next steps, and who owns them?"
                />
              </label>
              <label className="field">
                Next feedback date
                <input
                  type="date"
                  min={
                    isProfessionalDate(sessionDate) ? sessionDate : "0001-01-01"
                  }
                  max="9999-12-31"
                  value={nextFeedback}
                  onChange={(event) => {
                    setNextFeedback(event.target.value);
                    setFeedbackError("");
                  }}
                />
              </label>
              <p className="small muted">
                This entry is added to the member's existing notes. Saving
                clears their previous feedback date; choose a new date to plan
                the next conversation.
              </p>
              {feedbackError && (
                <p className="error-text small" role="alert">
                  {feedbackError}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setLogging(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save feedback
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deleting && (
        <ProfessionalDialog
          title="Remove team member?"
          onClose={() => setDeleting(null)}
        >
          <p>
            This removes {deleting.name}'s team record and its linked feedback
            event. Assigned taskers, project plans, accomplishment records,
            development actions, and preparation notes remain with the person
            link cleared.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Keep team member
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) => {
                  removePlannerRecord(next, "members", deleting.id);
                });
                setDeleting(null);
              }}
            >
              Remove team member
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}

function MemberConnections({ member }: { member: Member }) {
  const { state, mutate } = usePlanner();
  const [blockedTaskId, setBlockedTaskId] = useState<string | null>(null);
  const blockedTask = state.tasks.find((task) => task.id === blockedTaskId);
  const completionError = blockedTask
    ? taskCompletionError(blockedTask, state.tasks)
    : null;
  const supervisor = state.members.find(
    (item) => item.id === member.supervisorId,
  );
  const contact = state.contacts.find((item) => item.id === member.contactId);
  const tasks = state.tasks.filter((task) => task.assigneeId === member.id);
  const projects = state.projects.filter(
    (project) => project.ownerId === member.id,
  );
  return (
    <div className="people-member-connections">
      {(member.team || member.role || supervisor || contact) && (
        <div className="people-member-meta">
          {member.team && <span>{member.team}</span>}
          {member.role && <span>{member.role}</span>}
          {supervisor && <span>Supervisor: {supervisor.name}</span>}
          {contact && <a href="#support">Contact: {contact.name}</a>}
        </div>
      )}
      {(tasks.length > 0 || projects.length > 0) && (
        <details className="people-assigned-work">
          <summary>
            Assigned work · {tasks.filter((task) => !task.completed).length}{" "}
            open taskers · {projects.length} projects
          </summary>
          {tasks.map((task) => (
            <label className="people-assigned-task" key={task.id}>
              <input
                type="checkbox"
                checked={task.completed}
                aria-label={`${task.completed ? "Reopen" : "Complete"} assigned task ${task.title}`}
                onChange={() => {
                  if (
                    !task.completed &&
                    taskCompletionError(task, state.tasks)
                  ) {
                    setBlockedTaskId(task.id);
                    return;
                  }
                  setBlockedTaskId(null);
                  mutate((next) => {
                    const current = next.tasks.find(
                      (item) => item.id === task.id,
                    );
                    if (current) {
                      current.completed = !current.completed;
                      current.status = current.completed ? "Done" : "Open";
                    }
                  });
                }}
              />
              <span>
                <strong>{task.title}</strong>
                <span className="small muted">
                  {task.date ? formatDate(task.date) : "No due date"} ·{" "}
                  {task.status || (task.completed ? "Done" : "Open")}
                </span>
              </span>
            </label>
          ))}
          {projects.map((project) => {
            const projectTasks = state.tasks.filter(
              (task) => task.projectId === project.id,
            );
            return (
              <div className="people-owned-project" key={project.id}>
                <a href="#work">{project.title}</a>
                <span className="small muted">
                  {project.status} ·{" "}
                  {projectTasks.filter((task) => task.completed).length}/
                  {projectTasks.length} taskers complete
                  {project.dueDate
                    ? ` · Due ${formatDate(project.dueDate)}`
                    : ""}
                </span>
              </div>
            );
          })}
          {completionError && (
            <p className="error-text small" role="alert">
              {completionError}
            </p>
          )}
          <a className="button ghost" href="#work">
            Manage work &amp; taskers
          </a>
        </details>
      )}
    </div>
  );
}
