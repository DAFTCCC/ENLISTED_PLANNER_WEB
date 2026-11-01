/**
 * Optional passcode lock. When turned on, the saved planner and automatic
 * recovery copies are encrypted at rest with AES-GCM. A random data key is
 * wrapped by a key derived from the passcode (PBKDF2-SHA-256), so changing the
 * passcode never re-encrypts the planner itself.
 *
 * With the lock off, every function here passes straight through to the
 * existing plaintext storage key, so saved data and behavior are unchanged.
 */

export const PLANNER_STORAGE_KEY = "enlisted-planner:v1";
export const VAULT_KEY = "enlisted-planner:vault";
export const VAULT_CHANGED_EVENT = "enlisted-planner-vault-changed";
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_PASSCODE_LENGTH = 8;
export const AUTO_LOCK_MINUTES = 10;

const SEAL_PREFIX = "enlisted-planner-sealed:v1:";
const PAYLOAD_CONTEXT = "enlisted-planner:payload:v1";
const SNAPSHOT_CONTEXT = "enlisted-planner:snapshot:v1";
const KEY_CONTEXT = "enlisted-planner:data-key:v1";

interface Sealed {
  iv: string;
  data: string;
}

export interface VaultRecord {
  format: "enlisted-planner-vault";
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  key: Sealed;
  digestSalt: string;
  payload: Sealed | null;
  updatedAt: string;
}

export interface VaultProblem {
  message: string;
  /** True when this tab must stop saving to protect another saved plan. */
  blockWrites: boolean;
}

interface Session {
  dataKey: CryptoKey;
  record: VaultRecord;
  mirror: string | null;
  storedVault: string;
  conflict: boolean;
}

export class IncorrectPasscodeError extends Error {
  constructor() {
    super("That passcode did not unlock your planner.");
    this.name = "IncorrectPasscodeError";
  }
}

let session: Session | null = null;
let writeChain: Promise<void> = Promise.resolve();
const problemListeners = new Set<(problem: VaultProblem) => void>();
let removeStorageListener: (() => void) | null = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api)
    throw new Error(
      "This browser cannot encrypt data here. Use a current browser over HTTPS.",
    );
  return api;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

async function deriveWrappingKey(
  passcode: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    encoder.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  context: string,
): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    key,
    plaintext,
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

async function decrypt(
  key: CryptoKey,
  sealed: Sealed,
  context: string,
): Promise<Uint8Array> {
  const data = await subtle().decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(sealed.iv),
      additionalData: encoder.encode(context),
    },
    key,
    fromBase64(sealed.data),
  );
  return new Uint8Array(data);
}

function isSealedShape(value: unknown): value is Sealed {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Sealed).iv === "string" &&
    typeof (value as Sealed).data === "string"
  );
}

export function parseVaultRecord(raw: string): VaultRecord {
  const value = JSON.parse(raw) as Partial<VaultRecord>;
  if (
    value?.format !== "enlisted-planner-vault" ||
    value.version !== 1 ||
    value.kdf?.name !== "PBKDF2" ||
    value.kdf.hash !== "SHA-256" ||
    !Number.isSafeInteger(value.kdf.iterations) ||
    value.kdf.iterations < 1 ||
    typeof value.kdf.salt !== "string" ||
    !isSealedShape(value.key) ||
    typeof value.digestSalt !== "string" ||
    !(value.payload === null || isSealedShape(value.payload)) ||
    typeof value.updatedAt !== "string"
  )
    throw new Error("The encrypted planner format is not recognized.");
  return value as VaultRecord;
}

function report(problem: VaultProblem) {
  for (const listener of problemListeners) listener(problem);
}

/** Problems found while saving encrypted data in the background. */
export function onVaultProblem(
  listener: (problem: VaultProblem) => void,
): () => void {
  problemListeners.add(listener);
  return () => problemListeners.delete(listener);
}

export function isVaultConfigured(): boolean {
  try {
    return window.localStorage.getItem(VAULT_KEY) !== null;
  } catch {
    return false;
  }
}

