---
"@lazy-release/changesets": fix
---

Fix passing --access argument to publish command. It now uses the publishConfig.access in the package.json. If that's not set then it uses the access in the changeset config.
