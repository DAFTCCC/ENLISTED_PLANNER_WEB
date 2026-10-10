import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultState,
  parsePlannerData,
  PlannerProvider,
  STORAGE_KEY,
} from "../lib/planner";
import { localDate } from "../lib/dates";
import { ReminderRunner } from "../lib/reminders";
import CalendarConnections from "./CalendarConnections";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const persisted = () => parsePlannerData(localStorage.getItem(STORAGE_KEY)!);
const renderConnections = () =>
  render(
    <PlannerProvider>
      <CalendarConnections />
    </PlannerProvider>,
  );

describe("calendar connection decisions", () => {
  it("requests notification permission only from the user's button and retains opt-in settings", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    renderConnections();
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Calendar connections & reminders"));
    fireEvent.click(
      screen.getByRole("button", { name: "Request browser notifications" }),
    );
    await waitFor(() =>
      expect(persisted().reminderPreferences.enabled).toBe(true),
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
    const sources = screen.getByRole("group", {
      name: "Browser reminder sources",
    });
    fireEvent.click(within(sources).getByLabelText("Events and time blocks"));
    expect(persisted().reminderPreferences.includeEvents).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Turn reminders off" }));
    expect(persisted().reminderPreferences.enabled).toBe(false);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
  it("keeps permission refusal off and explains foreground delivery before opt-in", async () => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    renderConnections();
    fireEvent.click(screen.getByText("Calendar connections & reminders"));
    expect(
      screen.getByText(/cannot guarantee reminders after you close it/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Request browser notifications" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("blocked"),
    );
    expect(persisted().reminderPreferences.enabled).toBe(false);
  });
  it("downloads a real calendar file with notes excluded by default and rejects an excessive range", () => {
    const state = defaultState();
    state.tasks.push({
      id: "task",
      title: "Submit tasker",
      date: localDate(),
      priority: "Normal",
      completed: false,
      notes: "Private context",
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const createObjectURL = vi.fn().mockReturnValue("blob:calendar");
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderConnections();
    fireEvent.click(screen.getByText("Calendar connections & reminders"));
    fireEvent.click(
      screen.getByRole("button", { name: "Export calendar (.ics)" }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0].type).toBe(
      "text/calendar;charset=utf-8",
    );
    expect(screen.getByRole("status").textContent).toContain("1 entry");
    fireEvent.change(screen.getByLabelText("Export start date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Export end date"), {
      target: { value: "2028-01-01" },
    });
    expect(screen.getByRole("alert").textContent).toContain("366 days");
    expect(
      (
        screen.getByRole("button", {
          name: "Export calendar (.ics)",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("deduplicates foreground deliveries across rerenders and never prompts during runner startup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 8, 45));
    const state = defaultState();
    state.reminderPreferences.enabled = true;
    state.reminderPreferences.leadMinutes = 15;
    state.tasks.push({
      id: "task",
      title: "Task",
      date: "2026-10-10",
      priority: "Normal",
      completed: false,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const notify = vi.fn();
    const request = vi.fn();
    class BrowserNotification {
      static permission = "granted";
      static requestPermission = request;
      onclick = null;
      constructor() {
        notify();
      }
      close() {}
    }
    vi.stubGlobal("Notification", BrowserNotification);
    const first = render(
      <PlannerProvider>
        <ReminderRunner />
      </PlannerProvider>,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notify).toHaveBeenCalledTimes(1);
    first.unmount();
    render(
      <PlannerProvider>
        <ReminderRunner />
      </PlannerProvider>,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
});
