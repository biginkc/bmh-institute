#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const [transcriptPath, sourceKey, outputPath] = process.argv.slice(2);

if (!transcriptPath || !sourceKey || !outputPath) {
  console.error(
    "Usage: node build-whisper-vtt.mjs <transcripts.json> <source-key> <output.vtt>",
  );
  process.exit(1);
}

const transcripts = JSON.parse(readFileSync(transcriptPath, "utf8"));
const transcript = transcripts.find((entry) => entry.sourceKey === sourceKey);

if (!transcript) {
  throw new Error(`No transcript found for ${sourceKey}`);
}

let previousSpokenText = "";
const cleanSegments = transcript.segments.filter((segment) => {
  const text = segment.text?.replace(/\s+/g, " ").trim() ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const duration = Math.max(0.001, segment.end - segment.start);

  // Whisper can echo a short practice prompt throughout the deliberate silence
  // that follows it. Only the first consecutive copy represents spoken audio;
  // empty decoder segments do not break a duplicate run.
  if (text && text === previousSpokenText) return false;

  // Reject impossible speech density and isolated, very-low-confidence noise.
  if (wordCount / duration > 8) return false;
  if (segment.avg_logprob < -0.8 && duration < 1) return false;

  if (text) previousSpokenText = text;
  return true;
});

const words = cleanSegments
  .flatMap((segment) => segment.words ?? [])
  .filter(
    (word) =>
      Number.isFinite(word.start) &&
      Number.isFinite(word.end) &&
      word.end >= word.start &&
      word.word?.trim(),
  );

function cueText(cueWords) {
  return cueWords
    .map((word) => word.word)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSplit(cueWords, nextWord) {
  if (cueWords.length === 0) return false;

  const previous = cueWords.at(-1);
  const gap = nextWord.start - previous.end;
  const proposed = cueText([...cueWords, nextWord]);
  const duration = nextWord.end - cueWords[0].start;
  const sentenceEnded = /[.!?][\"']?$/.test(previous.word.trim());
  const currentLength = cueText(cueWords).length;

  return (
    gap >= 0.7 ||
    duration > 5.5 ||
    proposed.length > 80 ||
    (sentenceEnded &&
      currentLength >= 18 &&
      (gap >= 0.25 || (currentLength >= 30 && currentLength <= 42)))
  );
}

const cues = [];
let current = [];

for (const word of words) {
  if (shouldSplit(current, word)) {
    cues.push(current);
    current = [];
  }
  current.push(word);
}
if (current.length > 0) cues.push(current);

function timestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function wrap(text, limit = 42) {
  const tokens = text.split(" ");
  const lines = [];
  let line = "";

  for (const token of tokens) {
    const proposed = line ? `${line} ${token}` : token;
    if (line && proposed.length > limit) {
      lines.push(line);
      line = token;
    } else {
      line = proposed;
    }
  }
  if (line) lines.push(line);

  if (lines.length > 2) {
    throw new Error(`Cue exceeds two lines: ${text}`);
  }
  return lines.join("\n");
}

const output = ["WEBVTT", ""];

cues.forEach((cueWords, index) => {
  const nextStart = cues[index + 1]?.[0]?.start ?? Number.POSITIVE_INFINITY;
  const start = cueWords[0].start;
  const spokenEnd = cueWords.at(-1).end;
  const text = cueText(cueWords);
  const readableEnd = start + Math.max(0.8, text.length / 21);
  const end = Math.max(
    start + 0.35,
    Math.min(Math.max(spokenEnd + 0.15, readableEnd), nextStart - 0.05, start + 6),
  );

  output.push(
    String(index + 1),
    `${timestamp(start)} --> ${timestamp(end)}`,
    wrap(text),
    "",
  );
});

writeFileSync(outputPath, output.join("\n"), "utf8");
console.log(`Wrote ${cues.length} cues for ${sourceKey}`);
