# Lesson 19 b05 fix candidates

Blocked source line:

> "Your commission tier increases."

Reason blocked: the line implies a fixed compensation tier structure. Per the 2026-07-07 compensation withdrawal, compensation language must stay dynamic by role and company performance, with no tiers, thresholds, fixed structures, dollar figures, or evergreen pay promises.

Audio timing anchor: in `course-assets/heygen/lesson19/_state.json`, the blocked line runs from `20.659s` through `22.279s`, about `1.62s` of spoken audio. The full splice pocket between the prior sentence and next sentence is about `2.42s` from `20.239s` through `22.659s`.

Candidate replacement lines:

1. "Your earning potential grows."
   - Fit: shortest and cleanest splice candidate. Likely close to the original spoken duration.
   - Meaning: keeps the growth/earnings idea without naming a pay structure.

2. "Earnings can grow with performance."
   - Fit: slightly longer, still likely within about one second of the original line.
   - Meaning: ties earnings to performance while keeping the statement conditional and dynamic.

3. "Responsibility and earning potential grow."
   - Fit: most meaning-rich, probably near the upper end of the splice window but still viable.
   - Meaning: connects the surrounding mentoring/autonomy language to earnings growth without tiers.

Splice vs re-render feasibility:

- A direct audio splice is viable if Jarrad picks candidate 1 or 2 and the generated replacement line lands near the current `1.62s` spoken duration. Candidate 3 may still work, but it is the least forgiving splice because it carries more syllables.
- If the selected replacement sounds rushed, clipped, or mismatched against the surrounding cadence, re-render only `b05_complex_leads_mentor` and rebuild the Lesson 19 master audio/render from that beat. Do not regenerate now.

Stop condition:

- Await Jarrad's line choice before any audio generation, render rebuild, or QC rerun.
