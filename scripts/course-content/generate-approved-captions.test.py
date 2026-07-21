import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("generate-approved-captions.py")
SPEC = importlib.util.spec_from_file_location("generate_approved_captions", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CaptionGeneratorTests(unittest.TestCase):
    def test_clean_text_keeps_thousands_groups_together(self):
        self.assertEqual(MODULE.clean_text("$12 , 000"), "$12,000")

    def test_repair_cue_boundaries_joins_hyphenated_words(self):
        cues = [
            {"start": 1.0, "end": 2.0, "text": "use post"},
            {"start": 2.0, "end": 3.0, "text": "-possession timing"},
        ]

        self.assertEqual(
            MODULE.repair_cue_boundaries(cues),
            [
                {"start": 1.0, "end": 2.0, "text": "use"},
                {"start": 2.0, "end": 3.0, "text": "post-possession timing"},
            ],
        )

    def test_repair_cue_boundaries_normalizes_split_company_name(self):
        cues = [
            {"start": 1.0, "end": 2.0, "text": "the BMH"},
            {"start": 2.0, "end": 3.0, "text": "group standard"},
        ]

        self.assertEqual(MODULE.repair_cue_boundaries(cues)[1]["text"], "Group standard")

    def test_normalize_cues_merges_short_fast_segments_and_preserves_prose(self):
        cues = [
            {"start": 0.0, "end": 0.25, "text": "This segment is much too fast"},
            {"start": 0.25, "end": 4.0, "text": "but the combined timing can support it."},
        ]

        normalized = MODULE.normalize_cues_for_readability(cues)

        self.assertEqual(
            " ".join(cue["text"] for cue in normalized),
            "This segment is much too fast but the combined timing can support it.",
        )
        for cue in normalized:
            duration = cue["end"] - cue["start"]
            self.assertGreaterEqual(duration + 0.000001, MODULE.MIN_CUE_DURATION_SECONDS)
            self.assertLessEqual(
                len(cue["text"]) / duration,
                MODULE.MAX_CHARACTERS_PER_SECOND + 0.000001,
            )

    def test_normalize_cues_reflows_long_text_to_two_line_sized_chunks(self):
        text = " ".join(["seller-conversation"] * 12)
        normalized = MODULE.normalize_cues_for_readability([
            {"start": 1.0, "end": 14.0, "text": text},
        ])

        self.assertGreater(len(normalized), 1)
        self.assertTrue(all(len(cue["text"]) <= MODULE.MAX_CUE_CHARACTERS for cue in normalized))
        self.assertEqual(" ".join(cue["text"] for cue in normalized), text)


if __name__ == "__main__":
    unittest.main()
