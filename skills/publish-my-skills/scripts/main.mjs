#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_ROOT = path.join(os.homedir(), ".agents", "skills");
const DEFAULT_TARGET_ROOT = path.join(os.homedir(), "chaoren-skills");
const KEEP_TOP_LEVEL_DIRS = new Set([
  "agents",
  "scripts",
  "references",
  "assets",
  "prompts",
  "templates",
  "src",
  "lib",
  "bin",
]);
const SKIP_DIRS = new Set([
  ".git",
  ".clawhub",
  ".clawdhub",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "tmp",
  "temp",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "screenshots",
]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);
const README_START = "<!-- skill-list:start -->";
const README_END = "<!-- skill-list:end -->";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRoot = resolvePath(options.sourceRoot);
  const targetRoot = resolvePath(options.targetRoot);

  if (sourceRoot !== SOURCE_ROOT) {
    throw new Error(`Source root must be ${SOURCE_ROOT}`);
  }

  const availableSkills = await listSourceSkills(sourceRoot);

  if (options.list) {
    if (availableSkills.length === 0) {
      console.log("No skills found.");
      return;
    }
    for (const skill of availableSkills) {
      console.log(skill);
    }
    return;
  }

  const selectedSkills = selectSkills(options, availableSkills);
  if (selectedSkills.length === 0) {
    throw new Error("No skills selected. Use --all, --skills, or pass skill names as arguments.");
  }

  await ensureTargetSkeleton(targetRoot);

  const changedSkills = [];
  const copiedSummaries = [];

  for (const skillName of selectedSkills) {
    const sourceDir = path.join(sourceRoot, skillName);
    const targetDir = path.join(targetRoot, "skills", skillName);

    const sourceBundle = await collectSkillBundle(sourceDir);
    const targetBundle = await collectSkillBundle(targetDir, { allowMissing: true });
    const sourceFingerprint = fingerprintBundle(sourceBundle.files);
    const targetFingerprint = fingerprintBundle(targetBundle.files);
    const changed = sourceFingerprint !== targetFingerprint;

    copiedSummaries.push({
      skillName,
      fileCount: sourceBundle.files.length,
      changed,
      keptTopLevel: sourceBundle.keptTopLevel,
      skippedTopLevel: sourceBundle.skippedTopLevel,
    });

    if (!changed) {
      continue;
    }

    changedSkills.push(skillName);
    if (!options.dryRun) {
      await copyBundle(sourceBundle, targetDir);
    }
  }

  printSummary(copiedSummaries, options.dryRun);

  if (options.dryRun) {
    if (options.publish) {
      console.log("");
      console.log("Publish preview: migration would be followed by ClawHub sync for the selected skills.");
    }
    return;
  }

  const allRepoSkills = await listRepoSkills(targetRoot);
  const metadataChanged = await updateRepoMetadata(targetRoot, allRepoSkills, changedSkills.length > 0);

  ensureGitRepo(targetRoot, false);
  const committed = commitRepo(targetRoot, buildCommitMessage(options.commitMessage, changedSkills), [
    ...changedSkills,
    ...(metadataChanged ? ["repo-metadata"] : []),
  ]);

  if (options.publish) {
    await assertClawhubLogin();
    await runClawhubSync(targetRoot, selectedSkills, options, false);
  }

  console.log("");
  console.log(`Target repo: ${targetRoot}`);
  if (changedSkills.length === 0) {
    console.log("No skill content changes detected.");
  } else {
    console.log(`Updated skills: ${changedSkills.join(", ")}`);
  }
  console.log(committed ? "Git commit created." : "No new git commit was needed.");
  if (!options.publish) {
    console.log("ClawHub publish not requested.");
  }
}

