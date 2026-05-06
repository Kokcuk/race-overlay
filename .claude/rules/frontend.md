---
description: Rules for React frontend JSX/JS files
globs: ["src/**/*.jsx", "src/**/*.js", "src/components/**/*", "src/pages/**/*", "src/hooks/**/*", "src/App.*"]
---

# React Frontend Rules

## Language
- Always use plain JavaScript with JSX (.jsx for components, .js for non-component modules)
- Never use TypeScript
- Use JSDoc comments sparingly — only when props or logic are non-obvious

## Components
- Use functional components exclusively — no class components
- One component per file, file name matches component name in PascalCase
- Keep components small — extract subcomponents when a component exceeds ~100 lines
- Co-locate component styles, tests, and helpers in the same folder when practical

## State & Data Flow
- Use `useState` for local state, `useReducer` for complex state logic
- Lift state only as high as necessary — avoid prop drilling more than 2 levels deep
- Use context sparingly — prefer composition and passing props
- Keep side effects in `useEffect` with proper dependency arrays and cleanup

## Hooks
- Custom hooks go in `src/hooks/` and start with `use` prefix
- Extract repeated stateful logic into custom hooks
- Never call hooks conditionally

## Styling
- Use Tailwind CSS utility classes as the primary styling method
- Avoid inline `style={}` objects except for truly dynamic values (e.g., computed positions)
- Use `clsx` or `cn` utility for conditional class merging

## Performance
- Wrap expensive computations in `useMemo`
- Wrap callback props in `useCallback` when passing to memoized children
- Use `React.lazy` and `Suspense` for route-level code splitting
- Avoid creating objects/arrays inside render — define outside or memoize

## Patterns
- Use early returns in render for loading/error/empty states
- Prefer controlled components for forms
- Handle loading, error, and empty states explicitly — never leave them undefined
- Use semantic HTML elements (`<nav>`, `<main>`, `<section>`, `<button>`) over generic `<div>`

## Naming
- PascalCase for components and component files (e.g., `UserCard.jsx`)
- camelCase for hooks, utilities, variables, and functions
- Prefix event handler props with `on` (e.g., `onClick`, `onSubmit`)
- Prefix handler functions with `handle` (e.g., `handleClick`, `handleSubmit`)
