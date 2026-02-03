# Lazy Changesets - Agent Guidelines

## Essential Commands

### Build, Lint & Test
- `bun run build` - Compile TypeScript to dist/
- `bun run fmt` - Format code with oxfmt
- `bun run fmt:check` - Check formatting (CI)
- `bun run lint` - Lint with oxlint (type-aware)
- `bun run lint:fix` - Auto-fix linting issues
- `bun test` - Run all tests
- `bun test src/version.test.ts` - Run single test file
- `bun test -t "test name pattern"` - Run tests matching pattern
- `bun test --coverage` - Generate coverage report

### Development
- `bun changeset` - Run CLI from source
- `bun install` / `bun install <pkg>` / `bun install --dev <pkg>` - Manage dependencies

## Project Structure

```
src/*.ts        - Source files
src/*.test.ts   - Test files (Bun test)
dist/           - Compiled output (gitignored)
.changeset/     - Changeset files
```

## Code Style Guidelines

### Imports
- **Local imports**: Use `.js` extension: `import { foo } from './config.js'`
- **Built-ins**: Use `node:` prefix: `import { readFileSync } from 'node:fs'`
- **Type imports**: `import type { Config } from './config.js'`
- **Order**: Built-ins → External deps → Local deps

Example:
```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { readConfig } from './config.js';
import type { ChangesetConfig } from './config.js';
```

### TypeScript (Strict Mode)
- **Config**: ES2020, NodeNext modules, strict enabled
- **Interfaces vs Types**: `interface` for objects, `type` for unions/aliases
- **Never use `any`**: Use `unknown` then narrow with type guards
- **Optional params**: Use `?` and defaults: `function foo({ dryRun = false } = {})`
- **Type assertions**: Use `as` sparingly, only when certain
- **Export for tests**: Functions tested must be exported

### Naming Conventions
- **Functions/variables**: camelCase - `findPackages`, `packageMap`
- **Types/interfaces**: PascalCase - `ChangesetConfig`, `ChangesetType`
- **Constants**: Descriptive camelCase - `defaultChangesetTypes`
- **Files**: kebab-case - `config.ts`, `version.ts`
- **Test files**: `<module>.test.ts` - e.g., `version.test.ts`

### Formatting & Linting
- **oxfmt**: Formats all files except `*.md` (`.oxfmtrc.json`)
- **oxlint**: Type-aware linting, ignores `dist/**` and `*.test.ts` (`.oxlintrc.json`)
- **CI order**: format → lint → test → build

### Error Handling
- **Programming errors**: `throw new Error("descriptive message")`
- **User errors**: `console.error(pc.red("message")); process.exit(1)`
- **Warnings**: `console.warn("msg")` or `console.log(pc.yellow("msg"))`
- **Success**: `console.log(pc.green("✔"), pc.cyan("message"))`
- **Validation**: Early returns, guard clauses at function start

### CLI Pattern (Commander.js)
```typescript
program
  .command("version")
  .option("--dry-run", "Preview changes", false)
  .action(async (options) => {
    await version({ dryRun: options.dryRun });
    process.exit(0); // Required to prevent prompt issues
  });
```

### Testing (Bun Test)
- **Import**: `import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'`
- **Mock modules**: Must come before imports:
  ```typescript
  mock.module("./config.js", () => ({ readConfig: () => ({...}) }));
  import { version } from "./version.js";
  ```
- **Test syntax**: Use `test()` not `it()`: `test("should do X", () => {...})`
- **Grouping**: `describe("functionName", () => {...})`
- **Spying**: `spyOn(console, "log").mockImplementation(() => {})`
- **Cleanup**: `afterEach(() => { mock.clearAllMocks() })`

### File Operations
- **Read**: `readFileSync(path, "utf-8")`
- **Write**: `writeFileSync(path, content, { encoding: "utf-8" })`
- **Check**: `if (!existsSync(path)) {...}`
- **Paths**: `path.join(dir, file)` for cross-platform
- **JSON**: `JSON.stringify(obj, null, 2)` (2-space indent)
- **Delete**: `unlinkSync(path)`
- **Create dir**: `mkdirSync(path)`

### Console Output (picocolors)
```typescript
import pc from 'picocolors';
console.log(pc.green("✔"), pc.cyan("Done"), pc.dim("(info)"));
console.error(pc.red("Error message"));
console.log(pc.yellow("Warning"), pc.bold("important"));
```

### Common Patterns
- **Async/await**: Always use for async ops, use `Promise.all()` for parallel
- **Early returns**: Prefer over nested conditionals
- **Template literals**: Use for strings: `` `Hello ${name}` ``
- **Array methods**: Prefer `map()`, `filter()`, `find()`, `some()`, `every()`
- **For loops**: Use `for...of` when needing `break`/`continue`
- **Destructuring**: `const { name, version } = packageJson`
- **Map/Set**: Use for collections, convert with `Array.from(map.values())`
- **Glob**: `globSync({ patterns: ["**/*.md"], ignore: ["**/node_modules/**"] })`

### General Principles
- No code comments (self-documenting code)
- Small, focused functions
- Type everything explicitly
- No trailing whitespace/newlines

## Changeset-Specific Patterns

### Version Bumping
- **Default**: `feat` → minor, others → patch
- **Breaking**: `!` suffix (e.g., `feat!`) → major
- **Explicit**: `@major` suffix → major
- **Configurable**: Set `releaseType` in `lazyChangesets.types` array
- **Multiple**: Highest bump wins for same package

### Changeset File Format
```markdown
---
"@package/name": feat!
"@other/package": fix
---

Description of changes
```

### Config Structure
- **Location**: `.changeset/config.json`
- **Fields**: `access`, `baseBranch`, `updateInternalDependencies`, `ignore`
- **Optional**: `lazyChangesets.types` (uses defaults if omitted)

## Development Workflow

1. Create changeset: `bun changeset`
2. Write code + tests
3. Run: `bun test` → `bun run fmt:check` → `bun run lint` → `bun run build`
4. Commit (include changeset file)

### CI Pipeline
Order: format → lint → test → build (must all pass)

### Publishing
1. `changeset version` - Bump versions, update CHANGELOGs, delete changesets
2. Commit version changes
3. `changeset publish` - Publish to npm, create GitHub releases

## Common Pitfalls to Avoid

- ❌ Missing `.js` extension in local imports
- ❌ Missing `node:` prefix for built-ins
- ❌ Using `any` type
- ❌ Forgetting `process.exit(0)` in CLI commands
- ❌ Not cleaning up mocks in `afterEach`
- ❌ Using `it()` instead of `test()`
- ❌ Missing `encoding: "utf-8"` in file operations
- ❌ Not checking file existence before operations
