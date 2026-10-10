import { useEffect, useSyncExternalStore } from "react";
import { defaultState, usePlanner } from "../lib/planner";
import {
  getAutomaticBackupStatus,
  saveAutomaticBackup,
  subscribeAutomaticBackups,
} from "../lib/automatic-backups";
import "./backup-recovery.css";

export function useAutomaticBackupStatus() {
  return useSyncExternalStore(
    subscribeAutomaticBackups,
    getAutomaticBackupStatus,
    getAutomaticBackupStatus,
  );
}

/** Mount once under PlannerProvider; each committed edit creates a durable copy. */
export default function AutomaticBackups() {
  const { state, storageError } = usePlanner();
  const backup = useAutomaticBackupStatus();
  useEffect(() => {
    // An unreadable primary plan uses a blank fallback. Preserve existing copies
    // rather than backing up that fallback as if it were the user's plan.
    if (storageError?.includes("could not be read")) return;
    const raw = JSON.stringify(state);
    // Only skip the untouched initial plan. All fields, including preferences,
    // qualification records and people, can contain work worth recovering.
    if (raw === JSON.stringify(defaultState())) return;
    void saveAutomaticBackup(raw).catch(() => {
      // The external status displays the failure; primary saving continues.
    });
  }, [state, storageError]);
  if (backup.phase !== "unavailable") return null;
  return (
    <div className="automatic-backup-warning" role="status">
      <strong>Recovery storage needs attention.</strong> {backup.message}{" "}
      <a href="#settings">Open Settings</a>
    </div>
  );
}
