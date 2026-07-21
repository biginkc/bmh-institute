import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_PATHS as ARTWORK_WORKFLOW_PATHS,
  reconcileManifestFromLedger,
  validateLedger as validateArtworkWorkflowLedger,
} from "./artwork-production-workflow.mjs";
import {
  REPLACEMENT_REQUIRED_CUTS,
  REVIEWED_VIDEO_SOURCE_KEYS,
  approvalRecordKey,
  validateHeldVideoApprovalHistory,
  validateHeldVideoManifestApprovalState,
} from "./held-video-approval-ledger.mjs";
import {
  findCaptionApprovalRecord,
  validateCaptionApprovalEvidence,
  validateCaptionApprovalHistory,
} from "./caption-approval-ledger.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_VIDEO_SOURCE_ROOT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
const DEFAULT_QUIZ_SOURCE_ROOT = "/Users/jarradhenry/BMH-OS/BMH Training Course/Thinkific";
const OUTPUT_PATH = path.join(REPO_ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const ARTWORK_LEDGER_PATH = path.join(
  REPO_ROOT,
  "docs/course-production/thumbnail-pilots/production-ledger.json",
);
const VIDEO_APPROVAL_LEDGER_PATH = path.join(
  REPO_ROOT,
  "docs/course-production/held-video-review/approvals.json",
);
const CAPTION_APPROVAL_LEDGER_PATH = path.join(
  REPO_ROOT,
  "docs/course-production/caption-approvals.json",
);
const GUIDE_APPROVAL_LEDGER_PATH = path.join(
  REPO_ROOT,
  "docs/course-production/guide-approvals.json",
);
const QUIZ_APPROVAL_LEDGER_PATH = path.join(
  REPO_ROOT,
  "docs/course-production/quiz-approvals.json",
);
const ARTWORK_LEDGER_SCHEMA = "bmh-artwork-production-ledger/v1";
export const GUIDE_APPROVAL_LEDGER_SCHEMA = "bmh-guide-approval-ledger/v1";
export const QUIZ_APPROVAL_LEDGER_SCHEMA = "bmh-quiz-content-approval-ledger/v1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const VIDEO_SOURCES = [
  ["video-slot-01-welcome", 1, "Welcome and the Service Playbook", "Part A", "course-assets/review-lessonA/LESSON-1A-v7.mp4"],
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
    objectives: ["Explain the BMH service standard", "Put service before pressure", "Use curiosity and clarity in seller conversations", "Detach from outcomes while staying accountable"],
    guide: ["The goal is an aligned decision, not a forced yes", "Listen for the seller's real problem before discussing a solution", "Treat repetition as practice that creates calm", "A respectful no is better than a pressured agreement"],
  },
  {
    slot: 2,
    module: 1,
    title: "Real Estate Terms Glossary",
    summary: "Build the vocabulary needed to follow property, title, financing, and transaction conversations without guessing.",
    objectives: ["Define distressed, off-market, on-market, MLS, and listing terms", "Distinguish wholesaling, assignment, and double-close concepts", "Recognize subject-to and seller-financing structures", "Ask for clarification when a term affects a seller"],
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
    guide: ["Metrics show where to investigate. They do not explain everything by themselves", "Use the current role-and-market scorecard. Training does not set one universal numeric target", "Check conversion between adjacent stages", "Pair numbers with notes and call review before deciding on a fix"],
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
    summary: "Build capability in your current role through deliberate practice, useful feedback, coachability, and reliable execution.",
    objectives: ["Use a practice and feedback loop", "Respond to coaching without defensiveness", "Connect capability to current role expectations", "Confirm any increase in ownership with your manager and current written role plan"],
    guide: ["Practice, apply feedback, and review the result", "Capability means using knowledge and skills reliably in current work", "Your manager and current written role plan define your responsibilities and expectations", "Take on increased ownership only after the change is documented in your current written role plan"],
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
    instructions: "Use both Section 3 practice situations. For the guarded inbound seller, draft a permission-based opening and the first five fact-find questions. For the tired-landlord lead, draft five discovery questions and a handoff summary. Include the pipeline stage, known facts, missing facts, motivation, timeline, decision-makers, and next action.",
    rubric: [
      ["Conversation flow", "Moves naturally from permission and facts into discovery."],
      ["Discovery", "Questions surface consequences, timing, priorities, and decision process."],
      ["Handoff quality", "The summary is accurate, concise, complete, and actionable."],
    ],
  },
  4: {
    title: "Objection Response Plan",
    instructions: "Choose three objections from the lesson, including the scam-suspicious pre-foreclosure practice situation. For each one, write a Listen, Acknowledge, Ask, Redirect response and identify when you would stop, escalate, or seek specialist guidance.",
    rubric: [
      ["Framework", "Each response includes all four steps in the correct order."],
      ["Fit", "Questions and redirects match the concern instead of using a generic rebuttal."],
      ["Boundaries", "Correctly identifies legal, financial, family, or authority issues that require escalation."],
    ],
  },
  5: {
    title: "Follow-Up and Closing Plan",
    instructions: "Create a 30-day follow-up plan for the probate practice situation. Include purpose, channel, message angle, stop conditions, CRM note, and next action for each touch. Finish with the conditions required for a clean offer conversation without rushing the estate process.",
    rubric: [
      ["Cadence", "Touches are intentional, spaced, and tied to a relevant reason."],
      ["Compliance", "The plan honors preferences, opt-outs, and approved channels."],
      ["Closing readiness", "Separates confirmed facts from items that still require validation."],
    ],
  },
  6: {
    title: "Mission Control and Growth Capstone",
    instructions: "Build a one-day operating plan with priorities, checkpoints, metrics, pipeline hygiene, team communication, and end-of-day review. Add a short reflection on one skill to improve, how you will measure it, and how you will use coaching. Finish with two practice debriefs: how you preserved authority and neutrality in the family-dynamics situation, and what you would carry forward from the full-cycle seller conversation.",
    rubric: [
      ["Operating discipline", "The day protects follow-ups, documentation, communication, breaks, and review."],
      ["Measurement", "Chooses metrics that reveal a specific process gap without inventing targets."],
      ["Growth", "Names a concrete practice and feedback loop tied to the current role."],
      ["Applied practice", "Uses specific evidence from both required Section 6 role plays to identify a safe behavior to repeat or improve."],
    ],
  },
};

