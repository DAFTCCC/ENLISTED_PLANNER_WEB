import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as planner from "../lib/planner";
import { addDays, localDate } from "../lib/dates";
import { reviewWeek } from "../lib/weekly-review";
import WeeklyReview from "./WeeklyReview";

vi.mock("./SchedulingAssistant", () => ({
  default: ({
    taskIds,
    from,
    to,
  }: {
    taskIds: string[];
    from: string;
    to: string;
  }) => (
    <div
      data-testid="scheduling-proposals"
      data-task-ids={JSON.stringify(taskIds)}
      data-from={from}
      data-to={to}
    >
      Review selected scheduling proposals
    </div>
  ),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const saved = () =>
  planner.parsePlannerData(localStorage.getItem(planner.STORAGE_KEY)!);
const renderReview = () =>
  render(
    <planner.PlannerProvider>
      <WeeklyReview />
    </planner.PlannerProvider>,
  );

describe("weekly reflection workflow", () => {
  it("saves approved carry choices and metrics while leaving task suspenses and blocks intact", () => {
    const initial = planner.defaultState();
    const week = reviewWeek(localDate());
    initial.tasks = [
      {
        id: "done",
        title: "Improve handover",
        date: week.start,
        completed: true,
        completedOn: week.start,
        priority: "Normal",
      },
      {
        id: "carry",
        title: "Finalize checklist",
        date: addDays(week.start, -1),
        completed: false,
        priority: "High",
      },
      {
        id: "other",
        title: "Check supplies",
        date: "",
        completed: false,
        priority: "Normal",
      },
      {
        id: "legacy",
        title: "Historic result",
        date: week.start,
        completed: true,
        priority: "Normal",
      },
    ];
    initial.blocks = [
      {
        id: "block",
        title: "Study",
        date: week.start,
        start: "09:00",
        end: "10:00",
        category: "Development",
        notes: "",
        completed: true,
      },
    ];
    localStorage.setItem(planner.STORAGE_KEY, JSON.stringify(initial));
    renderReview();
    expect(
      screen.getByText(
        /1 completed tasker has no completion date and is excluded/,
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("scheduling-proposals")).toBeNull();
    fireEvent.change(screen.getByLabelText("Wins & outcomes"), {
      target: { value: "  Reduced handover time  " },
    });
    fireEvent.change(screen.getByLabelText("Next week's focus"), {
      target: { value: "Finish the checklist" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Carry forward: Finalize checklist",
      }),
    );
    const proposals = screen.getByTestId("scheduling-proposals");
    expect(proposals.getAttribute("data-task-ids")).toBe('["carry"]');
    expect(proposals.getAttribute("data-from")).toBe(addDays(week.start, 7));
    expect(proposals.getAttribute("data-to")).toBe(addDays(week.start, 13));
    fireEvent.click(screen.getByRole("button", { name: "Save weekly review" }));
    const result = saved();
    expect(result.weeklyReviews).toHaveLength(1);
    expect(result.weeklyReviews[0]).toMatchObject({
      weekStart: week.start,
      wins: "Reduced handover time",
      nextFocus: "Finish the checklist",
      carriedTaskIds: ["carry"],
      metrics: {
        plannedMinutes: 60,
        completedBlockMinutes: 60,
        completedTaskCount: 1,
        captureCount: 0,
      },
    });
    expect(result.tasks).toEqual(
      initial.tasks.map((task) => ({
        ...task,
        status: task.completed ? "Done" : "Open",
      })),
    );
    expect(result.blocks).toEqual(initial.blocks);
    expect(screen.getByRole("status").textContent).toContain(
      "Task suspenses and existing blocks are unchanged",
    );
    fireEvent.change(screen.getByLabelText("Lessons & adjustments"), {
      target: { value: "Delegate inputs earlier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save weekly review" }));
    expect(saved().weeklyReviews).toHaveLength(1);
    expect(saved().weeklyReviews[0].lessons).toBe("Delegate inputs earlier");
  });

  it("retains unsaved reflections across week navigation and reopens saved history", () => {
    renderReview();
    const currentWeek = reviewWeek(localDate()).start;
    fireEvent.change(screen.getByLabelText("Next week's focus"), {
      target: { value: "This is still a draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Previous review week" }),
    );
    expect(
      (screen.getByLabelText("Next week's focus") as HTMLTextAreaElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Next week's focus"), {
      target: { value: "Prepare the team briefing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save weekly review" }));
    expect(saved().weeklyReviews[0].weekStart).toBe(addDays(currentWeek, -7));
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(
      (screen.getByLabelText("Next week's focus") as HTMLTextAreaElement).value,
    ).toBe("This is still a draft");
    fireEvent.click(screen.getByRole("button", { name: /Open review for/ }));
    expect(
      (screen.getByLabelText("Next week's focus") as HTMLTextAreaElement).value,
    ).toBe("Prepare the team briefing");
    expect(
      screen.getByRole("heading", { name: "Saved review history" }),
    ).toBeTruthy();
  });

  it("opens unfinished blocks on their actual dates and directs follow-up review to Leadership", () => {
    const initial = planner.defaultState();
    const week = reviewWeek(localDate());
    initial.blocks = [
      {
        id: "unfinished",
        title: "Training practice",
        date: week.start,
        start: "11:00",
        end: "12:00",
        category: "Development",
        notes: "",
        completed: false,
      },
    ];
    initial.members = [
      {
        id: "member",
        name: "Taylor",
        rank: "SrA",
        focus: "Briefing",
        nextFeedback: week.start,
        notes: "",
      },
    ];
    localStorage.setItem(planner.STORAGE_KEY, JSON.stringify(initial));
    const onOpenDay = vi.fn();
    const onNavigate = vi.fn();
    render(
      <planner.PlannerProvider>
        <WeeklyReview onOpenDay={onOpenDay} onNavigate={onNavigate} />
      </planner.PlannerProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review block: Training practice" }),
    );
    expect(onOpenDay).toHaveBeenCalledWith(week.start);
    fireEvent.click(
      screen.getByRole("button", { name: "Review teammate follow-ups" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("leadership");
  });

  it("preserves reflection text and explains rejection when a mutation cannot be applied", () => {
    const mutate = vi.fn(() => false);
    vi.spyOn(planner, "usePlanner").mockReturnValue({
      state: planner.defaultState(),
      mutate,
      reset: vi.fn(),
      importData: vi.fn(),
      exportData: vi.fn(() => ""),
      storageError: "Concurrent update",
    });
    render(<WeeklyReview />);
    fireEvent.change(screen.getByLabelText("Lessons & adjustments"), {
      target: { value: "Keep my reflection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save weekly review" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Your reflection is still here",
    );
    expect(
      (screen.getByLabelText("Lessons & adjustments") as HTMLTextAreaElement)
        .value,
    ).toBe("Keep my reflection");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
