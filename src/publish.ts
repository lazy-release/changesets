import { readFileSync, existsSync } from "node:fs";
import { globSync } from "tinyglobby";
import path from "node:path";
import pc from "picocolors";
import { execSync } from "node:child_process";
import { detect } from "package-manager-detector";
import { readConfig } from "./config.js";
import type { ChangesetConfig } from "./config.js";

export interface PackageInfo {
  name: string;
  version: string;
  dir: string;
  isPrivate: boolean;
  access?: "public" | "restricted";
}

export async function publish({
  dryRun = false,
  githubToken,
  draft = false,
}: { dryRun?: boolean; githubToken?: string; draft?: boolean } = {}) {
  const config = readConfig();
  const packages = await findPackages(config);

  if (packages.length === 0) {
    console.log(pc.yellow("No packages found."));
    return;
  }

  if (dryRun) {
    console.log(pc.yellow("\nDry run - no actual publishing will occur.\n"));
  }

  console.log(pc.dim("Found"), pc.cyan(`${packages.length} package(s)`));

  const results = { success: 0, failed: 0 };

  for (const pkg of packages) {
    try {
      await publishPackage(pkg, dryRun, config, githubToken, draft);
      results.success++;
    } catch (error) {
      results.failed++;
      console.error(pc.red(`\n✗ Failed to publish ${pkg.name}`));
      if (error instanceof Error) {
        console.error(pc.red(error.message));
      }
      console.log(pc.yellow("Continuing with remaining packages...\n"));
    }
  }

  if (dryRun) {
    console.log(pc.yellow("\nDry run complete - no changes were made."));
  } else {
    console.log(pc.green(`\n✔ Publish complete! ${results.success} successful, ${results.failed} failed`));
  }
}

async function findPackages(config: ChangesetConfig): Promise<PackageInfo[]> {
  const packageJsonPaths = globSync({
    patterns: ["**/package.json", "!**/node_modules/**", "!**/dist/**"],
  });

  const packages: PackageInfo[] = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const packageName = packageJson.name;
    const packageVersion = packageJson.version;

    if (!packageName || !packageVersion) {
      console.warn(`Skipping ${packageJsonPath} - missing name or version`);
      continue;
    }

    if (config.ignore.includes(packageName)) {
      console.warn(pc.dim(`Ignoring package ${packageName}`));
      continue;
    }

    const dirPath = "./" + packageJsonPath.replace(/\/?package\.json$/, "");
    packages.push({
      name: packageName,
      version: packageVersion,
      dir: dirPath,
      isPrivate: packageJson.private === true,
      access: packageJson.publishConfig?.access,
    });
  }

  return packages;
}

async function publishPackage(
  pkg: PackageInfo,
  dryRun: boolean,
  config: ChangesetConfig,
  githubToken?: string,
  draft?: boolean,
) {
  const isRoot = pkg.dir === "." || pkg.dir === "./";
  const tag = isRoot ? `v${pkg.version}` : `${pkg.name}@${pkg.version}`;

  console.log(pc.dim("\n---"));
  console.log(pc.cyan(pkg.name), pc.dim(`v${pkg.version}`));

  if (dryRun) {
    console.log(pc.yellow("[DRY RUN]"), pc.dim("Would create and push tag"), pc.cyan(tag));
  } else if (await tagExistsRemote(tag)) {
    console.log(pc.dim(`Tag ${tag} already exists on remote. Skipping.`));
  } else {
    try {
      execSync(`git tag -a ${tag} -m "${tag}"`, { stdio: "pipe" });
      console.log(pc.dim("Created tag"), pc.cyan(tag));

      execSync(`git push origin ${tag}`, { stdio: "pipe" });
      console.log(pc.dim("Pushed tag"), pc.cyan(tag));
    } catch (error) {
      console.error(pc.red("Failed to create or push tag"), pc.cyan(tag));
      throw error;
    }
  }

  if (pkg.isPrivate) {
    console.log(pc.dim("Package is private. Skipping npm publish."));
  } else if (dryRun) {
    console.log(pc.yellow("[DRY RUN]"), pc.dim("Would publish to npm"));
  } else {
    try {
      await publishToNpm(pkg, config);
    } catch (error) {
      console.error(pc.red("✗"), "Failed to publish to npm");
      if (error instanceof Error) {
        console.error(pc.red(error.message));
      }
      console.log(pc.yellow("Continuing with GitHub release creation..."));
    }
  }

  if (dryRun) {
    const changelogContent = getChangelogForVersion(pkg);
    const releaseNotes = changelogContent ? changelogContent : "";
    const title = tag;

    console.log(pc.yellow("[DRY RUN]"), pc.dim("Would create GitHub release"));
    console.log(pc.dim("  Tag:"), pc.cyan(tag));
    console.log(pc.dim("  Title:"), pc.cyan(title));
    console.log(pc.dim("  Draft:"), draft ? pc.cyan("Yes") : pc.dim("No"));

    if (releaseNotes) {
      console.log(pc.dim("  Body:\n"));
      console.log(releaseNotes);
    } else {
      console.log(pc.dim("  Body:"), pc.yellow("(No changelog found for this version)"));
    }
  } else {
    try {
      await createGitHubRelease(pkg, tag, githubToken, draft);
    } catch (error) {
      console.error(pc.red("✗"), "Failed to create GitHub release");
      if (error instanceof Error) {
        console.error(pc.red(error.message));
      }
      // Don't throw, just log and continue
    }
  }
}

