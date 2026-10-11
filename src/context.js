// Pure helpers: find linked tickets, shape the diff, detect overlap with other open PRs.

const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;
const GITHUB_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+#(\d+)\b/gi;

export function extractIssueRefs(text = '', branch = '') {
  const haystack = `${text}\n${branch}`;
  const jira = [...new Set([...haystack.matchAll(JIRA_KEY)].map((m) => m[1]))];
  const github = [...new Set([...text.matchAll(GITHUB_REF)].map((m) => Number(m[1])))];
  return { jira, github };
}

// Keep the most relevant parts of a large diff within a character budget.
// Source files are kept before lockfiles, snapshots and generated output.
const LOW_SIGNAL = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.snap$|(^|\/)(dist|build|vendor)\//;

export function buildDiff(files, maxChars = 60000) {
  const ordered = [...files].sort((a, b) => Number(LOW_SIGNAL.test(a.filename)) - Number(LOW_SIGNAL.test(b.filename)));
  const parts = [];
  const skipped = [];
  let used = 0;
  for (const f of ordered) {
    const header = `### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n`;
    const body = f.patch ? `${f.patch}\n` : '(binary or too large to show)\n';
    const chunk = header + body;
    if (used + chunk.length > maxChars) {
      skipped.push(f.filename);
      continue;
    }
    parts.push(chunk);
    used += chunk.length;
  }
  return { text: parts.join('\n'), skipped };
}

// Files this PR touches that other open PRs also touch: likely merge conflicts or semantic clashes.
export function findOverlaps(myFiles, otherPrs) {
  const mine = new Set(myFiles.map((f) => f.filename));
  return otherPrs
    .map((pr) => ({ number: pr.number, title: pr.title, files: pr.files.filter((name) => mine.has(name)) }))
    .filter((pr) => pr.files.length > 0);
}