function parseArgs(argv) {
  const options = {
    sourceRoot: SOURCE_ROOT,
    targetRoot: DEFAULT_TARGET_ROOT,
    skills: [],
    all: false,
    list: false,
    publish: false,
    dryRun: false,
    bump: "patch",
    changelog: "",
    tags: "latest",
    commitMessage: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--source-root requires a path");
      options.sourceRoot = value;
      index += 1;
      continue;
    }
    if (arg === "--target-root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--target-root requires a path");
      options.targetRoot = value;
      index += 1;
      continue;
    }
    if (arg === "--skills") {
      const value = argv[index + 1];
      if (!value) throw new Error("--skills requires a comma-separated list");
      options.skills.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
      index += 1;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--list") {
      options.list = true;
      continue;
    }
    if (arg === "--publish") {
      options.publish = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--bump") {
      const value = argv[index + 1];
      if (!["patch", "minor", "major"].includes(value)) {
        throw new Error("--bump must be patch, minor, or major");
      }
      options.bump = value;
      index += 1;
      continue;
    }
    if (arg === "--changelog") {
      const value = argv[index + 1];
      if (value == null) throw new Error("--changelog requires text");
      options.changelog = value;
      index += 1;
      continue;
    }
    if (arg === "--tags") {
      const value = argv[index + 1];
      if (value == null) throw new Error("--tags requires text");
      options.tags = value;
      index += 1;
      continue;
    }
    if (arg === "--commit-message") {
      const value = argv[index + 1];
      if (value == null) throw new Error("--commit-message requires text");
      options.commitMessage = value;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    options.skills.push(arg);
  }

  options.skills = [...new Set(options.skills)];
  return options;
}

function printUsage() {
  console.log(`Usage: main.mjs [skill-name ...] [options]

Options:
  --list                    List source skills under ~/.agents/skills
  --all                     Sync all source skills
  --skills <a,b>            Sync specific skills
  --source-root <path>      Must be ~/.agents/skills
  --target-root <path>      Target repository (default: ~/chaoren-skills)
  --publish                 Publish selected skills to ClawHub after commit
  --dry-run                 Preview without changing files
  --bump <type>             patch | minor | major
  --changelog <text>        Changelog text passed to ClawHub
  --tags <tags>             Comma-separated tags for ClawHub
  --commit-message <text>   Override git commit message
  -h, --help                Show help`);
}

function resolvePath(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

async function listSourceSkills(sourceRoot) {
  const stat = await safeStat(sourceRoot);
  if (!stat?.isDirectory()) {
    throw new Error(`Source root not found: ${sourceRoot}`);
  }

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(sourceRoot, entry.name);
    if (await hasSkillMarker(skillDir)) {
      skills.push(entry.name);
    }
  }

  return skills.sort((left, right) => left.localeCompare(right));
}

function selectSkills(options, availableSkills) {
  if (options.all) {
    return availableSkills;
  }

  const selected = options.skills.filter((skill) => availableSkills.includes(skill));
  const missing = options.skills.filter((skill) => !availableSkills.includes(skill));
  if (missing.length > 0) {
    throw new Error(`Requested skills not found in ${SOURCE_ROOT}: ${missing.join(", ")}`);
  }
  return selected;
}

async function ensureTargetSkeleton(targetRoot) {
  const stat = await safeStat(targetRoot);
  if (!stat?.isDirectory()) {
    throw new Error(`Target repo not found: ${targetRoot}`);
  }

  const manifestPath = path.join(targetRoot, ".claude-plugin", "marketplace.json");
  const manifestStat = await safeStat(manifestPath);
  if (!manifestStat?.isFile()) {
    throw new Error(`Marketplace manifest not found: ${manifestPath}`);
  }
}

async function collectSkillBundle(root, options = {}) {
  const stat = await safeStat(root);
  if (!stat?.isDirectory()) {
    if (options.allowMissing) {
      return { files: [], keptTopLevel: [], skippedTopLevel: [] };
    }
    throw new Error(`Skill directory not found: ${root}`);
  }

  if (!(await hasSkillMarker(root))) {
    throw new Error(`Missing SKILL.md in ${root}`);
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  const keptTopLevel = [];
  const skippedTopLevel = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (!KEEP_TOP_LEVEL_DIRS.has(entry.name) || shouldSkip(entry.name, true)) {
        skippedTopLevel.push(`${entry.name}/`);
        continue;
      }
      keptTopLevel.push(`${entry.name}/`);
      await walkTree(path.join(root, entry.name), entry.name, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!shouldKeepTopLevelFile(entry.name) || shouldSkip(entry.name, false)) {
      skippedTopLevel.push(entry.name);
      continue;
    }
    keptTopLevel.push(entry.name);
    await pushFile(path.join(root, entry.name), entry.name, files);
  }

  if (!files.some((file) => file.relPath === "SKILL.md" || file.relPath === "skill.md")) {
    throw new Error(`No top-level SKILL.md kept for ${root}`);
  }

  return { files, keptTopLevel, skippedTopLevel };
}

