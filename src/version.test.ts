import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';

mock.module('./config.js', () => ({
  readConfig: () => ({
    access: 'restricted',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    ignore: [],
    lazyChangesets: {
      types: [
        {
          type: 'feat',
          displayName: 'New Features',
          emoji: '🚀',
          releaseType: 'minor',
          promptBreakingChange: true,
        },
        {
          type: 'fix',
          displayName: 'Bug Fixes',
          emoji: '🐛',
          promptBreakingChange: true,
        },
        {
          type: 'perf',
          displayName: 'Performance Improvements',
          emoji: '⚡️',
          promptBreakingChange: true,
        },
        {
          type: 'chore',
          displayName: 'Chores',
          emoji: '🏠',
        },
        {
          type: 'docs',
          displayName: 'Documentation',
          emoji: '📚',
        },
        {
          type: 'style',
          displayName: 'Styles',
          emoji: '🎨',
        },
        {
          type: 'refactor',
          displayName: 'Refactoring',
          emoji: '♻️',
          promptBreakingChange: true,
        },
        {
          type: 'test',
          displayName: 'Tests',
          emoji: '✅',
        },
        {
          type: 'build',
          displayName: 'Build',
          emoji: '📦',
          promptBreakingChange: true,
        },
        {
          type: 'ci',
          displayName: 'Automation',
          emoji: '🤖',
        },
        {
          type: 'revert',
          displayName: 'Reverts',
          emoji: '⏪',
          promptBreakingChange: true,
        },
      ],
    },
  }),
}));

import * as fs from 'node:fs';
import * as tinyglobby from 'tinyglobby';
import * as childProcess from 'node:child_process';
import * as packageManagerDetector from 'package-manager-detector';
import { 
  parseChangesetFile, 
  getHighestReleaseType, 
  bumpVersion,
  generateChangelog,
  version,
  type ChangesetReleaseType 
} from './version.js';

describe('parseChangesetFile', () => {
  test('should parse a simple changeset file with feat type', () => {
    const content = `---
"@test/package": feat
---

Added new feature`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package', changesetType: 'feat', message: 'Added new feature', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with breaking change', () => {
    const content = `---
"@test/package": feat!
---

Breaking change added`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package', changesetType: 'feat', message: 'Breaking change added', isBreaking: true }
    ]);
  });

  test('should parse a changeset file with explicit major bump', () => {
    const content = `---
"@test/package": chore@major
---

v1 release`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package', changesetType: 'chore', message: 'v1 release', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with fix type', () => {
    const content = `---
"@test/package": fix
---

Bug fix`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: 'Bug fix', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with multiple packages', () => {
    const content = `---
"@test/package": feat
"@other/package": fix
---

Multiple packages updated`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package', changesetType: 'feat', message: 'Multiple packages updated', isBreaking: false },
      { type: 'patch', packageName: '@other/package', changesetType: 'fix', message: 'Multiple packages updated', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with malformed lines', () => {
    const content = `---
invalid line
"@test/package": feat
another invalid line
---

Test`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package', changesetType: 'feat', message: 'Test', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with multiple breaking changes', () => {
    const content = `---
"@test/package": feat!
"@other/package": fix!
---

Multiple breaking changes`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package', changesetType: 'feat', message: 'Multiple breaking changes', isBreaking: true },
      { type: 'major', packageName: '@other/package', changesetType: 'fix', message: 'Multiple breaking changes', isBreaking: true }
    ]);
  });

  test('should parse a changeset file with multiple explicit major bumps', () => {
    const content = `---
"@test/package": chore@major
"@other/package": feat@major
---

Multiple v1 releases`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package', changesetType: 'chore', message: 'Multiple v1 releases', isBreaking: false },
      { type: 'major', packageName: '@other/package', changesetType: 'feat', message: 'Multiple v1 releases', isBreaking: false }
    ]);
  });

  test('should parse a changeset file with mix of breaking and explicit major', () => {
    const content = `---
"@test/package": feat!
"@other/package": chore@major
---

Mixed major bumps`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package', changesetType: 'feat', message: 'Mixed major bumps', isBreaking: true },
      { type: 'major', packageName: '@other/package', changesetType: 'chore', message: 'Mixed major bumps', isBreaking: false }
    ]);
  });

  test('should return empty array for changeset without frontmatter', () => {
    const content = `No frontmatter here`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([]);
  });

  test('should return empty array for changeset with empty frontmatter', () => {
    const content = `---
---
`;

    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(fs, 'existsSync').mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([]);
  });
});

