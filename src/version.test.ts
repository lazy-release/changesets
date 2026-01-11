import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
import { globSync } from 'tinyglobby';
import { readConfig } from './config.js';
import { 
  parseChangesetFile, 
  getHighestReleaseType, 
  bumpVersion,
  version,
  type ChangesetReleaseType 
} from './version.js';

vi.mock('fs');
vi.mock('tinyglobby');
vi.mock('./config.js', () => ({
  readConfig: vi.fn(() => ({
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
  })),
}));

describe('parseChangesetFile', () => {
  it('should parse a simple changeset file with feat type', () => {
    const content = `---
"@test/package": feat
---

Added new feature`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package' }
    ]);
  });

  it('should parse a changeset file with breaking change', () => {
    const content = `---
"@test/package": feat!
---

Breaking change added`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package' }
    ]);
  });

  it('should parse a changeset file with fix type', () => {
    const content = `---
"@test/package": fix
---

Bug fix`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'patch', packageName: '@test/package' }
    ]);
  });

  it('should parse a changeset file with multiple packages', () => {
    const content = `---
"@test/package": feat
"@other/package": fix
---

Multiple packages updated`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package' },
      { type: 'patch', packageName: '@other/package' }
    ]);
  });

  it('should parse a changeset file with malformed lines', () => {
    const content = `---
invalid line
"@test/package": feat
another invalid line
---

Test`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'minor', packageName: '@test/package' }
    ]);
  });

  it('should parse a changeset file with multiple breaking changes', () => {
    const content = `---
"@test/package": feat!
"@other/package": fix!
---

Multiple breaking changes`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([
      { type: 'major', packageName: '@test/package' },
      { type: 'major', packageName: '@other/package' }
    ]);
  });

  it('should return empty array for changeset without frontmatter', () => {
    const content = `No frontmatter here`;
    
    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([]);
  });

  it('should return empty array for changeset with empty frontmatter', () => {
    const content = `---
---
`;

    vi.mocked(readFileSync).mockReturnValue(content);
    vi.mocked(existsSync).mockReturnValue(true);
    
    const result = parseChangesetFile('.changeset/test.md');
    
    expect(result).toEqual([]);
  });
});

describe('getHighestReleaseType', () => {
  it('should return major when any release is major', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'major', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('major');
  });

  it('should return minor when no major but has minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('minor');
  });

  it('should return patch when only patches', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package' },
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  it('should return patch for single patch', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'patch', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('patch');
  });

  it('should return major for single major', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'major', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('major');
  });

  it('should return minor for single minor', () => {
    const releases: ChangesetReleaseType[] = [
      { type: 'minor', packageName: '@test/package' }
    ];
    
    expect(getHighestReleaseType(releases)).toBe('minor');
  });
});

describe('bumpVersion', () => {
  it('should bump major version correctly', () => {
    expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
    expect(bumpVersion('0.5.10', 'major')).toBe('1.0.0');
  });

  it('should bump minor version correctly', () => {
    expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(bumpVersion('1.5.10', 'minor')).toBe('1.6.0');
  });

  it('should bump patch version correctly', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpVersion('1.5.10', 'patch')).toBe('1.5.11');
  });

  it('should handle large version numbers', () => {
    expect(bumpVersion('999.999.999', 'major')).toBe('1000.0.0');
    expect(bumpVersion('999.999.999', 'minor')).toBe('999.1000.0');
    expect(bumpVersion('999.999.999', 'patch')).toBe('999.999.1000');
  });

  it('should throw error for invalid version format - missing parts', () => {
    expect(() => bumpVersion('1.0', 'major')).toThrow('Invalid version format');
  });

  it('should throw error for invalid version format - too many parts', () => {
    expect(() => bumpVersion('1.0.0.0', 'major')).toThrow('Invalid version format');
  });

  it('should throw error for invalid version format - non-numeric', () => {
    expect(() => bumpVersion('a.b.c', 'major')).toThrow('Invalid version format');
  });

  it('should throw error for invalid version format - mixed', () => {
    expect(() => bumpVersion('1.b.0', 'major')).toThrow('Invalid version format');
  });

  it('should handle zero versions', () => {
    expect(bumpVersion('0.0.0', 'major')).toBe('1.0.0');
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
    expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1');
  });
});

describe('version command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(existsSync).mockImplementation((path: import('fs').PathLike) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.includes('.changeset')) return true;
      return false;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit with error when .changeset directory does not exist', async () => {
    vi.mocked(existsSync).mockImplementation((path: import('fs').PathLike) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      return !pathStr.includes('.changeset');
    });
    
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
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

  it('should log message when no changeset files found', async () => {
    vi.mocked(globSync).mockReturnValue([]);
    
    await version();
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No changeset files found'));
  });

  it('should log message when no package releases found', async () => {
    vi.mocked(readFileSync).mockReturnValue(`---
---
`);
    vi.mocked(globSync).mockReturnValue(['.changeset/empty.md']);
    
    await version();
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No package releases found'));
  });

  it('should update package versions when changesets exist', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    vi.mocked(globSync).mockImplementation((options) => {
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✔'),
      expect.stringContaining('@test/package'),
      expect.stringContaining('1.0.0 → 1.1.0')
    );
  });

  it('should delete changeset files after updating versions', async () => {
    const changesetContent = `---
"@test/package": patch
---
Bug fix`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    vi.mocked(globSync).mockImplementation((options) => {
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: false });
    
    expect(unlinkSync).toHaveBeenCalledWith('.changeset/test.md');
  });

  it('should handle multiple packages in different changesets', async () => {
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
    
    let readCallCount = 0;
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
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
    
    vi.mocked(globSync).mockImplementation((options) => {
      if (options?.patterns?.[0].includes('package.json')) {
        return ['packages/test/package.json', 'packages/other/package.json'];
      }
      return ['.changeset/test.md', '.changeset/other.md'];
    });
    
    await version({ dryRun: true });
    
    const logCalls = vi.mocked(console.log).mock.calls;
    
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

  it('should ignore specified changeset files', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    let globCallCount = 0;
    vi.mocked(globSync).mockImplementation((options) => {
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
    
    const logCalls = vi.mocked(console.log).mock.calls;
    
    expect(logCalls[0]).toEqual([
      expect.stringContaining('✔'),
      expect.stringContaining('@test/package'),
      expect.stringContaining('1.0.0 → 1.1.0')
    ]);
  });

  it('should handle package.json without name', async () => {
    const changesetContent = `---
"@test/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      version: '1.0.0',
    }, null, 2);
    
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    vi.mocked(globSync).mockImplementation((options) => {
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dry run - no files were modified'));
  });

  it('should handle package.json without matching changeset', async () => {
    const changesetContent = `---
"@other/package": feat
---
New feature added`;
    
    const packageJsonContent = JSON.stringify({
      name: '@test/package',
      version: '1.0.0',
    }, null, 2);
    
    vi.mocked(readFileSync).mockImplementation((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      if (pathStr.includes('.changeset')) {
        return changesetContent;
      }
      return packageJsonContent;
    });
    
    vi.mocked(globSync).mockImplementation((options) => {
      if (options?.patterns?.[0].includes('package.json')) {
        return ['package.json'];
      }
      return ['.changeset/test.md'];
    });
    
    await version({ dryRun: true });
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dry run - no files were modified'));
  });
});
