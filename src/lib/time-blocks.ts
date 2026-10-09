import type { TimeBlock } from "./types";
import { addDays, minutes } from "./dates";

export function blockError(
  block: TimeBlock,
  blocks: TimeBlock[],
): string | null {
  if (!block.title.trim()) return "Give your time block a title.";
  try {
    addDays(block.date, 0);
  } catch {
    return "Choose a valid date.";
  }
  let start: number, end: number;
  try {
    start = minutes(block.start);
    end = minutes(block.end);
  } catch {
    return "Choose valid start and end times.";
  }
  if (start >= end || start >= 1440)
    return "End time must be after start time. Split overnight plans into two days.";
  const conflict = blocks.find(
    (item) =>
      item.id !== block.id &&
      item.date === block.date &&
      minutes(item.start) < end &&
      minutes(item.end) > start,
  );
  return conflict
    ? `This overlaps “${conflict.title}” (${conflict.start}–${conflict.end}). Choose another time.`
    : null;
}

export function totalPlannedMinutes(blocks: TimeBlock[]): number {
  return blocks.reduce(
    (sum, block) => sum + minutes(block.end) - minutes(block.start),
    0,
  );
}

export function durationLabel(value: number): string {
  const hours = Math.floor(value / 60),
    rest = value % 60;
  return (
    `${hours ? `${hours}h` : ""}${hours && rest ? " " : ""}${rest ? `${rest}m` : ""}` ||
    "0m"
  );
}
