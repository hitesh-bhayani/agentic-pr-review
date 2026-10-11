import { MARKER } from './render.js';

export function createGitHub({ token, repo, apiUrl = 'https://api.github.com' }) {
  async function call(path, init = {}) {
    const res = await fetch(`${apiUrl}/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  async function paged(path) {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await call(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  return {
    getPull: (n) => call(`/pulls/${n}`),
    getPullFiles: (n) => paged(`/pulls/${n}/files`),
    getIssue: (n) => call(`/issues/${n}`),

    async getOtherOpenPulls(exclude, limit = 20) {
      const open = (await call(`/pulls?state=open&per_page=${limit}`)).filter((p) => p.number !== exclude);
      return Promise.all(
        open.map(async (p) => ({ number: p.number, title: p.title, files: (await paged(`/pulls/${p.number}/files`)).map((f) => f.filename) })),
      );
    },

    // One review comment per PR, updated in place on every push.
    async upsertComment(n, body) {
      const comments = await paged(`/issues/${n}/comments`);
      const existing = comments.find((c) => c.body?.includes(MARKER));
      if (existing) return call(`/issues/comments/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
      return call(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    },
  };
}
