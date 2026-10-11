// Optional: fetch Jira tickets when JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are set.

// Jira Cloud returns descriptions as Atlassian Document Format; flatten it to plain text.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join('');
  return ['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type) ? `${inner}\n` : inner;
}

export function createJira({ baseUrl, email, token }) {
  if (!baseUrl || !email || !token) return null;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    async getIssue(key) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${key}?fields=summary,description`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Jira ${key} failed: ${res.status}`);
      const data = await res.json();
      return { source: 'Jira', key, title: data.fields.summary, body: adfToText(data.fields.description).trim() };
    },
  };
}
