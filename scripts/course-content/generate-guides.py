#!/usr/bin/env python3
"""Generate deterministic, tagged, print-friendly learner-guide PDFs.

Run with the pinned build dependencies used for the committed artifacts:

    uv run --with reportlab==4.4.9 --with pypdf==6.8.0 \
      python scripts/course-content/generate-guides.py --write

Use ``--check`` to rebuild into a temporary directory and prove byte-for-byte
reproducibility without changing the manifest or committed PDFs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from dataclasses import dataclass, field
from functools import partial
from html import escape as xml_escape
from html.parser import HTMLParser
from pathlib import Path

import reportlab
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    BooleanObject,
    ByteStringObject,
    ContentStream,
    DecodedStreamObject,
    DictionaryObject,
    IndirectObject,
    NameObject,
    NullObject,
    NumberObject,
    TextStringObject,
)
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Flowable,
    KeepTogether,
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
LINE = colors.HexColor("#9CA3AF")

FONT_REGULAR = "BMHVera"
FONT_BOLD = "BMHVera-Bold"
FIXED_PDF_DATE = "D:20000101000000Z"
FIXED_XMP_DATE = "2000-01-01T00:00:00Z"

# Freeze ReportLab timestamps, document IDs, and other volatile values.
rl_config.invariant = 1


def register_fonts() -> None:
    """Register ReportLab's bundled, redistributable, embeddable Vera fonts."""

    font_dir = Path(reportlab.__file__).resolve().parent / "fonts"
    regular = font_dir / "Vera.ttf"
    bold = font_dir / "VeraBd.ttf"
    if not regular.is_file() or not bold.is_file():
        raise RuntimeError(f"ReportLab bundled Vera fonts are missing from {font_dir}")
    if FONT_REGULAR not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(regular)))
    if FONT_BOLD not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_BOLD, str(bold)))


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


def safe_text(value: str) -> str:
    return xml_escape(clean_text(value), quote=False)


def parse_html(html: str) -> LessonHtmlParser:
    parser = LessonHtmlParser()
    parser.feed(html)
    return parser


@dataclass
class StructureNode:
    role: str
    title: str | None = None
    page_index: int | None = None
    mcid: int | None = None
    children: list[int] = field(default_factory=list)


class StructureRegistry:
    """Logical structure plus page-local marked-content identifiers."""

    def __init__(self) -> None:
        self.nodes: list[StructureNode] = []
        self.roots: list[int] = []
        self.parent_stack: list[int] = []
        self.page_mcid_counts: dict[int, int] = {}

    def _append(self, node: StructureNode) -> int:
        node_id = len(self.nodes)
        self.nodes.append(node)
        if self.parent_stack:
            self.nodes[self.parent_stack[-1]].children.append(node_id)
        else:
            self.roots.append(node_id)
        return node_id

    def begin_group(self, role: str, title: str | None = None) -> None:
        self.parent_stack.append(self._append(StructureNode(role=role, title=title)))

    def end_group(self, role: str) -> None:
        if not self.parent_stack:
            raise RuntimeError(f"Attempted to end /{role} with no open structure group")
        node_id = self.parent_stack.pop()
        actual = self.nodes[node_id].role
        if actual != role:
            raise RuntimeError(f"Structure group mismatch: expected /{actual}, received /{role}")

    def add_marked(self, role: str, page_index: int, title: str | None = None) -> int:
        mcid = self.page_mcid_counts.get(page_index, 0)
        self.page_mcid_counts[page_index] = mcid + 1
        self._append(
            StructureNode(role=role, title=title, page_index=page_index, mcid=mcid),
        )
        return mcid

    def assert_closed(self) -> None:
        if self.parent_stack:
            roles = [self.nodes[node_id].role for node_id in self.parent_stack]
            raise RuntimeError(f"Unclosed structure groups: {roles}")


