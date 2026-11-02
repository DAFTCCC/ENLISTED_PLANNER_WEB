import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlannerProvider, STORAGE_KEY } from "../lib/planner";
import Tools from "./Tools";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function scorer() {
  render(
    <PlannerProvider>
      <Tools />
    </PlannerProvider>,
  );
  return within(
    screen.getByRole("region", { name: "Score a practice assessment" }),
  );
}

describe("practice assessment scoring", () => {
  it("scores all four components and copies the points into the saved plan", () => {
    const view = scorer();
    fireEvent.change(view.getByLabelText("Age on test day"), {
      target: { value: "27" },
    });
    fireEvent.change(view.getByLabelText(/Cardio result/), {
      target: { value: "14:00" },
    });
    fireEvent.change(view.getByLabelText(/Strength result/), {
      target: { value: "55" },
    });
    fireEvent.change(view.getByLabelText(/Core result/), {
      target: { value: "52" },
    });
    fireEvent.change(view.getByLabelText("Waist (inches)"), {
      target: { value: "33" },
    });
    fireEvent.change(view.getByLabelText("Height (inches)"), {
      target: { value: "70" },
    });
    // 25-29 male: 14:00 run = 49.0, 55 push-ups = 12.0, 52 sit-ups = 13.0,
    // 33 / 70 = 0.471 -> 0.47 = 20.0. Total 94.0.
    expect(view.getByText("94.0")).toBeTruthy();
    expect(view.getByText("49 / 50")).toBeTruthy();
    expect(view.getByText("12 / 15")).toBeTruthy();
    expect(view.getByText("13 / 15")).toBeTruthy();
    expect(view.getByText("20 / 20")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Use these points" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).fitness;
    expect(saved).toMatchObject({
      distance: 2,
      minutes: 14,
      seconds: 0,
      cardioScore: 49,
      strengthScore: 12,
      coreScore: 13,
      bodyCompositionScore: 20,
    });
  });

  it("flags results below the chart minimum and invalid times", () => {
    const view = scorer();
    fireEvent.change(view.getByLabelText("Age on test day"), {
      target: { value: "22" },
    });
    fireEvent.change(view.getByLabelText(/Cardio result/), {
      target: { value: "19:46" },
    });
    expect(view.getByText(/Below minimum \(19:45\)/)).toBeTruthy();
    fireEvent.change(view.getByLabelText(/Cardio result/), {
      target: { value: "19.46" },
    });
    expect(view.getByText(/Enter times as m:ss/)).toBeTruthy();
  });
});
