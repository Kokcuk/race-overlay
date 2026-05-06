---
description: Rules for Node.js backend JavaScript files
globs: ["server/**/*.js", "src/server/**/*.js", "api/**/*.js", "routes/**/*.js", "controllers/**/*.js", "services/**/*.js", "models/**/*.js", "middleware/**/*.js", "lib/**/*.js", "utils/**/*.js"]
---

# Node.js Backend Rules

## Language
- Always use plain JavaScript (.js), never TypeScript
- Use ES modules (`import`/`export`), not CommonJS (`require`/`module.exports`)
- Use JSDoc comments for function signatures when types add clarity

## Code Style
- `const` by default, `let` only when reassignment is needed, never `var`
- Use async/await, never raw callbacks or `.then()` chains
- Use early returns to reduce nesting
- Keep functions short — one responsibility per function
- Destructure parameters and imports where it improves readability

## Error Handling
- Never swallow errors silently
- Use custom error classes that extend Error with a `statusCode` property
- Always return proper HTTP status codes (don't default everything to 500)
- Validate all incoming request data at the route/controller boundary using Zod or Joi

## Database
- Always use parameterized queries — never concatenate user input into SQL/queries
- Use transactions for multi-step mutations
- Close/release connections properly

## Security
- Never hardcode secrets, tokens, or connection strings — use environment variables
- Sanitize and validate all user input
- Set appropriate CORS, rate limiting, and helmet headers
- Never log sensitive data (passwords, tokens, PII)

## File Organization
- Routes define endpoints, controllers handle request/response, services contain business logic, models handle data access
- One resource per file (e.g., `users.routes.js`, `users.controller.js`, `users.service.js`)
- Shared utilities go in `utils/` or `lib/`

## Naming
- camelCase for variables, functions, and file names
- PascalCase for classes and constructor functions
- SCREAMING_SNAKE_CASE for constants and env variables
- Prefix boolean variables with `is`, `has`, `should`, `can`
