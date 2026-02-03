import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { globSync } from "tinyglobby";
import path from "path";
import pc from "picocolors";
import { execSync } from "node:child_process";
import { detect } from "package-manager-detector";
import { readConfig } from "./config.js";

export interface ChangesetReleaseType {
  type: "major" | "minor" | "patch";
  packageName: string;
  message: string;
  changesetType: string;
  isBreaking: boolean;
}

export interface PackageInfo {
  name: string;
  version: string;
  path: string;
  packageJson: any;
}

export interface DependencyGraph {
  packages: Map<string, PackageInfo>;
  dependents: Map<string, Set<string>>;
}

export interface DependencyUpdate {
  name: string;
  from: string;
  to: string;
}

export interface UpdateResult {
  packageName: string;
  oldVersion: string;
  newVersion: string;
  releaseType: "major" | "minor" | "patch";
  reason: "changeset" | "dependency";
  dependencyUpdates?: DependencyUpdate[];
}

export function parseChangesetFile(filePath: string): ChangesetReleaseType[] {
  const config = readConfig();
  const content = readFileSync(filePath, "utf-8");
  const releases: ChangesetReleaseType[] = [];

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return releases;
  }

  const frontmatter = frontmatterMatch[1];
  const lines = frontmatter.split("\n");

  const messageMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const message = messageMatch?.[1]?.trim() || "";

  for (const line of lines) {
    const match = line.match(/^"([^"]+)":\s*(\w+)(@major|!)?/);
    if (match) {
      const packageName = match[1];
      const changesetType = match[2];
      const suffix = match[3];
      const isBreaking = suffix === "!";
      const isExplicitMajor = suffix === "@major";

      let releaseType: ChangesetReleaseType["type"] = "patch";

      if (isBreaking || isExplicitMajor) {
        releaseType = "major";
      } else {
        const typeConfig = config.lazyChangesets.types.find((t) => t.type === changesetType);
        if (typeConfig?.releaseType) {
          releaseType = typeConfig.releaseType;
        }
      }

      releases.push({ type: releaseType, packageName, message, changesetType, isBreaking });
    }
  }

  return releases;
}

export function getHighestReleaseType(
  releases: ChangesetReleaseType[],
): ChangesetReleaseType["type"] {
  if (releases.some((r) => r.type === "major")) return "major";
  if (releases.some((r) => r.type === "minor")) return "minor";
  return "patch";
}

