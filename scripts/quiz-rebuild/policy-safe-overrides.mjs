function item(recordId, questionText, explanation, distractors) {
  if (!Array.isArray(distractors) || distractors.length !== 3) {
    throw new Error(`${recordId} must define exactly three authored distractors`);
  }
  return [recordId, {
    questionText,
    explanation,
    distractors,
    distractorStrategy: "authored",
  }];
}

const OVERRIDES = [
  item(
    "slot-module-01-017",
    "What does the principle 'Detach from Outcomes and Attach to Actions' require a representative to focus on?",
    "Their own preparation, tone, questions, and follow-up cadence rather than trying to control the seller's final decision.",
    [
      "Securing a commitment before the first conversation ends.",
      "Preventing the seller from raising concerns or objections.",
      "Controlling the seller's final answer through a perfect script.",
    ],
  ),
  item(
    "slot-module-01-034",
    "Why can sounding needy damage a seller conversation?",
    "It signals attachment to the outcome, creates pressure, and can drive the seller away.",
    [
      "It guarantees the seller will ask for a full-price offer.",
      "It proves the representative has researched too many property details.",
      "It prevents the representative from scheduling any future follow-up.",
    ],
  ),

  item(
    "legacy-ch02-078",
    "A seller gives a strong reason for considering a sale but cannot say when a change is needed. What part of true motivation is still missing?",
    "A timeline connected to the seller's reason.",
    [
      "A repair estimate prepared by the representative.",
      "A promise to accept the first offer presented.",
      "A list of every investor who has contacted the seller.",
    ],
  ),

  item(
    "legacy-ch03-045",
    "Why can avoiding open houses and staging make the selling experience simpler?",
    "It reduces the preparation, disruption, and physical work required from the seller.",
    [
      "It guarantees that the cash offer will equal full retail value.",
      "It removes the need to understand the seller's preferred closing timing.",
      "It allows repairs to be completed without the seller's knowledge.",
    ],
  ),
  item(
    "legacy-ch03-054",
    "Why can a cash-sale path be more predictable than a traditionally financed sale?",
    "It does not depend on a buyer completing the traditional bank-underwriting process before closing.",
    [
      "It guarantees that every title issue disappears automatically.",
      "It requires the seller to stage the property before an offer is made.",
      "It fixes the seller's closing date before their needs are discussed.",
    ],
  ),
  item(
    "legacy-ch03-060",
    "Why is a margin considered after estimated repair costs when evaluating a potential cash offer?",
    "It accounts for the buyer's profit requirement and carrying costs in the deal analysis.",
    [
      "It converts the seller's mortgage balance into the property's repair estimate.",
      "It replaces the need to estimate the property's after-repair value.",
      "It adds future retail-listing commissions to the seller's cash proceeds.",
    ],
  ),
  item(
    "legacy-ch03-065",
    "Before the process can move to closing, what must occur after the property is evaluated?",
    "An offer must be presented and accepted, followed by coordination of the closing steps.",
    [
      "The seller must complete staging and host an open house.",
      "The representative must promise a specific closing date before discovery.",
      "The property must be listed publicly for a traditional retail buyer.",
    ],
  ),
  item(
    "legacy-ch03-070",
    "How should a representative respond when a seller declines the cash offer?",
    "Respect the decision, avoid pressure, document the outcome, and leave an appropriate path for future contact.",
    [
      "Keep calling until the seller accepts the same offer.",
      "Raise the offer to full retail value without a new evaluation.",
      "Tell the seller that declining permanently removes every future option.",
    ],
  ),
  item(
    "legacy-ch03-074",
    "Which value estimates what a property could be worth after the planned repairs are complete?",
    "After Repair Value (ARV).",
    [
      "The estimated repair cost by itself.",
      "The seller's remaining mortgage balance.",
      "The initial cash offer before the deal is evaluated.",
    ],
  ),

  item(
    "legacy-ch04-002",
    "What should happen when discovery confirms that a lead is not a fit or the person has clearly opted out?",
    "Disqualify the lead with the reason documented; an unanswered contact attempt alone should remain in follow-up instead.",
    [
      "Advance the lead to acquisitions even though qualification failed.",
      "Leave the lead in the same stage indefinitely without a task or disposition.",
      "Treat every unanswered contact attempt as a confirmed disqualification.",
    ],
  ),
  item(
    "legacy-ch04-003",
    "Which pipeline stages are owned and managed by the seller-facing representatives?",
    "Stages 1 through 4.",
    ["Stages 1 through 5.", "All six stages.", "Stages 2 through 6."],
  ),
  item(
    "legacy-ch04-008",
    "What is the representative's primary goal during Stage 1 (Lead Capture)?",
    "Make first contact and start a live two-way conversation with the property owner.",
    [
      "Present the final offer before learning why the owner responded.",
      "Complete the acquisitions handoff before ownership is confirmed.",
      "Move every unanswered lead to the next pipeline stage.",
    ],
  ),
  item(
    "legacy-ch04-010",
    "If a representative cannot reach a lead in Stage 1, what is the required protocol?",
    "Keep the lead in Stage 1 and assign the next appropriate follow-up task.",
    [
      "Advance the lead to Stage 2 and mark qualification complete.",
      "Disqualify the lead solely because the first attempt was unanswered.",
      "Send the lead to Stage 4 for an acquisitions call.",
    ],
  ),
  item(
    "legacy-ch04-027",
    "What is the seller-facing representative's role during Stage 5 (Offer Review)?",
    "Support the acquisition manager with context or requested follow-up while acquisitions owns the offer review.",
    [
      "Determine and present the final financial offer without acquisitions.",
      "Take ownership of transaction closing as soon as an offer is discussed.",
      "Restart lead capture and remove the discovery notes from the handoff.",
    ],
  ),

  item(
    "legacy-ch05-019",
    "What listening-to-talking balance should an acquisition specialist generally aim for during discovery?",
    "Listen about 80 percent of the time and talk about 20 percent of the time.",
    [
      "Listen about 20 percent of the time and talk about 80 percent of the time.",
      "Listen and talk for exactly 50 percent of the time each.",
      "Talk throughout the call and save all listening for the final question.",
    ],
  ),

  item(
    "legacy-ch07-012",
    "What is a reactionary defense response?",
    "Automatic, reflexive pushback meant to protect the seller's time or space, similar to saying 'just looking' in a store.",
    [
      "A specific concern the seller has considered and needs resolved before saying yes.",
      "A quiet pause while the seller actively processes new information.",
      "Frustrated venting about repeated investor calls without a specific barrier.",
    ],
  ),
  item(
    "legacy-ch07-040",
    "When a seller says they need to talk to their spouse, what response type are they presenting?",
    "A real objection.",
    ["A reactionary defense response.", "A complaint without a decision barrier.", "Silence while processing."],
  ),
  item(
    "legacy-ch07-060",
    "Before hearing why the representative called, a seller immediately says, 'Not interested.' What response type is this?",
    "A reactionary defense response.",
    [
      "A real objection based on a specific unresolved concern.",
      "A complaint describing repeated unwanted calls in detail.",
      "Silence while the seller processes the representative's explanation.",
    ],
  ),
  item(
    "legacy-ch07-065",
    "Why ask, 'Is there a reason you responded to our outreach in the first place?' when a seller now says they are not interested?",
    "To uncover an underlying motivation that may have changed or been set aside.",
    [
      "To compare competing offers before completing discovery.",
      "To decide which repairs are required for a traditional listing.",
      "To avoid acknowledging the seller's current response.",
    ],
  ),

  item(
    "slot-module-10-044",
    "Why should the explanation 'public records and standard outreach' be delivered briefly and calmly?",
    "It answers the question truthfully without becoming defensive, then lets the conversation return to the reason for the outreach.",
    [
      "It prevents the seller from asking any follow-up question about the contact.",
      "It proves the representative received the number from a personal referral.",
      "It replaces the need to respect a clear request not to continue the call.",
    ],
  ),

  item(
    "legacy-ch09-002",
    "Why should a representative avoid assuming that a deal is lost after the first conversation?",
    "Many opportunities require multiple useful follow-up touches, so the next step should reflect the lead's status and documented cadence.",
    [
      "Every lead must be contacted indefinitely regardless of consent or fit.",
      "The first conversation should be ignored when choosing the next action.",
      "A lead becomes qualified automatically after any repeated contact attempt.",
    ],
  ),
  item(
    "legacy-ch09-040",
    "What follow-up action is appropriate when a seller says, 'I need to think about it'?",
    "Agree on a reasonable time to follow up after giving the seller space to consider the decision.",
    [
      "Mark the lead dead immediately without clarifying the next step.",
      "Restart the entire discovery call without acknowledging the request.",
      "Continue pressing for an immediate decision after the seller asks for time.",
    ],
  ),

  item(
    "legacy-ch10-014",
    "What outcome best describes a sound negotiation?",
    "A workable agreement that both sides understand and can accept.",
    [
      "A result where one side wins every term and the other side stays silent.",
      "A number chosen before either side explains its needs or constraints.",
      "A promise that every concern will disappear after the agreement is signed.",
    ],
  ),

  item(
    "legacy-ch11-008",
    "An operator sees different daily dial targets in two documents. What is the safest next step?",
    "Identify the current approved operating plan for the operator's role and effective date, then resolve the conflict before reporting against a target.",
    [
      "Use the higher target because it creates the strongest performance expectation.",
      "Average the two targets and treat the result as the working requirement.",
      "Use the current KPI plan for the acquisition role because it covers the same market.",
    ],
  ),
  item(
    "legacy-ch11-013",
    "Which comparison makes a connection-rate result meaningful?",
    "Compare the measured rate with the current approved definition and target for the same role, channel, and reporting period.",
    [
      "Compare it with a teammate's raw dial count from a different campaign.",
      "Compare it with the best single hour in the operator's own history.",
      "Compare it with the current approved dial-volume target for the same calling block.",
    ],
  ),
  item(
    "legacy-ch11-014",
    "A connection rate appears low. What should the operator verify before concluding that performance missed target?",
    "Verify that the numerator, denominator, reporting window, and approved target all use the same current KPI definition.",
    [
      "Verify only that the dial count is larger than yesterday's dial count.",
      "Verify only that at least one conversation lasted longer than average.",
      "Verify that the operator felt busy throughout the calling block.",
    ],
  ),
  item(
    "legacy-ch11-019",
    "Which evidence is needed to evaluate conversion from connections to quality conversations?",
    "Counts built from the current definitions of a connection and a quality conversation for the same reporting period.",
    [
      "The documented call count and calendar-event total for the same reporting period.",
      "The total size of the lead list and the number of notes entered by the team.",
      "The operator's strongest conversation and the team's monthly contract count.",
    ],
  ),
  item(
    "legacy-ch11-024",
    "A manager asks whether the current offer-to-contract conversion result is healthy. Which source should frame the answer?",
    "The approved KPI plan for the role and reporting period, together with the underlying offer and contract records.",
    [
      "The operator's personal benchmark from the month with the most contracts.",
      "The current company revenue target together with the acquisition team's weekly forecast.",
      "The acquisition team's call volume for the same week.",
    ],
  ),
  item(
    "legacy-ch11-029",
    "A representative reached many owners but recorded few usable conversations. Which target is most relevant to that gap?",
    "The current quality-conversation target and definition for the representative's role.",
    [
      "The current market-coverage scorecard for properties reached by the whole team.",
      "The acquisition team's average time from offer to contract.",
      "The representative's longest call duration for the day.",
    ],
  ),
  item(
    "legacy-ch11-030",
    "Why must a quality-conversation target be paired with its definition?",
    "Without the approved definition, people can count different events and report results that are not comparable.",
    [
      "Because the definition treats a connected call as sufficient evidence of a quality conversation.",
      "Because the target is intended to replace call notes and outcome records.",
      "Because the definition uses call duration instead of discovery content to classify quality.",
    ],
  ),
  item(
    "legacy-ch11-031",
    "Which records are needed to evaluate progress toward the daily process-call target?",
    "The current approved target and counting definition plus the operator's documented process-call results for the same day.",
    [
      "The operator's total login time plus the acquisition team's completed contract count.",
      "The number of leads in the market plus the team's average seller-call duration.",
      "The operator's scheduled breaks plus the number of follow-up tasks due tomorrow.",
    ],
  ),

  item(
    "slot-module-18-006",
    "An operator finds two different opening checklists. What resolves which workflow applies today?",
    "The approved operating playbook or scorecard for the operator's role and current effective period.",
    [
      "The current approved call plan for the acquisition team in the same market.",
      "The checklist used by the operator who logged in first that morning.",
      "The checklist attached to the oldest recurring calendar event.",
    ],
  ),
  item(
    "slot-module-18-009",
    "Which information makes a first-block dial result comparable with its target?",
    "The actual count and the approved target must cover the same role, block, effective period, and counting definition.",
    [
      "The actual count and the current approved full-day target must cover the same date.",
      "The actual count and the operator's current historical best must use the same lead list.",
      "The actual count and the acquisition team's current appointment target must fall on the same day.",
    ],
  ),
  item(
    "slot-module-18-011",
    "What follow-up task may be completed between dials after any required message approval is obtained?",
    "Send the approved follow-up text, record it in the CRM, and return to the calling workflow.",
    [
      "Send an unreviewed message from a personal number so it is faster.",
      "Skip the CRM record because the message was sent between calls.",
      "Pause the calling block to research unrelated properties for the next day.",
    ],
  ),
  item(
    "slot-module-18-013",
    "Why should a before-lunch progress check use the current scorecard definition?",
    "It keeps the operator's measured activity aligned with the approved expectation for that role and period.",
    [
      "It allows the operator to replace incomplete CRM records with a personal activity estimate.",
      "It converts the documented dial count into the current quality-conversation total.",
      "It makes the afternoon block optional whenever the morning feels productive.",
    ],
  ),
  item(
    "slot-module-18-015",
    "An operator completed the morning target but is unsure about the full-day expectation. What should be compared?",
    "The documented full-day activity against the full-day definition and target in the current approved operating plan.",
    [
      "The morning dial count against another operator's weekly appointment total.",
      "The number of open leads against the acquisition team's monthly contract goal.",
      "The operator's logged-in time against the longest call completed that day.",
    ],
  ),
  item(
    "slot-module-18-018",
    "What evidence supports a claim that the day's required work was completed?",
    "CRM and activity records that satisfy the current plan's defined activity and outcome requirements.",
    [
      "A full calendar and an estimate of how many calls probably connected.",
      "A long login session and a list of leads intended for tomorrow.",
      "A teammate's total activity and the operator's description of feeling busy.",
    ],
  ),

  item(
    "legacy-ch13-001",
    "What is the safest foundation for career growth at BMH Group?",
    "Build reliable capability in the current assigned role and document the results.",
    [
      "Broad exposure to future-role tasks before current-role results are consistent.",
      "Visible participation in leadership meetings as the primary evidence of role mastery.",
      "Interest in a future title supported mainly by one strong performance period.",
    ],
  ),
  item(
    "legacy-ch13-002",
    "How should an employee demonstrate mastery of sellers and pipeline work?",
    "Apply the current role standards reliably, keep records accurate, and use feedback to improve.",
    [
      "Rely on confidence alone while leaving pipeline records incomplete.",
      "Skip feedback once a single seller conversation goes well.",
      "Use the current workflow from another role when it produces a faster handoff.",
    ],
  ),
  item(
    "legacy-ch13-005",
    "An employee and manager remember different advancement-review periods. What should settle the question?",
    "The current written role and advancement criteria that apply to the employee's review.",
    [
      "The review period used for the most recently promoted employee on another team.",
      "The amount of time remaining in the employee's current calendar quarter.",
      "The date the employee first expressed interest in a different role.",
    ],
  ),
  item(
    "legacy-ch13-006",
    "Why does completing a stated review period not establish advancement readiness by itself?",
    "Because advancement also depends on current role criteria, documented performance, required capability, and an authorized review.",
    [
      "Because the review period measures workload rather than the employee's training progress.",
      "Because the manager's time in the role is the primary evidence of employee readiness.",
      "Because the review period must match the current compensation plan's payout cycle.",
    ],
  ),
  item(
    "legacy-ch13-012",
    "What evidence confirms a compensation change associated with a new role or level?",
    "The authorized written offer, role plan, or compensation plan issued for that role and effective period.",
    [
      "The employee's first completed task that resembles work in the new role.",
      "A team announcement that describes the new title but contains no compensation terms.",
      "A development plan listing skills the employee hopes to build for a future role.",
    ],
  ),
  item(
    "legacy-ch13-013",
    "What must happen before an employee takes on responsibilities beyond the current role?",
    "The change must be authorized and documented in the current written role plan.",
    [
      "The employee must begin the extra work first and request authorization only if a problem occurs.",
      "A coworker must informally agree that the employee appears ready for the additional duties.",
      "The employee's current scorecard expands the role when its top metric is reached.",
    ],
  ),
  item(
    "legacy-ch13-015",
    "How should earning potential for a different role be discussed?",
    "As subject to that role's current written compensation plan, eligibility rules, and actual results.",
    [
      "As the current team's average earnings for that role, projected from recent results.",
      "Using the approved compensation plan for a related role with similar responsibilities.",
      "As the current role's opportunity forecast before eligibility criteria are applied.",
    ],
  ),
  item(
    "legacy-ch13-016",
    "How should an employee prepare for work that requires more technical deal knowledge?",
    "Develop the required skills through approved training, practice, feedback, and documented readiness criteria.",
    [
      "Use the current role's self-study library as sufficient proof of readiness.",
      "Use one successful call as evidence that technical judgment is ready.",
      "Use an approved role description as the only preparation for complex work.",
    ],
  ),
  item(
    "legacy-ch13-018",
    "What is a policy-safe reason to pursue leadership development?",
    "To build the capability to support people and outcomes under an authorized role, not to rely on a promised path.",
    [
      "To practice supervisory decisions before receiving the current role assignment.",
      "To build authority from team results before leadership ownership is documented.",
      "To qualify under the approved compensation example used in training.",
    ],
  ),
  item(
    "legacy-ch13-019",
    "A new manager is asked to approve an action owned by another role. What should the manager check first?",
    "The current manager role plan and authorized operating procedures for the actual ownership boundary.",
    [
      "Check the current scorecard to see whether the manager has the larger activity target.",
      "Check the approved meeting agenda to see whether the action appears as a discussion item.",
      "Check the documented team roster to see who has the longest company tenure.",
    ],
  ),
  item(
    "legacy-ch13-020",
    "What makes a management-level compensation term applicable to a particular employee?",
    "It appears in the authorized plan issued for that employee's role and effective date.",
    [
      "It appeared in the highest-earning manager's prior-year results.",
      "It is associated with a responsibility the employee hopes to assume later.",
      "It was mentioned in a leadership workshop attended by the employee.",
    ],
  ),
  item(
    "legacy-ch13-022",
    "How should an employee learn the current timing of an advancement process?",
    "Consult the current written criteria and authorized reviewer; training does not promise a timeframe.",
    [
      "Use the current project's end date as the advancement-process start date.",
      "Use the approved review period assigned to another employee in a related role.",
      "Use the current quarter boundary as the standard advancement-review date.",
    ],
  ),
  item(
    "legacy-ch13-023",
    "How should consistent performance be demonstrated?",
    "Against the current role scorecard with documented results across the review period defined by current policy.",
    [
      "By selecting only the employee's best isolated result and omitting the rest of the period.",
      "By relying on an undocumented impression instead of the assigned scorecard.",
      "By comparing results with current targets for a related role in the same period.",
    ],
  ),
  item(
    "legacy-ch13-029",
    "How can strong performance support an employee when new opportunities arise?",
    "Documented performance may support consideration under the current criteria and business needs, but it does not establish an opportunity or role change.",
    [
      "It supports direct placement into the next open role based on current results.",
      "It moves the employee into management when the team has a current opening.",
      "It authorizes temporary ownership of new tasks while the role review is pending.",
    ],
  ),
  item(
    "legacy-ch13-030",
    "What authorizes a move from sourcing work to negotiating work?",
    "A documented role change or assignment under the current written role plan.",
    [
      "A current development plan naming negotiation as a future skill goal.",
      "A coworker's informal suggestion that the employee appears ready.",
      "One successful sourced lead recorded under the employee's current role.",
    ],
  ),
  item(
    "legacy-ch13-033",
    "An employee hits a performance target, but the required capability review is incomplete. What is still missing?",
    "Documented capability evidence and completion of the authorized review under the current criteria.",
    [
      "The current compensation plan for the role the employee hopes to enter.",
      "An open position and the employee's preferred title for that position.",
      "The team's average performance for the same scorecard period.",
    ],
  ),
  item(
    "legacy-ch13-036",
    "How should a leader's contribution to team results be evaluated?",
    "Against the current written leadership responsibilities and documented team outcomes.",
    [
      "By assigning the leader all team results recorded during the review period.",
      "By using only a personal impression and excluding documented outcomes.",
      "By applying the current scorecard for a manager with broader ownership.",
    ],
  ),
  item(
    "legacy-ch13-041",
    "What does a manager own in a policy-safe sense?",
    "The responsibilities explicitly assigned in the current written manager role plan.",
    [
      "Responsibilities listed in the current team charter, including work assigned to peer roles.",
      "Responsibilities demonstrated in an approved leadership workshop for future managers.",
      "Tasks the manager selects from the current team backlog during that review period.",
    ],
  ),
  item(
    "legacy-ch13-043",
    "Which practice develops market knowledge for complex deal analysis?",
    "Study current market data and comparable deals, test interpretations in supervised analysis, and use feedback.",
    [
      "Memorize one closed deal and use its assumptions for similar markets.",
      "Rely on seller asking prices as the primary measure of current market value.",
      "Use current script performance to infer property valuation patterns.",
    ],
  ),
  item(
    "legacy-ch13-047",
    "Which preparation best supports a representative facing a sensitive seller situation?",
    "Practice listening and empathy, role-play escalation scenarios, and apply current role standards.",
    [
      "Memorize one approved script and use it across different seller contexts.",
      "Study comparable-property data and lead with valuation details in the conversation.",
      "Practice commission calculations and use them to resolve emotional objections.",
    ],
  ),
];

