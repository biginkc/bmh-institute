# Module Tech Stack - Lesson TECH-A "Tech Stack" scene cards

Stage: Stage 1 text storyboard only. No audio, stills, clips, renders, or Remotion code should be generated until Jarrad approves this storyboard.

Position: plays after Terms Glossary and before Module 02 Lesson 2A "Who Sells to Us".

Source of truth: `~/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md`, section `## Slot 03 — Tech Stack (Ch8)`. The storyboard below covers all 44 cues in order and keeps the VO verbatim.

Bookend avatar proposal: use the existing office Andrea avatar (`63396931e03943f19c7261cdc675e623`) for b01 and b17. This is the lowest-risk fit because this lesson is a systems walkthrough, not a coffee-shop coaching conversation. If Jarrad wants a fresher look, create a new "Andrea at the systems desk" bookend avatar after storyboard approval.

Scope call: the source is 44 cues and about 6:32 by the SRT. It is slightly over the nominal 3-6 minute target but still works as one walkthrough because it is a single tool-stack map and the master outro already tees up 2A. Optional A/B split if Jarrad wants a shorter runtime: TECH-A cues 1-23, from opener through Deal Sniper, then TECH-B cues 24-44, from DialPad through Google Drive and the 2A bridge. This storyboard does not apply the split unless Jarrad approves it.

Visual rules for this lesson:
- Locked style: flat sticker-sheet doodle on cornflower blue `#62b3f3`, thick wobbly black outlines, flat yellow, orange, cream, white, and black fills only, no gradients, no shadows, no skin tones, no ambient doodles.
- Tool screens are abstract doodle UI panels only: blank header bars, blank rows, blank buttons, chart shapes, and icon-like blocks. No generated words, letters, numerals, app logos, or readable UI text inside AI art. (This lesson is the deliberate exception to the 2026-07-09 baked-text default of scene-card-v2.md rule 1f: tool names are carried by the REAL logo overlay system, not doodle-lettered fakes, and fake readable app UI is banned for content safety. Any non-UI static prop text follows rule 1f and gets baked.)
- On-screen English text = word-timed bottom-center Sticker pop-ins + the transcript-timed logo overlays only, per scene-card-v2.md rules 1e/1f (2026-07-09).
- Opening beat b01 has no text labels or stickers of any kind. BMH badge only.
- Transient labels are bottom-center by default, one visible at a time. The previous label clears before the next appears.
- **LOGO CUTAWAYS (REVISED Jarrad 2026-07-10, supersedes the corner-overlay plan):** each tool gets a full-frame DOODLE-STYLE LOGO CARD — a hand-drawn wobbly replica of the real logo (generated with the actual PNG from `course-assets/logo-callouts/techstack-v3-actual-no-box/` as the identity ref). On the tool's first meaningful spoken mention (word timestamp), straight cut to its logo card, hold ~8 seconds, straight cut back to the relevant scene. One cutaway per tool: b03 Sandra, b06 PropStream, b07 DealMachine, b08 Deal Sniper, b09 DialPad, b11 Closer Lab, b14 Slack, b13 HubStaff, b15 BMH Institute, b16 Google Drive. (ASSEMBLY DEVIATION 2026-07-10: Slack moved b12→b14 — b12's passing mention lands 0.5s before that beat's VO ends, leaving room for only a 1.5s flash; b14 is Slack's topical intro and fits the full ~8s hold. The b14 `SLACK` name sticker is dropped as redundant with its own full-frame card, as are the other nine tool-name stickers that coincide with their own cutaway.) The Remotion corner-overlay system is shelved (assets kept). Rule-1e-clean: code only places the card and cuts.
- Hard Remotion boundary: Remotion is only for text/logo pop-ins, code overlays, and transitions between approved stills/clips. Do not use Remotion to create or animate the main scene visuals. Any scene-content motion described below must be handled by the approved BMH visual pipeline/assets, not code-drawn Remotion scenes.
- Camera-travel slides are only for true location moves between distinct tool stations on the blue plane. Same-tool detail beats and diagram-to-diagram changes use straight cuts or approved scene animation, not slides.

