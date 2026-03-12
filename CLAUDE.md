# CLAUDE.md

This repository stores reusable personal skills for public distribution.

## Repository Rules

- Keep every skill in `skills/<skill-name>`.
- Each skill must have a `SKILL.md`.
- Prefer `agents/`, `scripts/`, `references/`, `assets/`, and `prompts/` inside a skill.
- Keep `.claude-plugin/marketplace.json` aligned with the skills present in `skills/`.
- Use `scripts/sync-clawhub.sh` or `scripts/sync-clawhub.mjs` to publish to ClawHub.
- If `README.md` changes, update `README.zh.md` in the same change.

## Current Publishing Model

- Claude Code distribution is repository-level through `.claude-plugin/marketplace.json`.
- ClawHub distribution is skill-level through `scripts/sync-clawhub.mjs`.
- Source skills are imported manually from `~/.agents/skills` and then committed to this repository.

## Path Accuracy

- If a requested path or naming convention looks wrong, stop and point it out before proceeding.
- Do not silently add compatibility fallbacks for user-provided paths.

## Documentation Sync

- Keep `README.md` and `README.zh.md` aligned in structure and installation instructions.
- When adding, removing, or renaming a published skill, update both README files in the same commit.