// The compensation checkpoint previously collapsed most source cards into the
// same "consult the plan" recall item. This replacement preserves every source
// key while assessing distinct decisions, evidence, calculations, and handoff
// behaviors. Every distractor is authored for its stem; no phrase-bank output
// is used by the effective pool.
const COMPENSATION_OVERRIDES = [
  item(
    "legacy-ch12-001",
    "Which description best separates compensation training from an employee's actual compensation terms?",
    "Training explains how components such as ramp pay, commissions, and appointment incentives work conceptually; the employee's current written plan supplies the binding terms.",
    [
      "Training supplies the binding terms, while the written plan is only a summary of the course.",
      "A manager's forecast supplies the binding terms, while training determines which payments have been earned.",
      "Pipeline results supply the binding terms, while the written plan is used only after a payment dispute.",
    ],
  ),
  item(
    "legacy-ch12-002",
    "What business purpose can ramp-period pay serve?",
    "It can provide income while a new employee learns the role and develops a pipeline, subject to the current written plan.",
    [
      "It rewards the acquisition team for contracts that close before a new employee begins calling.",
      "It replaces the need for a new employee to learn qualification and handoff standards.",
      "It serves as the current commission rate until the employee's pipeline reaches target.",
    ],
  ),
  item(
    "legacy-ch12-003",
    "A training example shows one ramp-pay amount. What may the learner safely conclude?",
    "The example can illustrate the concept, but the employee must use the amount and conditions in the current written plan.",
    [
      "The example becomes the employee's rate as soon as the lesson is completed.",
      "The example controls whenever it is higher than the amount shown in payroll.",
      "The example supplies the default term when a current plan leaves that field blank.",
    ],
  ),
  item(
    "legacy-ch12-004",
    "Which evidence should a reviewer use to decide whether an employee has completed the ramp period?",
    "The performance and duration requirements in the applicable current plan, supported by the employee's documented results.",
    [
      "The date of the employee's first outbound call and the total number of contacts in the CRM.",
      "The strongest single day of performance and the date the training course was opened.",
      "The average tenure of other employees who previously held the role.",
    ],
  ),
  item(
    "legacy-ch12-005",
    "What makes a transition from ramp compensation to a post-ramp structure valid?",
    "The employee meets the applicable criteria and the transition is confirmed under the current written plan.",
    [
      "The employee estimates that the pipeline is large enough to support the change.",
      "A teammate begins using the employee's leads in a different reporting period.",
      "The employee completes the current learning plan and the course records the transition.",
    ],
  ),
  item(
    "legacy-ch12-006",
    "Which record best supports a compensation-eligibility review for work on a lead?",
    "A traceable CRM history showing the employee's sourcing, qualification, follow-up, and handoff activity, evaluated under the current plan.",
    [
      "A calendar entry showing that the employee was scheduled to work when the lead arrived.",
      "A documented team total showing aggregate contacts for the same reporting period.",
      "A personal list of promising leads that does not include qualification or handoff records.",
    ],
  ),
  item(
    "legacy-ch12-007",
    "After a seller-facing representative qualifies a lead and completes the handoff, which team owns negotiation and closing?",
    "The acquisition team.",
    [
      "The seller-facing representative who first contacted the property owner.",
      "The marketing team that supplied the original lead list.",
      "The operations team that maintains the calling systems.",
    ],
  ),
  item(
    "legacy-ch12-008",
    "Which facts are needed before a per-deal commission can be calculated?",
    "The deal's eligibility and timing records plus the applicable rate or tier terms in the current written plan.",
    [
      "The applicable market's repair-cost estimate and the seller's preferred closing date.",
      "The number of calls made on the lead and the acquisition manager's total monthly call time.",
      "The team's projected revenue and the employee's preferred earnings target.",
    ],
  ),
  item(
    "legacy-ch12-009",
    "Two compensation-plan versions show different tier thresholds. Which version should be applied?",
    "The approved version whose role and effective period cover the employee and the measured results.",
    [
      "The version with the threshold reached by the largest number of employees.",
      "The current approved version for a different role but the same reporting period.",
      "The version that produces the closest match to the employee's forecast.",
    ],
  ),
  item(
    "legacy-ch12-010",
    "What is the difference between a commission-tier threshold and a commission rate?",
    "The threshold determines which tier applies; the rate determines the commission calculation within that tier.",
    [
      "The threshold records when a seller was contacted; the rate records who owns the lead.",
      "The threshold measures call duration; the rate measures the quality of discovery notes.",
      "The threshold sets the payment date; the rate determines whether the employee completed training.",
    ],
  ),
  item(
    "legacy-ch12-011",
    "What evidence is relevant when deciding whether a higher commission tier was reached?",
    "The documented qualifying results for the measured period, evaluated against the applicable tier definition.",
    [
      "The total number of leads assigned to the team, including leads with no qualifying outcome.",
      "The employee's best historical month adjusted to the current period length.",
      "The current acquisition-call total paired with its scheduled-call records.",
    ],
  ),
  item(
    "legacy-ch12-012",
    "An employee knows which tier applies but not its rate. What information is still required?",
    "The rate and calculation terms for that tier in the plan effective for the transaction period.",
    [
      "The next tier's threshold and the team's total number of open leads.",
      "The seller's asking price and the representative's number of follow-up attempts.",
      "The ramp-period review date and the acquisition team's average close time.",
    ],
  ),
  item(
    "legacy-ch12-013",
    "Which forecasting practice avoids overstating commission earnings?",
    "Separate documented qualifying results from unconfirmed pipeline opportunities and apply only the current plan's terms.",
    [
      "Count documented qualified leads as deals when projecting the highest available tier.",
      "Treat documented scheduled seller calls as commission-bearing transactions.",
      "Use the current plan with the strongest historical month as the performance baseline.",
    ],
  ),
  item(
    "legacy-ch12-014",
    "What controls the amount paid when an employee qualifies for a commission tier?",
    "The applicable plan's rate, eligibility, timing, and calculation language for that tier.",
    [
      "The employee's number of outbound calls and the seller's initial asking price.",
      "The applicable team's average commission and the employee's length of service.",
      "The acquisition manager's forecast and the age of the lead record.",
    ],
  ),
  item(
    "legacy-ch12-015",
    "A higher tier is reached late in a measured period. What decides whether earlier qualifying deals are recalculated?",
    "The applicable plan's tier-ordering and retroactivity language.",
    [
      "The order in which the employee remembers working the leads.",
      "The date on which the employee first forecast the higher tier.",
      "The size of the largest deal completed during the period.",
    ],
  ),
  item(
    "legacy-ch12-016",
    "Which sequence produces an auditable monthly commission calculation?",
    "Identify eligible deals, select the governing plan version, apply its tier and timing rules, and reconcile the result to the source records.",
    [
      "Count all assigned leads, multiply by the team's average rate, and round to the employee's forecast.",
      "Select the current highest rate and apply it to each documented pipeline opportunity.",
      "Add the month's call totals, divide by closed transactions, and use that ratio as the commission rate.",
    ],
  ),
  item(
    "legacy-ch12-017",
    "What distinguishes an appointment-incentive milestone from a commission tier?",
    "An appointment milestone is tied to qualifying appointment events; a commission tier is tied to qualifying deal results, as each is defined by the plan.",
    [
      "An appointment milestone measures contract revenue; a commission tier measures total call duration.",
      "An appointment milestone determines lead ownership; a commission tier determines the seller's asking price.",
      "An appointment milestone applies only during closing; a commission tier applies only during lead capture.",
    ],
  ),
  item(
    "legacy-ch12-018",
    "Before stating an appointment-incentive amount, what must be verified?",
    "The applicable plan's amount, qualifying-event definition, milestone rule, and effective date.",
    [
      "The employee's total calendar entries, average call duration, and projected pipeline value.",
      "The acquisition team's contract count, the seller's asking prices, and the lead-list size.",
      "The number of messages sent, the employee's tenure, and the team's monthly revenue goal.",
    ],
  ),
  item(
    "legacy-ch12-019",
    "Why is a scheduled appointment not automatically a qualifying appointment for compensation purposes?",
    "The plan may require a defined event and supporting CRM evidence beyond the act of scheduling.",
    [
      "Because scheduling transfers qualification responsibility from the representative to the seller.",
      "Because scheduling converts the appointment into a closed transaction before the call occurs.",
      "Because scheduling moves the appointment outcome into the acquisition team's current records.",
    ],
  ),
  item(
    "legacy-ch12-020",
    "Which two inputs are essential to an appointment-incentive calculation?",
    "The count of documented qualifying events and the applicable plan's milestone or calculation rule.",
    [
      "The number of calendar invitations and the average length of completed calls.",
      "The number of leads assigned and the team's total monthly contract value.",
      "The employee's dial count and the acquisition manager's appointment capacity.",
    ],
  ),
  item(
    "legacy-ch12-021",
    "What is the proper use of an arithmetic example in compensation training?",
    "Use it to demonstrate a calculation method, then substitute the employee's documented facts and current plan terms for an actual review.",
    [
      "Use its figures as minimum payments for anyone who completes the lesson.",
      "Use its outcome when the employee's records produce a less favorable result.",
      "Use its plan version as the standing reference for future calculation practice.",
    ],
  ),
  item(
    "legacy-ch12-022",
    "How should commissions and appointment incentives be combined in one compensation review?",
    "Evaluate each component under its own eligibility and calculation rules, then combine only the supported results.",
    [
      "Apply the commission rate to appointments and the appointment milestone to closed deals.",
      "Choose whichever component produces the larger amount and omit the other component.",
      "Treat all pipeline events as one category and divide the total by the number of workdays.",
    ],
  ),
  item(
    "legacy-ch12-023",
    "How can an employee determine whether a commission limit applies?",
    "Read the cap, limitation, and exception language in the current written compensation plan.",
    [
      "Infer the limit from the largest payment another employee received.",
      "Use the number of open opportunities as the maximum number of payable deals.",
      "Treat the highest tier threshold as the payment limit for the period.",
    ],
  ),
  item(
    "legacy-ch12-024",
    "Which evidence controls when a deal is attributed to an employee for compensation?",
    "The qualifying-event, timing, attribution, and documentation requirements in the applicable plan, matched to the deal record.",
    [
      "The earliest documented view date matched to the current lead-owner field.",
      "The first scheduled appointment date matched to the current calendar record.",
      "The contract signature date matched to the current acquisition record.",
    ],
  ),
  item(
    "legacy-ch12-025",
    "A lead closes long after the representative's original work. What is the correct way to review credit?",
    "Preserve the activity history and apply the plan's attribution, timing, ownership, and eligibility rules to the complete record.",
    [
      "Assign credit to the person who most recently opened the CRM record.",
      "Divide credit using the current team-participation record for the lead.",
      "Use the original qualification date as the only fact needed for the decision.",
    ],
  ),
  item(
    "legacy-ch12-029",
    "Which behavior makes an earnings forecast more reliable?",
    "Build it from documented pipeline stages, realistic conversion assumptions, and the current plan rather than treating every opportunity as earned.",
    [
      "Apply the top tier to all assigned leads before qualification begins.",
      "Count appointment requests and closed deals as the same type of result.",
      "Project the strongest documented week across the year as the performance baseline.",
    ],
  ),
  item(
    "legacy-ch12-031",
    "What evidence distinguishes a kept qualifying appointment from an appointment that was merely scheduled?",
    "The required appointment outcome and qualification details documented in the CRM under the plan's definition.",
    [
      "A calendar invitation that was created before the end of the calling block.",
      "A text message confirming that a time was proposed to the property owner.",
      "A pipeline note showing that the representative intended to schedule a call.",
    ],
  ),
  item(
    "legacy-ch12-032",
    "An appointment count crosses a possible milestone. What should happen before an incentive is recorded?",
    "Validate the qualifying events and apply the milestone rule from the plan effective for that measured period.",
    [
      "Record the incentive from the raw calendar count and validate attendance after payroll closes.",
      "Use the milestone applied to the acquisition team because both teams attend seller calls.",
      "Convert documented rescheduled appointments into qualifying events when a new time exists.",
    ],
  ),
  item(
    "legacy-ch12-034",
    "A deal closes near the boundary between two plan versions. Which timing question must be resolved first?",
    "Whether the plan assigns the deal to the earlier or later effective period under its timing definition.",
    [
      "Whether the seller first answered before or after the plan-version boundary.",
      "Whether the acquisition forecast was recorded before or after the boundary.",
      "Whether the employee first opened the lead before or after the boundary.",
    ],
  ),
  item(
    "legacy-ch12-035",
    "Why must a tiered calculation preserve the order and timing of qualifying events?",
    "Those facts may determine which tier applies and whether the plan recalculates earlier events.",
    [
      "Those facts determine the seller's repair budget and the acquisition team's offer amount.",
      "Those facts replace the need to verify whether each deal meets the eligibility definition.",
      "Those facts set the employee's role assignment for the next review period.",
    ],
  ),
  item(
    "legacy-ch12-037",
    "What should a compensation-plan graduation review accomplish?",
    "Confirm readiness, explain the current structure and documentation duties, and identify where questions or disputes are escalated.",
    [
      "Predict the employee's annual earnings from the strongest week of ramp performance.",
      "Authorize the employee to change CRM outcomes when a result misses a milestone.",
      "Replace the written terms with a simplified rate chosen by the reviewer.",
    ],
  ),
  item(
    "legacy-ch12-038",
    "A report lists many appointments. What audit should occur before a bonus calculation?",
    "Check each counted event against the plan's qualifying definition and reconcile it to the appointment and CRM records.",
    [
      "Check whether the total exceeds the representative's dial count for the same period.",
      "Check whether the current acquisition calendar shows capacity for the listed invitations.",
      "Check whether the average appointment duration matches the team's average talk time.",
    ],
  ),
  item(
    "legacy-ch12-039",
    "Which role normally builds the seller relationship and discovery record before the acquisitions handoff?",
    "The seller-facing representative assigned to the lead.",
    [
      "The acquisition manager before the representative has completed qualification.",
      "The finance reviewer who later reconciles compensation records.",
      "The marketing specialist who selected the original outreach audience.",
    ],
  ),
  item(
    "legacy-ch12-040",
    "Why should ramp compensation be reviewed separately from post-ramp compensation?",
    "The current plan may assign different components, eligibility conditions, or effective dates to the two periods.",
    [
      "Ramp results are stored outside the CRM and cannot be used in any later review.",
      "Post-ramp work is performed only by acquisitions and never involves seller-facing representatives.",
      "Ramp compensation is calculated from property values while post-ramp compensation is calculated from call duration.",
    ],
  ),
  item(
    "legacy-ch12-041",
    "Two deals closed in the same period. Which dataset supports their commission calculation?",
    "Both deals' eligibility, timing, ownership, and status records plus the applicable plan's rate and tier rules.",
    [
      "The two sellers' asking prices plus the representative's combined talk time.",
      "The team's total lead count plus the employee's number of scheduled follow-ups.",
      "The applicable market's repair estimates plus the acquisition manager's calendar availability.",
    ],
  ),
  item(
    "legacy-ch12-042",
    "A plan uses tiers. What should be checked before describing one tier as the maximum?",
    "Whether the current plan defines a highest tier, any additional tiers, and the period in which they apply.",
    [
      "Whether any employee has ever closed more deals than the named threshold.",
      "Whether the team's pipeline contains enough leads to reach the named threshold.",
      "Whether the named tier has the longest description in the training material.",
    ],
  ),
  item(
    "legacy-ch12-044",
    "A deal record has an incomplete handoff. What should happen before compensation attribution is decided?",
    "Correct or complete the record when possible, preserve the audit trail, and apply the plan's attribution and eligibility rules.",
    [
      "Assign full credit to the earliest person who contacted the seller and close the review.",
      "Remove the lead history so the acquisition outcome becomes the only evidence considered.",
      "Split credit evenly among the representative, manager, and acquisition owner.",
    ],
  ),
  item(
    "legacy-ch12-046",
    "Which reconciliation prevents double counting when deals and appointments both appear in one period?",
    "Classify each documented event once, apply the separate rules for each component, and trace the combined result back to source records.",
    [
      "Count the appointment and later deal as two events under a single current rate.",
      "Merge all events into one total and apply whichever calculation produces the larger result.",
      "Exclude appointment events associated with closed deals under the current combined review.",
    ],
  ),
  item(
    "legacy-ch12-047",
    "Why can a raw appointment count differ from the number used in an incentive calculation?",
    "The plan may require qualifying outcomes, documentation, timing, exclusions, or milestone treatment that the raw count does not show.",
    [
      "The raw count includes property values, while the incentive calculation uses repair estimates.",
      "The raw count is owned by acquisitions, while the current incentive calculation is owned by marketing.",
      "The raw count measures call duration, while the incentive calculation measures employee tenure.",
    ],
  ),
  item(
    "legacy-ch12-048",
    "A learner remembers a second appointment milestone from training. How should that memory be used?",
    "Treat it as a concept cue and verify the actual milestone in the plan effective for the measured period.",
    [
      "Apply it whenever the employee's calendar count is close to the remembered number.",
      "Apply it only to appointments scheduled during the final week of the period.",
      "Convert it into a commission tier when the related lead later closes.",
    ],
  ),
  item(
    "legacy-ch12-052",
    "The calendar and CRM disagree about an appointment outcome. What should a reviewer do before deciding incentive eligibility?",
    "Reconcile the source records, resolve the actual outcome, and apply the plan's qualifying-event definition.",
    [
      "Use the calendar's scheduled status as the final qualifying outcome.",
      "Use the CRM's most recent edit as the final qualifying outcome.",
      "Count the appointment under the current milestone and reconcile it next period.",
    ],
  ),
  item(
    "legacy-ch12-053",
    "What is the final control step in a multi-deal commission calculation?",
    "Reconcile the calculated result to the eligible deal records, governing plan version, tier logic, and reporting period.",
    [
      "Compare the result with the employee's preferred forecast and increase it to match when necessary.",
      "Compare the result with total pipeline value and use whichever figure is higher.",
      "Compare the result with the team's call volume and convert the difference into another deal.",
    ],
  ),
  item(
    "legacy-ch12-054",
    "Lead ownership is disputed before payroll review. What is the sound resolution path?",
    "Freeze assumptions, preserve the CRM evidence, and escalate the ownership and eligibility question through the plan's authorized process.",
    [
      "Give credit to the employee with the larger monthly forecast and update the record afterward.",
      "Use the current message record as the deciding evidence of lead ownership.",
      "Remove both employees from the lead so the acquisition owner receives the commission.",
    ],
  ),
  item(
    "legacy-ch12-055",
    "How does daily execution connect to compensation without turning every activity into earned pay?",
    "Daily work creates documented outcomes; only outcomes that meet the current plan's eligibility and attribution rules enter the compensation calculation.",
    [
      "A documented dial becomes payable when the current activity target is met.",
      "A documented qualified lead becomes a closed deal when the acquisition team accepts the handoff.",
      "A documented scheduled appointment earns an incentive when its calling-block task is complete.",
    ],
  ),
];

