import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ASSET_ROOT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
const SOURCE_ROOT = "/Users/jarradhenry/BMH-OS/BMH Training Course/Thinkific";
const OUTPUT_PATH = path.join(REPO_ROOT, "content/course-manifests/bmh-employee-training.v1.json");

const HELD_METADATA = {
  "video-slot-01-welcome": [246.186, 35190296, "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72"],
  "video-slot-01-mindset": [362.688, 107220021, "b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da"],
  "video-slot-02-terms": [451.754, 110768219, "17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb"],
  "video-slot-10-objection-scripts": [1508.757, 572011027, "59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb"],
  "video-slot-15-closing": [329.429, 55329810, "6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2"],
  "video-slot-16-kpis": [402.154, 56052870, "439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b"],
};

const VIDEO_SOURCES = [
  ["video-slot-01-welcome", 1, "Welcome and the Navigator's Playbook", "Part A", "course-assets/review-lessonA/LESSON-1A-v7.mp4"],
  ["video-slot-01-mindset", 1, "Mindset", "Part B", "course-assets/review-lessonB/LESSON-1B-v4.mp4"],
  ["video-slot-02-terms", 2, "Real Estate Terms Glossary", null, "course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4"],
  ["video-slot-03-tech-stack", 3, "Tech Stack and Systems", null, "course-assets/review-lessonTECHA/LESSON-TECHA-v5.mp4"],
  ["video-slot-04-humanizing-a", 4, "Humanizing the Lead", "Part A", "course-assets/review-lesson2A/LESSON-2A-v1-FINAL.mp4"],
  ["video-slot-04-humanizing-b", 4, "Humanizing the Lead", "Part B", "course-assets/review-lesson2B/LESSON-2B-v3-FULL.mp4"],
  ["video-slot-04-ideal-seller", 4, "Ideal Seller Profile", "Part C", "course-assets/review-lessonISP/LESSON-ISP-v6.mp4"],
  ["video-slot-05-offer-a", 5, "The BMH Offer Playbook", "Part A", "course-assets/review-lesson3A/LESSON-3A-rev1-FULL.mp4"],
  ["video-slot-05-offer-b", 5, "The BMH Offer Playbook", "Part B", "course-assets/review-lesson3B/LESSON-3B-v1-FULL.mp4"],
  ["video-slot-06-pipeline", 6, "Sales Pipeline and Stage Ownership", "Part A", "course-assets/review-lesson4A/LESSON-4A-v3.mp4"],
  ["video-slot-06-framework", 6, "The Five-Step Conversation Framework", "Part B", "course-assets/review-lesson4B/LESSON-4B-v1-APPROVED.mp4"],
  ["video-slot-07-opening", 7, "Opening the Call", "Part A", "course-assets/review-lesson5A/LESSON-5A-v3-FINAL.mp4"],
  ["video-slot-07-fact-find", 7, "The Fact Find", "Part B", "course-assets/review-lesson5B/LESSON-5B-v1-FINAL.mp4"],
  ["video-slot-08-discovery", 8, "Discovery", "Part A", "course-assets/review-lesson6A/LESSON-6A-v2-FULL.mp4"],
  ["video-slot-08-handoff", 8, "The Handoff", "Part B", "course-assets/review-lesson6B/LESSON-6B-v3.mp4"],
  ["video-slot-09-objection-architecture", 9, "Objection Architecture", null, "course-assets/review-lesson7A/LESSON-7A-v1-FULL.mp4"],
  ["video-slot-10-objection-scripts", 10, "Objection Scripts Playbook", null, "course-assets/review-lesson7B/LESSON-7B-v5.mp4"],
  ["video-slot-11-complex", 11, "Complex Objections", "Part A", "course-assets/review-lesson8A/LESSON-8A-v1-FULL.mp4"],
  ["video-slot-11-trust", 11, "Trust and People Objections", "Part B", "course-assets/review-lesson8B/LESSON-8B-v2.mp4"],
  ["video-slot-12-faq-a", 12, "Seller FAQ Decoder Questions 1 through 5", "Part A", "course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4"],
  ["video-slot-12-faq-b", 12, "Seller FAQ Decoder Questions 6 through 10", "Part B", "course-assets/review-lesson9B/LESSON-9B-v3.mp4"],
  ["video-slot-13-follow-up", 13, "Follow-Up Cadence", null, "course-assets/review-lesson10A/LESSON-10A-v6.mp4"],
  ["video-slot-14-flow", 14, "Conversation Flow Mastery", null, "course-assets/review-lesson1C/LESSON-1C-v3-FULL.mp4"],
  ["video-slot-15-closing", 15, "Closing and Deal Engineering", null, "course-assets/review-lesson11A/LESSON-11A-v4.mp4"],
  ["video-slot-16-kpis", 16, "KPIs and Sales Telemetry", null, "course-assets/review-lesson12A/LESSON-12A-v11.mp4"],
  ["video-slot-17-compensation", 17, "Compensation Engine", null, "course-assets/review-lesson17/LESSON-17-v1-QT.mp4"],
  ["video-slot-18-operator", 18, "Operator Playbook", "Part A", "course-assets/review-lesson18A/LESSON-18A-v10.mp4"],
  ["video-slot-18-mission-control", 18, "Daily Mission Control", "Part B", "course-assets/review-lesson18B/LESSON-18B-v7.mp4"],
  ["video-slot-19-career", 19, "Career Growth Path", null, "course-assets/review-lesson19/LESSON-19-v7.mp4"],
];

