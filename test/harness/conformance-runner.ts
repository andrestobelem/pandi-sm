/**
 * L6.S3 · Conformance runner — engine for `npm run conformance`.
 *
 * Responsibilities:
 *  - L6.A/G: gate computation (advance rule: exit 0 iff max-delivered-layer gate is green;
 *            unimplemented layers → "pending", not fail)
 *  - L6.D: phase-routing and phase-mismatch detection for lex/parse/eval
 *  - L6.B: JUnit XML emission grouped by layer+section, testcase name=id
 *  - L6.H: works with any layer; no code changes needed to add a new layer
 */

import { readFileSync } from "node:fs";
import { parse } from "../../src/parser/index.js";
import { PandiRuntimeAdapter } from "../../src/runtime/adapter.js";
import type { LexErrorCode } from "../../src/lexer/errors.js";
import { parseFrontmatter } from "./st-runner.js";

// ─── LEX error code set ──────────────────────────────────────────────────────
// Used to partition errors by phase (lex vs parse).

const LEX_CODES = new Set<string>([
  "E_UNTERMINATED_STRING",
  "E_UNTERMINATED_COMMENT",
  "E_UNTERMINATED_CHAR",
  "E_EMPTY_SYMBOL",
  "E_RADIX_BASE",
  "E_RADIX_DIGIT",
  "E_RADIX_NO_DIGITS",
  "E_EXPONENT_MALFORMED",
  "E_UNEXPECTED_CHAR",
] satisfies LexErrorCode[]);

// ─── Public types ─────────────────────────────────────────────────────────────

export type CaseStatus = "pass" | "fail" | "skip" | "error";

export interface ConformanceCaseResult {
  id: string;
  file: string;
  layer: string;
  section: string;
  phase: string;
  kind: string;
  status: CaseStatus;
  /** Human-readable failure message (absent for pass/skip). */
  message?: string;
  /** Execution time in ms. */
  duration: number;
}

export type LayerStatus = "green" | "red" | "pending";

export interface LayerGate {
  layer: string;
  positives: number;
  negatives: number;
  failures: number;
  status: LayerStatus;
}

export interface AdvanceRuleResult {
  /** Should the conformance script exit with code 0? */
  exit0: boolean;
  /** Human-readable summary of the gate outcome. */
  summary: string;
}

export interface JUnitSuite {
  layer: string;
  section: string;
  results: ConformanceCaseResult[];
}

// ─── L6.A Gate thresholds ─────────────────────────────────────────────────────
// §6.1: L1 gate requires >= 40 positives and >= 15 negatives, all green.

const L1_MIN_POSITIVES = 40;
const L1_MIN_NEGATIVES = 15;

function computeLayerGate(layer: string, results: ConformanceCaseResult[]): LayerGate {
  const layerResults = results.filter((r) => r.layer === layer);

  if (layerResults.length === 0) {
    return { layer, positives: 0, negatives: 0, failures: 0, status: "pending" };
  }

  const positives = layerResults.filter((r) => r.kind === "positive").length;
  const negatives = layerResults.filter((r) => r.kind === "negative").length;
  const failures = layerResults.filter((r) => r.status === "fail" || r.status === "error").length;

  let status: LayerStatus;
  if (failures > 0) {
    status = "red";
  } else if (layer === "L1" && (positives < L1_MIN_POSITIVES || negatives < L1_MIN_NEGATIVES)) {
    status = "red";
  } else {
    status = "green";
  }

  return { layer, positives, negatives, failures, status };
}

// ─── L6.G: advance rule ──────────────────────────────────────────────────────

/**
 * Given a list of LayerGate records (one per layer seen in corpus), computes
 * the advance rule:
 *
 *  - "Pending" layers (status=pending or 0 cases) do NOT count as failures.
 *  - exit 0 iff the max DELIVERED layer's gate is green (no failures, thresholds met).
 *  - If ANY delivered (non-pending) layer is red → exit nonzero.
 */
export function computeAdvanceRule(gates: LayerGate[]): AdvanceRuleResult {
  const delivered = gates.filter((g) => g.status !== "pending" && g.positives + g.negatives > 0);
  const pending = gates.filter((g) => g.status === "pending" || g.positives + g.negatives === 0);

  if (delivered.length === 0) {
    return {
      exit0: false,
      summary: `No delivered layers found. All ${gates.length} layer(s) pending.`,
    };
  }

  const redLayers = delivered.filter((g) => g.status === "red");
  const pendingNames = pending.map((g) => g.layer).join(", ");

  if (redLayers.length > 0) {
    const names = redLayers.map((g) => g.layer).join(", ");
    return {
      exit0: false,
      summary:
        `Gate RED — ${names} failed. ${pendingNames ? `Pending: ${pendingNames}` : ""}`.trim(),
    };
  }

  const deliveredNames = delivered.map((g) => g.layer).join(", ");
  return {
    exit0: true,
    summary: `Gate GREEN — ${deliveredNames} passed.${pendingNames ? ` pending (skipped-by-design): ${pendingNames}` : ""}`,
  };
}

