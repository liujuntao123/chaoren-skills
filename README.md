# chaoren-skills

Writing-focused personal skills for Claude Code and ClawHub.

English | [中文](./README.zh.md)

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
<!-- clawhub-install:start -->
clawhub install article-rewriter
clawhub install auto-free-banana
clawhub install content-goldmine
clawhub install epub2md-cli
clawhub install writing-polish
<!-- clawhub-install:end -->
```

## Available Skills

<!-- skill-list:start -->
- `article-rewriter`: rewrite and restructure articles, newsletters, threads, scripts, landing pages, and rough notes
- `auto-free-banana`: generate images in Google Flow through browser UI automation with Nano Banana 2/Pro and landscape/portrait support
- `content-goldmine`: analyze strong articles and extract reusable writing structures and idea blocks
- `epub2md-cli`: Use the local `epub2md` CLI to inspect EPUB files and convert them into Markdown. Make sure to use this whenever the user mentions `.epub` files, EPUB 转 Markdown、电子书章节导出、合并章节为单个 Markdown、下载或本地化 EPUB 中的远程图片、查看书籍信息/目录/章节结构、或解压 EPUB 内容，即使用户没有明确说出 `epub2md`
- `writing-polish`: polish Chinese writing, improve fluency, focus, tone, and wording
<!-- skill-list:end -->

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
