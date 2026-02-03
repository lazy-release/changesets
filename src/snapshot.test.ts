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
import {
  generateSnapshotVersion,
  findAffectedPackages,
  cascadeDependents,
  backupPackageJsonFiles,
  updatePackagesToSnapshot,
  restorePackageJsonFiles,
  snapshot,
} from "./snapshot.js";
import type { DependencyGraph } from "./version.js";

describe("generateSnapshotVersion", () => {
  test("should generate version with correct format", () => {
    const version = generateSnapshotVersion();
    expect(version).toMatch(/^0\.0\.0-\d+$/);
  });

  test("should use unix timestamp", () => {
    const beforeTimestamp = Math.floor(Date.now() / 1000);
    const version = generateSnapshotVersion();
    const afterTimestamp = Math.floor(Date.now() / 1000);

    const versionTimestamp = parseInt(version.split("-")[1]);
    expect(versionTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(versionTimestamp).toBeLessThanOrEqual(afterTimestamp);
  });

  test("should generate different versions over time", async () => {
    const version1 = generateSnapshotVersion();
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait 1.1 seconds
    const version2 = generateSnapshotVersion();

    expect(version1).not.toBe(version2);
  });
});

describe("findAffectedPackages", () => {
  test("should find packages from single changeset", () => {
    const mockChangesetContent = `---
"@test/package-a": feat
---

Added new feature`;

    spyOn(fs, "readFileSync").mockReturnValue(mockChangesetContent);

    const packages = findAffectedPackages([".changeset/test.md"]);

    expect(packages.size).toBe(1);
    expect(packages.has("@test/package-a")).toBe(true);
  });

  test("should find multiple packages from single changeset", () => {
    const mockChangesetContent = `---
"@test/package-a": feat
"@test/package-b": fix
---

Updated multiple packages`;

    spyOn(fs, "readFileSync").mockReturnValue(mockChangesetContent);

    const packages = findAffectedPackages([".changeset/test.md"]);

    expect(packages.size).toBe(2);
    expect(packages.has("@test/package-a")).toBe(true);
    expect(packages.has("@test/package-b")).toBe(true);
  });

  test("should find packages across multiple changesets", () => {
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("changeset1")) {
        return `---
"@test/package-a": feat
---

Feature A`;
      }
      return `---
"@test/package-b": fix
---

Fix B`;
    });

    const packages = findAffectedPackages([".changeset/changeset1.md", ".changeset/changeset2.md"]);

    expect(packages.size).toBe(2);
    expect(packages.has("@test/package-a")).toBe(true);
    expect(packages.has("@test/package-b")).toBe(true);
  });

  test("should handle empty changesets", () => {
    spyOn(fs, "readFileSync").mockReturnValue("---\n---\n\n");

    const packages = findAffectedPackages([".changeset/empty.md"]);

    expect(packages.size).toBe(0);
  });
});

