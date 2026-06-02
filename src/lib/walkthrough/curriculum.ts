export const WALKTHROUGH_ROLE_GROUP = "BMH Institute Walkthrough Learners";
export const WALKTHROUGH_PROGRAM = "BMH Institute Walkthrough Onboarding";
export const WALKTHROUGH_COURSE = "Walkthrough Demo: BMH Training Flow";
export const WALKTHROUGH_CLOSER_LAB_SCENARIO_ID =
  "42683d23-5a06-4a49-9c0b-355d6e424c43";

export type WalkthroughBlock =
  | {
      type: "text";
      html: string;
      required?: boolean;
    }
  | {
      type: "callout";
      variant: "info" | "success" | "warning" | "note";
      markdown: string;
      required?: boolean;
    }
  | {
      type: "external_link";
      label: string;
      url: string;
      description: string;
      required?: boolean;
    }
  | {
      type: "embed";
      iframe_src: string;
      aspect_ratio: "16:9" | "4:3" | "1:1";
      required?: boolean;
    }
  | {
      type: "role_play";
      scenario_id: string;
      title: string;
      height_px: number;
      required?: boolean;
    }
  | {
      type: "divider";
      required?: boolean;
    };

export type WalkthroughLesson =
  | {
      type: "content";
      title: string;
      description: string;
      required?: boolean;
      blocks: WalkthroughBlock[];
    }
  | {
      type: "quiz";
      title: string;
      description: string;
      required?: boolean;
      quiz: {
        title: string;
        description: string;
        passingScore: number;
        questions: Array<{
          question: string;
          explanation: string;
          options: Array<{ text: string; correct: boolean }>;
        }>;
      };
    }
  | {
      type: "assignment";
      title: string;
      description: string;
      required?: boolean;
      assignment: {
        title: string;
        instructions: string;
        submissionType: "text" | "url" | "file_upload";
        requiresReview: boolean;
      };
    };

export type WalkthroughModule = {
  title: string;
  description: string;
  lessons: WalkthroughLesson[];
};

