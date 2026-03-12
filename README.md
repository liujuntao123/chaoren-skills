# chaoren-skills

Personal skills repository for Claude Code marketplace installs and ClawHub publishing.

## Structure

- `.claude-plugin/marketplace.json`: Claude Code marketplace manifest for this repository
- `skills/<skill-name>`: individual skills
- `scripts/sync-clawhub.sh`: publish local skills to ClawHub
- `scripts/sync-clawhub.mjs`: registry sync implementation

## Claude Code Installation

After pushing this repository to GitHub:

```bash
/plugin marketplace add <github-owner>/chaoren-skills
/plugin install chaoren-skills@chaoren-skills
```

## ClawHub Installation

After publishing a skill to ClawHub:

```bash
clawhub install publish-my-skills
```

## Publishing

Log in first:

```bash
clawhub login
```

Then publish all changed skills in this repo:

```bash
./scripts/sync-clawhub.sh --all
```

Preview without uploading:

```bash
./scripts/sync-clawhub.sh --dry-run
```

## Included Skills

<!-- skill-list:start -->
- `gh-cli`
- `publish-my-skills`
<!-- skill-list:end -->

