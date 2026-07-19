# Site Editor — Setup Guide

This adds a password-protected page to your site where you can describe a change
in plain language (with optional images), review a preview, and publish it live.
Behind the scenes it edits the real HTML in your GitHub repo and Netlify
redeploys the site automatically. Every change is one Git commit, so nothing is
ever lost and you can always roll back.

## What got added to your repo

```
admin/index.html              ← the private editor page (chat UI)
netlify/functions/propose.js  ← drafts the change with Claude, returns a preview
netlify/functions/publish.js  ← backs up + commits the approved change to GitHub
netlify.toml                  ← tells Netlify how to publish the site + functions
```

Nothing here changes your existing site. The public pages work exactly as before.

---

## One-time setup (about 15 minutes)

### 1. Push these new files to GitHub
From the project folder:

```
git add admin netlify netlify.toml ADMIN-SETUP.md
git commit -m "Add password-protected AI site editor"
git push
```

### 2. Connect the repo to Netlify (this replaces FileZilla)
1. Go to **app.netlify.com** → sign up (free) with your GitHub account.
2. **Add new site → Import an existing project → GitHub →** pick
   `cbolorinos/Gomde-University`.
3. Build settings: leave the build command **empty**, publish directory **`.`**
   (the `netlify.toml` already sets this). Click **Deploy**.
4. In ~30 seconds you'll get a live URL like `your-site.netlify.app`. That's the
   whole site, served from GitHub. From now on, **every `git push` publishes
   automatically** — no more manual FTP uploads.

### 3. Point your real domain at Netlify (when you're ready)
Your current FTP host keeps serving the site until you do this, so there's no
rush and no downtime.
1. In Netlify: **Domain settings → Add a custom domain →** enter your domain.
2. Netlify shows you either a set of **nameservers** or a **CNAME/A record**.
3. Log in to wherever your domain is registered and update DNS to match.
4. Netlify issues a free HTTPS certificate automatically.

Once DNS points at Netlify you can stop using FileZilla entirely.

### 4. Add the three secret keys (Netlify → Site settings → Environment variables)
These live only on Netlify's servers — never in the website code.

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | any password you choose for the editor page |
| `ANTHROPIC_API_KEY` | your Claude API key from **console.anthropic.com → API Keys** |
| `GITHUB_TOKEN` | a GitHub token (see below) |
| `GITHUB_REPO` | `cbolorinos/Gomde-University` |
| `GITHUB_BRANCH` | `main` |

**Getting the GitHub token:** GitHub → **Settings → Developer settings →
Fine-grained personal access tokens → Generate new token**. Give it access to
**only** the `Gomde-University` repository, and under *Repository permissions*
set **Contents: Read and write**. Copy the token into `GITHUB_TOKEN`.

**Getting the Claude API key:** this is a separate, paid API account from the
Claude app you're using now. At console.anthropic.com, add a little credit and
create a key. Each edit costs a fraction of a cent.

After adding the variables, trigger one more deploy (Netlify → Deploys →
**Trigger deploy**) so the functions pick them up.

---

## Using it

1. Go to `https://your-domain/admin/` (or `your-site.netlify.app/admin/`).
2. Enter the password.
3. Pick the page, type what you want changed, optionally attach an image.
4. Click **Preview change** — you'll see a red/green diff of exactly what will
   change.
5. **Approve & publish** commits it; the site updates in ~30 seconds. Or
   **Revise** / **Discard** if it's not right.

## Safety & rollback
- Nothing publishes until you click **Approve**.
- Every change is a single commit in GitHub, and the previous version of the
  page is also copied into a `backups/` folder. To undo: open the repo on
  GitHub, find the commit, and revert it (or ask me and I'll roll it back).
- The password gate and all keys are enforced server-side, so viewing the
  `/admin/` page source reveals no secrets.

## If you add or rename pages later
Open `admin/index.html` and update the `PAGES` list near the top so the new
page shows in the dropdown.

## Prefer Cloudflare instead of Netlify?
The same design works on Cloudflare Pages + Pages Functions with minor path
changes. Tell me and I'll provide that version.