const LESSONS = [
  {
    slot: 1,
    module: 1,
    title: "Welcome and Mindset",
    summary: "Learn the BMH Group service standard and the mindset that keeps seller conversations clear, calm, and human.",
    objectives: ["Explain the Navigator role", "Put service before pressure", "Use curiosity and clarity in seller conversations", "Detach from outcomes while staying accountable"],
    guide: ["The goal is an aligned decision, not a forced yes", "Listen for the seller's real problem before discussing a solution", "Treat repetition as practice that creates calm", "A respectful no is better than a pressured agreement"],
  },
  {
    slot: 2,
    module: 1,
    title: "Real Estate Terms Glossary",
    summary: "Build the vocabulary needed to follow property, title, financing, and transaction conversations without guessing.",
    objectives: ["Define core property and transaction terms", "Distinguish ARV, MAO, equity, and assignment", "Recognize title and foreclosure concepts", "Ask for clarification when a term affects a seller"],
    guide: ["Terms are tools for understanding, not jargon to impress sellers", "Translate technical language into plain English", "Never guess about legal or title questions", "Use the current deal record as the source for property facts"],
  },
  {
    slot: 3,
    module: 1,
    title: "Tech Stack and Systems",
    summary: "Understand where lead data, calls, research, practice, time tracking, and team communication belong.",
    objectives: ["Identify the purpose of each core tool", "Keep Sandra as the lead source of truth", "Use Closer Lab for deliberate practice", "Escalate blocked work through the correct team channel"],
    guide: ["If lead activity is not recorded in Sandra it is not operationally visible", "Use property tools for research and Sandra for relationship history", "Complete assigned tasks and next actions on time", "Ask your manager for the current SOP when a tool workflow changes"],
  },
  {
    slot: 4,
    module: 2,
    title: "Humanizing the Lead",
    summary: "Recognize the people and pressures behind distressed-property data and determine whether BMH Group can genuinely help.",
    objectives: ["Describe the ideal seller profile", "Identify urgency, condition, equity, and decision-maker signals", "Use respectful first-person language", "Disqualify poor fits without dehumanizing the seller"],
    guide: ["A lead is a person in a real situation", "Motivation is discovered through listening, not assumed from a list", "Hard filters protect both the seller and the team", "A seller's timeline and desired outcome matter as much as property data"],
  },
  {
    slot: 5,
    module: 2,
    title: "The BMH Offer Playbook",
    summary: "Explain how a direct property purchase exchanges maximum retail price for speed, certainty, convenience, and an as-is sale.",
    objectives: ["Explain the four offer pillars", "Describe ARV and repair-cost inputs", "Compare direct sale and traditional listing tradeoffs", "Present the offer without promising an outcome"],
    guide: ["The offer is a solution with tradeoffs, not a claim to be the highest price", "Use plain English when explaining the math", "Confirm the seller values the benefits before positioning them", "Do not invent property values or repair estimates"],
  },
  {
    slot: 6,
    module: 3,
    title: "Sales Pipeline and Stage Ownership",
    summary: "Move leads through the pipeline with a clear purpose, complete notes, and an owner at every stage.",
    objectives: ["Describe the purpose of each pipeline stage", "Identify the exit criteria for stages 1 through 4", "Use the five-step conversation framework", "Keep every active lead tied to a next action"],
    guide: ["A stage describes what is true now, not what you hope will happen", "Do not advance a lead before the exit criteria are met", "Document the reason for every stage change", "The handoff begins only after qualification and discovery are complete"],
  },
  {
    slot: 7,
    module: 3,
    title: "Opening the Call",
    summary: "Open seller conversations with permission, relevance, a clear frame, and a disciplined fact find.",
    objectives: ["Use the opening frame without sounding scripted", "Earn permission to continue", "Capture essential property and seller facts", "Transition from facts to deeper discovery"],
    guide: ["State why you are calling and give the seller room to respond", "Use a calm pace and equal-status tone", "Write down details instead of relying on memory", "The fact find creates context. It does not replace discovery"],
  },
  {
    slot: 8,
    module: 3,
    title: "Discovery and Handoff",
    summary: "Uncover the seller's situation, consequences, timeline, and decision process then deliver a clean acquisition handoff.",
    objectives: ["Distinguish qualification from discovery", "Ask consequence and future-state questions", "Confirm decision-makers and expectations", "Complete a concise handoff with all required context"],
    guide: ["Discovery explains why the seller may act", "Ask one question at a time and listen to the full answer", "Do not diagnose or advise outside your role", "A clean handoff lets the next person continue without making the seller repeat everything"],
  },
  {
    slot: 9,
    module: 4,
    title: "Objection Architecture",
    summary: "Use a repeatable framework to understand concerns before selecting a response.",
    objectives: ["Apply Listen, Acknowledge, Ask, Redirect", "Classify common objection types", "Avoid arguing with the seller", "Choose a response that matches the concern"],
    guide: ["An objection is information before it is resistance", "Acknowledge without automatically agreeing", "Ask enough to identify the real concern", "Redirect only after the seller feels heard"],
  },
  {
    slot: 10,
    module: 4,
    title: "Objection Scripts Playbook",
    summary: "Practice adaptable responses for price, timing, trust, competition, and decision-maker concerns.",
    objectives: ["Select a script pattern that matches the objection", "Adapt wording without changing its intent", "Use questions to reopen dialogue", "Know when to pause and seek guidance"],
    guide: ["Scripts are guardrails, not lines to recite at any cost", "Use the seller's language when reflecting a concern", "Do not answer a question you do not understand", "A graceful exit protects trust when there is no fit"],
  },
  {
    slot: 11,
    module: 4,
    title: "Complex Objections",
    summary: "Handle emotionally or structurally difficult situations with patience, boundaries, and appropriate escalation.",
    objectives: ["Recognize complex ownership and family dynamics", "Respond to scam and privacy concerns", "Separate empathy from legal advice", "Escalate cases that require specialist guidance"],
    guide: ["Slow down when the situation involves grief, conflict, or financial distress", "Never pretend to be an attorney or financial adviser", "Confirm who can legally make decisions", "Document sensitivities so the next team member can respond appropriately"],
  },
  {
    slot: 12,
    module: 4,
    title: "Seller FAQ Decoder",
    summary: "Answer common seller questions through the three lenses of trust, fairness, and simplicity.",
    objectives: ["Identify the concern behind a common question", "Explain the direct-sale tradeoff", "Answer clearly without overpromising", "Return to the seller's stated priorities"],
    guide: ["Answer the question that was asked before adding detail", "Use specific process facts instead of vague reassurance", "If an answer varies by deal, say so", "Confirm whether the answer resolved the seller's concern"],
  },
  {
    slot: 13,
    module: 5,
    title: "Follow-Up Cadence",
    summary: "Use planned, respectful follow-up to stay present without turning persistence into pressure.",
    objectives: ["Apply the follow-up cadence", "Choose a relevant reason for each contact", "Record every attempt and next action", "Recognize when to pause or stop outreach"],
    guide: ["Every follow-up should add context or make the next step easier", "Honor opt-outs and communication preferences", "Use multiple approved channels when appropriate", "Consistency matters more than one aggressive burst"],
  },
  {
    slot: 14,
    module: 5,
    title: "Conversation Flow Mastery",
    summary: "Keep difficult conversations moving through thought experiments, option framing, price exploration, and respectful repositioning.",
    objectives: ["Use thought experiments to create clarity", "Frame available paths without false urgency", "Explore price expectations", "Re-engage or de-position gracefully"],
    guide: ["Offer choices only when each choice is real", "Use curiosity to test assumptions", "Do not trap a seller into defending a number", "A clean de-position can preserve a future relationship"],
  },
  {
    slot: 15,
    module: 5,
    title: "Closing and Deal Engineering",
    summary: "Prepare and present an offer as a clear next step while protecting accuracy, consent, and handoff quality.",
    objectives: ["Prepare the information needed for an offer", "Present terms cleanly", "Identify unresolved decision barriers", "Confirm the next action without pressure"],
    guide: ["A strong close starts with accurate discovery", "State what is known and what still requires confirmation", "Let the seller evaluate the tradeoff", "Document the decision and exact next step"],
  },
  {
    slot: 16,
    module: 6,
    title: "KPIs and Sales Telemetry",
    summary: "Read the funnel from left to right to locate process gaps and choose the right coaching response.",
    objectives: ["Define the six core metrics", "Separate activity from productive progress", "Diagnose where a funnel breaks", "Use metrics for coaching rather than punishment"],
    guide: ["Metrics show where to investigate. They do not explain everything by themselves", "Use the current role scorecard for targets", "Check conversion between adjacent stages", "Pair numbers with notes and call review before deciding on a fix"],
  },
  {
    slot: 17,
    module: 6,
    title: "Compensation Engine",
    summary: "Understand that compensation depends on the value a role owns and that the current written plan is always the source of truth.",
    objectives: ["Identify the current compensation source of truth", "Connect role outcomes to the role scorecard", "Know where to take compensation questions", "Avoid relying on another person's plan or an old example"],
    guide: ["There is no universal formula for every role", "Use your current offer letter, written plan, or role sheet", "Ask your manager when any part of the plan is unclear", "Do not treat training examples or conversations as a compensation promise"],
  },
  {
    slot: 18,
    module: 6,
    title: "Operator Playbook and Daily Mission Control",
    summary: "Run a disciplined workday, keep the pipeline current, and communicate decisions and blockers through the team's operating systems.",
    objectives: ["Prioritize daily lead work", "Maintain notes, stages, and next actions", "Use team communication channels professionally", "Close the day with a clean pipeline and clear plan"],
    guide: ["Begin with scheduled and high-priority follow-ups", "Log notes immediately after meaningful activity", "Ask rather than guess when a situation is unfamiliar", "A worked day reflects complete controllable actions, not a guaranteed outcome"],
  },
  {
    slot: 19,
    module: 6,
    title: "Career Growth Path",
    summary: "Build readiness for more responsibility through consistent results, clean operations, coachability, and contribution to the team.",
    objectives: ["Describe the foundation for growth", "Recognize readiness signals", "Use feedback without defensiveness", "Discuss a development path with your manager"],
    guide: ["Advancement follows demonstrated readiness rather than a fixed calendar", "Quality and clean records matter alongside output", "Leadership begins with helping others succeed", "Your manager and current role expectations define the next development step"],
  },
];

