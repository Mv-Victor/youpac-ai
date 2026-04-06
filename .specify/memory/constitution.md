<!--
SYNC IMPACT REPORT
==================
Version change: [TEMPLATE] → 1.0.0
Modified principles: N/A (initial constitution from template)
Added sections:
  - Core Principles (7 principles)
  - Technology Stack Constraints
  - Development Workflow
  - Governance
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ Constitution Check section aligned
  - .specify/templates/spec-template.md ✅ No changes required
  - .specify/templates/tasks-template.md ✅ No changes required
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Confirm original project ratification date; set to 2026-04-01 (today) as initial adoption
-->

# YouPac AI Constitution

## Core Principles

### I. Convex-First Backend

All server-side logic, data persistence, and external API orchestration MUST be implemented in Convex
(queries, mutations, actions, httpActions). Direct database access or alternative backend runtimes are
prohibited. When calling external APIs (OpenAI, ElevenLabs), use Convex `action` functions.
Files requiring Node.js APIs MUST declare `"use node"` at the top.

**Rationale**: Convex provides real-time reactivity, transactional guarantees, and serverless scaling
that are foundational to the product's live Canvas experience.

### II. Schema-Driven Data Modeling

All data structures MUST be defined in `convex/schema.ts` before implementation. Field additions or
type changes require a migration plan. No ad-hoc field usage outside the defined schema is permitted.
The canonical entity types (`agents.type`, `agents.status`) MUST remain the authoritative source of
truth across frontend and backend.

**Rationale**: Schema drift causes silent runtime failures in a real-time system. Type safety from
schema definitions prevents entire categories of bugs.

### III. Client-Side AI Orchestration

The Canvas (`app/components/canvas/`) MUST own AI generation orchestration. Convex AI functions
(e.g., `aiHackathon.generateContentSimple`) MUST be stateless — they accept context and return
content without writing to the database. The frontend is responsible for updating Agent state after
receiving AI output.

**Rationale**: Separating generation from persistence allows optimistic UI, retry logic, and
multi-version selection without backend coupling.

### IV. SSR Compatibility

Components that depend on browser-only APIs (React Flow, FFmpeg.wasm, Web Audio API) MUST be
dynamically imported on the client side. No browser-only library MUST be imported at the module
level in route files. Use `ClientCanvas` / `ReactFlowWrapper` patterns for SSR isolation.

**Rationale**: React Router v7 uses SSR by default. Violating this principle causes hydration
failures that break the entire application.

### V. Secure Credential Management

API keys (OpenAI, ElevenLabs) MUST be stored exclusively in Convex environment variables (configured
via Convex Dashboard). Frontend `.env` files MUST NOT contain secret keys. Generated media (thumbnails,
transcriptions) MUST be stored in Convex Storage to obtain permanent URLs — ephemeral third-party
URLs (e.g., OpenAI image URLs) MUST NOT be persisted to the database.

**Rationale**: OpenAI image URLs expire. Storing credentials on the client side exposes them in
browser bundles.

### VI. Simplicity and YAGNI

New abstractions, utility layers, or architectural patterns MUST be justified by a concrete current
need. Duplicate implementations (e.g., `ai.ts` vs `aiHackathon.ts`) MUST be resolved in favor of the
canonical version. Dead code MUST be removed rather than commented out.

**Rationale**: The Canvas codebase is already large (~3864 lines). Unnecessary complexity multiplies
maintenance cost and onboarding friction.

### VII. Incremental Delivery by User Story

Every feature MUST be decomposable into independently deployable user stories. Each story MUST be
testable in isolation before the next story begins. P1 stories MUST deliver a usable MVP without P2+
dependencies.

**Rationale**: Incremental delivery reduces integration risk and enables early user feedback on the
most critical functionality first.

## Technology Stack Constraints

The following technology choices are FIXED for this project. Deviations require a constitution
amendment with written justification:

- **Frontend Framework**: React Router v7 (SSR + full-stack). Next.js is explicitly excluded.
- **UI Components**: shadcn/ui (Radix UI) + TailwindCSS v4. Custom component libraries are prohibited
  unless shadcn/ui cannot meet the requirement.
- **Canvas System**: @xyflow/react (React Flow). Alternative canvas libraries are prohibited.
- **Authentication**: Clerk (`@clerk/react-router`). All protected routes MUST use the Dashboard
  layout with Clerk guards. User identity MUST use `identity.subject` as `userId`.
- **Backend**: Convex only. Express, Next.js API routes, and other Node.js servers are prohibited.
- **AI Models**: GPT-4o for text generation, gpt-image-1 for image generation, ElevenLabs scribe_v1
  for transcription. Model changes require explicit justification in the task description.
- **Animation**: Framer Motion only. CSS-only animations are acceptable for trivial transitions.

New dependencies MUST be verified against `package.json` before use. No dependency MUST be assumed
available without confirmation.

## Development Workflow

- **Type Safety**: `npm run typecheck` MUST pass before any PR is considered complete. TypeScript
  errors are blocking.
- **Convex Guidelines**: `convex/_generated/ai/guidelines.md` MUST be read before writing any Convex
  function. These guidelines override general Convex knowledge.
- **Canvas State Persistence**: Canvas auto-save (5-second debounce) MUST include viewport
  validation to prevent zero/NaN zoom values.
- **Transcription Handling**: Files >20MB MUST be compressed via Web Audio API before upload.
  ElevenLabs `cloud_storage_url` MUST be used for large files to avoid re-uploading.
- **Thumbnail Storage**: Generated thumbnails MUST be stored in Convex Storage. The `openai.images.edit()`
  response MUST handle both `base64` and `url` response formats with fallback logic.
- **Share Links**: Share snapshots are immutable. The `shares` table MUST NOT be updated after
  creation except for `viewCount` increments.
- **No Secrets in Code**: API keys, tokens, or credentials MUST never appear in source files,
  comments, or commit history.

## Governance

This constitution supersedes all other coding conventions and design documents within this project.
Amendments MUST be proposed as a pull request modifying this file, referencing the principle being
changed and providing written justification. The following versioning policy applies:

- **MAJOR** bump: Removal or redefinition of an existing principle (backward-incompatible governance change).
- **MINOR** bump: New principle or section added; material expansion of existing guidance.
- **PATCH** bump: Clarifications, wording fixes, non-semantic refinements.

All feature plans (`plan.md`) MUST include a "Constitution Check" gate that verifies alignment with
this document before implementation begins. Any complexity violation MUST be documented in the
plan's Complexity Tracking table with justification.

For Convex-specific runtime guidance, always consult `convex/_generated/ai/guidelines.md`.
For project structure and commands, consult `claude.md`.

**Version**: 1.0.0 | **Ratified**: 2026-04-01 | **Last Amended**: 2026-04-01
