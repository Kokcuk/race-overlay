---
name: check-code
description: >
  Evaluate the project's codebase using the evaluator agent.
  Use when the user says "check code", "review the code", "evaluate the backend",
  "evaluate the frontend", "check implementation", or "code review".
allowed-tools: Agent
---

# Check Code Skill

Launch the evaluator agent to review the project's implementation code.

## Instructions

Use the Agent tool to launch the **evaluator** agent with the following prompt:

---

Evaluate the project's codebase. Review both backend and frontend code if present.

1. Start by reading package.json, project structure, and any docs in `/docs` to understand what the code should implement.

2. Evaluate using **Backend Evaluation** mode (if backend code exists):
   - **Architecture**: Code structure, separation of concerns, clean layering.
   - **Code Quality**: Naming, readability, DRY, error handling, logging.
   - **Performance**: N+1 queries, missing indexes, blocking operations, memory leaks.
   - **Security**: Injection risks, auth issues, input validation, secrets handling.
   - **Scalability**: Bottlenecks, connection pooling, caching.
   - **Spec alignment**: Does the implementation match what the specs describe?

3. Evaluate using **Frontend Evaluation** mode (if frontend code exists):
   - **Structure**: Component hierarchy, file organization.
   - **Patterns**: State management, data flow, component composition.
   - **Performance**: Bundle size, unnecessary re-renders, lazy loading.
   - **UX Consistency**: Component reuse, styling patterns.
   - **Spec alignment**: Does the UI implement the flows described in frontend-spec.md?

4. Produce the standard evaluator report format (Overview Verdict, Score by category, Critical Issues, Warnings, Suggestions, What's Done Well).
