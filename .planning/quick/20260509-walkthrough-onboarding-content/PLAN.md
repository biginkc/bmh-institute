# Walkthrough onboarding content

Goal: create durable walkthrough/onboarding content that can stay in BMH Institute for demos, onboarding, and future walkthroughs.

Scope:

- Add an idempotent content seeding script for a published walkthrough program.
- Include four modules with multiple lessons and several content block types.
- Include a Closer Lab role-play block using the production walkthrough scenario.
- Add tests that protect the walkthrough structure.
- Apply the content to production after the PR is merged and verified.

Verification:

- Focused unit tests for the curriculum definition.
- `npm run verify`.
- Run the walkthrough seed against production with service-role credentials.
- Validate the created program, modules, lessons, quiz, assignment, and role-play block in production.
