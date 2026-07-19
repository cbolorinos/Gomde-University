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

  // --- Ask Claude for a small set of find/replace edits ----------------
  // We deliberately do NOT ask for the whole rewritten file: emitting a full
  // 16KB page is thousands of output tokens and blows past the serverless
  // timeout. Instead the model returns tiny exact find/replace pairs that we
  // apply here — a few dozen tokens, back in a couple of seconds.
  let edits, note;
  try {
    ({ edits, note } = await claudeEdits({ page, instruction, currentHtml, image }));
  } catch (e) {
    return json(500, { error: 'Claude request failed: ' + e.message });
  }

  if (!edits || edits.length === 0) {
    return json(200, { unchanged: true, note: note || 'No change was produced.' });
  }

  // Apply the edits, validating each find string exists.
  let newHtml = currentHtml;
  const notFound = [];
  for (const ed of edits) {
    if (typeof ed.find !== 'string' || ed.find === '' || typeof ed.replace !== 'string') continue;
    if (!newHtml.includes(ed.find)) { notFound.push(ed.find.slice(0, 60)); continue; }
    newHtml = newHtml.split(ed.find).join(ed.replace); // replace all occurrences
  }

  if (notFound.length) {
    return json(422, {
      error:
        'The assistant referenced text it could not find on the page. ' +
        'Try rephrasing, or quote the exact wording. Unmatched: ' +
        notFound.map((s) => JSON.stringify(s)).join(', '),
    });
  }

  const diff = makeUnifiedDiff(currentHtml, newHtml, page);

  return json(200, {
    page,
    diff,
    newHtml,
    note: note || '',
    currentSha: currentFile.sha,
    unchanged: currentHtml === newHtml,
  });
};

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
async function claudeEdits({ page, instruction, currentHtml, image }) {
  const system =
    'You are a careful web editor for the static HTML site of Kremsegg ' +
    'University. You receive the FULL source of one HTML page and an ' +
    'instruction. You do NOT rewrite the page. Instead you return a JSON ' +
    'object describing the minimal set of find/replace edits needed:\n\n' +
    '{"edits":[{"find":"<exact substring copied verbatim from the source>",' +
    '"replace":"<the new text>"}],"note":"<short summary of what you changed>"}\n\n' +
    'Rules:\n' +
    '- Each "find" MUST be an exact, verbatim substring of the current ' +
    'source, including original whitespace, casing and punctuation. Copy it ' +
    'precisely; do not paraphrase.\n' +
    '- Make "find" long enough to be unambiguous, but keep "replace" minimal.\n' +
    '- If the same text should change everywhere it appears, one edit is fine ' +
    '(all occurrences of "find" are replaced).\n' +
    '- To style text (e.g. make it gold), wrap it in a <span style="..."> in ' +
    'the "replace" value. Use the site\'s gold tone #b08d57 unless told ' +
    'otherwise.\n' +
    '- If an image is provided and should be placed on the page, reference it ' +
    'at the path given, or at img/uploads/<filename>.\n' +
    '- Return ONLY the JSON object. No markdown, no code fences, no prose ' +
    'outside the JSON. If nothing should change, return {"edits":[],"note":' +
    '"..."}.';

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
      max_tokens: 4000,
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

  // Strip accidental code fences, then pull out the JSON object.
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Model did not return JSON edits');
  }
  let parsed;
  try {
    parsed = JSON.parse(out.slice(start, end + 1));
  } catch (e) {
    throw new Error('Could not parse edits JSON: ' + e.message);
  }
  return { edits: Array.isArray(parsed.edits) ? parsed.edits : [], note: parsed.note || '' };
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
