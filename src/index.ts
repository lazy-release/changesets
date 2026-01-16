#!/usr/bin/env node

import {
  multiselect,
  select,
  text,
  confirm,
  isCancel,
  cancel,
} from '@clack/prompts';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import { Command } from 'commander';
import path from 'node:path';
import { humanId } from 'human-id';
import pc from 'picocolors';
import { ChangesetConfig, readConfig } from './config.js';
import { version } from './version.js';
import { publish } from './publish.js';
import { parseChangesetFile } from './version.js';

async function findPackages(config: ChangesetConfig): Promise<Map<string, string>> {
  const packageJsonPaths = globSync({
    patterns: ['**/package.json', '!**/node_modules/**', '!**/dist/**'],
  });

  const packageMap: Map<string, string> = new Map();

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const packageName = packageJson.name;
    if (!packageName) {
      console.warn(`No name found in ${packageJsonPath}`);
      continue;
    }

    if (config.ignore.includes(packageName)) {
      console.warn(`Ignoring package ${packageName}`);
      continue;
    }

    const dirPath = './' + packageJsonPath.replace(/\/?package\.json$/, '');
    packageMap.set(packageJson.name, dirPath);
  }

  return packageMap;
}

async function getSelectedPackages(
  packages: Map<string, string>
): Promise<string[]> {
  const selectedPackages: string[] = [];

  if (packages.size > 1) {
    const selected = await multiselect({
      message: 'Which packages would you like to include?',
      options: Array.from(packages.keys())
        .sort((a, b) => a.localeCompare(b))
        .map((pkg) => ({
          value: pkg,
          label: pkg,
        })),
    });

    if (isCancel(selected)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    selectedPackages.push(...(selected as string[]));
  } else if (packages.size === 1) {
    const selectedPackage = Array.from(packages.keys())[0];
    selectedPackages.push(selectedPackage);
  }

  return selectedPackages;
}

async function createChangeset(args: { empty?: boolean }) {
  const config = readConfig();

  if (args.empty) {
    const changesetDir = path.join(process.cwd(), '.changeset');

    if (!existsSync(changesetDir)) {
      mkdirSync(changesetDir);
    }

    const changesetID = humanId({
      separator: '-',
      capitalize: false,
    });

    const changesetFileName = `${changesetID}.md`;
    const changesetFilePath = path.join(changesetDir, changesetFileName);
    const markdownContent = '---\n---\n\n';
    writeFileSync(changesetFilePath, markdownContent, {
      encoding: 'utf-8',
    });

    console.log(
      pc.green('Empty Changeset added! - you can now commit it\n')
    );
    console.log(
      pc.green(
        'If you want to modify or expand on the changeset summary, you can find it here'
      )
    );
    console.log(pc.cyan('info'), pc.blue(changesetFilePath));
    return;
  }

  const packages = await findPackages(config);

  if (packages.size === 0) {
    console.log('No packages found.');
    return;
  }

  const selectedPackages = await getSelectedPackages(packages);
  if (selectedPackages.length === 0) {
    console.log('No packages selected.');
    return;
  }

  const sortedTypeKeys = Object.keys(config.lazyChangesets.types).sort((a, b) => {
      return config.lazyChangesets.types[a].sort - config.lazyChangesets.types[b].sort;
  });

  const msgType = await select({
    message: 'Select changelog type',
    options: sortedTypeKeys.map(key => {
      const type = config.lazyChangesets.types[key];
      return {
        value: key,
        label: `${type.emoji} ${key}`,
        hint: type.displayName,
      };
    }),
  });

  if (isCancel(msgType)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const changesetType = config.lazyChangesets.types[msgType];
  let isBreakingChange = false;
  let isMajorBump = false;

  const v0Packages = selectedPackages.filter(pkg => {
    const packageDir = packages.get(pkg);
    if (!packageDir) return false;
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) return false;
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version && packageJson.version.startsWith('0.');
  });

  if (v0Packages.length > 0) {
    const shouldBumpToV1 = await confirm({
      message: `The following packages are at v0: ${v0Packages.join(', ')}. Do you want to bump to v1?`,
      initialValue: false,
    });

    if (isCancel(shouldBumpToV1)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    isMajorBump = shouldBumpToV1;
  }

  if (changesetType.promptBreakingChange && !isMajorBump) {
    const tempIsBreakingChange = await confirm({
      message: 'Is this a breaking change?',
      initialValue: false,
    });

    if (isCancel(tempIsBreakingChange)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    isBreakingChange = tempIsBreakingChange;
  }

  const msg = await text({
    message: 'Enter a message for the changeset',
    placeholder: 'e.g Added x feature',
    validate(value) {
      if (value.length === 0) return 'Message cannot be empty.';
    },
  });

  if (isCancel(msg)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const changesetDir = path.join(process.cwd(), '.changeset');

  if (!existsSync(changesetDir)) {
    mkdirSync(changesetDir);
  }

  const changesetID = humanId({
    separator: '-',
    capitalize: false,
  });

  const changesetFileName = `${changesetID}.md`;
  const changesetFilePath = path.join(changesetDir, changesetFileName);
  let changesetContent = '---\n';
  selectedPackages.forEach((pkg) => {
    let suffix = '';
    if (isMajorBump && v0Packages.includes(pkg)) {
      suffix = '@major';
    } else if (isBreakingChange) {
      suffix = '!';
    }
    changesetContent += `"${pkg}": ${msgType.toString()}${suffix}\n`;
  });

  changesetContent += '---\n\n';
  changesetContent += `${msg.toString()}\n`;

  writeFileSync(changesetFilePath, changesetContent, {
    encoding: 'utf-8',
  });
}

async function status() {
  const config = readConfig();
  const changesetDir = path.join(process.cwd(), '.changeset');

  if (!existsSync(changesetDir)) {
    console.error(pc.red('No .changeset directory found.'));
    process.exit(1);
  }

  const changesetFiles = globSync({
    patterns: ['.changeset/*.md'],
    ignore: ['.changeset/README.md', '.changeset/config.json'],
  });

  if (changesetFiles.length === 0) {
    console.log(pc.yellow('No changeset files found.'));
    return;
  }

  console.log(
    pc.bold(`\nFound ${changesetFiles.length} changeset(s):\n`)
  );

  for (const changesetFile of changesetFiles) {
    const fileName = path.basename(changesetFile);
    const releases = parseChangesetFile(changesetFile);

    if (releases.length === 0) {
      continue;
    }

    console.log(
      pc.blue('─'.repeat(60))
    );

    for (const release of releases) {
      const typeConfig = config.lazyChangesets.types[release.changesetType];
      const emoji = typeConfig?.emoji || '•';
      const typeName = typeConfig?.displayName || release.changesetType;

      console.log(
        pc.cyan('●'),
        pc.bold(release.packageName),
        pc.dim(`(${typeName})`)
      );

      const typeEmoji = pc.cyan(`${emoji} ${release.changesetType}`);
      const breakingIndicator = release.isBreaking ? pc.red('! ') : '';

      console.log(
        pc.dim('  ' + breakingIndicator + typeEmoji),
        pc.dim('—'),
        release.message || pc.dim('No message')
      );
    }

    console.log(
      pc.dim(`  ${fileName}`)
    );
  }

  console.log(
    pc.blue('─'.repeat(60))
  );
}

const program = new Command();

program
  .name('changeset')
  .description('A CLI tool for generating changesets.')
  .option('--empty', 'Create an empty changeset')
  .action(async (options) => {
    await createChangeset({ empty: options.empty });
  });

program
  .command('init')
  .description('Initialize changesets')
  .action(async () => {
    await init();
    process.exit(0);
  });

program
  .command('version')
  .description('Bump package versions based on changesets')
  .option('--dry-run', 'Show what would be changed without modifying files', false)
  .option('--install', 'Run package manager install after version bump', false)
  .action(async (options) => {
    await version({ dryRun: options.dryRun, install: options.install });
    process.exit(0);
  });

program
  .command('publish')
  .description('Publish packages to npm and create GitHub releases')
  .option('--dry-run', 'Show what would be published without actually publishing', false)
  .option('--github-token <token>', 'GitHub token for creating releases (defaults to GITHUB_TOKEN env var)')
  .option('--draft', 'Create GitHub releases as drafts', false)
  .action(async (options) => {
    await publish({ dryRun: options.dryRun, githubToken: options.githubToken, draft: options.draft });
    process.exit(0);
  });

program
  .command('status')
  .description('Show status of pending changesets')
  .action(async () => {
    await status();
    process.exit(0);
  });

program.parse(process.argv);

async function init() {
  console.log('Initializing changesets...');
  const changesetDir = path.join(process.cwd(), '.changeset');
  if (!existsSync(changesetDir)) {
    mkdirSync(changesetDir);
    console.log('Created .changeset directory');
  }

  // create config file
  const configFilePath = path.join(changesetDir, 'config.json');
  if (!existsSync(configFilePath)) {
    const DEFAULT_CONFIG: Omit<ChangesetConfig, 'lazyChangesets'> = {
      access: 'restricted',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      ignore: [],
    };

    writeFileSync(configFilePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log('Created config.json file');
  }

  // create README file
  const readmeFilePath = path.join(changesetDir, 'README.md');
  if (!existsSync(readmeFilePath)) {
    const readmeContent = getReadmeContent();
    writeFileSync(readmeFilePath, readmeContent);
    console.log('Created README.md file');
  }

  console.log('Changesets initialized');
}

function getReadmeContent() {
  return `
  # Lazy Changesets
  - TODO
  `;
}
