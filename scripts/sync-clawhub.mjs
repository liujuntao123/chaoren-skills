#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_REGISTRY = "https://clawhub.ai";
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
]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const roots = options.roots.length > 0 ? options.roots : [path.resolve("skills")];
  const skills = await findSkills(roots);

  if (skills.length === 0) {
    throw new Error("No skills found.");
  }

  const localSkills = await mapWithConcurrency(skills, options.concurrency, async (skill) => {
    const files = await listPublishFiles(skill.folder);
    return {
      ...skill,
      fileCount: files.length,
      files,
      fingerprint: buildFingerprint(files),
    };
  });

  const config = await readClawhubConfig();
  const registry = (options.registry || config.registry || DEFAULT_REGISTRY).replace(/\/+$/, "");
  const token = config.token || process.env.CLAWHUB_TOKEN || process.env.CLAWDHUB_TOKEN || "";

  if (!token) {
    if (!options.dryRun) {
      throw new Error("Not logged in. Run: clawhub login");
    }

    console.log("ClawHub sync (offline preview)");
    console.log(`Roots with skills: ${roots.join(", ")}`);
    console.log("");
    for (const skill of localSkills) {
      console.log(`- ${skill.slug}  LOCAL ONLY  (${skill.fileCount} files)`);
    }
    console.log("");
    console.log("Dry run only. Remote resolve skipped because clawhub is not logged in.");
    return;
  }

  await apiJson(registry, token, "/api/v1/whoami");

  const candidates = await mapWithConcurrency(localSkills, options.concurrency, async (skill) => {
    const query = new URLSearchParams({
      slug: skill.slug,
      hash: skill.fingerprint,
    });
    const { status, body } = await apiJsonWithStatus(
      registry,
      token,
      `/api/v1/resolve?${query.toString()}`
    );

    if (status === 404) {
      return {
        ...skill,
        status: "new",
        latestVersion: null,
      };
    }

    if (status !== 200) {
      throw new Error(body?.message || `Resolve failed for ${skill.slug} (HTTP ${status})`);
    }

    const latestVersion = body?.latestVersion?.version ?? null;
    const matchVersion = body?.match?.version ?? null;

    if (!latestVersion) {
      return {
        ...skill,
        status: "new",
        latestVersion: null,
      };
    }

    return {
      ...skill,
      status: matchVersion ? "synced" : "update",
      latestVersion,
    };
  });

  const actionable = candidates.filter((candidate) => candidate.status !== "synced");

  console.log("ClawHub sync");
  console.log(`Registry: ${registry}`);
  console.log(`Roots with skills: ${roots.join(", ")}`);
  console.log("");

  if (actionable.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  for (const candidate of actionable) {
    console.log(`- ${formatCandidate(candidate, options.bump)}`);
  }

  if (options.dryRun) {
    console.log("");
    console.log(`Dry run: would upload ${actionable.length} skill(s).`);
    return;
  }

  const tags = options.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  for (const candidate of actionable) {
    const version =
      candidate.status === "new"
        ? "1.0.0"
        : bumpSemver(candidate.latestVersion, options.bump);

    console.log(`Publishing ${candidate.slug}@${version}`);
    await publishSkill({
      registry,
      token,
      skill: candidate,
      files: candidate.files,
      version,
      changelog: options.changelog,
      tags,
    });
  }

  console.log("");
  console.log(`Uploaded ${actionable.length} skill(s).`);
}

function parseArgs(argv) {
  const options = {
    roots: [],
    dryRun: false,
    bump: "patch",
    changelog: "",
    tags: "latest",
    concurrency: 4,
    registry: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--all") {
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a directory");
      options.roots.push(path.resolve(value));
      index += 1;
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
      if (value == null) throw new Error("--tags requires a value");
      options.tags = value;
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 32) {
        throw new Error("--concurrency must be an integer between 1 and 32");
      }
      options.concurrency = value;
      index += 1;
      continue;
    }
    if (arg === "--registry") {
      const value = argv[index + 1];
      if (!value) throw new Error("--registry requires a URL");
      options.registry = value;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`Usage: sync-clawhub.mjs [options]

Options:
  --root <dir>         Skill root directory (repeatable)
  --all                Accepted for compatibility
  --dry-run            Show what would be uploaded
  --bump <type>        patch | minor | major
  --changelog <text>   Changelog for updates
  --tags <tags>        Comma-separated tags
  --concurrency <n>    Registry check concurrency (1-32)
  --registry <url>     Override registry URL
  -h, --help           Show help`);
}