## v4 REVISIONS (Jarrad watch-through redlines, 2026-07-10 — supersede conflicting text below)
1. **Real brand colors for logos/product UIs (GLOBAL):** logo cards and real-product UI sketches use the referenced product's EXACT own colors; the course palette is completely disregarded for logo/UI art ("use the colors from the logo, don't invent colors" — HubStaff and Google Drive called out; DealMachine earlier). Scenes otherwise keep the course palette. This narrows line 15's abstract-blank-panels rule: recognizable product UIs ARE now allowed as doodle sketches with pseudo-text (never readable words).
2. **Logo-first beats (GLOBAL):** every software beat OPENS on its full-frame logo card (frame 0, ~8s hold, cut to scene). The word-timed cutaway start is dropped — no 0.5–1s scene flash before the logo.
3. **Sandra = the robot mascot:** no abstract CRM dashboards anywhere. Sandra beats show the Sandra robot mascot (canonical: Sandra repo `public/brand` flying robot; blue/navy/coral/yellow, exempt from course palette) doing things, with BMH reps incl. Priya. The Sandra logo card = waving robot + SANDRA wordmark (robot to be animated in a later pass).
4. **b04+b05 MERGED into one beat** (b05 was too short to stand alone): reps queue up handing lead folders to robot Sandra, who files them into an open chest compartment (alt take: swallows them). Replaces the cards/columns/filing-cabinet visual ("LOG NOTES" still didn't work).
5. **b02 hub** → outlined tile grid of the ten ACTUAL product logos in true colors.
6. **b06 PropStream** → Google-Sheets-style doodle spreadsheet of pseudo-lead rows (his placement call: PropStream, not Google Drive).
7. **b08 Deal Sniper** → funnel cards become mini property profiles (house thumbnail + pseudo-text lines).
8. **b09 DialPad** → doodle sketch of the real Dialpad inbox UI (dark surface, purple-pink accents, unread rows/badges) per Jarrad's screenshot, real Dialpad colors.
9. **b10 coaching** → remove the three meaningless desk blocks; keep manager + Priya + table; ONE chart panel between them.
10. **b11 Closer Lab** → doodle sketch (course style) of Jarrad's speech-coach laptop screenshot: video panel, transcript block, insights sidebar with feedback rows.
11. **b12 tasks** → robot Sandra holds/presents the task checklist (checkboxes, one ticked, orange flag row) + small chat-bubble helper card.

## Storyboard

### b01_open_tools - cues 1-2

VO:
"Now let's talk tech. These are the tools you'll use daily.

Before you start making calls or sending messages to homeowners, I want to walk you through the tools we use every single day."

Andrea mode: `hero-solo` with proposed office Andrea, BMH badge lower-right.

Visual direction: full-frame office Andrea on the cornflower blue course background, standing at a clean doodle systems desk. Behind her is a semicircle of abstract app panels and simple tool icons: a phone shape, blank CRM board, blank map card, blank chat bubbles, blank clock card, and blank folder card. All panels have empty headers and empty rows only. No readable text, no app logos, no numerals, no title card, no floating labels. The BMH badge is the only overlay.

Motion and transition: true opener fade in only. Andrea speaks calmly with low hand motion. Straight cut to b02 because the next beat is a diagram, not a new physical scene.

Text via Sticker: none. Clean opener rule.

### b02_why_stack_matters - cues 3-5

VO:
"Understanding our tech stack is not optional. These tools are how we stay organized, how we track deals, how we communicate as a team, and how we grow.

If you use them the right way they will make your job a lot easier. If you skip steps or try to work around them things will fall through the cracks and deals will get lost.

So let me walk you through each one and tell you exactly what it does and why it matters here at the BMH Group."

Andrea mode: `voice-only`.

Visual direction: centered tool-stack hub on blue. A simple orange hub shape sits in the middle with five blank abstract panels around it: a deal card, phone card, chat card, checklist card, and growth arrow card. White connector lines show the tools working together. Keep it graphic and clean, like a sticker-map, with no readable text in the art. The "fall through the cracks" line is shown by one blank lead card nearly slipping between two rounded white platform tiles, without drama or clutter.

Motion and transition: approved scene animation can reveal panels one by one as Andrea names what the tools do. No camera-travel slide because this is a diagram beat. Remotion is limited to labels/logos only.

Text via Sticker: bottom-center queue, one at a time: `STAY ORGANIZED` on "organized"; `TRACK DEALS` on "track deals"; `TEAM COMMUNICATION` on "communicate"; `TOOLS MATTER` on "matters".

### b03_sandra_center - cues 6-7

VO:
"The first tool is Sandra. This is our CRM and it is the center of everything we do at the BMH Group.

Every lead we generate, every homeowner we talk to, every deal we are working lives inside Sandra."

Andrea mode: `corner-circle`, lower-right.

Visual direction: camera arrives at the Sandra station, a large abstract CRM dashboard drawn as a white rounded panel on blue. The panel contains blank lead cards, a blank homeowner profile card, a blank deal pipeline column, and simple house icons. A few blank cards connect to a homeowner doodle and a small deal folder. No generated "Sandra", "CRM", column names, or card text inside the art.

Motion and transition: camera-travel slide in from b02 because this is a move from overview map to the Sandra station. Subtle push-in on the CRM panel. Andrea corner circle stays clear of the lower-right pocket.

Text via Sticker: bottom-center queue: `SANDRA CRM` on "Sandra"; `CENTER OF EVERYTHING` on "center"; `LEADS LIVE HERE` on "Every lead".

### b04_sandra_workflow - cues 8-10

VO:
"When you get a new lead it goes into Sandra. When you have a conversation with a homeowner you log notes in Sandra.

When a deal moves from one stage to the next you update it in Sandra. Think of it as the single source of truth for our entire operation.

If it is not in Sandra it does not exist. That is the standard we hold ourselves to here."

Andrea mode: `voice-only`.

Visual direction: same Sandra station, tighter view. Three oversized blank CRM cards move left to right across simple blank columns. A blank note card attaches to a homeowner call bubble, then a deal card advances one stage. The final frame shows the CRM panel as a sturdy central filing cabinet with a few blank deal folders tucked inside. No readable text, no stage names, no UI labels baked into the art.

Motion and transition: straight cut from b03 because this is the same location and same tool. Any card movement must come from an approved animated clip or approved still treatment, not a Remotion-built scene.

Text via Sticker: bottom-center queue: `NEW LEAD` on "new lead"; `LOG NOTES` on "log notes"; `UPDATE THE STAGE` on "update"; `SINGLE SOURCE OF TRUTH` on "single source"; `IF IT IS NOT IN SANDRA, IT DOES NOT EXIST` on "does not exist".

### b05_sandra_non_negotiable - cue 11

VO:
"There's more to Sandra than we'll cover today — when you start working with real leads, the team will walk you through the parts that matter for your role. For now, just understand: this tool is non-negotiable."

Andrea mode: `corner-circle`, lower-right.

Visual direction: Sandra station stays on screen but calms down into a clean training handoff image. A BMH rep and a new learner stand beside a large blank CRM panel while the rep points to three blank highlighted areas. The learner holds a simple blank notepad. The scene communicates "team walkthrough later" without showing a full app tutorial. Keep the panel abstract and empty of words.

Motion and transition: straight cut from b04. Light Seedance-style idle later if approved: rep pointing gently, learner nodding. No slide because it remains the Sandra station.

Text via Sticker: bottom-center queue: `TEAM WALKTHROUGH LATER` on "walk you through"; `NON-NEGOTIABLE` on "non-negotiable".

### b06_propstream_data - cues 12-16

VO:
"Next is PropStream. This is how we find motivated sellers. PropStream gives us access to property data across the country.

We use it to pull lists of distressed homeowners. That includes people who are behind on taxes, people going through probate.

Properties with code violations, absentee owners and more. When your manager gives you a list, it came from PropStream.

It is also how we look up property details to understand what a house might be worth and what kind of situation the owner is likely in.

If Sandra is where we manage our relationships then PropStream is where we find them in the first place."

Andrea mode: `voice-only`.

Visual direction: camera moves to a property-data station. A blank U.S.-map-like panel, blank property table, and house cards sit on a desk. Little dotted lines flow from a map panel to a stack of blank lead cards, then to a single house profile with simple icon rows. Use abstract shapes only. No readable map labels, city names, property text, tax labels, or app branding in the art.

Motion and transition: camera-travel slide from Sandra to PropStream because this is a new tool station. Approved scene animation can show blank list cards pulling from the map, then one card enlarging into a property profile.

Text via Sticker: bottom-center queue: `PROPSTREAM` on "PropStream"; `PROPERTY DATA` on "property data"; `MOTIVATED SELLERS` on "motivated sellers"; `FIND THEM FIRST` on "find them".

### b07_dealmachine_pipeline - cues 17-20

VO:
"DealMachine is another tool we use to source leads. Where PropStream is from your desk, DealMachine is built around driving for dollars.

That means going through neighborhoods and flagging properties that look vacant, neglected or distressed.

DealMachine lets you tag those properties, pull owner information and drop them directly into a marketing campaign.

For our team this tool is part of how we keep a steady pipeline of leads coming in. You need to know how it fits into our process."

Andrea mode: `voice-only`.

Visual direction: camera moves from desk-data to neighborhood-sourcing. A simple doodle car travels along a curved street on the blue plane. Houses are flat cream and white shapes. A few houses have tiny blank flag icons and simple distress cues like a tilted mailbox or overgrown line pattern, but no scary decay, no extra clutter, and no readable signs. A blank mobile panel shows an empty property card flowing into a blank campaign tray.

Motion and transition: camera-travel slide from PropStream to the neighborhood station. Later motion should come from approved animation/still handling, not code car drift. Avoid walk-cycle traversal.

Text via Sticker: bottom-center queue: `DEALMACHINE` on "DealMachine"; `DRIVING FOR DOLLARS` on "driving for dollars"; `TAG THE PROPERTY` on "tag"; `STEADY PIPELINE` on "steady pipeline".

### b08_deal_sniper_speed - cues 21-23

VO:
"Deal Sniper is a tool we use to generate offers quickly and reliably. Speed is important. The more offers you send the greater your chances of transacting a deal. It helps us filter and evaluate properties.

So we can move fast when a good deal shows up. In this business speed matters. When a homeowner is motivated they need to move quickly.

We need to be ready to make an offer without wasting their time or ours. Deal Sniper helps us make confident decisions fast."

Andrea mode: `voice-only`.

Visual direction: camera moves to an offer-decision station. A blank offer calculator panel, a simple filter funnel, and three blank property cards sit on a clean desk. One property card passes through the funnel and lands beside a blank offer sheet. A stopwatch icon reinforces speed, but it has no numerals. The art should not show dollar amounts, offer figures, property data, or any readable UI.

Motion and transition: camera-travel slide from neighborhood to offer station. Approved scene animation can show property cards filtering one by one, with the final card landing cleanly.

Text via Sticker: bottom-center queue: `DEAL SNIPER` on "Deal Sniper"; `MOVE FAST` on "move fast"; `READY TO MAKE AN OFFER` on "ready"; `CONFIDENT DECISIONS` on "confident decisions".

### b09_dialpad_calls - cues 24-25

VO:
"Now let's talk about DialPad. This is our phone system. All outbound calls to homeowners go through DialPad.

It records calls, logs your activity and keeps everything organized. Your calls are being recorded."

Andrea mode: `corner-circle`, lower-right.

Visual direction: camera moves to the call station. A large blank phone console panel sits beside a headset, waveform strip, and simple call log stack. A small recording dot can be a plain orange circle with no letters. The call log panel has blank rows only. No phone numbers, no contact names, no app text, no DialPad logo, no readable button labels.

Motion and transition: camera-travel slide from offer station to phone station. Subtle waveform movement should come from approved scene animation if used. Andrea corner circle stays out of the console area.

Text via Sticker: bottom-center queue: `DIALPAD` on "DialPad"; `PHONE SYSTEM` on "phone system"; `CALLS RECORDED` on "recorded"; `ACTIVITY LOGGED` on "logs your activity".

### b10_dialpad_coaching - cues 26-28

VO:
"That is not there to watch over your shoulder. It is there so we can coach you and help you get better.

When your manager listens to your calls and gives you feedback that feedback is coming from real conversations you had.

DialPad is also how we track your call volume. How many calls you made and how long you were on the phone are all visible. Show up and make your dials."

Andrea mode: `voice-only`.

Visual direction: same call station, now a coaching review. A manager and rep sit side by side at a desk looking at a blank waveform and blank call cards. The mood is supportive, not surveillance. A blank volume stack and blank duration bar are visible but contain no numbers. Keep it grounded and clean. No over-the-shoulder spy imagery.

Motion and transition: straight cut from b09 because this is the same DialPad station. Small manager point and rep nod are acceptable later. Avoid a busy dashboard.

Text via Sticker: bottom-center queue: `COACHING` on "coach"; `REAL CONVERSATIONS` on "real conversations"; `CALL VOLUME` on "call volume"; `MAKE YOUR DIALS` on "make your dials".

### b11_closer_lab_practice - cues 29-31

VO:
"Closer Lab is an AI speech coaching tool. We use it specifically for training and role play.

Before you ever get on the phone with a real homeowner you are going to practice in Closer Lab with an AI roleplay agent. It listens to how you speak.

It gives you feedback on things like filler words, pacing, clarity, and confidence. It lets you practice without the pressure of a live call. You are going to use Closer Lab to work through objection role plays and call simulations. Take it seriously. Put in the reps."

Andrea mode: `voice-only`.

Visual direction: camera moves to a training booth station. A learner with a headset speaks toward an abstract AI roleplay panel. The panel shows a simple blank avatar silhouette, blank feedback rings, and blank score bars with no text or numbers. A practice mat or rep counter can be shown as empty card slots. No generated "AI", scores, rubric labels, transcript words, or app branding in the art.

Motion and transition: camera-travel slide from phone station to training booth because this is a new practice location. Feedback-ring motion, if used, belongs in the approved scene animation/still treatment, not Remotion.

Text via Sticker: bottom-center queue: `CLOSER LAB` on "Closer Lab"; `PRACTICE FIRST` on "practice"; `FEEDBACK` on "feedback"; `PUT IN THE REPS` on "reps".

### b12_sandra_tasks - cues 32-35

VO:
"Tasks live in Sandra too. If your manager assigns you something, it will be in Sandra.

If there is a follow-up that needs to happen, it gets logged in Sandra. If there is a process or a checklist to work through, you will find it there as well.

We use those task lists to make sure nothing gets dropped. In this business organization is everything.

Check your task list every day. Complete your tasks on time. If something is blocked or you need help, flag it to your manager in Slack."

Andrea mode: `corner-circle`, lower-right.

Visual direction: camera returns to Sandra but focuses on tasks instead of deals. A blank task list panel has empty checkboxes, blank due-card shapes, and a blank follow-up card. A small Slack-style chat bubble panel sits off to the side as an abstract helper channel, with no text. One task card gets a tiny orange flag to show "blocked". No generated task names, dates, names, or chat messages.

Motion and transition: camera-travel slide back to the Sandra task station because this is a tool-location move. Checkmark movement, if used, belongs in the approved scene animation/still treatment; Remotion handles only labels/logos.

Text via Sticker: bottom-center queue: `TASKS LIVE IN SANDRA` on "Tasks"; `NOTHING GETS DROPPED` on "dropped"; `CHECK DAILY` on "every day"; `FLAG BLOCKERS IN SLACK` on "blocked".

### b13_hubstaff_time - cues 36-37

VO:
"HubStaff is our time tracking tool. When you are working you are clocked into HubStaff. It tracks your hours and activity.

It helps us make sure you are getting paid accurately for the hours you put in. Clock in when you start. Clock out when you stop. It matters."

Andrea mode: `voice-only`.

Visual direction: camera moves to the timekeeping station. A blank time clock panel sits beside a simple timesheet card, a start/stop button pair with no words, and a clean pay envelope icon. The scene should feel practical and trustworthy, not punitive. No generated times, dollar amounts, usernames, screenshots, or button labels in the art.

Motion and transition: camera-travel slide from Sandra tasks to timekeeping station. Clock-hand or card-flip motion, if used, belongs in approved scene animation/still treatment.

Text via Sticker: bottom-center queue: `HUBSTAFF` on "HubStaff"; `CLOCK IN` on "Clock in"; `CLOCK OUT` on "Clock out"; `ACCURATE HOURS` on "accurately".

### b14_slack_team - cues 38-39

VO:
"Slack is how we communicate as a team. Email is not how we operate. If you need to reach your manager, do it in Slack. Keep notifications on.

Slack is also where we share wins, updates and team announcements so staying active keeps you connected to the business."

Andrea mode: `voice-only`.

Visual direction: camera moves to the team communication station. A large blank chat board has stacked speech bubbles with no text, a simple manager avatar, and a team update column with blank cards. Show a small notification bell icon, but no numbers or badges. Avoid confetti, hearts, sparkles, or decorative noise. The point is a clean team channel.

Motion and transition: camera-travel slide from timekeeping station to team communication station. Approved scene animation can reveal chat bubbles one at a time.

Text via Sticker: bottom-center queue: `SLACK` on "Slack"; `REACH YOUR MANAGER` on "manager"; `KEEP NOTIFICATIONS ON` on "notifications"; `STAY CONNECTED` on "connected".

### b15_bmh_institute_training - cues 40-41

VO:
"BMH Institute is our training platform and it is where you are right now. All of your onboarding training lives here. Work through the modules in order.

Each lesson builds on the one before it and there are quizzes to make sure the material is sticking. Your progress is tracked for your manager."

Andrea mode: `corner-circle`, lower-right.

Visual direction: camera moves to the training platform station. A blank learning-path panel shows simple module tiles, a quiz card, and a progress path climbing upward. The current lesson tile can be highlighted as a blank yellow rectangle, but it must have no readable text or numbers baked in. Keep the layout abstract enough to avoid depicting the real app UI.

Motion and transition: camera-travel slide from Slack station to training station. Approved scene animation can show module tiles building in order.

Text via Sticker: bottom-center queue: `BMH INSTITUTE` on "BMH Institute"; `MODULES IN ORDER` on "in order"; `QUIZZES` on "quizzes"; `PROGRESS TRACKED` on "progress".

### b16_google_drive_docs - cues 42-43

VO:
"Finally we use Google Docs for documentation. SOPs, scripts, templates, and reference materials all live here. Get comfortable in Google Drive.

We share documents as you move through onboarding. Bookmark the documents that are most relevant to your daily work. Please ask your team lead how to locate specific SOPs or Standard Operating Procedures for the applications and tools we've discussed."

Andrea mode: `voice-only`.

Visual direction: camera moves to the documentation station. A clean folder shelf holds blank document cards, blank binder tabs, and a simple bookmark ribbon. A team lead character points to a blank SOP binder while a learner holds a blank folder. No Google logo, no document titles, no SOP words, no scripts text, no folder names baked into the art.

Motion and transition: camera-travel slide from training station to documentation station. Approved scene animation can cascade blank document cards. Keep motion simple and readable.

Text via Sticker: bottom-center queue: `GOOGLE DRIVE` on "Google Drive"; `SOPs` on "SOPs"; `SCRIPTS` on "scripts"; `BOOKMARK WHAT MATTERS` on "Bookmark"; `ASK YOUR TEAM LEAD` on "team lead".

### b17_recap_bridge_to_2a - cue 44

VO:
"We covered a lot. These are the most important tools used in the BMH Group tech stack. They work together to help us find deals, manage leads, and communicate as a team. We invested in them because when we use them the right way we close more deals and serve homeowners better. Take notes, ask questions, and let's get to work — up next, we'll talk about the people behind those leads."

Andrea mode: `hero-solo` with proposed office Andrea.

Visual direction: return to office Andrea at the systems desk. The abstract tool stations from the lesson now appear as a clean connected row behind her: CRM board, property data map, neighborhood sourcing card, offer card, phone console, practice booth, task list, time clock, chat board, training path, and docs folder. All panels are blank, icon-like, and text-free. As the VO turns toward the next lesson, the connected row leads visually to a simple group of homeowner/seller character silhouettes in the distance, previewing the "people behind those leads" without introducing 2A's full seller grid yet.

Motion and transition: camera-travel slide from documentation station back to the office bookend because this is a true location move. End with a clean hold on Andrea and the connected tool row. Fade out only at the true close.

Text via Sticker: bottom-center queue: `WORK TOGETHER` on "work together"; `FIND DEALS` on "find deals"; `MANAGE LEADS` on "manage leads"; `COMMUNICATE AS A TEAM` on "communicate"; `NEXT: WHO SELLS TO US` on "people behind those leads".

## Stage 1 gate

Stop here for Jarrad approval. Do not generate audio, stills, clips, avatars, or renders from this storyboard until approved.

## v4 gate round-2 decisions (Jarrad 2026-07-10, final)
- Sandra logo card = SPACE EDITION approved (login-page navy + shooting-star streaks + white wordmark + flying robot). Card is exempt from the cornflower-blue background rule and from canonical-blue QC sampling.
- b03 approved grounded, with one final note: composition CENTERED (no empty side). b03 is now ANIMATED: the lead cards drift one by one from Priya's palm into the robot's hands, both characters gentle idle. Plays after the 8s Sandra card opens the beat.
- b04 single-rep still approved. Animation = sequential cycle, never more than one rep on screen: rep hands folder → robot files it in chest compartment → rep exits left → next rep enters → … → loop closes on the start pose.
- Everything else on the round-2 gate approved as-is.

## v5 REVISIONS (Jarrad watch-through of v4, 2026-07-10 — two additive batches, transcript-verified)
1. **Brand backgrounds on ALL logo art (grid tiles + full-frame cards; his confirmed scope):** Sandra navy space `#16234f` · PropStream orange · DealMachine teal `#56C1C6` w/ WHITE text (his attached frame) · Deal Sniper deep blue · Dialpad EXACT official dark frame (plum-black `#160B2E`, white lowercase wordmark, light-purple diamond — his attachment) · Closer Lab peach-cream · Slack aubergine `#4A154B` · Hubstaff EXACT official frame (deep navy + multicolor wavy bottom stripe — his attachment) · BMH Institute orange · Google Drive dark charcoal. NO white squares anywhere, especially behind white text.
2. **Logo cards bypass the builder's background-normalizer** (it was flattening the Sandra navy card to cornflower — the 0:43 bug).
3. **Sandra card ANIMATED:** robot ~stationary, starfield streaking past toward lower-left (she reads as flying toward the upper-right at lightning speed); plays during the 8s hold.
4. **b03 rebuilt from scratch:** robot far left, Priya far right holding a FOLDER of leads; they walk toward each other, meet in the middle, she hands lead sheets from the folder; multi-angle/multi-shot clip; holds its own last frame (no loop, unclamped end).
5. **GLOBAL loop rule (permanent):** no freeze-into-zoom holds; clamped clips LOOP for their entire beat (b04 compartment cycle explicitly loops the whole merged narration); unclamped clips hold their exact last frame via Freeze. Tail-still system deleted.
6. **b07:** phone + inbox-tray removed; car now drives INTO view and OFF frame (loopable re-entry).
7. **b14:** the four blank squares + notification bell column removed (chat board + bubbles + avatar only); clip regenerated.
8. **b17 close tightened:** 2.0s post-VO hold, close-fade starts right after the final label pops — no frozen hero.

## v5 render QC fixes (r1–r4, 2026-07-10, self-QC — no art changes)
- **r2→r3:** b04 + b14 loop seams failed the render sweep (Seedance end-clamp approximate, Δ≈6/Δ≈2.4) → clips preprocessed into crossfade loops (0.4s xfade of the head back over the tail), offline-verified.
- **r4 — seam-measurement correction:** the PNG-pair seam check was unreliable (ffmpeg seek rounding could grab the same frame twice → false 0.00 PASS). Replaced with a single-pass full-render `signalstats` YDIF timeline. That exposed real restart pops on **b02 (6.6), b06 (2.9), b07 (6.2 — car teleported from mid-street back to start), b16 (3.0)**; b04 (1.6) and b14 (1.3) confirmed fixed. All four re-cut as crossfade loops; b07 re-cut to loop at its empty-street window (main = clip[0.4s–10.5s], head = first 0.45s, so the car fades in at the curb — reads as an arrival). Offline seams 0.30–0.70, all PASS.
- **r4 — b17 audio fix (whisper-diff catch):** the b17 TTS text carried a markdown paste artifact — ` ``` # Section B — Who We Serve` — spoken as "Number. Section B. Who we serve." at the very end of the lesson (present in every prior version; caught by the new mandatory transcript diff). Text fixed, b17.wav regenerated (27.1s → 25.8s), manifest rebuilt (total 12402 → 12361 frames).
- **r4 — Root.tsx recovery:** the shared remotion Root.tsx was found reverted by a concurrent session (LessonTECHA registration gone); re-added additively.
