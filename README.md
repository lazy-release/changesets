# Lazy Changesets CLI

[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/cadamsdev/lazy-changesets/issues) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![GitHub Tag](https://img.shields.io/github/v/tag/cadamsdev/lazy-changesets)

A lightweight, convention-driven changeset management tool that automates semantic versioning based on conventional commit types. Designed for monorepo workflows with support for publishing to npm and creating GitHub releases.

## 📥 Installation

Install globally using your preferred package manager:

```bash
npm install -g @lazy-release/changesets
```

## 🚀 Quick Start

### 1. Initialize

Set up changesets in your project:

```bash
changeset init
```

This creates a `.changeset` directory with:
- `config.json` - Configuration for changesets
- `README.md` - Documentation for your team

### 2. Create Changesets

When making changes, create a changeset to document them:

```bash
changeset
```

You'll be prompted to:
1. Select affected packages (in monorepos)
2. Choose a change type (feat, fix, chore, etc.)
3. Indicate if it's a breaking change
4. Provide a description of the changes

#### Options

- `--empty` - Create an empty changeset file
- `--all` - Pre-select all packages in the prompt

### 3. Check Status

View pending changesets:

```bash
changeset status
```

This displays all changesets with their types, affected packages, and messages.

### 4. Bump Versions

Update package versions based on changesets:

```bash
changeset version
```

This will:
- Calculate version bumps based on changeset types
- Update `package.json` files
- Generate or update `CHANGELOG.md` files
- Delete consumed changeset files

#### Options

- `--dry-run` - Preview changes without modifying files
- `--install` - Run package manager install after version bump

### 5. Publish

Publish packages and create releases:

```bash
changeset publish
```

This will:
- Publish updated packages to npm
- Create GitHub releases with changelog notes
- Tag releases in git

#### Options

- `--dry-run` - Preview what would be published
- `--github-token <token>` - GitHub token for releases (defaults to `GITHUB_TOKEN` env var)
- `--draft` - Create GitHub releases as drafts

## 📋 Configuration

Edit `.changeset/config.json` to customize behavior:

```json
{
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
  "lazyChangesets": {
    "types": {
      "feat": {
        "displayName": "New Features",
        "emoji": "🚀",
        "sort": 0,
        "releaseType": "minor",
        "promptBreakingChange": true
      }
    }
  }
}
```

### Config Options

- `access` - npm package access level (`restricted` or `public`)
- `baseBranch` - Base branch for the repository (default: `main`)
- `updateInternalDependencies` - How to bump internal dependencies (`patch`, `minor`, `major`, or `none`)
- `ignore` - Array of package names to exclude from changesets
- `lazyChangesets.types` - Custom changeset types with display names, emojis, and version bump behavior

## 🔄 Version Bump Logic

Version bumps are automatically determined by changeset type:

| Type | Default Bump | With `!` suffix | Examples |
|------|-------------|-----------------|----------|
| `feat` | minor | major | `feat`, `feat!` |
| `fix` | patch | major | `fix`, `fix!` |
| `perf` | patch | major | `perf`, `perf!` |
| `refactor` | patch | major | `refactor`, `refactor!` |
| `build` | patch | major | `build`, `build!` |
| `revert` | patch | major | `revert`, `revert!` |
| Other types | patch | N/A | `chore`, `docs`, `style`, `test`, `ci` |

### Special Cases

- Adding `!` suffix triggers a breaking change (major bump)
- Pre-1.0 packages (v0.x.x) can be explicitly bumped to v1.0.0 via prompt
- Use `@major` suffix in changeset frontmatter for explicit major bumps

## 📦 Monorepo Support

Lazy Changesets works seamlessly with monorepos:

- Automatically discovers packages via `package.json` files
- Multi-select interface for choosing affected packages
- Handles internal dependency updates
- Generates per-package changelogs

## 🆚 Difference from Changesets

This tool was inspired by [changesets/changesets](https://github.com/changesets/changesets) but with key differences:

| Feature | Lazy Changesets | Changesets |
|---------|----------------|------------|
| Version bump selection | Automatic via conventional commit types | Manual selection required |
| Changeset types | Configurable conventional commit types | Generic change descriptions |
| Breaking changes | `!` suffix or prompt | Manual major version selection |
| Setup complexity | Minimal configuration | More configuration options |
| Learning curve | Familiar to conventional commit users | Unique workflow |

This approach makes the workflow more streamlined for teams already familiar with conventional commits while maintaining flexibility through configuration.

## 📝 Examples

### Creating a Feature Changeset

```bash
$ changeset
? Which packages would you like to include? @my-org/package-a
? Select changelog type feat (New Features)
? Is this a breaking change? No
? Enter a message for the changeset Added user authentication
```

### Dry Run Version Bump

```bash
$ changeset version --dry-run
```

Preview version changes without modifying files.

### Publishing with Draft Releases

```bash
$ changeset publish --draft --github-token $GITHUB_TOKEN
```

Publish to npm and create draft GitHub releases for review before making them public.

## 🤝 Contributing

Contributions are welcome! Please check the [issues](https://github.com/cadamsdev/lazy-changesets/issues) page for ways to help.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