export function isVaultUnlocked(): boolean {
  return session !== null;
}

/** The saved planner text, decrypted when the passcode lock is on. */
export function readPlannerRaw(): string | null {
  if (session) return session.mirror;
  return window.localStorage.getItem(PLANNER_STORAGE_KEY);
}

/**
 * Saves planner text. Plain mode writes synchronously exactly as before.
 * Locked mode updates memory now and writes ciphertext in order afterwards.
 */
export function writePlannerRaw(raw: string): void {
  if (!session) {
    if (window.localStorage.getItem(VAULT_KEY) !== null)
      throw new Error(
        "A passcode lock was turned on in another tab. Reload this tab.",
      );
    window.localStorage.setItem(PLANNER_STORAGE_KEY, raw);
    return;
  }
  const active = session;
  active.mirror = raw;
  writeChain = writeChain
    .then(() => persist(active, raw))
    .catch((error: unknown) => {
      report({
        message:
          error instanceof Error && error.name === "QuotaExceededError"
            ? "Your latest changes could not be saved because browser storage is full. Export a backup before closing this page."
            : "Your latest changes could not be encrypted and saved. Export a backup before closing this page.",
        blockWrites: false,
      });
    });
}

async function persist(active: Session, raw: string): Promise<void> {
  if (session !== active || active.conflict) return;
  const payload = await encrypt(
    active.dataKey,
    encoder.encode(raw),
    PAYLOAD_CONTEXT,
  );
  const record: VaultRecord = {
    ...active.record,
    payload,
    updatedAt: new Date().toISOString(),
  };
  const next = JSON.stringify(record);
  if (window.localStorage.getItem(VAULT_KEY) !== active.storedVault) {
    active.conflict = true;
    report({
      message:
        "Your saved planner changed in another tab. This tab’s edits remain available to export, and the other saved plan has been preserved. Reload to continue with the saved plan.",
      blockWrites: true,
    });
    return;
  }
  window.localStorage.setItem(VAULT_KEY, next);
  active.storedVault = next;
  active.record = record;
}

/** Waits until every queued encrypted write has finished. */
export function flushVaultWrites(): Promise<void> {
  return writeChain;
}

function listenForOtherTabs() {
  removeStorageListener?.();
  const handler = (event: StorageEvent) => {
    if (event.key !== VAULT_KEY && event.key !== null) return;
    writeChain = writeChain.then(refreshFromStorage).catch(() => {});
  };
  window.addEventListener("storage", handler);
  removeStorageListener = () => window.removeEventListener("storage", handler);
}

async function refreshFromStorage(): Promise<void> {
  const active = session;
  if (!active) return;
  const raw = window.localStorage.getItem(VAULT_KEY);
  if (raw === active.storedVault) return;
  if (active.conflict) return;
  if (raw === null) {
    active.conflict = true;
    report({
      message:
        "The passcode lock was turned off or erased in another tab. This tab’s plan remains available to export. Reload to continue.",
      blockWrites: true,
    });
    return;
  }
  try {
    const record = parseVaultRecord(raw);
    const mirror = record.payload
      ? decoder.decode(
          await decrypt(active.dataKey, record.payload, PAYLOAD_CONTEXT),
        )
      : null;
    active.record = record;
    active.storedVault = raw;
    active.mirror = mirror;
    window.dispatchEvent(new Event(VAULT_CHANGED_EVENT));
  } catch {
    active.conflict = true;
    report({
      message:
        "The passcode lock changed in another tab. This tab’s plan remains available to export. Reload and unlock to continue.",
      blockWrites: true,
    });
  }
}

async function unwrapDataKey(
  record: VaultRecord,
  passcode: string,
): Promise<Uint8Array> {
  const wrappingKey = await deriveWrappingKey(
    passcode,
    fromBase64(record.kdf.salt),
    record.kdf.iterations,
  );
  try {
    return await decrypt(wrappingKey, record.key, KEY_CONTEXT);
  } catch {
    throw new IncorrectPasscodeError();
  }
}

