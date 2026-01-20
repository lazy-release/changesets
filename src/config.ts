import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ChangesetType } from "./changeset.js";

export interface ChangesetConfig {
  access: "restricted" | "public";
  baseBranch: string;
  updateInternalDependencies: "patch" | "minor" | "major" | "none";
  ignore: string[];
  lazyChangesets: LazyChangeset;
}

export interface LazyChangeset {
  types: ChangesetType[];
}

export function readConfig(): ChangesetConfig {
  const changesetsDir = ".changeset";

  if (!existsSync(changesetsDir)) {
    throw new Error(`Directory ${changesetsDir} does not exist.`);
  }

  const configPath = path.join(changesetsDir, "config.json");

  if (!existsSync(configPath)) {
    throw new Error(`File ${configPath} does not exist.`);
  }

  const fileData = readFileSync(configPath, "utf-8");
  const config = JSON.parse(fileData) as ChangesetConfig;
  return {
    ...config,
    access: config.access || "restricted",
    baseBranch: config.baseBranch || "main",
    updateInternalDependencies: config.updateInternalDependencies || "patch",
    ignore: config.ignore || [],
    lazyChangesets: {
      ...config.lazyChangesets,
      types: config.lazyChangesets?.types ? config.lazyChangesets?.types : defaultChangesetTypes,
    },
  };
}

export const defaultChangesetTypes: ChangesetType[] = [
  {
    type: "feat",
    displayName: "New Features",
    emoji: "🚀",
    releaseType: "minor",
    promptBreakingChange: true,
  },
  {
    type: "fix",
    displayName: "Bug Fixes",
    emoji: "🐛",
    promptBreakingChange: true,
  },
  {
    type: "perf",
    displayName: "Performance Improvements",
    emoji: "⚡️",
    promptBreakingChange: true,
  },
  {
    type: "chore",
    displayName: "Chores",
    emoji: "🏠",
  },
  {
    type: "docs",
    displayName: "Documentation",
    emoji: "📚",
  },
  {
    type: "style",
    displayName: "Styles",
    emoji: "🎨",
  },
  {
    type: "refactor",
    displayName: "Refactoring",
    emoji: "♻️",
    promptBreakingChange: true,
  },
  {
    type: "test",
    displayName: "Tests",
    emoji: "✅",
  },
  {
    type: "build",
    displayName: "Build",
    emoji: "📦",
    promptBreakingChange: true,
  },
  {
    type: "ci",
    displayName: "Automation",
    emoji: "🤖",
  },
  {
    type: "revert",
    displayName: "Reverts",
    emoji: "⏪",
    promptBreakingChange: true,
  },
];
