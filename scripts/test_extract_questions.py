#!/usr/bin/env python3

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_questions import html_to_text


class HtmlToTextTests(unittest.TestCase):
    def test_removes_screen_reader_duplicate_but_keeps_visible_unit(self) -> None:
        source = (
            '<p>200,000 <span data-ssml-sub-alias="k m squared">'
            '<span aria-hidden="true">km<sup>2</sup></span>'
            '<span class="sr-only">k m squared</span></span></p>'
        )
        self.assertEqual(html_to_text(source), "200,000 km2")

    def test_blank_placeholder_is_not_duplicated(self) -> None:
        source = '<p>Choose <span aria-hidden="true">______</span><span class="sr-only">blank</span>.</p>'
        self.assertEqual(html_to_text(source), "Choose ______.")

    def test_removes_nested_screen_reader_long_description(self) -> None:
        source = '<p>Graph<div class="sr-only"><ul><li>Long description</li></ul></div>Question</p>'
        self.assertEqual(html_to_text(source), "GraphQuestion")


if __name__ == "__main__":
    unittest.main()
