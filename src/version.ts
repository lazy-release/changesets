import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { globSync } from 'tinyglobby';
import path from 'path';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { detect } from 'package-manager-detector';
import { readConfig } from './config.js';
import type { ChangesetType } from './changeset.js';

export interface ChangesetReleaseType {
  type: 'major' | 'minor' | 'patch';
  packageName: string;
  message: string;
  changesetType: string;
  isBreaking: boolean;
}

export function parseChangesetFile(filePath: string): ChangesetReleaseType[] {
  const config = readConfig();
  const content = readFileSync(filePath, 'utf-8');
  const releases: ChangesetReleaseType[] = [];
  
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return releases;
  }
  
  const frontmatter = frontmatterMatch[1];
  const lines = frontmatter.split('\n');
  
  const messageMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const message = messageMatch?.[1]?.trim() || '';
  
  for (const line of lines) {
    const match = line.match(/^"([^"]+)":\s*(\w+)(@major|!)?/);
    if (match) {
      const packageName = match[1];
      const changesetType = match[2];
      const suffix = match[3];
      const isBreaking = suffix === '!';
      const isExplicitMajor = suffix === '@major';
      
      let releaseType: ChangesetReleaseType['type'] = 'patch';
      
      if (isBreaking || isExplicitMajor) {
        releaseType = 'major';
      } else {
        const typeConfig = config.lazyChangesets.types.find(t => t.type === changesetType);
        if (typeConfig?.releaseType) {
          releaseType = typeConfig.releaseType;
        }
      }
      
      releases.push({ type: releaseType, packageName, message, changesetType, isBreaking });
    }
  }
  
  return releases;
}

export function getHighestReleaseType(releases: ChangesetReleaseType[]): ChangesetReleaseType['type'] {
  if (releases.some(r => r.type === 'major')) return 'major';
  if (releases.some(r => r.type === 'minor')) return 'minor';
  return 'patch';
}

