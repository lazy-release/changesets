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
