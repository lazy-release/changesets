import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { globSync } from "tinyglobby";
import path from "node:path";
import pc from "picocolors";
import { readConfig } from "./config.js";
import type { ChangesetConfig } from "./config.js";
import { parseChangesetFile, buildDependencyGraph } from "./version.js";
import type { DependencyGraph, PackageInfo } from "./version.js";
import { publishToNpm } from "./publish.js";
import type { PackageInfo as PublishPackageInfo } from "./publish.js";

export interface PackageBackup {
  path: string;
  content: string;
}

export function generateSnapshotVersion(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `0.0.0-${timestamp}`;
}

export function findAffectedPackages(changesetFiles: string[]): Set<string> {
  const affectedPackages = new Set<string>();

  for (const changesetFile of changesetFiles) {
    const releases = parseChangesetFile(changesetFile);
    for (const release of releases) {
      affectedPackages.add(release.packageName);
    }
  }

  return affectedPackages;
}

export function cascadeDependents(
  affectedPackages: Set<string>,
  dependencyGraph: DependencyGraph,
): Set<string> {
  const allPackages = new Set(affectedPackages);
  const queue = Array.from(affectedPackages);
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current)) continue;
    processed.add(current);

    const dependents = dependencyGraph.dependents.get(current);
    if (!dependents) continue;

    for (const dependent of dependents) {
      if (!allPackages.has(dependent)) {
        allPackages.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return allPackages;
}

export function backupPackageJsonFiles(
  packages: Set<string>,
  dependencyGraph: DependencyGraph,
): Map<string, PackageBackup> {
  const backups = new Map<string, PackageBackup>();

  for (const pkgName of packages) {
    const pkgInfo = dependencyGraph.packages.get(pkgName);
    if (!pkgInfo) continue;

    const content = readFileSync(pkgInfo.path, "utf-8");
    backups.set(pkgName, {
      path: pkgInfo.path,
      content,
    });
  }

  return backups;
}

export function updatePackagesToSnapshot(
  packages: Set<string>,
  snapshotVersion: string,
  dependencyGraph: DependencyGraph,
): Map<string, string[]> {
  const dependencyUpdates = new Map<string, string[]>();

  for (const pkgName of packages) {
    const pkgInfo = dependencyGraph.packages.get(pkgName);
    if (!pkgInfo) continue;

    const packageJson = pkgInfo.packageJson;
    const updates: string[] = [];

    // Update the package version
    packageJson.version = snapshotVersion;

    // Update internal dependencies to exact snapshot versions
    const depTypes = ["dependencies", "devDependencies", "peerDependencies"] as const;

    for (const depType of depTypes) {
      if (!packageJson[depType]) continue;

      for (const depName of Object.keys(packageJson[depType])) {
        // Only update if this is an internal package that's being snapshot
        if (packages.has(depName)) {
          const oldVersion = packageJson[depType][depName];
          packageJson[depType][depName] = snapshotVersion;
          updates.push(`${depName}: ${oldVersion} → ${snapshotVersion}`);
        }
      }
    }

    if (updates.length > 0) {
      dependencyUpdates.set(pkgName, updates);
    }

    // Write updated package.json
    writeFileSync(pkgInfo.path, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
  }

  return dependencyUpdates;
}

export function restorePackageJsonFiles(backups: Map<string, PackageBackup>): void {
  for (const [pkgName, backup] of backups) {
    try {
      writeFileSync(backup.path, backup.content, "utf-8");
    } catch (error) {
      console.error(
        pc.red(`✗ Failed to restore ${backup.path}`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export async function snapshot({ dryRun = false }: { dryRun?: boolean } = {}) {
  const changesetDir = path.join(process.cwd(), ".changeset");

  if (!existsSync(changesetDir)) {
    console.error(pc.red("No .changeset directory found."));
    console.log(
      pc.yellow("Please run"),
      pc.cyan("changeset init"),
      pc.yellow("to initialize changesets."),
    );
    process.exit(1);
  }

  const config = readConfig();

  // Find changesets
  const changesetFiles = globSync({
    patterns: [".changeset/*.md"],
    ignore: [".changeset/README.md"],
  });

  if (changesetFiles.length === 0) {
    console.error(pc.red("No changeset files found."));
    console.log(
      pc.yellow("Create a changeset first with:"),
      pc.cyan("changeset"),
    );
    process.exit(1);
  }

  // Find affected packages from changesets
  const affectedPackages = findAffectedPackages(changesetFiles);

  if (affectedPackages.size === 0) {
    console.error(pc.red("No packages found in changesets."));
    process.exit(1);
  }

  // Build dependency graph
  const packageJsonPaths = globSync({
    patterns: ["**/package.json", "!**/node_modules/**", "!**/dist/**"],
  });

  const dependencyGraph = buildDependencyGraph(packageJsonPaths);

  // Validate all affected packages exist
  for (const pkgName of affectedPackages) {
    if (!dependencyGraph.packages.has(pkgName)) {
      console.error(pc.red(`Package "${pkgName}" referenced in changeset not found.`));
      process.exit(1);
    }
  }

  // Cascade to all dependents
  const allPackagesToUpdate = cascadeDependents(affectedPackages, dependencyGraph);

  // Generate snapshot version
  const snapshotVersion = generateSnapshotVersion();

  console.log(pc.bold(`\n📸 Snapshot version: ${pc.cyan(snapshotVersion)}\n`));

  if (dryRun) {
    console.log(pc.yellow("Dry run - no files will be modified or published.\n"));
  }

  // Show what will be updated
  console.log(pc.bold(`Packages to publish (${allPackagesToUpdate.size}):\n`));

  for (const pkgName of allPackagesToUpdate) {
    const pkgInfo = dependencyGraph.packages.get(pkgName);
    if (!pkgInfo) continue;

    const isAffected = affectedPackages.has(pkgName);
    const icon = isAffected ? pc.green("●") : pc.dim("↳");
    const reason = isAffected ? "" : pc.dim(" [dependent]");

    console.log(
      icon,
      pc.cyan(pkgName),
      pc.dim(`(${pkgInfo.version} → ${snapshotVersion})`),
      reason,
    );
  }

  if (dryRun) {
    console.log(pc.yellow("\nDry run complete - no changes were made."));
    return;
  }

  console.log(pc.dim("\n" + "─".repeat(60) + "\n"));

  // Backup package.json files
  const backups = backupPackageJsonFiles(allPackagesToUpdate, dependencyGraph);

  try {
    // Update package.json files with snapshot versions
    const dependencyUpdates = updatePackagesToSnapshot(
      allPackagesToUpdate,
      snapshotVersion,
      dependencyGraph,
    );

    // Show dependency updates
    if (dependencyUpdates.size > 0) {
      console.log(pc.bold("Updated internal dependencies:\n"));
      for (const [pkgName, updates] of dependencyUpdates) {
        console.log(pc.cyan(`  ${pkgName}:`));
        for (const update of updates) {
          console.log(pc.dim(`    ${update}`));
        }
      }
      console.log(pc.dim("\n" + "─".repeat(60) + "\n"));
    }

    // Publish packages
    console.log(pc.bold("Publishing to npm with --tag snapshot...\n"));

    const results = { success: 0, failed: 0 };

    for (const pkgName of allPackagesToUpdate) {
      const pkgInfo = dependencyGraph.packages.get(pkgName);
      if (!pkgInfo) continue;

      const packageJson = pkgInfo.packageJson;
      const isPrivate = packageJson.private === true;

      const publishInfo: PublishPackageInfo = {
        name: pkgName,
        version: snapshotVersion,
        dir: path.dirname(pkgInfo.path),
        isPrivate,
        access: packageJson.publishConfig?.access,
      };

      if (isPrivate) {
        console.log(pc.dim(`  ○ ${pkgName} - skipped (private)`));
        continue;
      }

      try {
        await publishToNpm(publishInfo, config, "snapshot");
        console.log(pc.green(`  ✓ ${pkgName}@${snapshotVersion}`));
        results.success++;
      } catch (error) {
        console.error(pc.red(`  ✗ ${pkgName} - failed`));
        if (error instanceof Error) {
          console.error(pc.red(`    ${error.message}`));
        }
        results.failed++;
      }
    }

    console.log(pc.dim("\n" + "─".repeat(60) + "\n"));

    // Restore package.json files
    console.log(pc.bold("Restoring package.json files...\n"));
    restorePackageJsonFiles(backups);
    console.log(pc.green(`  ✓ Restored ${backups.size} package.json file(s)\n`));

    // Summary
    if (results.failed === 0) {
      console.log(
        pc.green(
          `✔ Snapshot published successfully! ${results.success} package(s) published.\n`,
        ),
      );
    } else {
      console.log(
        pc.yellow(
          `⚠ Snapshot completed with errors. ${results.success} successful, ${results.failed} failed.\n`,
        ),
      );
    }

    console.log(pc.bold("Install snapshots with:"));
    console.log(pc.cyan(`  npm install <package-name>@snapshot\n`));
  } catch (error) {
    // Always restore on error
    console.log(pc.yellow("\n⚠ Error occurred, restoring package.json files...\n"));
    restorePackageJsonFiles(backups);
    console.log(pc.green(`  ✓ Restored ${backups.size} package.json file(s)\n`));

    throw error;
  }
}
