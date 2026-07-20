# Quiz distractor authoring rules

Follow these instructions for every source card.

- Write one multiple choice question per card.
- Use the source front verbatim as the question stem.
- Use the source back verbatim as the single correct answer.
- Write exactly three distractors.
- Use vocabulary from the same lesson and topic.
- Make every distractor plausible to a learner but definitively wrong.
- Match the correct answer's grammatical form, length, and specificity.
- Do not use trick wording or double negatives.
- Do not use "all of the above", "none of the above", or equivalent choices.
- Do not create length clues or position clues.
- Do not use synonyms or rewordings of the correct answer.
- Do not use partially correct statements.
- Do not introduce facts that are absent from the course material.
- Never make the correct answer arguable.

For a fill in the blank front, use the missing word or phrase as the correct option. Write plausible alternative words with the same part of speech as distractors.

For a true or false style front, set `question_type` to `true_false` and set `true_false_answer` only when the source back is literally true or false. Do not convert a different answer into true or false.

If three fair distractors are impossible, set `status` to `needs_human_review` and provide one allowed taxonomy reason. Flagging is success. It protects the learner from a forced or ambiguous question.

Allowed review reasons:

- `imperative_front_cannot_be_mcq_stem`
- `concept_cue_front`
- `phrase_cue_front`
- `insufficient_content_for_fair_distractors`
- `back_too_ambiguous`
- `checker_escalation`
- `stale_role_terms_need_rewrite_decision`

Fronts classified as imperative, `Concept:`, or `Phrase cue:` must be flagged. Never force them into multiple choice form.
