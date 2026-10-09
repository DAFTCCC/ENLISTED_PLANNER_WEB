import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Calendar from "./Calendar";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { addDays, formatDate, localDate } from "../lib/dates";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function renderCalendar(onOpenDay = vi.fn()) {
  render(
    <PlannerProvider>
      <Calendar onOpenDay={onOpenDay} />
    </PlannerProvider>,
  );
  return onOpenDay;
}

function openDay(date: string) {
  const label = formatDate(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${label},`) }),
  );
}

describe("integrated calendar", () => {
  it.each(["0001-01-01", "9999-12-31"])(
    "renders supported boundary date %s without crossing the date range",
    (date) => {
      renderCalendar();
      fireEvent.click(screen.getByRole("button", { name: "Add event" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Event name"), {
        target: { value: "Boundary date" },
      });
      fireEvent.change(within(dialog).getByLabelText("Date"), {
        target: { value: date },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Add event" }),
      );
      expect(
        within(screen.getByRole("region", { name: "Selected day" })).getByText(
          "Boundary date",
        ),
      ).toBeTruthy();
      expect(
        (
          screen.getByRole("button", {
            name: date.startsWith("0001") ? "Previous month" : "Next month",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events[0].date,
      ).toBe(date);
    },
  );

  it("saves an estimated weekly event, shows later occurrences, and edits the series", () => {
    const anchor = `${localDate().slice(0, 7)}-01`;
    renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Event name"), {
      target: { value: "  Study session  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: anchor },
    });
    fireEvent.change(within(dialog).getByLabelText("Repeat"), {
      target: { value: "Weekly" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Date source/), {
      target: { value: "Estimate" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add event" }));
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events[0],
    ).toMatchObject({
      title: "Study session",
      date: anchor,
      recurrence: "Weekly",
      source: "Estimate",
    });
    openDay(addDays(anchor, 7));
    const agenda = screen.getByRole("region", { name: "Selected day" });
    expect(within(agenda).getByText("Study session")).toBeTruthy();
    expect(within(agenda).getByText("Estimate")).toBeTruthy();
    fireEvent.click(
      within(agenda).getByRole("button", { name: "Edit Study session" }),
    );
    dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Changes apply to the entire recurring series/),
    ).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Event name"), {
      target: { value: "Updated study plan" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    openDay(addDays(anchor, 14));
    expect(
      within(screen.getByRole("region", { name: "Selected day" })).getByText(
        "Updated study plan",
      ),
    ).toBeTruthy();
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events,
    ).toHaveLength(1);
  });

  it("preserves a recurring event until deletion is explicitly confirmed", () => {
    const saved = defaultState();
    saved.events = [
      {
        id: "repeat",
        title: "Mentor check-in",
        date: localDate(),
        time: "",
        category: "Career",
        recurrence: "Weekly",
        source: "User entered",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderCalendar();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Mentor check-in" }),
    );
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events,
    ).toHaveLength(1);
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/every occurrence/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep event" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Mentor check-in" }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete series" }),
    );
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events).toEqual(
      [],
    );
  });

  it("connects daily time blocks, due tasks, and user-set goals without inventing plans", () => {
    const date = localDate();
    const saved = defaultState();
    saved.blocks = [
      {
        id: "late-study",
        title: "Evening study",
        date,
        start: "23:00",
        end: "24:00",
        category: "Development",
        notes: "",
        completed: false,
      },
    ];
    saved.tasks = [
      {
        id: "task",
        title: "Send feedback notes",
        date,
        priority: "High",
        completed: false,
      },
    ];
    saved.goals = [
      {
        id: "goal",
        title: "Course target",
        targetDate: date,
        category: "Education",
        progress: 40,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const onOpenDay = renderCalendar();
    const agenda = screen.getByRole("region", { name: "Selected day" });
    expect(within(agenda).getByText("Evening study")).toBeTruthy();
    expect(within(agenda).getByText("11:00 PM – Midnight")).toBeTruthy();
    expect(
      within(agenda).getByText(/User-set target · 40% complete/),
    ).toBeTruthy();
    fireEvent.click(
      within(agenda).getByRole("checkbox", { name: /Send feedback notes/ }),
    );
    expect(
      parsePlannerData(localStorage.getItem(STORAGE_KEY)!).tasks[0].completed,
    ).toBe(true);
    fireEvent.click(
      within(agenda).getByRole("button", { name: "Plan this day" }),
    );
    expect(onOpenDay).toHaveBeenCalledWith(date);
    expect(parsePlannerData(localStorage.getItem(STORAGE_KEY)!).events).toEqual(
      [],
    );
  });
});
