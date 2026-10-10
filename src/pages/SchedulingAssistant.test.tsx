import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
  usePlanner,
} from "../lib/planner";
import SchedulingAssistant from "./SchedulingAssistant";

const day = "2030-10-07";
function seed(dependencies = false) {
  const state = defaultState();
  state.tasks = [
    {
      id: "prepare",
      title: "Prepare brief",
      date: day,
      completed: false,
      priority: "High",
      estimatedMinutes: 60,
    },
    {
      id: "deliver",
      title: "Deliver brief",
      date: day,
      completed: false,
      priority: "Normal",
      estimatedMinutes: 30,
      dependencyIds: dependencies ? ["prepare"] : [],
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}
function Harness() {
  const { mutate } = usePlanner();
  return (
    <>
      <SchedulingAssistant from={day} to={day} />
      <button
        onClick={() =>
          mutate((next) => {
            next.blocks.push({
              id: "new-conflict",
              date: day,
              start: "08:00",
              end: "09:00",
              title: "New appointment",
              category: "Duty",
              notes: "",
              completed: false,
            });
          })
        }
      >
        Add competing commitment
      </button>
      <button
        onClick={() =>
          mutate((next) => {
            next.planningPreferences.dayStart = "09:00";
          })
        }
      >
        Change saved working hours
      </button>
      <button
        onClick={() =>
          mutate((next) => {
            const replacement = next.blocks.find(
              (block) =>
                block.taskId === "prepare" &&
                block.date === day &&
                !block.completed,
            );
            if (replacement) replacement.completed = true;
          })
        }
      >
        Complete replacement block
      </button>
    </>
  );
}
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("explicit schedule review", () => {
  it("creates no blocks until review and preserves task suspenses when applying", () => {
    const state = seed();
    render(
      <PlannerProvider>
        <SchedulingAssistant from={day} to={day} />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    expect(persisted().blocks).toHaveLength(0);
    expect(
      screen.getByRole("checkbox", {
        name: "Include schedule for Prepare brief",
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(persisted().blocks).toHaveLength(2);
    expect(persisted().blocks.every((block) => block.taskId)).toBe(true);
    expect(persisted().tasks.map((task) => task.date)).toEqual(
      state.tasks.map((task) => task.date),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "2 reviewed time blocks added",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    expect(
      screen.queryByRole("button", { name: "Apply selected schedule" }),
    ).toBeNull();
    expect(persisted().blocks).toHaveLength(2);
  });

  it("rejects dependent work without its reviewed prerequisite blocks", () => {
    seed(true);
    render(
      <PlannerProvider>
        <SchedulingAssistant from={day} to={day} />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include schedule for Prepare brief",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Include all required prerequisite blocks",
    );
    expect(persisted().blocks).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include schedule for Prepare brief",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(persisted().blocks).toHaveLength(2);
  });

  it("revalidates the latest planner state and retains newly added competing commitments", () => {
    seed();
    render(
      <PlannerProvider>
        <Harness />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add competing commitment" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Generate proposals again",
    );
    expect(persisted().blocks.map((block) => block.id)).toEqual([
      "new-conflict",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(persisted().blocks).toHaveLength(3);
    expect(
      persisted()
        .blocks.filter((block) => block.id !== "new-conflict")
        .every((block) => block.start >= "09:00"),
    ).toBe(true);
  });

  it("plans undated taskers without inventing a suspense", () => {
    const state = seed();
    state.tasks[0].date = "";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(
      <PlannerProvider>
        <SchedulingAssistant taskIds={["prepare"]} from={day} to={day} />
      </PlannerProvider>,
    );
    expect(screen.getByText(/No suspense recorded/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    expect(
      screen.getByText(
        /no suspense recorded; planned within the selected range/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(persisted().tasks[0].date).toBe("");
    expect(persisted().blocks).toHaveLength(1);
  });
  it("requires a fresh review when saved working hours change elsewhere", () => {
    seed();
    render(
      <PlannerProvider>
        <Harness />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Change saved working hours" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Saved working hours changed",
    );
    expect(persisted().blocks).toHaveLength(0);
    expect(persisted().planningPreferences.dayStart).toBe("09:00");
  });
  it("detaches only reviewed missed task links and completes replacement work without rewriting missed history", () => {
    const state = seed();
    const missed = {
      id: "missed-prepare",
      date: "2020-01-06",
      start: "08:00",
      end: "08:30",
      title: "Missed briefing preparation",
      category: "Duty" as const,
      notes: "Original plan",
      completed: false,
      taskId: "prepare",
    };
    const completed = {
      ...missed,
      id: "completed-prepare",
      start: "08:30",
      end: "09:00",
      title: "Actual completed preparation",
      completed: true,
    };
    const excludedMiss = {
      ...missed,
      id: "missed-deliver",
      taskId: "deliver",
      title: "Unselected missed delivery",
    };
    state.blocks = [missed, completed, excludedMiss];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(
      <PlannerProvider>
        <Harness />
      </PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate schedule proposals" }),
    );
    expect(
      screen.getAllByRole("heading", {
        name: "Missed allocations replaced by this plan",
      }),
    ).toHaveLength(2);
    expect(screen.getByText(/Missed briefing preparation ·/)).toBeTruthy();
    expect(persisted().blocks.find((block) => block.id === missed.id)).toEqual(
      missed,
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include schedule for Deliver brief",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected schedule" }),
    );
    const afterApply = persisted();
    const { taskId: _taskId, ...retainedHistory } = missed;
    expect(afterApply.blocks.find((block) => block.id === missed.id)).toEqual(
      retainedHistory,
    );
    expect(
      afterApply.blocks.find((block) => block.id === completed.id),
    ).toEqual(completed);
    expect(
      afterApply.blocks.find((block) => block.id === excludedMiss.id),
    ).toEqual(excludedMiss);
    expect(
      afterApply.tasks.find((task) => task.id === "prepare")!.completed,
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Complete replacement block" }),
    );
    const afterCompletion = persisted();
    expect(
      afterCompletion.tasks.find((task) => task.id === "prepare")!.completed,
    ).toBe(true);
    expect(
      afterCompletion.blocks.find((block) => block.id === missed.id),
    ).toEqual(retainedHistory);
    expect(
      afterCompletion.blocks.find((block) => block.id === completed.id),
    ).toEqual(completed);
  });
});