export function bumpVersion(
  version: string,
  releaseType: ChangesetReleaseType["type"],
  isBreaking: boolean,
): string {
  const parts = version.split(".").map(Number);

  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  switch (releaseType) {
    case "major":
      if (isBreaking && parts[0] === 0) {
        return `${parts[0]}.${parts[1] + 1}.0`;
      }
      return `${parts[0] + 1}.0.0`;
    case "minor":
      return `${parts[0]}.${parts[1] + 1}.0`;
    case "patch":
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

export function buildDependencyGraph(packageJsonPaths: string[]): DependencyGraph {
  const packages = new Map<string, PackageInfo>();
  const dependents = new Map<string, Set<string>>();

  // Load all package.json files
  for (const pkgPath of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!packageJson.name) continue;

    packages.set(packageJson.name, {
      name: packageJson.name,
      version: packageJson.version,
      path: pkgPath,
      packageJson,
    });
  }

  // Build reverse dependency map (who depends on whom)
  for (const [pkgName, pkgInfo] of packages) {
    const allDeps = {
      ...pkgInfo.packageJson.dependencies,
      ...pkgInfo.packageJson.devDependencies,
      ...pkgInfo.packageJson.peerDependencies,
    };

    for (const depName of Object.keys(allDeps)) {
      // Only track internal dependencies (packages in the monorepo)
      if (packages.has(depName)) {
        if (!dependents.has(depName)) {
          dependents.set(depName, new Set());
        }
        dependents.get(depName)!.add(pkgName);
      }
    }
  }

  return { packages, dependents };
}

export function shouldUpdateDependency(
  updatePolicy: "patch" | "minor" | "major" | "none",
  releaseType: "patch" | "minor" | "major",
): boolean {
  if (updatePolicy === "none") return false;
  if (updatePolicy === "patch") return true;
  if (updatePolicy === "minor") return releaseType === "minor" || releaseType === "major";
  if (updatePolicy === "major") return releaseType === "major";
  return false;
}

export function updateDependencyRange(currentRange: string, newVersion: string): string {
  // Preserve the range operator while updating the version

  // Handle workspace protocol
  if (currentRange.startsWith("workspace:")) {
    const operator = currentRange.replace("workspace:", "");
    if (operator === "*") return currentRange; // Don't change workspace:*
    // Extract operator and update version
    const match = operator.match(/^([~^>=<]*)(.*)$/);
    if (match) {
      return `workspace:${match[1]}${newVersion}`;
    }
  }

  // Handle standard ranges
  if (currentRange === "*") return currentRange;

  // Extract operator (^, ~, >=, etc.)
  const match = currentRange.match(/^([~^>=<]*)(.*)$/);
  if (match) {
    return `${match[1]}${newVersion}`;
  }

  // Exact version
  return newVersion;
}

export function getDependencyRange(packageJson: any, depName: string): string | null {
  return (
    packageJson.dependencies?.[depName] ||
    packageJson.devDependencies?.[depName] ||
    packageJson.peerDependencies?.[depName] ||
    null
  );
}

export function updatePackageDependencies(
  packageJson: any,
  updates: Map<string, UpdateResult>,
): DependencyUpdate[] {
  const dependencyUpdates: DependencyUpdate[] = [];
  const depTypes = ["dependencies", "devDependencies", "peerDependencies"];

  for (const depType of depTypes) {
    if (!packageJson[depType]) continue;

    for (const [depName, updateInfo] of updates) {
      if (packageJson[depType][depName]) {
        const currentRange = packageJson[depType][depName];
        const newRange = updateDependencyRange(currentRange, updateInfo.newVersion);
        if (currentRange !== newRange) {
          packageJson[depType][depName] = newRange;
          dependencyUpdates.push({
            name: depName,
            from: currentRange,
            to: newRange,
          });
        }
      }
    }
  }

  return dependencyUpdates;
}

export function cascadeVersionUpdates(
  initialUpdates: Map<string, { version: string; releaseType: string }>,
  dependencyGraph: DependencyGraph,
  updatePolicy: "patch" | "minor" | "major" | "none",
): Map<string, UpdateResult> {
  const allUpdates = new Map<string, UpdateResult>();
  const processed = new Set<string>();
  const queue: Array<{ packageName: string; releaseType: string }> = [];

  // Initialize with packages that have changesets
  for (const [pkgName, update] of initialUpdates) {
    const pkgInfo = dependencyGraph.packages.get(pkgName);
    if (!pkgInfo) continue;

    allUpdates.set(pkgName, {
      packageName: pkgName,
      oldVersion: pkgInfo.version,
      newVersion: update.version,
      releaseType: update.releaseType as "major" | "minor" | "patch",
      reason: "changeset",
    });

    queue.push({ packageName: pkgName, releaseType: update.releaseType });
  }

  // Process queue with cascading updates
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current.packageName)) continue;
    processed.add(current.packageName);

    // Find dependents of this package
    const dependentNames = dependencyGraph.dependents.get(current.packageName);
    if (!dependentNames) continue;

    for (const depName of dependentNames) {
      // Skip if already updated by a changeset
      if (initialUpdates.has(depName)) continue;

      // Check if we should update based on policy
      if (!shouldUpdateDependency(updatePolicy, current.releaseType as any)) continue;

      // Skip if already processed
      if (allUpdates.has(depName)) continue;

      const depInfo = dependencyGraph.packages.get(depName);
      if (!depInfo) continue;

      // Dependent gets a patch bump (since its package.json is changing)
      const newVersion = bumpVersion(depInfo.version, "patch", false);

      allUpdates.set(depName, {
        packageName: depName,
        oldVersion: depInfo.version,
        newVersion,
        releaseType: "patch",
        reason: "dependency",
      });

      // Add to queue for further cascading
      queue.push({ packageName: depName, releaseType: "patch" });
    }
  }

  return allUpdates;
}

