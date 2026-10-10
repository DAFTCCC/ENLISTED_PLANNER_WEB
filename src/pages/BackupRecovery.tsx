import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Download, RefreshCw, Trash2 } from "lucide-react";
import { parsePlannerData, usePlanner } from "../lib/planner";
import {
  backupStorageMessage,
  deleteAllAutomaticBackups,
  deleteAutomaticBackup,
  listAutomaticBackups,
  listenForBackupChanges,
  readAutomaticBackup,
  saveAutomaticBackup,
  type BackupSummary,
} from "../lib/automatic-backups";
import ProfessionalDialog from "./ProfessionalDialog";
import { useAutomaticBackupStatus } from "./AutomaticBackups";
import "./backup-recovery.css";

function createdLabel(value: string | null): string {
  if (!value) return "Unknown save time";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function download(raw: string, id: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `enlisted-planner-recovery-${id.replace(/[^a-zA-Z0-9-]/g, "")}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BackupRecovery() {
  const { state, importData } = usePlanner();
  const backupStatus = useAutomaticBackupStatus();
  const [copies, setCopies] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [pending, setPending] = useState<{
    kind: "restore" | "delete" | "delete-all";
    copy: BackupSummary;
    raw?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCopies(await listAutomaticBackups());
      setAvailabilityError("");
    } catch (failure) {
      setAvailabilityError(backupStorageMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return listenForBackupChanges(() => void refresh());
  }, [refresh]);

  async function prepareRestore(copy: BackupSummary) {
    setBusy(true);
    setError("");
    try {
      const raw = await readAutomaticBackup(copy.id);
      parsePlannerData(raw);
      setPending({ kind: "restore", copy, raw });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This copy could not be validated. Your current plan was preserved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      if (pending.kind === "restore") {
        // Protect the plan being replaced. If recovery storage fails, stop and
        // let the user export the current plan before retrying a replacement.
        await saveAutomaticBackup(
          JSON.stringify(state),
          "Before recovery restore",
        );
        parsePlannerData(pending.raw!);
        importData(pending.raw!);
        setMessage(
          "Recovery copy restored. Your previous plan is also retained as a recovery copy.",
        );
      } else if (pending.kind === "delete-all") {
        await deleteAllAutomaticBackups();
        setMessage(
          "All recovery copies deleted. Your current planner was preserved. A new copy will be saved after your next planner edit.",
        );
      } else {
        await deleteAutomaticBackup(pending.copy.id);
        setMessage(
          "Recovery copy deleted. Your current planner was preserved.",
        );
      }
      setPending(null);
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The action could not finish. Your current planner was preserved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCopy(copy: BackupSummary) {
    try {
      download(await readAutomaticBackup(copy.id), copy.id);
      setMessage(
        "Recovery copy downloaded. Store it somewhere separate from this browser.",
      );
    } catch (failure) {
      setError(backupStorageMessage(failure));
    }
  }

  return (
    <section
      className="panel backup-recovery"
      aria-labelledby="recovery-heading"
    >
      <div className="panel-heading">
        <div>
          <h2 id="recovery-heading">Automatic recovery copies</h2>
          <p className="muted small">
            Up to 12 recent copies, within 32 MB, stay on this device. Clearing
            browser data removes them too. Download a copy for a separate
            backup.
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh recovery copies"
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {backupStatus.lastSavedAt && (
        <p className="small muted">
          Last automatic copy: {createdLabel(backupStatus.lastSavedAt)}
        </p>
      )}
      {loading && <p role="status">Reading recovery copies…</p>}
      {!loading && !copies.length && !error && (
        <p className="muted">
          Your first recovery copy will appear after you save planner entries.
        </p>
      )}
      <div className="recovery-list">
        {copies.map((copy) => (
          <article
            className="recovery-copy"
            key={copy.id}
            aria-label={`Recovery copy ${createdLabel(copy.createdAt)}`}
          >
            <div>
              <h3>{createdLabel(copy.createdAt)}</h3>
              <p className="small muted">
                {copy.reason} · {Math.max(1, Math.ceil(copy.bytes / 1024))} KB
              </p>
              {!copy.readable && (
                <p className="error-text small">
                  {copy.problem} Download its original contents before deleting
                  it.
                </p>
              )}
            </div>
            <div className="recovery-copy-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => void downloadCopy(copy)}
                disabled={busy}
                aria-label={`Download recovery copy ${createdLabel(copy.createdAt)}`}
              >
                <Download size={16} /> Download
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => void prepareRestore(copy)}
                disabled={busy || !copy.readable}
                aria-label={`Restore recovery copy ${createdLabel(copy.createdAt)}`}
              >
                <ArchiveRestore size={16} /> Restore
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setPending({ kind: "delete", copy })}
                disabled={busy}
                aria-label={`Delete recovery copy ${createdLabel(copy.createdAt)}`}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {copies.length > 0 && (
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => setPending({ kind: "delete-all", copy: copies[0] })}
        >
          <Trash2 size={16} /> Delete all recovery copies
        </button>
      )}
      {message && (
        <p className="success-text" role="status">
          {message}
        </p>
      )}
      {availabilityError && (
        <p className="error-text" role="status">
          {availabilityError}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <ProfessionalDialog
          title={
            pending.kind === "restore"
              ? "Restore this recovery copy?"
              : pending.kind === "delete-all"
                ? "Delete all recovery copies?"
                : "Delete this recovery copy?"
          }
          onClose={() => !busy && setPending(null)}
        >
          <p>
            {pending.kind === "restore"
              ? "This replaces all current planner entries. A recovery copy of your current plan will be saved first."
              : pending.kind === "delete-all"
                ? "This permanently deletes every recovery copy, including unreadable copies. Download anything you want to keep first. Your current planner entries stay as they are."
                : "This permanently removes this recovery copy. Your current planner entries stay as they are."}
          </p>
          {pending.kind !== "delete-all" && (
            <p>
              <strong>{createdLabel(pending.copy.createdAt)}</strong> ·{" "}
              {pending.copy.reason}
            </p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
            >
              {busy
                ? "Working…"
                : pending.kind === "restore"
                  ? "Replace with recovery copy"
                  : pending.kind === "delete-all"
                    ? "Permanently delete all copies"
                    : "Delete recovery copy"}
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </section>
  );
}
