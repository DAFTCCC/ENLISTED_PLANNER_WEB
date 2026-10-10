import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import {
  applyReviewedUpdate,
  buildTaskerOffer,
  buildTaskerUpdate,
  closeDelegation,
  closeDelegationError,
  parseTaskerOffer,
  parseTaskerUpdate,
  updateReviewError,
} from "./delegation";
import type { Delegation } from "./types";

const today = "2026-10-10";
const setup = () => {
  const state = defaultState();
  state.profile.name = "Jordan";
  state.tasks = [
    {
      id: "task",
      title: "Review guide",
      date: "2026-10-20",
      completed: false,
      priority: "High",
      notes: "Provide evidence of changes.",
      estimatedMinutes: 22.5,
    },
  ];
  const delegation: Delegation = {
    id: "offer",
    taskId: "task",
    recipientName: "Taylor",
    recipientEmail: "taylor@example.com",
    status: "Offered",
    sentOn: today,
    updatedOn: today,
    progress: 0,
    blocker: "",
    notes: "",
  };
  state.delegations = [delegation];
  const offer = buildTaskerOffer(state, delegation);
  return { state, delegation, offer };
};

describe("portable tasker delegation", () => {
  it("exports only the selected work and an explicit prerequisite snapshot", () => {
    const { state, delegation } = setup();
    state.tasks.push({
      id: "input",
      title: "Confirm inputs",
      date: "",
      completed: true,
      priority: "Normal",
    });
    state.tasks[0].dependencyIds = ["input"];
    const offered = buildTaskerOffer(state, delegation);
    expect(offered.task.estimatedMinutes).toBe(22.5);
    expect(offered.task.prerequisites).toEqual([
      { id: "input", title: "Confirm inputs", completed: true },
    ]);
    expect(JSON.stringify(offered)).not.toContain("budget");
    expect(parseTaskerOffer(JSON.stringify(offered))).toEqual(offered);
  });

  it("rejects missing, oversized, unsupported, or mismatched offer data", () => {
    const { offer } = setup();
    expect(() => parseTaskerOffer("{")).toThrow("valid tasker packet JSON");
    expect(() =>
      parseTaskerOffer(JSON.stringify({ ...offer, injected: true })),
    ).toThrow("unsupported fields");
    expect(() =>
      parseTaskerOffer(
        JSON.stringify({ ...offer, task: { ...offer.task, id: "other" } }),
      ),
    ).toThrow("IDs do not match");
    expect(() => parseTaskerOffer("x".repeat(100_001))).toThrow("under 100 KB");
    expect(() =>
      parseTaskerOffer(
        JSON.stringify({
          ...offer,
          task: { ...offer.task, date: "2026-02-30" },
        }),
      ),
    ).toThrow("valid YYYY-MM-DD");
  });

  it("refuses dangling taskers and prerequisites when exporting", () => {
    const { state, delegation } = setup();
    state.tasks[0].dependencyIds = ["missing"];
    expect(() => buildTaskerOffer(state, delegation)).toThrow(
      "prerequisite no longer exists",
    );
    state.tasks = [];
    expect(() => buildTaskerOffer(state, delegation)).toThrow(
      "tasker no longer exists",
    );
  });

  it("keeps acceptance and submission separate from owner-confirmed completion", () => {
    const { state, offer } = setup();
    applyReviewedUpdate(
      state,
      buildTaskerUpdate(
        offer,
        {
          status: "Accepted",
          progress: 0,
          blocker: "",
          notes: "I can do this.",
        },
        today,
      ),
      today,
    );
    expect(state.delegations[0].status).toBe("Accepted");
    expect(state.tasks[0].completed).toBe(false);
    const submitted = buildTaskerUpdate(
      offer,
      {
        status: "Submitted",
        progress: 100,
        blocker: "",
        notes: "Review attached changes.",
      },
      today,
    );
    applyReviewedUpdate(state, submitted, today);
    expect(state.tasks[0].completed).toBe(false);
    expect(updateReviewError(submitted, state, today)).toBe(
      "This update is already recorded.",
    );
    closeDelegation(state, "offer", today);
    expect(state.delegations[0].status).toBe("Closed");
    expect(state.tasks[0]).toMatchObject({
      completed: true,
      status: "Done",
      completedOn: today,
    });
    expect(updateReviewError(submitted, state, today)).toContain(
      "already closed",
    );
  });

  it("requires matching work, recipient, and offer date before recording an imported update", () => {
    const { state, offer } = setup();
    const update = buildTaskerUpdate(
      offer,
      {
        status: "In progress",
        progress: 50,
        blocker: "",
        notes: "Draft ready.",
      },
      today,
    );
    for (const changes of [
      { taskId: "other" },
      { recipientName: "Someone else" },
      { recipientEmail: "different@example.com" },
      { offeredOn: "2026-10-09" },
    ]) {
      expect(() =>
        applyReviewedUpdate(state, { ...update, ...changes }, today),
      ).toThrow();
      expect(state.delegations[0].status).toBe("Offered");
    }
    expect(
      updateReviewError(
        { ...update, recipientEmail: "TAYLOR@example.com" },
        state,
        today,
      ),
    ).toBeNull();
  });

  it("rejects future or older reports and malformed recipient completion claims", () => {
    const { state, offer } = setup();
    const update = buildTaskerUpdate(
      offer,
      { status: "In progress", progress: 25, blocker: "", notes: "" },
      today,
    );
    expect(
      updateReviewError({ ...update, updatedOn: "2026-10-11" }, state, today),
    ).toContain("future");
    state.delegations[0].updatedOn = "2026-10-11";
    expect(updateReviewError(update, state, "2026-10-12")).toContain(
      "newer update",
    );
    expect(() =>
      parseTaskerUpdate(JSON.stringify({ ...update, status: "Closed" })),
    ).toThrow("only supervisors close");
    expect(() =>
      parseTaskerUpdate(JSON.stringify({ ...update, status: "Submitted" })),
    ).toThrow("100%");
    expect(() =>
      parseTaskerUpdate(JSON.stringify({ ...update, status: "Blocked" })),
    ).toThrow("blocker description");
    expect(() =>
      parseTaskerUpdate(JSON.stringify({ ...update, progress: 25.5 })),
    ).toThrow("whole number");
  });

  it("does not close unsubmitted work or bypass open prerequisites", () => {
    const { state, delegation, offer } = setup();
    expect(() => closeDelegation(state, "offer", today)).toThrow(
      "submitted work",
    );
    state.tasks.push({
      id: "input",
      title: "Confirm inputs",
      date: "",
      completed: false,
      priority: "Normal",
    });
    state.tasks[0].dependencyIds = ["input"];
    applyReviewedUpdate(
      state,
      buildTaskerUpdate(
        offer,
        { status: "Submitted", progress: 100, blocker: "", notes: "Ready." },
        today,
      ),
      today,
    );
    expect(closeDelegationError(state, delegation)).toContain("Confirm inputs");
    expect(() => closeDelegation(state, "offer", today)).toThrow(
      "Confirm inputs",
    );
    expect(state.tasks[0].completed).toBe(false);
    state.tasks[1].completed = true;
    closeDelegation(state, "offer", today);
    expect(state.tasks[0].completed).toBe(true);
  });

  it("preserves removed-source history without allowing updates or closure", () => {
    const { state, delegation, offer } = setup();
    const update = buildTaskerUpdate(
      offer,
      { status: "Submitted", progress: 100, blocker: "", notes: "Ready." },
      today,
    );
    delegation.taskId = "";
    state.tasks = [];
    expect(updateReviewError(update, state, today)).toContain(
      "no longer exists",
    );
    expect(closeDelegationError(state, delegation)).toBe(
      "This tasker no longer exists.",
    );
  });

  it("preserves the original task completion date when closing an already completed tasker exchange", () => {
    const { state } = setup();
    state.delegations[0].status = "Submitted";
    state.tasks[0].completed = true;
    state.tasks[0].completedOn = "2026-10-09";
    closeDelegation(state, "offer", today);
    expect(state.tasks[0].completedOn).toBe("2026-10-09");
    expect(state.delegations[0].updatedOn).toBe(today);
  });
});