describe('getHighestReleaseType', () => {
  test('should return major when any release is major', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'major', packageName: '@test/package', changesetType: 'feat', message: '', isBreaking: true },
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: '', isBreaking: false }
    ];

    expect(getHighestReleaseType(releases)).toBe('major');
  });

  test('should return minor when no major but has minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package', changesetType: 'feat', message: '', isBreaking: false },
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: '', isBreaking: false }
    ];

    expect(getHighestReleaseType(releases)).toBe('minor');
  });

  test('should return patch when only patches', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: '', isBreaking: false },
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: '', isBreaking: false }
    ];

    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  test('should return patch for single patch', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package', changesetType: 'fix', message: '', isBreaking: false }
    ];

    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  test('should return major for single major', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'major', packageName: '@test/package', changesetType: 'feat', message: '', isBreaking: true }
    ];

    expect(getHighestReleaseType(releases)).toBe('major');
  });

  test('should return minor for single minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package', changesetType: 'feat', message: '', isBreaking: false }
    ];

    expect(getHighestReleaseType(releases)).toBe('minor');
  });
});

describe('parseChangesetFile with custom types', () => {
  test('should use custom releaseType from config', () => {
    const content = `---
"@test/package": feat
---

New feature`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result[0].type).toBe('minor');
  });

  test('should default to patch for types without releaseType in config', () => {
    const content = `---
"@test/package": chore
---

Chore update`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result[0].type).toBe('patch');
  });

  test('should still respect breaking change suffix over custom config', () => {
    const content = `---
"@test/package": chore!
---

Breaking chore`;
    
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result[0].type).toBe('major');
    expect(result[0].isBreaking).toBe(true);
  });
});

describe('bumpVersion', () => {
  test('should bump major version correctly', () => {
    expect(bumpVersion('1.0.0', 'major', false)).toBe('2.0.0');
  });

  test('should bump minor version correctly', () => {
    expect(bumpVersion('1.0.0', 'minor', false)).toBe('1.1.0');
    expect(bumpVersion('1.5.10', 'minor', false)).toBe('1.6.0');
  });

  test('should bump patch version correctly', () => {
    expect(bumpVersion('1.0.0', 'patch', false)).toBe('1.0.1');
    expect(bumpVersion('1.5.10', 'patch', false)).toBe('1.5.11');
  });

  test('should handle large version numbers', () => {
    expect(bumpVersion('999.999.999', 'major', false)).toBe('1000.0.0');
    expect(bumpVersion('999.999.999', 'minor', false)).toBe('999.1000.0');
    expect(bumpVersion('999.999.999', 'patch', false)).toBe('999.999.1000');
  });

  test('should throw error for invalid version format - missing parts', () => {
    expect(() => bumpVersion('1.0', 'major', false)).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - too many parts', () => {
    expect(() => bumpVersion('1.0.0.0', 'major', false)).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - non-numeric', () => {
    expect(() => bumpVersion('a.b.c', 'major', false)).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - mixed', () => {
    expect(() => bumpVersion('1.b.0', 'major', false)).toThrow('Invalid version format');
  });

  test('should handle zero versions', () => {
    expect(bumpVersion('0.0.0', 'major', false)).toBe('1.0.0');
    expect(bumpVersion('0.0.0', 'minor', false)).toBe('0.1.0');
    expect(bumpVersion('0.0.0', 'patch', false)).toBe('0.0.1');
  });

  test('should bump minor version for v0.x.x with breaking change', () => {
    expect(bumpVersion('0.0.0', 'major', true)).toBe('0.1.0');
    expect(bumpVersion('0.5.10', 'major', true)).toBe('0.6.0');
    expect(bumpVersion('0.9.99', 'major', true)).toBe('0.10.0');
  });

  test('should bump major version for v1.x.x with breaking change', () => {
    expect(bumpVersion('1.0.0', 'major', true)).toBe('2.0.0');
    expect(bumpVersion('1.5.10', 'major', true)).toBe('2.0.0');
    expect(bumpVersion('1.9.99', 'major', true)).toBe('2.0.0');
  });

  test('should bump major version for v2+ with breaking change', () => {
    expect(bumpVersion('2.0.0', 'major', true)).toBe('3.0.0');
    expect(bumpVersion('2.5.10', 'major', true)).toBe('3.0.0');
    expect(bumpVersion('10.9.99', 'major', true)).toBe('11.0.0');
  });
});