const MODULES = [
  [1, "Orientation", "Learn the BMH Group service standard, vocabulary, and operating tools."],
  [2, "Who We Serve", "Understand the sellers BMH Group can help and the tradeoffs in our offer."],
  [3, "The Conversation", "Move from a clear opening through discovery and a complete handoff."],
  [4, "Objections and Questions", "Respond to concerns with empathy, structure, and accurate process information."],
  [5, "Cadence, Scripts, and Close", "Follow up consistently, guide conversation flow, and create a clean next step."],
  [6, "Performance and Career", "Use scorecards, operating discipline, and coaching to improve and grow."],
];

const ASSIGNMENTS = {
  1: {
    title: "Orientation Readiness Check",
    instructions: "Write a short operating plan that identifies the source of truth for lead data, where you will find current SOPs, how you will ask for help, and two behaviors you will use to keep seller conversations service-first.",
    rubric: [
      ["Systems", "Correctly identifies where lead data, SOPs, and blocked-work questions belong."],
      ["Service mindset", "Connects at least two mindset principles to observable behavior."],
      ["Clarity", "Uses specific actions rather than general promises."],
    ],
  },
  2: {
    title: "Seller and Offer Fit Analysis",
    instructions: "Review the supplied fictional seller profile. Explain whether the situation appears to fit BMH Group, what facts still need confirmation, and how you would explain the direct-sale tradeoff in plain English.",
    rubric: [
      ["Fit analysis", "Uses seller, property, timeline, and decision-maker signals without assumptions."],
      ["Offer framing", "Explains speed, certainty, convenience, and as-is condition without overpromising."],
      ["Respect", "Describes the seller as a person and avoids pressure language."],
    ],
  },
  3: {
    title: "Conversation and Handoff Plan",
    instructions: "Draft an opening, five discovery questions, and a handoff summary for a fictional tired-landlord lead. Include the pipeline stage, known facts, missing facts, motivation, timeline, decision-makers, and next action.",
    rubric: [
      ["Conversation flow", "Moves naturally from permission and facts into discovery."],
      ["Discovery", "Questions surface consequences, timing, priorities, and decision process."],
      ["Handoff quality", "The summary is accurate, concise, complete, and actionable."],
    ],
  },
  4: {
    title: "Objection Response Plan",
    instructions: "Choose three objections from the lesson. For each one, write a Listen, Acknowledge, Ask, Redirect response and identify when you would stop, escalate, or seek specialist guidance.",
    rubric: [
      ["Framework", "Each response includes all four steps in the correct order."],
      ["Fit", "Questions and redirects match the concern instead of using a generic rebuttal."],
      ["Boundaries", "Correctly identifies legal, financial, family, or authority issues that require escalation."],
    ],
  },
  5: {
    title: "Follow-Up and Closing Plan",
    instructions: "Create a 30-day follow-up plan for a fictional seller who is interested but not ready. Include purpose, channel, message angle, stop conditions, CRM note, and next action for each touch. Finish with the conditions required for a clean offer conversation.",
    rubric: [
      ["Cadence", "Touches are intentional, spaced, and tied to a relevant reason."],
      ["Compliance", "The plan honors preferences, opt-outs, and approved channels."],
      ["Closing readiness", "Separates confirmed facts from items that still require validation."],
    ],
  },
  6: {
    title: "Mission Control and Growth Capstone",
    instructions: "Build a one-day operating plan with priorities, checkpoints, metrics, pipeline hygiene, team communication, and end-of-day review. Add a short reflection on one skill to improve, how you will measure it, and how you will use coaching.",
    rubric: [
      ["Operating discipline", "The day protects follow-ups, documentation, communication, breaks, and review."],
      ["Measurement", "Chooses metrics that reveal a specific process gap without inventing targets."],
      ["Growth", "Names a concrete practice and feedback loop tied to the current role."],
    ],
  },
};

