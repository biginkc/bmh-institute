#!/usr/bin/env python3
"""Generate deterministic, print-friendly learner guides from the course manifest."""

from __future__ import annotations

import hashlib
import json
import re
from functools import partial
from html.parser import HTMLParser
from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "content/course-manifests/bmh-employee-training.v1.json"
OUTPUT_DIR = ROOT / "output/pdf"

INK = colors.HexColor("#111827")
BLUE = colors.HexColor("#6C8DFF")
BLUE_DARK = colors.HexColor("#3556B8")
BLUE_SOFT = colors.HexColor("#EEF2FF")
YELLOW = colors.HexColor("#FFD447")
CREAM = colors.HexColor("#FFF8E8")
MUTED = colors.HexColor("#4B5563")
WHITE = colors.white

# Freeze timestamps and document IDs so reruns preserve immutable asset hashes.
rl_config.invariant = 1


class LessonHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.current_tag: str | None = None
        self.parts: list[str] = []
        self.items: list[str] = []
        self.paragraphs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"li", "p"}:
            self.current_tag = tag
            self.parts = []

    def handle_data(self, data: str) -> None:
        if self.current_tag:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != self.current_tag:
            return
        text = clean_text(" ".join(self.parts))
        if text:
            (self.items if tag == "li" else self.paragraphs).append(text)
        self.current_tag = None
        self.parts = []


def clean_text(value: str) -> str:
    replacements = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return re.sub(r"\s+", " ", value).strip()


def parse_html(html: str) -> LessonHtmlParser:
    parser = LessonHtmlParser()
    parser.feed(html)
    return parser


def styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=BLUE_DARK,
            spaceAfter=8,
            uppercase=True,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "deck": ParagraphStyle(
            "Deck",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=MUTED,
            spaceAfter=16,
        ),
        "heading": ParagraphStyle(
            "Heading",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=INK,
            spaceBefore=12,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=INK,
            leftIndent=2,
        ),
        "card_front": ParagraphStyle(
            "CardFront",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            textColor=INK,
            spaceAfter=3,
        ),
        "card_back": ParagraphStyle(
            "CardBack",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=MUTED,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }


def bullets(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(clean_text(item), style), leftIndent=8) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=18,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=7,
        bulletColor=BLUE_DARK,
        spaceAfter=8,
    )