function shouldKeepTopLevelFile(name) {
  if (name === "SKILL.md" || name === "skill.md") return true;
  if (/^LICENSE(\..+)?$/i.test(name)) return true;
  if (/^Makefile$/i.test(name)) return true;
  if (/^package(-lock)?\.json$/i.test(name)) return true;
  if (/^bun\.lockb?$/i.test(name)) return true;
  if (/^pnpm-lock\.yaml$/i.test(name)) return true;
  if (/^yarn\.lock$/i.test(name)) return true;
  if (/^tsconfig\.json$/i.test(name)) return true;
  if (/^jsconfig\.json$/i.test(name)) return true;
  if (/^requirements\.txt$/i.test(name)) return true;
  if (/^pyproject\.toml$/i.test(name)) return true;
  if (/^uv\.lock$/i.test(name)) return true;
  if (/^Pipfile(\.lock)?$/i.test(name)) return true;
  if (/^go\.(mod|sum)$/i.test(name)) return true;
  if (/^Cargo\.(toml|lock)$/i.test(name)) return true;
  if (/^Gemfile(\.lock)?$/i.test(name)) return true;
  if (/^composer\.(json|lock)$/i.test(name)) return true;
  if (/^\.npmrc$/i.test(name)) return true;
  if (/^README/i.test(name) || /^CHANGELOG/i.test(name)) return false;
  if (/\.(json|ya?ml|toml|txt|ini|cfg|conf)$/i.test(name)) return true;
  return false;
}

async function walkTree(root, relRoot, files) {
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(root, entry.name);
    const relPath = path.posix.join(relRoot.split(path.sep).join("/"), entry.name);
    if (shouldSkip(entry.name, entry.isDirectory())) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkTree(fullPath, relPath, files);
      continue;
    }
    if (entry.isFile()) {
      await pushFile(fullPath, relPath, files);
    }
  }
}

function shouldSkip(name, isDirectory) {
  if (isDirectory && SKIP_DIRS.has(name)) return true;
  if (!isDirectory && SKIP_FILES.has(name)) return true;
  if (!isDirectory && (name.endsWith(".log") || name.endsWith(".tmp") || name.endsWith(".swp"))) {
    return true;
  }
  if (name.startsWith(".") && name !== ".npmrc") {
    return true;
  }
  return false;
}

async function pushFile(fullPath, relPath, files) {
  const bytes = await fs.readFile(fullPath);
  const stat = await fs.stat(fullPath);
  files.push({
    relPath: relPath.split(path.sep).join("/"),
    bytes,
    mode: stat.mode & 0o777,
  });
}

