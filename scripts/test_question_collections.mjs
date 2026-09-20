import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isCorrectAnswer } from '../src/lib/question-answer.ts';

test('MSDC collections include each source question exactly once', () => {
  const collections = JSON.parse(readFileSync(new URL('../src/data/question-collections.json', import.meta.url)));
  assert.deepEqual(collections.map(item => item.sourceIds.length), [120, 150]);
  const ids = collections.flatMap(item => item.sourceIds);
  assert.equal(new Set(ids).size, 270);
  assert.ok(ids.every(id => /^[a-f0-9]{8}$/.test(id)));
});

test('printed alternative numeric answers are accepted', () => {
  assert.ok(isCorrectAnswer('16', '10, 16'));
  assert.ok(isCorrectAnswer('10', '10, 16'));
  assert.ok(isCorrectAnswer('.9538', '.9538, 62/65'));
  assert.ok(isCorrectAnswer('13/2', '6.5, 13/2'));
  assert.ok(isCorrectAnswer('6.5', '13/2'));
  assert.ok(!isCorrectAnswer('11', '10, 16'));
  assert.ok(!isCorrectAnswer('', '13/2'));
  assert.ok(!isCorrectAnswer('1/0', '13/2'));
});

test('multiple choice remains case insensitive', () => {
  assert.ok(isCorrectAnswer(' d ', 'D'));
  assert.ok(!isCorrectAnswer('C', 'D'));
});
