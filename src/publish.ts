import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import path from 'node:path';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { detect } from 'package-manager-detector';
import { readConfig } from './config.js';
import type { ChangesetConfig } from './config.js';

export interface PackageInfo {
  name: string;
  version: string;
  dir: string;
  isPrivate: boolean;
}

export async function publish({ dryRun = false } = {}) {
  const config = readConfig();
  const packages = await findPackages(config);

  if (packages.length === 0) {
    console.log(pc.yellow('No packages found.'));
    return;
  }

  if (dryRun) {
    console.log(pc.yellow('\nDry run - no actual publishing will occur.\n'));
  }

  console.log(pc.dim('Found'), pc.cyan(`${packages.length} package(s)`));

  for (const pkg of packages) {
    await publishPackage(pkg, dryRun);
  }

  if (dryRun) {
    console.log(pc.yellow('\nDry run complete - no changes were made.'));
  } else {
    console.log(pc.green('\n✔ Publish complete!'));
  }
}

async function findPackages(config: ChangesetConfig): Promise<PackageInfo[]> {
  const packageJsonPaths = globSync({
    patterns: ['**/package.json', '!**/node_modules/**', '!**/dist/**'],
  });

  const packages: PackageInfo[] = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
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

    const dirPath = './' + packageJsonPath.replace(/\/?package\.json$/, '');
    packages.push({
      name: packageName,
      version: packageVersion,
      dir: dirPath,
      isPrivate: packageJson.private === true,
    });
  }

  return packages;
}

async function publishPackage(pkg: PackageInfo, dryRun: boolean) {
  const tag = `${pkg.name}@${pkg.version}`;

  console.log(pc.dim('\n---'));
  console.log(pc.cyan(pkg.name), pc.dim(`v${pkg.version}`));

  if (dryRun) {
    console.log(pc.yellow('[DRY RUN]'), pc.dim('Would create and push tag'), pc.cyan(tag));
  } else if (await tagExistsRemote(tag)) {
    console.log(pc.dim(`Tag ${tag} already exists on remote. Skipping.`));
  } else {
    try {
      execSync(`git tag -a ${tag} -m "${tag}"`, { stdio: 'pipe' });
      console.log(pc.dim('Created tag'), pc.cyan(tag));

      execSync(`git push origin ${tag}`, { stdio: 'pipe' });
      console.log(pc.dim('Pushed tag'), pc.cyan(tag));
    } catch (error) {
      console.error(pc.red('Failed to create or push tag'), pc.cyan(tag));
      throw error;
    }
  }

  if (pkg.isPrivate) {
    console.log(pc.dim('Package is private. Skipping npm publish.'));
  } else if (dryRun) {
    console.log(pc.yellow('[DRY RUN]'), pc.dim('Would publish to npm'));
  } else {
    await publishToNpm(pkg);
  }

  if (dryRun) {
    const changelogContent = getChangelogForVersion(pkg);
    const releaseNotes = changelogContent ? changelogContent : '';
    const title = `${pkg.name}@${pkg.version}`;

    console.log(pc.yellow('[DRY RUN]'), pc.dim('Would create GitHub release'));
    console.log(pc.dim('  Tag:'), pc.cyan(tag));
    console.log(pc.dim('  Title:'), pc.cyan(title));

    if (releaseNotes) {
      console.log(pc.dim('  Body:\n'));
      console.log(releaseNotes);
    } else {
      console.log(pc.dim('  Body:'), pc.yellow('(No changelog found for this version)'));
    }
  } else {
    await createGitHubRelease(pkg, tag);
  }
}

