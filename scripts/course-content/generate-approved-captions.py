#!/usr/bin/env python3
"""Generate local captions and transcripts for manifest-approved BMH video cuts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import textwrap
from pathlib import Path

INITIAL_PROMPT = (
    "BMH Group. Sandra CRM. Closer Lab. Dialpad. DealMachine. BatchLeads. "
    "Paycom. Slack. Zoom. ARV. MAO. CRM. Kansas City. St. Louis. Dayton. "
    "Seller conversations, real estate wholesaling, title company, assignment fee."
)

TERM_REPLACEMENTS = (
    (re.compile(r"\bB\.M\.H\.\b", re.I), "BMH"),
    (re.compile(r"\bB M H\b", re.I), "BMH"),
    (re.compile(r"\bBMH group\b", re.I), "BMH Group"),
    (re.compile(r"\bSandra C\.R\.M\.\b", re.I), "Sandra CRM"),
    (re.compile(r"\bDial Pad\b", re.I), "Dialpad"),
    (re.compile(r"\bDeal Machine\b", re.I), "DealMachine"),
    (re.compile(r"\bBatch Leads\b", re.I), "BatchLeads"),
    (re.compile(r"\bClose(?:r|er)\s*Lab\b", re.I), "Closer Lab"),
    (re.compile(r"\bA\.R\.V\.\b", re.I), "ARV"),
    (re.compile(r"\bM\.A\.O\.\b", re.I), "MAO"),
    (re.compile(r"\bC\.R\.M\.\b", re.I), "CRM"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_text(value: str) -> str:
    text = re.sub(r"\s+", " ", value).strip()
    text = re.sub(r"\s+-\s*", "-", text)
    text = re.sub(r"\s+([,.;:!?%])", r"\1", text)
    text = re.sub(r"(?<=\d),\s+(?=\d{3}\b)", ",", text)
    for pattern, replacement in TERM_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text.replace("\u2014", "-")


def repair_cue_boundaries(cues: list[dict]) -> list[dict]:
    """Keep punctuation and hyphenated words from being split across cues."""
    repaired: list[dict] = []
    for original in cues:
        cue = {**original, "text": clean_text(original["text"])}
        if repaired:
            previous = repaired[-1]
            if re.search(r"\bBMH$", previous["text"]) and re.match(r"^group\b", cue["text"], re.I):
                cue["text"] = re.sub(r"^group\b", "Group", cue["text"], count=1, flags=re.I)

            leading_hyphen = re.match(r"^(-[A-Za-z]+)(.*)$", cue["text"])
            previous_word = re.match(r"^(.*?)([A-Za-z]+)$", previous["text"])
            if leading_hyphen and previous_word:
                previous["text"] = previous_word.group(1).rstrip()
                cue["text"] = f"{previous_word.group(2)}{leading_hyphen.group(1)}{leading_hyphen.group(2)}"
                if not previous["text"]:
                    repaired.pop()

        repaired.append(cue)
    return repaired


def timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"


def cue_words(words: list[dict]) -> list[dict]:
    cues: list[dict] = []
    current: list[dict] = []
    for word in words:
        token = clean_text(str(word.get("word", "")))
        if not token:
            continue
        normalized = {"word": token, "start": float(word["start"]), "end": float(word["end"])}
        candidate = " ".join(item["word"] for item in [*current, normalized])
        duration = normalized["end"] - (current[0]["start"] if current else normalized["start"])
        should_break = current and (len(candidate) > 88 or duration > 6.5)
        if should_break:
            cues.append({
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "text": clean_text(" ".join(item["word"] for item in current)),
            })
            current = []
        current.append(normalized)
        if re.search(r"[.!?][\"']?$", token) and len(" ".join(item["word"] for item in current)) >= 22:
            cues.append({
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "text": clean_text(" ".join(item["word"] for item in current)),
            })
            current = []
    if current:
        cues.append({
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "text": clean_text(" ".join(item["word"] for item in current)),
        })
    return cues


def make_cues(result: dict) -> list[dict]:
    cues: list[dict] = []
    for segment in result.get("segments", []):
        words = segment.get("words") or []
        if words:
            cues.extend(cue_words(words))
        else:
            text = clean_text(segment.get("text", ""))
            if text:
                cues.append({"start": float(segment["start"]), "end": float(segment["end"]), "text": text})

    normalized: list[dict] = []
    for cue in cues:
        start = max(cue["start"], normalized[-1]["end"] if normalized else 0)
        end = max(start + 0.25, cue["end"])
        normalized.append({**cue, "start": start, "end": end})
    return repair_cue_boundaries(normalized)


def wrap_cue(text: str) -> str:
    lines = textwrap.wrap(text, width=44, break_long_words=False, break_on_hyphens=False)
    if len(lines) <= 2:
        return "\n".join(lines)
    breakpoints = [match.start() for match in re.finditer(r"\s+", text)]
    split_at = min(
        breakpoints,
        key=lambda point: (
            max(len(text[:point].strip()), len(text[point:].strip())) > 48,
            max(len(text[:point].strip()), len(text[point:].strip())),
            abs(len(text[:point].strip()) - len(text[point:].strip())),
        ),
    )
    return f"{text[:split_at].strip()}\n{text[split_at:].strip()}"


def write_vtt(path: Path, cues: list[dict]) -> None:
    blocks = ["WEBVTT"]
    for index, cue in enumerate(cues, start=1):
        blocks.append(f"{index}\n{timestamp(cue['start'])} --> {timestamp(cue['end'])}\n{wrap_cue(cue['text'])}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def transcript_paragraphs(cues: list[dict]) -> list[str]:
    paragraphs: list[str] = []
    current = ""
    for cue in cues:
        candidate = f"{current} {cue['text']}".strip()
        if current and len(candidate) > 650 and re.search(r"[.!?][\"']?$", current):
            paragraphs.append(current)
            current = cue["text"]
        else:
            current = candidate
    if current:
        paragraphs.append(current)
    return paragraphs


def write_transcript(path: Path, title: str, video_key: str, cues: list[dict]) -> None:
    body = "\n\n".join(transcript_paragraphs(cues))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {title}\n\nVideo: {video_key}\n\n{body}\n", encoding="utf-8")


def video_titles(manifest: dict) -> dict[str, str]:
    titles: dict[str, str] = {}
    for course in manifest["program"]["courses"]:
        for module in course["modules"]:
            for lesson in module["lessons"]:
                for block in lesson.get("blocks", []):
                    if block["type"] == "video":
                        titles[block["content"]["asset_key"]] = block["content"]["title"]
    return titles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--repo-root", required=True, type=Path)
    parser.add_argument("--model", default="mlx-community/whisper-medium.en-mlx")
    parser.add_argument("--only")
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="explicitly allow overwriting an existing caption/transcript pair",
    )
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    titles = video_titles(manifest)
    videos = [asset for asset in manifest["assets"] if asset["kind"] == "video" and asset["approval_status"] == "approved"]
    if args.only:
        videos = [asset for asset in videos if asset["source_key"] == args.only]
    if not videos:
        raise SystemExit("No approved videos selected")

    import mlx_whisper

    for index, video in enumerate(videos, start=1):
        source = args.source_root / video["local_path"]
        if not source.is_file():
            raise FileNotFoundError(source)
        actual_checksum = sha256(source)
        if actual_checksum != video["checksum_sha256"]:
            raise RuntimeError(f"{video['source_key']} source checksum changed")
        caption_path = args.repo_root / f"course-assets/captions/{video['source_key']}.vtt"
        transcript_path = args.repo_root / f"course-assets/transcripts/{video['source_key']}.md"
        if not args.replace_existing and (caption_path.exists() or transcript_path.exists()):
            raise FileExistsError(
                f"{video['source_key']} derivatives already exist; pass --replace-existing after review"
            )
        print(f"[{index}/{len(videos)}] transcribing {video['source_key']}", flush=True)
        result = mlx_whisper.transcribe(
            str(source),
            path_or_hf_repo=args.model,
            language="en",
            task="transcribe",
            word_timestamps=True,
            initial_prompt=INITIAL_PROMPT,
            temperature=0.0,
            verbose=False,
        )
        cues = make_cues(result)
        if not cues:
            raise RuntimeError(f"{video['source_key']} produced no cues")
        write_vtt(caption_path, cues)
        write_transcript(
            transcript_path,
            titles[video["source_key"]],
            video["source_key"],
            cues,
        )


if __name__ == "__main__":
    main()
