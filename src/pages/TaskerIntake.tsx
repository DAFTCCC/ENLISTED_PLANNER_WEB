import { useState } from "react";
import { FileInput } from "lucide-react";
import { usePlanner } from "../lib/planner";
import {
  extractTaskerDrafts,
  intakeDraftError,
  taskFromIntake,
  type IntakeDraft,
} from "../lib/tasker-intake";
import type { Task } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import "./professional.css";
import "./team-intake.css";

export default function TaskerIntake({
  onCreated,
}: {
  onCreated?: (taskIds: string[]) => void;
}) {
  const { state, mutate } = usePlanner();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function extract() {
    try {
      const result = extractTaskerDrafts(text, state.members, state.projects);
      setDrafts(result.drafts);
      setNotices(result.notices);
      setSelected(result.drafts.map((draft) => draft.id));
      setReviewed([]);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "This text could not be read.",
      );
    }
  }
  function updateDraft(id: string, changes: Partial<IntakeDraft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...changes } : draft,
      ),
    );
    setReviewed((current) => current.filter((value) => value !== id));
    setError("");
  }
  function create() {
    const chosen = drafts.filter((draft) => selected.includes(draft.id));
    if (!chosen.length) {
      setError("Choose at least one draft to create.");
      return;
    }
    if (chosen.some((draft) => !reviewed.includes(draft.id))) {
      setError(
        "Review and confirm each selected draft's owner, date, and project before creating taskers.",
      );
      return;
    }
    for (const draft of chosen) {
      const invalid = intakeDraftError(draft, state);
      if (invalid) {
        setError(`${draft.title || "Untitled draft"}: ${invalid}`);
        return;
      }
    }
    const taskers = chosen.map((draft) => taskFromIntake(draft, state));
    const saved = mutate((next) => {
      // Revalidate against the live state in case another action removed an owner or project.
      for (const draft of chosen) {
        const invalid = intakeDraftError(draft, next);
        if (invalid) throw new Error(invalid);
      }
      next.tasks.push(...taskers);
    });
    if (!saved) {
      setError(
        "Taskers could not be saved. Check the planner's storage message and try again.",
      );
      return;
    }
    setOpen(false);
    setDrafts([]);
    setReviewed([]);
    setText("");
    setNotices([]);
    setSuccess(
      `${taskers.length} reviewed ${taskers.length === 1 ? "tasker created" : "taskers created"}.`,
    );
    onCreated?.(taskers.map((task) => task.id));
  }

  return (
    <div className="tasker-intake-entry">
      <button
        className="button secondary"
        onClick={() => {
          setOpen(true);
          setError("");
          setSuccess("");
        }}
      >
        <FileInput size={17} />
        Import tasker text
      </button>
      {success && <p role="status">{success}</p>}
      {open && (
        <ProfessionalDialog
          title="Review taskers from pasted text"
          onClose={() => setOpen(false)}
        >
          <div className="tasker-intake">
            <p>
              Paste an email or meeting notes. Action lines become drafts that
              you can edit. Dates such as “next Friday” need your choice of an
              absolute date.
            </p>
            <label className="field">
              Email or meeting notes
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setDrafts([]);
                  setReviewed([]);
                  setSelected([]);
                  setNotices([]);
                  setError("");
                }}
                rows={7}
                placeholder={
                  "Task: Review handover guide; Owner: Taylor; Due: 2026-11-02; Project: Handover\nAction: Schedule a practice briefing by next Friday"
                }
              />
            </label>
            <button
              className="button secondary"
              disabled={!text.trim()}
              onClick={extract}
            >
              Extract draft taskers
            </button>
            {notices.map((notice, index) => (
              <p key={index} className="team-meta">
                {notice}
              </p>
            ))}
            {error && (
              <p className="team-notice" role="alert">
                {error}
              </p>
            )}
            <div className="intake-drafts">
              {drafts.map((draft, index) => (
                <article className="intake-draft" key={draft.id}>
                  <div className="team-card-heading">
                    <h3>Draft {index + 1}</h3>
                    <label className="team-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(draft.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, draft.id]
                              : current.filter((value) => value !== draft.id),
                          )
                        }
                        aria-label={`Include draft ${index + 1}`}
                      />
                      Create this tasker
                    </label>
                  </div>
                  <label className="field">
                    Tasker title
                    <input
                      value={draft.title}
                      onChange={(event) =>
                        updateDraft(draft.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      Tasker owner
                      <select
                        value={draft.assigneeId}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            assigneeId: event.target.value,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {state.members.map((member) => (
                          <option value={member.id} key={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Tasker project
                      <select
                        value={draft.projectId}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            projectId: event.target.value,
                          })
                        }
                      >
                        <option value="">No project</option>
                        {state.projects.map((project) => (
                          <option value={project.id} key={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Suspense date
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) =>
                          updateDraft(draft.id, { date: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Suspense time (optional)
                      <input
                        type="time"
                        value={draft.suspenseTime}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            suspenseTime: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Priority
                      <select
                        value={draft.priority}
                        onChange={(event) =>
                          updateDraft(draft.id, {
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
                      Estimated effort (minutes)
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={draft.estimatedMinutes}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            estimatedMinutes: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  {draft.questions.length > 0 && (
                    <div className="intake-questions">
                      <h4>Confirm these details</h4>
                      <ul>
                        {draft.questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details>
                    <summary>Original source text</summary>
                    <p className="team-notes">{draft.sourceText}</p>
                  </details>
                  <label className="team-check intake-confirm">
                    <input
                      type="checkbox"
                      checked={reviewed.includes(draft.id)}
                      onChange={(event) =>
                        setReviewed((current) =>
                          event.target.checked
                            ? [...current, draft.id]
                            : current.filter((value) => value !== draft.id),
                        )
                      }
                      aria-label={`Confirm draft ${index + 1} reviewed`}
                    />
                    I reviewed the fields, including any intentionally
                    unassigned or undated work.
                  </label>
                </article>
              ))}
            </div>
            {drafts.length > 0 && (
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={!selected.length}
                  onClick={create}
                >
                  Create {selected.length} reviewed{" "}
                  {selected.length === 1 ? "tasker" : "taskers"}
                </button>
              </div>
            )}
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
