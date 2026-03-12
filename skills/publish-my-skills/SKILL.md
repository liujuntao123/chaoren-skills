---
name: publish-my-skills
description: Publish selected local skills from ~/.agents/skills into ~/chaoren-skills. Use when the user wants to migrate their own skills into a public repository, clean the exported skill contents, update the marketplace manifest, commit the target repo, and optionally publish the selected skills to ClawHub.
---

# Publish My Skills

Use this skill when the user wants to take one or more local skills from `~/.agents/skills` and turn them into publishable skills inside `~/chaoren-skills`.

## What This Skill Does

1. Lists available skills under `~/.agents/skills`
2. Selects the requested skill directories
3. Cleans each skill into a conventional publishable bundle
4. Copies the result into `~/chaoren-skills/skills/<skill-name>`
5. Updates `.claude-plugin/marketplace.json`
6. Updates the README skill list
7. Runs `git add` and `git commit`
8. Optionally syncs the selected skills to ClawHub

## Constraints

- Use `~/.agents/skills` exactly as the source root
- Do not add path fallbacks silently
- If the user names a wrong path, stop and point it out
- Keep only conventional skill content when migrating:
  - `SKILL.md`
  - `agents/`
  - `scripts/`
  - `references/`
  - `assets/`
  - `prompts/`
  - `templates/`
  - common config and lock files
- Skip junk and build output such as `.git`, `node_modules`, `dist`, `build`, caches, logs, screenshots, and editor temp files

## Execution

Script path:

```bash
{baseDir}/scripts/main.mjs
```

Default target repo:

```bash
~/chaoren-skills
```

## Typical Workflow

1. Inspect the source directory:

```bash
node {baseDir}/scripts/main.mjs --list
```

2. Preview a migration:

```bash
node {baseDir}/scripts/main.mjs article-rewriter --dry-run
```

3. Migrate and commit:

```bash
node {baseDir}/scripts/main.mjs article-rewriter
```

4. Migrate and publish:

```bash
node {baseDir}/scripts/main.mjs article-rewriter --publish --bump patch --changelog "Initial public release"
```

## Required Checks

- Before `--publish`, verify that `clawhub whoami` succeeds
- If `clawhub` is not logged in, stop and ask the user to run `clawhub login`
- If no skills are selected, ask the user which skills to publish
- Use `--dry-run` first when importing many skills at once

