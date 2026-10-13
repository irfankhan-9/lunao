# 🚀 Lunao Decoupling & Google AI Studio Master Plan

This document establishes the architecture, Git strategy, and 1-click synchronization protocol for separating **Lunao's Heavy Backend & Automation Engine** from the **Frontend Vibe-Coding Platform & PWA**.

---

## 🏗️ 1. Architecture Overview: What Goes Where

```
                     ┌──────────────────────────────────────────────┐
                     │          LUNAO MONOREPO / ECOSYSTEM          │
                     └──────────────────────┬───────────────────────┘
                                            │
               ┌────────────────────────────┴───────────────────────────┐
               ▼                                                        ▼
┌─────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│   FRONTEND & PWA REPO / MASTER BRANCH   │  │   BACKEND & WORKFLOWS REPO / BRANCH      │
│     (For Google AI Studio & UI Vibe)    │  │       (For Automation & Scraping)        │
├─────────────────────────────────────────┤  ├──────────────────────────────────────────┤
│ • /src (React 19, Tailwind, Lucide)     │  │ • /server (Express, SQLite/Postgres DB)  │
│ • /src/components/TemplateLabPage.tsx   │  │ • /server/lib/googleDork.js (Dork engine)│
│ • /src/components/Campaigns.tsx (Mocked)│  │ • /server/lib/dorkPipeline.js            │
│ • /src/components/Dashboard.tsx         │  │ • /server/lib/emailDiscovery.js          │
│ • /lunaoownerpwa (Standalone Client PWA)│  │ • /server/lib/emailPipeline.js & mailers │
│ • /public (Compiled realistic previews) │  │ • /server/lib/telnyx.js & cloudflare.js  │
│ • /public/templates-raw (Sacred master) │  │ • /scripts (run-pipeline, migrations)    │
│ • /src/data/mockData.ts (Rich dataset)  │  │ • /.github/workflows (CI/CD deployments) │
└─────────────────────────────────────────┘  └──────────────────────────────────────────┘
```

---

## 🌿 2. Git Branch Strategy (Safe & Merge-Friendly)

Instead of using ZIP downloads (which risk overwriting sensitive files, `.env`, or local database states), we use **Git Branches**:

1. **`master` / `frontend-studio`**:
   - Holds the clean Frontend, Vibe Coder Studio, Template Showcase, Dashboard, and PWA.
   - Operates in **Standalone Mock Mode** (`IS_MOCK_ENV = true`), meaning all buttons, mock campaigns, simulated SSE streaming, and live previews work without needing the backend Express server running on port `:8787`.
   - Safe to push to GitHub, pull directly into **Google AI Studio** / WebContainers / StackBlitz / Bolt, and vibe-code continuously.

2. **`backend-engine`** (or separate private repo `lunao-engine`):
   - Holds `/server`, `/scripts`, `.github/workflows`, Telnyx/Cloudflare integrations, and database migrations.
   - Pushed cleanly to GitHub.
   - Can be cloned or merged with **one command** anytime you need to test the real end-to-end scraper pipeline locally.

---

## ⚡ 3. One-Click Commands: How to Split & Clone

### Step A: Push Backend to its Dedicated Branch (Safe Backup)
Run this once from your project root in PowerShell:
```powershell
# 1. Ensure all changes are committed
git add -A
git commit -m "chore: prepare codebase for AI Studio and backend split"

# 2. Create the backend branch and push to GitHub
git checkout -b backend-engine
git push -u origin backend-engine

# 3. Return to master
git checkout master
```

### Step B: Syncing AI Studio Changes Back Locally (Zero Overwrite Risk)
When you finish vibe-coding in AI Studio:
1. In AI Studio, commit and push your changes to `master` (or a PR branch like `ai-studio-edits`).
2. Locally, run:
```powershell
# Fetch AI Studio's work
git checkout master
git pull origin master

# Verify the backend files are still intact
git status
```
3. Because Git tracks file-by-file diffs, your `/server` and `/scripts` will remain untouched while all your new UI features, Tailwind layouts, and PWA improvements are updated cleanly!

---

## 🛡️ 4. The 3 Core Guardrails for AI Studio

When working in Google AI Studio, ensure the AI agent follows these rules:

1. **Sacred Master Templates Rule (from AGENTS.md)**:
   - Raw templates live in `/public/templates-raw/` (e.g. `barber-template.html`).
   - The preview files in `/public/` and `/` must **never** display uncompiled `{{PLACEHOLDERS}}`. They must render realistic dummy data (e.g., "Vintage Cuts Barber Lounge", "Austin, TX").
2. **Schema Integrity Rule**:
   - Do not alter the core interfaces in `src/types.ts` (`Campaign`, `Business`, `Template`, `SmsLog`) without updating `server/lib/db.js` accordingly.
3. **Mock Adapter Rule**:
   - Use `src/data/mockData.ts` for all mock UI developments. Never make the UI depend strictly on a live `fetch('/api/...')` without a graceful mock fallback.

---

## 📁 5. AI Studio Asset Index

| File | Purpose |
|---|---|
| [`AI_STUDIO_SYSTEM_PROMPT.md`](file:///c:/Users/IMRAN%20MENGAL/Desktop/lunao-master/AI_STUDIO_SYSTEM_PROMPT.md) | The exact system prompt to paste into AI Studio's agent configuration |
| [`AI_STUDIO_CONTEXT.md`](file:///c:/Users/IMRAN%20MENGAL/Desktop/lunao-master/AI_STUDIO_CONTEXT.md) | Technical context and specification file to upload/share with AI Studio |
| [`src/data/mockData.ts`](file:///c:/Users/IMRAN%20MENGAL/Desktop/lunao-master/src/data/mockData.ts) | High-fidelity mock campaigns, businesses, and activity logs |
| [`scripts/manage-repo-split.ps1`](file:///c:/Users/IMRAN%20MENGAL/Desktop/lunao-master/scripts/manage-repo-split.ps1) | Automation script for 1-click branching, syncing, and merging |
