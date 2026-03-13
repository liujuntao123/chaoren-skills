# chaoren-skills

面向写作场景的个人 skills 仓库，支持 Claude Code 和 ClawHub 安装。

[English](./README.md) | 中文

仓库地址：`github.com/liujuntao123/chaoren-skills`

## 目录结构

- `.claude-plugin/marketplace.json`：Claude Code 的 marketplace 清单
- `skills/<skill-name>`：单个 skill 目录
- `scripts/sync-clawhub.sh`：将本仓库 skills 发布到 ClawHub
- `scripts/sync-clawhub.mjs`：ClawHub 同步脚本实现

## Claude Code 安装

在 Claude Code 中把这个仓库添加为 marketplace：

```bash
/plugin marketplace add liujuntao123/chaoren-skills
/plugin install chaoren-skills@chaoren-skills
```

这会安装 `.claude-plugin/marketplace.json` 中定义的 plugin bundle。

## ClawHub 安装

以下 skills 已经发布到 ClawHub：

```bash
clawhub install article-rewriter
clawhub install content-goldmine
clawhub install writing-polish
```

## 可用 Skills

<!-- skill-list:start -->
- `article-rewriter`
- `auto-free-banana`
- `content-goldmine`
- `writing-polish`
<!-- skill-list:end -->

- `article-rewriter`：改写与重构文章、Newsletter、线程、脚本、销售页和零散笔记
- `content-goldmine`：拆解优质文章，提取可复用的写作结构与创意积木
- `writing-polish`：润色中文写作，优化流畅度、重点、语气和措辞

## 发布到 ClawHub

这个仓库使用本地同步脚本，只发布 `~/chaoren-skills/skills` 里的 skills，避免把其他 OpenClaw 本地目录中的无关 skills 一起上传。

先登录：

```bash
clawhub login
```

预览将要上传的内容：

```bash
./scripts/sync-clawhub.sh --dry-run
```

发布本仓库中所有新增或有变更的 skills：

```bash
./scripts/sync-clawhub.sh --all
```

带 changelog 和明确版本升级方式发布：

```bash
./scripts/sync-clawhub.sh --all --bump patch --changelog "Update skill docs"
```
