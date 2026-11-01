import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { localDate } from "../lib/dates";
import Readiness from "./Readiness";
import Settings from "./Settings";
import Tools from "./Tools";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);

describe("readiness planning", () => {
  it("accepts supported date boundaries and ignores extended years before formatting or saving", () => {
    render(
      <PlannerProvider>
        <Readiness />
      </PlannerProvider>,
    );
    const checkIn = screen.getByLabelText("Check-in date") as HTMLInputElement;
    fireEvent.change(checkIn, { target: { value: "0001-01-01" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete: Make time for movement" }),
    );
    expect(persisted().habits[0].completedDates).toEqual(["0001-01-01"]);
    fireEvent.change(checkIn, { target: { value: "9999-12-31" } });
    fireEvent.change(checkIn, { target: { value: "10000-01-01" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete: Make time for movement" }),
    );
    expect(persisted().habits[0].completedDates).toEqual([
      "0001-01-01",
      "9999-12-31",
    ]);
    expect(checkIn.min).toBe("0001-01-01");
    expect(checkIn.max).toBe("9999-12-31");
  });

  it("saves a new habit and tracks completion independently for each date", () => {
    render(
      <PlannerProvider>
        <Readiness />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Habit"), {
      target: { value: "  Walk with family  " },
    });
    fireEvent.change(screen.getByLabelText("Area of readiness"), {
      target: { value: "Family" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add habit" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete: Walk with family" }),
    );
    const habit = persisted().habits.find(
      (item) => item.title === "Walk with family",
    )!;
    expect(habit.category).toBe("Family");
    expect(habit.completedDates).toEqual([localDate()]);
    const previous = "2025-01-15";
    fireEvent.change(screen.getByLabelText("Check-in date"), {
      target: { value: previous },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete: Walk with family" }),
    );
    expect(
      persisted().habits.find((item) => item.id === habit.id)!.completedDates,
    ).toEqual([localDate(), previous]);
    fireEvent.click(
      screen.getByRole("button", { name: "Mark incomplete: Walk with family" }),
    );
    expect(
      persisted().habits.find((item) => item.id === habit.id)!.completedDates,
    ).toEqual([localDate()]);
  });

  it("updates a readiness goal without replacing career goals", () => {
    const initial = defaultState();
    initial.goals = [
      {
        id: "career",
        title: "Professional certification",
        category: "Education",
        targetDate: "2027-01-01",
        progress: 25,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    render(
      <PlannerProvider>
        <Readiness />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Read every evening" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    fireEvent.change(
      screen.getByRole("slider", { name: "Progress for Read every evening" }),
      { target: { value: "60" } },
    );
    expect(persisted().goals.find((item) => item.id === "career")).toEqual(
      initial.goals[0],
    );
    expect(
      persisted().goals.find((item) => item.title === "Read every evening"),
    ).toMatchObject({ category: "Readiness: Fitness", progress: 60 });
  });
});

describe("practical calculators", () => {
  it("subtracts planned savings from the available budget and keeps verified fitness inputs", () => {
    render(
      <PlannerProvider>
        <Tools />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Monthly take-home income ($)"), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getByLabelText("Housing & utilities ($)"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Savings & investing ($)"), {
      target: { value: "500" },
    });
    expect(screen.getByText("$2,500")).toBeTruthy();
    expect(screen.getByText("12.5%")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Run time: minutes"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Run time: seconds"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Cardio (0–50)"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByLabelText("Waist-to-height (0–20)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Strength (0–15)"), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByLabelText("Core (0–15)"), {
      target: { value: "12.5" },
    });
    // New plans default to the 2-mile run: 12:30 over 2 miles.
    expect(screen.getByText("6:15")).toBeTruthy();
    expect(screen.getByText("92.5 / 100")).toBeTruthy();
    expect(persisted().fitness).toMatchObject({
      distance: 2,
      minutes: 12,
      seconds: 30,
      cardioScore: 45,
      bodyCompositionScore: 20,
      strengthScore: 15,
      coreScore: 12.5,
    });
    expect(screen.queryByText(/old 60\/20\/20 scale/)).toBeNull();
    expect(screen.getByText(/does not determine pass\/fail/)).toBeTruthy();
  });
});

describe("profile and data safeguards", () => {
  it("rejects reversed career dates without overwriting the saved profile", () => {
    const initial = defaultState();
    initial.profile.name = "Alex";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    render(
      <PlannerProvider>
        <Settings />
      </PlannerProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Preferred name/), {
      target: { value: "Changed" },
    });
    fireEvent.change(screen.getByLabelText(/Date of rank/), {
      target: { value: "2023-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/Date of entry/), {
      target: { value: "2024-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByRole("alert").textContent).toMatch(/cannot be before/);
    expect(persisted().profile.name).toBe("Alex");
  });

  it("validates imported data before showing a replacement confirmation", async () => {
    const initial = defaultState();
    initial.profile.name = "Existing";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    render(
      <PlannerProvider>
        <Settings />
      </PlannerProvider>,
    );
    const invalid = new File(['{"version":1}'], "invalid.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Choose planner backup"), {
      target: { files: [invalid] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /Invalid planner backup/,
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(persisted()).toEqual(initial);
  });

  it("preserves current data when import is canceled, then replaces it only on confirmation", async () => {
    const initial = defaultState();
    initial.profile.name = "Existing";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    const incoming = defaultState();
    incoming.profile.name = "Imported";
    incoming.tasks = [
      {
        id: "new",
        title: "Imported task",
        date: "",
        completed: false,
        priority: "High",
      },
    ];
    render(
      <PlannerProvider>
        <Settings />
      </PlannerProvider>,
    );
    const file = new File([JSON.stringify(incoming)], "planner.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Choose planner backup"), {
      target: { files: [file] },
    });
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Imported")).toBeTruthy();
    expect(persisted()).toEqual(initial);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(persisted()).toEqual(initial);
    fireEvent.change(screen.getByLabelText("Choose planner backup"), {
      target: { files: [file] },
    });
    dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Replace and import" }),
    );
    expect(persisted()).toEqual(incoming);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requires confirmation before removing the current planner", () => {
    const initial = defaultState();
    initial.profile.name = "Existing";
    initial.tasks = [
      {
        id: "keep",
        title: "Keep this task",
        date: "",
        completed: false,
        priority: "Normal",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    render(
      <PlannerProvider>
        <Settings />
      </PlannerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset all data" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(persisted()).toEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "Reset all data" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Reset all data",
      }),
    );
    expect(persisted()).toEqual(defaultState());
  });
});
