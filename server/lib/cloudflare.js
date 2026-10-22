// Cloudflare Pages deployment.
//
// LIVE mode (CLOUDFLARE_* set): writes the compiled site into the local sites
// directory, then ships the whole directory to Cloudflare Pages via wrangler.
// Every business lives at  https://<project>.pages.dev/<slug>/  (stable URL).
//
// DRY-RUN mode (keys missing): the file is written locally and served by the
// Express server at  http://localhost:<port>/sites/<slug>/  so you can click
// and view a real generated site immediately.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT_DIR, SITES_DIR, cloudflare, siteBaseUrl } from './config.js';

async function writeSiteToDisk(slug, html) {
  const dir = path.join(SITES_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
  // Ensure /lunao-booking-bridge.js is present at the root of SITES_DIR so Cloudflare Pages serves it for all deployed client sites
  try {
    const srcBridge = path.join(ROOT_DIR, 'public', 'lunao-booking-bridge.js');
    const dstBridge = path.join(SITES_DIR, 'lunao-booking-bridge.js');
    await fs.copyFile(srcBridge, dstBridge);
  } catch (err) {
    console.warn('[cloudflare] Could not copy lunao-booking-bridge.js to SITES_DIR:', err.message);
  }
  return dir;
}

function runWrangler(args, env) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'npx.cmd' : 'npx';
    // With shell:true (needed on Windows for npx.cmd) the args are re-joined by
    // the shell, so any path containing spaces must be quoted explicitly.
    const finalArgs = ['--yes', 'wrangler', ...args].map((a) =>
      isWin && /\s/.test(a) && !a.startsWith('"') ? `"${a}"` : a,
    );
    const child = spawn(cmd, finalArgs, {
      env: { ...process.env, ...env },
      shell: isWin,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err) }));
  });
}

// Pre-flight: validate the Cloudflare API token by hitting /accounts. This
// catches the #1 cause of wrangler deploy failures (invalid token, missing
// permissions) BEFORE wrangler runs, with a clear actionable error message
// instead of a wall of wrangler stderr.
export async function validateCloudflareToken() {
  if (!cloudflare.live) {
    return { ok: false, reason: 'cloudflare.live is false (missing token, accountId, or project)' };
  }
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${cloudflare.apiToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const firstError = data?.errors?.[0];
      const code = firstError?.code;
      const message = firstError?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        code,
        reason: `Cloudflare rejected the API token: ${message}${code ? ` [code: ${code}]` : ''}`,
        fix: code === 9109 || code === 10000
          ? 'The CLOUDFLARE_API_TOKEN in Railway Variables is invalid, expired, or was copy-pasted with extra whitespace. Create a new token at https://dash.cloudflare.com/profile/api-tokens with "Cloudflare Pages: Edit" permission and paste the new value into Railway.'
          : 'Verify the CLOUDFLARE_API_TOKEN in Railway Variables has "Cloudflare Pages: Edit" permission.',
      };
    }
    // Also verify the project exists and the token can see it.
    const projRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cloudflare.accountId}/pages/projects/${cloudflare.project}`,
      { method: 'GET', headers: { Authorization: `Bearer ${cloudflare.apiToken}` } },
    );
    const projData = await projRes.json().catch(() => ({}));
    if (!projRes.ok || !projData.success) {
      const firstError = projData?.errors?.[0];
      const message = firstError?.message || `HTTP ${projRes.status}`;
      return {
        ok: false,
        reason: `Cloudflare Pages project "${cloudflare.project}" not found in account ${cloudflare.accountId}: ${message}`,
        fix: `Either create a Pages project named "${cloudflare.project}" at https://dash.cloudflare.com/?to=/:account/pages/new, or change CLOUDFLARE_PAGES_PROJECT to an existing project name.`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Network error contacting Cloudflare: ${err.message}` };
  }
}

// Deploy the accumulated sites directory to Cloudflare Pages (production branch).
// Called once per campaign batch after all sites are written to disk.
export async function publishBatch() {
  if (!cloudflare.live) {
    return { mode: 'dry-run', deployed: false };
  }
  // Verify the sites directory exists and has content before invoking wrangler.
  // If SITES_DIR is empty, wrangler will happily "succeed" by deploying nothing
  // and the user will see a blank Cloudflare URL with no error.
  let stagedFiles = 0;
  try {
    const entries = await fs.readdir(SITES_DIR, { withFileTypes: true });
    stagedFiles = entries.filter((e) => e.isDirectory()).length;
  } catch (e) {
    console.error(`[cloudflare] SITES_DIR does not exist: ${SITES_DIR}`);
    throw new Error(`Sites directory missing: ${SITES_DIR}`);
  }
  if (stagedFiles === 0) {
    throw new Error(`No sites staged at ${SITES_DIR} — nothing to deploy`);
  }
  console.log(`[cloudflare] deploying ${stagedFiles} site(s) from ${SITES_DIR} to project=${cloudflare.project} branch=${cloudflare.branch}`);
  const { code, stdout, stderr } = await runWrangler(
    [
      'pages',
      'deploy',
      SITES_DIR,
      `--project-name=${cloudflare.project}`,
      `--branch=${cloudflare.branch}`,
      '--commit-dirty=true',
    ],
    {
      CLOUDFLARE_API_TOKEN: cloudflare.apiToken,
      CLOUDFLARE_ACCOUNT_ID: cloudflare.accountId,
    },
  );
  // Log full wrangler output so deploy issues are visible in Railway logs.
  if (stdout) console.log(`[cloudflare] wrangler stdout:\n${stdout}`);
  if (stderr) console.error(`[cloudflare] wrangler stderr:\n${stderr}`);
  if (code !== 0) {
    throw new Error(`Cloudflare Pages deploy failed (exit ${code}): ${stderr || stdout}`);
  }
  const urlMatch = (stdout + stderr).match(/https:\/\/[^\s]+\.pages\.dev[^\s]*/);
  const deploymentUrl = urlMatch ? urlMatch[0] : null;
  console.log(`[cloudflare] deploy ok: ${stagedFiles} site(s) -> ${deploymentUrl || cloudflare.project + '.pages.dev'}`);
  return { mode: 'live', deployed: true, deploymentUrl, stagedCount: stagedFiles };
}

// Compile output -> on-disk site. Returns the public URL for this slug.
export async function stageSite(slug, html) {
  await writeSiteToDisk(slug, html);
  return `${siteBaseUrl()}/${slug}/`;
}
