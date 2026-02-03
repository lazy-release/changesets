import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";

mock.module("./config.js", () => ({
  readConfig: () => ({
    access: "restricted",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
    lazyChangesets: {
      types: [
        {
          type: "feat",
          displayName: "New Features",
          emoji: "🚀",
          releaseType: "minor",
          promptBreakingChange: true,
        },
      ],
    },
  }),
}));

import * as fs from "node:fs";
import * as tinyglobby from "tinyglobby";
import * as childProcess from "node:child_process";
import * as packageManagerDetector from "package-manager-detector";
import { publish, type PackageInfo, escapeShell, getChangelogForVersion } from "./publish.js";

describe("escapeShell", () => {
  test("should escape single quotes", () => {
    const input = "test'string";
    const output = escapeShell(input);
    expect(output).toBe("test'\\''string");
  });

  test("should escape double quotes", () => {
    const input = 'test"string';
    const output = escapeShell(input);
    expect(output).toBe('test\\"string');
  });

  test("should escape newlines", () => {
    const input = "test\nstring";
    const output = escapeShell(input);
    expect(output).toBe("test\\nstring");
  });

  test("should escape multiple characters", () => {
    const input = "test'string\nwith\"quotes";
    const output = escapeShell(input);
    expect(output).toBe("test'\\''string\\nwith\\\"quotes");
  });
});

describe("getChangelogForVersion", () => {
  let pkg: PackageInfo;
  let consoleLogSpy: any;

  beforeEach(() => {
    pkg = {
      name: "@test/package",
      version: "1.0.0",
      dir: "./packages/test",
      isPrivate: false,
    };
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test("should return null when changelog does not exist", () => {
    spyOn(fs, "existsSync").mockReturnValue(false);

    const result = getChangelogForVersion(pkg);

    expect(result).toBeNull();
  });

  test("should return null when version is not found", () => {
    const changelogContent = `## 2.0.0\n\n### 🚀 feat\n- New feature`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).toBeNull();
  });

  test("should return changelog section for specified version", () => {
    const changelogContent = `## 1.0.0\n\n### 🚀 feat\n- Added new feature\n\n## 0.9.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).not.toContain("## 1.0.0");
    expect(result).toContain("### 🚀 feat");
    expect(result).toContain("- Added new feature");
    expect(result).not.toContain("## 0.9.0");
  });

  test("should return changelog section for version with date", () => {
    const changelogContent = `## 1.0.0 (2026-01-14)\n\n### 🚀 feat\n- Added new feature\n\n## 0.9.0 (2026-01-13)\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).not.toContain("## 1.0.0");
    expect(result).not.toContain("(2026-01-14)");
    expect(result).toContain("### 🚀 feat");
    expect(result).toContain("- Added new feature");
    expect(result).not.toContain("## 0.9.0");
  });

  test("should return all content from version to end if no next version", () => {
    const changelogContent = `## 1.0.0\n\n### 🚀 feat\n- Added feature\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).not.toContain("## 1.0.0");
    expect(result).toContain("### 🚀 feat");
    expect(result).toContain("### 🐛 fix");
    expect(result).toContain("- Fixed bug");
  });

  test("should escape dots in version number for regex", () => {
    const pkgWithDots = {
      name: "@test/package",
      version: "1.2.3",
      dir: "./packages/test",
      isPrivate: false,
    };
    const changelogContent = `## 1.2.3\n\n### 🚀 feat\n- Added feature\n\n## 1.0.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkgWithDots);

    expect(result).not.toContain("## 1.2.3");
    expect(result).toContain("### 🚀 feat");
  });

  test("should handle version with prerelease tags", () => {
    const pkgWithPrerelease = {
      name: "@test/package",
      version: "1.0.0-beta.1",
      dir: "./packages/test",
      isPrivate: false,
    };
    const changelogContent = `## 1.0.0-beta.1\n\n### 🚀 feat\n- Beta feature\n\n## 1.0.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkgWithPrerelease);

    expect(result).not.toContain("## 1.0.0-beta.1");
    expect(result).toContain("### 🚀 feat");
  });

  test("should trim whitespace from result", () => {
    const changelogContent = `## 1.0.0\n\n### 🚀 feat\n- Added feature\n\n## 0.9.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).not.toBeNull();
    expect(result).toBe(result!.trim());
    expect(result!.startsWith("### 🚀 feat")).toBe(true);
  });

  test("should stop at next version header", () => {
    const changelogContent = `## 1.0.0\n\n### 🚀 feat\n- Feature 1.0\n- Feature 2.0\n\n## 0.9.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).toContain("Feature 1.0");
    expect(result).toContain("Feature 2.0");
    expect(result).not.toContain("### 🐛 fix");
    expect(result).not.toContain("Fixed bug");
  });

  test("should handle version at end of changelog", () => {
    const changelogContent = `## 2.0.0\n\n### 🚀 feat\n- New feature\n\n## 1.0.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).not.toContain("## 1.0.0");
    expect(result).toContain("### 🐛 fix");
    expect(result).toContain("- Fixed bug");
  });

  test("should return empty changelog when version header exists but no content", () => {
    const changelogContent = `## 1.0.0\n\n## 0.9.0\n\n### 🐛 fix\n- Fixed bug`;
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkg);

    expect(result).toBe("");
  });

  test("should use correct package directory path", () => {
    const pkgInSubdir = {
      name: "@test/package",
      version: "1.0.0",
      dir: "./packages/subdir/nested",
      isPrivate: false,
    };
    const changelogContent = `## 1.0.0\n\n### 🚀 feat\n- Added feature`;
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes("nested/CHANGELOG.md");
    });
    spyOn(fs, "readFileSync").mockReturnValue(changelogContent);

    const result = getChangelogForVersion(pkgInSubdir);

    expect(result).not.toContain("## 1.0.0");
    expect(result).toContain("### 🚀 feat");
  });
});

