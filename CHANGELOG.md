## 0.4.0 (2026-01-15)

### 🚀 feat
- Show the date in the changelog
- Added `--github-token` argument as an alternative to the `GITHUB_TOKEN` env var
- Added status command to show pending changesets

### 🐛 fix
- Fix passing --access argument to publish command. It now uses the publishConfig.access in the package.json. If that's not set then it uses the access in the changeset config.
- Improve error message when missing the `GITHUB_TOKEN` env var

### ♻️ refactor
- Migrated the cli from citty to commanderjs

### 🏠 chore
- Updated bun to v1.3.6


## 0.3.0

### 🚀 feat
- Added a prompt that will ask you if you want to bump a v0 package to v1 explicitly if you add a changeset to a v0 package.

### 🐛 fix
- Fix bumping version logic for breaking changes when version is v0 vs v1
- Remove tag heading and version subheading from the release notes
- Fix github release title and tag for root packages. Root packages use v1.0.0 format instead of @scope/package-name@version
- Fix showing publish output
- Fix show breaking changes first in the changelog and release notes

### 🏠 chore
- Remove vitest for bun test


## 0.2.0

### 🚀 feat
- Added publish command
- Added version command to bump the version in the package.json files based on the changesets
- Added support for customizing changeset types.

Here's an example.

`.changeset/config.json`
```json
{
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
  "access": "restricted",
  "lazyChangesets": {
    "types": {
      "feat": {
        "displayName": "New Features",
        "emoji": "🚀",
        "sort": 0,
        "releaseType": "minor",
        "promptBreakingChange": true
      },
      "fix": {
        "displayName": "Bug Fixes",
        "emoji": "🐛",
        "sort": 1,
        "promptBreakingChange": true
      },
      "perf": {
        "displayName": "Performance Improvements",
        "emoji": "⚡️",
        "sort": 2,
        "promptBreakingChange": true
      },
      "chore": {
        "displayName": "Chores",
        "emoji": "🏠",
        "sort": 3
      }
    }
  }
}
```

### 📦 build
- Migrated to bun

## 0.1.0

### 🚀 feat
- Added `--empty` flag to allow creating empty changesets.