def page_decor(canvas: Canvas, document: SimpleDocTemplate) -> None:
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(BLUE)
    canvas.roundRect(0.55 * inch, height - 0.54 * inch, 0.24 * inch, 0.24 * inch, 4, fill=1, stroke=0)
    canvas.setFillColor(YELLOW)
    canvas.circle(0.93 * inch, height - 0.42 * inch, 0.09 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(1.2)
    canvas.line(0.55 * inch, 0.53 * inch, width - 0.55 * inch, 0.53 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.55 * inch, 0.32 * inch, "BMH Institute - Internal learner guide")
    canvas.drawRightString(width - 0.55 * inch, 0.32 * inch, f"Page {document.page}")
    canvas.restoreState()


def guide_story(lesson: dict, style: dict[str, ParagraphStyle], slot: int):
    objectives_block = next(block for block in lesson["blocks"] if block["source_key"].startswith("block-objectives-"))
    guide_block = next(block for block in lesson["blocks"] if block["source_key"].startswith("block-guide-slot-"))
    flashcard_block = next(block for block in lesson["blocks"] if block["type"] == "flashcard")
    objectives = parse_html(objectives_block["content"]["html"]).items
    guide = parse_html(guide_block["content"]["html"])
    key_ideas = guide.items
    cards = flashcard_block["content"]["cards"][:6]

    story = [
        Paragraph(f"SECTION {slot:02d} / LEARNER GUIDE", style["eyebrow"]),
        Paragraph(clean_text(lesson["title"]), style["title"]),
        Paragraph(clean_text(lesson["description"] or ""), style["deck"]),
        Table(
            [[Paragraph("Use this guide while watching, practicing, and reviewing. Write notes in your own words, then confirm live procedures against the current SOP.", style["body"])]],
            colWidths=[7.15 * inch],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), BLUE_SOFT),
                ("BOX", (0, 0), (-1, -1), 1.2, BLUE_DARK),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]),
        ),
        Paragraph("Learning objectives", style["heading"]),
        bullets(objectives, style["bullet"]),
        Paragraph("Key ideas", style["heading"]),
        bullets(key_ideas, style["bullet"]),
        Paragraph("Practice and reflection", style["heading"]),
        bullets(
            [
                f"Explain the main idea of {clean_text(lesson['title'])} without reading a script.",
                "Name one behavior you can demonstrate in your next seller or team interaction.",
                "Write one question you still need a manager or current SOP to answer.",
                "Record the next action you will take and when you will take it.",
            ],
            style["bullet"],
        ),
        Spacer(1, 4),
        Table(
            [[Paragraph("Source of truth", style["card_front"]), Paragraph("Current written SOP, role sheet, offer letter, and manager direction control when live procedures or role terms differ from training.", style["card_back"])]],
            colWidths=[1.35 * inch, 5.8 * inch],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 1.2, INK),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]),
        ),
        PageBreak(),
        Paragraph("Quick review", style["title"]),
        Paragraph("Use these prompts for retrieval practice. Answer first, then compare your response with the guide.", style["deck"]),
    ]
    for index, card in enumerate(cards, start=1):
        story.append(
            KeepTogether([
                Table(
                    [[Paragraph(f"{index}. {clean_text(card['front'])}", style["card_front"])], [Paragraph(clean_text(card["back"]), style["card_back"])]],
                    colWidths=[7.15 * inch],
                    style=TableStyle([
                        ("BACKGROUND", (0, 0), (-1, 0), BLUE_SOFT),
                        ("BACKGROUND", (0, 1), (-1, 1), WHITE),
                        ("BOX", (0, 0), (-1, -1), 1, INK),
                        ("LINEBELOW", (0, 0), (-1, 0), 0.7, BLUE),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]),
                ),
                Spacer(1, 8),
            ])
        )
    story.extend([
        Spacer(1, 8),
        Paragraph("Manager review notes", style["heading"]),
        Table(
            [[""] for _ in range(4)],
            colWidths=[7.15 * inch],
            rowHeights=[0.34 * inch] * 4,
            style=TableStyle([
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
            ]),
        ),
    ])
    return story


def build_guide(lesson: dict, output_path: Path, slot: int) -> None:
    document = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        rightMargin=0.68 * inch,
        leftMargin=0.68 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title=clean_text(lesson["title"]),
        author="BMH Institute",
        subject="Internal learner guide",
        creator="BMH Institute deterministic guide generator",
    )
    document.build(
        guide_story(lesson, styles(), slot),
        onFirstPage=page_decor,
        onLaterPages=page_decor,
        canvasmaker=partial(Canvas, invariant=1, pageCompression=1),
    )


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    lessons = [
        lesson
        for course in manifest["program"]["courses"]
        for module in course["modules"]
        for lesson in module["lessons"]
        if lesson["type"] == "content"
    ]
    assets = {asset["source_key"]: asset for asset in manifest["assets"]}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for slot, lesson in enumerate(lessons, start=1):
        guide_block = next(block for block in lesson["blocks"] if block["source_key"].startswith("block-guide-pdf-slot-"))
        asset = assets[guide_block["content"]["asset_key"]]
        filename = f"slot-{slot:02d}-learner-guide.pdf"
        review_path = OUTPUT_DIR / filename
        asset_path = review_path
        build_guide(lesson, asset_path, slot)
        payload = asset_path.read_bytes()
        checksum = hashlib.sha256(payload).hexdigest()
        asset.update({
            "local_path": str(asset_path.relative_to(ROOT)),
            "storage_path": f"courses/bmh-employee-training/v1/guides/guide-slot-{slot:02d}.{checksum}.pdf",
            "checksum_sha256": checksum,
            "size_bytes": len(payload),
            "approval_status": "approved",
        })
        guide_block["content"].update({
            "file_path": asset["storage_path"],
            "size_bytes": len(payload),
        })

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(lessons)} learner guides in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
