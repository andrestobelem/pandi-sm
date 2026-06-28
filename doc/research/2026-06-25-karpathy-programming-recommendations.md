# Andrej Karpathy’s recommendations for programming, learning, and using AI

Date: 2026-06-25

> **Provenance.** Karpathy synthesis and sources originally gathered on 2026-06-25.
> Adapted on 2026-06-28 for `pandi-sm` (a Smalltalk implementation in Node): the
> reusable synthesis and primary sources are kept; the project-specific framing has
> been refocused from dynamic-workflow tooling to building a language runtime.

## Objective

Distill Andrej Karpathy’s recommendations on programming, learning, and using AI
into working criteria for building `pandi-sm` — an inspectable, incrementally-built
Smalltalk language runtime (lexer, parser, object model, evaluator) on Node.

## Main sources identified

- Andrej Karpathy homepage: https://karpathy.ai/
- Sequoia Ascent 2026 summary / Software 3.0 / agentic engineering: https://karpathy.bearblog.dev/sequoia-ascent-2026/
- Vibe coding MenuGen: https://karpathy.bearblog.dev/vibe-coding-menugen/
- Software 2.0: https://karpathy.medium.com/software-2-0-a64152b37c35
- A Recipe for Training Neural Networks: https://karpathy.github.io/2019/04/25/recipe/
- micrograd: https://github.com/karpathy/micrograd
- nanoGPT: https://github.com/karpathy/nanoGPT
- Empirical cross-check on vibe coding: https://arxiv.org/abs/2506.23253

## Practical synthesis

1. **Learn by building from scratch**
   - Karpathy often favors small, readable, complete implementations to understand fundamentals.
   - Evidence: `micrograd`, `nanoGPT`, Zero to Hero, and his educational material indexed from `karpathy.ai`.
   - Application in pandi-sm: keep the interpreter core small and complete enough to read end-to-end — object model, message dispatch, and evaluator should be inspectable, with no hidden magic.

2. **Understand before delegating**
   - AI lowers the friction for creating, but it does not replace technical judgment when the system matters.
   - Evidence: posts on vibe coding and Software 3.0; in MenuGen he documents real frictions around auth, payments, deploy, API, and reliability.
   - Application in pandi-sm: understand Smalltalk semantics (message passing, blocks/closures, the object/metaclass model) before leaning on AI to generate large parts of the runtime.

3. **Software 3.0: programming with prompts/context/tools**
   - Karpathy frames an evolution: Software 1.0 = explicit code, Software 2.0 = learned weights, Software 3.0 = LLMs programmed through prompts, context, examples, memory, and tools.
   - Application in pandi-sm: when using AI to help build the runtime, treat prompts, the relevant source context, and tests as the real interface — feed the model the precise semantics to implement, not vague asks.

4. **Vibe coding works very well for prototypes, not as a production guarantee**
   - Useful for personal apps, demos, and rapid exploration.
   - Production requires specifications, permissions, diff review, tests/evals, security, and human ownership.
   - Application in pandi-sm: prototype the evaluator fast, but pin the language’s observable behavior with conformance tests before trusting it — separate “explore/generate” from “verify”.

5. **Incremental debugging and simple baselines**
   - In “A Recipe for Training Neural Networks,” he recommends inspecting data, starting simple, verifying assumptions, overfitting small cases, and adding complexity gradually.
   - Application in pandi-sm: start from a minimal Smalltalk subset (integers, unary/binary messages), verify with tiny programs, then add blocks, keyword messages, classes, and metaclasses incrementally — inspecting the object memory directly when something breaks.

6. **The expert’s role shifts toward specifying, evaluating, and debugging**
   - AI use shifts part of the work from writing code to managing context, reviewing outputs, designing tests, and deciding whether something is correct.
   - Application in pandi-sm: invest in golden/conformance tests for Smalltalk behavior so generated or hand-written evaluator code can be judged objectively.

## Implications for this project

- Favor a small, readable core (object model + message dispatch + evaluator) that is easy to read and run, in the spirit of `micrograd`/`nanoGPT`.
- Build the runtime in layers — lexer → parser → object model → evaluator → blocks → classes/metaclasses — and test each layer with tiny Smalltalk programs before moving on.
- Specify the language’s observable semantics with executable tests (characterization against expected Smalltalk behavior) rather than prose alone.
- Use AI to accelerate, but review diffs and verify against tests; never treat generated interpreter code as correct without an executable check.

## Optional next step

As the runtime grows, curate a small suite of canonical Smalltalk snippets (golden
outputs) that doubles as both a conformance test and readable documentation of what
`pandi-sm` supports.
