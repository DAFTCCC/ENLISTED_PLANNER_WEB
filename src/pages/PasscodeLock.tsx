import { useState, type FormEvent } from "react";
import { KeyRound, Lock, LockKeyhole } from "lucide-react";
import {
  AUTO_LOCK_MINUTES,
  MIN_PASSCODE_LENGTH,
  changePasscode,
  disableVault,
  enableVault,
  isVaultUnlocked,
  lockVault,
  passcodeProblem,
  verifyPasscode,
} from "../lib/vault";
import { resealAutomaticBackups } from "../lib/automatic-backups";
import { usePlanner } from "../lib/planner";
import "../components/vault.css";

type Mode = "idle" | "change" | "disable";

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** Settings panel for the optional on-device passcode lock. */
export default function PasscodeLock() {
  const { storageError } = usePlanner();
  const [enabled, setEnabled] = useState(isVaultUnlocked);
  const [mode, setMode] = useState<Mode>("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function clear() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setAcknowledged(false);
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
      clear();
      setMode("idle");
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "That did not work.",
      );
    } finally {
      setBusy(false);
    }
  }

  function turnOn(event: FormEvent) {
    event.preventDefault();
    const problem = passcodeProblem(next, confirm);
    if (problem) return setError(problem);
    if (!acknowledged)
      return setError("Confirm that you understand a lost passcode cannot be recovered.");
    if (storageError)
      return setError(
        "Resolve the planner storage message before turning on the lock.",
      );
    void run(async () => {
      await enableVault(next);
      setEnabled(true);
      const sealed = await resealAutomaticBackups("seal").catch(() => -1);
      return sealed < 0
        ? "Passcode lock is on. Your planner is encrypted, but older recovery copies could not be encrypted. Review them below."
        : "Passcode lock is on. Your planner and recovery copies are encrypted on this device.";
    });
  }

  function change(event: FormEvent) {
    event.preventDefault();
    const problem = passcodeProblem(next, confirm);
    if (problem) return setError(problem);
    void run(async () => {
      await changePasscode(current, next);
      return "Passcode changed.";
    });
  }

  function turnOff(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await verifyPasscode(current);
      await resealAutomaticBackups("open");
      await disableVault(current);
      setEnabled(false);
      return "Passcode lock is off. Your planner is stored without encryption in this browser.";
    });
  }

  return (
    <section className="panel" aria-labelledby="passcode-heading">
      <div className="panel-heading">
        <div className="tool-heading">
          <span className="tool-icon">
            <LockKeyhole size={22} />
          </span>
          <div>
            <h2 id="passcode-heading">Passcode lock</h2>
            <p className="muted">
              {enabled
                ? "On. Your planner is encrypted on this device."
                : "Off. Your planner is stored unencrypted in this browser."}
            </p>
          </div>
        </div>
      </div>

      {!enabled && (
        <form className="passcode-lock-form" onSubmit={turnOn}>
          <p>
            Encrypt your planner and its recovery copies on this device. You
            will enter the passcode each time the app opens, and after{" "}
            {AUTO_LOCK_MINUTES} minutes in the background.
          </p>
          <p className="small muted">
            Use a passphrase of at least {MIN_PASSCODE_LENGTH} characters. A
            short PIN can be guessed by someone who copies your browser data.
            JSON backups you export are not encrypted. Store them securely.
          </p>
          <PasswordField
            label="New passcode"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm passcode"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />{" "}
            I understand that if I forget this passcode, my planner cannot be
            recovered. I have exported a backup or accept that risk.
          </label>
          <div className="passcode-lock-actions">
            <button className="button primary" type="submit" disabled={busy}>
              <Lock size={16} />
              {busy ? "Encrypting…" : "Turn on passcode lock"}
            </button>
          </div>
        </form>
      )}

      {enabled && mode === "idle" && (
        <div className="passcode-lock-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => void lockVault()}
          >
            <Lock size={16} />
            Lock now
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setMode("change")}
          >
            <KeyRound size={16} />
            Change passcode
          </button>
          <button
            type="button"
            className="button danger-outline"
            onClick={() => setMode("disable")}
          >
            Turn off
          </button>
        </div>
      )}

      {enabled && mode === "change" && (
        <form className="passcode-lock-form" onSubmit={change}>
          <PasswordField
            label="Current passcode"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          <PasswordField
            label="New passcode"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new passcode"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <div className="passcode-lock-actions">
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Change passcode"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                clear();
                setMode("idle");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {enabled && mode === "disable" && (
        <form className="passcode-lock-form" onSubmit={turnOff}>
          <p className="small muted">
            Your planner will be decrypted and stored without encryption in
            this browser.
          </p>
          <PasswordField
            label="Current passcode"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          <div className="passcode-lock-actions">
            <button
              className="button danger-outline"
              type="submit"
              disabled={busy || !current}
            >
              {busy ? "Decrypting…" : "Turn off passcode lock"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                clear();
                setMode("idle");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
