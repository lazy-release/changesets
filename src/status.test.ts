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
        fix: {
          displayName: 'Bug Fixes',
          emoji: '🐛',
          sort: 1,
          promptBreakingChange: true,
        },
      },
    },
  }),
}));

import * as fs from 'node:fs';
import * as tinyglobby from 'tinyglobby';
import { parseChangesetFile } from './version.js';

describe('status command', () => {
  beforeEach(() => {
    spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.clearAllMocks();
  });

  test('should find and display changesets', () => {
    const content = `---
"@test/package": feat
---

Added new feature`;

    spyOn(fs, 'existsSync').mockReturnValue(true);
    spyOn(fs, 'readFileSync').mockReturnValue(content);
    spyOn(tinyglobby, 'globSync').mockReturnValue(['.changeset/test.md']);
    spyOn(tinyglobby, 'globSync').mockReturnValue(['.changeset/test.md']);

    parseChangesetFile('.changeset/test.md');

    expect(fs.readFileSync).toHaveBeenCalled();
  });
});
