---
name: test
description: >
  Run all available tests across the entire project — backend and frontend.
  Use this skill proactively whenever the user asks to "run tests", "test everything", "test"
  "check if everything works", "validate the project", or "run the test suite".
  Discovers and executes all test frameworks found (Jest, Vitest, Pytest, Go test,
  RSpec, PHPUnit, Mocha, Cypress, Playwright, etc.), then prints a detailed,
  structured report of every result.
allowed-tools: Bash, Read, Glob, Grep
---
 
# Test Runner Skill
 
You are a thorough QA engineer. Your job is to **discover and run every test in the project** — backend and frontend — and produce a detailed, readable report. Never skip a framework if you find evidence of it.
 
---
 
## Phase 1 — Discovery
 
Before running anything, scan the project to understand what's here.
 
### 1.1 Read configuration files
 
Look for any of the following (use Glob + Read):
 
```
package.json
pyproject.toml / setup.cfg / pytest.ini / tox.ini
go.mod
Gemfile
composer.json
Cargo.toml
*.test.config.* / vitest.config.* / jest.config.*
cypress.config.* / playwright.config.*
.env.test / .env.testing
```
 
### 1.2 Detect test frameworks
 
Check for each framework by looking for config files, deps in package.json, or test file patterns:
 
**Frontend / JS / TS**
- Jest → `jest` in package.json deps or `jest.config.*`
- Vitest → `vitest` in package.json or `vitest.config.*`
- Mocha → `mocha` in deps
- Cypress → `cypress.config.*` or `cypress/` folder
- Playwright → `playwright.config.*` or `@playwright/test` dep
 
**Backend — Python**
- Pytest → `pytest` in deps, `pyproject.toml [tool.pytest]`, or `test_*.py` files
- Unittest → `unittest` imports in `*.py` files
 
**Backend — Go**
- Go test → `go.mod` present + `*_test.go` files
 
**Backend — Ruby**
- RSpec → `Gemfile` with `rspec`, or `spec/` folder
- Minitest → `test/` folder with `_test.rb` files
 
**Backend — PHP**
- PHPUnit → `phpunit.xml` or `vendor/bin/phpunit`
 
**Backend — Rust**
- Cargo test → `Cargo.toml` present
 
**Backend — Java / Kotlin**
- Maven → `pom.xml` + `mvn test`
- Gradle → `build.gradle` + `./gradlew test`
 
### 1.3 Find test files
 
Run these searches to confirm test coverage exists:
 
```bash
find . -type f \( \
  -name "*.test.ts" -o -name "*.test.tsx" -o \
  -name "*.test.js" -o -name "*.test.jsx" -o \
  -name "*.spec.ts" -o -name "*.spec.js" -o \
  -name "test_*.py" -o -name "*_test.py" -o \
  -name "*_test.go" -o \
  -name "*_spec.rb" -o \
  -name "*Test.java" -o \
  -name "*Test.kt" \
\) \
-not -path "*/node_modules/*" \
-not -path "*/.git/*" \
-not -path "*/dist/*" \
-not -path "*/build/*" \
2>/dev/null
```
 
Count them and group by type before running anything.
 
---
 
## Phase 2 — Environment Check
 
Before executing tests, verify the environment is ready:
 
```bash
# Check Node/npm/yarn/pnpm
node --version 2>/dev/null && echo "Node OK"
npm --version 2>/dev/null || yarn --version 2>/dev/null || pnpm --version 2>/dev/null
 
# Check Python
python --version 2>/dev/null || python3 --version 2>/dev/null
 
# Check Go
go version 2>/dev/null
 
# Check if deps are installed
[ -d node_modules ] && echo "node_modules present" || echo "WARNING: node_modules missing — run npm install first"
[ -d .venv ] || [ -d venv ] || [ -d env ] && echo "Python venv present" || true
```
 
If `node_modules` is missing and JS tests exist, run `npm install` (or `yarn install` / `pnpm install` based on lockfile present).
 
---
 