const ROLE_PLAYS = {
  7: [
    {
      key: "guarded-inbound",
      title: "Guarded inbound seller",
      context: "A warm inbound homeowner is willing to talk but gives short answers and wants to know why BMH Group needs personal details.",
      learner_goal: "Earn permission, complete the opening frame, and gather core facts without rushing into a pitch.",
      success_criteria: ["States purpose clearly", "Acknowledges the privacy concern", "Asks one question at a time", "Secures a specific next step"],
      fail_conditions: ["Pressures the seller", "Invents a reason for collecting information", "Skips consent or the fact find"],
    },
  ],
  8: [
    {
      key: "tired-landlord",
      title: "Tired landlord discovery and handoff",
      context: "A landlord is exhausted by repairs and tenant problems but has not decided when to sell.",
      learner_goal: "Discover the real impact, clarify timing and decision-makers, then frame a clean handoff.",
      success_criteria: ["Separates facts from motivation", "Explores consequences", "Confirms timing and authority", "Summarizes an accurate handoff"],
      fail_conditions: ["Assumes urgency", "Promises a price", "Transfers the seller with missing context"],
    },
  ],
  11: [
    {
      key: "scam-suspicious-preforeclosure",
      title: "Scam-suspicious pre-foreclosure seller",
      context: "During an initial seller conversation, a homeowner facing a possible foreclosure believes the contact may be a scam and refuses to share information.",
      learner_goal: "Lower pressure, explain the process, offer verifiable next steps, and respect the seller's boundaries.",
      success_criteria: ["Acknowledges the concern", "Uses accurate verification options", "Avoids legal advice", "Accepts a pause or no"],
      fail_conditions: ["Uses fear or false urgency", "Claims legal expertise", "Asks for sensitive financial credentials"],
    },
  ],
  13: [
    {
      key: "probate-follow-up",
      title: "Probate follow-up",
      context: "A seller handling a relative's estate asked for time and has not responded to two prior contacts.",
      learner_goal: "Use a respectful follow-up reason, acknowledge grief and process complexity, and create a low-pressure next step.",
      success_criteria: ["References prior context", "Uses patient language", "Checks authority without advising", "Records a clear next action"],
      fail_conditions: ["Treats silence as consent", "Rushes the estate process", "Creates an artificial deadline"],
    },
  ],
  18: [
    {
      key: "family-dynamics-dayton",
      title: "Family dynamics seller",
      context: "An older Dayton homeowner wants to sell but an adult child strongly opposes the decision.",
      learner_goal: "Identify who can decide, hear both concerns, preserve the homeowner's agency, and seek guidance when needed.",
      success_criteria: ["Confirms decision authority", "Does not take sides", "Surfaces each person's concern", "Sets a safe next step"],
      fail_conditions: ["Manipulates family conflict", "Ignores the homeowner's stated wishes", "Provides legal advice"],
    },
    {
      key: "full-cycle-capstone",
      title: "Full-cycle seller conversation",
      context: "A seller moves from a first conversation through qualification, discovery, an objection, and readiness for handoff.",
      learner_goal: "Run the full conversation from opening through a documented handoff while maintaining clarity and consent.",
      success_criteria: ["Uses a clear opening", "Completes qualification and discovery", "Handles the objection with LAAR", "Produces a complete handoff"],
      fail_conditions: ["Skips required facts", "Applies pressure", "Promises price or timing", "Ends without a documented next action"],
    },
  ],
};

