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


if __name__ == "__main__":
    unittest.main()