const V7_MISC_OVERRIDES = [
  item(
    "legacy-ch12-030",
    "What should determine whether an employee leaves ramp status?",
    "The current written plan's completion criteria and the employee's documented performance, confirmed through the authorized review.",
    [
      "Completion of the current course lessons plus the employee's preferred transition date.",
      "A current acquisition-team opening plus the manager's staffing forecast.",
      "The employee's first commission-eligible pipeline event under the current plan.",
    ],
  ),
  item(
    "legacy-ch12-051",
    "Which evidence best supports treating a deal as closed in a compensation review?",
    "The closing evidence required by the applicable plan, matched to the deal's documented final status.",
    [
      "The current signed contract alone, matched to a scheduled closing date.",
      "The completed acquisition handoff plus the seller's verbal acceptance.",
      "The approved offer record plus a projected transaction-completion date.",
    ],
  ),
  item(
    "legacy-ch13-010",
    "Which behavior demonstrates readiness to support newer teammates without assuming a promised level or title?",
    "Sharing proven lead-management practices while remaining accountable for current-role results.",
    [
      "Taking over a new teammate's assigned leads to demonstrate advanced ownership.",
      "Evaluating the teammate against the employee's current personal workflow.",
      "Assigning corrective tasks from the current scorecard before manager review.",
    ],
  ),
];

