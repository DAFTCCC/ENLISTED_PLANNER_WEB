import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PlannerState } from "./types";

export const STORAGE_KEY = "enlisted-planner:v1";

export function defaultState(): PlannerState {
  return {
    version: 1,
    profile: {
      name: "",
      service: "Air Force",
      rank: "",
      component: "Active Duty",
      dateOfRank: "",
      dateOfEntry: "",
      role: "Individual",
      onboarded: false,
    },
    blocks: [],
    tasks: [],
    events: [],
    captures: [],
    goals: [],
    members: [],
    budget: {
      income: 0,
      housing: 0,
      transport: 0,
      food: 0,
      insurance: 0,
      debt: 0,
      savings: 0,
      other: 0,
    },
    fitness: {
      distance: 1.5,
      minutes: 0,
      seconds: 0,
      goalMinutes: 0,
      cardioScore: 0,
      strengthScore: 0,
      coreScore: 0,
    },
    habits: [
      {
        id: "habit-movement",
        title: "Make time for movement",
        category: "Fitness",
        completedDates: [],
      },
      {
        id: "habit-capture",
        title: "Capture one accomplishment",
        category: "Education",
        completedDates: [],
      },
      {
        id: "habit-plan",
        title: "Review tomorrow’s plan",
        category: "Mental well-being",
        completedDates: [],
      },
    ],
  };
}

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid planner backup: ${path} ${reason}.`);
}

function object(
  value: unknown,
  path: string,
  keys: string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "must be an object");
  const record = value as Record<string, unknown>;
  for (const key of keys)
    if (!Object.prototype.hasOwnProperty.call(record, key))
      invalid(`${path}.${key}`, "is missing");
  for (const key of Object.keys(record))
    if (!keys.includes(key)) invalid(`${path}.${key}`, "is not supported");
  return record;
}

function string(value: unknown, path: string, nonempty = false): void {
  if (typeof value !== "string" || (nonempty && !value.trim()))
    invalid(path, nonempty ? "must be a nonempty string" : "must be a string");
}

function boolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") invalid(path, "must be true or false");
}

function number(value: unknown, path: string, maximum = Infinity): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  )
    invalid(
      path,
      `must be a finite number between 0 and ${maximum === Infinity ? "the supported numeric limit" : maximum}`,
    );
}

function choice(
  value: unknown,
  path: string,
  choices: readonly string[],
): void {
  if (typeof value !== "string" || !choices.includes(value))
    invalid(path, `must be one of ${choices.join(", ")}`);
}

function date(value: unknown, path: string, optional = false): void {
  if (optional && value === "") return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(path, "must be a calendar date in YYYY-MM-DD format");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number(value.slice(0, 4)) < 1 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid(path, "must be a real calendar date");
}

function time(
  value: unknown,
  path: string,
  allowEnd = false,
  optional = false,
): void {
  if (optional && value === "") return;
  if (
    typeof value !== "string" ||
    (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) &&
      !(allowEnd && value === "24:00"))
  )
    invalid(path, "must be a valid time in HH:mm format");
}

function rows(
  value: unknown,
  path: string,
  validate: (record: Record<string, unknown>, path: string) => void,
  keys: string[],
): void {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const location = `${path}[${index}]`;
    const record = object(entry, location, keys);
    string(record.id, `${location}.id`, true);
    if (ids.has(record.id as string))
      invalid(`${location}.id`, "duplicates another entry");
    ids.add(record.id as string);
    validate(record, location);
  });
}

/** Validate every persisted field before replacing the current plan. No data is silently dropped. */
export function parsePlannerData(raw: string): PlannerState {
  if (new TextEncoder().encode(raw).byteLength > 10 * 1024 * 1024)
    throw new Error(
      "Planner backup is too large. Choose a JSON backup smaller than 10 MB.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose an exported planner backup.",
    );
  }
  const state = object(parsed, "planner", [
    "version",
    "profile",
    "blocks",
    "tasks",
    "events",
    "captures",
    "goals",
    "members",
    "budget",
    "fitness",
    "habits",
  ]);
  if (state.version !== 1)
    invalid(
      "planner.version",
      "is unsupported; this app accepts version 1 backups",
    );
  const profile = object(state.profile, "profile", [
    "name",
    "service",
    "rank",
    "component",
    "dateOfRank",
    "dateOfEntry",
    "role",
    "onboarded",
  ]);
  string(profile.name, "profile.name");
  string(profile.rank, "profile.rank");
  choice(profile.service, "profile.service", ["Air Force", "Space Force"]);
  choice(profile.component, "profile.component", [
    "Active Duty",
    "Guard",
    "Reserve",
  ]);
  choice(profile.role, "profile.role", [
    "Individual",
    "Supervisor",
    "Senior leader",
  ]);
  date(profile.dateOfRank, "profile.dateOfRank", true);
  date(profile.dateOfEntry, "profile.dateOfEntry", true);
  boolean(profile.onboarded, "profile.onboarded");
  rows(
    state.blocks,
    "blocks",
    (item, path) => {
      date(item.date, `${path}.date`);
      time(item.start, `${path}.start`);
      time(item.end, `${path}.end`, true);
      if ((item.end as string) <= (item.start as string))
        invalid(path, "must end after it starts on the same day");
      string(item.title, `${path}.title`);
      string(item.notes, `${path}.notes`);
      boolean(item.completed, `${path}.completed`);
      choice(item.category, `${path}.category`, [
        "Duty",
        "Development",
        "Fitness",
        "Personal",
      ]);
    },
    ["id", "date", "start", "end", "title", "category", "notes", "completed"],
  );
  rows(
    state.tasks,
    "tasks",
    (item, path) => {
      string(item.title, `${path}.title`);
      date(item.date, `${path}.date`, true);
      boolean(item.completed, `${path}.completed`);
      choice(item.priority, `${path}.priority`, ["High", "Normal", "Low"]);
    },
    ["id", "title", "date", "completed", "priority"],
  );
  rows(
    state.events,
    "events",
    (item, path) => {
      string(item.title, `${path}.title`);
      date(item.date, `${path}.date`);
      time(item.time, `${path}.time`, false, true);
      choice(item.category, `${path}.category`, [
        "Personal",
        "Career",
        "Training",
        "Administrative",
      ]);
      choice(item.recurrence, `${path}.recurrence`, [
        "None",
        "Weekly",
        "Monthly",
      ]);
      choice(item.source, `${path}.source`, ["User entered", "Estimate"]);
    },
    ["id", "title", "date", "time", "category", "recurrence", "source"],
  );
  rows(
    state.captures,
    "captures",
    (item, path) => {
      for (const key of ["title", "context", "actions", "outcome", "lessons"])
        string(item[key], `${path}.${key}`);
      date(item.date, `${path}.date`);
      choice(item.category, `${path}.category`, [
        "Mission",
        "Leadership",
        "Development",
        "Community",
      ]);
      if (!Array.isArray(item.tags))
        invalid(`${path}.tags`, "must be an array");
      item.tags.forEach((tag, index) => string(tag, `${path}.tags[${index}]`));
    },
    [
      "id",
      "title",
      "date",
      "category",
      "context",
      "actions",
      "outcome",
      "lessons",
      "tags",
    ],
  );
  rows(
    state.goals,
    "goals",
    (item, path) => {
      string(item.title, `${path}.title`);
      string(item.category, `${path}.category`);
      date(item.targetDate, `${path}.targetDate`, true);
      number(item.progress, `${path}.progress`, 100);
    },
    ["id", "title", "targetDate", "category", "progress"],
  );
  rows(
    state.members,
    "members",
    (item, path) => {
      for (const key of ["name", "rank", "focus", "notes"])
        string(item[key], `${path}.${key}`);
      date(item.nextFeedback, `${path}.nextFeedback`, true);
    },
    ["id", "name", "rank", "focus", "nextFeedback", "notes"],
  );
  const budgetKeys = [
    "income",
    "housing",
    "transport",
    "food",
    "insurance",
    "debt",
    "savings",
    "other",
  ];
  const budget = object(state.budget, "budget", budgetKeys);
  for (const key of budgetKeys) number(budget[key], `budget.${key}`);
  const fitness = object(state.fitness, "fitness", [
    "distance",
    "minutes",
    "seconds",
    "goalMinutes",
    "cardioScore",
    "strengthScore",
    "coreScore",
  ]);
  for (const key of ["distance", "minutes", "goalMinutes"])
    number(fitness[key], `fitness.${key}`);
  number(fitness.seconds, "fitness.seconds", 59);
  number(fitness.cardioScore, "fitness.cardioScore", 60);
  number(fitness.strengthScore, "fitness.strengthScore", 20);
  number(fitness.coreScore, "fitness.coreScore", 20);
  rows(
    state.habits,
    "habits",
    (item, path) => {
      string(item.title, `${path}.title`);
      string(item.category, `${path}.category`);
      if (!Array.isArray(item.completedDates))
        invalid(`${path}.completedDates`, "must be an array");
      item.completedDates.forEach((day, index) =>
        date(day, `${path}.completedDates[${index}]`),
      );
      if (new Set(item.completedDates).size !== item.completedDates.length)
        invalid(`${path}.completedDates`, "contains duplicate dates");
    },
    ["id", "title", "category", "completedDates"],
  );
  return parsed as PlannerState;
}

interface LoadedPlanner {
  state: PlannerState;
  storageError: string | null;
  allowWrites: boolean;
  savedRaw: string | null | undefined;
}

function loadPlanner(): LoadedPlanner {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null)
      return {
        state: defaultState(),
        storageError: null,
        allowWrites: true,
        savedRaw: null,
      };
    try {
      return {
        state: parsePlannerData(raw),
        storageError: null,
        allowWrites: true,
        savedRaw: raw,
      };
    } catch {
      return {
        state: defaultState(),
        storageError:
          "Saved planner data could not be read. It has been preserved. Export your current plan, then import a valid backup or reset data to resume saving.",
        allowWrites: false,
        savedRaw: raw,
      };
    }
  } catch {
    return {
      state: defaultState(),
      storageError:
        "Browser storage is unavailable. Changes will remain in this session; export a backup before closing this page.",
      allowWrites: true,
      savedRaw: undefined,
    };
  }
}

interface PlannerContextValue {
  state: PlannerState;
  mutate: (updater: (draft: PlannerState) => void) => void;
  reset: () => void;
  importData: (raw: string) => void;
  exportData: () => string;
  storageError: string | null;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const loaded = useRef<LoadedPlanner | null>(null);
  if (!loaded.current) loaded.current = loadPlanner();
  const [state, setState] = useState(loaded.current.state);
  const [storageError, setStorageError] = useState(loaded.current.storageError);
  const allowWrites = useRef(loaded.current.allowWrites);
  const savedRaw = useRef(loaded.current.savedRaw);
  const savedState = useRef(loaded.current.state);
  const currentState = useRef(state);
  currentState.current = state;

  useEffect(() => {
    function externalChange(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === savedRaw.current) return;
        if (currentState.current !== savedState.current) {
          allowWrites.current = false;
          setStorageError(
            "Your saved planner changed in another tab. This tab’s edits remain available to export, and the other saved plan has been preserved. Import a backup or reset data when you are ready to replace it.",
          );
          return;
        }
        let external: PlannerState;
        try {
          external = raw === null ? defaultState() : parsePlannerData(raw);
        } catch {
          allowWrites.current = false;
          setStorageError(
            "Saved planner data changed in another tab and could not be read. It has been preserved. Export your current plan, then import a valid backup or reset data to resume saving.",
          );
          return;
        }
        savedRaw.current = raw;
        savedState.current = external;
        currentState.current = external;
        allowWrites.current = true;
        setState(external);
        setStorageError(null);
      } catch {
        setStorageError(
          "Browser storage is unavailable. Changes will remain in this session; export a backup before closing this page.",
        );
      }
    }
    window.addEventListener("storage", externalChange);
    return () => window.removeEventListener("storage", externalChange);
  }, []);

  useEffect(() => {
    if (!allowWrites.current || state === savedState.current) return;
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw.current === undefined && existing === null)
        savedRaw.current = null;
      if (existing !== savedRaw.current) {
        allowWrites.current = false;
        setStorageError(
          "Your saved planner changed in another tab. This tab’s edits remain available to export, and the other saved plan has been preserved. Import a backup or reset data when you are ready to replace it.",
        );
        return;
      }
      const raw = JSON.stringify(state);
      window.localStorage.setItem(STORAGE_KEY, raw);
      savedRaw.current = raw;
      savedState.current = state;
      setStorageError(null);
    } catch {
      setStorageError(
        "Your latest changes could not be saved in this browser. Storage may be full or unavailable. Export a backup before closing this page.",
      );
    }
  }, [state]);

  function allowReplacement() {
    try {
      savedRaw.current = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      savedRaw.current = undefined;
    }
    allowWrites.current = true;
  }

  const value: PlannerContextValue = {
    state,
    storageError,
    mutate(updater) {
      setState((current) => {
        const draft = structuredClone(current);
        updater(draft);
        return draft;
      });
    },
    reset() {
      allowReplacement();
      setState(defaultState());
    },
    importData(raw) {
      const imported = parsePlannerData(raw);
      allowReplacement();
      setState(imported);
    },
    exportData() {
      return JSON.stringify(state);
    },
  };
  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context)
    throw new Error("usePlanner must be used inside PlannerProvider.");
  return context;
}