const ROLE_PLAYS = {
  7: [
    {
      key: "guarded-inbound",
      assignment_source_key: "assignment-section-3",
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
      assignment_source_key: "assignment-section-3",
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
      assignment_source_key: "assignment-section-4",
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
      assignment_source_key: "assignment-section-5",
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
      assignment_source_key: "assignment-section-6",
      title: "Family dynamics seller",
      context: "An older Dayton homeowner wants to sell but an adult child strongly opposes the decision.",
      learner_goal: "Identify who can decide, hear both concerns, preserve the homeowner's agency, and seek guidance when needed.",
      success_criteria: ["Confirms decision authority", "Does not take sides", "Surfaces each person's concern", "Sets a safe next step"],
      fail_conditions: ["Manipulates family conflict", "Ignores the homeowner's stated wishes", "Provides legal advice"],
    },
    {
      key: "full-cycle-capstone",
      assignment_source_key: "assignment-section-6",
      title: "Full-cycle seller conversation",
      context: "A seller moves from a first conversation through qualification, discovery, an objection, and readiness for handoff.",
      learner_goal: "Run the full conversation from opening through a documented handoff while maintaining clarity and consent.",
      success_criteria: ["Uses a clear opening", "Completes qualification and discovery", "Handles the objection with LAAR", "Produces a complete handoff"],
      fail_conditions: ["Skips required facts", "Applies pressure", "Promises price or timing", "Ends without a documented next action"],
    },
  ],
};

