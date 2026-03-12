# CLAUDE.md

This repository stores reusable personal skills for public distribution.

## Repository Rules

- Keep every skill in `skills/<skill-name>`.
- Each skill must have a `SKILL.md`.
- Prefer `agents/`, `scripts/`, `references/`, `assets/`, and `prompts/` inside a skill.
- Keep `.claude-plugin/marketplace.json` aligned with the skills present in `skills/`.
- Use `scripts/sync-clawhub.sh` or `scripts/sync-clawhub.mjs` to publish to ClawHub.

## Current Publishing Model

- Claude Code distribution is repository-level through `.claude-plugin/marketplace.json`.
- ClawHub distribution is skill-level through `scripts/sync-clawhub.mjs`.
- `publish-my-skills` is the maintenance skill for importing local skills from `~/.agents/skills`, cleaning them, updating the repo manifest, committing, and optionally publishing.

## Path Accuracy

- If a requested path or naming convention looks wrong, stop and point it out before proceeding.
- Do not silently add compatibility fallbacks for user-provided paths.

