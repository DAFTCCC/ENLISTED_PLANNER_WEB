import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Today from "./Today";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { addDays } from "../lib/dates";
import type { TimeBlock } from "../lib/types";

const day = "2026-10-08";
const block = (overrides: Partial<TimeBlock> = {}): TimeBlock => ({
  id: "existing",
  date: day,
  start: "09:00",
  end: "10:00",
  title: "Mission focus",
  category: "Duty",
  notes: "",
  completed: false,
  ...overrides,
});
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);

function renderDay(date = day) {
  return render(
    <PlannerProvider>
      <Today
        date={date}
        setDate={vi.fn()}
        onCalendar={vi.fn()}
        onCaptures={vi.fn()}
      />
    </PlannerProvider>,
  );
}

function seed(blocks: TimeBlock[]) {
  const state = defaultState();
  state.blocks = blocks;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function openNew(title: string, start = "09:00", end = "10:00") {
  fireEvent.click(screen.getByRole("button", { name: /^Add time block$/ }));
  const dialog = screen.getByRole("dialog", { name: "Add time block" });
  fireEvent.change(
    within(dialog).getByLabelText("What are you making time for?"),
    { target: { value: title } },
  );
  fireEvent.change(within(dialog).getByLabelText("Start time"), {
    target: { value: start },
  });
  fireEvent.change(within(dialog).getByLabelText("End time"), {
    target: { value: end },
  });
  return dialog;
}

function save(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save time block" }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("daily planning workflow", () => {
  it("adds, edits, completes, reopens and restores a time block from saved data", () => {
    const firstRender = renderDay();
    let dialog = openNew("  Study for qualification  ");
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "Development" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Notes/), {
      target: { value: "Review chapter 2" },
    });
    save(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("article", {
        name: "Study for qualification, 09:00 to 10:00",
      }),
    ).toBeTruthy();
    const originalId = persisted().blocks[0].id;
    expect(persisted().blocks[0]).toMatchObject({
      title: "Study for qualification",
      category: "Development",
      notes: "Review chapter 2",
      completed: false,
      date: day,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Study for qualification" }),
    );
    dialog = screen.getByRole("dialog", { name: "Edit time block" });
    expect(within(dialog).queryByLabelText("Repeat")).toBeNull();
    fireEvent.change(
      within(dialog).getByLabelText("What are you making time for?"),
      { target: { value: "Focused study" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "09:30" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "10:45" },
    });
    save(dialog);
    expect(persisted().blocks).toHaveLength(1);
    expect(persisted().blocks[0]).toMatchObject({
      id: originalId,
      title: "Focused study",
      start: "09:30",
      end: "10:45",
      category: "Development",
      notes: "Review chapter 2",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Focused study" }),
    );
    expect(persisted().blocks[0].completed).toBe(true);
    firstRender.unmount();

    renderDay();
    expect(
      screen.getByRole("article", { name: "Focused study, 09:30 to 10:45" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark incomplete Focused study" }),
    );
    expect(persisted().blocks[0].completed).toBe(false);
  });

  it("denies overlapping additions and edits while allowing adjacent plans", () => {
    seed([
      block(),
      block({
        id: "second",
        title: "PT",
        start: "10:00",
        end: "11:00",
        category: "Fitness",
      }),
    ]);
    renderDay();
    let dialog = openNew("Conflicting meeting", "09:30", "10:30");
    save(dialog);
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /overlaps “Mission focus”/,
    );
    expect(persisted().blocks).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit PT" }));
    dialog = screen.getByRole("dialog", { name: "Edit time block" });
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "09:45" },
    });
    save(dialog);
    expect(within(dialog).getByRole("alert").textContent).toMatch(/overlaps/);
    expect(persisted().blocks.find((item) => item.id === "second")?.start).toBe(
      "10:00",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    dialog = openNew("Lunch", "11:00", "11:30");
    save(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(persisted().blocks.map((item) => item.title)).toEqual([
      "Mission focus",
      "PT",
      "Lunch",
    ]);
  });

  it("keeps a block after canceled deletion and persists a confirmed deletion", () => {
    seed([block()]);
    const view = renderDay();
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Edit Mission focus" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }));
    expect(confirmation).toHaveBeenCalledWith(
      expect.stringContaining("Mission focus"),
    );
    expect(persisted().blocks).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    confirmation.mockReturnValue(true);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(persisted().blocks).toEqual([]);
    view.unmount();
    renderDay();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("supports the final hour ending at midnight without shrinking or rolling the block", () => {
    renderDay();
    fireEvent.click(screen.getByRole("button", { name: "Show all 24 hours" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add time block at 23:00" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("What are you making time for?"),
      { target: { value: "Late reading" } },
    );
    expect(
      (within(dialog).getByLabelText("End time") as HTMLSelectElement).value,
    ).toBe("24:00");
    save(dialog);
    expect(persisted().blocks[0]).toMatchObject({
      date: day,
      start: "23:00",
      end: "24:00",
    });
    expect(
      screen.getByRole("article", { name: "Late reading, 23:00 to 24:00" }),
    ).toBeTruthy();
  });
});

describe("seven-day daily repeats", () => {
  it("creates seven distinct dated blocks and edits only the selected instance", () => {
    renderDay();
    const dialog = openNew("Daily development", "07:00", "07:30");
    fireEvent.change(within(dialog).getByLabelText("Repeat"), {
      target: { value: "week" },
    });
    save(dialog);
    const saved = persisted().blocks;
    expect(saved.map((item) => item.date)).toEqual(
      Array.from({ length: 7 }, (_, index) => addDays(day, index)),
    );
    expect(new Set(saved.map((item) => item.id)).size).toBe(7);
    expect(
      saved.every(
        (item) =>
          item.title === "Daily development" &&
          item.start === "07:00" &&
          item.end === "07:30" &&
          !item.completed,
      ),
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(
      /added to seven days/,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Daily development" }),
    );
    const editDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(editDialog).getByLabelText("What are you making time for?"),
      { target: { value: "Today’s development" } },
    );
    save(editDialog);
    expect(persisted().blocks).toHaveLength(7);
    expect(
      persisted().blocks.filter((item) => item.title === "Today’s development"),
    ).toHaveLength(1);
    expect(
      persisted().blocks.filter((item) => item.title === "Daily development"),
    ).toHaveLength(6);
  });

  it("rejects the entire repeat when a later day conflicts and saves all seven after correction", () => {
    const conflicting = block({
      id: "future",
      date: addDays(day, 6),
      title: "Existing appointment",
    });
    seed([conflicting]);
    const originalStored = localStorage.getItem(STORAGE_KEY);
    renderDay();
    const dialog = openNew("Morning routine");
    fireEvent.change(within(dialog).getByLabelText("Repeat"), {
      target: { value: "week" },
    });
    save(dialog);
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /Oct 14, 2026:.*Existing appointment/,
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(originalStored);
    expect(persisted().blocks).toEqual([conflicting]);
    expect(screen.queryByRole("article")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "10:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "10:30" },
    });
    save(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(persisted().blocks).toHaveLength(8);
    expect(
      persisted().blocks.filter((item) => item.title === "Morning routine"),
    ).toHaveLength(7);
    expect(persisted().blocks.find((item) => item.id === "future")).toEqual(
      conflicting,
    );
  });
});
