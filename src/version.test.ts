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
  parseChangesetFile, 
  getHighestReleaseType, 
  bumpVersion,
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
      { type: 'minor', packageName: '@test/package' }
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
      { type: 'major', packageName: '@test/package' }
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
      { type: 'patch', packageName: '@test/package' }
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
      { type: 'minor', packageName: '@test/package' },
      { type: 'patch', packageName: '@other/package' }
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
      { type: 'minor', packageName: '@test/package' }
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
      { type: 'major', packageName: '@test/package' },
      { type: 'major', packageName: '@other/package' }
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
      { type: 'major', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('major');
  });

  test('should return minor when no major but has minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('minor');
  });

  test('should return patch when only patches', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  test('should return patch for single patch', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  test('should return major for single major', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'major', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('major');
  });

  test('should return minor for single minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('minor');
  });
});

describe('bumpVersion', () => {
  test('should bump major version correctly', () => {
    expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
    expect(bumpVersion('0.5.10', 'major')).toBe('1.0.0');
  });

  test('should bump minor version correctly', () => {
    expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(bumpVersion('1.5.10', 'minor')).toBe('1.6.0');
  });

  test('should bump patch version correctly', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpVersion('1.5.10', 'patch')).toBe('1.5.11');
  });

  test('should handle large version numbers', () => {
    expect(bumpVersion('999.999.999', 'major')).toBe('1000.0.0');
    expect(bumpVersion('999.999.999', 'minor')).toBe('999.1000.0');
    expect(bumpVersion('999.999.999', 'patch')).toBe('999.999.1000');
  });

  test('should throw error for invalid version format - missing parts', () => {
    expect(() => bumpVersion('1.0', 'major')).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - too many parts', () => {
    expect(() => bumpVersion('1.0.0.0', 'major')).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - non-numeric', () => {
    expect(() => bumpVersion('a.b.c', 'major')).toThrow('Invalid version format');
  });

  test('should throw error for invalid version format - mixed', () => {
    expect(() => bumpVersion('1.b.0', 'major')).toThrow('Invalid version format');
  });

  test('should handle zero versions', () => {
    expect(bumpVersion('0.0.0', 'major')).toBe('1.0.0');
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
    expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1');
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
});