export function generateChangelog(
  packageName: string,
  version: string,
  changesetContents: string[],
  dependencyUpdates?: DependencyUpdate[],
): string {
  const config = readConfig();
  const date = new Date().toISOString().split("T")[0];
  let changelog = `## ${version} (${date})\n\n`;

  // Add dependency updates section first
  if (dependencyUpdates && dependencyUpdates.length > 0) {
    changelog += `### 📦 Dependencies\n`;
    for (const dep of dependencyUpdates) {
      changelog += `- Updated ${dep.name} from ${dep.from} to ${dep.to}\n`;
    }
    changelog += "\n";
  }

  const typeGroups: Map<string, string[]> = new Map();
  const breakingChanges: string[] = [];

  for (const content of changesetContents) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split("\n");

    const messageMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const message = messageMatch?.[1]?.trim() || "";

    for (const line of lines) {
      const match = line.match(/^"([^"]+)":\s*(\w+)(!?)/);
      if (match && match[1] === packageName) {
        const changesetType = match[2];
        const isBreaking = match[3] === "!";

        if (isBreaking) {
          breakingChanges.push(message);
        } else {
          const existing = typeGroups.get(changesetType) || [];
          typeGroups.set(changesetType, [...existing, message]);
        }
        break;
      }
    }
  }

  if (breakingChanges.length > 0) {
    changelog += `⚠️ Breaking Changes\n`;
    for (const msg of breakingChanges) {
      changelog += `- ${msg}\n`;
    }
    changelog += "\n";
  }

  if (typeGroups.size === 0 && breakingChanges.length === 0) {
    return changelog + "No changes recorded.\n";
  }

  const sortedTypes = Array.from(typeGroups.keys()).sort((a, b) => {
    const aIndex = config.lazyChangesets.types.findIndex((t) => t.type === a);
    const bIndex = config.lazyChangesets.types.findIndex((t) => t.type === b);
    const aSort = aIndex >= 0 ? aIndex : 999;
    const bSort = bIndex >= 0 ? bIndex : 999;
    return aSort - bSort;
  });

  for (const type of sortedTypes) {
    const messages = typeGroups.get(type);
    if (!messages || messages.length === 0) continue;

    const typeConfig = config.lazyChangesets.types.find((t) => t.type === type);
    const emoji = typeConfig?.emoji || "•";

    changelog += `### ${emoji} ${type}\n`;
    for (const msg of messages) {
      changelog += `- ${msg}\n`;
    }
    changelog += "\n";
  }

  return changelog;
}

