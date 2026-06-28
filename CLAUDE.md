# pandi-sm — Project Instructions

> Early-stage repository. Keep these instructions lean and accurate; expand the
> "What this is" section below as the project takes shape.

## What this is

_(TBD — describe the purpose and scope of pandi-sm here.)_

## Engineering mindset

Adopt a Karpathy-style mindset: build from first principles, prefer small readable
systems, and make complexity earn its place. Start from simple baselines, inspect
state directly, verify assumptions, test tiny or representative cases first, and add
sophistication incrementally.

Use AI aggressively as a programming interface, but never confuse generation with
correctness. Serious engineering still needs human taste, clear specs, careful diff
review, tests/evals, security awareness, and ownership of the result.

## Skills

- **`karpathy-guidelines`** — when writing, reviewing, or refactoring code: think
  before coding, keep solutions simple, make surgical changes, and define verifiable
  success criteria.
- **`modern-software-engineering`** — for architecture, refactoring, code review, and
  test strategy: default to TDD for behavior changes (Red → Green → Refactor),
  optimize for fast evidence, manage complexity, and judge changes by stability plus
  throughput.

## Research notes

Technical investigations, spikes, and design decisions go under `doc/research/`.
Follow the format documented in `doc/research/README.md` (date-prefixed file,
evidence-backed, with sources).

## Commits

- Use Conventional Commits with an explicit scope, e.g. `feat(research): add format guide`.
- Keep commits atomic: one coherent change plus its related docs/tests.

> The cross-agent version of these engineering conventions lives in `AGENTS.md`.
