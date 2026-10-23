import assert from 'node:assert/strict';
import test from 'node:test';
import { splitMath, mathTextToHtml, richToHtml } from '../src/lib/math-text.ts';

test('currency preserves prose spacing and does not become math', () => {
  const prose = String.raw`Lorenzo paid \$2 for cereal and \$1.90 per pound, a total of \$9.60. Find $p$.`;
  const parts = splitMath(prose);
  assert.deepEqual(parts.filter(part => part.math), [{ math: true, value: 'p' }]);
  assert.match(mathTextToHtml(prose), /paid \$2 for cereal and \$1\.90 per pound, a total of \$9\.60/);
  assert.match(richToHtml(`<p>${prose}</p>`), /paid \$2 for cereal and \$1\.90 per pound/);
});

test('math can contain escaped dollars', () => {
  assert.deepEqual(splitMath(String.raw`$\text{\$35} + x$`), [{ math: true, value: String.raw`\text{\$35} + x` }]);
});

test('SVG labels and attributes remain unchanged', () => {
  const svg = '<svg><text>$x$</text></svg>';
  assert.equal(richToHtml(svg), svg);
  assert.equal(richToHtml('<img alt="$x$" src="figure.png">'), '<img alt="$x$" src="figure.png">');
});

test('plain text stays safely escaped', () => {
  assert.equal(mathTextToHtml('<script> & \\$2'), '&lt;script&gt; &amp; $2');
  assert.deepEqual(splitMath('unfinished $x'), [{ math: false, value: 'unfinished $x' }]);
});

test('unsafe rich markup is rejected before rendering', () => {
  assert.equal(richToHtml('<img src="x" onerror="alert(1)">'), '');
  assert.equal(richToHtml('<svg><script>alert(1)</script></svg>'), '');
  assert.equal(richToHtml('<a href="javascript:alert(1)">open</a>'), '');
});

test('screen-reader blank labels do not appear next to printed underscores', () => {
  assert.equal(mathTextToHtml('around the ______blank When'), 'around the ______ When');
  assert.equal(mathTextToHtml('Fill in the blank.'), 'Fill in the blank.');
});

test('chat markdown-lite: bold renders, headings strip, injection stays escaped', () => {
  assert.equal(
    mathTextToHtml('**two-pass pacing** wins'),
    '<strong>two-pass pacing</strong> wins',
  );
  // The renderer deliberately turns Markdown-style list markers into a bullet.
  assert.equal(mathTextToHtml('### Pass 1\n- flag it'), 'Pass 1\n• flag it');
  // Bold is applied after escaping, so it can never smuggle in markup.
  assert.equal(
    mathTextToHtml('**<script>alert(1)</script>**'),
    '<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>',
  );
  // Question-style hashes without a following space are untouched.
  assert.equal(mathTextToHtml('Question #5 of 22'), 'Question #5 of 22');
  // Markdown inside a math run is left for KaTeX.
  assert.match(mathTextToHtml('$x^2$ **bold**'), /<strong>bold<\/strong>/);
});

test('currency prose between two $ signs renders literally, not as math', () => {
  // The boat-rental class of stored question text: two raw currency dollars.
  const text = 'The boat rental costs $60 per hour, and she will also have to pay for a water safety course that costs $15.';
  const rendered = mathTextToHtml(text);
  assert.match(rendered, /\$60 per hour/);
  assert.match(rendered, /costs \$15/);
  assert.equal(rendered.includes('katex'), false);
});

test('real math and math-wrapped numbers still render via KaTeX', () => {
  assert.match(mathTextToHtml('A length of $4$ inches and $x^2-5x+6=0$.'), /katex/);
  assert.match(mathTextToHtml('She earns $13.50z$ dollars.'), /katex/);
  assert.match(mathTextToHtml('An initial value of $\\$890$ doubled every $10$ years.'), /katex/);
});

test('latex commands and \\text runs are never treated as prose', () => {
  assert.match(mathTextToHtml('$35\\text{miles per hour}$'), /katex/);
  assert.match(mathTextToHtml('$\\frac{8-\\sqrt{k}}{4}$'), /katex/);
});
