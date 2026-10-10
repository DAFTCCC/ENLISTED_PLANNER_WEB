import { parsePlannerData } from "./planner";

export const BACKUP_DATABASE = "enlisted-planner-recovery";
export const BACKUP_STORE = "snapshots";
export const BACKUP_LIMIT = 12;
export const BACKUP_BYTE_LIMIT = 32 * 1024 * 1024;

export interface AutomaticBackup {
  id: string;
  createdAt: string;
  reason: string;
  raw: string;
  bytes: number;
  sequence?: number;
}

export interface BackupSummary {
  id: string;
  createdAt: string | null;
  reason: string;
  bytes: number;
  readable: boolean;
  problem?: string;
}

export interface AutomaticBackupStatus {
  phase: "idle" | "saving" | "ready" | "unavailable";
  lastSavedAt: string | null;
  message: string;
}

const changedEvent = "enlisted-planner-backups-changed";
const listeners = new Set<() => void>();
let pendingWrite: Promise<void> = Promise.resolve();

function queueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation, operation);
  pendingWrite = result.then(
    () => {},
    () => {},
  );
  return result;
}
let status: AutomaticBackupStatus = {
  phase: "idle",
  lastSavedAt: null,
  message: "Automatic copies are kept in this browser after planner changes.",
};

export function getAutomaticBackupStatus(): AutomaticBackupStatus {
  return status;
}

export function subscribeAutomaticBackups(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener(changedEvent, listener);
  };
}

function notify(next?: AutomaticBackupStatus) {
  if (next) status = next;
  for (const listener of listeners) listener();
}

function publishChange() {
  window.dispatchEvent(new Event(changedEvent));
  // Other open tabs use the same IndexedDB database.
  try {
    const channel = new BroadcastChannel(changedEvent);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Browsers without BroadcastChannel still refresh when Settings is opened.
  }
}

export function listenForBackupChanges(listener: () => void): () => void {
  window.addEventListener(changedEvent, listener);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(changedEvent);
    channel.onmessage = listener;
  } catch {
    // No cross-tab channel is required to retain recovery copies.
  }
  return () => {
    window.removeEventListener(changedEvent, listener);
    channel?.close();
  };
}

export function backupStorageMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError")
    return "Automatic recovery storage is full. Download a backup and remove older recovery copies in Settings.";
  if (name === "SecurityError" || name === "InvalidStateError")
    return "This browser is blocking automatic recovery storage. Export a JSON backup before closing the planner.";
  return "Automatic recovery copies could not be saved or read. Export a JSON backup before closing the planner.";
}

async function openBackupDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    throw new Error("IndexedDB is unavailable");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DATABASE, 1);
    let settled = false;
    const timeout = window.setTimeout(() => {
      settled = true;
      reject(new Error("Recovery storage did not respond"));
    }, 5000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BACKUP_STORE))
        request.result.createObjectStore(BACKUP_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      window.clearTimeout(timeout);
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      window.clearTimeout(timeout);
      settled = true;
      reject(request.error ?? new Error("Recovery storage could not open"));
    };
    request.onblocked = () => {
      window.clearTimeout(timeout);
      settled = true;
      reject(new Error("Another tab is blocking recovery storage"));
    };
  });
}

function isBackup(value: unknown): value is AutomaticBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AutomaticBackup>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === "string" &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    typeof candidate.reason === "string" &&
    typeof candidate.raw === "string" &&
    typeof candidate.bytes === "number" &&
    (candidate.sequence === undefined ||
      (Number.isSafeInteger(candidate.sequence) && candidate.sequence >= 0)) &&
    candidate.bytes === new TextEncoder().encode(candidate.raw).byteLength
  );
}

function newestFirst(a: AutomaticBackup, b: AutomaticBackup): number {
  return (
    (b.sequence ?? 0) - (a.sequence ?? 0) ||
    b.createdAt.localeCompare(a.createdAt) ||
    b.id.localeCompare(a.id)
  );
}

function inspectBackup(value: unknown, key: IDBValidKey): BackupSummary {
  const id = typeof key === "string" ? key : String(key);
  if (!isBackup(value))
    return {
      id,
      createdAt: null,
      reason: "Unrecognized recovery copy",
      bytes: 0,
      readable: false,
      problem: "Its stored format could not be read. It has been preserved.",
    };
  try {
    parsePlannerData(value.raw);
    return {
      id: value.id,
      createdAt: value.createdAt,
      reason: value.reason,
      bytes: value.bytes,
      readable: true,
    };
  } catch (error) {
    return {
      id: value.id,
      createdAt: value.createdAt,
      reason: value.reason,
      bytes: value.bytes,
      readable: false,
      problem: error instanceof Error ? error.message : "This copy is invalid.",
    };
  }
}

/** Retain recent usable snapshots; never silently delete unrecognized data. */
export function chooseBackupRetention(
  backups: AutomaticBackup[],
  added: AutomaticBackup,
): { keep: AutomaticBackup[]; remove: string[] } {
  const sorted = [
    ...backups.filter((copy) => copy.id !== added.id),
    added,
  ].sort(newestFirst);
  const keep: AutomaticBackup[] = [];
  let bytes = 0;
  for (const copy of sorted) {
    if (keep.length >= BACKUP_LIMIT || bytes + copy.bytes > BACKUP_BYTE_LIMIT)
      continue;
    keep.push(copy);
    bytes += copy.bytes;
  }
  return {
    keep,
    remove: backups
      .filter((copy) => !keep.some((retained) => retained.id === copy.id))
      .map((copy) => copy.id),
  };
}

