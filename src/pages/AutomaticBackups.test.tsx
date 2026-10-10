import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState, PlannerProvider, STORAGE_KEY } from "../lib/planner";
import type { PlannerState } from "../lib/types";
import AutomaticBackups from "./AutomaticBackups";

const backup = vi.hoisted(() => ({
  save: vi.fn(),
  status: {
    phase: "ready" as const,
    lastSavedAt: null,
    message: "Recovery available",
  },
}));
vi.mock("../lib/automatic-backups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/automatic-backups")>()),
  saveAutomaticBackup: backup.save,
  getAutomaticBackupStatus: () => backup.status,
  subscribeAutomaticBackups: () => () => {},
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  backup.save.mockResolvedValue({});
});
afterEach(cleanup);

const plans: [string, (state: PlannerState) => void][] = [
  [
    "qualifications",
    (state) => {
      state.careerRequirements = [
        {
          id: "pme",
          title: "Verify PME record",
          area: "PME",
          status: "Planned",
          dueDate: "",
          completedDate: "",
          expiresDate: "",
          evidence: "",
          notes: "",
          sourceUrl: "",
          lastVerified: "",
          service: "Any",
          component: "Any",
          rank: "",
          afsc: "",
        },
      ];
    },
  ],
  [
    "objectives",
    (state) => {
      state.objectives = [
        {
          id: "objective",
          title: "Improve readiness",
          level: "Section",
          parentId: "",
          mission: "Develop the team",
          measure: "Readiness rate",
          targetDate: "",
          notes: "",
        },
      ];
    },
  ],
  [
    "contacts",
    (state) => {
      state.contacts = [
        {
          id: "contact",
          name: "Taylor",
          role: "Wingman",
          agency: "",
          phone: "",
          email: "",
          location: "",
          notes: "",
        },
      ];
    },
  ],
  [
    "people",
    (state) => {
      state.members = [
        {
          id: "person",
          name: "Taylor",
          rank: "SrA",
          focus: "Develop skills",
          nextFeedback: "",
          notes: "",
        },
      ];
    },
  ],
  [
    "weekly reviews",
    (state) => {
      state.weeklyReviews = [
        {
          id: "review",
          weekStart: "2026-10-05",
          reviewedOn: "2026-10-10",
          wins: "Finished training",
          lessons: "Reserve time",
          nextFocus: "Brief results",
          carriedTaskIds: [],
          metrics: {
            plannedMinutes: 0,
            completedBlockMinutes: 0,
            completedTaskCount: 0,
            captureCount: 0,
          },
        },
      ];
    },
  ],
  [
    "working hours",
    (state) => {
      state.planningPreferences.dayStart = "09:00";
    },
  ],
  [
    "reminder preferences",
    (state) => {
      state.reminderPreferences.enabled = true;
    },
  ],
  [
    "budget",
    (state) => {
      state.budget.income = 1200;
    },
  ],
  [
    "fitness",
    (state) => {
      state.fitness.goalMinutes = 12;
    },
  ],
  [
    "habit history",
    (state) => {
      state.habits[0].completedDates = ["2026-10-10"];
    },
  ],
  [
    "profile details",
    (state) => {
      state.profile.name = "Taylor";
    },
  ],
];

function mount(state?: PlannerState) {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render(
    <PlannerProvider>
      <AutomaticBackups />
    </PlannerProvider>,
  );
}

describe("automatic backup content detection", () => {
  it("skips the untouched initial plan", () => {
    mount();
    expect(backup.save).not.toHaveBeenCalled();
  });

  it.each(plans)(
    "preserves a valid plan with only %s before onboarding",
    async (_label, modify) => {
      const state = defaultState();
      modify(state);
      expect(state.profile.onboarded).toBe(false);
      expect(state.tasks).toEqual([]);
      expect(state.blocks).toEqual([]);
      mount(state);
      await waitFor(() =>
        expect(backup.save).toHaveBeenCalledWith(JSON.stringify(state)),
      );
    },
  );

  it("does not snapshot the blank fallback after an unreadable saved plan", () => {
    localStorage.setItem(STORAGE_KEY, "unreadable original data");
    mount();
    expect(backup.save).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("unreadable original data");
  });
});