export const QUIZ_SOURCE_FILE_NAMES = [
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

const KPI_POLICY_SAFE_REPLACEMENTS = new Map([
  [
    "If a caller dials 200 times, approximately how many connections should they ideally achieve?",
    manualQuestion(
      "What should happen when connection rate falls below the normal range for the current role and market?",
      [
        "Flag it to the manager and check number reputation, list quality, and call timing",
        "Treat the change as proof that the representative is not working",
        "Speed-dial until the connection rate returns to normal",
        "Ignore it because connection rate cannot reveal an operating issue",
      ],
      [0],
      "The current KPI lesson treats a connection-rate change as a diagnostic signal: check number reputation, list quality, and call timing with the manager.",
    ),
  ],
  [
    "What is the benchmark ratio for converting offers into signed contracts?",
    manualQuestion(
      "Why are the six KPI metrics read from left to right?",
      [
        "To pinpoint the stage where the process is breaking and choose the right response",
        "To assign one universal activity target to every role and market",
        "To rank representatives without reviewing the underlying work",
        "To replace coaching and call review with a single number",
      ],
      [0],
      "Reading the funnel from left to right helps the team locate the actual gap and respond with the relevant operational check or coaching.",
    ),
  ],
]);

const CAREER_GROWTH_QUESTIONS = [
  manualQuestion("What is the practical focus of career growth in this lesson?", ["Strengthening capability in your current role", "Choosing a new title for yourself", "Taking over a coworker's duties", "Waiting for expectations to change"], [0], "Career growth starts by building capability in the work assigned to your current role."),
  manualQuestion("Which actions belong in a deliberate development loop?", ["Practice a relevant skill", "Ask for specific feedback", "Apply the feedback", "Review the result", "Change your expectations without approval", "Copy another person's role plan"], [0, 1, 2, 3], "A useful practice loop combines practice, feedback, application, and review.", "multi_select"),
  manualQuestion("Feedback is useful only when it confirms that your current approach is already correct.", ["True", "False"], [1], "Feedback is useful because it can reveal a skill or process gap to practice."),
  manualQuestion("What should you do when feedback is unclear?", ["Ask a clarifying question before applying it", "Guess what the manager meant", "Ignore it until it is repeated", "Use a coworker's expectations instead"], [0], "Coachability includes clarifying feedback so you can apply it accurately."),
  manualQuestion("Which behaviors demonstrate coachability?", ["Listen without becoming defensive", "Confirm the action to practice", "Apply the feedback in the work", "Return with evidence of the change", "Explain why the old approach should never change", "Wait for someone else to fix the gap"], [0, 1, 2, 3], "Coachability is visible when feedback is heard, clarified, practiced, and reflected in changed work.", "multi_select"),
  manualQuestion("What is the source of truth for your current responsibilities?", ["Your current written role plan and manager", "An older training example", "A coworker's task list", "An informal assumption"], [0], "Your manager and current written role plan define current role expectations."),
  manualQuestion("A new responsibility is mentioned informally. What should happen before you treat it as assigned ownership?", ["Confirm it with your manager and have it documented in the current written role plan", "Add it to your role without discussion", "Trade duties with a coworker", "Wait for a training example"], [0], "Increased ownership applies only when your manager confirms it and the current written role plan documents it."),
  manualQuestion("Completing this training automatically changes your assigned responsibilities.", ["True", "False"], [1], "Training builds capability; only manager-confirmed, documented role expectations change assigned ownership."),
  manualQuestion("A coworker's duties differ from yours. Which expectations should guide your work?", ["Your current written role plan, clarified with your manager", "The coworker's duties", "Whichever tasks seem more advanced", "A previous employee's routine"], [0], "Current role expectations come from your own written role plan and manager, not another person's duties."),
  manualQuestion("What does capability mean in this lesson?", ["Using knowledge and skills reliably in current work", "Knowing the names of future job titles", "Taking on unassigned work", "Avoiding feedback once trained"], [0], "Capability is the reliable application of relevant knowledge and skills in your current role."),
  manualQuestion("Which actions make growing capability visible?", ["Practice relevant skills", "Perform current responsibilities consistently", "Keep the work record clean", "Apply specific feedback", "Claim unassigned ownership", "Rely on memory instead of the role plan"], [0, 1, 2, 3], "Practice, consistent execution, clean records, and applied feedback make capability visible.", "multi_select"),
  manualQuestion("When should you take on increased ownership?", ["After your manager confirms it and the current written role plan documents it", "As soon as you feel ready", "When a coworker suggests it", "After finishing any course"], [0], "Increased ownership must be manager-confirmed and documented in the current written role plan."),
  manualQuestion("Every employee follows the same fixed development timeline.", ["True", "False"], [1], "The lesson gives no fixed timeline; use current role expectations and manager feedback to guide development."),
  manualQuestion("Which topics belong in a development discussion with your manager?", ["Current role expectations", "A capability to practice", "Recent feedback to apply", "Any proposed ownership that needs documentation", "Another person's role terms", "An assumed change in duties"], [0, 1, 2, 3], "A grounded development discussion connects current expectations, practice, feedback, and documented ownership.", "multi_select"),
  manualQuestion("An old training example conflicts with your current role plan. What should guide you?", ["The current written role plan and manager direction", "The older example", "A teammate's memory", "The option with more responsibility"], [0], "The current written role plan and manager direction are the source of truth for current expectations."),
  manualQuestion("Why can deliberate practice still be useful when it feels repetitive?", ["Repetition helps turn a skill into reliable capability", "Repetition changes assigned ownership", "Repetition replaces manager feedback", "Repetition makes documentation unnecessary"], [0], "Deliberate repetition helps a relevant skill become reliable capability in current work."),
  manualQuestion("Which response is least coachable after a gap is identified?", ["Defend the old approach and ignore the gap", "Clarify the expected change", "Practice the corrected approach", "Follow up with evidence of improvement"], [0], "Coachability requires engaging with feedback and practicing the correction rather than dismissing the gap."),
  manualQuestion("Professional development in this lesson means applying practice and feedback to become more capable in your current role.", ["True", "False"], [0], "The lesson defines development as practice, applied feedback, and reliable capability within current role expectations."),
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

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function artworkLedgerRecords(ledger) {
  if (!isRecord(ledger) || ledger.schema_version !== ARTWORK_LEDGER_SCHEMA) {
    throw new Error(`Artwork ledger schema_version must be ${ARTWORK_LEDGER_SCHEMA}`);
  }
  if (Array.isArray(ledger.assets)) return ledger.assets;
  if (isRecord(ledger.assets)) {
    return Object.entries(ledger.assets).map(([manifestPath, value]) => {
      if (!isRecord(value)) return value;
      if (value.manifest_path !== undefined && value.manifest_path !== manifestPath) {
        throw new Error(`Artwork ledger key ${manifestPath} conflicts with manifest_path`);
      }
      return { ...value, manifest_path: manifestPath };
    });
  }
  throw new Error("Artwork ledger assets must be an array or manifest_path-keyed object");
}

export async function loadArtworkLedger(
  ledgerPath = ARTWORK_LEDGER_PATH,
) {
  let raw;
  try {
    raw = await readFile(ledgerPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Artwork ledger is not valid JSON: ${ledgerPath}`, { cause: error });
  }
  artworkLedgerRecords(parsed);
  return parsed;
}

function checksumAddressedStoragePath(storagePath, checksum) {
  const extension = path.posix.extname(storagePath);
  if (!extension) throw new Error(`Artwork storage path has no extension: ${storagePath}`);
  return `${storagePath.slice(0, -extension.length)}-${checksum}${extension}`;
}

function webpDimensions(contents, label) {
  if (
    contents.length < 30 ||
    contents.subarray(0, 4).toString("ascii") !== "RIFF" ||
    contents.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error(`Approved artwork is not a WebP file: ${label}`);
  }
  let offset = 12;
  while (offset + 8 <= contents.length) {
    const chunkType = contents.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = contents.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > contents.length) {
      throw new Error(`Approved artwork has a truncated WebP chunk: ${label}`);
    }
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return [
        contents.readUIntLE(dataOffset + 4, 3) + 1,
        contents.readUIntLE(dataOffset + 7, 3) + 1,
      ];
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && contents[dataOffset] === 0x2f) {
      const bits = contents.readUInt32LE(dataOffset + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      contents.subarray(dataOffset + 3, dataOffset + 6).toString("hex") === "9d012a"
    ) {
      return [
        contents.readUInt16LE(dataOffset + 6) & 0x3fff,
        contents.readUInt16LE(dataOffset + 8) & 0x3fff,
      ];
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  throw new Error(`Approved artwork WebP dimensions are unreadable: ${label}`);
}

function validateLedgerProvenance(provenance, manifestPath) {
  if (!isRecord(provenance)) {
    throw new Error(`Approved artwork ${manifestPath} requires workflow provenance`);
  }
  const requiredStrings = [
    "master_id",
    "source_master_id",
    "prompt_sha256",
    "terminal_source_sha256",
    "flat_master_sha256",
    "derivative_recipe_id",
    "derivative_recipe_sha256",
    "reviewed_by",
    "reviewed_at",
    "review_evidence",
    "review_evidence_sha256",
  ];
  for (const field of requiredStrings) {
    if (typeof provenance[field] !== "string" || provenance[field].trim().length === 0) {
      throw new Error(`Approved artwork ${manifestPath} provenance ${field} is required`);
    }
  }
  if (provenance.master_id !== provenance.source_master_id) {
    throw new Error(`Approved artwork ${manifestPath} provenance master mapping is inconsistent`);
  }
  for (const field of [
    "prompt_sha256",
    "terminal_source_sha256",
    "flat_master_sha256",
    "derivative_recipe_sha256",
    "review_evidence_sha256",
  ]) {
    if (!SHA256_PATTERN.test(provenance[field])) {
      throw new Error(`Approved artwork ${manifestPath} provenance ${field} is invalid`);
    }
  }
  if (
    !Array.isArray(provenance.reference_ids) ||
    provenance.reference_ids.length === 0 ||
    !provenance.reference_ids.every((value) => typeof value === "string" && value.length > 0)
  ) {
    throw new Error(`Approved artwork ${manifestPath} provenance reference_ids are required`);
  }
  if (
    !Array.isArray(provenance.reference_inputs) ||
    provenance.reference_inputs.length === 0 ||
    !provenance.reference_inputs.every((reference) =>
      isRecord(reference) &&
      typeof reference.id === "string" && reference.id.length > 0 &&
      typeof reference.role === "string" && reference.role.length > 0 &&
      typeof reference.path === "string" && reference.path.length > 0 &&
      SHA256_PATTERN.test(reference.sha256 ?? ""))
  ) {
    throw new Error(`Approved artwork ${manifestPath} provenance reference_inputs are invalid`);
  }
  if (
    JSON.stringify(provenance.reference_ids) !==
    JSON.stringify(provenance.reference_inputs.map((reference) => reference.id))
  ) {
    throw new Error(`Approved artwork ${manifestPath} provenance reference mapping is inconsistent`);
  }
  if (!Number.isSafeInteger(provenance.lineage_steps) || provenance.lineage_steps <= 0) {
    throw new Error(`Approved artwork ${manifestPath} provenance lineage_steps is invalid`);
  }
  if (
    !ISO_TIMESTAMP_PATTERN.test(provenance.reviewed_at) ||
    !Number.isFinite(Date.parse(provenance.reviewed_at))
  ) {
    throw new Error(`Approved artwork ${manifestPath} provenance reviewed_at is invalid`);
  }
  if (
    provenance.promoted_pilot_sha256 !== undefined &&
    !SHA256_PATTERN.test(provenance.promoted_pilot_sha256)
  ) {
    throw new Error(`Approved artwork ${manifestPath} promoted pilot checksum is invalid`);
  }
}

function expectedArtworkDimensions(asset) {
  if (asset.local_path.startsWith("course-assets/posters/")) return [1280, 720];
  if (asset.local_path.startsWith("course-assets/thumbnails/")) return [1280, 800];
  throw new Error(`Artwork asset is outside the production inventory paths: ${asset.local_path}`);
}

function validateFinalizedArtworkLedger(ledger, records, expectedAssetCount) {
  const approved = records.filter((record) => record?.approval_status === "approved");
  if (approved.length === 0) return;
  if (
    ledger.status !== "finalized" ||
    approved.length !== records.length ||
    records.length !== expectedAssetCount
  ) {
    throw new Error("Approved artwork requires one complete finalized ledger");
  }
  for (const [label, approval] of [
    ["pilot_approval", ledger.pilot_approval],
    ["final_approval", ledger.final_approval],
  ]) {
    if (
      !isRecord(approval) ||
      approval.status !== "approved" ||
      typeof approval.approved_by !== "string" ||
      approval.approved_by.trim().length === 0 ||
      !ISO_TIMESTAMP_PATTERN.test(approval.approved_at ?? "") ||
      !Number.isFinite(Date.parse(approval.approved_at ?? "")) ||
      typeof approval.evidence !== "string" ||
      approval.evidence.trim().length === 0 ||
      !SHA256_PATTERN.test(approval.evidence_sha256 ?? "")
    ) {
      throw new Error(`Approved artwork ledger ${label} is incomplete`);
    }
  }
}

async function approvedArtworkAsset(asset, record, repoRoot) {
  const manifestPath = record.manifest_path;
  if (record.output_path !== manifestPath || manifestPath !== asset.local_path) {
    throw new Error(`Approved artwork path mismatch for ${manifestPath}`);
  }
  if (
    record.asset_key !== asset.source_key ||
    record.source_key !== asset.source_key
  ) {
    throw new Error(`Approved artwork source key mismatch for ${manifestPath}`);
  }
  if (!SHA256_PATTERN.test(record.checksum_sha256 ?? "")) {
    throw new Error(`Approved artwork ${manifestPath} requires a lowercase SHA-256`);
  }
  if (!Number.isSafeInteger(record.size_bytes) || record.size_bytes <= 0) {
    throw new Error(`Approved artwork ${manifestPath} requires a positive size_bytes`);
  }
  if (
    !Array.isArray(record.dimensions) ||
    record.dimensions.length !== 2 ||
    !record.dimensions.every((value) => Number.isSafeInteger(value) && value > 0)
  ) {
    throw new Error(`Approved artwork ${manifestPath} requires positive integer dimensions`);
  }
  if (
    JSON.stringify(record.dimensions) !==
    JSON.stringify(expectedArtworkDimensions(asset))
  ) {
    throw new Error(`Approved artwork dimensions violate the production inventory for ${manifestPath}`);
  }
  validateLedgerProvenance(record.provenance, manifestPath);
  const expectedKind = asset.local_path.startsWith("course-assets/posters/")
    ? "video-poster"
    : asset.source_key === "thumbnail-program-bmh-employee-training"
      ? "course-cover"
      : "lesson-card";
  if (record.kind !== expectedKind) {
    throw new Error(`Approved artwork kind mismatch for ${manifestPath}`);
  }
  if (!SHA256_PATTERN.test(record.pixel_sha256 ?? "")) {
    throw new Error(`Approved artwork ${manifestPath} requires a decoded pixel SHA-256`);
  }
  if (
    !isRecord(record.derivative) ||
    !isRecord(record.derivative.recipe) ||
    record.derivative.source_master_id !== record.provenance.source_master_id ||
    record.derivative.recipe.source_master_id !== record.provenance.source_master_id ||
    record.derivative.recipe.id !== record.provenance.derivative_recipe_id ||
    record.derivative.recipe.kind !== record.kind ||
    !SHA256_PATTERN.test(record.derivative.recipe_sha256 ?? "") ||
    record.derivative.recipe_sha256 !== record.provenance.derivative_recipe_sha256 ||
    record.derivative.recipe_sha256 !== createHash("sha256")
      .update(JSON.stringify(record.derivative.recipe))
      .digest("hex")
  ) {
    throw new Error(`Approved artwork derivative provenance mismatch for ${manifestPath}`);
  }

  const absoluteRoot = await realpath(repoRoot);
  const candidate = path.resolve(absoluteRoot, manifestPath);
  if (candidate === absoluteRoot || !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Approved artwork path escapes the repository: ${manifestPath}`);
  }
  const fileInfo = await lstat(candidate);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error(`Approved artwork is not a regular file: ${manifestPath}`);
  }
  const resolvedCandidate = await realpath(candidate);
  if (!resolvedCandidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Approved artwork resolves outside the repository: ${manifestPath}`);
  }
  const contents = await readFile(resolvedCandidate);
  const actualChecksum = createHash("sha256").update(contents).digest("hex");
  if (actualChecksum !== record.checksum_sha256 || contents.length !== record.size_bytes) {
    throw new Error(`Approved artwork checksum or size mismatch for ${manifestPath}`);
  }
  const actualDimensions = webpDimensions(contents, manifestPath);
  if (JSON.stringify(actualDimensions) !== JSON.stringify(record.dimensions)) {
    throw new Error(`Approved artwork dimensions mismatch for ${manifestPath}`);
  }

  const storagePath = checksumAddressedStoragePath(
    asset.storage_path,
    record.checksum_sha256,
  );
  if (record.storage_path !== undefined && record.storage_path !== storagePath) {
    throw new Error(`Approved artwork storage path mismatch for ${manifestPath}`);
  }

  return {
    ...asset,
    storage_path: storagePath,
    checksum_sha256: record.checksum_sha256,
    size_bytes: record.size_bytes,
    approval_status: "approved",
  };
}

export async function applyArtworkLedger(
  artworkAssets,
  ledger,
  { repoRoot = REPO_ROOT } = {},
) {
  const records = artworkLedgerRecords(ledger);
  const expected = new Map(artworkAssets.map((asset) => [asset.local_path, asset]));
  if (expected.size !== artworkAssets.length) {
    throw new Error("Artwork manifest paths must be unique");
  }
  validateFinalizedArtworkLedger(ledger, records, artworkAssets.length);
  const recordsByPath = new Map();
  for (const record of records) {
    if (!isRecord(record) || typeof record.manifest_path !== "string") {
      throw new Error("Artwork ledger record requires manifest_path");
    }
    if (recordsByPath.has(record.manifest_path)) {
      throw new Error(`Duplicate artwork ledger manifest_path: ${record.manifest_path}`);
    }
    if (!expected.has(record.manifest_path)) {
      throw new Error(`Artwork ledger path is not present in the manifest: ${record.manifest_path}`);
    }
    if (!["missing", "approved"].includes(record.approval_status)) {
      throw new Error(`Artwork ledger ${record.manifest_path} has invalid approval_status`);
    }
    recordsByPath.set(record.manifest_path, record);
  }

  const merged = [];
  for (const asset of artworkAssets) {
    const record = recordsByPath.get(asset.local_path);
    merged.push(
      record?.approval_status === "approved"
        ? await approvedArtworkAsset(asset, record, repoRoot)
        : { ...asset },
    );
  }
  return merged;
}

export async function validateArtworkManifestTrustBoundary(
  manifest,
  ledger,
  {
    repoRoot = REPO_ROOT,
    inventoryPath = path.join(repoRoot, ARTWORK_WORKFLOW_PATHS.inventory),
  } = {},
) {
  // A missing optional ledger keeps the draft portable during pre-production.
  // Any real workflow ledger must pass the canonical inventory, evidence, file,
  // lineage, palette, uniqueness, and lifecycle checks before it can affect the
  // manifest's approval state.
  if (ledger === null) return manifest;

  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  const reconciled = ledger.status === "finalized"
    ? reconcileManifestFromLedger(ledger, manifest)
    : manifest;
  await validateArtworkWorkflowLedger({
    root: repoRoot,
    inventory,
    manifest: reconciled,
    ledger,
  });
  return reconciled;
}

export function currentReviewedVideoRecord(
  sourceKey,
  approvalLedger,
  { currentLocalPath } = {},
) {
  if (!REVIEWED_VIDEO_SOURCE_KEYS.has(sourceKey)) return null;
  const records = approvalLedger?.records?.filter(
    (record) => record.source_key === sourceKey,
  ) ?? [];
  if (records.length === 0) {
    throw new Error(`Approval ledger is missing reviewed video ${sourceKey}`);
  }
  const eligible = records.filter(
    (record) => !REPLACEMENT_REQUIRED_CUTS.has(approvalRecordKey(record)),
  );
  const approved = eligible.filter((record) => record.decision === "approved");
  if (approved.length > 1) {
    throw new Error(`Approval ledger has multiple approved corrected cuts for ${sourceKey}; explicit supersession is required`);
  }
  if (approved[0]) return approved[0];
  const configuredEligible = currentLocalPath
    ? eligible.findLast((record) => record.candidate_local_path === currentLocalPath)
    : null;
  if (configuredEligible) return configuredEligible;
  const configured = currentLocalPath
    ? records.find((record) => record.candidate_local_path === currentLocalPath)
    : null;
  // Pending review candidates stay outside the course manifest until Jarrad
  // approves their exact checksum. The configured source remains the held
  // source-evidence cut during review. Older records remain immutable history.
  return configured ?? eligible.at(-1) ?? records.at(-1);
}

function resolveSourcePath(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  if (candidate === absoluteRoot || !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its configured source root: ${relativePath}`);
  }
  return candidate;
}

