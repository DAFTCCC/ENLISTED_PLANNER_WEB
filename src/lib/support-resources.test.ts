import { describe, expect, it } from "vitest";
import {
  SUPPORT_AGENCIES,
  SUPPORT_NEEDS,
  matchAgencyContacts,
  matchSupportNeed,
} from "./support-resources";
import type { Contact } from "./types";
const contact = (
  id: string,
  name: string,
  agency: string,
  role = "",
): Contact => ({
  id,
  name,
  agency,
  role,
  phone: "",
  email: "",
  location: "",
  notes: "",
});

describe("Helping Hands referrals", () => {
  it("offers explained, distinct, supported agencies for every listed need", () => {
    expect(new Set(SUPPORT_NEEDS.map((need) => need.id)).size).toBe(
      SUPPORT_NEEDS.length,
    );
    expect(new Set(SUPPORT_AGENCIES.map((agency) => agency.id)).size).toBe(
      SUPPORT_AGENCIES.length,
    );
    for (const need of SUPPORT_NEEDS) {
      const matches = matchSupportNeed(need.id);
      expect(matches.length).toBeGreaterThan(0);
      expect(new Set(matches.map((match) => match.agency.id)).size).toBe(
        matches.length,
      );
      for (const match of matches) {
        expect(SUPPORT_AGENCIES).toContain(match.agency);
        expect(match.reason.length).toBeGreaterThan(15);
      }
    }
    expect(matchSupportNeed("unknown")).toEqual([]);
  });
  it("distinguishes safety, clinical support, financial help, and defense advice", () => {
    const ids = (id: string) =>
      matchSupportNeed(id).map((match) => match.agency.id);
    expect(ids("financial-emergency")).toContain("afas");
    expect(ids("financial-emergency")).not.toContain("sarc");
    expect(ids("sexual-assault")[0]).toBe("sarc");
    expect(ids("domestic-violence")[0]).toBe("dava");
    expect(ids("suicide-prevention")).toContain("mental-health");
    expect(ids("suicide-prevention")).not.toContain("mflc");
    expect(ids("adverse-action")[0]).toBe("defense-counsel");
  });
  it("matches local agency aliases and role phrases without accidental substring matches", () => {
    const contacts = [
      contact("readiness", "Readiness office", "m&frc"),
      contact("eo", "Morgan", "Unit", "EO representative"),
      contact("other", "George Ortega", "Operations"),
      contact("mental", "Behavioral health office", "Behavioral Health"),
    ];
    expect(
      matchAgencyContacts("family-readiness", contacts).map((item) => item.id),
    ).toEqual(["readiness"]);
    expect(
      matchAgencyContacts("equal-opportunity", contacts).map((item) => item.id),
    ).toEqual(["eo"]);
    expect(
      matchAgencyContacts("mental-health", contacts).map((item) => item.id),
    ).toEqual(["mental"]);
    expect(matchAgencyContacts("health-promotion", contacts)).toEqual([]);
    expect(matchAgencyContacts("unknown", contacts)).toEqual([]);
  });
  it("uses checked HTTPS official resource pages and does not invent local phone details", () => {
    for (const agency of SUPPORT_AGENCIES) {
      if (agency.url)
        expect(new URL(agency.url).hostname).toBe("www.militaryonesource.mil");
      expect(agency).not.toHaveProperty("phone");
      expect(agency).not.toHaveProperty("email");
    }
  });
});
