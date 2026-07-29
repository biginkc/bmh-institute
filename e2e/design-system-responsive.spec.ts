import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function expectTailCenteredOnBubble(
  tail: import("@playwright/test").Locator,
  body: import("@playwright/test").Locator,
) {
  const tailBounds = await tail.boundingBox();
  const bodyBounds = await body.boundingBox();

  expect(tailBounds).not.toBeNull();
  expect(bodyBounds).not.toBeNull();

  const tailCenterY = tailBounds!.y + tailBounds!.height / 2;
  const bodyCenterY = bodyBounds!.y + bodyBounds!.height / 2;
  expect(Math.abs(tailCenterY - bodyCenterY)).toBeLessThanOrEqual(1);
}

test("coach speech-bubble tails stay centered, attached, and aimed at Andrea", async ({ page }) => {
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
    const body = bubble.locator("[data-speech-bubble-body]");
    const andrea = coach.getByRole("img", { name: "Andrea" });

    await expect(coach).toBeVisible();
    await expect(bubble).toBeVisible();
    await expect(body).toBeVisible();
    await expect(tail).toHaveCount(1);
    await expect(andrea).toBeVisible();
    await expectTailCenteredOnBubble(tail, body);

    const tailBounds = (await tail.boundingBox())!;
    const bodyBounds = (await body.boundingBox())!;
    const andreaBounds = (await andrea.boundingBox())!;
    const pointsLeft = index === 0;

    if (pointsLeft) {
      expect(tailBounds.x).toBeLessThan(bodyBounds.x);
      expect(tailBounds.x + tailBounds.width).toBeGreaterThan(bodyBounds.x);
      expect(tailBounds.x).toBeGreaterThan(andreaBounds.x + andreaBounds.width);
    } else {
      expect(tailBounds.x).toBeLessThan(bodyBounds.x + bodyBounds.width);
      expect(tailBounds.x + tailBounds.width).toBeGreaterThan(
        bodyBounds.x + bodyBounds.width,
      );
      expect(tailBounds.x + tailBounds.width).toBeLessThan(andreaBounds.x);
    }

    for (const element of [coach, bubble, body, tail, andrea]) {
      const bounds = await element.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    }
  }
});
