import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PlannerProvider,
  STORAGE_KEY,
  defaultState,
  parsePlannerData,
} from "../lib/planner";
import { addDays, localDate } from "../lib/dates";
import Career from "./Career";
import Captures from "./Captures";
import Leadership from "./Leadership";
import { isProfessionalDate } from "./professional-date";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
// Some DOM implementations sanitize five-digit years to blank. Bypass native
// sanitization here to exercise the application's own validation boundary.
function setRawDate(input: HTMLElement, value: string) {
  (input as HTMLInputElement).type = "text";
  fireEvent.change(input, { target: { value } });
}

describe("professional planning workflows", () => {
  it("expands an original capture into a searchable career record without losing its original note", () => {
    render(
      <PlannerProvider>
        <Captures />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Quick note"), {
      target: { value: "  Improved training handover  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture it" }));
    expect(persisted().captures[0]).toMatchObject({
      title: "Improved training handover",
      date: localDate(),
      actions: "",
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the details" }));
    fireEvent.change(screen.getByLabelText("Your actions"), {
      target: { value: "Created a single training checklist for the team." },
    });
    fireEvent.change(screen.getByLabelText("Outcomes & impact"), {
      target: { value: "Reduced follow-up questions by 30%." },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "training, improvement, training" },
    });
    const record = persisted().captures[0];
    expect(record.title).toBe("Improved training handover");
    expect(record.date).toBe(localDate());
    expect(record.tags).toEqual(["training", "improvement"]);
    fireEvent.change(screen.getByLabelText("Search records"), {
      target: { value: "30%" },
    });
    expect(screen.getByText("Improved training handover")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete capture: Improved training handover",
      }),
    );
    expect(persisted().captures).toHaveLength(1);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Keep record",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("records feedback, preserves existing notes, and adds a single follow-up to the calendar", () => {
    const saved = defaultState();
    saved.members = [
      {
        id: "member",
        name: "Taylor",
        rank: "SrA",
        focus: "Lead training",
        nextFeedback: localDate(),
        notes: "Earlier development note",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(
      <PlannerProvider>
        <Leadership />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Log feedback" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("Conversation & agreed actions"),
      { target: { value: "Taylor will brief the next session." } },
    );
    const followUp = addDays(localDate(), 14);
    fireEvent.change(within(dialog).getByLabelText("Next feedback date"), {
      target: { value: followUp },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save feedback" }),
    );
    expect(persisted().members[0].notes).toContain("Earlier development note");
    expect(persisted().members[0].notes).toContain(
      "Taylor will brief the next session.",
    );
    expect(persisted().members[0].nextFeedback).toBe(followUp);
    fireEvent.click(screen.getByRole("button", { name: "Add to calendar" }));
    expect(persisted().events).toHaveLength(1);
    expect(persisted().events[0]).toMatchObject({
      title: "Feedback: Taylor",
      date: followUp,
      source: "User entered",
    });
    expect(
      (screen.getByRole("button", { name: "On calendar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("updates a career milestone, completes it, and only deletes after confirmation", () => {
    render(
      <PlannerProvider>
        <Career />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Milestone title"), {
      target: { value: "Complete certification" },
    });
    fireEvent.change(within(dialog).getByLabelText("Target date"), {
      target: { value: addDays(localDate(), 60) },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save milestone" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(persisted().goals[0].progress).toBe(100);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Complete certification" }),
    );
    expect(persisted().goals).toHaveLength(1);
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete milestone" }),
    );
    expect(persisted().goals).toEqual([]);
  });
});

describe("professional date validation", () => {
  it.each([
    "0000-01-01",
    "10000-01-01",
    "2025-02-29",
    "2024-04-31",
    "2024-13-01",
    "not-a-date",
  ])("rejects invalid persisted date %s", (value) => {
    expect(isProfessionalDate(value)).toBe(false);
    expect(isProfessionalDate(value, true)).toBe(false);
  });

  it("supports real four-digit dates and deliberately blank optional dates", () => {
    expect(isProfessionalDate("0001-01-01")).toBe(true);
    expect(isProfessionalDate("9999-12-31")).toBe(true);
    expect(isProfessionalDate("2024-02-29")).toBe(true);
    expect(isProfessionalDate("")).toBe(false);
    expect(isProfessionalDate("", true)).toBe(true);
  });

  it("blocks out-of-range profile and milestone dates even when native form validation is bypassed", () => {
    render(
      <PlannerProvider>
        <Career />
      </PlannerProvider>,
    );
    const entry = screen.getByLabelText("Date of entry") as HTMLInputElement;
    expect(entry.min).toBe("0001-01-01");
    setRawDate(entry, "10000-01-01");
    fireEvent.submit(entry.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain(
      "real profile dates",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Milestone title"), {
      target: { value: "Course" },
    });
    const target = within(dialog).getByLabelText(
      "Target date",
    ) as HTMLInputElement;
    expect(target.min).toBe("0001-01-01");
    expect(target.max).toBe("9999-12-31");
    setRawDate(target, "10000-01-01");
    fireEvent.submit(target.closest("form")!);
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "real target date",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects an invalid capture date before creating a record", () => {
    render(
      <PlannerProvider>
        <Captures />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Quick note"), {
      target: { value: "Accomplishment" },
    });
    const date = screen.getByLabelText(
      "Accomplishment date",
    ) as HTMLInputElement;
    expect(date.min).toBe("0001-01-01");
    setRawDate(date, "10000-01-01");
    fireEvent.submit(date.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain(
      "real accomplishment date",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects invalid member and session dates without damaging prior feedback notes", () => {
    const saved = defaultState();
    saved.members = [
      {
        id: "member",
        name: "Taylor",
        rank: "SrA",
        focus: "",
        nextFeedback: localDate(),
        notes: "Previous notes",
      },
    ];
    const original = JSON.stringify(saved);
    localStorage.setItem(STORAGE_KEY, original);
    render(
      <PlannerProvider>
        <Leadership />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Taylor" }));
    let dialog = screen.getByRole("dialog");
    const memberDate = within(dialog).getByLabelText(
      "Next feedback date",
    ) as HTMLInputElement;
    expect(memberDate.max).toBe("9999-12-31");
    setRawDate(memberDate, "10000-01-01");
    fireEvent.submit(memberDate.closest("form")!);
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "real feedback date",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Log feedback" })[0]);
    dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("Conversation & agreed actions"),
      { target: { value: "Follow-up notes" } },
    );
    const session = within(dialog).getByLabelText("Session date");
    setRawDate(session, "10000-01-01");
    fireEvent.submit(session.closest("form")!);
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "real session date",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
    fireEvent.change(session, { target: { value: localDate() } });
    const followUp = within(dialog).getByLabelText("Next feedback date");
    setRawDate(followUp, "10000-01-01");
    fireEvent.submit(session.closest("form")!);
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "real follow-up date",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
    fireEvent.change(followUp, { target: { value: "" } });
    fireEvent.submit(session.closest("form")!);
    expect(persisted().members[0].nextFeedback).toBe("");
    expect(persisted().members[0].notes).toContain("Previous notes");
  });

  it("preserves a goal category created by Readiness when it is edited from Career", () => {
    const saved = defaultState();
    saved.goals = [
      {
        id: "fitness",
        title: "Consistent movement",
        targetDate: "",
        category: "Readiness: Fitness",
        progress: 20,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(
      <PlannerProvider>
        <Career />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Consistent movement" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Category") as HTMLSelectElement).value,
    ).toBe("Readiness: Fitness");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save milestone" }),
    );
    expect(persisted().goals[0].category).toBe("Readiness: Fitness");
    expect(persisted().goals[0].targetDate).toBe("");
  });
});
