---
name: check-plan
description: >
  Evaluate project specifications and planning documents using the evaluator agent.
  Use when the user says "check plan", "evaluate spec", "review the plan",
  "check the spec", or "does this plan make sense".
allowed-tools: Agent
---

# Check Plan Skill

Launch the evaluator agent to review all specification and planning documents in the `/docs` folder.

## Instructions

Use the Agent tool to launch the **evaluator** agent with the following prompt:

---

Evaluate all project specification and planning documents. Focus on:

1. Read all files in the `/docs` folder (main.md, api-spec.yaml, backend-spec.md, frontend-spec.md, test-cases.md, and any others present).

2. Evaluate using **Spec Evaluation** mode:
   - **Coherence**: Do all requirements make logical sense? Are there contradictions across documents?
   - **Completeness**: Are there obvious missing use cases, edge cases, or features?
   - **No Dumb Requirements**: Flag anything unnecessary, redundant, or over-engineered.
   - **Use Case Validity**: Do described use cases reflect real user needs?
   - **API-to-Spec Alignment**: Verify API spec matches main spec — flag missing endpoints, mismatched data models, or orphaned routes.
   - **Cross-document consistency**: Ensure backend spec, frontend spec, and test cases all align with main.md and api-spec.yaml.
   - **Ambiguity**: Identify vague language that could cause implementation confusion.

3. Produce the standard evaluator report format (Overview Verdict, Score, Critical Issues, Warnings, Suggestions, What's Done Well).
