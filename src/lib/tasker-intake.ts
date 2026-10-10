import { formatDate, minutes } from "./dates";
import type { Member, PlannerState, Project, Task } from "./types";

export interface IntakeDraft {
  id: string;
  title: string;
  date: string;
  suspenseTime: string;
  ownerName: string;
  assigneeId: string;
  projectName: string;
  projectId: string;
  priority: Task["priority"];
  estimatedMinutes: string;
  sourceText: string;
  questions: string[];
}

export interface IntakeResult {
  drafts: IntakeDraft[];
  notices: string[];
}
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const dateCue = /\b(?:due|deadline|suspense|nlt|by)\b\s*:?\s*/i;
const explicitDateCue = /\b(?:due|deadline|suspense|nlt)\b\s*:?\s*/i;
const relativeDate =
  /\b(?:today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|eod|eow|cob|asap|noon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|in\s+\d+\s+(?:days?|weeks?))\b/i;
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function validDate(value: string) {
  try {
    formatDate(value);
    return true;
  } catch {
    return false;
  }
}
const findDateCue = (text: string) =>
  explicitDateCue.exec(text) ?? dateCue.exec(text);
function extractDate(text: string): {
  date: string;
  question: string;
  fragment: string;
} {
  const cue = findDateCue(text);
  if (!cue)
    return {
      date: "",
      question: "Confirm the suspense date, or leave it undated.",
      fragment: "",
    };
  const deadline = text
    .slice(cue.index + cue[0].length)
    .split(/[;\n]/)[0]
    .trim();
  const iso = [...deadline.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(
    (value) => value[0],
  );
  const named = [
    ...deadline.matchAll(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi,
    ),
  ].map((match) => {
    const month = months.findIndex((value) =>
      value.startsWith(match[1].toLowerCase().replace(/\.$/, "")),
    );
    return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  });
  const dates = [...new Set([...iso, ...named])];
  if (dates.some((value) => !validDate(value)))
    return {
      date: "",
      question:
        "The supplied suspense date is invalid. Choose a valid calendar date.",
      fragment: "",
    };
  if (dates.length > 1)
    return {
      date: "",
      question:
        "Several dates appear after the suspense cue. Choose the intended deadline.",
      fragment: "",
    };
  if (dates.length === 1)
    return { date: dates[0], question: "", fragment: text.slice(cue.index) };
  if (relativeDate.test(deadline))
    return {
      date: "",
      question: `Choose an absolute date for “${deadline}”; relative dates depend on when the sender wrote this.`,
      fragment: "",
    };
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(deadline))
    return {
      date: "",
      question: `Confirm the date format for “${deadline}”.`,
      fragment: "",
    };
  return {
    date: "",
    question: "Confirm the suspense date, or leave it undated.",
    fragment: "",
  };
}
function matchRecord<T extends { id: string }>(
  name: string,
  rows: T[],
  label: (row: T) => string,
) {
  const matches = rows.filter(
    (row) => normalize(label(row)) === normalize(name),
  );
  return name && matches.length === 1 ? matches[0].id : "";
}

function parseLine(
  sourceText: string,
  index: number,
  members: Member[],
  projects: Project[],
): IntakeDraft {
  const questions: string[] = [];
  let body = sourceText
    .replace(/^\s*(?:[-*•]\s*|\d+[.)]\s*)/, "")
    .replace(/^(?:action(?:\s+item)?|task(?:er)?)\s*[:–-]\s*/i, "");
  let ownerName = "";
  const owner = /\b(?:owner|poc|assigned\s+to)\s*:\s*([^;\n]+)/i.exec(
    sourceText,
  );
  if (owner) ownerName = owner[1].trim();
  else {
    const prefix = /^([^:;]{1,80}):\s*(.+)$/s.exec(body);
    if (
      prefix &&
      !/^(?:due|deadline|suspense|project|subject|note)$/i.test(prefix[1])
    ) {
      ownerName = prefix[1].trim();
      body = prefix[2];
    }
  }
  const project = /\bproject\s*:\s*([^;\n]+)/i.exec(sourceText);
  const projectName = project?.[1].trim() ?? "";
  const assigneeId = ownerName
    ? matchRecord(ownerName, members, (value) => value.name)
    : "";
  const projectId = projectName
    ? matchRecord(projectName, projects, (value) => value.title)
    : "";
  if (!ownerName)
    questions.push(
      "Choose an owner, or explicitly keep this tasker unassigned.",
    );
  else if (!assigneeId)
    questions.push(
      `Confirm “${ownerName}” against your teammates; no unique exact match exists.`,
    );
  if (projectName && !projectId)
    questions.push(
      `Choose a project for “${projectName}”; no unique exact match exists.`,
    );
  const extracted = extractDate(sourceText);
  if (extracted.question) questions.push(extracted.question);
  const deadlinePart = sourceText.slice(
    findDateCue(sourceText)?.index ?? sourceText.length,
  );
  const time = /\b(?:at\s+)?([01]\d|2[0-3]):([0-5]\d)\b/.exec(deadlinePart);
  let suspenseTime = time ? `${time[1]}:${time[2]}` : "";
  if (time && !extracted.date)
    questions.push(
      "A clock time was found, but its calendar date still needs confirmation.",
    );
  if (/\b(?:am|pm)\b/i.test(deadlinePart)) {
    suspenseTime = "";
    questions.push("Confirm the suspense time in 24-hour format.");
  }
  const effort =
    /\b(?:estimate|effort)\s*:\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i.exec(
      sourceText,
    );
  const estimatedMinutes = effort
    ? String(Number(effort[1]) * (/^h/i.test(effort[2]) ? 60 : 1))
    : "";
  const priorityMatch = /\bpriority\s*:\s*(high|normal|low)\b/i.exec(
    sourceText,
  );
  const priority = priorityMatch
    ? ((priorityMatch[1][0].toUpperCase() +
        priorityMatch[1].slice(1).toLowerCase()) as Task["priority"])
    : "Normal";
  body = body.replace(
    /\n(?:owner|poc|assigned\s+to|due|deadline|suspense|project|estimate|effort|priority)\s*:.*$/gims,
    "",
  );
  body = body.split(
    /;\s*(?:owner|poc|assigned\s+to|project|due|deadline|suspense|estimate|effort|priority)\s*:/i,
  )[0];
  const bodyCue = findDateCue(body);
  if (extracted.date && bodyCue && extractDate(body).date)
    body = body.slice(0, bodyCue.index);
  body = body
    .replace(/^please\s+/i, "")
    .trim()
    .replace(/[.;]+$/, "");
  return {
    id: `intake-${index}`,
    title: body,
    date: extracted.date,
    suspenseTime,
    ownerName,
    assigneeId,
    projectName,
    projectId,
    priority,
    estimatedMinutes,
    sourceText,
    questions,
  };
}