describe('version command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(fs, 'existsSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) return true;
      return false;
    });
    spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    mock.clearAllMocks();
  });

  test('should exit with error when .changeset directory does not exist', async () => {
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      return !pathStr.includes('.changeset');
    });
    
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exited');
    });
    
    try {
      await version();
    } catch (e) {
      expect((e as Error).message).toBe('Process exited');
    }
    
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  test('should log message when no changeset files found', async () => {
    spyOn(tinyglobby, 'globSync').mockReturnValue([]);
    
    await version();
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No changeset files found'));
  });

  test('should log message when no package releases found', async () => {
    const readSpy = spyOn(fs, 'readFileSync').mockReturnValue(`---
---
`);
    const globSpy = spyOn(tinyglobby, 'globSync').mockReturnValue(['.changeset/empty.md']);
    
    await version();
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No package releases found'));
  });

  test('should update package versions when changesets exist', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('✔'),
      expect.stringContaining('@test/package'),
      expect.stringContaining('1.0.0 → 1.1.0')
    );
  });

  test('should delete changeset files after updating versions', async () => {
    const changesetContent = `---
"@test/package": patch
---
Bug fix`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    const unlinkSpy = spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    
    await version({ dryRun: false });
    
    expect(unlinkSpy).toHaveBeenCalledWith('.changeset/test.md');
  });

  test('should handle multiple packages in different changesets', async () => {
    const changeset1Content = `---
"@test/package": feat
---
Feature for test package`;

    const changeset2Content = `---
"@other/package": fix
---
Fix for other package`;
    
    const packageJson1 = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    const packageJson2 = JSON.stringify({
      name: '@other/package',
      version: '2.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('test.md')) {
        return changeset1Content;
      } else if (pathStr.includes('other.md')) {
        return changeset2Content;
      } else if (pathStr.includes('test/package.json')) {
        return packageJson1;
      } else {
        return packageJson2;
      }
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (options?.patterns?.[0].includes('package.json')) {
        return ['packages/test/package.json', 'packages/other/package.json'];
      }
      return ['.changeset/test.md', '.changeset/other.md'];
    });
    
    await version({ dryRun: true });
    
    const logCalls = consoleLogSpy.mock.calls;
    
    expect(logCalls[0]).toEqual([
      expect.stringContaining('✔'),
      expect.stringContaining('@test/package'),
      expect.stringContaining('1.0.0 → 1.1.0')
    ]);
    expect(logCalls[1]).toEqual([
      expect.stringContaining('✔'),
      expect.stringContaining('@other/package'),
      expect.stringContaining('2.0.0 → 2.0.1')
    ]);
  });

  test('should ignore specified changeset files', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (globCallCount === 1) {
        return ['.changeset/test.md', '.changeset/ignored.md'];
      }
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true, ignore: ['ignored.md'] });
    
    const logCalls = consoleLogSpy.mock.calls;
    
    expect(logCalls[0]).toEqual([
      expect.stringContaining('✔'),
      expect.stringContaining('@test/package'),
      expect.stringContaining('1.0.0 → 1.1.0')
    ]);
  });

  test('should handle package.json without name', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      version: '1.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run - no files were modified'));
  });

  test('should handle package.json without matching changeset', async () => {
    const changesetContent = `---
"@other/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
      globCallCount++;
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run - no files were modified'));
  });

  describe('install flag', () => {
    test('should run npm install when install flag is true', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });
      
      await version({ dryRun: false, install: true });
      
      expect(execSpy).toHaveBeenCalledWith('npm install', { stdio: 'inherit' });
    });

    test('should run pnpm install when pnpm is detected', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'pnpm', agent: 'pnpm' });
      
      await version({ dryRun: false, install: true });
      
      expect(execSpy).toHaveBeenCalledWith('pnpm install', { stdio: 'inherit' });
    });

    test('should run yarn install when yarn is detected', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'yarn', agent: 'yarn' });
      
      await version({ dryRun: false, install: true });
      
      expect(execSpy).toHaveBeenCalledWith('yarn install', { stdio: 'inherit' });
    });

    test('should run bun install when bun is detected', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'bun', agent: 'bun' });
      
      await version({ dryRun: false, install: true });
      
      expect(execSpy).toHaveBeenCalledWith('bun install', { stdio: 'inherit' });
    });

    test('should skip install when dryRun is true', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });
      
      await version({ dryRun: true, install: true });
      
      expect(execSpy).not.toHaveBeenCalled();
    });

    test('should skip install when no packages are updated', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@other/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      const execSpy = spyOn(childProcess, 'execSync').mockReturnValue('');
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'npm', agent: 'npm' });
      
      await version({ dryRun: false, install: true });
      
      expect(execSpy).not.toHaveBeenCalled();
    });

    test('should warn for unsupported package manager', async () => {
      const changesetContent = `---
"@test/package": patch
---
Bug fix`;
      
      const packageJsonContent = JSON.stringify({
        name: '@test/package',
        version: '1.0.0',
      }, null, 2);
      
      spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        const pathStr = typeof path === 'string' ? path : path.toString();
        if (pathStr.includes('.changeset')) {
          return changesetContent;
        }
        return packageJsonContent;
      });
      
      let globCallCount = 0;
      spyOn(tinyglobby, 'globSync').mockImplementation((options: any) => {
        globCallCount++;
        if (options?.patterns?.[0].includes('package.json')) {
          return ['package.json'];
        }
        return ['.changeset/test.md'];
      });
      
      spyOn(packageManagerDetector, 'detect').mockResolvedValue({ name: 'deno', agent: 'deno' } as any);
      
      await version({ dryRun: false, install: true });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported package manager'));
  });
});

describe('generateChangelog', () => {
  test('should include date in version heading', () => {
    const changesetContents = [
      `---
"@test/package": feat
---
New feature`,
    ];

    const result = generateChangelog('@test/package', '1.1.0', changesetContents);
    const dateRegex = /\d{4}-\d{2}-\d{2}/;
    const headingRegex = /## 1\.1\.0 \(\d{4}-\d{2}-\d{2}\)/;

    expect(result).toMatch(headingRegex);
    expect(result).toMatch(dateRegex);
  });

  test('should generate changelog with breaking changes first', () => {
    const changesetContents = [
      `---
"@test/package": feat!
---
Breaking API change`,
      `---
"@test/package": fix
---
Bug fix`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    expect(result).toContain('## 2.0.0');
    expect(result).toContain('⚠️ Breaking Changes');
    expect(result.indexOf('⚠️ Breaking Changes')).toBeLessThan(result.indexOf('🐛 fix'));
    expect(result).toContain('- Breaking API change');
    expect(result).toContain('### 🐛 fix');
    expect(result).toContain('- Bug fix');
  });

  test('should generate changelog with only breaking changes', () => {
    const changesetContents = [
      `---
"@test/package": feat!
---
Breaking API change`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    expect(result).toContain('## 2.0.0');
    expect(result).toContain('⚠️ Breaking Changes');
    expect(result).toContain('- Breaking API change');
    expect(result).not.toContain('###');
  });

  test('should generate changelog with only non-breaking changes', () => {
    const changesetContents = [
      `---
"@test/package": feat
---
New feature`,
      `---
"@test/package": fix
---
Bug fix`,
    ];

    const result = generateChangelog('@test/package', '1.1.0', changesetContents);

    expect(result).toContain('## 1.1.0');
    expect(result).not.toContain('⚠️ Breaking Changes');
    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- New feature');
    expect(result).toContain('### 🐛 fix');
    expect(result).toContain('- Bug fix');
  });

  test('should handle multiple breaking changes', () => {
    const changesetContents = [
      `---
"@test/package": feat!
---
Breaking API change 1`,
      `---
"@test/package": fix!
---
Breaking API change 2`,
      `---
"@test/package": feat
---
New feature`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    expect(result).toContain('⚠️ Breaking Changes');
    expect(result).toContain('- Breaking API change 1');
    expect(result).toContain('- Breaking API change 2');
    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- New feature');
  });

  test('should filter changesets by package name', () => {
    const changesetContents = [
      `---
"@test/package": feat!
---
Breaking change for test package`,
      `---
"@other/package": feat!
---
Breaking change for other package`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    expect(result).toContain('- Breaking change for test package');
    expect(result).not.toContain('Breaking change for other package');
  });

  test('should handle empty changeset contents', () => {
    const result = generateChangelog('@test/package', '1.0.0', []);

    expect(result).toContain('## 1.0.0');
    expect(result).toContain('No changes recorded');
  });

  test('should handle changesets without matching package', () => {
    const changesetContents = [
      `---
"@other/package": feat
---
Feature for other package`,
    ];

    const result = generateChangelog('@test/package', '1.0.0', changesetContents);

    expect(result).toContain('## 1.0.0');
    expect(result).toContain('No changes recorded');
  });

  test('should handle changesets with malformed frontmatter', () => {
    const changesetContents = [
      `No frontmatter here`,
      `---
"@test/package": feat
---
Valid changeset`,
    ];

    const result = generateChangelog('@test/package', '1.1.0', changesetContents);

    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- Valid changeset');
  });

  test('should maintain type order after breaking changes', () => {
    const changesetContents = [
      `---
"@test/package": chore!
---
Breaking chore`,
      `---
"@test/package": feat
---
Feature`,
      `---
"@test/package": fix
---
Fix`,
      `---
"@test/package": docs
---
Documentation`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    const breakingIndex = result.indexOf('⚠️ Breaking Changes');
    const featIndex = result.indexOf('### 🚀 feat');
    const fixIndex = result.indexOf('### 🐛 fix');
    const docsIndex = result.indexOf('### 📚 docs');

    expect(breakingIndex).toBeLessThan(featIndex);
    expect(featIndex).toBeLessThan(fixIndex);
    expect(fixIndex).toBeLessThan(docsIndex);
  });

  test('should not show breaking changes section for explicit major bumps', () => {
    const changesetContents = [
      `---
"@test/package": chore@major
---
v1 release`,
      `---
"@test/package": feat
---
New feature`,
    ];

    const result = generateChangelog('@test/package', '1.0.0', changesetContents);

    expect(result).not.toContain('⚠️ Breaking Changes');
    expect(result).toContain('### 🏠 chore');
    expect(result).toContain('- v1 release');
    expect(result).toContain('### 🚀 feat');
    expect(result).toContain('- New feature');
  });

  test('should differentiate between breaking changes and explicit major bumps', () => {
    const changesetContents = [
      `---
"@test/package": feat!
---
Breaking API change`,
      `---
"@test/package": chore@major
---
v1 release`,
    ];

    const result = generateChangelog('@test/package', '2.0.0', changesetContents);

    expect(result).toContain('⚠️ Breaking Changes');
    expect(result).toContain('- Breaking API change');
    expect(result).toContain('### 🏠 chore');
    expect(result).toContain('- v1 release');
    const breakingIndex = result.indexOf('⚠️ Breaking Changes');
    const v1Index = result.indexOf('v1 release');
    expect(breakingIndex).toBeLessThan(v1Index);
  });
});
});
