export const SYSTEM = `You are a senior engineer reviewing a pull request against the ticket it claims to implement.
Your job is to help a human reviewer, not to replace them. Be specific, cite files, and say when you are unsure.
Do not comment on style or formatting that a linter would catch.

Respond with JSON only, matching this shape:
{
  "summary": "one or two sentences on what the PR does",
  "requirements": [
    { "requirement": "a requirement from the ticket", "status": "met" | "partial" | "missing" | "unclear", "evidence": "file/line or reasoning" }
  ],
  "regressions": [
    { "risk": "what could break", "file": "path", "severity": "high" | "medium" | "low" }
  ],
  "conflicts": [
    { "pr": 123, "note": "why the overlap matters" }
  ],
  "questions": ["things the author should clarify"]
}`;

export function buildPrompt({ pr, tickets, diff, overlaps }) {
  const ticketText = tickets.length
    ? tickets.map((t) => `## ${t.source} ${t.key}: ${t.title}\n${t.body || '(no description)'}`).join('\n\n')
    : '(No linked ticket found. Infer intent from the PR description and say so in the summary.)';

  const overlapText = overlaps.length
    ? overlaps.map((o) => `- #${o.number} "${o.title}" also changes: ${o.files.join(', ')}`).join('\n')
    : '(none)';

  return `# Pull request #${pr.number}: ${pr.title}
${pr.body || '(no description)'}

# Linked ticket(s)
${ticketText}

# Other open PRs touching the same files
${overlapText}

# Diff
${diff.text}
${diff.skipped.length ? `\n(Omitted for size: ${diff.skipped.join(', ')})` : ''}`;
}

// Models sometimes wrap JSON in prose or a code fence; take the outermost object.
export function parseReview(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model response did not contain JSON');
  const data = JSON.parse(text.slice(start, end + 1));
  return {
    summary: data.summary || '',
    requirements: data.requirements || [],
    regressions: data.regressions || [],
    conflicts: data.conflicts || [],
    questions: data.questions || [],
  };
}
