import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

async function openPlanner(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore first", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
}
async function addBlock(
  page: Page,
  title: string,
  start = "09:00",
  end = "10:00",
) {
  await page
    .getByRole("button", { name: "Add time block", exact: true })
    .click();
  await page.getByLabel("What are you making time for?").fill(title);
  await page.getByLabel("Start time", { exact: true }).fill(start);
  await page.getByLabel("End time", { exact: true }).fill(end);
  await page
    .getByRole("button", { name: "Save time block", exact: true })
    .click();
}

test("daily time blocking survives refresh, rejects overlap, edits, completes, and deletes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPlanner(page);
  await addBlock(page, "Focused mission planning");
  await expect(
    page.getByRole("article", {
      name: "Focused mission planning, 09:00 to 10:00",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("article", {
      name: "Focused mission planning, 09:00 to 10:00",
    }),
  ).toBeVisible();
  await addBlock(page, "Conflicting meeting", "09:30", "10:30");
  await expect(page.getByRole("alert")).toContainText("overlaps");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Focused mission planning", exact: true })
    .click();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("Development");
  await page.getByLabel("Start time", { exact: true }).fill("10:00");
  await page.getByLabel("End time", { exact: true }).fill("11:30");
  await page
    .getByRole("button", { name: "Save time block", exact: true })
    .click();
  await expect(
    page.getByRole("article", {
      name: "Focused mission planning, 10:00 to 11:30",
    }),
  ).toBeVisible();
  await page
    .getByRole("article", { name: "Focused mission planning, 10:00 to 11:30" })
    .locator(".block-drag-handle")
    .dragTo(
      page.getByRole("button", {
        name: "Add time block at 12:00",
        exact: true,
      }),
      { targetPosition: { x: 100, y: 4 } },
    );
  await expect(
    page.getByRole("article", {
      name: "Focused mission planning, 12:00 to 13:30",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Complete Focused mission planning",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Mark incomplete Focused mission planning",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("New daily priority").fill("Prepare mentoring session");
  await page.getByRole("button", { name: "Add priority", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Complete priority Prepare mentoring session",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Capture an accomplishment")
    .fill("Led a successful mission planning session");
  await page
    .getByRole("button", { name: "Capture a win", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Career records", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Led a successful mission planning session", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Day plan", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Edit Focused mission planning", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("article", { name: /Focused mission planning/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("backup contains the full plan, import restores it, and production app reloads offline", async ({
  page,
  context,
}) => {
  await openPlanner(page);
  await addBlock(page, "Evening PT", "17:00", "18:00");
  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: false })
    .click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.blocks[0].title).toBe("Evening PT");
  expect(backup.version).toBe(3);
  const changed = structuredClone(backup);
  changed.blocks[0].title = "Restored evening PT";
  await page.getByLabel("Choose planner backup").setInputFiles({
    name: "planner-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await page
    .getByRole("button", { name: "Replace and import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Day plan", exact: false })
    .first()
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await expect(
    page.getByText("Offline · available on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Restored evening PT, 17:00 to 18:00" }),
  ).toHaveCount(1);
  // Chromium reports onLine=true after a service-worker navigation even while CDP blocks network traffic.
  // Check the actual uncached request so the test still proves the app can reload without a network.
  expect(
    await page.evaluate(async () =>
      fetch("/uncached-connectivity-probe", { cache: "no-store" })
        .then(() => false)
        .catch(() => true),
    ),
  ).toBe(true);
});

test("onboarding reset removes the old profile and keyboard skip link keeps the selected module", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up my planner", exact: false })
    .click();
  await page.getByLabel("What should we call you?").fill("Test Airman");
  await page
    .getByRole("button", { name: "Start planning", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Settings & data", exact: true })
    .click();
  await page.keyboard.press("Control+Home");
  await page.getByRole("link", { name: "Skip to main content" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset all data", exact: false })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset all data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explore first", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("enlisted-planner:v1")!),
  );
  expect(saved.profile.name).toBe("");
  expect(saved.profile.dateOfEntry).toBe("");
  await expect(page.getByLabel("Preferred name (optional)")).toHaveValue("");
});

test("mobile navigation and all modules render without overflow or runtime errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPlanner(page);
  for (const [label, heading] of [
    ["Projects & taskers", "Projects & taskers"],
    ["Mission & priorities", "Mission & priorities"],
    ["Helping Hands", "Helping Hands"],
    ["Calendar", "Calendar"],
    ["Career progress", "Career progress"],
    ["Career records", "Career records"],
    ["Personal readiness", "Personal readiness"],
    ["Leadership", "Leadership"],
    ["Tools", "Tools"],
    ["Settings & data", "Settings"],
  ]) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      heading,
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Day plan", exact: true }).click();
  await addBlock(page, "Mobile planning", "13:00", "14:00");
  await expect(
    page.getByRole("article", { name: "Mobile planning, 13:00 to 14:00" }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "/tmp/enlisted-planner-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("production assets, reference PDF, and offline scope work at a GitHub Pages repository path", async ({
  page,
  context,
}) => {
  const root = resolve("dist");
  const prefix = "/ENLISTED_PLANNER_WEB";
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".pdf": "application/pdf",
  };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(
        new URL(request.url!, "http://localhost").pathname,
      );
      if (!path.startsWith(`${prefix}/`)) {
        response.writeHead(404).end();
        return;
      }
      const file = resolve(
        root,
        `.${path.slice(prefix.length) === "/" ? "/index.html" : path.slice(prefix.length)}`,
      );
      if (!file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}${prefix}/`;
  try {
    await page.goto(url);
    await page
      .getByRole("button", { name: "Explore first", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Settings & data", exact: true })
      .click();
    const reference = page.getByRole("link", {
      name: "Open 2026 planner reference",
      exact: false,
    });
    const referenceUrl = await reference.getAttribute("href");
    const pdf = await page.request.get(new URL(referenceUrl!, page.url()).href);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    expect(
      await page.evaluate(
        () => new URL(navigator.serviceWorker.controller!.scriptURL).pathname,
      ),
    ).toBe(`${prefix}/sw.js`);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1, exact: true }),
    ).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