async function readClawhubConfig() {
  const configPath = getConfigPath();
  try {
    return JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch {
    return {};
  }
}

function getConfigPath() {
  const override =
    process.env.CLAWHUB_CONFIG_PATH?.trim() || process.env.CLAWDHUB_CONFIG_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }

  const home = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME;

  if (process.platform === "darwin") {
    return pickExistingConfig(
      path.join(home, "Library", "Application Support", "clawhub", "config.json"),
      path.join(home, "Library", "Application Support", "clawdhub", "config.json")
    );
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return pickExistingConfig(
      path.join(process.env.APPDATA, "clawhub", "config.json"),
      path.join(process.env.APPDATA, "clawdhub", "config.json")
    );
  }

  if (xdg) {
    return pickExistingConfig(
      path.join(xdg, "clawhub", "config.json"),
      path.join(xdg, "clawdhub", "config.json")
    );
  }

  return pickExistingConfig(
    path.join(home, ".config", "clawhub", "config.json"),
    path.join(home, ".config", "clawdhub", "config.json")
  );
}

function pickExistingConfig(primary, legacy) {
  if (existsSync(primary)) return path.resolve(primary);
  if (existsSync(legacy)) return path.resolve(legacy);
  return path.resolve(primary);
}

async function findSkills(roots) {
  const deduped = new Map();
  for (const root of roots) {
    const folders = await findSkillFolders(root);
    for (const folder of folders) {
      deduped.set(folder.slug, folder);
    }
  }
  return [...deduped.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

async function findSkillFolders(root) {
  const stat = await safeStat(root);
  if (!stat?.isDirectory()) return [];

  if (await hasSkillMarker(root)) {
    return [buildSkillEntry(root)];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, entry.name);
    if (await hasSkillMarker(folder)) {
      found.push(buildSkillEntry(folder));
    }
  }
  return found;
}

function buildSkillEntry(folder) {
  const base = path.basename(folder);
  return {
    folder,
    slug: sanitizeSlug(base),
    displayName: titleCase(base),
  };
}

async function hasSkillMarker(folder) {
  return Boolean(
    (await safeStat(path.join(folder, "SKILL.md")))?.isFile() ||
      (await safeStat(path.join(folder, "skill.md")))?.isFile()
  );
}

async function listPublishFiles(root) {
  const files = [];

  async function walk(folder) {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const isDirectory = entry.isDirectory();
      if (shouldSkip(entry.name, isDirectory)) continue;

      const fullPath = path.join(folder, entry.name);
      if (isDirectory) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      const bytes = await fs.readFile(fullPath);
      files.push({ relPath, bytes });
    }
  }

  await walk(root);
  files.sort((left, right) => left.relPath.localeCompare(right.relPath));
  return files;
}

function shouldSkip(name, isDirectory) {
  if (isDirectory && SKIP_DIRS.has(name)) return true;
  if (!isDirectory && SKIP_FILES.has(name)) return true;
  if (name.startsWith(".") && name !== ".npmrc") return true;
  if (!isDirectory && (name.endsWith(".log") || name.endsWith(".tmp") || name.endsWith(".swp"))) {
    return true;
  }
  return false;
}

function buildFingerprint(files) {
  const payload = files
    .map((file) => `${file.relPath}:${sha256(file.bytes)}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
  return sha256(payload);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function publishSkill({ registry, token, skill, files, version, changelog, tags }) {
  const form = new FormData();
  form.set(
    "payload",
    JSON.stringify({
      slug: skill.slug,
      displayName: skill.displayName,
      version,
      changelog,
      tags,
      acceptLicenseTerms: true,
    })
  );

  for (const file of files) {
    form.append(
      "files",
      new Blob([file.bytes], { type: contentTypeFor(file.relPath) }),
      file.relPath
    );
  }

  const response = await fetch(`${registry}/api/v1/skills`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Publish failed for ${skill.slug} (HTTP ${response.status})`);
  }

  const result = text ? JSON.parse(text) : {};
  console.log(`OK. Published ${skill.slug}@${version}${result.versionId ? ` (${result.versionId})` : ""}`);
}

function contentTypeFor(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if ([".md", ".txt", ".json", ".json5", ".yaml", ".yml", ".toml"].includes(ext)) {
    return "text/plain";
  }
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sh", ".rb", ".go"].includes(ext)) {
    return "text/plain";
  }
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function apiJson(registry, token, requestPath) {
  const { status, body } = await apiJsonWithStatus(registry, token, requestPath);
  if (status < 200 || status >= 300) {
    throw new Error(body?.message || `HTTP ${status}`);
  }
  return body;
}

async function apiJsonWithStatus(registry, token, requestPath) {
  const response = await fetch(`${registry}${requestPath}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  return { status: response.status, body };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const count = Math.min(Math.max(limit, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

function formatCandidate(candidate, bump) {
  if (candidate.status === "new") {
    return `${candidate.slug}  NEW  (${candidate.fileCount} files)`;
  }
  return `${candidate.slug}  UPDATE ${candidate.latestVersion} -> ${bumpSemver(
    candidate.latestVersion,
    bump
  )}  (${candidate.fileCount} files)`;
}

function bumpSemver(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function sanitizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/--+/g, "-");
}

function titleCase(value) {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
