import { readFileSync, appendFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { extractIssueRefs, buildDiff, findOverlaps } from './context.js';
import { SYSTEM, buildPrompt, parseReview } from './prompt.js';
import { renderComment, shouldFail } from './render.js';
import { createGitHub } from './github.js';
import { createJira } from './jira.js';

const env = (name, fallback = '') => process.env[name] || fallback;

async function main() {
  const event = JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8'));
  const number = event.pull_request?.number;
  if (!number) throw new Error('agentic-pr-review only runs on pull_request events');

  const model = env('INPUT_MODEL', 'claude-sonnet-5-5');
  const gh = createGitHub({ token: env('INPUT_GITHUB_TOKEN'), repo: env('GITHUB_REPOSITORY'), apiUrl: env('GITHUB_API_URL', 'https://api.github.com') });
  const jira = createJira({ baseUrl: env('JIRA_BASE_URL'), email: env('JIRA_EMAIL'), token: env('JIRA_API_TOKEN') });

  const [pr, files, others] = await Promise.all([gh.getPull(number), gh.getPullFiles(number), gh.getOtherOpenPulls(number)]);

  const refs = extractIssueRefs(`${pr.title}\n${pr.body || ''}`, pr.head.ref);
  const tickets = [];
  for (const n of refs.github) {
    const issue = await gh.getIssue(n).catch(() => null);
    if (issue) tickets.push({ source: 'GitHub', key: `#${n}`, title: issue.title, body: issue.body });
  }
  if (jira) {
    for (const key of refs.jira) {
      const issue = await jira.getIssue(key).catch((e) => console.warn(e.message));
      if (issue) tickets.push(issue);
    }
  }

  const diff = buildDiff(files, Number(env('INPUT_MAX_DIFF_CHARS', '60000')));
  const overlaps = findOverlaps(files, others);

  const client = new Anthropic({ apiKey: env('INPUT_ANTHROPIC_API_KEY') });
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt({ pr, tickets, diff, overlaps }) }],
  });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const review = parseReview(text);

  await gh.upsertComment(number, renderComment(review, { model, skipped: diff.skipped }));
  console.log(`Reviewed PR #${number}: ${review.requirements.length} requirements, ${review.regressions.length} risks`);

  if (env('GITHUB_OUTPUT')) appendFileSync(env('GITHUB_OUTPUT'), `review=${JSON.stringify(review)}\n`);

  const failOn = env('INPUT_FAIL_ON', 'never');
  if (shouldFail(review, failOn)) {
    console.error(`Failing because fail-on=${failOn} matched`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
