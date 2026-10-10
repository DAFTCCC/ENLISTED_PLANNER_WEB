import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ClipboardCheck,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import { safeSourceUrl } from "../lib/career-planning";
import {
  blankCareerRequirement,
  careerReadinessSummary,
  careerRequirementError,
  careerRequirementReview,
  careerRequirementScope,
  CAREER_REQUIREMENT_AREAS,
} from "../lib/career-readiness";
import type { CareerRequirement } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import "./professional.css";
import "./career-readiness.css";

type Draft = Omit<CareerRequirement, "id">;
type RequirementView =
  | "All qualifications"
  | "Open"
  | "Recorded complete"
  | "Needs attention";

export default function CareerReadiness() {
  const { state, mutate } = usePlanner();
  const today = localDate();
  const requirements = state.careerRequirements || [];
  const [editing, setEditing] = useState<CareerRequirement | "new" | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(() =>
    blankCareerRequirement(state.profile),
  );
  const [removing, setRemoving] = useState<CareerRequirement | null>(null);
  const [error, setError] = useState("");
  const [area, setArea] = useState("All areas");
  const [scope, setScope] = useState("My profile");
  const [view, setView] = useState<RequirementView>("All qualifications");
  const [specialty, setSpecialty] = useState(state.profile.afsc || "");
  const [specialtySaved, setSpecialtySaved] = useState(false);
  const summary = careerReadinessSummary(requirements, state.profile, today);
  const shown = requirements
    .filter((item) => {
      if (area !== "All areas" && item.area !== area) return false;
      if (
        scope === "My profile" &&
        careerRequirementScope(item, state.profile).scope === "Outside profile"
      )
        return false;
      if (view === "Open" && item.status === "Complete") return false;
      if (view === "Recorded complete" && item.status !== "Complete")
        return false;
      if (
        view === "Needs attention" &&
        !careerRequirementReview(item, today).prompts.length &&
        careerRequirementScope(item, state.profile).scope !==
          "Needs profile detail"
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const first = careerRequirementReview(a, today);
      const second = careerRequirementReview(b, today);
      const urgency = (review: ReturnType<typeof careerRequirementReview>) =>
        review.expired ? 0 : review.overdue ? 1 : review.renewalSoon ? 2 : 3;
      return (
        urgency(first) - urgency(second) ||
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        a.title.localeCompare(b.title)
      );
    });

  const open = (item: CareerRequirement | "new") => {
    setDraft(
      item === "new" ? blankCareerRequirement(state.profile) : { ...item },
    );
    setError("");
    setEditing(item);
  };
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError("");
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const validation = careerRequirementError(draft, today);
    if (validation) {
      setError(validation);
      return;
    }
    if (
      editing &&
      editing !== "new" &&
      !requirements.some((item) => item.id === editing.id)
    ) {
      setError(
        "This qualification was removed. Close the editor and add it again if needed.",
      );
      return;
    }
    const saved = {
      ...draft,
      title: draft.title.trim(),
      sourceUrl: draft.sourceUrl ? safeSourceUrl(draft.sourceUrl)! : "",
      rank: draft.rank.trim(),
      afsc: draft.afsc.trim(),
    };
    const applied = mutate((next) => {
      if (editing === "new")
        next.careerRequirements.push({ ...saved, id: crypto.randomUUID() });
      else if (editing) {
        const existing = next.careerRequirements.find(
          (item) => item.id === editing.id,
        );
        if (existing) Object.assign(existing, saved);
      }
    });
    if (applied) setEditing(null);
    else
      setError(
        "The qualification could not be saved. Review the planner storage message and try again.",
      );
  };

  return (
    <section
      className="panel career-readiness"
      aria-labelledby="career-readiness-heading"
    >
      <div className="panel-heading">
        <h2 id="career-readiness-heading">
          <ClipboardCheck size={19} /> Career readiness map
        </h2>
        <button className="button secondary" onClick={() => open("new")}>
          <Plus size={16} /> Add qualification
        </button>
      </div>
      <p className="career-readiness-intro muted">
        Keep PME, training, certifications, records, and experience together
        with the evidence that supports them. These are your recorded
        qualifications; confirm current requirements and applicability with your
        supervisor or servicing office.
      </p>
      <form
        className="career-readiness-profile"
        onSubmit={(event) => {
          event.preventDefault();
          const applied = mutate((next) => {
            next.profile.afsc = specialty.trim();
          });
          setSpecialtySaved(applied);
        }}
      >
        <p className="muted small">
          Profile: {state.profile.service} · {state.profile.component} ·{" "}
          {state.profile.rank || "Rank not set"}
        </p>
        <label className="field">
          Your AFSC or specialty
          <input
            value={specialty}
            maxLength={80}
            placeholder="For example, your current specialty code"
            onChange={(event) => {
              setSpecialty(event.target.value);
              setSpecialtySaved(false);
            }}
          />
        </label>
        <button className="button secondary" type="submit">
          Save profile specialty
        </button>
        {specialtySaved && (
          <p className="small" role="status">
            Profile specialty saved.
          </p>
        )}
      </form>
      <div
        className="career-readiness-stats"
        aria-label="Qualifications matching your profile"
      >
        <div className="career-readiness-stat">
          <strong>{summary.applicable}</strong>
          <span>Match your recorded profile</span>
        </div>
        <div className="career-readiness-stat">
          <strong>{summary.recordedComplete}</strong>
          <span>Recorded complete</span>
        </div>
        <div className="career-readiness-stat">
          <strong>{summary.renewalReviews}</strong>
          <span>Expiry or renewal reviews</span>
        </div>
        <div className="career-readiness-stat">
          <strong>{summary.needsAttention}</strong>
          <span>Need records or source review</span>
        </div>
      </div>
      {summary.needsProfile > 0 && (
        <p className="small muted">
          {summary.needsProfile} qualification
          {summary.needsProfile === 1 ? " needs" : "s need"} more profile detail
          before its scope can be matched.
        </p>
      )}
      <div className="professional-filters">
        <label className="field">
          Qualification scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option>My profile</option>
            <option>All scopes</option>
          </select>
        </label>
        <label className="field">
          Qualification area
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            <option>All areas</option>
            {CAREER_REQUIREMENT_AREAS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Qualification view
          <select
            value={view}
            onChange={(event) => setView(event.target.value as RequirementView)}
          >
            {[
              "All qualifications",
              "Open",
              "Recorded complete",
              "Needs attention",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="career-readiness-list">
        {!shown.length && (
          <div className="professional-empty">
            <ClipboardCheck size={28} />
            <h3>
              {requirements.length
                ? "No qualifications match these filters"
                : "Add a confirmed qualification"}
            </h3>
            <p>
              {requirements.length
                ? "Change the scope or view to see your other records."
                : "Start with a course, certification, required record, or experience goal you have discussed with your supervisor."}
            </p>
          </div>
        )}
        {shown.map((item) => {
          const review = careerRequirementReview(item, today);
          const match = careerRequirementScope(item, state.profile);
          const source = safeSourceUrl(item.sourceUrl);
          return (
            <article
              key={item.id}
              className="professional-item career-readiness-card"
              aria-label={`Qualification ${item.title}`}
            >
              <div className="professional-heading-row">
                <div>
                  <h3>{item.title}</h3>
                  <div className="professional-meta">
                    <span>{item.area}</span>
                    <span
                      className={`badge ${review.expired || review.overdue || review.renewalSoon ? "professional-due" : ""}`}
                    >
                      {review.label}
                    </span>
                  </div>
                </div>
                <div className="professional-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit qualification ${item.title}`}
                    onClick={() => open(item)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete qualification ${item.title}`}
                    onClick={() => setRemoving(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="professional-meta">
                <span>
                  {item.service === "Any" ? "Any service" : item.service}
                </span>
                <span>
                  {item.component === "Any" ? "Any component" : item.component}
                </span>
                <span>{item.rank || "Any rank"}</span>
                <span>{item.afsc || "Any specialty"}</span>
                <span>
                  {match.scope === "Applicable"
                    ? "Matches profile"
                    : match.scope}
                </span>
              </div>
              {match.missing.length > 0 && (
                <p className="small muted">
                  Set your {match.missing.join(" and ")} to check this
                  qualification's scope.
                </p>
              )}
              <dl className="career-readiness-facts">
                {item.dueDate && (
                  <div>
                    <dt>Due</dt>
                    <dd>{formatDate(item.dueDate)}</dd>
                  </div>
                )}
                {item.completedDate && (
                  <div>
                    <dt>Recorded completion</dt>
                    <dd>{formatDate(item.completedDate)}</dd>
                  </div>
                )}
                {item.expiresDate && (
                  <div>
                    <dt>Recorded expiry</dt>
                    <dd>{formatDate(item.expiresDate)}</dd>
                  </div>
                )}
              </dl>
              {item.evidence.trim() && (
                <p className="career-readiness-evidence">
                  <strong>Evidence / record reference</strong>
                  <br />
                  {item.evidence}
                </p>
              )}
              {item.notes.trim() && (
                <p className="professional-notes">{item.notes}</p>
              )}
              {review.prompts.length > 0 && (
                <div className="career-readiness-prompts">
                  <strong>Review prompts</strong>
                  <ul>
                    {review.prompts.map((prompt) => (
                      <li key={prompt}>{prompt}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="career-readiness-source">
                {source && (
                  <a href={source} target="_blank" rel="noopener noreferrer">
                    Recorded source <ArrowUpRight size={13} />
                  </a>
                )}
                <span>
                  {item.lastVerified
                    ? `Checked by you: ${formatDate(item.lastVerified)}`
                    : "Source checked date not recorded"}
                </span>
              </p>
            </article>
          );
        })}
      </div>
      <p className="small muted">
        Renewal prompts begin 30 days before the recorded expiry. Source review
        prompts begin 180 days after your last check; these are planning
        intervals, not official validity periods.
      </p>
      {editing && (
        <ProfessionalDialog
          title={editing === "new" ? "Add qualification" : "Edit qualification"}
          onClose={() => setEditing(null)}
        >
          <form className="professional-modal-body" onSubmit={save}>
            <label className="field">
              Qualification title
              <input
                value={draft.title}
                autoFocus
                required
                onChange={(event) => update("title", event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Qualification category
                <select
                  value={draft.area}
                  onChange={(event) =>
                    update(
                      "area",
                      event.target.value as CareerRequirement["area"],
                    )
                  }
                >
                  {CAREER_REQUIREMENT_AREAS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Qualification status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    update(
                      "status",
                      event.target.value as CareerRequirement["status"],
                    )
                  }
                >
                  <option>Planned</option>
                  <option>In progress</option>
                  <option>Complete</option>
                </select>
              </label>
              <label className="field">
                Qualification due date
                <input
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={draft.dueDate}
                  onChange={(event) => update("dueDate", event.target.value)}
                />
              </label>
              <label className="field">
                Actual completion date
                <input
                  type="date"
                  min="0001-01-01"
                  max={today}
                  value={draft.completedDate}
                  onChange={(event) =>
                    update("completedDate", event.target.value)
                  }
                />
              </label>
              <label className="field">
                Qualification expiry date
                <input
                  type="date"
                  min={draft.completedDate || "0001-01-01"}
                  max="9999-12-31"
                  value={draft.expiresDate}
                  onChange={(event) =>
                    update("expiresDate", event.target.value)
                  }
                />
              </label>
            </div>
            <label className="field">
              Evidence or record reference
              <textarea
                value={draft.evidence}
                placeholder="Where is the completion record, certificate, or example?"
                onChange={(event) => update("evidence", event.target.value)}
              />
            </label>
            <label className="field">
              Qualification notes
              <textarea
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </label>
            <fieldset className="career-readiness-scope">
              <legend>Recorded applicability</legend>
              <div className="form-grid">
                <label className="field">
                  Qualification service
                  <select
                    value={draft.service}
                    onChange={(event) =>
                      update(
                        "service",
                        event.target.value as CareerRequirement["service"],
                      )
                    }
                  >
                    <option>Any</option>
                    <option>Air Force</option>
                    <option>Space Force</option>
                  </select>
                </label>
                <label className="field">
                  Qualification component
                  <select
                    value={draft.component}
                    onChange={(event) =>
                      update(
                        "component",
                        event.target.value as CareerRequirement["component"],
                      )
                    }
                  >
                    <option>Any</option>
                    <option>Active Duty</option>
                    <option>Guard</option>
                    <option>Reserve</option>
                  </select>
                </label>
                <label className="field">
                  Qualification rank
                  <input
                    value={draft.rank}
                    placeholder="Blank for any rank"
                    onChange={(event) => update("rank", event.target.value)}
                  />
                </label>
                <label className="field">
                  Qualification AFSC or specialty
                  <input
                    value={draft.afsc}
                    placeholder="Blank for any specialty"
                    onChange={(event) => update("afsc", event.target.value)}
                  />
                </label>
              </div>
              <p className="small muted">
                Rank aliases match the same enlisted grade. Specialty codes
                match exactly, ignoring spaces and punctuation.
              </p>
            </fieldset>
            <label className="field">
              Qualification source URL
              <input
                type="url"
                value={draft.sourceUrl}
                placeholder="https://"
                onChange={(event) => update("sourceUrl", event.target.value)}
              />
            </label>
            <label className="field">
              Qualification source checked date
              <input
                type="date"
                min="0001-01-01"
                max={today}
                value={draft.lastVerified}
                onChange={(event) => update("lastVerified", event.target.value)}
              />
            </label>
            <p className="small muted">
              Enter when you actually reviewed this source. Saving a record does
              not verify current policy.
            </p>
            {error && (
              <p className="error-text small" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save qualification
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {removing && (
        <ProfessionalDialog
          title="Remove qualification?"
          onClose={() => setRemoving(null)}
        >
          <p>
            Remove “{removing.title}” and its recorded evidence from this
            planner?
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRemoving(null)}
            >
              Keep qualification
            </button>
            <button
              className="button danger"
              onClick={() => {
                const applied = mutate((next) => {
                  next.careerRequirements = next.careerRequirements.filter(
                    (item) => item.id !== removing.id,
                  );
                });
                if (applied) setRemoving(null);
              }}
            >
              Remove qualification
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </section>
  );
}
