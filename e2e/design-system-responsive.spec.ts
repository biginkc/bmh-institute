import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("coach sprites and speech bubbles stay inside a mobile viewport", async ({ page }) => {
  await page.goto("/design-system");

  const coachHeading = page.getByRole("heading", { name: "Coach" });
  const coachSection = coachHeading.locator("..");
  const coaches = coachSection.locator("[data-coach]");
  await expect(coaches).toHaveCount(2);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);

  for (let index = 0; index < 2; index += 1) {
    const coach = coaches.nth(index);
    const bubble = coach.locator("[data-speech-bubble]");
    const tail = bubble.locator("[data-speech-bubble-tail]");
    const andrea = coach.getByRole("img", { name: "Andrea" });

    await expect(coach).toBeVisible();
    await expect(bubble).toBeVisible();
    await expect(tail).toHaveCount(1);
    await expect(andrea).toBeVisible();

    for (const element of [coach, bubble, tail, andrea]) {
      const bounds = await element.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    }
  }
});
