/**
 * L6.S3 · conformance runner meta-tests — TDD RED phase.
 *
 * These tests verify the conformance runner logic:
 *  - L6.A/G: advance rule (max-layer gate green -> exit 0; unimplemented layers -> pending)
 *  - L6.D: phase-mismatch negative -> status=fail (not pass)
 *  - L6.H: adding a layer=L3 .st needs NO runner changes (layer-parametrized discovery)
 *  - L6.B: JUnit XML testcase shape carries frontmatter id, grouped by layer/section
 *
 * @section harness.L6.conformance-runner
 * @kind    positive
 * @layer   L6
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it, afterEach } from "vitest";
import {
  type ConformanceCaseResult,
  type LayerGate,
  computeAdvanceRule,
  runConformanceCase,
  buildJUnitXml,
  type JUnitSuite,
} from "./conformance-runner.js";

const _REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRATCH = join(
  "/private/tmp/claude-501/-Users-andrestobelem-ws-at-pandi-sm/41d1ffe5-fa96-43c8-bbac-f0a2db6da9c3/scratchpad",
  "conformance-runner-test",
);

function writeTmp(name: string, content: string): string {
  mkdirSync(SCRATCH, { recursive: true });
  const p = join(SCRATCH, name);
  writeFileSync(p, content, "utf8");
  return p;
}

afterEach(() => {
  try {
    rmSync(SCRATCH, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─── L6.G: advance rule ──────────────────────────────────────────────────────
// computeAdvanceRule(gates) -> { exit0, summary }
// - exit 0 only if the §6.1 gate of the max DELIVERED layer is green
// - unimplemented-layer gates report 'pending', not fail
// - layers with 0 cases count as 'pending' (not yet delivered)

describe("L6.G · computeAdvanceRule · advance rule", () => {
  it("exits 0 when max delivered layer gate is green", () => {
    const gates: LayerGate[] = [
      { layer: "L1", positives: 55, negatives: 20, failures: 0, status: "green" },
    ];
    const { exit0 } = computeAdvanceRule(gates);
    expect(exit0).toBe(true);
  });

  it("exits nonzero when max delivered layer gate is red (failures > 0)", () => {
    const gates: LayerGate[] = [
      { layer: "L1", positives: 55, negatives: 20, failures: 3, status: "red" },
    ];
    const { exit0 } = computeAdvanceRule(gates);
    expect(exit0).toBe(false);
  });

  it("exits nonzero when max delivered layer fails count thresholds (< 40 pos)", () => {
    const gates: LayerGate[] = [
      { layer: "L1", positives: 10, negatives: 20, failures: 0, status: "red" },
    ];
    const { exit0 } = computeAdvanceRule(gates);
    expect(exit0).toBe(false);
  });

  it("unimplemented (0-case) layers report pending status, not fail", () => {
    const gates: LayerGate[] = [
      { layer: "L1", positives: 55, negatives: 20, failures: 0, status: "green" },
      { layer: "L2", positives: 0, negatives: 0, failures: 0, status: "pending" },
      { layer: "L3", positives: 0, negatives: 0, failures: 0, status: "pending" },
    ];
    const { exit0, summary } = computeAdvanceRule(gates);
    expect(exit0).toBe(true);
    expect(summary).toContain("pending");
  });

  it("exits nonzero if a higher delivered layer is red even if L1 is green", () => {
    const gates: LayerGate[] = [
      { layer: "L1", positives: 55, negatives: 20, failures: 0, status: "green" },
      { layer: "L2", positives: 5, negatives: 2, failures: 1, status: "red" },
    ];
    const { exit0 } = computeAdvanceRule(gates);
    expect(exit0).toBe(false);
  });
});

// ─── L6.D: phase-mismatch detection ─────────────────────────────────────────
// A negative case whose declared phase doesn't match actual runtime phase -> fail

describe("L6.D · runConformanceCase · phase-mismatch negative -> fail", () => {
  it("negative case that fails in declared phase -> pass", () => {
    // This negative declares phase: parse and the runtime actually fails in parse.
    const caseFile = writeTmp(
      "negative-parse.st",
      [
        '"---',
        "id: unclosed-paren",
        "kind: negative",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:error.unclosed-paren",
        "origin: spec-ANSI",
        "section: error.unclosed-paren",
        "codes: E_UNCLOSED_PAREN",
        '---"',
        "(3 + 4",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
    expect(result.id).toBe("unclosed-paren");
  });

  it("negative case declaring phase: lex that actually fails in lex -> pass", () => {
    const caseFile = writeTmp(
      "negative-lex.st",
      [
        '"---',
        "id: empty-symbol",
        "kind: negative",
        "phase: lex",
        "layer: L1",
        "spec: anexoA:error.empty-symbol",
        "origin: spec-ANSI",
        "section: error.empty-symbol",
        "codes: E_EMPTY_SYMBOL",
        '---"',
        "#",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
  });

  it("positive case that parses cleanly -> pass", () => {
    const caseFile = writeTmp(
      "positive-parse.st",
      [
        '"---',
        "id: array-literal",
        "kind: positive",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:array.literal",
        "origin: spec-ANSI",
        "section: array.literal",
        '---"',
        "#(1 2 3)",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
  });

  it("negative case that does NOT fail (code parses cleanly) -> fail", () => {
    const caseFile = writeTmp(
      "negative-no-fail.st",
      [
        '"---',
        "id: fake-negative",
        "kind: negative",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:error.fake",
        "origin: spec-ANSI",
        "section: error.fake",
        "codes: E_UNCLOSED_PAREN",
        '---"',
        "3 + 4",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/expected.*fail/i);
  });

  it("negative case with wrong error codes -> fail", () => {
    const caseFile = writeTmp(
      "negative-wrong-code.st",
      [
        '"---',
        "id: wrong-code",
        "kind: negative",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:error.fake",
        "origin: spec-ANSI",
        "section: error.fake",
        "codes: E_UNCLOSED_BLOCK",
        '---"',
        "(3 + 4",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("fail");
  });

  it("positive case with parse errors -> fail", () => {
    const caseFile = writeTmp(
      "positive-with-errors.st",
      [
        '"---',
        "id: positive-broken",
        "kind: positive",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:array.literal",
        "origin: spec-ANSI",
        "section: array.literal",
        '---"',
        "(3 + 4",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("fail");
  });
});

// ─── L6.H: layer-parametrized discovery (no runner changes needed for L3) ───
// A .st file with layer=L3 under test/corpus must be discovered with no code change.
// (This test proves the mechanism by injecting a corpus-like case.)

describe("L6.H · layer-parametrized discovery · new layer = new .st only", () => {
  it("a phase:eval layer:L3 case is discovered and run by runConformanceCase", () => {
    const caseFile = writeTmp(
      "eval-add.st",
      [
        '"---',
        "id: eval-add",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: anexoA:A.2",
        "origin: spec-ANSI",
        "section: A.2",
        "printString: 14",
        '---"',
        "3 + 4 * 2",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
    expect(result.layer).toBe("L3");
    expect(result.phase).toBe("eval");
  });

  it("eval case with wrong expected printString -> fail", () => {
    const caseFile = writeTmp(
      "eval-wrong.st",
      [
        '"---',
        "id: eval-wrong",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: anexoA:A.2",
        "origin: spec-ANSI",
        "section: A.2",
        "printString: 999",
        '---"',
        "3 + 4 * 2",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("fail");
  });

  it("eval case with no expected printString just asserts it evaluates without error", () => {
    const caseFile = writeTmp(
      "eval-no-expect.st",
      [
        '"---',
        "id: eval-no-expect",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: anexoA:A.2",
        "origin: spec-ANSI",
        "section: A.2",
        '---"',
        "3 + 4",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
  });
});

// ─── L6.B: JUnit XML shape ────────────────────────────────────────────────────
// buildJUnitXml must produce valid XML grouped by layer+section with id in testcase

describe("L6.B · buildJUnitXml · testcase id and layer/section grouping", () => {
  it("produces a testcase element with the frontmatter id", () => {
    const results: ConformanceCaseResult[] = [
      {
        id: "array-byte",
        file: "test/corpus/L1/positive/array-byte.st",
        layer: "L1",
        section: "array.byte",
        phase: "parse",
        kind: "positive",
        status: "pass",
        duration: 5,
      },
    ];
    const suites: JUnitSuite[] = [{ layer: "L1", section: "array.byte", results }];
    const xml = buildJUnitXml(suites);
    expect(xml).toContain('name="array-byte"');
    expect(xml).toContain("<testcase");
  });

  it("groups testcases by layer and section in separate testsuite elements", () => {
    const suites: JUnitSuite[] = [
      {
        layer: "L1",
        section: "array.byte",
        results: [
          {
            id: "array-byte",
            file: "f1.st",
            layer: "L1",
            section: "array.byte",
            phase: "parse",
            kind: "positive",
            status: "pass",
            duration: 1,
          },
        ],
      },
      {
        layer: "L1",
        section: "literal.integer",
        results: [
          {
            id: "literal-integer",
            file: "f2.st",
            layer: "L1",
            section: "literal.integer",
            phase: "parse",
            kind: "positive",
            status: "pass",
            duration: 1,
          },
        ],
      },
    ];
    const xml = buildJUnitXml(suites);
    // Two separate testsuite elements
    const suiteMatches = xml.match(/<testsuite/g);
    expect(suiteMatches).not.toBeNull();
    expect(suiteMatches?.length).toBeGreaterThanOrEqual(2);
    // Each has name reflecting layer+section
    expect(xml).toContain("L1.array.byte");
    expect(xml).toContain("L1.literal.integer");
  });

  it("failed testcase includes failure element with message", () => {
    const results: ConformanceCaseResult[] = [
      {
        id: "broken-case",
        file: "test/corpus/L1/positive/broken.st",
        layer: "L1",
        section: "array.literal",
        phase: "parse",
        kind: "positive",
        status: "fail",
        message: "parse errors: E_UNCLOSED_PAREN",
        duration: 2,
      },
    ];
    const suites: JUnitSuite[] = [{ layer: "L1", section: "array.literal", results }];
    const xml = buildJUnitXml(suites);
    expect(xml).toContain("<failure");
    expect(xml).toContain("E_UNCLOSED_PAREN");
  });

  it("xml is well-formed (starts with xml header, wraps in testsuites)", () => {
    const xml = buildJUnitXml([]);
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain("<testsuites");
    expect(xml).toContain("</testsuites>");
  });
});

// ─── REGRESSION: Defect 2 — L6.C bypass via lenient parseFrontmatter ─────────
// runConformanceCase must use strict validation; a .st with a valid comment
// frontmatter but missing required 'origin' must return status='error', not 'pass'.
// Before fix: parseFrontmatter is used (lenient), so origin is silently absent and
// the case returns status='pass'.  After fix: validateFrontmatter is called, which
// throws, and runConformanceCase returns status='error'.

describe("REGRESSION · Defect 2 · L6.C bypass — runConformanceCase strict schema check", () => {
  it("runConformanceCase returns status=error for a .st missing required 'origin' field", () => {
    const caseFile = writeTmp(
      "missing-origin.st",
      [
        '"---',
        "id: missing-origin",
        "kind: positive",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:array.literal",
        // origin INTENTIONALLY ABSENT — this is the defect scenario
        "section: array.literal",
        '---"',
        "#(1 2 3)",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    // Must be 'error' (schema violation), NOT 'pass' (lenient bypass)
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/origin/i);
  });

  it("runConformanceCase returns status=error for a .st with NO frontmatter at all", () => {
    const caseFile = writeTmp("no-frontmatter.st", "3 + 4\n");
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("error");
  });

  it("runConformanceCase returns status=pass for a fully-valid .st (no regression)", () => {
    const caseFile = writeTmp(
      "fully-valid.st",
      [
        '"---',
        "id: fully-valid",
        "kind: positive",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:array.literal",
        "origin: spec-ANSI",
        "section: array.literal",
        '---"',
        "#(1 2 3)",
      ].join("\n"),
    );
    const result = runConformanceCase(caseFile);
    expect(result.status).toBe("pass");
  });
});

// ─── L6.A: real corpus counts via runConformanceCase ────────────────────────
// Not a deep test (already covered by corpus.test.ts) but confirms the runner
// produces pass results for the known-good L1 corpus.

describe("L6.A · conformance runner · L1 corpus gate counts", () => {
  it("L1 corpus positives >= 40 pass", async () => {
    const { discoverStFiles } = await import("./st-runner.js");
    const corpusDir = fileURLToPath(new URL("../corpus/L1/positive/", import.meta.url));
    const files = discoverStFiles(corpusDir);
    const results = files.map((f) => runConformanceCase(f));
    const passing = results.filter((r) => r.status === "pass");
    expect(passing.length).toBeGreaterThanOrEqual(40);
  });

  it("L1 corpus negatives >= 15 pass", async () => {
    const { discoverStFiles } = await import("./st-runner.js");
    const corpusDir = fileURLToPath(new URL("../corpus/L1/negative/", import.meta.url));
    const files = discoverStFiles(corpusDir);
    const results = files.map((f) => runConformanceCase(f));
    const passing = results.filter((r) => r.status === "pass");
    expect(passing.length).toBeGreaterThanOrEqual(15);
  });
});

// ─── REGRESSION: Defect 1 — traceability failure must gate conformance exit ──
// conformance.ts must exit 1 when verifyTraceability returns ok=false.
// Before fix: execution continues past the traceability block and exits 0
// based solely on advance.exit0 (false green).
// After fix: a boolean flag (traceOk) is set false when traceResult.ok===false,
// and the final exit gates on BOTH advance.exit0 AND traceOk.
//
// This integration test runs `npm run conformance` with a synthetic corpus that
// contains a non-ANSI case with no deviation field, which makes verifyTraceability
// return ok=false.  The process must exit with code 1 (not 0).

describe("REGRESSION · Defect 1 · traceability failure must gate conformance exit code", () => {
  const DEFECT1_SCRATCH = join(
    "/private/tmp/claude-501/-Users-andrestobelem-ws-at-pandi-sm/41d1ffe5-fa96-43c8-bbac-f0a2db6da9c3/scratchpad",
    "defect1-conformance-test",
  );
  const REPO_ROOT_ = fileURLToPath(new URL("../../", import.meta.url));

  afterEach(() => {
    try {
      rmSync(DEFECT1_SCRATCH, { recursive: true, force: true });
    } catch {
      /**/
    }
  });

  it("conformance exits 1 when corpus contains a non-ANSI case with no deviation field", () => {
    // Set up a scratch corpus directory with the real L1 corpus PLUS one non-ANSI case
    // that lacks a deviation field.  The L1 gate (≥40 pos, ≥15 neg, 0 failures) still
    // passes, but traceability must fail -> exit code must be 1.
    const corpusDir = join(DEFECT1_SCRATCH, "corpus");
    const positiveDir = join(corpusDir, "L1", "positive");
    mkdirSync(positiveDir, { recursive: true });

    // One valid positive spec-ANSI case (enough to reach the gate threshold is not the
    // point here — we need traceability to fail; gate thresholds pass with the real corpus
    // but we use --corpus pointing to our scratch dir which won't have 40 files.
    // Strategy: point conformance at the REAL corpus but also inject the non-ANSI case
    // by writing it into a copy.  Simpler: just verify via exit code that traceability
    // errors propagate even when the gate itself would be green.
    //
    // We use a MINIMAL corpus where the gate is trivially green (L3 eval only, since L3
    // has no min-negative threshold) plus a non-ANSI corpus case with no deviation.
    // That makes traceability fail while advance.exit0=true, exposing the false-green.

    const evalDir = join(corpusDir, "L3", "positive");
    mkdirSync(evalDir, { recursive: true });

    // Valid fully-passing L3 eval case with origin=spec-ANSI (gate green)
    writeFileSync(
      join(evalDir, "eval-ok.st"),
      [
        '"---',
        "id: eval-ok",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: anexoA:A.2",
        "origin: spec-ANSI",
        "section: A.2",
        '---"',
        "3 + 4",
      ].join("\n"),
    );

    // Non-ANSI case with NO deviation field -> verifyTraceability must return ok=false
    const nonAnsiDir = join(corpusDir, "L3", "nonAnsi");
    mkdirSync(nonAnsiDir, { recursive: true });
    writeFileSync(
      join(nonAnsiDir, "non-ansi-no-deviation.st"),
      [
        '"---',
        "id: non-ansi-no-deviation",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: pharo:x",
        "origin: extension-propia",
        // deviation: INTENTIONALLY ABSENT
        "section: x",
        '---"',
        "3 + 4",
      ].join("\n"),
    );

    const outputXml = join(DEFECT1_SCRATCH, "out.xml");
    const conformanceScript = join(REPO_ROOT_, "scripts/conformance.ts");

    let exitCode: number;
    try {
      execFileSync(
        "npx",
        ["tsx", conformanceScript, "--corpus", corpusDir, "--output", outputXml, "--quiet"],
        { cwd: REPO_ROOT_, stdio: "pipe" },
      );
      // If it doesn't throw, exit was 0 — that is the BUG (false green)
      exitCode = 0;
    } catch (e: unknown) {
      exitCode = (e as { status?: number }).status ?? 1;
    }

    // After fix: must exit 1 (traceability failure gates the exit)
    expect(exitCode).toBe(1);
  });

  it("conformance exits 0 when corpus is all spec-ANSI with no traceability errors (no regression)", () => {
    const corpusDir = join(DEFECT1_SCRATCH, "corpus-ok");
    const evalDir = join(corpusDir, "L3", "positive");
    mkdirSync(evalDir, { recursive: true });

    writeFileSync(
      join(evalDir, "eval-ok.st"),
      [
        '"---',
        "id: eval-ok-regression",
        "kind: positive",
        "phase: eval",
        "layer: L3",
        "spec: anexoA:A.2",
        "origin: spec-ANSI",
        "section: A.2",
        '---"',
        "3 + 4",
      ].join("\n"),
    );

    const outputXml = join(DEFECT1_SCRATCH, "out-ok.xml");
    const conformanceScript = join(REPO_ROOT_, "scripts/conformance.ts");

    let exitCode: number;
    try {
      execFileSync(
        "npx",
        ["tsx", conformanceScript, "--corpus", corpusDir, "--output", outputXml, "--quiet"],
        { cwd: REPO_ROOT_, stdio: "pipe" },
      );
      exitCode = 0;
    } catch (e: unknown) {
      exitCode = (e as { status?: number }).status ?? 1;
    }

    expect(exitCode).toBe(0);
  });
});
