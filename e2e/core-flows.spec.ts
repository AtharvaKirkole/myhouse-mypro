/* Playwright UI tests for the five MVP flows: login, upload asset,
   add home (signup), request repair, move furniture. */

import { expect, test } from "@playwright/test";

test("login as pro", async ({ page }) => {
  await page.goto("/auth/mypro");
  await page.getByRole("button", { name: "Log in" }).first().click();
  await page.getByPlaceholder("you@yourbusiness.com").fill("marcus@blueline.com");
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page).toHaveURL(/\/mypro/);
  await expect(page.getByText("BlueLine Plumbing Co.").first()).toBeVisible();
});

test("signup adds a home (consumer onboarding)", async ({ page }) => {
  await page.goto("/auth/myhouse");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByPlaceholder("Atharva Kirkole").fill("Test Owner");
  await page.getByPlaceholder("you@example.com").fill("owner@e2e.test");
  await page.getByPlaceholder("4821 E Maple Hollow Dr, Phoenix, AZ").fill("12 E2E Way, Phoenix, AZ");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/myhouse/);
  await expect(page.getByText(/welcome back, Test/)).toBeVisible();
});

test("upload asset via AI wizard (sample)", async ({ page }) => {
  await page.goto("/assets");
  await page.getByRole("button", { name: /Add asset with AI/ }).click();
  await page.getByRole("button", { name: /Couch photo \+ receipt/ }).click();
  await page.getByRole("button", { name: /Scan with AI/ }).click();
  await expect(page.getByText(/We found: West Elm/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Looks right/ }).click();
  await expect(page.getByText("Added to your home")).toBeVisible();
});

test("request repair via reverse marketplace", async ({ page }) => {
  await page.goto("/request");
  await page.getByRole("textbox").fill("Water is dripping from the ceiling under the upstairs bathroom");
  await page.getByRole("button", { name: /Structure my job/ }).click();
  await expect(page.getByText("Active leak repair")).toBeVisible();
  await page.getByRole("button", { name: /Broadcast to/ }).click();
  await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 15_000 });
});

test("move furniture on the digital twin", async ({ page }) => {
  await page.goto("/myhouse/twin");
  await page.getByRole("button", { name: /Arrange/ }).click();
  const svg = page.locator('svg[viewBox="0 0 820 560"]');
  const sofa = svg.locator("g", { hasText: "🛋️" }).first();
  const box = await sofa.boundingBox();
  if (!box) throw new Error("sofa not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
  await page.mouse.up();
  const saved = await page.evaluate(() => localStorage.getItem("mh_twin_positions"));
  expect(saved).toBeTruthy();
});
