# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

Selected direction: blend civic editorial clarity, search-first public-service utility, and humane featured-case storytelling. Keep the public surface calm, Georgian-first, trauma-aware, and explicit that tips remain private.

Trust & Safety v1.1 direction: preserve “Public by necessity. Private by default.” Keep contact verification distinct from publication review and never imply fictional cases are officially confirmed. Public pages must minimize Found/Closed cases and never expose private tips, family contacts, or evidence. Staff tools must remain role-scoped, confirmation-gated, auditable, bilingual, and explicit about which security controls still require a backend.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