function fingerprintBundle(files) {
  if (files.length === 0) return "";
  const payload = files
    .map((file) => `${file.relPath}:${sha256(file.bytes)}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
  return sha256(payload);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function copyBundle(bundle, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });

  for (const file of bundle.files) {
    const destination = path.join(targetDir, file.relPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.bytes);
    if (file.mode) {
      await fs.chmod(destination, file.mode);
    }
  }
}

function printSummary(summaries, dryRun) {
  for (const summary of summaries) {
    const status = summary.changed ? (dryRun ? "would-sync" : "synced") : "unchanged";
    console.log(`${summary.skillName}: ${status} (${summary.fileCount} files)`);
    if (summary.keptTopLevel.length > 0) {
      console.log(`  kept: ${summary.keptTopLevel.join(", ")}`);
    }
    if (summary.skippedTopLevel.length > 0) {
      console.log(`  skipped: ${summary.skippedTopLevel.join(", ")}`);
    }
  }
}

async function listRepoSkills(targetRoot) {
  const skillsRoot = path.join(targetRoot, "skills");
  const stat = await safeStat(skillsRoot);
  if (!stat?.isDirectory()) return [];

  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    if (await hasSkillMarker(skillDir)) {
      skills.push(entry.name);
    }
  }
  return skills.sort((left, right) => left.localeCompare(right));
}

async function updateRepoMetadata(targetRoot, allSkills, bumpVersion) {
  const manifestPath = path.join(targetRoot, ".claude-plugin", "marketplace.json");
  const readmePath = path.join(targetRoot, "README.md");

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const plugin = manifest.plugins?.find((item) => item.name === "chaoren-skills") || manifest.plugins?.[0];
  if (!plugin) {
    throw new Error("No plugin entry found in marketplace.json");
  }

  const skillPaths = allSkills.map((skill) => `./skills/${skill}`);
  const currentPaths = Array.isArray(plugin.skills) ? [...plugin.skills] : [];
  const pathsChanged = JSON.stringify(currentPaths) !== JSON.stringify(skillPaths);
  plugin.skills = skillPaths;

  if (bumpVersion || pathsChanged) {
    manifest.metadata = manifest.metadata || {};
    manifest.metadata.version = bumpPatch(manifest.metadata.version || "0.1.0");
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const readme = await fs.readFile(readmePath, "utf8");
  const skillBlock = allSkills.map((skill) => `- \`${skill}\``).join("\n");
  const replacement = `${README_START}\n${skillBlock}\n${README_END}`;
  const nextReadme = readme.replace(
    new RegExp(`${escapeRegExp(README_START)}[\\s\\S]*?${escapeRegExp(README_END)}`),
    replacement
  );
  await fs.writeFile(readmePath, nextReadme);

  return bumpVersion || pathsChanged || readme !== nextReadme;
}

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return "0.1.0";
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureGitRepo(targetRoot, dryRun) {
  const gitDir = path.join(targetRoot, ".git");
  if (existsSync(gitDir)) {
    return;
  }

  if (dryRun) {
    console.log(`Would initialize git repo in ${targetRoot}`);
    return;
  }

  runCommand("git", ["init", "-b", "main"], targetRoot);
}

function commitRepo(targetRoot, commitMessage, changedItems) {
  if (changedItems.length === 0) {
    return false;
  }

  runCommand("git", ["add", "."], targetRoot);
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: targetRoot,
    stdio: "ignore",
  });

  if (diff.status === 0) {
    return false;
  }

  const name = spawnSync("git", ["config", "user.name"], { cwd: targetRoot, encoding: "utf8" });
  const email = spawnSync("git", ["config", "user.email"], { cwd: targetRoot, encoding: "utf8" });
  if ((name.stdout || "").trim() === "" || (email.stdout || "").trim() === "") {
    throw new Error("Git user.name or user.email is not configured.");
  }

  runCommand("git", ["commit", "-m", commitMessage], targetRoot);
  return true;
}

function buildCommitMessage(customMessage, changedSkills) {
  if (customMessage) {
    return customMessage;
  }
  if (changedSkills.length === 0) {
    return "chore(skills): refresh metadata";
  }
  if (changedSkills.length === 1) {
    return `chore(skills): sync ${changedSkills[0]}`;
  }
  return `chore(skills): sync ${changedSkills.length} skills`;
}

async function assertClawhubLogin() {
  const result = spawnSync("clawhub", ["whoami"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("clawhub is not logged in. Run: clawhub login");
  }
}

async function runClawhubSync(targetRoot, skillNames, options, dryRun) {
  const syncScript = path.join(targetRoot, "scripts", "sync-clawhub.mjs");
  const args = [syncScript];
  for (const skillName of skillNames) {
    args.push("--root", path.join(targetRoot, "skills", skillName));
  }
  args.push("--bump", options.bump, "--tags", options.tags);
  if (options.changelog) {
    args.push("--changelog", options.changelog);
  }
  if (dryRun) {
    args.push("--dry-run");
  }

  runCommand(process.execPath, args, targetRoot);
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function hasSkillMarker(folder) {
  return Boolean(
    (await safeStat(path.join(folder, "SKILL.md")))?.isFile() ||
      (await safeStat(path.join(folder, "skill.md")))?.isFile()
  );
}

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
