import { expect, test } from "@playwright/test";

test("passcode lock encrypts the plan, survives reload, and turns off without loss", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore first", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add time block", exact: true })
    .click();
  await page
    .getByLabel("What are you making time for?")
    .fill("Encrypted feedback session");
  await page.getByLabel("Start time", { exact: true }).fill("09:00");
  await page.getByLabel("End time", { exact: true }).fill("10:00");
  await page
    .getByRole("button", { name: "Save time block", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  await page.getByLabel("New passcode", { exact: true }).fill("blue falcon 42");
  await page.getByLabel("Confirm passcode", { exact: true }).fill("blue falcon 42");
  await page.getByRole("checkbox", { name: /cannot be recovered/ }).check();
  await page
    .getByRole("button", { name: "Turn on passcode lock", exact: true })
    .click();
  await expect(page.getByText(/Passcode lock is on/)).toBeVisible({
    timeout: 20000,
  });

  const stored = await page.evaluate(() => ({
    plain: localStorage.getItem("enlisted-planner:v1"),
    vault: localStorage.getItem("enlisted-planner:vault") ?? "",
  }));
  expect(stored.plain).toBeNull();
  expect(stored.vault).not.toContain("Encrypted feedback session");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Enlisted Planner is locked" }),
  ).toBeVisible();
  await page.getByLabel("Passcode", { exact: true }).fill("wrong passcode");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "did not unlock",
    { timeout: 20000 },
  );
  await page.getByLabel("Passcode", { exact: true }).fill("blue falcon 42");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page
    .getByRole("button", { name: "Day plan", exact: false })
    .first()
    .click({ timeout: 20000 });
  await expect(page.getByText("Encrypted feedback session").first()).toBeVisible();

  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await page.getByLabel("Current passcode", { exact: true }).fill("blue falcon 42");
  await page
    .getByRole("button", { name: "Turn off passcode lock", exact: true })
    .click();
  await expect(page.getByText(/Passcode lock is off/)).toBeVisible({
    timeout: 20000,
  });
  const restored = await page.evaluate(() => ({
    plain: localStorage.getItem("enlisted-planner:v1") ?? "",
    vault: localStorage.getItem("enlisted-planner:vault"),
  }));
  expect(restored.vault).toBeNull();
  expect(restored.plain).toContain("Encrypted feedback session");
});
