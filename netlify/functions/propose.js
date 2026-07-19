// netlify/functions/propose.js
//
// Step 1 of the edit flow: take the editor's request + the target page,
// ask Claude to produce an updated version of that page, and return the
// new HTML plus a line-by-line diff for the editor to review.
//
// This function does NOT write anything. Nothing touches GitHub or the live
// site here — publishing happens only after the editor approves, in publish.js.
//
// Required environment variables (set in the Netlify dashboard, never in code):
//   ADMIN_PASSWORD   - the shared password for the /admin page
//   ANTHROPIC_API_KEY - your Claude API key (console.anthropic.com)
//   GITHUB_TOKEN     - fine-grained token with Contents read/write on the repo
//   GITHUB_REPO      - e.g. "cbolorinos/Gomde-University"
//   GITHUB_BRANCH    - e.g. "main" (optional, defaults to "main")

const CLAUDE_MODEL = 'claude-sonnet-5';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  // --- Auth: constant-ish password check -------------------------------
  if (!checkPassword(body.password)) {
    return json(401, { error: 'Wrong password' });
  }

  const { page, instruction, image } = body;
  if (!page || !instruction) {
    return json(400, { error: 'Missing page or instruction' });
  }
  if (!isSafePagePath(page)) {
    return json(400, { error: 'Invalid page path' });
  }

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  // --- Fetch the current version of the target page from GitHub --------
  let currentFile;
  try {
    currentFile = await githubGetFile(repo, page, branch);
  } catch (e) {
    return json(500, { error: 'Could not read page from GitHub: ' + e.message });
  }
  const currentHtml = currentFile.content;

  // --- Ask Claude to produce the edited page ---------------------------
  let newHtml;
  try {
    newHtml = await claudeEdit({ page, instruction, currentHtml, image });
  } catch (e) {
    return json(500, { error: 'Claude request failed: ' + e.message });
  }

  const diff = makeUnifiedDiff(currentHtml, newHtml, page);

  return json(200, {
    page,
    diff,
    newHtml,
    currentSha: currentFile.sha,
    unchanged: currentHtml === newHtml,
  });
};

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
async function claudeEdit({ page, instruction, currentHtml, image }) {
  const system =
    'You are a careful web editor working on a static HTML website for ' +
    'Kremsegg University. You will be given the FULL current source of one ' +
    'HTML page and an instruction describing a change. Return the COMPLETE ' +
    'updated HTML for that page and NOTHING else — no explanations, no code ' +
    'fences, no commentary. Preserve the existing structure, styling, ' +
    'indentation, <head> contents, scripts, and any content the instruction ' +
    'does not mention. Make the smallest change that satisfies the ' +
    'instruction. Keep the HTML valid. If an image is provided and the ' +
    'instruction asks to add or replace an image, reference it at the path ' +
    'the user specifies or at img/uploads/<filename> if none is given.';

  const content = [];
  if (image && image.data && image.media_type) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.media_type, data: image.data },
    });
  }
  content.push({
    type: 'text',
    text:
      'Page: ' + page + '\n\n' +
      'Instruction:\n' + instruction + '\n\n' +
      'Current full source of ' + page + ':\n\n' + currentHtml,
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 300));
  }
  const data = await res.json();
  let out = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Strip accidental code fences if the model added them.
  out = out.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!out.toLowerCase().includes('<html') && !out.toLowerCase().includes('<!doctype')) {
    throw new Error('Model did not return a full HTML document');
  }
  return out;
}

// ---------------------------------------------------------------------------
// GitHub (read)
// ---------------------------------------------------------------------------
async function githubGetFile(repo, path, branch) {
  const url =
    'https://api.github.com/repos/' + repo + '/contents/' +
    encodeURIComponent(path).replace(/%2F/g, '/') +
    '?ref=' + encodeURIComponent(branch);
  const res = await fetch(url, {
    headers: {
      authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      accept: 'application/vnd.github+json',
      'user-agent': 'gomde-admin',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!pw || typeof pw !== 'string') return false;
  if (pw.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= pw.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// Only allow editing .html files at the repo root (no traversal, no subdirs).
function isSafePagePath(p) {
  return /^[a-zA-Z0-9._-]+\.html$/.test(p) && !p.includes('..');
}

// Minimal unified-style diff (line based, LCS) — good enough for review.
function makeUnifiedDiff(a, b, name) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const n = al.length, m = bl.length;
  // LCS table
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = al[i] === bl[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) { out.push({ t: ' ', line: al[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', line: al[i] }); i++; }
    else { out.push({ t: '+', line: bl[j] }); j++; }
  }
  while (i < n) { out.push({ t: '-', line: al[i++] }); }
  while (j < m) { out.push({ t: '+', line: bl[j++] }); }

  // Collapse long runs of unchanged context to keep the diff readable.
  const CONTEXT = 3;
  const changed = out.map((o) => o.t !== ' ');
  const keep = new Array(out.length).fill(false);
  for (let k = 0; k < out.length; k++) {
    if (changed[k]) {
      for (let c = Math.max(0, k - CONTEXT); c <= Math.min(out.length - 1, k + CONTEXT); c++) keep[c] = true;
    }
  }
  const lines = ['--- a/' + name, '+++ b/' + name];
  let skipping = false;
  for (let k = 0; k < out.length; k++) {
    if (keep[k]) {
      lines.push(out[k].t + out[k].line);
      skipping = false;
    } else if (!skipping) {
      lines.push('@@ …unchanged… @@');
      skipping = true;
    }
  }
  return lines.join('\n');
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