describe("cascadeDependents", () => {
  test("should return only affected packages when no dependents", () => {
    const affected = new Set(["@test/package-a"]);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          { name: "@test/package-a", version: "1.0.0", path: "", packageJson: {} },
        ],
      ]),
      dependents: new Map(),
    };

    const result = cascadeDependents(affected, graph);

    expect(result.size).toBe(1);
    expect(result.has("@test/package-a")).toBe(true);
  });

  test("should include direct dependents", () => {
    const affected = new Set(["@test/package-a"]);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          { name: "@test/package-a", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-b",
          { name: "@test/package-b", version: "1.0.0", path: "", packageJson: {} },
        ],
      ]),
      dependents: new Map([["@test/package-a", new Set(["@test/package-b"])]]),
    };

    const result = cascadeDependents(affected, graph);

    expect(result.size).toBe(2);
    expect(result.has("@test/package-a")).toBe(true);
    expect(result.has("@test/package-b")).toBe(true);
  });

  test("should cascade through multiple levels", () => {
    const affected = new Set(["@test/package-a"]);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          { name: "@test/package-a", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-b",
          { name: "@test/package-b", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-c",
          { name: "@test/package-c", version: "1.0.0", path: "", packageJson: {} },
        ],
      ]),
      dependents: new Map([
        ["@test/package-a", new Set(["@test/package-b"])],
        ["@test/package-b", new Set(["@test/package-c"])],
      ]),
    };

    const result = cascadeDependents(affected, graph);

    expect(result.size).toBe(3);
    expect(result.has("@test/package-a")).toBe(true);
    expect(result.has("@test/package-b")).toBe(true);
    expect(result.has("@test/package-c")).toBe(true);
  });

  test("should handle diamond dependencies", () => {
    const affected = new Set(["@test/package-a"]);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          { name: "@test/package-a", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-b",
          { name: "@test/package-b", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-c",
          { name: "@test/package-c", version: "1.0.0", path: "", packageJson: {} },
        ],
        [
          "@test/package-d",
          { name: "@test/package-d", version: "1.0.0", path: "", packageJson: {} },
        ],
      ]),
      dependents: new Map([
        ["@test/package-a", new Set(["@test/package-b", "@test/package-c"])],
        ["@test/package-b", new Set(["@test/package-d"])],
        ["@test/package-c", new Set(["@test/package-d"])],
      ]),
    };

    const result = cascadeDependents(affected, graph);

    expect(result.size).toBe(4);
  });
});

describe("backupPackageJsonFiles", () => {
  test("should backup package.json content", () => {
    const packages = new Set(["@test/package-a"]);
    const mockContent = JSON.stringify({ name: "@test/package-a", version: "1.0.0" }, null, 2);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/package.json",
            packageJson: {},
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "readFileSync").mockReturnValue(mockContent);

    const backups = backupPackageJsonFiles(packages, graph);

    expect(backups.size).toBe(1);
    expect(backups.get("@test/package-a")?.path).toBe("/test/package.json");
    expect(backups.get("@test/package-a")?.content).toBe(mockContent);
  });

  test("should backup multiple packages", () => {
    const packages = new Set(["@test/package-a", "@test/package-b"]);
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/a/package.json",
            packageJson: {},
          },
        ],
        [
          "@test/package-b",
          {
            name: "@test/package-b",
            version: "2.0.0",
            path: "/test/b/package.json",
            packageJson: {},
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes("/a/")) {
        return JSON.stringify({ name: "@test/package-a", version: "1.0.0" });
      }
      return JSON.stringify({ name: "@test/package-b", version: "2.0.0" });
    });

    const backups = backupPackageJsonFiles(packages, graph);

    expect(backups.size).toBe(2);
  });
});

