import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import {
  AUTO_LOCK_MINUTES,
  IncorrectPasscodeError,
  PLANNER_STORAGE_KEY,
  eraseVault,
  isVaultConfigured,
  isVaultUnlocked,
  lockVault,
  unlockVault,
} from "../lib/vault";
import {
  deleteAllAutomaticBackups,
  saveAutomaticBackup,
} from "../lib/automatic-backups";
import "./vault.css";

/** Keeps the planner closed until the passcode lock, if on, is unlocked. */
export default function VaultGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(
    () => !isVaultConfigured() || isVaultUnlocked(),
  );
  useAutoLock(open);
  if (open) return <>{children}</>;
  return <UnlockScreen onUnlocked={() => setOpen(true)} />;
}

/** Locks after the app has been in the background for a while. */
function useAutoLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let hiddenAt: number | null = null;
    function visibility() {
      if (!isVaultUnlocked()) return;
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (
        hiddenAt !== null &&
        Date.now() - hiddenAt >= AUTO_LOCK_MINUTES * 60_000
      )
        void lockVault();
      hiddenAt = null;
    }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [active]);
}

/** Moves any plaintext copy left beside the lock into an encrypted copy. */
async function secureLeftoverPlaintext() {
  let leftover: string | null = null;
  try {
    leftover = window.localStorage.getItem(PLANNER_STORAGE_KEY);
  } catch {
    return;
  }
  if (leftover === null) return;
  try {
    await saveAutomaticBackup(leftover, "Unencrypted copy found when unlocking");
    window.localStorage.removeItem(PLANNER_STORAGE_KEY);
  } catch {
    // Keep it rather than risk losing data; Settings explains how to recover.
  }
}

function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eraseText, setEraseText] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError("");
    try {
      await unlockVault(passcode);
      setPasscode("");
      await secureLeftoverPlaintext();
      onUnlocked();
    } catch (problem) {
      setError(
        problem instanceof IncorrectPasscodeError
          ? problem.message
          : problem instanceof Error
            ? problem.message
            : "Your planner could not be unlocked.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    if (eraseText !== "ERASE") return;
    eraseVault();
    await deleteAllAutomaticBackups().catch(() => {});
    onUnlocked();
  }

  return (
    <main className="vault-screen" aria-labelledby="vault-title">
      <form className="vault-card" onSubmit={submit}>
        <span className="vault-icon" aria-hidden="true">
          <LockKeyhole size={28} />
        </span>
        <h1 id="vault-title">Enlisted Planner is locked</h1>
        <p className="muted">
          Enter your passcode to decrypt your planner on this device.
        </p>
        <label className="field">
          <span>Passcode</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={busy || !passcode}
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <details className="vault-forgot">
          <summary>Forgot your passcode?</summary>
          <p className="small muted">
            Your planner is encrypted with your passcode, so it cannot be
            recovered without it. You can erase the encrypted planner and its
            recovery copies on this device and start over, then import a JSON
            backup if you exported one.
          </p>
          <label className="field">
            <span>Type ERASE to confirm</span>
            <input
              value={eraseText}
              onChange={(event) => setEraseText(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button danger-outline"
            disabled={eraseText !== "ERASE"}
            onClick={() => void erase()}
          >
            Erase encrypted planner
          </button>
        </details>
      </form>
    </main>
  );
}
