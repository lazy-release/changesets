import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';

mock.module('./config.js', () => ({
  readConfig: () => ({
    access: 'restricted',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    ignore: [],
    lazyChangesets: {
      types: {
        feat: {
          displayName: 'New Features',
          emoji: '🚀',
          sort: 0,
          releaseType: 'minor',
          promptBreakingChange: true,
        },
      },
    },
  }),
}));

import * as fs from 'node:fs';
import * as tinyglobby from 'tinyglobby';
import * as childProcess from 'node:child_process';
import * as packageManagerDetector from 'package-manager-detector';
import {
  publish,
  type PackageInfo,
  escapeShell,
  generateReleaseNotes
} from './publish.js';

describe('escapeShell', () => {
  test('should escape single quotes', () => {
    const input = "test'string";
    const output = escapeShell(input);
    expect(output).toBe("test'\\''string");
  });

  test('should escape double quotes', () => {
    const input = 'test"string';
    const output = escapeShell(input);
    expect(output).toBe('test\\"string');
  });

  test('should escape newlines', () => {
    const input = 'test\nstring';
    const output = escapeShell(input);
    expect(output).toBe('test\\nstring');
  });

  test('should escape multiple characters', () => {
    const input = "test'string\nwith\"quotes";
    const output = escapeShell(input);
    expect(output).toBe("test'\\''string\\nwith\\\"quotes");
  });
});

describe('generateReleaseNotes', () => {
  let pkg: PackageInfo;

  beforeEach(() => {
    pkg = {
      name: '@test/package',
      version: '1.0.0',
      dir: './',
      isPrivate: false,
    };
  });

  test('should generate release notes with feat changes', () => {
    const changesetContent = [
      `---
"@test/package": feat
---

Added new feature`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('# @test/package');
    expect(result).toContain('## 1.0.0');
    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- Added new feature');
  });

  test('should generate release notes with multiple types', () => {
    const changesetContent = [
      `---
"@test/package": feat
---

Added feature`,
      `---
"@test/package": fix
---

Fixed bug`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('### 🐛 fix');
    expect(result).toContain('- Added feature');
    expect(result).toContain('- Fixed bug');
  });

  test('should generate release notes with breaking changes', () => {
    const changesetContent = [
      `---
"@test/package": feat!
---

Breaking change`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- Breaking change');
  });

  test('should handle empty changeset content', () => {
    const changesetContent: string[] = [];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('# @test/package');
    expect(result).toContain('## 1.0.0');
    expect(result).toContain('No changes recorded.');
  });

  test('should skip changesets for other packages', () => {
    const changesetContent = [
      `---
"@other/package": feat
---

Other package feature`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('No changes recorded.');
  });

  test('should handle malformed changeset content', () => {
    const changesetContent = ['No frontmatter here'];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('No changes recorded.');
  });

  test('should handle changeset without message', () => {
    const changesetContent = [
      `---
"@test/package": feat
---

`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- ');
  });

  test('should order types correctly', () => {
    const changesetContent = [
      `---
"@test/package": fix
---

Fix`,
      `---
"@test/package": feat
---

Feature`,
      `---
"@test/package": docs
---

Docs`
    ];

    const result = generateReleaseNotes(pkg, changesetContent);

    const featIndex = result.indexOf('### 🚀 feat');
    const fixIndex = result.indexOf('### 🐛 fix');
    const docsIndex = result.indexOf('### 📚 docs');

    expect(featIndex).toBeLessThan(fixIndex);
    expect(fixIndex).toBeLessThan(docsIndex);
  });
});

describe('publish command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('package.json')) {
        return JSON.stringify({
          name: '@test/package',
          version: '1.0.0',
        }, null, 2);
      }
      return '';
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    mock.clearAllMocks();
  });

  test('should log message when no packages found', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue([]);

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No packages found'));
  });

  test('should publish packages in dry run mode', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });

    await publish({ dryRun: true });

    const dryRunCalls = consoleLogSpy.mock.calls.filter((call: any) =>
      call.some((arg: any) => typeof arg === 'string' && arg.includes('Dry run'))
    );
    expect(dryRunCalls.length).toBeGreaterThan(0);

    const calls = consoleLogSpy.mock.calls.flat();
    const hasDryRun = calls.some((arg: any) => typeof arg === 'string' && arg.includes('[DRY RUN]'));
    expect(hasDryRun).toBe(true);
  });

  test('should skip packages if tag exists on remote', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    spyOn(childProcess, 'execSync').mockReturnValue('');

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('already exists on remote'));
  });

  test('should create and push git tags', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedTag = calls.some((arg: any) => typeof arg === 'string' && arg.includes('Created tag'));
    const hasPushedTag = calls.some((arg: any) => typeof arg === 'string' && arg.includes('Pushed tag'));
    expect(hasCreatedTag).toBe(true);
    expect(hasPushedTag).toBe(true);
  });

  test('should handle private packages', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
      private: true,
    }, null, 2));
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Package is private'));
  });

  test('should publish to npm for public packages', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      if (cmd.includes('publish')) {
        return '';
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasPublished = calls.some((arg: any) => typeof arg === 'string' && arg.includes('Published to npm'));
    expect(hasPublished).toBe(true);
  });

  test('should use npm for publishing', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes('npm publish'));
    expect(publishCall).toBeDefined();
  });

  test('should use yarn for publishing', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'yarn', agent: 'yarn' });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes('yarn publish'));
    expect(publishCall).toBeDefined();
  });

  test('should use pnpm for publishing', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'pnpm', agent: 'pnpm' });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes('pnpm publish'));
    expect(publishCall).toBeDefined();
  });

  test('should use bun for publishing', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'bun', agent: 'bun' });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes('bun publish'));
    expect(publishCall).toBeDefined();
  });

  test('should warn for unsupported package manager', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'deno', agent: 'deno' } as any);

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported package manager'));
  });

  test('should skip npm publish when package manager not detected', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue(null);

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not detect package manager'));
  });

  test('should create GitHub release', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      if (cmd.includes('git diff')) {
        return '.changeset/test.md\n';
      }
      if (cmd.includes('git show')) {
        return `---
"@test/package": feat
---

Test changeset`;
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedRelease = calls.some((arg: any) => typeof arg === 'string' && arg.includes('Created GitHub release'));
    expect(hasCreatedRelease).toBe(true);
  });

  test('should skip GitHub release when no changesets found', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      if (cmd.includes('git diff')) {
        return '';
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No changesets found'));
  });

  test('should ignore packages in config ignore list', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      return JSON.stringify({
        name: '@ignored/package',
        version: '1.0.0',
      }, null, 2);
    });
    mock.module('./config.js', () => ({
      readConfig: () => ({
        access: 'restricted',
        baseBranch: 'main',
        updateInternalDependencies: 'patch',
        ignore: ['@ignored/package'],
        lazyChangesets: {
          types: {},
        },
      }),
    }));

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring package'));
  });

  test('should skip packages with missing name or version', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue(['package.json']);
    spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      version: '1.0.0',
    }, null, 2));

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
  });

  test('should handle multiple packages', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue([
      'packages/package1/package.json',
      'packages/package2/package.json',
    ]);
    let execCallCount = 0;
    spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes('ls-remote')) {
        throw new Error('Tag not found');
      }
      return '';
    });
    spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });

    await publish({ dryRun: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found'), expect.stringContaining('2 package(s)'));
  });
});