export async function version({ dryRun = false, ignore = [] as string[], install = false } = {}) {
  const changesetDir = path.join(process.cwd(), ".changeset");

  if (!existsSync(changesetDir)) {
    console.error(pc.red("No .changeset directory found."));
    process.exit(1);
  }

  const changesetFiles = globSync({
    patterns: [".changeset/*.md"],
    ignore: [".changeset/README.md", ...ignore.map((i) => `.changeset/${i}`)],
  });

  if (changesetFiles.length === 0) {
    console.log(pc.yellow("No changeset files found."));
    return;
  }

  const packageReleases: Map<string, ChangesetReleaseType[]> = new Map();
  const packageChangelogs: Map<string, string[]> = new Map();

  for (const changesetFile of changesetFiles) {
    const content = readFileSync(changesetFile, "utf-8");
    const releases = parseChangesetFile(changesetFile);
    for (const release of releases) {
      const existingReleases = packageReleases.get(release.packageName) || [];
      packageReleases.set(release.packageName, [...existingReleases, release]);

      const existingChangelogs = packageChangelogs.get(release.packageName) || [];
      packageChangelogs.set(release.packageName, [...existingChangelogs, content]);
    }
  }

  if (packageReleases.size === 0) {
    console.log(pc.yellow("No package releases found in changeset files."));
    return;
  }

  const packageJsonPaths = globSync({
    patterns: ["**/package.json", "!**/node_modules/**", "!**/dist/**"],
  });

  // Build dependency graph
  const config = readConfig();
  const dependencyGraph = buildDependencyGraph(packageJsonPaths);

  // Collect initial updates from changesets
  const initialUpdates = new Map<string, { version: string; releaseType: string }>();

  for (const [packageName, pkgInfo] of dependencyGraph.packages) {
    const releases = packageReleases.get(packageName);
    if (!releases) continue;

    const currentVersion = pkgInfo.version;
    const highestReleaseType = getHighestReleaseType(releases);
    const hasBreakingChange = releases.some((r) => r.isBreaking);
    const newVersion = bumpVersion(currentVersion, highestReleaseType, hasBreakingChange);

    initialUpdates.set(packageName, {
      version: newVersion,
      releaseType: highestReleaseType,
    });
  }

  // Cascade updates to dependents
  const allUpdates = cascadeVersionUpdates(
    initialUpdates,
    dependencyGraph,
    config.updateInternalDependencies,
  );

  const updatedPackages: string[] = [];

  // Apply all updates
  for (const [packageName, updateInfo] of allUpdates) {
    const pkgInfo = dependencyGraph.packages.get(packageName);
    if (!pkgInfo) continue;

    const packageJson = pkgInfo.packageJson;
    packageJson.version = updateInfo.newVersion;

    // Update dependencies if this package depends on updated packages
    const depUpdates = updatePackageDependencies(packageJson, allUpdates);

    if (!dryRun) {
      writeFileSync(pkgInfo.path, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");

      const packageDir = path.dirname(pkgInfo.path);
      const changelogPath = path.join(packageDir, "CHANGELOG.md");

      const changesetContents = packageChangelogs.get(packageName) || [];
      const newChangelog = generateChangelog(
        packageName,
        updateInfo.newVersion,
        changesetContents,
        depUpdates.length > 0 ? depUpdates : undefined,
      );

      let existingChangelog = "";
      if (existsSync(changelogPath)) {
        existingChangelog = readFileSync(changelogPath, "utf-8");
      }

      writeFileSync(changelogPath, newChangelog + "\n" + existingChangelog, "utf-8");
    }

    console.log(
      pc.green("✔"),
      pc.cyan(packageName),
      pc.dim(`(${updateInfo.oldVersion} → ${updateInfo.newVersion})`),
    );

    if (depUpdates.length > 0) {
      for (const depUpdate of depUpdates) {
        console.log(
          pc.dim(`  ↳ Updated dependency: ${depUpdate.name} ${depUpdate.from} → ${depUpdate.to}`),
        );
      }
    }

    updatedPackages.push(packageName);
  }

  if (dryRun) {
    console.log(pc.yellow("\nDry run - no files were modified."));
  } else {
    console.log(pc.green(`\nUpdated ${updatedPackages.length} package(s).`));

    for (const changesetFile of changesetFiles) {
      unlinkSync(changesetFile);
      console.log(pc.dim(`Deleted ${changesetFile}`));
    }

    console.log(pc.green(`\nDeleted ${changesetFiles.length} changeset file(s).`));
  }

  if (install && !dryRun && updatedPackages.length > 0) {
    const detected = await detect();
    if (detected) {
      const agent = detected.agent || detected.name;
      let installCmd = "";

      switch (agent) {
        case "npm":
          installCmd = "npm install";
          break;
        case "yarn":
        case "yarn@berry":
          installCmd = "yarn install";
          break;
        case "pnpm":
        case "pnpm@6":
          installCmd = "pnpm install";
          break;
        case "bun":
          installCmd = "bun install";
          break;
        default:
          console.warn(pc.yellow(`Unsupported package manager: ${agent}. Skipping install.`));
          return;
      }

      console.log(`\n${pc.dim("Running")}`, pc.cyan(installCmd), pc.dim("...\n"));
      try {
        execSync(installCmd, { stdio: "inherit" });
        console.log(pc.green("✔"), "Install completed successfully");
      } catch (error) {
        console.error(pc.red("✗"), "Install failed");
        throw error;
      }
    } else {
      console.warn(pc.yellow("Could not detect package manager. Skipping install."));
    }
  }
}
