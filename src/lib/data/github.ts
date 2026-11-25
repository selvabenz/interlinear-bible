/**
 * Publishing an imported book: the maintainer's browser opens a pull request on the app's GitHub
 * repository with the book's content/ files (no server involved). Merging the pull request runs
 * the deploy workflow, and the book is then on the site for every device.
 *
 * Authentication is a fine-grained personal access token limited to this repository
 * (Contents: read and write, Pull requests: read and write), stored only in this browser.
 */
import type { MapFile } from '../pipeline/remap';
import { formatMapFile } from '../pipeline/remap';

export const DEFAULT_REPO = 'selvabenz/interlinear-bible';
const API = 'https://api.github.com';

export class GitHubError extends Error {}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      msg += ` ${((await r.json()) as { message?: string }).message ?? ''}`;
    } catch {
      /* no body */
    }
    if (r.status === 401) msg = 'The GitHub token was not accepted (401). Check it in Settings.';
    if (r.status === 403 || r.status === 404) msg += ' — the token may lack access to this repository (Contents and Pull requests: read and write).';
    throw new GitHubError(`GitHub: ${msg.trim()}`);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

const repoPath = (repo: string) => {
  const m = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(repo);
  if (!m) throw new GitHubError(`“${repo}” is not a repository (owner/name)`);
  return `/repos/${m[1]}/${m[2]}`;
};

/** Check a token: returns the repository's default branch, or throws with a readable reason. */
export async function checkToken(token: string, repo: string): Promise<{ defaultBranch: string; login: string }> {
  const info = await gh<{ default_branch: string; permissions?: { push?: boolean } }>(token, repoPath(repo));
  if (info.permissions && !info.permissions.push) throw new GitHubError('This token can read the repository but not write to it.');
  const user = await gh<{ login: string }>(token, '/user').catch(() => ({ login: '' }));
  return { defaultBranch: info.default_branch, login: user.login };
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(data: string): string {
  const bin = atob(data.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** A file on the default branch, or null. */
async function readFile(token: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const f = await gh<{ content?: string; encoding?: string }>(token, `${repoPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
    return f.content && f.encoding === 'base64' ? unb64(f.content) : null;
  } catch (e) {
    if (e instanceof GitHubError && / 404 /.test(` ${e.message} `)) return null;
    return null;
  }
}

export interface PublishInput {
  token: string;
  repo: string;
  /** repository path → file text */
  files: Record<string, string>;
  /** map files by repository path; existing hand `overrides` in the repository are kept */
  maps: Record<string, MapFile>;
  branch: string;
  title: string;
  body: string;
}

export interface PublishResult {
  url: string;
  number: number;
  branch: string;
  files: string[];
}

/** Create a branch with one commit holding `files` and open a pull request against the default branch. */
export async function publishPullRequest(p: PublishInput): Promise<PublishResult> {
  const R = repoPath(p.repo);
  const { defaultBranch } = await checkToken(p.token, p.repo);
  const head = await gh<{ object: { sha: string } }>(p.token, `${R}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  const baseCommit = await gh<{ tree: { sha: string } }>(p.token, `${R}/git/commits/${head.object.sha}`);

  const files: Record<string, string> = { ...p.files };
  for (const [path, map] of Object.entries(p.maps)) {
    const old = await readFile(p.token, p.repo, path, defaultBranch);
    let overrides = map.overrides ?? {};
    if (old) {
      try {
        overrides = { ...(JSON.parse(old) as MapFile).overrides, ...overrides };
      } catch {
        /* unreadable old map: replace it */
      }
    }
    files[path] = formatMapFile({ ...map, overrides });
  }

  const tree = await Promise.all(
    Object.entries(files).map(async ([path, text]) => {
      const blob = await gh<{ sha: string }>(p.token, `${R}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: b64(text), encoding: 'base64' }) });
      return { path, mode: '100644', type: 'blob', sha: blob.sha };
    })
  );
  const newTree = await gh<{ sha: string }>(p.token, `${R}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
  const commit = await gh<{ sha: string }>(p.token, `${R}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: `${p.title}\n\n${p.body}`, tree: newTree.sha, parents: [head.object.sha] })
  });
  await gh(p.token, `${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${p.branch}`, sha: commit.sha }) });
  const pr = await gh<{ html_url: string; number: number }>(p.token, `${R}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: p.title, head: p.branch, base: defaultBranch, body: p.body, maintainer_can_modify: true })
  });
  return { url: pr.html_url, number: pr.number, branch: p.branch, files: Object.keys(files) };
}
