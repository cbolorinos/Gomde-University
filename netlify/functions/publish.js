// netlify/functions/publish.js
//
// Step 2 of the edit flow: the editor has reviewed the diff and approved.
// This commits the approved HTML (and any uploaded image) to GitHub in a
// SINGLE atomic commit using the Git Data API. Pushing to the deploy branch
// triggers Netlify to rebuild and the change goes live.
//
// The commit history IS the backup: every change is one reversible commit,
// so you can always roll back from GitHub. We also, before committing, copy
// the previous version of the page into /backups/ as an extra safety net.
//
// Required environment variables (same as propose.js):
//   ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH

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

  if (!checkPassword(body.password)) {
    return json(401, { error: 'Wrong password' });
  }

  const { page, newHtml, instruction, image } = body;
  if (!page || !newHtml) return json(400, { error: 'Missing page or newHtml' });
  if (!isSafePagePath(page)) return json(400, { error: 'Invalid page path' });

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;

  try {
    // 1. Current commit + tree the branch points at.
    const ref = await gh(repo, '/git/ref/heads/' + branch, token);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await gh(repo, '/git/commits/' + baseCommitSha, token);
    const baseTreeSha = baseCommit.tree.sha;

    // 2. Grab the previous page content for the /backups/ copy.
    let backupEntry = null;
    try {
      const prev = await gh(
        repo,
        '/contents/' + page + '?ref=' + encodeURIComponent(branch),
        token
      );
      const prevText = Buffer.from(prev.content, 'base64').toString('utf8');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = await ghPost(repo, '/git/blobs', token, {
        content: Buffer.from(prevText, 'utf8').toString('base64'),
        encoding: 'base64',
      });
      backupEntry = {
        path: 'backups/' + page.replace(/\.html$/, '') + '.' + stamp + '.html',
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      };
    } catch {
      // Page may not exist yet (new page) — no backup needed.
    }

    // 3. Blob for the new page HTML.
    const htmlBlob = await ghPost(repo, '/git/blobs', token, {
      content: Buffer.from(newHtml, 'utf8').toString('base64'),
      encoding: 'base64',
    });

    const treeItems = [
      { path: page, mode: '100644', type: 'blob', sha: htmlBlob.sha },
    ];
    if (backupEntry) treeItems.push(backupEntry);

    // 4. Optional image upload committed in the same commit.
    if (image && image.data && image.filename) {
      if (!isSafeAssetPath(image.filename)) {
        return json(400, { error: 'Invalid image filename' });
      }
      const imgBlob = await ghPost(repo, '/git/blobs', token, {
        content: image.data, // already base64
        encoding: 'base64',
      });
      const imgPath = image.path && isSafeAssetPath(image.path)
        ? image.path
        : 'img/uploads/' + image.filename;
      treeItems.push({ path: imgPath, mode: '100644', type: 'blob', sha: imgBlob.sha });
    }

    // 5. New tree, commit, and move the branch ref forward.
    const newTree = await ghPost(repo, '/git/trees', token, {
      base_tree: baseTreeSha,
      tree: treeItems,
    });

    const message =
      'Edit ' + page + ' via admin chatbot\n\n' +
      (instruction ? 'Request: ' + instruction.slice(0, 500) : '');

    const commit = await ghPost(repo, '/git/commits', token, {
      message,
      tree: newTree.sha,
      parents: [baseCommitSha],
    });

    await ghPatch(repo, '/git/refs/heads/' + branch, token, {
      sha: commit.sha,
      force: false,
    });

    return json(200, {
      ok: true,
      commit: commit.sha,
      commitUrl: 'https://github.com/' + repo + '/commit/' + commit.sha,
      backedUp: !!backupEntry,
    });
  } catch (e) {
    return json(500, { error: 'Publish failed: ' + e.message });
  }
};

// ---------------------------------------------------------------------------
// GitHub REST helpers
// ---------------------------------------------------------------------------
async function gh(repo, path, token) {
  return ghReq('GET', repo, path, token);
}
async function ghPost(repo, path, token, bodyObj) {
  return ghReq('POST', repo, path, token, bodyObj);
}
async function ghPatch(repo, path, token, bodyObj) {
  return ghReq('PATCH', repo, path, token, bodyObj);
}
async function ghReq(method, repo, path, token, bodyObj) {
  const res = await fetch('https://api.github.com/repos/' + repo + path, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'gomde-admin',
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error('GitHub ' + method + ' ' + path + ' -> ' + res.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------------------
// Shared helpers (mirror propose.js)
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
function isSafePagePath(p) {
  return /^[a-zA-Z0-9._-]+\.html$/.test(p) && !p.includes('..');
}
function isSafeAssetPath(p) {
  return /^[a-zA-Z0-9._\/-]+\.(png|jpe?g|webp|gif|svg)$/i.test(p) && !p.includes('..');
}
function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
