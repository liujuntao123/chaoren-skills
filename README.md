# chaoren-skills

Writing-focused personal skills for Claude Code and ClawHub.

Repository: `github.com/liujuntao123/chaoren-skills`

## Structure

- `.claude-plugin/marketplace.json`: Claude Code marketplace manifest for this repository
- `skills/<skill-name>`: individual skills
- `scripts/sync-clawhub.sh`: publish local skills to ClawHub
- `scripts/sync-clawhub.mjs`: registry sync implementation

## Claude Code Installation

Install this repository as a marketplace in Claude Code:

```bash
/plugin marketplace add liujuntao123/chaoren-skills
/plugin install chaoren-skills@chaoren-skills
```

This installs the plugin bundle defined in `.claude-plugin/marketplace.json`.

## ClawHub Installation

These skills are already published on ClawHub:

```bash
clawhub install article-rewriter
clawhub install content-goldmine
clawhub install writing-polish
```

## Available Skills

<!-- skill-list:start -->
- `article-rewriter`
- `content-goldmine`
- `writing-polish`
<!-- skill-list:end -->

- `article-rewriter`: rewrite and restructure articles, newsletters, threads, scripts, landing pages, and rough notes
- `content-goldmine`: analyze strong articles and extract reusable writing structures and idea blocks
- `writing-polish`: polish Chinese writing, improve fluency, focus, tone, and wording

## Publishing To ClawHub

This repository uses the local sync script to publish only `~/chaoren-skills/skills`, which avoids accidentally uploading unrelated skills from other local OpenClaw directories.

Log in first:

```bash
clawhub login
```

Preview what would be uploaded:

```bash
./scripts/sync-clawhub.sh --dry-run
```

Publish all new or changed skills in this repo:

```bash
./scripts/sync-clawhub.sh --all
```

Publish with a changelog and explicit version bump:

```bash
./scripts/sync-clawhub.sh --all --bump patch --changelog "Update skill docs"
```