function readRecord(): { raw: string; record: VaultRecord } {
  const raw = window.localStorage.getItem(VAULT_KEY);
  if (raw === null) throw new Error("The passcode lock is not turned on.");
  return { raw, record: parseVaultRecord(raw) };
}

export async function unlockVault(passcode: string): Promise<void> {
  const { raw, record } = readRecord();
  const rawKey = await unwrapDataKey(record, passcode);
  const dataKey = await importDataKey(rawKey);
  rawKey.fill(0);
  const mirror = record.payload
    ? decoder.decode(await decrypt(dataKey, record.payload, PAYLOAD_CONTEXT))
    : null;
  session = { dataKey, record, mirror, storedVault: raw, conflict: false };
  listenForOtherTabs();
}

/** Confirms a passcode without changing the unlocked session. */
export async function verifyPasscode(passcode: string): Promise<void> {
  const { record } = readRecord();
  (await unwrapDataKey(record, passcode)).fill(0);
}

export function passcodeProblem(passcode: string, confirm: string): string {
  if (passcode.length < MIN_PASSCODE_LENGTH)
    return `Use at least ${MIN_PASSCODE_LENGTH} characters.`;
  if (passcode !== confirm) return "The passcodes do not match.";
  return "";
}

/**
 * Encrypts the saved plan and removes the plaintext copy only after the
 * encrypted copy has been read back and matches exactly.
 */
export async function enableVault(
  passcode: string,
  options: { iterations?: number } = {},
): Promise<void> {
  if (isVaultConfigured()) throw new Error("The passcode lock is already on.");
  if (passcode.length < MIN_PASSCODE_LENGTH)
    throw new Error(`Use at least ${MIN_PASSCODE_LENGTH} characters.`);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const plaintext = window.localStorage.getItem(PLANNER_STORAGE_KEY);
  const salt = randomBytes(16);
  const rawKey = randomBytes(32);
  const wrappingKey = await deriveWrappingKey(passcode, salt, iterations);
  const dataKey = await importDataKey(rawKey);
  const record: VaultRecord = {
    format: "enlisted-planner-vault",
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    key: await encrypt(wrappingKey, rawKey, KEY_CONTEXT),
    digestSalt: toBase64(randomBytes(16)),
    payload:
      plaintext === null
        ? null
        : await encrypt(dataKey, encoder.encode(plaintext), PAYLOAD_CONTEXT),
    updatedAt: new Date().toISOString(),
  };
  rawKey.fill(0);
  if (window.localStorage.getItem(PLANNER_STORAGE_KEY) !== plaintext)
    throw new Error(
      "Your planner changed while the lock was being set up. Try again.",
    );
  const stored = JSON.stringify(record);
  window.localStorage.setItem(VAULT_KEY, stored);
  try {
    const check = parseVaultRecord(
      window.localStorage.getItem(VAULT_KEY) ?? "",
    );
    const roundTrip = check.payload
      ? decoder.decode(await decrypt(dataKey, check.payload, PAYLOAD_CONTEXT))
      : null;
    if (roundTrip !== plaintext) throw new Error("Verification failed");
  } catch {
    window.localStorage.removeItem(VAULT_KEY);
    throw new Error(
      "The encrypted copy could not be verified. Your planner was not changed.",
    );
  }
  window.localStorage.removeItem(PLANNER_STORAGE_KEY);
  session = {
    dataKey,
    record,
    mirror: plaintext,
    storedVault: stored,
    conflict: false,
  };
  listenForOtherTabs();
}

