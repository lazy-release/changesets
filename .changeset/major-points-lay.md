---
"@lazy-release/changesets": fix!
---

Fixed issue changing types in the config. Refactored the config to use an array. Also removed the `sort` key from the type object.

```json
  "lazyChangesets": {
    "types": [
      {
        "type": "feat",
        "displayName": "New Features",
        "emoji": "🚀",
        "releaseType": "minor",
        "promptBreakingChange": true
      }
    ]
  }
```