/** Rule-based extraction: source text is data; instructions inside it are never executed. */
export function extractTaskerDrafts(
  raw: string,
  members: Member[] = [],
  projects: Project[] = [],
): IntakeResult {
  if (new TextEncoder().encode(raw).length > 100_000)
    throw new Error("Paste up to 100 KB of tasker text at a time.");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 500) throw new Error("Paste up to 500 lines at a time.");
  const candidates: string[] = [];
  let ignored = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^(?:from|to|cc|bcc|sent|date|subject)\s*:/i.test(line)) {
      ignored++;
      continue;
    }
    if (
      /^(?:owner|poc|assigned\s+to|due|deadline|suspense|project|estimate|effort|priority)\s*:/i.test(
        line,
      ) &&
      candidates.length
    ) {
      candidates[candidates.length - 1] += `\n${line}`;
      continue;
    }
    const action =
      /^(?:[-*•]\s*|\d+[.)]\s*|(?:action(?:\s+item)?|task(?:er)?)\s*[:–-]|please\s+|(?:(?:[^:;]{1,80}):\s*)?(?:prepare|review|submit|send|update|complete|confirm|create|coordinate|deliver|provide|build|check|brief|finalize|compile|analyze|resolve|follow\s+up|publish|validate|collect|develop|schedule|ensure)\b)/i;
    if (action.test(line)) {
      if (candidates.length === 50)
        throw new Error(
          "Review up to 50 draft taskers at a time. Split this text into smaller batches.",
        );
      candidates.push(line);
    } else ignored++;
  }
  const notices = [
    "Drafts use action lines, explicit owner/project labels, and absolute suspense dates. Review every field before creating taskers.",
  ];
  if (ignored)
    notices.push(
      `${ignored} header or context ${ignored === 1 ? "line was" : "lines were"} left as context rather than converted into work.`,
    );
  if (!candidates.length)
    notices.push(
      "No action lines found. Add “Task:”, a bullet, or an explicit action verb to the lines you want to review.",
    );
  return {
    drafts: candidates.map((line, index) =>
      parseLine(line, index, members, projects),
    ),
    notices,
  };
}

export function intakeDraftError(
  draft: IntakeDraft,
  state: Pick<PlannerState, "members" | "projects">,
): string | null {
  if (!draft.title.trim()) return "Give this tasker a title.";
  if (draft.date && !validDate(draft.date))
    return "Choose a valid suspense date, or leave it undated.";
  if (draft.suspenseTime) {
    try {
      if (minutes(draft.suspenseTime) >= 1440)
        return "Choose a suspense time before midnight.";
    } catch {
      return "Choose a valid 24-hour suspense time.";
    }
    if (!draft.date)
      return "Choose a calendar date before adding a suspense time.";
  }
  if (
    draft.assigneeId &&
    !state.members.some((member) => member.id === draft.assigneeId)
  )
    return "The selected owner no longer exists. Choose an owner again.";
  if (
    draft.projectId &&
    !state.projects.some((project) => project.id === draft.projectId)
  )
    return "The selected project no longer exists. Choose a project again.";
  if (
    draft.estimatedMinutes &&
    (!Number.isFinite(Number(draft.estimatedMinutes)) ||
      Number(draft.estimatedMinutes) < 0)
  )
    return "Estimated effort must be a finite nonnegative number of minutes.";
  return null;
}

export function taskFromIntake(
  draft: IntakeDraft,
  state: Pick<PlannerState, "members" | "projects">,
  id: string = crypto.randomUUID(),
): Task {
  const error = intakeDraftError(draft, state);
  if (error) throw new Error(error);
  return {
    id,
    title: draft.title.trim(),
    date: draft.date,
    completed: false,
    status: "Open",
    priority: draft.priority,
    assigneeId: draft.assigneeId,
    projectId: draft.projectId,
    suspenseTime: draft.suspenseTime,
    ...(draft.estimatedMinutes
      ? { estimatedMinutes: Number(draft.estimatedMinutes) }
      : {}),
    notes: `Source text reviewed during tasker intake:\n${draft.sourceText}`,
  };
}