describe("updatePackagesToSnapshot", () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test("should update package version to snapshot", () => {
    const packages = new Set(["@test/package-a"]);
    const snapshotVersion = "0.0.0-1234567890";
    const packageJson = { name: "@test/package-a", version: "1.0.0" };
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/package.json",
            packageJson,
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "writeFileSync").mockImplementation(() => {});

    updatePackagesToSnapshot(packages, snapshotVersion, graph);

    expect(packageJson.version).toBe(snapshotVersion);
  });

  test("should update internal dependencies to exact snapshot version", () => {
    const packages = new Set(["@test/package-a", "@test/package-b"]);
    const snapshotVersion = "0.0.0-1234567890";
    const packageJsonA = { name: "@test/package-a", version: "1.0.0" };
    const packageJsonB = {
      name: "@test/package-b",
      version: "2.0.0",
      dependencies: {
        "@test/package-a": "^1.0.0",
      },
    };
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/a/package.json",
            packageJson: packageJsonA,
          },
        ],
        [
          "@test/package-b",
          {
            name: "@test/package-b",
            version: "2.0.0",
            path: "/test/b/package.json",
            packageJson: packageJsonB,
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const updates = updatePackagesToSnapshot(packages, snapshotVersion, graph);

    expect(packageJsonB.dependencies["@test/package-a"]).toBe(snapshotVersion);
    expect(updates.get("@test/package-b")).toContain(
      `@test/package-a: ^1.0.0 → ${snapshotVersion}`,
    );
  });

  test("should update devDependencies and peerDependencies", () => {
    const packages = new Set(["@test/package-a", "@test/package-b"]);
    const snapshotVersion = "0.0.0-1234567890";
    const packageJsonA = { name: "@test/package-a", version: "1.0.0" };
    const packageJsonB = {
      name: "@test/package-b",
      version: "2.0.0",
      devDependencies: {
        "@test/package-a": "~1.0.0",
      },
      peerDependencies: {
        "@test/package-a": ">=1.0.0",
      },
    };
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/a/package.json",
            packageJson: packageJsonA,
          },
        ],
        [
          "@test/package-b",
          {
            name: "@test/package-b",
            version: "2.0.0",
            path: "/test/b/package.json",
            packageJson: packageJsonB,
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "writeFileSync").mockImplementation(() => {});

    updatePackagesToSnapshot(packages, snapshotVersion, graph);

    expect(packageJsonB.devDependencies["@test/package-a"]).toBe(snapshotVersion);
    expect(packageJsonB.peerDependencies["@test/package-a"]).toBe(snapshotVersion);
  });

  test("should not update external dependencies", () => {
    const packages = new Set(["@test/package-a"]);
    const snapshotVersion = "0.0.0-1234567890";
    const packageJson = {
      name: "@test/package-a",
      version: "1.0.0",
      dependencies: {
        react: "^18.0.0",
      },
    };
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/package.json",
            packageJson,
          },
        ],
      ]),
      dependents: new Map(),
    };

    spyOn(fs, "writeFileSync").mockImplementation(() => {});

    updatePackagesToSnapshot(packages, snapshotVersion, graph);

    expect(packageJson.dependencies.react).toBe("^18.0.0");
  });

  test("should write updated package.json to disk", () => {
    const packages = new Set(["@test/package-a"]);
    const snapshotVersion = "0.0.0-1234567890";
    const packageJson = { name: "@test/package-a", version: "1.0.0" };
    const graph: DependencyGraph = {
      packages: new Map([
        [
          "@test/package-a",
          {
            name: "@test/package-a",
            version: "1.0.0",
            path: "/test/package.json",
            packageJson,
          },
        ],
      ]),
      dependents: new Map(),
    };

    const writeFileSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});

    updatePackagesToSnapshot(packages, snapshotVersion, graph);

    expect(writeFileSpy).toHaveBeenCalledWith(
      "/test/package.json",
      expect.stringContaining(snapshotVersion),
      "utf-8",
    );
  });
});

