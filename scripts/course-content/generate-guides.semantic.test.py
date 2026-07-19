#!/usr/bin/env python3
"""Negative tests for the learner-guide PDF semantic graph validator."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Callable

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

ROOT = Path(__file__).resolve().parents[2]
GENERATOR_PATH = ROOT / "scripts/course-content/generate-guides.py"
SOURCE_PDF = ROOT / "output/pdf/slot-01-learner-guide.pdf"

SPEC = importlib.util.spec_from_file_location("bmh_generate_guides", GENERATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load guide generator from {GENERATOR_PATH}")
GENERATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = GENERATOR
SPEC.loader.exec_module(GENERATOR)


def graph_objects(writer: PdfWriter):
    root = writer._root_object
    structure_root_ref = root.raw_get("/StructTreeRoot")
    structure_root = structure_root_ref.get_object()
    document_ref = structure_root.raw_get("/K")
    document = document_ref.get_object()
    return structure_root_ref, structure_root, document_ref, document


def corrupt_parent_tree(writer: PdfWriter) -> None:
    _, structure_root, _, _ = graph_objects(writer)
    numbers = structure_root["/ParentTree"]["/Nums"]
    page_zero = numbers[1]
    page_zero[0], page_zero[1] = page_zero[1], page_zero[0]


def corrupt_parent_backlink(writer: PdfWriter) -> None:
    structure_root_ref, _, _, document = graph_objects(writer)
    first_leaf = document.raw_get("/K")[0].get_object()
    first_leaf[NameObject("/P")] = structure_root_ref


def remove_leaf_page(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    first_leaf = document.raw_get("/K")[0].get_object()
    del first_leaf[NameObject("/Pg")]


def remove_leaf_mcid(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    first_leaf = document.raw_get("/K")[0].get_object()
    del first_leaf[NameObject("/K")]


def duplicate_structure_child(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    children = document.raw_get("/K")
    children[1] = children[0]


def orphan_structure_child(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    del document.raw_get("/K")[0]


def mismatch_semantic_role(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    first_leaf = document.raw_get("/K")[0].get_object()
    first_leaf[NameObject("/S")] = NameObject("/H1")


def reverse_logical_order(writer: PdfWriter) -> None:
    _, _, _, document = graph_objects(writer)
    children = document.raw_get("/K")
    children[0], children[1] = children[1], children[0]


class SemanticGraphValidationTests(unittest.TestCase):
    def write_corruption(
        self,
        directory: Path,
        name: str,
        mutation: Callable[[PdfWriter], None],
    ) -> Path:
        reader = PdfReader(SOURCE_PDF)
        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        writer.pdf_header = reader.pdf_header
        mutation(writer)
        destination = directory / f"{name}.pdf"
        writer.write(destination)
        return destination

    def test_committed_guide_has_a_coherent_semantic_graph(self) -> None:
        GENERATOR.validate_accessible_pdf(SOURCE_PDF)

    def test_each_corrupted_semantic_graph_fails_closed(self) -> None:
        corruptions = [
            ("parent-tree", corrupt_parent_tree, r"ParentTree reference is wrong"),
            ("parent-backlink", corrupt_parent_backlink, r"wrong /P backlink"),
            ("leaf-page", remove_leaf_page, r"leaf /Pg and integer /K together"),
            ("leaf-mcid", remove_leaf_mcid, r"leaf /Pg and integer /K together"),
            ("duplicate", duplicate_structure_child, r"duplicated or cyclic"),
            ("orphan", orphan_structure_child, r"no reachable structure leaf"),
            ("role", mismatch_semantic_role, r"BDC tag does not match /S role"),
            ("order", reverse_logical_order, r"logical structure order does not match"),
        ]
        with tempfile.TemporaryDirectory(prefix="guide-semantic-negative-") as temp_dir:
            directory = Path(temp_dir)
            for name, mutation, message in corruptions:
                with self.subTest(corruption=name):
                    corrupted = self.write_corruption(directory, name, mutation)
                    with self.assertRaisesRegex(RuntimeError, message):
                        GENERATOR.validate_accessible_pdf(corrupted)


if __name__ == "__main__":
    unittest.main()