const QUIZ_FILES = Object.fromEntries(
  Array.from({ length: 19 }, (_, index) => {
    const slot = String(index + 1).padStart(2, "0");
    return [index + 1, slot];
  }),
);

const QUIZ_FILE_NAMES = [
  "01 - Welcome & Mindset - quiz.json",
  "02 - Real Estate Terms Glossary - quiz.json",
  "03 - Tech Stack & Systems - quiz.json",
  "04 - Humanizing the Lead - quiz.json",
  "05 - The BMH Offer Playbook - quiz.json",
  "06 - Sales Pipeline & Stage Ownership - quiz.json",
  "07 - Opening the Call - quiz.json",
  "08 - Discovery & Handoff - quiz.json",
  "09 - Objection Architecture - quiz.json",
  "10 - Objection Scripts Playbook - quiz.json",
  "11 - Complex Objections - quiz.json",
  "12 - Seller FAQ Decoder - quiz.json",
  "13 - Follow-Up Cadence - quiz.json",
  "14 - Conversation Flow Mastery - quiz.json",
  "15 - Closing & Deal Engineering - quiz.json",
  "16 - KPIs & Sales Telemetry - quiz.json",
  "17 - Compensation Engine - quiz.json",
  "18 - Daily Mission Control - quiz.json",
  "19 - Career Growth Path - quiz.json",
];

const EXCLUDED_QUESTION_PATTERNS = {
  10: [/bringing the loan current helps rebuild/i],
  11: [/^What is a leaseback arrangement\?$/i],
  16: [/target percentage/i, /drops below what percentage/i, /daily target range/i],
  18: [/how many dials should you aim/i, /110 to 150 dials/i, /150 to 200 total dials/i],
  19: [/commission/i, /compensation/i, /earning potential/i],
};

function manualQuestion(questionText, options, correct, explanation, type = "single_choice") {
  return { questionType: type === "multi_select" ? "MA" : "SA", questionText, explanation, choices: options.map((option, index) => `${correct.includes(index) ? "*" : ""}${option}`) };
}

