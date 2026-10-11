// Runs src/review.js end to end with GitHub and Anthropic HTTP calls faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reviews a PR and posts one marked comment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apr-'));
  const eventPath = join(dir, 'event.json');
  const outputPath = join(dir, 'output');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7 } }));
  writeFileSync(outputPath, '');

  Object.assign(process.env, {
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'acme/web',
    INPUT_GITHUB_TOKEN: 'gh-token',
    INPUT_ANTHROPIC_API_KEY: 'sk-test',
    INPUT_MODEL: 'claude-sonnet-5-5',
    INPUT_FAIL_ON: 'never',
  });

  const posted = [];
  let sentPrompt = '';
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.anthropic.com')) {
      sentPrompt = JSON.parse(init.body).messages[0].content;
      const review = {
        summary: 'Adds CSV export to the reports page.',
        requirements: [{ requirement: 'Export current view as CSV', status: 'met', evidence: 'src/export.js' }],
        regressions: [{ risk: 'Large reports may block the UI thread', file: 'src/export.js', severity: 'medium' }],
        conflicts: [{ pr: 9, note: 'Also edits src/export.js' }],
        questions: [],
      };
      return json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify(review) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    }
    const path = new URL(url).pathname.replace('/repos/acme/web', '');
    if (path === '/pulls/7') return json({ number: 7, title: 'Add CSV export', body: 'Fixes #3', head: { ref: 'feature/export' } });
    if (path === '/pulls/7/files') return json([{ filename: 'src/export.js', status: 'added', additions: 20, deletions: 0, patch: '+export function toCsv() {}' }]);
    if (path === '/pulls') return json([{ number: 7, title: 'Add CSV export' }, { number: 9, title: 'Refactor export' }]);
    if (path === '/pulls/9/files') return json([{ filename: 'src/export.js' }]);
    if (path === '/issues/3') return json({ title: 'Export reports', body: 'Users can export the current view as CSV.' });
    if (path === '/issues/7/comments' && (init.method || 'GET') === 'GET') return json([]);
    if (path === '/issues/7/comments' && init.method === 'POST') {
      posted.push(JSON.parse(init.body).body);
      return json({ id: 1 }, 201);
    }
    throw new Error(`Unexpected request: ${init.method || 'GET'} ${url}`);
  };

  await import('../src/review.js');
  for (let i = 0; i < 50 && posted.length === 0; i++) await new Promise((r) => setTimeout(r, 20));

  assert.match(sentPrompt, /Export reports/);
  assert.match(sentPrompt, /#9 "Refactor export" also changes: src\/export\.js/);
  assert.equal(posted.length, 1);
  assert.match(posted[0], /agentic-pr-review/);
  assert.match(posted[0], /✅ Met/);
  assert.match(posted[0], /🟠 Medium/);
  assert.match(readFileSync(outputPath, 'utf8'), /^review=/);
  assert.equal(process.exitCode ?? 0, 0);
});