function probeVideoDuration(fullPath) {
  return Number(execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", fullPath],
    { encoding: "utf8" },
  ).trim());
}

async function buildVideoAsset(
  [sourceKey, slot, title, partLabel, defaultLocalPath],
  approvalLedger,
  { videoSourceRoot, inspectDuration },
) {
  const reviewRecord = currentReviewedVideoRecord(sourceKey, approvalLedger, {
    currentLocalPath: defaultLocalPath,
  });
  const localPath = reviewRecord?.candidate_local_path ?? defaultLocalPath;
  const fullPath = resolveSourcePath(videoSourceRoot, localPath, `${sourceKey} video path`);
  const fileStat = await stat(fullPath);
  const duration = Number(await inspectDuration(fullPath));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${sourceKey} has an invalid video duration`);
  }
  const checksum = await sha256(fullPath);
  if (reviewRecord && checksum !== reviewRecord.sha256) {
    throw new Error(`${sourceKey} does not match its checksum-keyed approval ledger record`);
  }
  const approvalStatus = reviewRecord?.decision === "approved" ? "approved" : reviewRecord ? "hold" : "approved";
  return {
    source_key: sourceKey,
    kind: "video",
    local_path: localPath,
    storage_path: `courses/bmh-employee-training/v1/videos/${sourceKey}.${checksum}.mp4`,
    mime_type: "video/mp4",
    checksum_sha256: checksum,
    size_bytes: fileStat.size,
    approval_status: approvalStatus,
    _slot: slot,
    _title: title,
    _partLabel: partLabel,
    _duration: Number(duration.toFixed(3)),
  };
}

export async function buildDerivativePair(videoAsset, captionApprovalLedger, repoRoot = REPO_ROOT) {
  const descriptors = [
    { kind: "caption", extension: "vtt", directory: "captions", mimeType: "text/vtt" },
    { kind: "transcript", extension: "md", directory: "transcripts", mimeType: "text/markdown" },
  ];
  const files = await Promise.all(descriptors.map(async (descriptor) => {
    const localPath = `course-assets/${descriptor.directory}/${videoAsset.source_key}.${descriptor.extension}`;
    const fullPath = path.join(repoRoot, localPath);
    try {
      const fileStat = await stat(fullPath);
      return { ...descriptor, localPath, fileStat, checksum: await sha256(fullPath) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return { ...descriptor, localPath, fileStat: null, checksum: null };
    }
  }));
  const missingAsset = (file) => ({
    source_key: `${file.kind}-${videoAsset.source_key}`,
    kind: file.kind,
    local_path: file.localPath,
    storage_path: `courses/bmh-employee-training/v1/${file.directory}/${videoAsset.source_key}.${file.extension}`,
    mime_type: file.mimeType,
    checksum_sha256: null,
    size_bytes: null,
    approval_status: "missing",
  });
  if (videoAsset.approval_status === "hold") {
    if (files.some((file) => file.fileStat)) throw new Error(`${videoAsset.source_key} derivatives exist before the held cut is approved`);
    return files.filter((file) => file.kind === "caption").map(missingAsset);
  }
  if (files.some((file) => !file.fileStat)) {
    return files.filter((file) => file.kind === "caption").map(missingAsset);
  }
  const [caption, transcript] = files;
  const approval = findCaptionApprovalRecord(captionApprovalLedger, {
    video_source_key: videoAsset.source_key,
    video_sha256: videoAsset.checksum_sha256,
    caption_sha256: caption.checksum,
    transcript_sha256: transcript.checksum,
  });
  if (!approval) {
    return files.filter((file) => file.kind === "caption").map(missingAsset);
  }
  // The Markdown transcript is internal caption-review evidence only. It is
  // deliberately excluded from the learner-facing manifest and storage plan.
  return files.filter((file) => file.kind === "caption").map((file) => ({
    source_key: `${file.kind}-${videoAsset.source_key}`,
    kind: file.kind,
    local_path: file.localPath,
    storage_path: `courses/bmh-employee-training/v1/${file.directory}/${videoAsset.source_key}.${file.checksum}.${file.extension}`,
    mime_type: file.mimeType,
    checksum_sha256: file.checksum,
    size_bytes: file.fileStat.size,
    approval_status: "approved",
  }));
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

async function sourceQuestions(slot, quizSourceRoot) {
  if (slot === 17) return COMPENSATION_QUESTIONS;
  if (slot === 19) return CAREER_GROWTH_QUESTIONS;
  const fileName = QUIZ_SOURCE_FILE_NAMES[slot - 1];
  const raw = JSON.parse(await readFile(
    resolveSourcePath(
      quizSourceRoot,
      path.join("_quiz-exports-by-slot", fileName),
      `slot ${slot} quiz path`,
    ),
    "utf8",
  ));
  const excluded = EXCLUDED_QUESTION_PATTERNS[slot] ?? [];
  const candidates = raw.questions.filter((question) => {
    const searchable = `${question.questionText} ${question.choices.join(" ")}`;
    return !excluded.some((pattern) => pattern.test(searchable));
  });
  if (candidates.length < 18) throw new Error(`Slot ${slot} has fewer than 18 eligible questions`);
  const selected = spreadSelect(candidates, 18);
  if (slot !== 16) return selected;
  return selected.map((question) =>
    KPI_POLICY_SAFE_REPLACEMENTS.get(question.questionText) ?? question
  );
}

const ROLE_AGNOSTIC_COURSE_TEXT_REPLACEMENTS = [
  [/\bSellers are responsible for Stages 1 through 4\b/gi, "The representative is responsible for Stages 1 through 4"],
  [/\bStages 5 and 6 are managed by the acquisition and transaction teams, not the sellers\./gi, "Stages 5 and 6 are managed by the acquisition and transaction teams, not the seller-facing representatives."],
  [/\bWhat must the seller brief the acquisition manager on during Stage 4\?/gi, "What must the representative brief the acquisition manager on during Stage 4?"],
  [/\bThe seller must communicate the seller's situation, expectations, and emotional triggers \(hot buttons\)\./gi, "The representative briefs the acquisition manager on the seller's situation, expectations, and emotional triggers (hot buttons)."],
  [/\bNavigator roles\b/gi, "representative roles"],
  [/\bNavigator role\b/gi, "BMH service standard"],
  [/\bNavigators\b/gi, "representatives"],
  [/\bNavigator\b/gi, "representative"],
  [/\bvirtual onboarding specialists\b/gi, "onboarding support"],
  [/\bvirtual onboarding specialist\b/gi, "onboarding support"],
  [/\blead sourcing specialists\b/gi, "representatives"],
  [/\blead sourcing specialist\b/gi, "representative"],
  [/\blead sourcing seats\b/gi, "representative roles"],
  [/\blead sourcing seat\b/gi, "representative role"],
  [/\blead generators\b/gi, "representatives"],
  [/\blead generator\b/gi, "representative"],
  [/\bSDR teams\b/g, "seller-facing teams", false],
  [/\bSDR team\b/g, "seller-facing team", false],
  [/\ban SDR's\b/gi, "a representative's", false],
  [/\ban SDR\b/gi, "a representative", false],
  [/\bSDR's\b/g, "representative's", false],
  [/\bSDRs\b/g, "representatives", false],
  [/\bSDR\b/g, "representative", false],
];

export function normalizeRoleAgnosticCourseText(value) {
  return ROLE_AGNOSTIC_COURSE_TEXT_REPLACEMENTS.reduce(
    (text, [pattern, replacement, preserveInitialCase = true]) => text.replace(
      pattern,
      (match) => preserveInitialCase && /^[A-Z]/.test(match)
        ? `${replacement[0].toUpperCase()}${replacement.slice(1)}`
        : replacement,
    ),
    String(value),
  );
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
    question_text: normalizeRoleAgnosticCourseText(question.questionText.trim()),
    question_type: questionType,
    explanation: normalizeRoleAgnosticCourseText(
      question.explanation?.trim()
        || "Review the lesson and compare each choice with the process described there.",
    ),
    points: 1,
    sort_order: index + 1,
    options: question.choices.map((choice, optionIndex) => ({
      source_key: `option-slot-${String(slot).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}-${optionIndex + 1}`,
      option_text: normalizeRoleAgnosticCourseText(choice.replace(/^\*/, "").trim()),
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

export function validateGuideApprovalLedger(ledger) {
  const errors = [];
  if (!isRecord(ledger) || ledger.schema_version !== GUIDE_APPROVAL_LEDGER_SCHEMA) {
    return [`Guide approval ledger schema_version must be ${GUIDE_APPROVAL_LEDGER_SCHEMA}`];
  }
  const acceptance = ledger.acceptance;
  if (
    !isRecord(acceptance)
    || acceptance.decision !== "accepted"
    || acceptance.accepted_by !== "codex-course-qa-controller"
    || acceptance.human_approval !== false
    || !ISO_TIMESTAMP_PATTERN.test(acceptance.accepted_at ?? "")
    || typeof acceptance.evidence !== "string"
    || !/deterministic rebuild/i.test(acceptance.evidence)
    || !/semantic tests/i.test(acceptance.evidence)
    || !/visual review/i.test(acceptance.evidence)
    || !/not Jarrad human approval/i.test(acceptance.evidence)
  ) {
    errors.push("Guide approval ledger requires explicit course-QA controller acceptance evidence, not Jarrad human approval");
  }
  if (!Array.isArray(ledger.records) || ledger.records.length !== LESSONS.length) {
    errors.push(`Guide approval ledger must contain exactly ${LESSONS.length} records`);
    return errors;
  }
  const expected = new Map(LESSONS.map((lesson) => {
    const slotKey = String(lesson.slot).padStart(2, "0");
    return [`guide-slot-${slotKey}`, `output/pdf/slot-${slotKey}-learner-guide.pdf`];
  }));
  const seen = new Set();
  for (const record of ledger.records) {
    if (!isRecord(record) || typeof record.source_key !== "string") {
      errors.push("Guide approval ledger record requires source_key");
      continue;
    }
    if (seen.has(record.source_key)) errors.push(`Duplicate guide approval record ${record.source_key}`);
    seen.add(record.source_key);
    const expectedPath = expected.get(record.source_key);
    if (!expectedPath) errors.push(`Unexpected guide approval record ${record.source_key}`);
    if (record.local_path !== expectedPath) errors.push(`${record.source_key} guide approval path drifted`);
    if (!SHA256_PATTERN.test(record.checksum_sha256 ?? "")) errors.push(`${record.source_key} guide approval checksum is invalid`);
    if (!Number.isInteger(record.size_bytes) || record.size_bytes <= 0) errors.push(`${record.source_key} guide approval size is invalid`);
  }
  for (const sourceKey of expected.keys()) {
    if (!seen.has(sourceKey)) errors.push(`Guide approval ledger is missing ${sourceKey}`);
  }
  const recordsSha256 = guideApprovalRecordsSha256(ledger.records);
  if (acceptance?.records_sha256 !== recordsSha256) {
    errors.push("Guide approval acceptance is not bound to the exact ordered record set");
  }
  return errors;
}

export function guideApprovalRecordsSha256(records) {
  if (!Array.isArray(records)) return null;
  const canonicalRecords = records
    .map((record) => ({
      source_key: record?.source_key ?? null,
      local_path: record?.local_path ?? null,
      checksum_sha256: record?.checksum_sha256 ?? null,
      size_bytes: record?.size_bytes ?? null,
    }))
    .sort((left, right) => String(left.source_key).localeCompare(String(right.source_key)));
  return createHash("sha256").update(JSON.stringify(canonicalRecords)).digest("hex");
}

export async function buildGuideAsset(lesson, guideApprovalLedger, repoRoot = REPO_ROOT) {
  const slotKey = String(lesson.slot).padStart(2, "0");
  const localPath = `output/pdf/slot-${slotKey}-learner-guide.pdf`;
  const absolutePath = path.join(repoRoot, localPath);
  const [checksum, fileInfo] = await Promise.all([sha256(absolutePath), stat(absolutePath)]);
  const ledgerIsAccepted = validateGuideApprovalLedger(guideApprovalLedger).length === 0;
  const approvalRecord = ledgerIsAccepted && guideApprovalLedger.records.find((record) =>
    record.source_key === `guide-slot-${slotKey}`
    && record.local_path === localPath
    && record.checksum_sha256 === checksum
    && record.size_bytes === fileInfo.size
  );
  return {
    source_key: `guide-slot-${slotKey}`,
    kind: "pdf",
    local_path: localPath,
    storage_path: `courses/bmh-employee-training/v1/guides/guide-slot-${slotKey}.${checksum}.pdf`,
    mime_type: "application/pdf",
    checksum_sha256: checksum,
    size_bytes: fileInfo.size,
    approval_status: approvalRecord ? "approved" : "missing",
  };
}

export function quizContentSha256({ source_key, title, questions }) {
  return createHash("sha256")
    .update(JSON.stringify({ source_key, title, questions }))
    .digest("hex");
}

export async function validateQuizApprovalLedger(ledger, repoRoot = REPO_ROOT) {
  const errors = [];
  let reviewRequest;
  if (!isRecord(ledger) || ledger.schema_version !== QUIZ_APPROVAL_LEDGER_SCHEMA) {
    return [`Quiz approval ledger schema_version must be ${QUIZ_APPROVAL_LEDGER_SCHEMA}`];
  }
  if (ledger.status !== "active") errors.push("Quiz approval ledger must be active");
  if (ledger.request_path !== "docs/course-production/quiz-content-review-request.v1.json") {
    errors.push("Quiz approval ledger request path is not canonical");
  }
  if (!SHA256_PATTERN.test(ledger.request_sha256 ?? "")) {
    errors.push("Quiz approval ledger request checksum is invalid");
  } else {
    try {
      const requestPath = path.join(repoRoot, ledger.request_path);
      const requestChecksum = await sha256(requestPath);
      if (requestChecksum !== ledger.request_sha256) {
        errors.push("Quiz approval ledger is not bound to the exact review request");
      }
      reviewRequest = JSON.parse(await readFile(requestPath, "utf8"));
    } catch {
      errors.push("Quiz approval review request is missing or invalid");
    }
  }
  if (reviewRequest) {
    if (reviewRequest.schema_version !== "bmh-quiz-content-review-request/v1") {
      errors.push("Quiz approval review request schema is invalid");
    }
    const reviewSurface = reviewRequest.review_surface;
    if (
      !isRecord(reviewSurface)
      || reviewSurface.path !== "docs/course-production/quiz-content-review.v1.md"
    ) {
      errors.push("Quiz approval review surface path is not canonical");
    } else if (!SHA256_PATTERN.test(reviewSurface.sha256 ?? "")) {
      errors.push("Quiz approval review surface checksum is invalid");
    } else {
      try {
        const actualReviewChecksum = await sha256(path.join(repoRoot, reviewSurface.path));
        if (actualReviewChecksum !== reviewSurface.sha256) {
          errors.push("Quiz approval review surface is not bound to the exact review packet");
        }
      } catch {
        errors.push("Quiz approval review surface is missing");
      }
    }
  }
  if (!Array.isArray(ledger.records)) {
    errors.push("Quiz approval ledger records must be an array");
    return errors;
  }
  const seen = new Set();
  for (const record of ledger.records) {
    const label = record?.quiz_source_key ?? "unknown quiz";
    if (!isRecord(record) || !/^quiz-slot-[0-9]{2}$/.test(record.quiz_source_key ?? "")) {
      errors.push(`${label} approval record has an invalid quiz source key`);
      continue;
    }
    if (seen.has(record.quiz_source_key)) errors.push(`Duplicate quiz approval record ${record.quiz_source_key}`);
    seen.add(record.quiz_source_key);
    if (record.decision !== "approved") errors.push(`${label} approval record decision must be approved`);
    if (!SHA256_PATTERN.test(record.content_sha256 ?? "")) errors.push(`${label} approval checksum is invalid`);
    const requestedPool = reviewRequest?.quiz_pools?.find((pool) =>
      pool.quiz_source_key === record.quiz_source_key
    );
    if (!requestedPool || requestedPool.content_sha256 !== record.content_sha256) {
      errors.push(`${label} approval does not match an exact pool in the current review request`);
    }
    if (record.request_sha256 !== ledger.request_sha256) errors.push(`${label} is not bound to the current review request`);
    if (typeof record.approved_by !== "string" || !record.approved_by.trim()) errors.push(`${label} needs an approver`);
    if (!ISO_TIMESTAMP_PATTERN.test(record.approved_at ?? "")) errors.push(`${label} approval timestamp is invalid`);
  }
  return errors;
}

export function quizApprovalStatus(ledger, quiz) {
  const checksum = quizContentSha256(quiz);
  const approved = ledger.records.some((record) =>
    record.quiz_source_key === quiz.source_key
    && record.content_sha256 === checksum
    && record.decision === "approved"
    && record.request_sha256 === ledger.request_sha256
  );
  return approved ? "approved" : "pending_human_review";
}

export async function buildManifest({
  artworkLedgerPath = ARTWORK_LEDGER_PATH,
  videoApprovalLedgerPath = VIDEO_APPROVAL_LEDGER_PATH,
  videoApprovalHistoryRepoRoot = REPO_ROOT,
  captionApprovalLedgerPath = CAPTION_APPROVAL_LEDGER_PATH,
  guideApprovalLedgerPath = GUIDE_APPROVAL_LEDGER_PATH,
  quizApprovalLedgerPath = QUIZ_APPROVAL_LEDGER_PATH,
  videoSourceRoot = DEFAULT_VIDEO_SOURCE_ROOT,
  quizSourceRoot = DEFAULT_QUIZ_SOURCE_ROOT,
  inspectDuration = probeVideoDuration,
} = {}) {
  const [videoApprovalLedger, captionApprovalLedger, guideApprovalLedger, quizApprovalLedger] = await Promise.all([
    readFile(videoApprovalLedgerPath, "utf8").then(JSON.parse),
    readFile(captionApprovalLedgerPath, "utf8").then(JSON.parse),
    readFile(guideApprovalLedgerPath, "utf8").then(JSON.parse),
    readFile(quizApprovalLedgerPath, "utf8").then(JSON.parse),
  ]);
  const guideApprovalErrors = validateGuideApprovalLedger(guideApprovalLedger);
  if (guideApprovalErrors.length > 0) {
    throw new Error(`Guide approval ledger is invalid: ${guideApprovalErrors.join("; ")}`);
  }
  const quizApprovalErrors = await validateQuizApprovalLedger(quizApprovalLedger);
  if (quizApprovalErrors.length > 0) {
    throw new Error(`Quiz approval ledger is invalid: ${quizApprovalErrors.join("; ")}`);
  }
  const captionApprovalErrors = [
    ...await validateCaptionApprovalEvidence({
      ledger: captionApprovalLedger,
      repoRoot: REPO_ROOT,
    }),
    ...await validateCaptionApprovalHistory({
      ledger: captionApprovalLedger,
      repoRoot: REPO_ROOT,
      ledgerPath: captionApprovalLedgerPath,
    }),
  ];
  if (captionApprovalErrors.length > 0) {
    throw new Error(`Caption approval ledger is invalid: ${captionApprovalErrors.join("; ")}`);
  }
  const videoAssetsWithMetadata = [];
  for (const video of VIDEO_SOURCES) {
    videoAssetsWithMetadata.push(await buildVideoAsset(video, videoApprovalLedger, {
      videoSourceRoot,
      inspectDuration,
    }));
  }

  const reviewedVideoAssets = videoAssetsWithMetadata.filter((asset) =>
    REVIEWED_VIDEO_SOURCE_KEYS.has(asset.source_key),
  );
  const videoApprovalErrors = [
    ...validateHeldVideoManifestApprovalState(
      videoApprovalLedger,
      reviewedVideoAssets,
      { allowHistoricalPending: true },
    ),
    ...await validateHeldVideoApprovalHistory({
      ledger: videoApprovalLedger,
      currentReviewAssets: reviewedVideoAssets,
      repoRoot: videoApprovalHistoryRepoRoot,
      ledgerPath: videoApprovalLedgerPath,
    }),
  ];
  if (videoApprovalErrors.length > 0) {
    throw new Error(`Video approval ledger is invalid: ${videoApprovalErrors.join("; ")}`);
  }

  const videosBySlot = Map.groupBy(videoAssetsWithMetadata, (asset) => asset._slot);
  const quizQuestionsBySlot = new Map();
  for (const lesson of LESSONS) {
    quizQuestionsBySlot.set(
      lesson.slot,
      (await sourceQuestions(lesson.slot, quizSourceRoot))
        .map((question, index) => shapeQuestion(lesson.slot, question, index)),
    );
  }

  const videoAssets = videoAssetsWithMetadata.map((assetWithMetadata) => {
    const asset = { ...assetWithMetadata };
    delete asset._slot;
    delete asset._title;
    delete asset._partLabel;
    delete asset._duration;
    return asset;
  });
  const derivativeAssets = [];
  for (const asset of videoAssetsWithMetadata) {
    derivativeAssets.push(...await buildDerivativePair(asset, captionApprovalLedger));
  }
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
  const posterAssets = videoAssetsWithMetadata.map((asset) => ({
    source_key: `poster-${asset.source_key}`,
    kind: "image",
    local_path: `course-assets/posters/${asset.source_key}.webp`,
    storage_path: `courses/bmh-employee-training/v1/posters/${asset.source_key}.webp`,
    mime_type: "image/webp",
    checksum_sha256: null,
    size_bytes: null,
    approval_status: "missing",
  }));
  const artworkLedger = await loadArtworkLedger(artworkLedgerPath);
  const artworkAssets = await applyArtworkLedger(
    [...imageAssets, ...posterAssets],
    artworkLedger ?? { schema_version: ARTWORK_LEDGER_SCHEMA, assets: [] },
  );
  const guideAssets = [];
  for (const lesson of LESSONS) {
    guideAssets.push(await buildGuideAsset(lesson, guideApprovalLedger));
  }
  const guidesBySlot = new Map(
    LESSONS.map((lesson, index) => [lesson.slot, guideAssets[index]]),
  );

  const modules = MODULES.map(([moduleNumber, title, description]) => {
    const topicLessons = LESSONS.filter((lesson) => lesson.module === moduleNumber);
    const lessons = [];
    for (const topic of topicLessons) {
      const slotKey = String(topic.slot).padStart(2, "0");
      const guideAsset = guidesBySlot.get(topic.slot);
      const questions = quizQuestionsBySlot.get(topic.slot);
      const quizIdentity = {
        source_key: `quiz-slot-${slotKey}`,
        title: `${topic.title} Checkpoint`,
        questions,
      };
      const videoBlocks = videosBySlot.get(topic.slot).map((asset, index) => ({
        source_key: `block-video-${asset.source_key}`,
        type: "video",
        sort_order: index + 2,
        required: true,
        content: {
          asset_key: asset.source_key,
          poster_asset_key: `poster-${asset.source_key}`,
          caption_asset_key: `caption-${asset.source_key}`,
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
            assignment_source_key: scenario.assignment_source_key,
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
        {
          source_key: `block-guide-pdf-slot-${slotKey}`,
          type: "download",
          sort_order: videoBlocks.length + 3,
          // Guides are required course resources, but downloading a file does not
          // produce durable learner progress. Keep the guide available without
          // making it a completion gate that can deadlock the lesson.
          required: false,
          content: {
            asset_key: `guide-slot-${slotKey}`,
            file_path: guideAsset.storage_path,
            filename: `slot-${slotKey}-learner-guide.pdf`,
            size_bytes: guideAsset.size_bytes,
            description: `Accessible learner guide for ${topic.title}`,
          },
        },
        { source_key: `block-flashcards-slot-${slotKey}`, type: "flashcard", sort_order: videoBlocks.length + 4, required: false, content: { cards: flashcards } },
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
          description: "Each attempt draws 10 questions from the curated lesson pool.",
          approval_status: quizApprovalStatus(quizApprovalLedger, quizIdentity),
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

  const manifest = {
    schema_version: 1,
    import_id: "bmh-employee-training-v1",
    status: "draft",
    qa_role_group: {
      source_key: "role-group-bmh-content-qa",
      name: "BMH Content QA",
      description: "Private reviewers for the unpublished BMH employee training program.",
    },
    assets: [...videoAssets, ...derivativeAssets, ...artworkAssets, ...guideAssets],
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
  return validateArtworkManifestTrustBoundary(manifest, artworkLedger);
}

function manifestBuilderUsage() {
  return `Usage: node scripts/course-content/build-manifest.mjs [--video-root PATH] [--quiz-root PATH]

Source root precedence:
  --video-root PATH  > BMH_COURSE_VIDEO_ROOT > ${DEFAULT_VIDEO_SOURCE_ROOT}
  --quiz-root PATH   > BMH_COURSE_QUIZ_ROOT  > ${DEFAULT_QUIZ_SOURCE_ROOT}`;
}

export function resolveManifestSourceRoots(argv = [], env = process.env) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const equals = token.match(/^--(video-root|quiz-root)=(.+)$/);
    if (equals) {
      options.set(equals[1], equals[2]);
      continue;
    }
    const split = token.match(/^--(video-root|quiz-root)$/);
    if (split && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      options.set(split[1], argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete manifest-builder argument: ${token}\n\n${manifestBuilderUsage()}`);
  }
  const videoSourceRoot = options.get("video-root")
    ?? env.BMH_COURSE_VIDEO_ROOT
    ?? DEFAULT_VIDEO_SOURCE_ROOT;
  const quizSourceRoot = options.get("quiz-root")
    ?? env.BMH_COURSE_QUIZ_ROOT
    ?? DEFAULT_QUIZ_SOURCE_ROOT;
  if (typeof videoSourceRoot !== "string" || videoSourceRoot.trim().length === 0) {
    throw new Error("The configured video source root must be nonempty.");
  }
  if (typeof quizSourceRoot !== "string" || quizSourceRoot.trim().length === 0) {
    throw new Error("The configured quiz source root must be nonempty.");
  }
  return {
    videoSourceRoot: path.resolve(videoSourceRoot),
    quizSourceRoot: path.resolve(quizSourceRoot),
  };
}

async function main() {
  const manifest = await buildManifest(
    resolveManifestSourceRoots(process.argv.slice(2), process.env),
  );
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2).replaceAll("\u2014", "-")}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