// ─── L6.D: phase-routing ─────────────────────────────────────────────────────

/** Classifies an error code as lex or parse. */
function classifyErrorPhase(code: string): "lex" | "parse" {
  return LEX_CODES.has(code) ? "lex" : "parse";
}

/**
 * Runs a single conformance case file and returns a result record.
 *
 * Phase routing (L6.D):
 *  - phase: lex   → parse(src); expect errors in LEX phase; fail if errors are parse-phase
 *  - phase: parse → parse(src); expect errors in PARSE phase; fail if errors are lex-phase
 *  - phase: eval  → PandiRuntimeAdapter.evaluate(src); compare printString if specified
 *
 * Negative cases: expect failure in DECLARED phase with DECLARED codes.
 * Positive cases: expect no errors (lex/parse) or clean eval (eval).
 */
export function runConformanceCase(file: string): ConformanceCaseResult {
  const start = Date.now();

  // Load frontmatter (lenient — conformance runner reads raw meta)
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch (e) {
    return {
      id: file,
      file,
      layer: "unknown",
      section: "unknown",
      phase: "unknown",
      kind: "unknown",
      status: "error",
      message: `Cannot read file: ${e instanceof Error ? e.message : String(e)}`,
      duration: Date.now() - start,
    };
  }

  const { meta, body } = parseFrontmatter(src);
  const id = meta.id ?? file;
  const layer = meta.layer ?? "unknown";
  const section = meta.section ?? "unknown";
  const phase = meta.phase ?? "unknown";
  const kind = meta.kind ?? "unknown";

  const fail = (message: string): ConformanceCaseResult => ({
    id,
    file,
    layer,
    section,
    phase,
    kind,
    status: "fail",
    message,
    duration: Date.now() - start,
  });

  const pass = (): ConformanceCaseResult => ({
    id,
    file,
    layer,
    section,
    phase,
    kind,
    status: "pass",
    duration: Date.now() - start,
  });

  // ── eval phase ──────────────────────────────────────────────────────────────
  if (phase === "eval") {
    const adapter = new PandiRuntimeAdapter();
    try {
      const result = adapter.evaluate(body);
      if (kind === "positive") {
        const expectedPrint = meta.printString;
        if (expectedPrint !== undefined && result.printString !== expectedPrint) {
          return fail(
            `printString mismatch: expected '${expectedPrint}', got '${result.printString}'`,
          );
        }
        return pass();
      }
      // negative eval case — should have thrown/errored; if it didn't, fail
      return fail(`expected evaluation to fail but it succeeded with '${result.printString}'`);
    } catch (e) {
      if (kind === "negative") {
        // Eval negatives: any exception counts as expected failure (no phase-routing needed)
        return pass();
      }
      return fail(`unexpected evaluation error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── lex / parse phase ───────────────────────────────────────────────────────
  if (phase === "lex" || phase === "parse") {
    const { errors } = parse(body);

    if (kind === "positive") {
      if (errors.length > 0) {
        const codes = errors.map((e) => e.code).join(", ");
        return fail(`expected no errors but got: ${codes}`);
      }
      return pass();
    }

    // negative lex/parse case
    if (errors.length === 0) {
      return fail(`expected case to fail but parsed without errors`);
    }

    // Phase-mismatch check (L6.D):
    // All errors must have occurred in the DECLARED phase.
    const wrongPhaseErrors = errors.filter((e) => classifyErrorPhase(e.code) !== phase);
    if (wrongPhaseErrors.length > 0) {
      const wrongCodes = wrongPhaseErrors.map((e) => e.code).join(", ");
      const actualPhases = wrongPhaseErrors.map((e) => classifyErrorPhase(e.code)).join(", ");
      return fail(
        `phase mismatch: case declares phase '${phase}' but errors [${wrongCodes}] occurred in [${actualPhases}] phase`,
      );
    }

    // Code-match check: actual error codes must match declared codes.
    if (meta.codes) {
      const declaredCodes = meta.codes.trim().split(/\s+/);
      const actualCodes = errors.map((e) => e.code);
      const missing = declaredCodes.filter((c) => !(actualCodes as string[]).includes(c));
      const extra = (actualCodes as string[]).filter((c) => !declaredCodes.includes(c));
      if (missing.length > 0 || extra.length > 0) {
        const parts: string[] = [];
        if (missing.length > 0) parts.push(`missing: [${missing.join(", ")}]`);
        if (extra.length > 0) parts.push(`extra: [${extra.join(", ")}]`);
        return fail(`error codes mismatch — ${parts.join("; ")}`);
      }
    }

    return pass();
  }

  // Unknown phase
  return fail(`unknown phase '${phase}' — must be lex, parse, or eval`);
}

// ─── L6.B: JUnit XML emission ────────────────────────────────────────────────

/** Escapes XML special characters in attribute values and text content. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds a JUnit XML string from a list of suites.
 * Each suite maps to a `<testsuite name="layer.section">` element.
 * Each result maps to a `<testcase name="id">` with optional `<failure>` child.
 */
export function buildJUnitXml(suites: JUnitSuite[]): string {
  const totalTests = suites.reduce((acc, s) => acc + s.results.length, 0);
  const totalFailures = suites.reduce(
    (acc, s) => acc + s.results.filter((r) => r.status === "fail").length,
    0,
  );
  const totalErrors = suites.reduce(
    (acc, s) => acc + s.results.filter((r) => r.status === "error").length,
    0,
  );
  const totalTime = suites.reduce(
    (acc, s) => acc + s.results.reduce((a, r) => a + r.duration, 0),
    0,
  );

  const suiteXmls = suites.map((suite) => {
    const suiteName = `${suite.layer}.${suite.section}`;
    const suiteTests = suite.results.length;
    const suiteFailures = suite.results.filter((r) => r.status === "fail").length;
    const suiteErrors = suite.results.filter((r) => r.status === "error").length;
    const suiteTime = suite.results.reduce((a, r) => a + r.duration, 0);

    const caseXmls = suite.results.map((r) => {
      const attrs = [
        `name="${xmlEscape(r.id)}"`,
        `classname="${xmlEscape(suiteName)}"`,
        `time="${(r.duration / 1000).toFixed(3)}"`,
        `status="${r.status}"`,
      ].join(" ");

      if (r.status === "fail") {
        const msg = xmlEscape(r.message ?? "assertion failed");
        return `      <testcase ${attrs}>\n        <failure message="${msg}">${msg}</failure>\n      </testcase>`;
      }
      if (r.status === "error") {
        const msg = xmlEscape(r.message ?? "error");
        return `      <testcase ${attrs}>\n        <error message="${msg}">${msg}</error>\n      </testcase>`;
      }
      if (r.status === "skip") {
        return `      <testcase ${attrs}>\n        <skipped/>\n      </testcase>`;
      }
      return `      <testcase ${attrs}/>`;
    });

    return [
      `  <testsuite name="${xmlEscape(suiteName)}" tests="${suiteTests}" failures="${suiteFailures}" errors="${suiteErrors}" time="${(suiteTime / 1000).toFixed(3)}">`,
      ...caseXmls,
      "  </testsuite>",
    ].join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="pandi-sm conformance" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" time="${(totalTime / 1000).toFixed(3)}">`,
    ...suiteXmls,
    "</testsuites>",
  ].join("\n");
}

// ─── groupIntoSuites ─────────────────────────────────────────────────────────

/**
 * Groups a flat list of case results into JUnitSuite records, sorted by
 * layer then section (stable, alphabetical).
 */
export function groupIntoSuites(results: ConformanceCaseResult[]): JUnitSuite[] {
  const suiteMap = new Map<string, ConformanceCaseResult[]>();
  for (const r of results) {
    const key = `${r.layer}::${r.section}`;
    let list = suiteMap.get(key);
    if (!list) {
      list = [];
      suiteMap.set(key, list);
    }
    list.push(r);
  }

  return [...suiteMap.keys()].sort().map((key) => {
    const parts = key.split("::");
    const layer = parts[0] ?? "unknown";
    const section = parts[1] ?? "unknown";
    return { layer, section, results: suiteMap.get(key) ?? [] };
  });
}

// ─── runAll ───────────────────────────────────────────────────────────────────

/**
 * Runs all conformance cases in the given file list and returns:
 * - flat results array
 * - layer gates
 * - advance rule decision
 */
export function runAll(files: string[]): {
  results: ConformanceCaseResult[];
  gates: LayerGate[];
  advance: AdvanceRuleResult;
} {
  const results = files.map((f) => runConformanceCase(f));

  // Collect distinct layers (from results + from files we know about)
  const layerSet = new Set(results.map((r) => r.layer).filter((l) => l !== "unknown"));
  const layers = [...layerSet].sort();

  const gates = layers.map((l) => computeLayerGate(l, results));
  const advance = computeAdvanceRule(gates);

  return { results, gates, advance };
}
