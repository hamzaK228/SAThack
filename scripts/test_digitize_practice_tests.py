import unittest
from unittest.mock import patch

from PIL import Image

from digitize_practice_tests import lines_in, read_marker


class ImportTests(unittest.TestCase):
    def test_missing_templates_falls_back_to_ocr(self):
        with patch("digitize_practice_tests.ocr", return_value=12) as reader:
            self.assertEqual(read_marker(Image.new("RGB", (30, 30), "black"), "tesseract"), 12)
            reader.assert_called_once()

    def test_unreadable_number_is_not_guessed(self):
        with patch("digitize_practice_tests.ocr", return_value=None):
            self.assertIsNone(read_marker(Image.new("RGB", (30, 30), "black"), "tesseract"))

    def test_words_are_grouped_only_inside_question_crop(self):
        words = [dict(left="10", top="20", block_num="1", par_num="1", line_num="1", text="First"),
                 dict(left="40", top="20", block_num="1", par_num="1", line_num="1", text="question"),
                 dict(left="110", top="20", block_num="1", par_num="1", line_num="1", text="Other")]
        self.assertEqual(lines_in(words, (0, 0, 100, 100)), ["First question"])


if __name__ == "__main__":
    unittest.main()
