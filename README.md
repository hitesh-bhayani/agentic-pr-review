# 🤖 Agentic PR Review

**[Live page](https://hitesh-bhayani.github.io/agentic-pr-review/)** · A GitHub Action that checks a pull request against **the ticket it claims to implement**, using Claude, and leaves one review comment that updates on every push.

Most AI review bots comment on style. This one answers the questions a reviewer actually has:

- **Does this PR do what the ticket asked?** Requirement-by-requirement coverage: met, partial, missing or unclear.
- **What could it break?** Likely regressions, with the file and a severity.
- **Does it clash with other open work?** Open PRs that touch the same files.
- **What should the author clarify?**

A human still makes the final call. By default the action only comments; it never approves or blocks.

## How it works

```
PR opened / updated
   │
   ├─ read the PR, its diff, and other open PRs            (GitHub API)
   ├─ find linked tickets: "Fixes #12", PROJ-42 in title/branch
   ├─ fetch ticket text                                     (GitHub Issues, optional Jira)
   ├─ ask Claude for a structured JSON review
   └─ render it as one comment, updated in place
```

Large diffs are trimmed to a character budget, keeping source files ahead of lockfiles and generated output, and the comment lists anything that was left out.

## Usage

```yaml
# .github/workflows/pr-review.yml
name: PR review
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: hitesh-bhayani/agentic-pr-review@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
        # Optional: read Jira tickets too
        env:
          JIRA_BASE_URL: https://your-company.atlassian.net
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
```

### Inputs

| Input | Default | Description |
|---|---|---|
| `anthropic-api-key` | required | Anthropic API key |
| `github-token` | `github.token` | Token used to read the PR and post the comment |
| `model` | `claude-sonnet-5-5` | Claude model |
| `fail-on` | `never` | `missing` fails the check if a requirement is missing; `high` fails on a high-severity regression |
| `max-diff-chars` | `60000` | Diff budget sent to the model |

The `review` output contains the structured review as JSON, so later steps can use it.

## Example comment

> ## 🤖 Agentic PR review
> Adds CSV export to the reports page.
>
> ### Requirement coverage
> | Requirement | Status | Evidence |
> |---|---|---|
> | Export current view as CSV | ✅ Met | `src/export.js` |
> | Respect active filters | 🟡 Partial | Date filter applied, column filter ignored |
>
> ### Possible regressions
> - 🟠 Medium Large reports may block the UI thread (`src/export.js`)
>
> ### Overlap with other open PRs
> - #9: Also edits `src/export.js`; merge order matters.

## Design notes

- **Advisory by default.** The goal is to give a reviewer a head start, not to gate merges on a model's opinion. `fail-on` exists for teams that want it.
- **One comment per PR.** The comment is found by a hidden marker and edited in place, so pushes don't create noise.
- **Ticket first.** Without a linked ticket the review falls back to the PR description and says so.
- **No build step.** Plain Node 20 ES modules, one runtime dependency (`@anthropic-ai/sdk`).

## Development

```bash
npm install
npm test   # unit tests + an end-to-end run with GitHub and Anthropic faked
```

## License

MIT