export const walkthroughModules: WalkthroughModule[] = [
  {
    title: "Module 1: Find Your Way Around",
    description: "A first pass through the learner dashboard and course layout.",
    lessons: [
      {
        type: "content",
        title: "Start Here: BMH Institute Tour",
        description: "Learn where to find assigned training and next steps.",
        blocks: [
          {
            type: "text",
            html: "<h2>Welcome to BMH Institute</h2><p>This walkthrough gives new learners a guided path through the same surfaces they will use for real training: dashboard, course pages, lessons, quizzes, assignments, role plays, and certificates.</p><p>Use it when onboarding a new VA or when showing an admin how the training flow works end to end.</p>",
          },
          {
            type: "callout",
            variant: "info",
            markdown:
              "The dashboard shows assigned programs, progress, and the next lesson. If a learner is missing training, check their role groups before changing course content.",
            required: false,
          },
          { type: "divider", required: false },
          {
            type: "external_link",
            label: "Open the internal pilot runbook",
            url: "/admin/reports",
            description:
              "Admins use reports to monitor learner progress during walkthroughs and pilot runs.",
            required: false,
          },
        ],
      },
      {
        type: "content",
        title: "How Lessons Mark Complete",
        description: "Understand required blocks and completion tracking.",
        blocks: [
          {
            type: "text",
            html: "<h2>Completion is block based</h2><p>Some lesson blocks are required. When a learner completes the required blocks, the lesson can count toward course and program progress.</p><p>Role plays can also mark complete when the embedded Closer Lab scenario sends a trusted completion event back to BMH Institute.</p>",
          },
          {
            type: "callout",
            variant: "success",
            markdown:
              "For walkthroughs, say out loud what the learner should see next before moving to the next lesson.",
            required: false,
          },
        ],
      },
    ],
  },
  {
    title: "Module 2: Learn the Operating Standard",
    description: "Practice the expectations that show up in real VA training.",
    lessons: [
      {
        type: "content",
        title: "BMH Call Standard",
        description: "Review the basic seller-call operating pattern.",
        blocks: [
          {
            type: "text",
            html: "<h2>The call pattern</h2><p>Start with the seller's goal. Confirm the property facts. Ask one clear question at a time. End by confirming the next step in plain language.</p>",
          },
          {
            type: "callout",
            variant: "note",
            markdown:
              "Good notes make the next teammate faster. Capture the seller goal, timeline, property condition, motivation, and agreed next action.",
            required: false,
          },
          {
            type: "embed",
            iframe_src: "https://www.youtube.com/embed/ysz5S6PUM-U",
            aspect_ratio: "16:9",
            required: false,
          },
        ],
      },
      {
        type: "quiz",
        title: "Walkthrough Knowledge Check",
        description: "A short quiz that demonstrates answer submission.",
        quiz: {
          title: "Walkthrough Knowledge Check",
          description:
            "Checks the core walkthrough points before practice and assignment steps.",
          passingScore: 80,
          questions: [
            {
              question: "What should a VA confirm before ending a seller call?",
              explanation:
                "The next step keeps the workflow clear for the seller and the team.",
              options: [
                { text: "The agreed next step", correct: true },
                { text: "Only the seller's first name", correct: false },
                { text: "Nothing else if the call is long", correct: false },
              ],
            },
            {
              question: "What should admins check if a learner cannot see training?",
              explanation:
                "Role groups control access to programs and courses in BMH Institute.",
              options: [
                { text: "The learner's role groups", correct: true },
                { text: "The browser zoom level", correct: false },
                { text: "The certificate template first", correct: false },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    title: "Module 3: Practice and Submit",
    description: "Use Closer Lab practice and submit a short training artifact.",
    lessons: [
      {
        type: "content",
        title: "Closer Lab Demo: Skeptical Seller",
        description: "Practice a short role play inside BMH Institute.",
        blocks: [
          {
            type: "text",
            html: "<h2>Practice in context</h2><p>This embedded role play lets a learner practice a skeptical seller conversation without leaving the lesson.</p><p>After the scenario completes, BMH Institute records the result so admins can review learner activity from reports.</p>",
            required: false,
          },
          {
            type: "role_play",
            scenario_id: WALKTHROUGH_CLOSER_LAB_SCENARIO_ID,
            title: "Closer Lab Demo: Skeptical Seller",
            height_px: 760,
          },
          {
            type: "callout",
            variant: "warning",
            markdown:
              "If the role play does not load, confirm the Closer Lab base URL and shared role-play secret are configured in production.",
            required: false,
          },
        ],
      },
      {
        type: "assignment",
        title: "Submit Walkthrough Call Notes",
        description: "Submit a short note so admins can review the workflow.",
        assignment: {
          title: "Walkthrough Call Notes",
          submissionType: "text",
          requiresReview: true,
          instructions:
            "Write five bullet points from the practice call: seller goal, timeline, property condition, main objection, and next step.",
        },
      },
    ],
  },
  {
    title: "Module 4: Finish and Review",
    description: "Close the loop with reporting, certificates, and follow-up.",
    lessons: [
      {
        type: "content",
        title: "Admin Review and Reporting",
        description: "See what admins can review after learner activity.",
        blocks: [
          {
            type: "text",
            html: "<h2>What admins see</h2><p>Admins can use reports to review learner progress, quiz attempts, assignment submissions, certificates, and completed role plays.</p>",
          },
          {
            type: "external_link",
            label: "Open learner reports",
            url: "/admin/reports",
            description:
              "Use this route after a walkthrough to confirm progress and role-play results.",
            required: false,
          },
        ],
      },
      {
        type: "content",
        title: "Walkthrough Wrap-Up",
        description: "Finish the walkthrough and prepare for real assignments.",
        blocks: [
          {
            type: "text",
            html: "<h2>Ready for the real course</h2><p>After this walkthrough, the learner should know where to start, how lesson completion works, how to submit quizzes and assignments, and how role-play practice fits into BMH Institute.</p>",
          },
          {
            type: "callout",
            variant: "success",
            markdown:
              "For live onboarding, finish by assigning the learner's real role group and confirming the dashboard shows their first required course.",
            required: false,
          },
        ],
      },
    ],
  },
];

export function getWalkthroughContentTypeCounts() {
  const counts = new Map<string, number>();
  for (const walkthroughModule of walkthroughModules) {
    for (const lesson of walkthroughModule.lessons) {
      counts.set(lesson.type, (counts.get(lesson.type) ?? 0) + 1);
      if (lesson.type === "content") {
        for (const block of lesson.blocks) {
          counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
        }
      }
    }
  }
  return Object.fromEntries(counts);
}
