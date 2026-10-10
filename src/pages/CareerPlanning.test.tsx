import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { addDays, localDate } from "../lib/dates";
import CareerPlanning from "./CareerPlanning";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
function renderPlanning() {
  const value = defaultState();
  value.profile.rank = "SrA";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  render(
    <PlannerProvider>
      <CareerPlanning />
    </PlannerProvider>,
  );
}

describe("career preparation workflows", () => {
  it("creates a cycle, preserves completed custom steps on edit, and updates one linked calendar suspense", () => {
    renderPlanning();
    fireEvent.click(
      screen.getByRole("button", { name: "Start preparation plan" }),
    );
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Preparation plan title"), {
      target: { value: "27E5 preparation" },
    });
    fireEvent.change(within(dialog).getByLabelText("Promotion cycle"), {
      target: { value: "27E5" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("AFSC or functional community"),
      { target: { value: "Test community" } },
    );
    const dueDate = addDays(localDate(), 60);
    fireEvent.change(
      within(dialog).getByLabelText("Confirmed preparation suspense"),
      { target: { value: dueDate } },
    );
    fireEvent.change(
      within(dialog).getByLabelText("Preparation step 1", { exact: true }),
      { target: { value: "Review my records" } },
    );
    fireEvent.change(
      within(dialog).getByLabelText("Preparation step 2", { exact: true }),
      { target: { value: "Confirm my test appointment" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save preparation plan" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Make tasker: Review my records",
      }),
    );
    const linkedTaskId = persisted().careerPlans[0].checklist[0].taskId;
    expect(persisted().tasks[0].id).toBe(linkedTaskId);
    expect(persisted().tasks[0].careerPlanId).toBe(
      persisted().careerPlans[0].id,
    );
    fireEvent.click(screen.getByLabelText("Review my records"));
    expect(persisted().careerPlans[0].checklist[0].completed).toBe(true);
    expect(persisted().tasks[0].completed).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Add or update calendar suspense" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add or update calendar suspense" }),
    );
    expect(persisted().events).toHaveLength(1);
    expect(persisted().goals).toHaveLength(1);
    expect(persisted().events[0].goalId).toBe(persisted().goals[0].id);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit preparation plan: 27E5 preparation",
      }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("Preparation step 1", { exact: true }),
      { target: { value: "Review and correct my records" } },
    );
    fireEvent.change(
      within(dialog).getByLabelText("Confirmed preparation suspense"),
      { target: { value: addDays(dueDate, 7) } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save preparation plan" }),
    );
    expect(persisted().careerPlans[0].checklist[0].completed).toBe(true);
    expect(persisted().careerPlans[0].checklist[0].taskId).toBe(linkedTaskId);
    expect(persisted().tasks).toHaveLength(1);
    expect(persisted().tasks[0].title).toBe("Review and correct my records");
    fireEvent.click(
      screen.getByRole("button", { name: "Add or update calendar suspense" }),
    );
    expect(persisted().events).toHaveLength(1);
    expect(persisted().events[0].date).toBe(addDays(dueDate, 7));
  });
  it("keeps estimated evaluation dates labeled and does not duplicate checkpoints", () => {
    renderPlanning();
    fireEvent.click(
      screen.getByRole("button", { name: "Use reference estimate" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add evaluation checkpoints" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add evaluation checkpoints" }),
    );
    expect(persisted().events).toHaveLength(4);
    const closeoutDate = persisted().goals[0].targetDate;
    expect(persisted().events.map((event) => event.date)).toEqual(
      [-180, -90, -30, 0].map((offset) => addDays(closeoutDate, offset)),
    );
    expect(persisted().goals).toHaveLength(1);
    expect(
      persisted().events.every((event) => event.source === "Estimate"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Closeout date source"), {
      target: { value: "User entered" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add evaluation checkpoints" }),
    );
    expect(
      persisted().events.filter((event) => event.source === "User entered"),
    ).toHaveLength(1);
    expect(persisted().goals[0].source).toBe("User entered");
  });
  it("rejects unsafe guidance URLs and requires confirmation before deleting a plan", () => {
    renderPlanning();
    fireEvent.click(
      screen.getByRole("button", { name: "Start preparation plan" }),
    );
    let dialog = screen.getByRole("dialog");
    const urlInput = within(dialog).getByLabelText(
      "Current guidance source URL",
    );
    fireEvent.change(urlInput, { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(urlInput.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("HTTPS");
    expect(persisted().careerPlans).toHaveLength(0);
    fireEvent.change(urlInput, {
      target: { value: "https://www.afpc.af.mil/Promotion/" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save preparation plan" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete preparation plan: WAPS preparation",
      }),
    );
    expect(persisted().careerPlans).toHaveLength(1);
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete preparation plan" }),
    );
    expect(persisted().careerPlans).toHaveLength(0);
  });
});
