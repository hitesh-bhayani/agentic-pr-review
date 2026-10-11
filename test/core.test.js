import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractIssueRefs, buildDiff, findOverlaps } from '../src/context.js';
import { parseReview } from '../src/prompt.js';
import { renderComment, shouldFail, MARKER } from '../src/render.js';
import { adfToText } from '../src/jira.js';

test('extracts Jira keys from title and branch, GitHub refs from closing keywords', () => {
  const refs = extractIssueRefs('PROJ-42: add export\n\nFixes #12, refs #15', 'feature/WEB-7-export');
  assert.deepEqual(refs.jira.sort(), ['PROJ-42', 'WEB-7']);
  assert.deepEqual(refs.github, [12, 15]);
});

test('ignores bare #numbers without a closing keyword', () => {
  assert.deepEqual(extractIssueRefs('see #99 for context').github, []);
});

test('buildDiff keeps source files ahead of lockfiles within budget', () => {
  const files = [
    { filename: 'package-lock.json', status: 'modified', additions: 900, deletions: 10, patch: 'x'.repeat(500) },
    { filename: 'src/app.js', status: 'modified', additions: 3, deletions: 1, patch: '+const a = 1;' },
  ];
  const diff = buildDiff(files, 200);
  assert.match(diff.text, /src\/app\.js/);
  assert.deepEqual(diff.skipped, ['package-lock.json']);
});

test('findOverlaps reports only PRs sharing files', () => {
  const overlaps = findOverlaps([{ filename: 'a.js' }, { filename: 'b.js' }], [
    { number: 2, title: 'Two', files: ['b.js', 'c.js'] },
    { number: 3, title: 'Three', files: ['d.js'] },
  ]);
  assert.deepEqual(overlaps, [{ number: 2, title: 'Two', files: ['b.js'] }]);
});

test('parseReview tolerates code fences and fills defaults', () => {
  const review = parseReview('Here you go:\n```json\n{"summary":"Adds export","requirements":[{"requirement":"CSV","status":"met"}]}\n```');
  assert.equal(review.summary, 'Adds export');
  assert.deepEqual(review.regressions, []);
});

test('renderComment includes marker, table and human-in-the-loop note', () => {
  const md = renderComment(
    { summary: 'S', requirements: [{ requirement: 'a | b', status: 'partial', evidence: 'x.js' }], regressions: [], conflicts: [], questions: [] },
    { model: 'm' },
  );
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /a \\\| b/);
  assert.match(md, /human reviewer makes the final call/);
});

test('shouldFail respects the fail-on threshold', () => {
  const review = { requirements: [{ status: 'missing' }], regressions: [{ severity: 'low' }] };
  assert.equal(shouldFail(review, 'missing'), true);
  assert.equal(shouldFail(review, 'high'), false);
  assert.equal(shouldFail(review, 'never'), false);
});

test('adfToText flattens Jira rich text', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Export as CSV' }] }] };
  assert.equal(adfToText(adf).trim(), 'Export as CSV');
});