export function bumpVersion(version: string, releaseType: ChangesetReleaseType['type'], isBreaking: boolean): string {
  const parts = version.split('.').map(Number);
  
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  
  switch (releaseType) {
    case 'major':
      if (isBreaking && parts[0] === 0) {
        return `${parts[0]}.${parts[1] + 1}.0`;
      }
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

export function generateChangelog(packageName: string, version: string, changesetContents: string[]): string {
  const config = readConfig();
  const date = new Date().toISOString().split('T')[0];
  let changelog = `## ${version} (${date})\n\n`;

  const typeGroups: Map<string, string[]> = new Map();
  const breakingChanges: string[] = [];

  for (const content of changesetContents) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');

    const messageMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const message = messageMatch?.[1]?.trim() || '';

    for (const line of lines) {
      const match = line.match(/^"([^"]+)":\s*(\w+)(!?)/);
      if (match && match[1] === packageName) {
        const changesetType = match[2];
        const isBreaking = match[3] === '!';

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
    changelog += '\n';
  }

  if (typeGroups.size === 0 && breakingChanges.length === 0) {
    return changelog + 'No changes recorded.\n';
  }

  const sortedTypes = Array.from(typeGroups.keys()).sort((a, b) => {
    const aIndex = config.lazyChangesets.types.findIndex(t => t.type === a);
    const bIndex = config.lazyChangesets.types.findIndex(t => t.type === b);
    const aSort = aIndex >= 0 ? aIndex : 999;
    const bSort = bIndex >= 0 ? bIndex : 999;
    return aSort - bSort;
  });

  for (const type of sortedTypes) {
    const messages = typeGroups.get(type);
    if (!messages || messages.length === 0) continue;

    const typeConfig = config.lazyChangesets.types.find(t => t.type === type);
    const emoji = typeConfig?.emoji || '•';
    
    changelog += `### ${emoji} ${type}\n`;
    for (const msg of messages) {
      changelog += `- ${msg}\n`;
    }
    changelog += '\n';
  }

  return changelog;
}

export async function version({ dryRun = false, ignore = [] as string[], install = false } = {}) {
  const config = readConfig();
  const changesetDir = path.join(process.cwd(), '.changeset');
  
  if (!existsSync(changesetDir)) {
    console.error(pc.red('No .changeset directory found.'));
    process.exit(1);
  }
  
  const changesetFiles = globSync({
    patterns: ['.changeset/*.md'],
    ignore: ['.changeset/README.md', ...ignore.map(i => `.changeset/${i}`)],
  });
  
  if (changesetFiles.length === 0) {
    console.log(pc.yellow('No changeset files found.'));
    return;
  }
  
  const packageReleases: Map<string, ChangesetReleaseType[]> = new Map();
  const packageChangelogs: Map<string, string[]> = new Map();
  
  for (const changesetFile of changesetFiles) {
    const content = readFileSync(changesetFile, 'utf-8');
    const releases = parseChangesetFile(changesetFile);
    for (const release of releases) {
      const existingReleases = packageReleases.get(release.packageName) || [];
      packageReleases.set(release.packageName, [...existingReleases, release]);
      
      const existingChangelogs = packageChangelogs.get(release.packageName) || [];
      packageChangelogs.set(release.packageName, [...existingChangelogs, content]);
    }
  }
  
  if (packageReleases.size === 0) {
    console.log(pc.yellow('No package releases found in changeset files.'));
    return;
  }
  
  const packageJsonPaths = globSync({
    patterns: ['**/package.json', '!**/node_modules/**', '!**/dist/**'],
  });
  
  const updatedPackages: string[] = [];
  
  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const packageName = packageJson.name;
    
    if (!packageName) continue;
    
    const releases = packageReleases.get(packageName);
    if (!releases) continue;
    
    const currentVersion = packageJson.version;
    const highestReleaseType = getHighestReleaseType(releases);
    const hasBreakingChange = releases.some(r => r.isBreaking);
    const newVersion = bumpVersion(currentVersion, highestReleaseType, hasBreakingChange);
    
    packageJson.version = newVersion;
    
    if (!dryRun) {
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      
      const packageDir = path.dirname(packageJsonPath);
      const changelogPath = path.join(packageDir, 'CHANGELOG.md');
      
      const changesetContents = packageChangelogs.get(packageName) || [];
      const newChangelog = generateChangelog(packageName, newVersion, changesetContents);
      
      let existingChangelog = '';
      if (existsSync(changelogPath)) {
        existingChangelog = readFileSync(changelogPath, 'utf-8');
      }
      
      writeFileSync(changelogPath, newChangelog + '\n' + existingChangelog, 'utf-8');
    }
    
    console.log(
      pc.green('✔'),
      pc.cyan(packageName),
      pc.dim(`(${currentVersion} → ${newVersion})`)
    );
    
    updatedPackages.push(packageName);
  }
  
  if (dryRun) {
    console.log(pc.yellow('\nDry run - no files were modified.'));
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
      let installCmd = '';
      
      switch (agent) {
        case 'npm':
          installCmd = 'npm install';
          break;
        case 'yarn':
        case 'yarn@berry':
          installCmd = 'yarn install';
          break;
        case 'pnpm':
        case 'pnpm@6':
          installCmd = 'pnpm install';
          break;
        case 'bun':
          installCmd = 'bun install';
          break;
        default:
          console.warn(pc.yellow(`Unsupported package manager: ${agent}. Skipping install.`));
          return;
      }
      
      console.log(`\n${pc.dim('Running')}`, pc.cyan(installCmd), pc.dim('...\n'));
      try {
        execSync(installCmd, { stdio: 'inherit' });
        console.log(pc.green('✔'), 'Install completed successfully');
      } catch (error) {
        console.error(pc.red('✗'), 'Install failed');
        throw error;
      }
    } else {
      console.warn(pc.yellow('Could not detect package manager. Skipping install.'));
    }
  }
}
