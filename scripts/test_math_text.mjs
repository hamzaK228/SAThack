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
