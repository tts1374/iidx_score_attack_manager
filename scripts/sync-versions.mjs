import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function toDisplayPath(filePath) {
  return path.relative(process.cwd(), filePath) || ".";
}

function parseArgs(argv) {
  let version;
  let check = false;

  for (const arg of argv) {
    if (arg === "--check") {
      check = true;
      continue;
    }

    if (version !== undefined) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    version = arg;
  }

  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid version format: "${version}". Expected x.y.z`);
  }

  if (!check && version === undefined) {
    throw new Error("Version argument is required unless --check is specified.");
  }

  return { check, version };
}

async function ensureFileExists(filePath, label) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label} not found: ${toDisplayPath(filePath)}`);
    }
    throw error;
  }

  if (!fileStat.isFile()) {
    throw new Error(`${label} is not a file: ${toDisplayPath(filePath)}`);
  }
}

async function ensureDirectoryExists(dirPath, label) {
  let dirStat;
  try {
    dirStat = await stat(dirPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label} not found: ${toDisplayPath(dirPath)}`);
    }
    throw error;
  }

  if (!dirStat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${toDisplayPath(dirPath)}`);
  }
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  let data;
  try {
    data = JSON.parse(withoutBom);
  } catch {
    throw new Error(`Failed to parse JSON: ${toDisplayPath(filePath)}`);
  }

  return {
    data,
    lineEnding: withoutBom.includes("\r\n") ? "\r\n" : "\n",
    sourceText: withoutBom,
    trailingNewline: withoutBom.endsWith("\n"),
  };
}

function serializeJson(value, lineEnding, trailingNewline) {
  let text = JSON.stringify(value, null, 2);
  if (lineEnding === "\r\n") {
    text = text.replace(/\n/g, "\r\n");
  }

  if (trailingNewline) {
    text += lineEnding;
  }

  return text;
}

async function writeJsonIfChanged(filePath, value, current) {
  const nextText = serializeJson(value, current.lineEnding, current.trailingNewline);
  if (nextText === current.sourceText) {
    return false;
  }

  await writeFile(filePath, nextText, "utf8");
  return true;
}

function versionString(value) {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

async function listPackageJsonFiles(packagesDir) {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packageFiles = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "node_modules") {
      continue;
    }

    const packageJsonPath = path.join(packagesDir, entry.name, "package.json");
    try {
      const packageStat = await stat(packageJsonPath);
      if (packageStat.isFile()) {
        packageFiles.push(packageJsonPath);
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  packageFiles.sort();
  return packageFiles;
}

async function runCheckMode(rootPackagePath, packagePaths, rootPackage, expectedVersionArg) {
  const rootVersion = versionString(rootPackage.data.version);
  const mismatches = [];

  if (!SEMVER_PATTERN.test(rootVersion)) {
    mismatches.push({
      actual: rootVersion || "(missing)",
      expected: expectedVersionArg ?? "x.y.z",
      path: toDisplayPath(rootPackagePath),
    });
  } else if (expectedVersionArg !== undefined && rootVersion !== expectedVersionArg) {
    mismatches.push({
      actual: rootVersion,
      expected: expectedVersionArg,
      path: toDisplayPath(rootPackagePath),
    });
  }

  for (const packagePath of packagePaths) {
    const pkg = await readJsonFile(packagePath);
    const packageVersion = versionString(pkg.data.version);
    if (packageVersion !== rootVersion) {
      mismatches.push({
        actual: packageVersion || "(missing)",
        expected: rootVersion || "(missing)",
        path: toDisplayPath(packagePath),
      });
    }
  }

  if (mismatches.length > 0) {
    console.error("Version mismatches found:");
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch.path}: expected ${mismatch.expected}, actual ${mismatch.actual}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("All versions are synchronized.");
}

async function runSyncMode(rootPackagePath, packagePaths, rootPackage, targetVersion) {
  const changedFiles = [];

  rootPackage.data.version = targetVersion;
  if (await writeJsonIfChanged(rootPackagePath, rootPackage.data, rootPackage)) {
    changedFiles.push(toDisplayPath(rootPackagePath));
  }

  for (const packagePath of packagePaths) {
    const pkg = await readJsonFile(packagePath);
    pkg.data.version = targetVersion;
    if (await writeJsonIfChanged(packagePath, pkg.data, pkg)) {
      changedFiles.push(toDisplayPath(packagePath));
    }
  }

  if (changedFiles.length === 0) {
    console.log("No version changes were necessary.");
    return;
  }

  console.log("Updated files:");
  for (const file of changedFiles) {
    console.log(`- ${file}`);
  }
}

async function main() {
  const { check, version } = parseArgs(process.argv.slice(2));

  const rootPackagePath = path.resolve("package.json");
  const packagesDir = path.resolve("packages");

  await ensureFileExists(rootPackagePath, "root package.json");
  await ensureDirectoryExists(packagesDir, "packages directory");

  const rootPackage = await readJsonFile(rootPackagePath);
  const packagePaths = await listPackageJsonFiles(packagesDir);

  if (check) {
    await runCheckMode(rootPackagePath, packagePaths, rootPackage, version);
    return;
  }

  await runSyncMode(rootPackagePath, packagePaths, rootPackage, version);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
