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
import { blankCareerRequirement } from "../lib/career-readiness";
import type { PlannerState } from "../lib/types";
import CareerReadiness from "./CareerReadiness";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
function mount(value?: PlannerState) {
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  render(
    <PlannerProvider>
      <CareerReadiness />
    </PlannerProvider>,
  );
}
function field(dialog: HTMLElement, name: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(name), { target: { value } });
}

describe("career readiness records", () => {
  it("saves profile specialty, records scoped completion evidence, and preserves it when editing", () => {
    const saved = defaultState();
    saved.profile.rank = "SSgt";
    mount(saved);
    fireEvent.change(screen.getByLabelText("Your AFSC or specialty"), {
      target: { value: " 3F0X1 " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save profile specialty" }),
    );
    expect(persisted().profile.afsc).toBe("3F0X1");
    fireEvent.click(screen.getByRole("button", { name: "Add qualification" }));
    let dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Qualification rank") as HTMLInputElement)
        .value,
    ).toBe("SSgt");
    expect(
      (
        within(dialog).getByLabelText(
          "Qualification AFSC or specialty",
        ) as HTMLInputElement
      ).value,
    ).toBe("3F0X1");
    field(dialog, "Qualification title", "Leadership course");
    field(dialog, "Qualification category", "PME");
    field(dialog, "Qualification status", "Complete");
    field(dialog, "Actual completion date", addDays(localDate(), -7));
    field(dialog, "Qualification expiry date", addDays(localDate(), 14));
    field(
      dialog,
      "Evidence or record reference",
      "Completion recorded in my training record.",
    );
    field(
      dialog,
      "Qualification source URL",
      "https://www.e-publishing.af.mil/",
    );
    field(dialog, "Qualification source checked date", localDate());
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save qualification" }),
    );
    const original = persisted().careerRequirements[0];
    expect(original).toMatchObject({
      title: "Leadership course",
      area: "PME",
      status: "Complete",
      rank: "SSgt",
      afsc: "3F0X1",
      service: "Air Force",
      component: "Active Duty",
      evidence: "Completion recorded in my training record.",
      lastVerified: localDate(),
    });
    const card = screen.getByRole("article", {
      name: "Qualification Leadership course",
    });
    expect(within(card).getByText("Renewal review")).toBeTruthy();
    expect(within(card).getByText(/Checked by you:/)).toBeTruthy();
    expect(
      within(card)
        .getByRole("link", { name: "Recorded source" })
        .getAttribute("href"),
    ).toBe(original.sourceUrl);
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Edit qualification Leadership course",
      }),
    );
    dialog = screen.getByRole("dialog");
    field(dialog, "Qualification title", "Leadership course with certificate");
    field(dialog, "Qualification notes", "Reviewed with supervisor.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save qualification" }),
    );
    expect(persisted().careerRequirements).toEqual([
      {
        ...original,
        title: "Leadership course with certificate",
        notes: "Reviewed with supervisor.",
      },
    ]);
  });

  it("keeps unmatched qualifications accessible and explains unknown specialty scope", () => {
    const value = defaultState();
    value.profile.rank = "SSgt";
    value.careerRequirements = [
      {
        ...blankCareerRequirement(value.profile),
        id: "specialty",
        title: "Specialty training",
        afsc: "3F0X1",
      },
      {
        ...blankCareerRequirement(value.profile),
        id: "other",
        title: "Guardian qualification",
        service: "Space Force",
      },
    ];
    mount(value);
    expect(
      screen.getByRole("article", { name: "Qualification Specialty training" })
        .textContent,
    ).toContain("Needs profile detail");
    expect(
      screen.queryByRole("article", {
        name: "Qualification Guardian qualification",
      }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Qualification scope"), {
      target: { value: "All scopes" },
    });
    expect(
      screen.getByRole("article", {
        name: "Qualification Guardian qualification",
      }).textContent,
    ).toContain("Outside profile");
    fireEvent.change(screen.getByLabelText("Qualification scope"), {
      target: { value: "My profile" },
    });
    fireEvent.change(screen.getByLabelText("Your AFSC or specialty"), {
      target: { value: "3F051" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save profile specialty" }),
    );
    expect(
      screen.queryByRole("article", {
        name: "Qualification Specialty training",
      }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Your AFSC or specialty"), {
      target: { value: "3F0X1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save profile specialty" }),
    );
    expect(
      screen.getByRole("article", { name: "Qualification Specialty training" })
        .textContent,
    ).toContain("Matches profile");
  });

  it("rejects unsafe source and future historical dates before writing a record", () => {
    mount(defaultState());
    fireEvent.click(screen.getByRole("button", { name: "Add qualification" }));
    const dialog = screen.getByRole("dialog");
    field(dialog, "Qualification title", "Training qualification");
    field(dialog, "Qualification source URL", "javascript:alert(1)");
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Save qualification" })
        .closest("form")!,
    );
    expect(screen.getByRole("alert").textContent).toContain("HTTPS");
    expect(persisted().careerRequirements).toEqual([]);
    field(
      dialog,
      "Qualification source URL",
      "https://www.e-publishing.af.mil/",
    );
    field(dialog, "Qualification source checked date", addDays(localDate(), 1));
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Save qualification" })
        .closest("form")!,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "on or before today",
    );
    expect(persisted().careerRequirements).toEqual([]);
    field(dialog, "Qualification source checked date", localDate());
    field(dialog, "Actual completion date", localDate());
    field(dialog, "Qualification expiry date", addDays(localDate(), -1));
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Save qualification" })
        .closest("form")!,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "on or after the completion date",
    );
    expect(persisted().careerRequirements).toEqual([]);
  });

  it("does not infer completion evidence or dates and requires confirmation before removing a record", () => {
    mount(defaultState());
    fireEvent.click(screen.getByRole("button", { name: "Add qualification" }));
    let dialog = screen.getByRole("dialog");
    field(dialog, "Qualification title", "Completed certification");
    field(dialog, "Qualification category", "Certification");
    field(dialog, "Qualification status", "Complete");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save qualification" }),
    );
    expect(persisted().careerRequirements[0]).toMatchObject({
      completedDate: "",
      evidence: "",
      lastVerified: "",
      sourceUrl: "",
    });
    const card = screen.getByRole("article", {
      name: "Qualification Completed certification",
    });
    expect(card.textContent).toContain("Add the evidence or record reference");
    expect(card.textContent).toContain("Record the actual completion date");
    fireEvent.change(screen.getByLabelText("Qualification view"), {
      target: { value: "Needs attention" },
    });
    expect(
      screen.getByRole("article", {
        name: "Qualification Completed certification",
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Delete qualification Completed certification",
      }),
    );
    expect(persisted().careerRequirements).toHaveLength(1);
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep qualification" }),
    );
    expect(persisted().careerRequirements).toHaveLength(1);
    fireEvent.click(
      within(card).getByRole("button", {
        name: "Delete qualification Completed certification",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove qualification",
      }),
    );
    expect(persisted().careerRequirements).toEqual([]);
  });
});