describe("publish command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes(".changeset");
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 1.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    mock.clearAllMocks();
  });

  test("should log message when no packages found", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue([]);

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No packages found"));
  });

  test("should publish packages in dry run mode", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });

    await publish({ dryRun: true });

    const dryRunCalls = consoleLogSpy.mock.calls.filter((call: any) =>
      call.some((arg: any) => typeof arg === "string" && arg.includes("Dry run")),
    );
    expect(dryRunCalls.length).toBeGreaterThan(0);

    const calls = consoleLogSpy.mock.calls.flat();
    const hasDryRun = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("[DRY RUN]"),
    );
    expect(hasDryRun).toBe(true);
  });

  test("should skip packages if tag exists on remote", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(childProcess, "execSync").mockReturnValue("");

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("already exists on remote"));
  });

  test("should create and push git tags", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedTag = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Created tag"),
    );
    const hasPushedTag = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Pushed tag"),
    );
    expect(hasCreatedTag).toBe(true);
    expect(hasPushedTag).toBe(true);
  });

  test("should handle private packages", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify(
        {
          name: "@test/package",
          version: "1.0.0",
          private: true,
        },
        null,
        2,
      ),
    );
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Package is private"));
  });

  test("should publish to npm for public packages", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      if (cmd.includes("publish")) {
        return "";
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasPublished = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Published to npm"),
    );
    expect(hasPublished).toBe(true);
  });

  test("should use npm for publishing", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("npm publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access restricted");
  });

  test("should use yarn for publishing", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "yarn", agent: "yarn" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("yarn publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access restricted");
  });

  test("should use pnpm for publishing", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "pnpm", agent: "pnpm" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("pnpm publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access restricted");
  });

  test("should use bun for publishing", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "bun", agent: "bun" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("bun publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access restricted");
  });

  test("should use package publishConfig.access when available", async () => {
    mock.module("./config.js", () => ({
      readConfig: () => ({
        access: "restricted",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: [],
        lazyChangesets: {
          types: [],
        },
      }),
    }));
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
            publishConfig: {
              access: "public",
            },
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 1.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("npm publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access public");
  });

  test("should publish with --access public when config access is public", async () => {
    mock.module("./config.js", () => ({
      readConfig: () => ({
        access: "public",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: [],
        lazyChangesets: {
          types: [],
        },
      }),
    }));
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 1.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("npm publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--access public");
  });

  test("should warn for unsupported package manager", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({
      name: "deno",
      agent: "deno",
    } as any);

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unsupported package manager"),
    );
  });

  test("should skip npm publish when package manager not detected", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue(null);

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not detect package manager"),
    );
  });

  test("should create GitHub release", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 1.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes("CHANGELOG.md");
    });
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      if (cmd.includes("git config")) {
        return "git@github.com:owner/repo.git";
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    const fetchMock = async (url: string, options: any) => {
      if (url.includes("releases") && options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.tag_name).toBe("v1.0.0");
        expect(body.name).toBe("v1.0.0");
      }
      return {
        ok: true,
        text: async () => "",
      } as Response;
    };
    global.fetch = fetchMock as any;

    process.env.GITHUB_TOKEN = "test-token";

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedRelease = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Created GitHub release"),
    );
    expect(hasCreatedRelease).toBe(true);
  });

  test("should use package-name@version format for non-root packages", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["packages/test/package.json"]);
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      if (cmd.includes("git config")) {
        return "git@github.com:owner/repo.git";
      }
      return "";
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "2.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 2.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes("CHANGELOG.md");
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    const fetchMock = async (url: string, options: any) => {
      if (url.includes("releases") && options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.tag_name).toBe("@test/package@2.0.0");
        expect(body.name).toBe("@test/package@2.0.0");
      }
      return {
        ok: true,
        text: async () => "",
      } as Response;
    };
    global.fetch = fetchMock as any;

    process.env.GITHUB_TOKEN = "test-token";

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedRelease = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Created GitHub release"),
    );
    expect(hasCreatedRelease).toBe(true);
  });

  test("should use v version format for root packages", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      if (cmd.includes("git config")) {
        return "git@github.com:owner/repo.git";
      }
      return "";
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@scope/root-package",
            version: "3.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 3.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes("CHANGELOG.md");
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    const fetchMock = async (url: string, options: any) => {
      if (url.includes("releases") && options?.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.tag_name).toBe("v3.0.0");
        expect(body.name).toBe("v3.0.0");
      }
      return {
        ok: true,
        text: async () => "",
      } as Response;
    };
    global.fetch = fetchMock as any;

    process.env.GITHUB_TOKEN = "test-token";

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasCreatedRelease = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("Created GitHub release"),
    );
    expect(hasCreatedRelease).toBe(true);
  });

  test("should skip GitHub release when no changesets found", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    let execCallCount = 0;
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
          },
          null,
          2,
        );
      }
      return "";
    });
    spyOn(fs, "existsSync").mockReturnValue(false);
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No changelog found"));
  });

  test("should skip GitHub release when release already exists", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("package.json")) {
        return JSON.stringify(
          {
            name: "@test/package",
            version: "1.0.0",
          },
          null,
          2,
        );
      }
      if (pathStr.includes("CHANGELOG.md")) {
        return `## 1.0.0\n\n### 🚀 feat\n- Test changeset`;
      }
      return "";
    });
    spyOn(fs, "existsSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      return pathStr.includes("CHANGELOG.md");
    });
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      if (cmd.includes("git config")) {
        return "git@github.com:owner/repo.git";
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    // Mock fetch to return 422 error (release already exists)
    const fetchMock = async (url: string, options: any) => {
      if (url.includes("releases") && options?.method === "POST") {
        return {
          ok: false,
          status: 422,
          text: async () => "Validation Failed",
        } as Response;
      }
      return {
        ok: false,
        text: async () => "",
      } as Response;
    };
    global.fetch = fetchMock as any;

    process.env.GITHUB_TOKEN = "test-token";

    await publish({ dryRun: false });

    const calls = consoleLogSpy.mock.calls.flat();
    const hasSkippedRelease = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("already exists"),
    );
    expect(hasSkippedRelease).toBe(true);
  });

  test("should ignore packages in config ignore list", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      return JSON.stringify(
        {
          name: "@ignored/package",
          version: "1.0.0",
        },
        null,
        2,
      );
    });
    mock.module("./config.js", () => ({
      readConfig: () => ({
        access: "restricted",
        baseBranch: "main",
        updateInternalDependencies: "patch",
        ignore: ["@ignored/package"],
        lazyChangesets: {
          types: [],
        },
      }),
    }));

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring package"));
  });

  test("should skip packages with missing name or version", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue(["package.json"]);
    spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify(
        {
          version: "1.0.0",
        },
        null,
        2,
      ),
    );

    await publish({ dryRun: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping"));
  });

  test("should handle multiple packages", async () => {
    spyOn(tinyglobby, "globSync").mockReturnValue([
      "packages/package1/package.json",
      "packages/package2/package.json",
    ]);
    let execCallCount = 0;
    spyOn(childProcess, "execSync").mockImplementation((cmd: string) => {
      execCallCount++;
      if (cmd.includes("ls-remote")) {
        throw new Error("Tag not found");
      }
      return "";
    });
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });

    await publish({ dryRun: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Found"),
      expect.stringContaining("2 package(s)"),
    );
  });
});
