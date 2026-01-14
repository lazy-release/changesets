# Lazy Changesets CLI

[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/cadamsdev/lazy-changesets/issues) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) ![GitHub Tag](https://img.shields.io/github/v/tag/cadamsdev/lazy-changesets)

This is the CLI tool meant to be used with the [Lazy Changesets Action](https://github.com/cadamsdev/lazy-changesets-action).

## 📥 Installation
You can install the CLI tool using npm:

```bash
npm install -g @lazy-release/changesets
```

## 🚀 Usage

1. Initialize the tool in your project directory.

> [!NOTE]
> This will create a `.changesets` directory with the necessary configuration files

```bash
lazy-changesets init
```

2. After initializing, you can start creating changesets. In your pull request, run the following command to create a changeset.

> [!NOTE]
> This will prompt you to enter the details of the changeset, such as the type of change, a summary, and any affected packages.

```bash
lazy-changesets
```

## Difference from Changesets

This tool was inspired by [changesets/changesets](https://github.com/changesets/changesets) but with a key difference in how version bumps are determined:

- **Lazy Changesets**: Uses conventional commit style changesets. The version bump (major/minor/patch) is automatically determined based on the changeset type (e.g., `feat`, `fix`, `feat!`).
- **Changesets**: Requires explicit version bump selection during changeset creation.

This approach makes the workflow more streamlined for teams already familiar with conventional commits.
