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