async function tagExistsRemote(tag: string): Promise<boolean> {
  try {
    execSync(`git ls-remote --tags origin refs/tags/${tag}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function publishToNpm(pkg: PackageInfo, config: ChangesetConfig) {
  const detected = await detect();
  if (!detected) {
    console.warn(pc.yellow("Could not detect package manager. Skipping npm publish."));
    return;
  }

  const agent = detected.agent || detected.name;
  let publishCmd = "";
  const access = pkg.access || config.access;
  const accessFlag = access === "public" || access === "restricted" ? `--access ${access}` : "";

  switch (agent) {
    case "npm":
      publishCmd = `npm publish ${accessFlag}`.trim();
      break;
    case "yarn":
    case "yarn@berry":
      publishCmd = `yarn publish --non-interactive ${accessFlag}`.trim();
      break;
    case "pnpm":
    case "pnpm@6":
      publishCmd = `pnpm publish --no-git-checks ${accessFlag}`.trim();
      break;
    case "bun":
      publishCmd = `bun publish ${accessFlag}`.trim();
      break;
    default:
      console.warn(pc.yellow(`Unsupported package manager: ${agent}. Skipping npm publish.`));
      return;
  }

  console.log(pc.dim("Publishing to npm..."));

  try {
    execSync(publishCmd, { cwd: pkg.dir, stdio: "inherit" });
    console.log(pc.green("✔"), "Published to npm");
  } catch (error) {
    throw error;
  }
}

async function createGitHubRelease(
  pkg: PackageInfo,
  tag: string,
  githubToken?: string,
  draft?: boolean,
) {
  const changelogContent = getChangelogForVersion(pkg);

  if (!changelogContent) {
    console.log(pc.dim(`No changelog found for version ${pkg.version}. Skipping GitHub release.`));
    return;
  }

  const releaseNotes = changelogContent;

  console.log(pc.dim("Creating GitHub release..."));

  try {
    const { owner, repo } = getGitHubRepoInfo();
    const token = githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error(
        "GITHUB_TOKEN environment variable is required. " +
          'Create a token at https://github.com/settings/tokens with "repo" scope.',
      );
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body: releaseNotes,
        draft: draft ?? false,
        prerelease: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      
      // GitHub returns 422 when a release already exists for the tag
      if (response.status === 422) {
        console.log(pc.dim(`GitHub release for ${tag} already exists. Skipping.`));
        return;
      }
      
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    console.log(pc.green("✔"), "Created GitHub release");
  } catch (error) {
    throw error;
  }
}

function getGitHubRepoInfo(): { owner: string; repo: string } {
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", { encoding: "utf-8" }).trim();

    const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    throw new Error("Could not parse GitHub repository URL");
  } catch {
    throw new Error("Could not determine GitHub repository owner and name from git remote");
  }
}

export function getChangelogForVersion(pkg: PackageInfo): string | null {
  const changelogPath = path.join(pkg.dir, "CHANGELOG.md");

  if (!existsSync(changelogPath)) {
    return null;
  }

  const changelogContent = readFileSync(changelogPath, "utf-8");

  const versionHeaderRegex = new RegExp(
    `^##\\s+${pkg.version.replace(/\./g, "\\.")}\\s*(?:\\([^)]+\\))?$`,
    "m",
  );
  const versionMatch = changelogContent.match(versionHeaderRegex);

  if (!versionMatch || versionMatch.index === undefined) {
    return null;
  }

  const startIndex = versionMatch.index;
  const contentAfterHeader = changelogContent.indexOf("\n", startIndex);
  const contentStart = contentAfterHeader !== -1 ? contentAfterHeader + 1 : startIndex;
  const nextVersionHeader = changelogContent.indexOf("\n## ", startIndex + 1);

  if (nextVersionHeader === -1) {
    return changelogContent.substring(contentStart).trim();
  }

  return changelogContent.substring(contentStart, nextVersionHeader).trim();
}

export function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}