const COMPENSATION_QUESTIONS = [
  manualQuestion("What is the source of truth for your current compensation plan?", ["Your current written agreement", "This training lesson", "A coworker's plan", "An old example"], [0], "Your current offer letter, compensation plan, or role-specific sheet controls."),
  manualQuestion("Why does the lesson avoid one universal compensation formula?", ["Different roles own different outcomes", "The company does not measure performance", "Every employee chooses a formula", "Managers cannot explain plans"], [0], "Compensation is designed around the value and outcomes assigned to each role."),
  manualQuestion("Which documents may contain the current written plan?", ["Offer letter", "Current compensation plan", "Role-specific sheet", "A teammate's notes"], [0, 1, 2], "Use the current written documents issued for your role.", "multi_select"),
  manualQuestion("If your written plan and a training example appear different, which one applies?", ["The current written plan", "The training example", "Whichever pays more", "A coworker's memory"], [0], "Training explains the engine. The current written plan defines what applies to you."),
  manualQuestion("Where should you take a question about what applies to your role?", ["Your manager and current written plan", "A public forum", "A former employee", "Another department's plan"], [0], "Your manager and your current written plan are the two approved sources."),
  manualQuestion("Which outcomes might a role be responsible for creating?", ["Qualified conversations", "Clean handoffs", "Operational accuracy", "Team performance"], [0, 1, 2, 3], "Role scorecards can focus on different outcomes across the business.", "multi_select"),
  manualQuestion("What should you understand instead of memorizing example numbers?", ["What your role owns and how success is measured", "What another role earns", "A formula from an old video", "An informal promise"], [0], "The durable lesson is to understand the role, its scorecard, and the current written plan."),
  manualQuestion("A role scorecard can change as the business changes.", ["True", "False"], [0], "The company may update which outcomes matter and how performance is measured.", "true_false"),
  manualQuestion("Which behaviors make role performance visible?", ["Clean notes", "Following the process", "Consistent work", "Hiding incomplete tasks"], [0, 1, 2], "Clear records and consistent process make the work observable.", "multi_select"),
  manualQuestion("What three things does the compensation engine ask you to know?", ["What your role owns", "How success is measured now", "How to work consistently and visibly", "What every other role owns"], [0, 1, 2], "The engine connects role ownership, current measurement, and consistent visible execution.", "multi_select"),
  manualQuestion("Why should you not rely on someone else's plan?", ["It may apply to a different role or period", "All written plans are optional", "Coworkers cannot discuss work", "Training replaces all plans"], [0], "Another person's terms may be different and are not your agreement."),
  manualQuestion("What should you do after moving into a different role?", ["Confirm the current written plan and scorecard", "Keep using the former role's plan", "Use a teammate's plan", "Assume nothing changed"], [0], "A role change can change both owned outcomes and the applicable written plan."),
  manualQuestion("The training lesson overrides your current written agreement.", ["True", "False"], [1], "The lesson explicitly says the current written agreement is the source of truth.", "true_false"),
  manualQuestion("How should compensation be viewed according to the lesson?", ["As a role-specific scoreboard", "As an unwritten mystery", "As the same formula for everyone", "As a promise made by training"], [0], "Your role identifies the game and your written plan explains how it is scored."),
  manualQuestion("Which action is appropriate when part of the plan is unclear?", ["Ask your manager for clarification", "Guess from past examples", "Copy another person's plan", "Wait until a dispute occurs"], [0], "Clarify uncertainty before relying on an assumption."),
  manualQuestion("Some plans may be more fixed while others may be more performance-based.", ["True", "False"], [0], "The structure depends on the responsibilities of the role.", "true_false"),
  manualQuestion("Which item is not a reliable compensation source?", ["An informal hallway conversation", "Your current offer letter", "Your current written plan", "Your current role sheet"], [0], "Informal conversations do not replace the written terms for your role."),
  manualQuestion("What is your responsibility within the compensation engine?", ["Understand your role, follow the current scorecard, and make work visible", "Set your own terms", "Memorize another role's examples", "Treat training as a written agreement"], [0], "Professional execution starts with the current role, scorecard, and written plan."),
];

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function buildVideoAsset([sourceKey, slot, title, partLabel, localPath]) {
  const fullPath = path.join(ASSET_ROOT, localPath);
  const held = HELD_METADATA[sourceKey];
  const fileStat = await stat(fullPath);
  const duration = held?.[0] ?? Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", fullPath], { encoding: "utf8" }).trim());
  const checksum = held?.[2] ?? await sha256(fullPath);
  if (held && (fileStat.size !== held[1] || checksum !== held[2])) throw new Error(`${sourceKey} does not match locked hold metadata`);
  return {
    source_key: sourceKey,
    kind: "video",
    local_path: localPath,
    storage_path: `courses/bmh-employee-training/v1/videos/${sourceKey}.${checksum}.mp4`,
    mime_type: "video/mp4",
    checksum_sha256: checksum,
    size_bytes: fileStat.size,
    approval_status: held ? "hold" : "approved",
    _slot: slot,
    _title: title,
    _partLabel: partLabel,
    _duration: Number(duration.toFixed(3)),
  };
}

function spreadSelect(candidates, count) {
  const selected = [];
  const used = new Set();
  for (let index = 0; index < count; index += 1) {
    let candidateIndex = Math.round(index * (candidates.length - 1) / (count - 1));
    while (used.has(candidateIndex) && candidateIndex < candidates.length - 1) candidateIndex += 1;
    while (used.has(candidateIndex) && candidateIndex > 0) candidateIndex -= 1;
    used.add(candidateIndex);
    selected.push(candidates[candidateIndex]);
  }
  return selected;
}