class TaggedCanvas(Canvas):
    def __init__(self, *args, structure_registry: StructureRegistry, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.structure_registry = structure_registry

    def begin_semantic(self, role: str, title: str | None = None) -> None:
        page_index = self.getPageNumber() - 1
        mcid = self.structure_registry.add_marked(role, page_index, title)
        self._code.append(f"/{role} <</MCID {mcid}>> BDC")

    def end_semantic(self) -> None:
        self._code.append("EMC")

    def begin_artifact(self) -> None:
        self._code.append("/Artifact BMC")

    def end_artifact(self) -> None:
        self._code.append("EMC")


class TaggedParagraph(Paragraph):
    def __init__(
        self,
        text: str,
        style: ParagraphStyle,
        *,
        semantic_role: str = "P",
        semantic_title: str | None = None,
        **kwargs,
    ) -> None:
        super().__init__(text, style, **kwargs)
        self.semantic_role = semantic_role
        self.semantic_title = semantic_title

    def drawOn(self, canvas: TaggedCanvas, x: float, y: float, _sW: float = 0) -> None:
        canvas.begin_semantic(self.semantic_role, self.semantic_title)
        try:
            super().drawOn(canvas, x, y, _sW)
        finally:
            canvas.end_semantic()


class TaggedTable(Table):
    def __init__(self, *args, semantic_role: str = "Div", semantic_title: str | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.semantic_role = semantic_role
        self.semantic_title = semantic_title

    def drawOn(self, canvas: TaggedCanvas, x: float, y: float, _sW: float = 0) -> None:
        canvas.begin_semantic(self.semantic_role, self.semantic_title)
        try:
            super().drawOn(canvas, x, y, _sW)
        finally:
            canvas.end_semantic()


class ArtifactTable(Table):
    def drawOn(self, canvas: TaggedCanvas, x: float, y: float, _sW: float = 0) -> None:
        canvas.begin_artifact()
        try:
            super().drawOn(canvas, x, y, _sW)
        finally:
            canvas.end_artifact()


class StructureBoundary(Flowable):
    def __init__(self, role: str, *, start: bool, title: str | None = None) -> None:
        super().__init__()
        self.role = role
        self.start = start
        self.title = title
        self.width = 0
        self.height = 0

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        return 0, 0

    def draw(self) -> None:
        registry = self.canv.structure_registry
        if self.start:
            registry.begin_group(self.role, self.title)
        else:
            registry.end_group(self.role)


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=BLUE_DARK,
            spaceAfter=8,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName=FONT_BOLD,
            fontSize=25,
            leading=29,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "deck": ParagraphStyle(
            "Deck",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=11,
            leading=16,
            textColor=MUTED,
            spaceAfter=16,
        ),
        "heading": ParagraphStyle(
            "Heading",
            parent=base["Heading2"],
            fontName=FONT_BOLD,
            fontSize=15,
            leading=18,
            textColor=INK,
            spaceBefore=12,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=10,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=10,
            leading=14,
            textColor=INK,
            leftIndent=18,
            bulletIndent=2,
            bulletFontName=FONT_REGULAR,
            bulletFontSize=10,
            spaceAfter=6,
        ),
        "card_front": ParagraphStyle(
            "CardFront",
            parent=base["BodyText"],
            fontName=FONT_BOLD,
            fontSize=9.5,
            leading=13,
            textColor=INK,
            spaceAfter=3,
        ),
        "card_back": ParagraphStyle(
            "CardBack",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=12,
            textColor=MUTED,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=8,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }


def bullets(items: list[str], style: ParagraphStyle, title: str) -> list[Flowable]:
    flowables: list[Flowable] = [StructureBoundary("L", start=True, title=title)]
    flowables.extend(
        TaggedParagraph(
            safe_text(item),
            style,
            bulletText="\u2022",
            semantic_role="LI",
        )
        for item in items
    )
    flowables.extend([StructureBoundary("L", start=False), Spacer(1, 2)])
    return flowables


def page_decor(canvas: TaggedCanvas, document: SimpleDocTemplate) -> None:
    canvas.begin_artifact()
    canvas.saveState()
    try:
        width, height = LETTER
        canvas.setFillColor(BLUE)
        canvas.roundRect(0.55 * inch, height - 0.54 * inch, 0.24 * inch, 0.24 * inch, 4, fill=1, stroke=0)
        canvas.setFillColor(YELLOW)
        canvas.circle(0.93 * inch, height - 0.42 * inch, 0.09 * inch, fill=1, stroke=0)
        canvas.setStrokeColor(INK)
        canvas.setLineWidth(1.2)
        canvas.line(0.55 * inch, 0.53 * inch, width - 0.55 * inch, 0.53 * inch)
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.55 * inch, 0.32 * inch, "BMH Institute - Internal learner guide")
        canvas.drawRightString(width - 0.55 * inch, 0.32 * inch, f"Page {document.page}")
    finally:
        canvas.restoreState()
        canvas.end_artifact()


def guide_story(lesson: dict, style: dict[str, ParagraphStyle], slot: int) -> list[Flowable]:
    objectives_block = next(block for block in lesson["blocks"] if block["source_key"].startswith("block-objectives-"))
    guide_block = next(block for block in lesson["blocks"] if block["source_key"].startswith("block-guide-slot-"))
    flashcard_block = next(block for block in lesson["blocks"] if block["type"] == "flashcard")
    objectives = parse_html(objectives_block["content"]["html"]).items
    guide = parse_html(guide_block["content"]["html"])
    key_ideas = guide.items
    cards = flashcard_block["content"]["cards"][:6]
    lesson_title = clean_text(lesson["title"])

    story: list[Flowable] = [
        TaggedParagraph(
            f"SECTION {slot:02d} / LEARNER GUIDE",
            style["eyebrow"],
            semantic_role="P",
        ),
        TaggedParagraph(
            safe_text(lesson_title),
            style["title"],
            semantic_role="H1",
            semantic_title=lesson_title,
        ),
        TaggedParagraph(
            safe_text(lesson["description"] or ""),
            style["deck"],
            semantic_role="P",
        ),
        TaggedTable(
            [[Paragraph(
                "Use this guide while watching, practicing, and reviewing. Write notes in your own words, then confirm live procedures against the current SOP.",
                style["body"],
            )]],
            colWidths=[7.15 * inch],
            semantic_role="Note",
            semantic_title="How to use this guide",
            style=TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                ("BACKGROUND", (0, 0), (-1, -1), BLUE_SOFT),
                ("BOX", (0, 0), (-1, -1), 1.2, BLUE_DARK),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]),
        ),
        TaggedParagraph("Learning objectives", style["heading"], semantic_role="H2", semantic_title="Learning objectives"),
        *bullets(objectives, style["bullet"], "Learning objectives"),
        TaggedParagraph("Key ideas", style["heading"], semantic_role="H2", semantic_title="Key ideas"),
        *bullets(key_ideas, style["bullet"], "Key ideas"),
        TaggedParagraph("Practice and reflection", style["heading"], semantic_role="H2", semantic_title="Practice and reflection"),
        *bullets(
            [
                f"Explain the main idea of {lesson_title} without reading a script.",
                "Name one behavior you can demonstrate in your next seller or team interaction.",
                "Write one question you still need a manager or current SOP to answer.",
                "Record the next action you will take and when you will take it.",
            ],
            style["bullet"],
            "Practice and reflection",
        ),
        Spacer(1, 2),
        TaggedTable(
            [[
                Paragraph("Source of truth", style["card_front"]),
                Paragraph(
                    "Current written SOP, role sheet, offer letter, and manager direction control when live procedures or role terms differ from training.",
                    style["card_back"],
                ),
            ]],
            colWidths=[1.35 * inch, 5.8 * inch],
            semantic_role="Note",
            semantic_title="Source of truth",
            style=TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
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
        TaggedParagraph("Quick review", style["title"], semantic_role="H2", semantic_title="Quick review"),
        TaggedParagraph(
            "Use these prompts for retrieval practice. Answer first, then compare your response with the guide.",
            style["deck"],
            semantic_role="P",
        ),
    ]
    for index, card in enumerate(cards, start=1):
        question = f"{index}. {clean_text(card['front'])}"
        story.append(
            KeepTogether([
                TaggedTable(
                    [
                        [Paragraph(safe_text(question), style["card_front"])],
                        [Paragraph(safe_text(card["back"]), style["card_back"])],
                    ],
                    colWidths=[7.15 * inch],
                    semantic_role="Div",
                    semantic_title=f"Review prompt {index}",
                    style=TableStyle([
                        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
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
            ]),
        )
    story.extend([
        Spacer(1, 8),
        TaggedParagraph("Manager review notes", style["heading"], semantic_role="H2", semantic_title="Manager review notes"),
        ArtifactTable(
            [[Paragraph("", style["body"])] for _ in range(4)],
            colWidths=[7.15 * inch],
            rowHeights=[0.34 * inch] * 4,
            style=TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
            ]),
        ),
    ])
    return story


def xmp_packet(title: str) -> bytes:
    escaped_title = xml_escape(title)
    packet = f'''<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="BMH Institute deterministic accessible guide generator">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">{escaped_title}</rdf:li><rdf:li xml:lang="en-US">{escaped_title}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>BMH Institute</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Internal learner guide</rdf:li></rdf:Alt></dc:description>
   <dc:language><rdf:Bag><rdf:li>en-US</rdf:li></rdf:Bag></dc:language>
   <xmp:CreateDate>{FIXED_XMP_DATE}</xmp:CreateDate>
   <xmp:ModifyDate>{FIXED_XMP_DATE}</xmp:ModifyDate>
   <xmp:MetadataDate>{FIXED_XMP_DATE}</xmp:MetadataDate>
   <xmp:CreatorTool>BMH Institute deterministic accessible guide generator</xmp:CreatorTool>
   <pdf:Producer>ReportLab and pypdf</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>'''
    return packet.encode("utf-8")


def apply_accessibility_structure(
    source_path: Path,
    output_path: Path,
    registry: StructureRegistry,
    title: str,
    slot: int,
) -> None:
    """Attach the semantic tree, language, metadata, and reading-order hints."""

    registry.assert_closed()
    reader = PdfReader(source_path)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.pdf_header = "%PDF-1.7"

    root = writer._root_object
    root[NameObject("/Lang")] = TextStringObject("en-US")
    root[NameObject("/MarkInfo")] = DictionaryObject({
        NameObject("/Marked"): BooleanObject(True),
        NameObject("/Suspects"): BooleanObject(False),
    })
    root[NameObject("/ViewerPreferences")] = DictionaryObject({
        NameObject("/DisplayDocTitle"): BooleanObject(True),
    })

    structure_root = DictionaryObject({NameObject("/Type"): NameObject("/StructTreeRoot")})
    structure_root_ref = writer._add_object(structure_root)
    document_elem = DictionaryObject({
        NameObject("/Type"): NameObject("/StructElem"),
        NameObject("/S"): NameObject("/Document"),
        NameObject("/P"): structure_root_ref,
        NameObject("/T"): TextStringObject(title),
    })
    document_ref = writer._add_object(document_elem)
    structure_root[NameObject("/K")] = document_ref

    parent_arrays: dict[int, list] = {
        page_index: [NullObject() for _ in range(count)]
        for page_index, count in registry.page_mcid_counts.items()
    }

    def build_node(node_id: int, parent_ref):
        node = registry.nodes[node_id]
        element = DictionaryObject({
            NameObject("/Type"): NameObject("/StructElem"),
            NameObject("/S"): NameObject(f"/{node.role}"),
            NameObject("/P"): parent_ref,
        })
        if node.title:
            element[NameObject("/T")] = TextStringObject(node.title)
        element_ref = writer._add_object(element)

        if node.page_index is not None and node.mcid is not None:
            page = writer.pages[node.page_index]
            page_ref = page.indirect_reference
            if page_ref is None:
                raise RuntimeError(f"Page {node.page_index + 1} has no indirect reference")
            element[NameObject("/Pg")] = page_ref
            element[NameObject("/K")] = NumberObject(node.mcid)
            parent_arrays[node.page_index][node.mcid] = element_ref
        elif node.children:
            element[NameObject("/K")] = ArrayObject([
                build_node(child_id, element_ref) for child_id in node.children
            ])
        return element_ref

    document_elem[NameObject("/K")] = ArrayObject([
        build_node(node_id, document_ref) for node_id in registry.roots
    ])

    parent_tree_numbers = ArrayObject()
    for page_index, page in enumerate(writer.pages):
        page[NameObject("/Tabs")] = NameObject("/S")
        page[NameObject("/StructParents")] = NumberObject(page_index)
        parent_tree_numbers.extend([
            NumberObject(page_index),
            ArrayObject(parent_arrays.get(page_index, [])),
        ])
    parent_tree = DictionaryObject({NameObject("/Nums"): parent_tree_numbers})
    structure_root[NameObject("/ParentTree")] = writer._add_object(parent_tree)
    structure_root[NameObject("/ParentTreeNextKey")] = NumberObject(len(writer.pages))
    root[NameObject("/StructTreeRoot")] = structure_root_ref

    metadata_stream = DecodedStreamObject()
    metadata_stream.set_data(xmp_packet(title))
    metadata_stream[NameObject("/Type")] = NameObject("/Metadata")
    metadata_stream[NameObject("/Subtype")] = NameObject("/XML")
    root[NameObject("/Metadata")] = writer._add_object(metadata_stream)

    writer.add_metadata({
        "/Title": title,
        "/Author": "BMH Institute",
        "/Subject": "Internal learner guide",
        "/Creator": "BMH Institute deterministic accessible guide generator",
        "/Producer": "ReportLab and pypdf",
        "/CreationDate": FIXED_PDF_DATE,
        "/ModDate": FIXED_PDF_DATE,
    })
    document_id = hashlib.sha256(f"bmh-guide:{slot:02d}:{title}:accessible-v1".encode()).digest()[:16]
    writer._ID = ArrayObject([ByteStringObject(document_id), ByteStringObject(document_id)])
    writer.write(output_path)
    validate_accessible_pdf(output_path)


def _indirect_key(value: object, context: str) -> tuple[int, int]:
    if not isinstance(value, IndirectObject):
        raise RuntimeError(f"{context} must be an indirect object reference")
    return value.idnum, value.generation


def validate_accessible_pdf(output_path: Path) -> None:
    """Fail closed unless the physical content and logical structure agree.

    This deliberately validates the serialized PDF rather than trusting the
    in-memory registry that produced it. A tagged marker alone is not useful if
    the structure tree, ParentTree, page mapping, or marked-content roles have
    drifted apart.
    """

    reader = PdfReader(output_path)
    if reader.pdf_header != "%PDF-1.7":
        raise RuntimeError(f"{output_path.name} must declare PDF 1.7")
    root = reader.trailer["/Root"]
    if root.get("/Lang") != "en-US":
        raise RuntimeError(f"{output_path.name} has no en-US document language")
    if not root.get("/MarkInfo", {}).get("/Marked"):
        raise RuntimeError(f"{output_path.name} is not marked as tagged")
    if "/StructTreeRoot" not in root:
        raise RuntimeError(f"{output_path.name} has no structure tree")

    structure_root_ref = root.raw_get("/StructTreeRoot")
    structure_root_key = _indirect_key(
        structure_root_ref,
        f"{output_path.name} structure root",
    )
    structure_root = structure_root_ref.get_object()
    if structure_root.get("/Type") != "/StructTreeRoot":
        raise RuntimeError(f"{output_path.name} structure root has the wrong type")

    document_ref = structure_root.raw_get("/K")
    _indirect_key(document_ref, f"{output_path.name} document element")
    page_indices = {
        _indirect_key(page.indirect_reference, f"{output_path.name} page {index + 1}"): index
        for index, page in enumerate(reader.pages)
    }
    reachable: set[tuple[int, int]] = set()
    leaves: dict[tuple[int, int], tuple[IndirectObject, str]] = {}
    logical_leaf_order: list[tuple[int, int]] = []

    def visit_structure(ref: object, expected_parent: object, *, top_level: bool = False) -> None:
        ref_key = _indirect_key(ref, f"{output_path.name} structure element")
        if ref_key in reachable:
            raise RuntimeError(
                f"{output_path.name} structure element {ref_key} is duplicated or cyclic",
            )
        reachable.add(ref_key)
        element = ref.get_object()
        if element.get("/Type") != "/StructElem":
            raise RuntimeError(f"{output_path.name} structure element {ref_key} has the wrong type")
        parent_key = _indirect_key(
            element.raw_get("/P") if "/P" in element else None,
            f"{output_path.name} structure element {ref_key} parent",
        )
        expected_parent_key = (
            structure_root_key
            if top_level
            else _indirect_key(expected_parent, f"{output_path.name} expected parent")
        )
        if parent_key != expected_parent_key:
            raise RuntimeError(
                f"{output_path.name} structure element {ref_key} has the wrong /P backlink",
            )

        role = str(element.get("/S", ""))
        if not role.startswith("/"):
            raise RuntimeError(f"{output_path.name} structure element {ref_key} has no valid /S role")
        role = role[1:]
        if top_level and role != "Document":
            raise RuntimeError(f"{output_path.name} top-level structure element is not /Document")

        raw_k = element.raw_get("/K") if "/K" in element else None
        has_page = "/Pg" in element
        is_leaf = isinstance(raw_k, (int, NumberObject))
        if has_page != is_leaf:
            raise RuntimeError(
                f"{output_path.name} structure element {ref_key} must have leaf /Pg and integer /K together",
            )
        if is_leaf:
            page_ref = element.raw_get("/Pg")
            page_key = _indirect_key(page_ref, f"{output_path.name} leaf {ref_key} /Pg")
            if page_key not in page_indices:
                raise RuntimeError(f"{output_path.name} leaf {ref_key} points to an unknown page")
            page_index = page_indices[page_key]
            mcid = int(raw_k)
            leaf_key = (page_index, mcid)
            if mcid < 0 or leaf_key in leaves:
                raise RuntimeError(
                    f"{output_path.name} has duplicate or invalid leaf mapping {leaf_key}",
                )
            leaves[leaf_key] = (ref, role)
            logical_leaf_order.append(leaf_key)
            return

        if not isinstance(raw_k, ArrayObject) or not raw_k:
            raise RuntimeError(
                f"{output_path.name} grouping element {ref_key} must have a non-empty /K array",
            )
        for child_ref in raw_k:
            visit_structure(child_ref, ref)

    visit_structure(document_ref, structure_root_ref, top_level=True)

    if "/ParentTree" not in structure_root:
        raise RuntimeError(f"{output_path.name} structure root has no ParentTree")
    parent_tree_ref = structure_root.raw_get("/ParentTree")
    _indirect_key(parent_tree_ref, f"{output_path.name} ParentTree")
    parent_tree = parent_tree_ref.get_object()
    numbers = parent_tree.get("/Nums")
    if not isinstance(numbers, ArrayObject) or len(numbers) % 2:
        raise RuntimeError(f"{output_path.name} ParentTree has an invalid /Nums array")
    parent_entries: dict[int, ArrayObject] = {}
    previous_key = -1
    for index in range(0, len(numbers), 2):
        key = int(numbers[index])
        value = numbers[index + 1]
        if key <= previous_key or not isinstance(value, ArrayObject):
            raise RuntimeError(f"{output_path.name} ParentTree keys are not ordered unique arrays")
        previous_key = key
        parent_entries[key] = value

    page_parent_keys: list[int] = []
    physical_leaf_order: list[tuple[int, int]] = []

    for page_index, page in enumerate(reader.pages):
        if page.get("/Tabs") != "/S":
            raise RuntimeError(f"{output_path.name} page {page_index + 1} has no structure-order tab hint")
        fonts = page["/Resources"]["/Font"]
        for font_name, font_ref in fonts.items():
            font = font_ref.get_object()
            descriptor = font.get("/FontDescriptor")
            if descriptor is None or not any(key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3")):
                raise RuntimeError(f"{output_path.name} page {page_index + 1} font {font_name} is not embedded")
            if "/ToUnicode" not in font:
                raise RuntimeError(f"{output_path.name} page {page_index + 1} font {font_name} has no Unicode map")

        if "/StructParents" not in page:
            raise RuntimeError(f"{output_path.name} page {page_index + 1} has no /StructParents key")
        parent_key = int(page["/StructParents"])
        if parent_key in page_parent_keys:
            raise RuntimeError(f"{output_path.name} reuses page /StructParents key {parent_key}")
        page_parent_keys.append(parent_key)
        parent_array = parent_entries.get(parent_key)
        if parent_array is None:
            raise RuntimeError(
                f"{output_path.name} page {page_index + 1} has no matching ParentTree entry",
            )

        marked_stack: list[tuple[str, int | None]] = []
        seen_mcids: list[int] = []
        seen_tags: dict[int, str] = {}
        content = ContentStream(page.get_contents(), reader)
        for operands, raw_operator in content.operations:
            operator = raw_operator.decode("ascii")
            if operator == "BDC":
                if len(operands) != 2 or not isinstance(operands[1], DictionaryObject):
                    raise RuntimeError(
                        f"{output_path.name} page {page_index + 1} has malformed semantic marked content",
                    )
                properties = operands[1]
                if "/MCID" not in properties:
                    raise RuntimeError(
                        f"{output_path.name} page {page_index + 1} has BDC content without an /MCID",
                    )
                mcid = int(properties["/MCID"])
                tag = str(operands[0]).removeprefix("/")
                if mcid in seen_tags:
                    raise RuntimeError(
                        f"{output_path.name} page {page_index + 1} repeats MCID {mcid}",
                    )
                marked_stack.append(("semantic", mcid))
                seen_mcids.append(mcid)
                seen_tags[mcid] = tag
                physical_leaf_order.append((page_index, mcid))
            elif operator == "BMC":
                if len(operands) != 1 or str(operands[0]) != "/Artifact":
                    raise RuntimeError(
                        f"{output_path.name} page {page_index + 1} has non-semantic content not marked /Artifact",
                    )
                marked_stack.append(("artifact", None))
            elif operator == "EMC":
                if not marked_stack:
                    raise RuntimeError(f"{output_path.name} page {page_index + 1} has an unmatched EMC")
                marked_stack.pop()
            elif operator in {"Tj", "TJ", "'", '"'} and not marked_stack:
                raise RuntimeError(f"{output_path.name} page {page_index + 1} exposes untagged visible text")
        if marked_stack:
            raise RuntimeError(f"{output_path.name} page {page_index + 1} has unclosed marked content")
        expected = list(range(len(seen_mcids)))
        if seen_mcids != expected:
            raise RuntimeError(
                f"{output_path.name} page {page_index + 1} MCIDs are not contiguous: {seen_mcids} != {expected}",
            )
        if len(parent_array) != len(seen_mcids):
            raise RuntimeError(
                f"{output_path.name} page {page_index + 1} ParentTree array length does not match its MCIDs",
            )
        for mcid, element_ref in enumerate(parent_array):
            leaf = leaves.get((page_index, mcid))
            if leaf is None:
                raise RuntimeError(
                    f"{output_path.name} page {page_index + 1} MCID {mcid} has no reachable structure leaf",
                )
            if _indirect_key(element_ref, f"{output_path.name} ParentTree leaf") != _indirect_key(
                leaf[0],
                f"{output_path.name} structure leaf",
            ):
                raise RuntimeError(
                    f"{output_path.name} page {page_index + 1} MCID {mcid} ParentTree reference is wrong",
                )
            if seen_tags.get(mcid) != leaf[1]:
                raise RuntimeError(
                    f"{output_path.name} page {page_index + 1} MCID {mcid} BDC tag does not match /S role",
                )

    if set(parent_entries) != set(page_parent_keys):
        raise RuntimeError(f"{output_path.name} ParentTree has missing or orphaned page entries")
    next_key = int(structure_root.get("/ParentTreeNextKey", -1))
    if next_key != (max(page_parent_keys, default=-1) + 1):
        raise RuntimeError(f"{output_path.name} ParentTreeNextKey is inconsistent")
    if set(leaves) != set(physical_leaf_order):
        raise RuntimeError(f"{output_path.name} structure leaves and marked content do not match")
    if logical_leaf_order != physical_leaf_order:
        raise RuntimeError(f"{output_path.name} logical structure order does not match content order")


def build_guide(lesson: dict, output_path: Path, slot: int) -> None:
    register_fonts()
    registry = StructureRegistry()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    source_path = output_path.with_suffix(".untagged.pdf")
    document = SimpleDocTemplate(
        str(source_path),
        pagesize=LETTER,
        rightMargin=0.68 * inch,
        leftMargin=0.68 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title=clean_text(lesson["title"]),
        author="BMH Institute",
        subject="Internal learner guide",
        creator="BMH Institute deterministic accessible guide generator",
        initialFontName=FONT_REGULAR,
        initialFontSize=10,
        initialLeading=14,
        lang="en-US",
    )
    try:
        document.build(
            guide_story(lesson, styles(), slot),
            onFirstPage=page_decor,
            onLaterPages=page_decor,
            canvasmaker=partial(
                TaggedCanvas,
                invariant=1,
                pageCompression=1,
                initialFontName=FONT_REGULAR,
                initialFontSize=10,
                initialLeading=14,
                structure_registry=registry,
            ),
        )
        apply_accessibility_structure(
            source_path,
            output_path,
            registry,
            clean_text(lesson["title"]),
            slot,
        )
    finally:
        source_path.unlink(missing_ok=True)


def content_lessons(manifest: dict) -> list[dict]:
    return [
        lesson
        for course in manifest["program"]["courses"]
        for module in course["modules"]
        for lesson in module["lessons"]
        if lesson["type"] == "content"
    ]


def build_all(*, check: bool) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    lessons = content_lessons(manifest)
    if len(lessons) != 19:
        raise RuntimeError(f"Expected 19 content lessons, found {len(lessons)}")
    assets = {asset["source_key"]: asset for asset in manifest["assets"]}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mismatches: list[str] = []

    temp_parent = ROOT / "tmp" / "pdfs"
    temp_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="guide-build-", dir=temp_parent) as temp_dir:
        build_dir = Path(temp_dir)
        for slot, lesson in enumerate(lessons, start=1):
            guide_block = next(
                block for block in lesson["blocks"]
                if block["source_key"].startswith("block-guide-pdf-slot-")
            )
            asset = assets[guide_block["content"]["asset_key"]]
            filename = f"slot-{slot:02d}-learner-guide.pdf"
            built_path = build_dir / filename
            committed_path = OUTPUT_DIR / filename
            build_guide(lesson, built_path, slot)
            payload = built_path.read_bytes()
            checksum = hashlib.sha256(payload).hexdigest()
            storage_path = f"courses/bmh-employee-training/v1/guides/guide-slot-{slot:02d}.{checksum}.pdf"

            if check:
                if not committed_path.is_file() or committed_path.read_bytes() != payload:
                    mismatches.append(f"{filename}: committed bytes do not match deterministic rebuild")
                if asset.get("checksum_sha256") != checksum:
                    mismatches.append(f"{filename}: manifest checksum does not match rebuild")
                if asset.get("size_bytes") != len(payload):
                    mismatches.append(f"{filename}: manifest size does not match rebuild")
                if asset.get("storage_path") != storage_path:
                    mismatches.append(f"{filename}: manifest storage path does not match rebuild")
                if guide_block["content"].get("file_path") != storage_path:
                    mismatches.append(f"{filename}: guide block path does not match rebuild")
                if guide_block["content"].get("size_bytes") != len(payload):
                    mismatches.append(f"{filename}: guide block size does not match rebuild")
                continue

            built_path.replace(committed_path)
            asset.update({
                "local_path": str(committed_path.relative_to(ROOT)),
                "storage_path": storage_path,
                "checksum_sha256": checksum,
                "size_bytes": len(payload),
                # A deterministic rebuild is not approval. The manifest builder
                # promotes only bytes accepted by the checksum-bound course-QA ledger.
                "approval_status": "missing",
            })
            guide_block["content"].update({
                "file_path": storage_path,
                "size_bytes": len(payload),
            })

    if mismatches:
        raise SystemExit("Guide reproducibility check failed:\n- " + "\n- ".join(mismatches))
    if check:
        print(f"Verified deterministic rebuild of {len(lessons)} accessible learner guides")
        return

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(lessons)} accessible learner guides in {OUTPUT_DIR}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="regenerate PDFs and update manifest hashes (default)")
    mode.add_argument("--check", action="store_true", help="rebuild in temp and compare without writing")
    args = parser.parse_args()
    build_all(check=args.check)


if __name__ == "__main__":
    main()
