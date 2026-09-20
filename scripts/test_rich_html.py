import unittest

from rich_html import sanitize_rich
from extract_active import rich_question_html
from backfill_question_media import build_row


class RichHtmlTests(unittest.TestCase):
    def test_image_keeps_source_and_alt(self):
        markup = sanitize_rich('<p><img src="https://example.com/graph.png" alt="Graph" onerror="alert(1)"></p>')
        self.assertIn('src="https://example.com/graph.png"', markup)
        self.assertIn('alt="Graph"', markup)
        self.assertNotIn('onerror', markup)

    def test_table_keeps_cell_attributes(self):
        markup = sanitize_rich('<table><tr><th scope="col" colspan="2">Values</th></tr></table>')
        self.assertIn('scope="col"', markup)
        self.assertIn('colspan="2"', markup)

    def test_svg_clip_path_does_not_close_the_graph(self):
        markup = sanitize_rich('<svg viewBox="0 0 10 10"><defs><clipPath id="clip"><rect width="10" height="10"></rect></clipPath></defs><g clip-path="url(#clip)"><path d="M0 0L10 10"></path></g></svg>')
        self.assertIn('</clipPath></defs><g', markup)
        self.assertIn('<path d="M0 0L10 10">', markup)
        self.assertEqual(markup.count('</svg>'), 1)

    def test_svg_title_and_following_graph_survive(self):
        markup = sanitize_rich('<svg><title>Graph</title><path d="M0 0L1 1"></path></svg>')
        self.assertIn('<title>Graph</title><path', markup)

    def test_active_content_is_removed(self):
        markup = sanitize_rich('<svg><script>alert(1)</script><foreignObject><p>Unsafe</p></foreignObject><path d="M0 0"></path></svg>')
        self.assertNotIn('alert', markup)
        self.assertNotIn('Unsafe', markup)

    def test_active_question_keeps_diagrams_and_converts_equations(self):
        markup = rich_question_html('<img class="math-img" alt="2" src="data:image/png;base64,AA=="><img alt="Triangle" src="data:image/png;base64,AQ==">')
        self.assertIn('$2$', markup)
        self.assertIn('alt="Triangle"', markup)
        self.assertIn('src="data:image/png;base64,AQ=="', markup)
        self.assertNotIn('AA==', markup)

    def test_backfill_keeps_choice_text(self):
        row = build_row({'questionId': 'sample'}, {'answerOptions': [
            {'content': '<p>First answer</p>'},
            {'content': '<img src="https://example.com/graph.png" alt="Graph">'},
        ]})
        self.assertEqual(row['choices'][0]['text'], 'First answer')
        self.assertIn('src=', row['choices'][1]['html'])


if __name__ == '__main__':
    unittest.main()