async function sourceQuestions(slot) {
  if (slot === 17) return COMPENSATION_QUESTIONS;
  const fileName = QUIZ_FILE_NAMES[slot - 1];
  const raw = JSON.parse(await readFile(path.join(SOURCE_ROOT, "_quiz-exports-by-slot", fileName), "utf8"));
  const excluded = EXCLUDED_QUESTION_PATTERNS[slot] ?? [];
  const candidates = raw.questions.filter((question) => {
    const searchable = `${question.questionText} ${question.choices.join(" ")}`;
    return !excluded.some((pattern) => pattern.test(searchable));
  });
  if (candidates.length < 18) throw new Error(`Slot ${slot} has fewer than 18 eligible questions`);
  return spreadSelect(candidates, 18);
}

function shapeQuestion(slot, question, index) {
  const correctCount = question.choices.filter((choice) => choice.startsWith("*")).length;
  const strippedChoices = question.choices.map((choice) => choice.replace(/^\*/, ""));
  const truthValues = new Set(strippedChoices.map((choice) => choice.toLowerCase()));
  const questionType = question.questionType === "MA"
    ? "multi_select"
    : truthValues.size === 2 && truthValues.has("true") && truthValues.has("false")
      ? "true_false"
      : "single_choice";
  if (questionType === "multi_select" ? correctCount < 2 : correctCount !== 1) {
    throw new Error(`Slot ${slot} question ${index + 1} has invalid answer count`);
  }
  return {
    source_key: `question-slot-${String(slot).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    question_text: question.questionText.trim(),
    question_type: questionType,
    explanation: question.explanation?.trim() || "Review the lesson and compare each choice with the process described there.",
    points: 1,
    sort_order: index + 1,
    options: question.choices.map((choice, optionIndex) => ({
      source_key: `option-slot-${String(slot).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}-${optionIndex + 1}`,
      option_text: choice.replace(/^\*/, "").trim(),
      is_correct: choice.startsWith("*"),
      sort_order: optionIndex + 1,
    })),
  };
}

function textHtml(lesson) {
  return `<h2>What you will learn</h2><p>${lesson.summary}</p><ul>${lesson.objectives.map((objective) => `<li>${objective}</li>`).join("")}</ul>`;
}

function guideHtml(lesson) {
  return `<h2>Learner guide</h2><ul>${lesson.guide.map((point) => `<li>${point}</li>`).join("")}</ul><p>Use the current written SOP and ask your manager when a live process differs from this lesson.</p>`;
}

async function buildManifest() {
  const videoAssetsWithMetadata = [];
  for (const video of VIDEO_SOURCES) videoAssetsWithMetadata.push(await buildVideoAsset(video));

  const videosBySlot = Map.groupBy(videoAssetsWithMetadata, (asset) => asset._slot);
  const quizQuestionsBySlot = new Map();
  for (const lesson of LESSONS) {
    quizQuestionsBySlot.set(lesson.slot, (await sourceQuestions(lesson.slot)).map((question, index) => shapeQuestion(lesson.slot, question, index)));
  }

  const videoAssets = videoAssetsWithMetadata.map(({ _slot, _title, _partLabel, _duration, ...asset }) => asset);
  const derivativeAssets = videoAssetsWithMetadata.flatMap((asset) => [
    {
      source_key: `caption-${asset.source_key}`,
      kind: "caption",
      local_path: `course-assets/captions/${asset.source_key}.vtt`,
      storage_path: `courses/bmh-employee-training/v1/captions/${asset.source_key}.vtt`,
      mime_type: "text/vtt",
      checksum_sha256: null,
      size_bytes: null,
      approval_status: "missing",
    },
    {
      source_key: `transcript-${asset.source_key}`,
      kind: "transcript",
      local_path: `course-assets/transcripts/${asset.source_key}.md`,
      storage_path: `courses/bmh-employee-training/v1/transcripts/${asset.source_key}.md`,
      mime_type: "text/markdown",
      checksum_sha256: null,
      size_bytes: null,
      approval_status: "missing",
    },
  ]);
  const imageAssets = [
    {
      source_key: "thumbnail-program-bmh-employee-training",
      kind: "image",
      local_path: "course-assets/thumbnails/program-bmh-employee-training.webp",
      storage_path: "courses/bmh-employee-training/v1/thumbnails/program-bmh-employee-training.webp",
      mime_type: "image/webp",
      checksum_sha256: null,
      size_bytes: null,
      approval_status: "missing",
    },
    ...LESSONS.map((lesson) => ({
      source_key: `thumbnail-slot-${String(lesson.slot).padStart(2, "0")}`,
      kind: "image",
      local_path: `course-assets/thumbnails/slot-${String(lesson.slot).padStart(2, "0")}.webp`,
      storage_path: `courses/bmh-employee-training/v1/thumbnails/slot-${String(lesson.slot).padStart(2, "0")}.webp`,
      mime_type: "image/webp",
      checksum_sha256: null,
      size_bytes: null,
      approval_status: "missing",
    })),
  ];

  const modules = MODULES.map(([moduleNumber, title, description]) => {
    const topicLessons = LESSONS.filter((lesson) => lesson.module === moduleNumber);
    const lessons = [];
    for (const topic of topicLessons) {
      const slotKey = String(topic.slot).padStart(2, "0");
      const questions = quizQuestionsBySlot.get(topic.slot);
      const videoBlocks = videosBySlot.get(topic.slot).map((asset, index) => ({
        source_key: `block-video-${asset.source_key}`,
        type: "video",
        sort_order: index + 2,
        required: true,
        content: {
          asset_key: asset.source_key,
          poster_asset_key: `thumbnail-slot-${slotKey}`,
          caption_asset_key: `caption-${asset.source_key}`,
          transcript_asset_key: `transcript-${asset.source_key}`,
          title: asset._title,
          part_label: asset._partLabel,
          duration_seconds: asset._duration,
        },
      }));
      const flashcards = questions.slice(0, 8).map((question) => ({
        front: question.question_text,
        back: question.options.filter((option) => option.is_correct).map((option) => option.option_text).join("; "),
      }));
      const rolePlayBlocks = (ROLE_PLAYS[topic.slot] ?? []).map((scenario, index) => ({
        source_key: `block-role-play-${scenario.key}`,
        type: "role_play",
        sort_order: videoBlocks.length + 5 + index,
        required: true,
        content: {
          scenario_id: `pending:${scenario.key}`,
          title: scenario.title,
          height_px: 760,
          scenario_spec: {
            context: scenario.context,
            learner_goal: scenario.learner_goal,
            success_criteria: scenario.success_criteria,
            fail_conditions: scenario.fail_conditions,
          },
        },
      }));
      const blocks = [
        { source_key: `block-objectives-slot-${slotKey}`, type: "text", sort_order: 1, required: false, content: { html: textHtml(topic) } },
        ...videoBlocks,
        { source_key: `block-guide-slot-${slotKey}`, type: "text", sort_order: videoBlocks.length + 2, required: false, content: { html: guideHtml(topic) } },
        { source_key: `block-flashcards-slot-${slotKey}`, type: "flashcard", sort_order: videoBlocks.length + 3, required: false, content: { cards: flashcards } },
        ...rolePlayBlocks,
      ];
      lessons.push({
        source_key: `lesson-content-slot-${slotKey}`,
        title: topic.title,
        description: topic.summary,
        type: "content",
        sort_order: lessons.length + 1,
        required: true,
        thumbnail_asset_key: `thumbnail-slot-${slotKey}`,
        blocks,
      });
      lessons.push({
        source_key: `lesson-quiz-slot-${slotKey}`,
        title: `${topic.title} Checkpoint`,
        description: "Pass this checkpoint before continuing.",
        type: "quiz",
        sort_order: lessons.length + 1,
        required: true,
        thumbnail_asset_key: null,
        quiz: {
          source_key: `quiz-slot-${slotKey}`,
          title: `${topic.title} Checkpoint`,
          description: "Each attempt draws 10 questions from the approved lesson pool.",
          passing_score: 80,
          randomize_questions: true,
          randomize_answers: true,
          questions_per_attempt: 10,
          max_attempts: null,
          retake_cooldown_hours: 0,
          show_correct_answers_after: "after_pass",
          questions,
        },
      });
    }
    const assignment = ASSIGNMENTS[moduleNumber];
    lessons.push({
      source_key: `lesson-assignment-section-${moduleNumber}`,
      title: assignment.title,
      description: `Section ${moduleNumber} application assignment`,
      type: "assignment",
      sort_order: lessons.length + 1,
      required: true,
      thumbnail_asset_key: null,
      assignment: {
        source_key: `assignment-section-${moduleNumber}`,
        title: assignment.title,
        instructions: assignment.instructions,
        submission_type: "text",
        requires_review: true,
        rubric: assignment.rubric.map(([criterion, rubricDescription]) => ({ criterion, description: rubricDescription })),
      },
    });
    return {
      source_key: `module-section-${moduleNumber}`,
      title,
      description,
      sort_order: moduleNumber,
      lessons,
    };
  });

  return {
    schema_version: 1,
    import_id: "bmh-employee-training-v1",
    status: "draft",
    qa_role_group: {
      source_key: "role-group-bmh-content-qa",
      name: "BMH Content QA",
      description: "Private reviewers for the unpublished BMH employee training program.",
    },
    assets: [...videoAssets, ...derivativeAssets, ...imageAssets],
    program: {
      source_key: "program-bmh-employee-training",
      title: "BMH Employee Training",
      description: "Internal training for serving sellers, operating the pipeline, and growing at BMH Group.",
      thumbnail_asset_key: "thumbnail-program-bmh-employee-training",
      is_published: false,
      course_order_mode: "sequential",
      certificate_enabled: true,
      courses: [
        {
          source_key: "course-bmh-employee-training",
          title: "BMH Employee Training",
          description: "Six sequential sections covering the BMH way, seller conversations, operating systems, and performance.",
          thumbnail_asset_key: "thumbnail-program-bmh-employee-training",
          is_published: false,
          certificate_enabled: false,
          modules,
        },
      ],
    },
  };
}

const manifest = await buildManifest();
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2).replaceAll("\u2014", "-")}\n`);
console.log(`Wrote ${OUTPUT_PATH}`);