export async function changePasscode(
  current: string,
  next: string,
  options: { iterations?: number } = {},
): Promise<void> {
  if (!session) throw new Error("Unlock the planner first.");
  if (next.length < MIN_PASSCODE_LENGTH)
    throw new Error(`Use at least ${MIN_PASSCODE_LENGTH} characters.`);
  await flushVaultWrites();
  const active = session;
  const { raw, record } = readRecord();
  if (raw !== active.storedVault)
    throw new Error("Your planner changed in another tab. Reload first.");
  const rawKey = await unwrapDataKey(record, current);
  const salt = randomBytes(16);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const wrappingKey = await deriveWrappingKey(next, salt, iterations);
  const updated: VaultRecord = {
    ...record,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    key: await encrypt(wrappingKey, rawKey, KEY_CONTEXT),
    updatedAt: new Date().toISOString(),
  };
  rawKey.fill(0);
  const stored = JSON.stringify(updated);
  window.localStorage.setItem(VAULT_KEY, stored);
  active.record = updated;
  active.storedVault = stored;
}

/**
 * Writes the decrypted plan back as plaintext, then removes the encrypted copy.
 * Recovery copies must be decrypted first (see resealAutomaticBackups).
 */
export async function disableVault(passcode: string): Promise<void> {
  if (!session) throw new Error("Unlock the planner first.");
  await flushVaultWrites();
  await verifyPasscode(passcode);
  const active = session;
  if (active.conflict || window.localStorage.getItem(VAULT_KEY) !== active.storedVault)
    throw new Error("Your planner changed in another tab. Reload first.");
  if (active.mirror === null)
    window.localStorage.removeItem(PLANNER_STORAGE_KEY);
  else window.localStorage.setItem(PLANNER_STORAGE_KEY, active.mirror);
  if (window.localStorage.getItem(PLANNER_STORAGE_KEY) !== active.mirror)
    throw new Error("The planner could not be saved without the lock.");
  window.localStorage.removeItem(VAULT_KEY);
  closeSession();
}

/** Permanently removes the encrypted planner after explicit confirmation. */
export function eraseVault(): void {
  window.localStorage.removeItem(VAULT_KEY);
  closeSession();
}

function closeSession() {
  session = null;
  removeStorageListener?.();
  removeStorageListener = null;
}

/** Finishes saving, then reloads so the key is cleared from memory. */
export async function lockVault(): Promise<void> {
  await flushVaultWrites();
  closeSession();
  window.location.reload();
}

export function isSealed(value: string): boolean {
  return value.startsWith(SEAL_PREFIX);
}

/** Encrypts a recovery copy with the unlocked data key. */
export async function sealForStorage(plaintext: string): Promise<string> {
  if (!session) throw new Error("Unlock the planner first.");
  const sealed = await encrypt(
    session.dataKey,
    encoder.encode(plaintext),
    SNAPSHOT_CONTEXT,
  );
  return `${SEAL_PREFIX}${sealed.iv}:${sealed.data}`;
}

/** Decrypts a sealed recovery copy; plaintext copies are returned unchanged. */
export async function openFromStorage(value: string): Promise<string> {
  if (!isSealed(value)) return value;
  if (!session)
    throw new Error("Unlock the planner to read this encrypted recovery copy.");
  const [iv, data] = value.slice(SEAL_PREFIX.length).split(":");
  try {
    return decoder.decode(
      await decrypt(session.dataKey, { iv, data }, SNAPSHOT_CONTEXT),
    );
  } catch {
    throw new Error(
      "This recovery copy was encrypted with a different passcode lock and cannot be read.",
    );
  }
}

/** Salted digest used to skip duplicate encrypted recovery copies. */
export async function snapshotDigest(plaintext: string): Promise<string> {
  if (!session) throw new Error("Unlock the planner first.");
  const salt = fromBase64(session.record.digestSalt);
  const text = encoder.encode(plaintext);
  const joined = new Uint8Array(salt.length + text.length);
  joined.set(salt);
  joined.set(text, salt.length);
  return toBase64(new Uint8Array(await subtle().digest("SHA-256", joined)));
}

/** Test helper: forget the in-memory session without touching storage. */
export function resetVaultSessionForTests(): void {
  closeSession();
  writeChain = Promise.resolve();
  problemListeners.clear();
}