describe("restorePackageJsonFiles", () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("should restore package.json files from backup", () => {
    const backups = new Map([
      [
        "@test/package-a",
        {
          path: "/test/package.json",
          content: JSON.stringify({ name: "@test/package-a", version: "1.0.0" }),
        },
      ],
    ]);

    const writeFileSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});

    restorePackageJsonFiles(backups);

    expect(writeFileSpy).toHaveBeenCalledWith(
      "/test/package.json",
      JSON.stringify({ name: "@test/package-a", version: "1.0.0" }),
      "utf-8",
    );
  });

  test("should restore multiple files", () => {
    const backups = new Map([
      [
        "@test/package-a",
        { path: "/test/a/package.json", content: JSON.stringify({ version: "1.0.0" }) },
      ],
      [
        "@test/package-b",
        { path: "/test/b/package.json", content: JSON.stringify({ version: "2.0.0" }) },
      ],
    ]);

    const writeFileSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});

    restorePackageJsonFiles(backups);

    // Check that both files were restored
    const calls = writeFileSpy.mock.calls;
    const pathA = calls.find((call) => call[0] === "/test/a/package.json");
    const pathB = calls.find((call) => call[0] === "/test/b/package.json");
    expect(pathA).toBeDefined();
    expect(pathB).toBeDefined();
  });

  test("should handle restore errors gracefully", () => {
    const backups = new Map([["@test/package-a", { path: "/test/package.json", content: "{}" }]]);

    spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error("Permission denied");
    });

    expect(() => restorePackageJsonFiles(backups)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("snapshot command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    mock.clearAllMocks();
  });

  test("should error when .changeset directory not found", async () => {
    spyOn(fs, "existsSync").mockReturnValue(false);

    await snapshot({ dryRun: false });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No .changeset directory"),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test("should error when no changeset files found", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [];
      }
      return [];
    });

    await snapshot({ dryRun: false });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("No changeset files"));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test("should show packages in dry run mode", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [".changeset/test.md"];
      }
      return ["package.json"];
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes(".changeset")) {
        return `---
"@test/package-a": feat
---

Test feature`;
      }
      return JSON.stringify({ name: "@test/package-a", version: "1.0.0" });
    });

    await snapshot({ dryRun: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
    const calls = consoleLogSpy.mock.calls.flat();
    const hasPackageName = calls.some(
      (arg: any) => typeof arg === "string" && arg.includes("@test/package-a"),
    );
    expect(hasPackageName).toBe(true);
  });

  test("should publish packages with snapshot tag", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [".changeset/test.md"];
      }
      return ["package.json"];
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes(".changeset")) {
        return `---
"@test/package-a": feat
---

Test feature`;
      }
      return JSON.stringify({ name: "@test/package-a", version: "1.0.0" });
    });
    spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });
    spyOn(childProcess, "execSync").mockImplementation(() => "");

    await snapshot({ dryRun: false });

    const calls = (childProcess.execSync as any).mock.calls;
    const publishCall = calls.find((call: any) => call[0].includes("npm publish"));
    expect(publishCall).toBeDefined();
    expect(publishCall[0]).toContain("--tag snapshot");
  });

  test("should restore files after successful publish", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [".changeset/test.md"];
      }
      return ["package.json"];
    });
    const mockOriginalContent = JSON.stringify({ name: "@test/package-a", version: "1.0.0" });
    let readCallCount = 0;
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      readCallCount++;
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes(".changeset")) {
        return `---
"@test/package-a": feat
---

Test feature`;
      }
      // First read for backup, subsequent reads for parsing
      return mockOriginalContent;
    });
    const writeFileSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });
    spyOn(childProcess, "execSync").mockImplementation(() => "");

    await snapshot({ dryRun: false });

    // Check that restore was called
    const restoreCalls = writeFileSpy.mock.calls.filter((call) => call[1] === mockOriginalContent);
    expect(restoreCalls.length).toBeGreaterThan(0);
  });

  test("should restore files after publish failure", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [".changeset/test.md"];
      }
      return ["package.json"];
    });
    const mockOriginalContent = JSON.stringify({ name: "@test/package-a", version: "1.0.0" });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes(".changeset")) {
        return `---
"@test/package-a": feat
---

Test feature`;
      }
      return mockOriginalContent;
    });
    const writeFileSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});
    spyOn(packageManagerDetector, "detect").mockResolvedValue({ name: "npm", agent: "npm" });
    spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("npm publish failed");
    });

    try {
      await snapshot({ dryRun: false });
    } catch (error) {
      // Expected to throw
    }

    // Check that restore was called even after error
    const restoreCalls = writeFileSpy.mock.calls.filter((call) => call[1] === mockOriginalContent);
    expect(restoreCalls.length).toBeGreaterThan(0);
  });

  test("should skip private packages", async () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(tinyglobby, "globSync").mockImplementation((options: any) => {
      if (options.patterns.includes(".changeset/*.md")) {
        return [".changeset/test.md"];
      }
      return ["package.json"];
    });
    spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : path.toString();
      if (pathStr.includes(".changeset")) {
        return `---
"@test/package-a": feat
---

Test feature`;
      }
      return JSON.stringify({ name: "@test/package-a", version: "1.0.0", private: true });
    });
    spyOn(fs, "writeFileSync").mockImplementation(() => {});

    await snapshot({ dryRun: false });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("skipped (private)"));
  });
});
