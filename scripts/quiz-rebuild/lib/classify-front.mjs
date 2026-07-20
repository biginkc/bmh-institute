export function classifyFront(front) {
  const trimmed = front.trim();
  if (/_{3,}/.test(front)) return "fill_blank";
  if (/^true or false/i.test(trimmed) || /\btrue or false\b/i.test(front)) return "true_false_ish";
  if (/^(list|name|describe|give|state|identify)\b/i.test(trimmed)) return "imperative";
  if (/^concept\s*:/i.test(trimmed)) return "concept_cue";
  if (/^phrase cue\s*:/i.test(trimmed)) return "phrase_cue";
  if (trimmed.endsWith("?")) return "question";
  return "other";
}
