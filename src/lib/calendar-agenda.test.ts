import { describe, expect, it } from "vitest";
import { defaultState } from "./planner";
import { linkedAgenda, sourceManagesEventDate } from "./calendar-agenda";

describe("connected calendar dates", () => {
  it("follows source changes without copying stale deadlines", () => {
    const state = defaultState();
    state.objectives.push({
      id: "priority",
      title: "Improve readiness",
      level: "Squadron",
      parentId: "",
      mission: "",
      measure: "",
      targetDate: "2026-10-20",
      notes: "",
    });
    expect(linkedAgenda(state, "2026-10-20")[0].title).toBe(
      "Improve readiness",
    );
    state.objectives[0].targetDate = "2026-11-20";
    expect(linkedAgenda(state, "2026-10-20")).toEqual([]);
    expect(linkedAgenda(state, "2026-11-20")).toHaveLength(1);
  });
  it("does not display a structured follow-up twice when scheduled as an event", () => {
    const state = defaultState();
    state.members.push({
      id: "member",
      name: "Avery",
      rank: "SSgt",
      focus: "Certification",
      nextFeedback: "2026-10-20",
      notes: "",
    });
    expect(linkedAgenda(state, "2026-10-20")).toHaveLength(1);
    state.events.push({
      id: "event",
      title: "Feedback: Avery",
      date: "2026-10-20",
      time: "09:00",
      category: "Career",
      recurrence: "None",
      source: "User entered",
      memberId: "member",
    });
    expect(linkedAgenda(state, "2026-10-20")).toHaveLength(0);
  });
  it("keeps meeting follow-up dates and user career targets distinct", () => {
    const state = defaultState();
    state.meetings.push({
      id: "meeting",
      title: "Project review",
      date: "2026-10-20",
      time: "09:00",
      objective: "Agree next actions",
      participants: [],
      agenda: "",
      decisions: "",
      nextDate: "2026-10-27",
      notes: "",
    });
    expect(linkedAgenda(state, "2026-10-20")[0].detail).toContain("09:00");
    expect(linkedAgenda(state, "2026-10-27")[0].title).toContain("Follow-up");
  });

  it("deduplicates a source date covered by a recurring linked reminder", () => {
    const state = defaultState();
    state.members.push({
      id: "member",
      name: "Avery",
      rank: "SSgt",
      focus: "",
      nextFeedback: "2026-10-20",
      notes: "",
    });
    state.events.push({
      id: "weekly",
      title: "Feedback: Avery",
      date: "2026-10-13",
      time: "",
      recurrence: "Weekly",
      source: "User entered",
      category: "Career",
      memberId: "member",
    });
    expect(linkedAgenda(state, "2026-10-20")).toHaveLength(0);
  });

  it("keeps preparation checkpoints editable while the actual goal date follows its source", () => {
    const state = defaultState();
    state.goals.push({
      id: "goal",
      title: "Closeout",
      targetDate: "2026-12-31",
      category: "Evaluation",
      progress: 0,
    });
    const event = {
      id: "prep",
      title: "Review evidence",
      date: "2026-12-01",
      time: "",
      recurrence: "None" as const,
      source: "Estimate" as const,
      category: "Career" as const,
      goalId: "goal",
    };
    expect(sourceManagesEventDate(event, state)).toBe(false);
    expect(
      sourceManagesEventDate({ ...event, date: "2026-12-31" }, state),
    ).toBe(true);
  });
});
