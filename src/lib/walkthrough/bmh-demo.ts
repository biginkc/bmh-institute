export const BMH_DEMO_WALKTHROUGH_ID = "bmh-institute-demo";

export type WalkthroughStep = {
  caption: string;
  path: string;
  step: number;
};

const COURSE_ID = "3803c874-b9da-44c7-9e2b-88bc5a870ef2";
const FIRST_LESSON_ID = "8efc3f0b-0629-49f7-b41d-c7b72b2f2232";
const ROLE_PLAY_LESSON_ID = "fc9c425b-f6a8-40dc-bb0e-ed53d1147a33";
const QUIZ_LESSON_ID = "0e6c452d-e221-452c-991d-29a048126b96";
const ASSIGNMENT_LESSON_ID = "afc340c8-9d18-4f31-8703-67b22653e626";

export const bmhDemoWalkthroughSteps: WalkthroughStep[] = [
  {
    step: 1,
    path: "/dashboard",
    caption:
      "Step 1: Dashboard. Start here with the shared shell, assigned programs, learner progress, and the first-step training prompt.",
  },
  {
    step: 2,
    path: `/courses/${COURSE_ID}`,
    caption:
      "Step 2: Course overview. This shows the four-module walkthrough course and the different lesson types learners will use.",
  },
  {
    step: 3,
    path: `/lessons/${FIRST_LESSON_ID}`,
    caption:
      "Step 3: Content lesson. Learners read structured blocks and mark required lessons complete from the persistent lesson view.",
  },
  {
    step: 4,
    path: `/lessons/${ROLE_PLAY_LESSON_ID}`,
    caption:
      "Step 4: Closer Lab embed. BMH Institute keeps the learner in context while the role-play practice runs inside the lesson.",
  },
  {
    step: 5,
    path: `/lessons/${QUIZ_LESSON_ID}`,
    caption:
      "Step 5: Quiz. Learners answer scored questions with attempt limits before moving deeper into the course.",
  },
  {
    step: 6,
    path: `/lessons/${ASSIGNMENT_LESSON_ID}`,
    caption:
      "Step 6: Assignment. Learners submit written work for admin review, separate from quiz scoring and role-play completion.",
  },
];

export function getBmhDemoWalkthroughStep(step: number) {
  return bmhDemoWalkthroughSteps.find((item) => item.step === step) ?? null;
}

export function getBmhDemoWalkthroughUrl(step: number) {
  const item = getBmhDemoWalkthroughStep(step);

  if (!item) {
    return null;
  }

  return `${item.path}?walkthrough=${BMH_DEMO_WALKTHROUGH_ID}&step=${item.step}`;
}