async function tagExistsRemote(tag: string): Promise<boolean> {
  try {
    execSync(`git ls-remote --tags origin refs/tags/${tag}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function publishToNpm(pkg: PackageInfo) {
  const detected = await detect();
  if (!detected) {
    console.warn(pc.yellow('Could not detect package manager. Skipping npm publish.'));
    return;
  }

  const agent = detected.agent || detected.name;
  let publishCmd = '';

  switch (agent) {
    case 'npm':
      publishCmd = 'npm publish';
      break;
    case 'yarn':
    case 'yarn@berry':
      publishCmd = 'yarn publish --non-interactive';
      break;
    case 'pnpm':
    case 'pnpm@6':
      publishCmd = 'pnpm publish --no-git-checks';
      break;
    case 'bun':
      publishCmd = 'bun publish';
      break;
    default:
      console.warn(pc.yellow(`Unsupported package manager: ${agent}. Skipping npm publish.`));
      return;
  }

  console.log(pc.dim('Publishing to npm...'));

  try {
    execSync(publishCmd, { cwd: pkg.dir, stdio: 'pipe' });
    console.log(pc.green('✔'), 'Published to npm');
  } catch (error) {
    console.error(pc.red('✗'), 'Failed to publish to npm');
    throw error;
  }
}

async function createGitHubRelease(pkg: PackageInfo, tag: string) {
  const changelogContent = getChangelogForVersion(pkg);

  if (!changelogContent) {
    console.log(pc.dim(`No changelog found for version ${pkg.version}. Skipping GitHub release.`));
    return;
  }

  const releaseNotes = `# ${pkg.name}\n\n${changelogContent}`;

  console.log(pc.dim('Creating GitHub release...'));

  try {
    const { owner, repo } = getGitHubRepoInfo();
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: tag,
        name: `${pkg.name}@${pkg.version}`,
        body: releaseNotes,
        draft: false,
        prerelease: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    console.log(pc.green('✔'), 'Created GitHub release');
  } catch (error) {
    console.error(pc.red('✗'), 'Failed to create GitHub release');
    throw error;
  }
}

function getGitHubRepoInfo(): { owner: string; repo: string } {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
    
    const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    throw new Error('Could not parse GitHub repository URL');
  } catch (error) {
    throw new Error('Could not determine GitHub repository owner and name from git remote');
  }
}

function getChangelogForVersion(pkg: PackageInfo): string | null {
  const changelogPath = path.join(pkg.dir, 'CHANGELOG.md');

  if (!existsSync(changelogPath)) {
    return null;
  }

  const changelogContent = readFileSync(changelogPath, 'utf-8');

  const versionHeaderRegex = new RegExp(`^##\\s+${pkg.version.replace(/\./g, '\\.')}$`, 'm');
  const versionMatch = changelogContent.match(versionHeaderRegex);

  if (!versionMatch || versionMatch.index === undefined) {
    return null;
  }

  const startIndex = versionMatch.index;
  const nextVersionHeader = changelogContent.indexOf('\n## ', startIndex + 1);

  if (nextVersionHeader === -1) {
    return changelogContent.substring(startIndex).trim();
  }

  return changelogContent.substring(startIndex, nextVersionHeader).trim();
}

export function generateReleaseNotes(pkg: PackageInfo, changesetContents: string[]): string {
  let notes = `# ${pkg.name}\n\n## ${pkg.version}\n\n`;

  const typeGroups: Map<string, string[]> = new Map();

  for (const content of changesetContents) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');

    const messageMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const message = messageMatch?.[1]?.trim() || '';

    for (const line of lines) {
      const match = line.match(/^"([^"]+)":\s*(\w+)(!?)/);
      if (match && match[1] === pkg.name) {
        const changesetType = match[2];
        const isBreaking = match[3] === '!';

        const existing = typeGroups.get(changesetType) || [];
        typeGroups.set(changesetType, [...existing, message]);
        break;
      }
    }
  }

  if (typeGroups.size === 0) {
    return notes + 'No changes recorded.\n';
  }

  const typeEmojis: Record<string, string> = {
    feat: '🚀',
    fix: '🐛',
    perf: '⚡️',
    chore: '🏠',
    docs: '📚',
    style: '🎨',
    refactor: '♻️',
    test: '✅',
    build: '📦',
    ci: '🤖',
    revert: '⏪',
  };

  const typeOrder = ['feat', 'fix', 'perf', 'refactor', 'chore', 'docs', 'style', 'test', 'build', 'ci', 'revert'];

  for (const type of typeOrder) {
    const messages = typeGroups.get(type);
    if (!messages || messages.length === 0) continue;

    notes += `### ${typeEmojis[type] || '•'} ${type}\n`;
    for (const msg of messages) {
      notes += `- ${msg}\n`;
    }
    notes += '\n';
  }

  return notes;
}

export function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''").replace(/\n/g, '\\n').replace(/"/g, '\\"');
}
