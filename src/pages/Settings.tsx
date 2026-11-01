import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Download,
  FileText,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { parsePlannerData, usePlanner } from "../lib/planner";
import { localDate, formatDate } from "../lib/dates";
import type { PlannerState, Profile } from "../lib/types";
import "./tools-settings.css";
import BackupRecovery from "./BackupRecovery";
import PasscodeLock from "./PasscodeLock";

const airForceRanks = [
  "AB",
  "Amn",
  "A1C",
  "SrA",
  "SSgt",
  "TSgt",
  "MSgt",
  "SMSgt",
  "CMSgt",
];
const spaceForceRanks = [
  "Spc1",
  "Spc2",
  "Spc3",
  "Spc4",
  "Sgt",
  "TSgt",
  "MSgt",
  "SMSgt",
  "CMSgt",
];

function isSupportedDate(value: string): boolean {
  try {
    formatDate(value);
    return true;
  } catch {
    return false;
  }
}

function Confirmation({
  title,
  children,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal settings-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-confirmation-title"
        ref={dialog}
      >
        <div className="modal-header">
          <h2 id="settings-confirmation-title">{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close confirmation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="confirmation-content">{children}</div>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            ref={cancel}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="button" className="button danger" onClick={onConfirm}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { state, mutate, exportData, importData, reset, storageError } =
    usePlanner();
  const [profile, setProfile] = useState<Profile>({ ...state.profile });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"import" | "reset" | null>(
    null,
  );
  const [pending, setPending] = useState<{
    raw: string;
    state: PlannerState;
    fileName: string;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ranks =
    profile.service === "Air Force" ? airForceRanks : spaceForceRanks;

  useEffect(() => {
    setProfile({ ...state.profile });
  }, [state.profile]);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      [profile.dateOfRank, profile.dateOfEntry].some(
        (date) => date && (!isSupportedDate(date) || date > localDate()),
      )
    ) {
      setError(
        "Choose valid career dates between January 1, year 1, and today.",
      );
      return;
    }
    if (
      profile.dateOfRank &&
      profile.dateOfEntry &&
      profile.dateOfRank < profile.dateOfEntry
    ) {
      setError(
        "Date of rank cannot be before your date of entry. Check both dates.",
      );
      return;
    }
    mutate((draft) => {
      draft.profile = { ...profile, name: profile.name.trim() };
    });
    setMessage("Profile saved in this browser.");
  }

  function downloadBackup() {
    const data = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `enlisted-planner-${localDate()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup download started. Keep it somewhere safe.");
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a planner JSON backup smaller than 10 MB.");
      const raw = await file.text();
      const parsed = parsePlannerData(raw);
      setPending({ raw, state: parsed, fileName: file.name });
      setConfirmation("import");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The backup could not be read. Choose an exported planner JSON file.",
      );
    }
  }

  function confirmImport() {
    if (!pending) return;
    try {
      importData(pending.raw);
      setConfirmation(null);
      setPending(null);
      setMessage("Backup imported. Your previous plan has been replaced.");
    } catch (caught) {
      setConfirmation(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Import failed. Your current plan has not been changed.",
      );
    }
  }

  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>Settings</h1>
          <p>Your profile, your planner, your data.</p>
        </div>
      </header>
      <BackupRecovery />
      <div className="settings-columns">
        <section className="panel" aria-labelledby="profile-heading">
          <div className="panel-heading">
            <div className="tool-heading">
              <span className="tool-icon">
                <UserRound size={22} />
              </span>
              <div>
                <h2 id="profile-heading">Your profile</h2>
                <p className="muted">Keep your career context up to date.</p>
              </div>
            </div>
          </div>
          <form onSubmit={saveProfile}>
            <label className="field">
              <span>AFSC or specialty</span>
              <input
                value={profile.afsc ?? ""}
                maxLength={40}
                onChange={(event) =>
                  setProfile({ ...profile, afsc: event.target.value })
                }
                placeholder="Your current specialty code"
              />
            </label>
            <label className="field">
              <span>
                Preferred name <span className="muted">(optional)</span>
              </span>
              <input
                autoComplete="given-name"
                value={profile.name}
                maxLength={80}
                onChange={(event) =>
                  setProfile({ ...profile, name: event.target.value })
                }
                placeholder="What should we call you?"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Service</span>
                <select
                  value={profile.service}
                  onChange={(event) => {
                    const service = event.target.value as Profile["service"];
                    const oldRanks =
                      profile.service === "Air Force"
                        ? airForceRanks
                        : spaceForceRanks;
                    const newRanks =
                      service === "Air Force" ? airForceRanks : spaceForceRanks;
                    const index = oldRanks.indexOf(profile.rank);
                    setProfile({
                      ...profile,
                      service,
                      rank: index >= 0 ? newRanks[index] : "",
                    });
                  }}
                >
                  <option>Air Force</option>
                  <option>Space Force</option>
                </select>
              </label>
              <label className="field">
                <span>Rank</span>
                <select
                  value={profile.rank}
                  onChange={(event) =>
                    setProfile({ ...profile, rank: event.target.value })
                  }
                >
                  <option value="">Select rank</option>
                  {!ranks.includes(profile.rank) && profile.rank && (
                    <option value={profile.rank}>{profile.rank}</option>
                  )}
                  {ranks.map((rank) => (
                    <option key={rank}>{rank}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Component</span>
                <select
                  value={profile.component}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      component: event.target.value as Profile["component"],
                    })
                  }
                >
                  <option>Active Duty</option>
                  <option>Guard</option>
                  <option>Reserve</option>
                </select>
              </label>
              <label className="field">
                <span>Primary role</span>
                <select
                  value={profile.role}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      role: event.target.value as Profile["role"],
                    })
                  }
                >
                  <option>Individual</option>
                  <option>Supervisor</option>
                  <option>Senior leader</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Date of rank <span className="muted">(optional)</span>
                </span>
                <input
                  type="date"
                  min="0001-01-01"
                  value={profile.dateOfRank}
                  max={localDate()}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value || isSupportedDate(value))
                      setProfile({ ...profile, dateOfRank: value });
                  }}
                />
              </label>
              <label className="field">
                <span>
                  Date of entry <span className="muted">(optional)</span>
                </span>
                <input
                  type="date"
                  min="0001-01-01"
                  value={profile.dateOfEntry}
                  max={localDate()}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value || isSupportedDate(value))
                      setProfile({ ...profile, dateOfEntry: value });
                  }}
                />
              </label>
            </div>
            <p className="muted small">
              Your role helps frame your planning. Every feature remains
              available to you.
            </p>
            <button className="button primary" type="submit">
              Save profile
            </button>
          </form>
        </section>
        <div className="settings-stack">
          <section className="panel" aria-labelledby="data-heading">
            <div className="panel-heading">
              <div className="tool-heading">
                <span className="tool-icon">
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <h2 id="data-heading">Your data stays with you</h2>
                  <p className="muted">Local storage. No account required.</p>
                </div>
              </div>
            </div>
            <p>
              Planner entries are saved in this browser on this device. Export a
              backup regularly, especially before changing devices or clearing
              browser data.
            </p>
            <p className="small muted">
              Your exported JSON contains the profile and planner details you
              entered. Store it securely. Importing a backup replaces all
              current planner data.
            </p>
            <div className="backup-actions">
              <button
                type="button"
                className="button primary"
                onClick={downloadBackup}
              >
                <Download size={17} />
                Export backup
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={17} />
                Import backup
              </button>
            </div>
            <input
              className="visually-hidden"
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="Choose planner backup"
              onChange={selectBackup}
            />
            {storageError && (
              <p className="error-text" role="alert">
                {storageError}
              </p>
            )}
            <div className="local-first-note">
              <strong>Planning offline</strong>
              <p className="muted small">
                Once the app is loaded, you can work with local planner entries
                without an internet connection. External resources may require a
                connection. Browser storage is not a substitute for a backup.
              </p>
            </div>
          </section>
          <PasscodeLock />
          <section
            className="panel reset-panel"
            aria-labelledby="reset-heading"
          >
            <div>
              <h2 id="reset-heading">Reset planner</h2>
              <p className="muted">
                Remove your profile and entries from this browser and start
                fresh.
              </p>
            </div>
            <button
              type="button"
              className="button danger-outline"
              onClick={() => setConfirmation("reset")}
            >
              <Trash2 size={16} />
              Reset all data
            </button>
          </section>
        </div>
      </div>
      {error && (
        <div className="settings-feedback error-text" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="settings-feedback" role="status">
          {message}
        </p>
      )}
      <section className="panel about-panel" aria-labelledby="about-heading">
        <div>
          <span className="eyebrow">
            ONE AIRMAN. ONE PLANNER. AN ENTIRE CAREER.
          </span>
          <h2 id="about-heading">About Enlisted Planner</h2>
          <p>
            A personal and professional planning companion for enlisted Airmen
            and Guardians.
          </p>
          <p className="small muted">Created by John Garcia.</p>
        </div>
        <div className="about-details">
          <p className="small muted">
            This is an unofficial personal planning application. Estimates and
            manually entered dates are not official personnel determinations.
            Confirm career eligibility, deadlines, and fitness requirements with
            the applicable official sources and your unit.
          </p>
          <p className="small muted">
            Keep entries appropriate for personal planning. Do not enter
            classified, controlled, or otherwise unauthorized information.
          </p>
          <a
            className="button secondary reference-link"
            href={`${import.meta.env.BASE_URL}reference/2026-usaf-planner.pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={17} />
            Open 2026 planner reference
          </a>
        </div>
      </section>
      {confirmation === "import" && pending && (
        <Confirmation
          title="Replace your planner with this backup?"
          action="Replace and import"
          onClose={() => {
            setConfirmation(null);
            setPending(null);
          }}
          onConfirm={confirmImport}
        >
          <p>
            The backup passed validation. Importing{" "}
            <strong>{pending.fileName}</strong> will replace your current
            profile and all planner entries.
          </p>
          <dl className="import-summary">
            <div>
              <dt>Profile</dt>
              <dd>{pending.state.profile.name || "No name set"}</dd>
            </div>
            <div>
              <dt>Time blocks</dt>
              <dd>{pending.state.blocks.length}</dd>
            </div>
            <div>
              <dt>Tasks & events</dt>
              <dd>
                {pending.state.tasks.length + pending.state.events.length}
              </dd>
            </div>
            <div>
              <dt>Captures & goals</dt>
              <dd>
                {pending.state.captures.length + pending.state.goals.length}
              </dd>
            </div>
            <div>
              <dt>Habits & members</dt>
              <dd>
                {pending.state.habits.length + pending.state.members.length}
              </dd>
            </div>
            <div>
              <dt>Projects, priorities & taskers</dt>
              <dd>
                {pending.state.projects.length +
                  pending.state.objectives.length +
                  pending.state.tasks.length}
              </dd>
            </div>
            <div>
              <dt>Contacts & development plans</dt>
              <dd>
                {pending.state.contacts.length +
                  pending.state.developmentActions.length +
                  pending.state.disciplinePlans.length}
              </dd>
            </div>
            <div>
              <dt>Meetings, rhythms & career plans</dt>
              <dd>
                {pending.state.meetings.length +
                  pending.state.battleRhythms.length +
                  pending.state.careerPlans.length}
              </dd>
            </div>
            <div>
              <dt>Weekly reviews, qualifications & shared taskers</dt>
              <dd>
                {pending.state.weeklyReviews.length +
                  pending.state.careerRequirements.length +
                  pending.state.delegations.length}
              </dd>
            </div>
          </dl>
          <p className="small muted">
            Export your current plan first if you want to keep it. This
            replacement cannot be undone without a backup.
          </p>
        </Confirmation>
      )}
      {confirmation === "reset" && (
        <Confirmation
          title="Reset all planner data?"
          action="Reset all data"
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            reset();
            setConfirmation(null);
            setError("");
            setMessage(
              "Current planner reset. Automatic recovery copies remain available until you delete them in Backup recovery.",
            );
          }}
        >
          <p>
            This will remove your profile, time blocks, tasks, calendar events,
            captures, goals, projects, priorities, contacts, development and
            discipline preparation plans, meetings, battle rhythms, career
            plans, qualifications, weekly reviews, shared taskers, leadership
            records, preferences, and tool inputs from this browser.
          </p>
          <p className="small muted">
            This resets your current planner. Automatic recovery copies remain
            in this browser; delete them separately in Backup recovery if you
            want to remove that history too.
          </p>
        </Confirmation>
      )}
    </div>
  );
}