// Learner-facing correct options are deliberately shorter than the explanatory
// feedback. This prevents "pick the longest option" from becoming a reliable
// strategy while retaining the full rationale after the learner answers.
const POLICY_SAFE_CORRECT_ANSWERS = new Map([
  ["legacy-ch11-008", "Escalate the document conflict and confirm the target in the current approved operating plan."],
  ["legacy-ch11-013", "Compare it with the same-role, same-period KPI definition and target."],
  ["legacy-ch11-014", "Verify matching definitions, inputs, reporting window, and approved target."],
  ["legacy-ch11-019", "The same-period counts built from the current definitions of both events."],
  ["legacy-ch11-024", "The approved KPI plan plus the underlying offer and contract records."],
  ["legacy-ch11-029", "The current quality-conversation definition and target for the role."],
  ["legacy-ch11-030", "Because a shared definition makes different people's counts comparable."],
  ["legacy-ch11-031", "The approved target and definition plus that day's documented results."],

  ["legacy-ch12-001", "Training explains the compensation components; the current written plan supplies the employee's binding terms."],
  ["legacy-ch12-002", "It provides income while the employee learns the role and develops a pipeline, subject to the plan."],
  ["legacy-ch12-003", "The example illustrates a concept; the current plan controls the actual terms."],
  ["legacy-ch12-004", "The applicable ramp criteria plus documented results for the employee's measured review period."],
  ["legacy-ch12-005", "Meeting the criteria and confirming the transition under the current plan."],
  ["legacy-ch12-006", "A traceable CRM history showing sourcing, qualification, follow-up, and handoff activity."],
  ["legacy-ch12-007", "The acquisition team receiving the qualified lead handoff."],
  ["legacy-ch12-008", "The deal's eligibility and timing records plus the applicable commission-rate and tier terms."],
  ["legacy-ch12-009", "The approved version covering the employee, role, and measured period."],
  ["legacy-ch12-010", "The threshold selects the applicable tier; its rate controls the resulting commission calculation."],
  ["legacy-ch12-011", "The documented qualifying results measured against the applicable tier definition."],
  ["legacy-ch12-012", "The applicable tier's rate and calculation terms for the transaction period."],
  ["legacy-ch12-013", "Separate supported results from pipeline opportunities, then apply current terms."],
  ["legacy-ch12-014", "The applicable tier's rate, eligibility, timing, and calculation terms."],
  ["legacy-ch12-015", "The plan's tier-ordering and retroactivity terms for the measured period."],
  ["legacy-ch12-016", "Identify the eligible deals, apply the governing tier and timing rules, and reconcile all source records."],
  ["legacy-ch12-017", "An appointment milestone uses qualifying appointment events; a commission tier uses documented qualifying deals."],
  ["legacy-ch12-018", "The amount, qualifying-event definition, milestone rule, eligibility conditions, and effective date."],
  ["legacy-ch12-019", "Because the plan may require a defined event and CRM evidence beyond scheduling."],
  ["legacy-ch12-020", "The documented qualifying-event count and the applicable milestone or calculation rule."],
  ["legacy-ch12-021", "Use it to demonstrate the method, then apply current terms to documented facts."],
  ["legacy-ch12-022", "Evaluate each compensation component under its own rules, then combine only the supported results."],
  ["legacy-ch12-023", "The current plan's cap, limitation, and exception terms for that period."],
  ["legacy-ch12-024", "The deal record matched to the plan's attribution, timing, and evidence rules."],
  ["legacy-ch12-025", "Preserve the history and apply the plan's attribution and ownership rules."],
  ["legacy-ch12-029", "Use documented stages, realistic conversions, and the current plan."],
  ["legacy-ch12-030", "The current plan's completion criteria and documented performance, confirmed through review."],
  ["legacy-ch12-031", "A record of the required outcome and qualification details in the CRM."],
  ["legacy-ch12-032", "Validate the documented qualifying events and apply the effective milestone rule for that measured period."],
  ["legacy-ch12-034", "Whether the plan assigns the deal to the earlier or later period under its timing rules."],
  ["legacy-ch12-035", "Those timing facts may determine the applicable tier and treatment of earlier events."],
  ["legacy-ch12-037", "Confirm readiness, current terms, documentation duties, and escalation paths."],
  ["legacy-ch12-038", "Check whether each counted event matches the qualifying definition and source records."],
  ["legacy-ch12-039", "The seller-facing representative assigned to the lead."],
  ["legacy-ch12-040", "The two periods may use different components, conditions, or effective dates."],
  ["legacy-ch12-041", "The eligibility, timing, and status of both deals plus the applicable rate and tier rules."],
  ["legacy-ch12-042", "Whether the current plan defines additional or higher tiers for that period."],
  ["legacy-ch12-044", "Complete the record, preserve the audit trail, and apply the attribution rules."],
  ["legacy-ch12-046", "Classify each event once, apply separate rules, and trace the combined result."],
  ["legacy-ch12-047", "The raw count omits qualifying outcomes, documentation, timing, exclusions, and milestone treatment."],
  ["legacy-ch12-048", "Use it as a concept cue and verify the effective plan's actual milestone."],
  ["legacy-ch12-051", "The plan-required closing evidence matched to the deal's documented final status."],
  ["legacy-ch12-052", "Reconcile the records, resolve the outcome, and apply the qualifying-event definition."],
  ["legacy-ch12-053", "Compare the result with eligible deals, tier logic, plan version, and reporting period."],
  ["legacy-ch12-054", "Preserve the complete CRM evidence and use the plan's authorized ownership-review process."],
  ["legacy-ch12-055", "A documented outcome enters the calculation only when it meets the plan's rules."],

  ["slot-module-18-006", "The approved playbook or scorecard for the current role and period."],
  ["slot-module-18-009", "The actual count and approved target must share the same block, period, and counting definition."],
  ["slot-module-18-011", "Send the approved text, record it in the CRM, and resume calling."],
  ["slot-module-18-013", "It aligns documented activity with the approved expectation and definition for that period."],
  ["slot-module-18-015", "The full-day activity records and the approved target using its defined counting method."],
  ["slot-module-18-018", "A set of CRM and activity records satisfying the plan's defined requirements."],

  ["legacy-ch13-001", "Reliable capability and documented results demonstrated in the current assigned role."],
  ["legacy-ch13-002", "Apply current standards, maintain accurate records, and improve through feedback."],
  ["legacy-ch13-005", "The current written criteria that apply to the employee's review."],
  ["legacy-ch13-006", "Because advancement also requires current criteria, documented capability, and authorized review."],
  ["legacy-ch13-010", "Sharing proven lead-management practices while remaining accountable for current-role results."],
  ["legacy-ch13-012", "The authorized offer or plan issued for that role and effective period."],
  ["legacy-ch13-013", "An authorized, documented change to the employee's role."],
  ["legacy-ch13-015", "As subject to that role's current written plan, eligibility conditions, and actual results."],
  ["legacy-ch13-016", "Use approved learning, practice, feedback, and readiness criteria."],
  ["legacy-ch13-018", "To build capability for supporting people and outcomes in an authorized role."],
  ["legacy-ch13-019", "Check the current role plan and authorized procedures for the actual ownership boundary."],
  ["legacy-ch13-020", "It is in the authorized plan for the employee's role and effective date."],
  ["legacy-ch13-022", "Use the current criteria and ask the authorized reviewer."],
  ["legacy-ch13-023", "By showing documented results against the current scorecard across the review period."],
  ["legacy-ch13-029", "It may support consideration under current criteria and business needs."],
  ["legacy-ch13-030", "A documented assignment or role change under the current role plan."],
  ["legacy-ch13-033", "Capability evidence and completion of the authorized review under current criteria."],
  ["legacy-ch13-036", "By comparing current leadership responsibilities with documented team outcomes."],
  ["legacy-ch13-041", "Responsibilities assigned in the current written manager role plan."],
  ["legacy-ch13-043", "Study current market data and comparable deals, test interpretations, and use feedback."],
  ["legacy-ch13-047", "Practice listening and empathy, role-play escalation scenarios, and apply current role standards."],
]);

export const POLICY_SAFE_OVERRIDES = new Map(
  [...OVERRIDES, ...COMPENSATION_OVERRIDES, ...V7_MISC_OVERRIDES].map(([recordId, override]) => [
    recordId,
    {
      ...override,
      correctAnswer: POLICY_SAFE_CORRECT_ANSWERS.get(recordId) ?? override.explanation,
    },
  ]),
);