/** Strict planner validation strips no data and rejects external credentials. */
export function saveAutomaticBackup(
  raw: string,
  reason = "Automatic",
): Promise<BackupSummary> {
  return queueWrite(() => saveBackupSnapshot(raw, reason));
}

async function saveBackupSnapshot(
  raw: string,
  reason: string,
): Promise<BackupSummary> {
  try {
    const canonical = JSON.stringify(parsePlannerData(raw));
    const candidate: AutomaticBackup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      raw: canonical,
      bytes: new TextEncoder().encode(canonical).byteLength,
    };
    notify({ ...status, phase: "saving", message: "Saving a recovery copy…" });
    const db = await openBackupDatabase();
    const saved = await new Promise<BackupSummary>((resolve, reject) => {
      const transaction = db.transaction(BACKUP_STORE, "readwrite");
      const store = transaction.objectStore(BACKUP_STORE);
      const request = store.getAll();
      let result: BackupSummary;
      let preserved = 0;
      request.onsuccess = () => {
        try {
          const readable = (request.result as unknown[]).filter((copy) => {
            if (!isBackup(copy)) return false;
            try {
              parsePlannerData(copy.raw);
              return true;
            } catch {
              return false;
            }
          }) as AutomaticBackup[];
          preserved = request.result.length - readable.length;
          const latest = [...readable].sort(newestFirst)[0];
          if (latest?.raw === canonical) {
            result = inspectBackup(latest, latest.id);
            return;
          }
          candidate.sequence = (latest?.sequence ?? 0) + 1;
          const retention = chooseBackupRetention(readable, candidate);
          if (!retention.keep.some((copy) => copy.id === candidate.id))
            throw new Error("This recovery copy exceeds the storage limit");
          store.put(candidate);
          for (const id of retention.remove) store.delete(id);
          result = inspectBackup(candidate, candidate.id);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => {
        db.close();
        notify({
          phase: "ready",
          lastSavedAt: result.createdAt,
          message: preserved
            ? `${preserved} unreadable recovery ${preserved === 1 ? "copy was" : "copies were"} preserved. Review recovery copies in Settings.`
            : "Recent recovery copies are available in Settings.",
        });
        publishChange();
        resolve(result);
      };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error("Recovery copy was not saved"));
      };
    });
    return saved;
  } catch (error) {
    notify({
      ...status,
      phase: "unavailable",
      message: backupStorageMessage(error),
    });
    throw error;
  }
}

export async function listAutomaticBackups(): Promise<BackupSummary[]> {
  const db = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE, "readonly");
    const store = transaction.objectStore(BACKUP_STORE);
    const values = store.getAll();
    const keys = store.getAllKeys();
    transaction.oncomplete = () => {
      db.close();
      const summaries = values.result
        .map((value, index) => ({
          summary: inspectBackup(value, keys.result[index]),
          sequence: isBackup(value) ? (value.sequence ?? 0) : 0,
        }))
        .sort(
          (a, b) =>
            b.sequence - a.sequence ||
            (b.summary.createdAt ?? "").localeCompare(
              a.summary.createdAt ?? "",
            ),
        )
        .map(({ summary }) => summary);
      resolve(summaries);
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ?? new Error("Recovery copies could not be read"),
      );
    };
  });
}

/** Raw bytes remain downloadable even when a copy cannot be restored. */
export async function readAutomaticBackup(id: string): Promise<string> {
  const db = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE, "readonly");
    const request = transaction.objectStore(BACKUP_STORE).get(id);
    transaction.oncomplete = () => {
      db.close();
      if (request.result === undefined) {
        reject(
          new Error("This recovery copy no longer exists. Refresh the list."),
        );
        return;
      }
      const value = request.result as { raw?: unknown };
      resolve(
        typeof value.raw === "string"
          ? value.raw
          : JSON.stringify(request.result),
      );
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ?? new Error("This recovery copy could not be read"),
      );
    };
  });
}

export function deleteAutomaticBackup(id: string): Promise<void> {
  return queueWrite(() => removeBackupSnapshot(id));
}

async function removeBackupSnapshot(id: string): Promise<void> {
  const db = await openBackupDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE, "readwrite");
    transaction.objectStore(BACKUP_STORE).delete(id);
    transaction.oncomplete = () => {
      db.close();
      publishChange();
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ??
          new Error("This recovery copy could not be deleted"),
      );
    };
  });
}

/** Called only after the user confirms deleting every recovery copy. */
export function deleteAllAutomaticBackups(): Promise<void> {
  return queueWrite(clearBackupSnapshots);
}

async function clearBackupSnapshots(): Promise<void> {
  const db = await openBackupDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE, "readwrite");
    transaction.objectStore(BACKUP_STORE).clear();
    transaction.oncomplete = () => {
      db.close();
      notify({
        phase: "idle",
        lastSavedAt: null,
        message:
          "Recovery copies were deleted. A new copy is created after your next planner edit.",
      });
      publishChange();
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ?? new Error("Recovery copies could not be deleted"),
      );
    };
  });
}
