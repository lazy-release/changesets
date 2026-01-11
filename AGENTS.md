# Lazy Changesets - Agent Guidelines

## Essential Commands

### Build & Test
- `bun run build` - Compile TypeScript to dist/ using bun
- `bun test` - Run all Bun tests
- `bun test src/version.test.ts` - Run single test file
- `bun test -t "test name"` - Run tests matching pattern

### Development
- `bun dev` - Run the CLI directly using tsx

## Code Style Guidelines

### Imports
- Use ES module imports: `import { foo } from 'bar'`
- Use `.js` extensions for local imports: `import { foo } from './config.js'`
- Use `node:` prefix for Node.js built-ins: `import { readFileSync } from 'node:fs'`
- Group imports in order: built-ins, external deps, local deps
- Type imports should use `import type`: `import type { Foo } from './bar.js'`

### TypeScript & Types
- Strict TypeScript enabled - always provide explicit types
- Use `interface` for object shapes, `type` for unions/primitives
- Export functions that need testing: `export function foo()`
- Use template literals for type indexing: `ChangesetReleaseType['type']`
- Default parameters: `async function foo({ dryRun = false } = {})`

### Naming Conventions
- camelCase for functions, variables, and object properties
- PascalCase for types, interfaces, classes, and enum members
- UPPER_SNAKE_CASE for constants (rare - prefer descriptive names)
- File names: kebab-case for utilities, PascalCase for components (if any)
- Test files: `<module>.test.ts` alongside source files

### File Structure
- `src/*.ts` - Source code
- `src/*.test.ts` - Unit tests
- `dist/*.js` - Compiled output (generated)
- `.changeset/*.md` - Changeset files

### Error Handling
- Throw `new Error()` with descriptive messages for programming errors
- Use `console.error()` with `pc.red()` for user-facing errors
- Use `console.warn()` for warnings
- Use `console.log()` with colored output (`pc.green()`, `pc.yellow()`) for success/info
- Exit with `process.exit(1)` on error, `process.exit(0)` on success
- Validate inputs early with guard clauses

### CLI Pattern (citty)
- Use `defineCommand()` to define main CLI entry
- Define `subCommands` for nested commands (init, version, etc.)
- Define `args` for command options
- Use `runMain()` to execute command
- Call `process.exit(0)` explicitly in subCommands to prevent prompt rendering

### Testing Patterns (Bun)
- Import test utilities: `import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'`
- Mock modules before imports: `mock.module('./config.js', () => ({ readConfig: () => ({...}) }))`
- Use `test()` instead of `it()`: `test('should do X when Y', () => { ... })`
- Spy on functions: `spyOn(console, 'log').mockImplementation(() => {})`
- Use `mock.clearAllMocks()` in `afterEach` to clean up spies
- Test grouping: `describe('functionName', () => { ... })`

### File Operations
- Check existence first: `if (!existsSync(path)) { ... }`
- Use `path.join()` for path construction
- Write with encoding: `writeFileSync(path, content, { encoding: 'utf-8' })`
- JSON stringify: `JSON.stringify(obj, null, 2) + '\n'`

### Console Output
- Use `picocolors` (`pc`) for colored terminal output
- Structure: `console.log(pc.green('✔'), pc.cyan('name'), pc.dim('(info)'))`
- Keep messages concise and user-friendly
- Use emoji sparingly and appropriately

### General Principles
- No code comments (unless absolutely necessary)
- Keep functions small and focused
- Use Map/Set over Object when appropriate
- Process files in loops with explicit continue for error cases
- Use `Array.from()` to convert collections
- String interpolation with template literals
- Early returns over nested conditionals

### Async/Await Patterns
- Always use `async`/`await` for async operations
- Return Promises from async functions
- Handle errors with try/catch in async functions
- Use `Promise.all()` for parallel async operations when safe

### Map/Set Usage
- Prefer Map for key-value pairs with arbitrary keys
- Prefer Set for unique value collections
- Use `Array.from(map.values())` or `[...map.values()]` to convert to arrays
- Use `map.has()`, `map.get()`, `map.set()` methods
- Use `set.has()`, `set.add()`, `set.delete()` methods

### String & Template Literals
- Use template literals for string interpolation: `\`Hello ${name}\``
- Use template literals for multi-line strings
- Prefer string methods over regex for simple operations
- Use regex with `match()` for complex pattern matching

### Array Operations
- Use array methods: `map()`, `filter()`, `find()`, `some()`, `every()`
- Use `for...of` loops when you need `break` or `continue`
- Use `Array.from()` to convert Map/Set/NodeList to arrays
- Use spread operator: `[...array]` for copying

### Object & JSON
- Use interfaces for object shapes
- Use `JSON.stringify(obj, null, 2)` for pretty-printed JSON
- Use `JSON.parse()` with try/catch for parsing
- Destructure objects: `const { name, version } = packageJson`

### Path Handling
- Always use `path.join()` for cross-platform paths
- Use `path.resolve()` for absolute paths
- Use `path.dirname()` to get directory path
- Use `path.basename()` to get filename

### Package Management
- Use `bun install` to add dependencies
- Use `bun install --dev` for dev dependencies
- Check package.json for existing dependencies before adding new ones
- Update package.json version when making breaking changes

### Git Workflow
- Create changeset files for all changes
- Run `bun run build` before committing
- Run `bun test` to verify tests pass
- Include changeset file in commits
- Delete consumed changeset files after version bump

### CLI Argument Handling
- Use citty's `defineCommand()` for command structure
- Define args with type, description, required, default
- Access args via `({ args }) => { ... }`
- Use subCommands for nested CLI structure
- Call `process.exit(0)` to prevent interactive prompts after subCommands

### Version Bumping Logic
- Parse changeset frontmatter for release types
- `feat` type = minor version bump
- `!` suffix = major version bump
- All other types = patch version bump
- Take highest bump when multiple changesets exist for same package
- Delete changeset files after successful version bump

### File System Patterns
- Use `existsSync()` before file operations (when appropriate)
- Use `readFileSync()` with encoding: 'utf-8'
- Use `writeFileSync()` with encoding: 'utf-8'
- Use `mkdirSync()` for directory creation
- Use `unlinkSync()` for file deletion
- Use glob patterns for finding files

### Color Console Output
- Import: `import pc from 'picocolors'`
- Success: `pc.green()`, `pc.cyan()`, `pc.green('✔')`
- Warning: `pc.yellow()`
- Error: `pc.red()`
- Dim/Info: `pc.dim()`
- Bold: `pc.bold()`

### Type Safety
- Never use `any` type
- Use `unknown` when type is truly unknown
- Use type guards for narrowing types
- Use `as` sparingly and only when certain
- Use template literal types for dynamic keys: `T['key']`