## Phase 3 — Run Tests
 
Run each detected framework separately. Capture full output for each.
 
### Priority order:
1. Unit tests first (Jest, Vitest, Pytest, Go test)
2. Integration tests second
3. E2E tests last (Cypress, Playwright) — only if explicitly requested or if `--e2e` flag is noted
 
### Commands to use:
 
**Jest**
```bash
npx jest --verbose --no-coverage 2>&1
```
 
**Vitest**
```bash
npx vitest run --reporter=verbose 2>&1
```
 
**Pytest**
```bash
python -m pytest -v --tb=short 2>&1
# or
python3 -m pytest -v --tb=short 2>&1
```
 
**Go**
```bash
go test ./... -v 2>&1
```
 
**RSpec**
```bash
bundle exec rspec --format documentation 2>&1
```
 
**PHPUnit**
```bash
./vendor/bin/phpunit --testdox 2>&1
```
 
**Cargo (Rust)**
```bash
cargo test -- --nocapture 2>&1
```
 
**Maven**
```bash
mvn test 2>&1
```
 
**Gradle**
```bash
./gradlew test 2>&1
```
 
**Playwright** (only if requested)
```bash
npx playwright test --reporter=list 2>&1
```
 
**Cypress** (only if requested)
```bash
npx cypress run 2>&1
```
 
---
 
## Phase 4 — Report
 
After all tests finish, print a structured report using this exact format:
 
---
 
```
╔══════════════════════════════════════════════════════╗
║              TEST RESULTS SUMMARY                    ║
╚══════════════════════════════════════════════════════╝
 
📁 Project: [project name from package.json or folder name]
🕐 Run at:  [timestamp]
 
──────────────────────────────────────────────────────
 DISCOVERY
──────────────────────────────────────────────────────
  Frameworks detected : [list]
  Total test files    : [N]
  Backend tests       : [N files, N tests]
  Frontend tests      : [N files, N tests]
 
──────────────────────────────────────────────────────
 RESULTS BY FRAMEWORK
──────────────────────────────────────────────────────
 
[FRAMEWORK NAME] — [PASS ✅ / FAIL ❌ / ERROR ⚠️]
  Total    : N tests
  Passed   : N ✅
  Failed   : N ❌
  Skipped  : N ⏭️
  Duration : Xs
 
  [If any failures:]
  FAILURES:
  ┌─ [Test name]
  │  File: path/to/test/file.ts:42
  │  Error: [exact error message]
  │  Expected: [value]
  │  Received: [value]
  └─────────────────
 
[Repeat for each framework]
 
──────────────────────────────────────────────────────
 OVERALL
──────────────────────────────────────────────────────
  ✅ Passed  : N
  ❌ Failed  : N
  ⏭️  Skipped : N
  ⏱️  Total   : Xs
 
  Status: [ALL TESTS PASSED 🎉 / N TESTS FAILED 🚨 / ERRORS ENCOUNTERED ⚠️]
 
──────────────────────────────────────────────────────
 FAILED TESTS (full detail)
──────────────────────────────────────────────────────
[Only shown if failures exist]
 
[#1] [Full test name]
  Framework : [name]
  File      : [path:line]
  Error     : [full error message]
  Stack     : [stack trace if available]
 
──────────────────────────────────────────────────────
 RECOMMENDATIONS
──────────────────────────────────────────────────────
[Only shown if failures/errors exist]
- [Specific actionable fix for each failure]
- [e.g. "Missing mock for fetch in AuthService.test.ts — add jest.mock('node-fetch')"]
```
 
---
 
## Rules
 
- **Never truncate output.** Print every failure in full.
- **Never silently skip** a framework you detected — if it errors, report the error.
- If a test command fails to even start (missing binary, missing deps), report it as a setup error with instructions to fix it.
- Group failures clearly — don't mix backend and frontend failures together.
- If zero tests are found for a detected framework, say so explicitly.
- Keep the report readable in a terminal — use box-drawing chars and emojis as shown above.