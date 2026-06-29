#!/usr/bin/env tsx
/**
 * L6.S3 · `npm run conformance` — pandi-sm conformance runner CLI.
 *
 * Usage: tsx scripts/conformance.ts [--corpus <dir>] [--output <xml>]
 *
 * Discovers all .st files under the corpus directory, runs each case through
 * the pandi-sm runtime (phase-routed: lex/parse via parse(), eval via
 * PandiRuntimeAdapter), emits JUnit XML grouped by layer+section, and exits
 * with code 0 iff the §6.1 advance rule gate is green.
 *
 * Advance rule (L6.G):
 *  - exit 0: max delivered layer's gate is green (≥40 pos + ≥15 neg, 0 failures)
 *  - exit 1: any delivered layer is red
 *  - unimplemented layers (0 cases) report "pending" / skipped-by-design
 *
 * L6.H: adding test/corpus/L3/*.st needs ZERO runner changes — discoverStFiles
 * is already layer-agnostic.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { discoverStFiles } from "../test/harness/st-runner.js";
import { runAll, groupIntoSuites, buildJUnitXml } from "../test/harness/conformance-runner.js";
import { parseDeviationLog, verifyTraceability } from "../test/harness/traceability.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// ─── CLI args ────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: join(REPO_ROOT, "test/corpus") },
    output: { type: "string", default: join(REPO_ROOT, "reports/conformance.xml") },
    quiet: { type: "boolean", default: false },
  },
  strict: false,
});

const corpusDir = resolve(values.corpus as string);
const outputFile = resolve(values.output as string);
const quiet = values.quiet as boolean;

function log(msg: string): void {
  if (!quiet) console.log(msg);
}

function logError(msg: string): void {
  console.error(msg);
}

// ─── Main ────────────────────────────────────────────────────────────────────

log("pandi-sm conformance runner");
log(`Corpus: ${corpusDir}`);
log("");

// Discover corpus files (L6.H: layer-agnostic, any layer works)
const files = discoverStFiles(corpusDir);
if (files.length === 0) {
  logError(`[conformance] ERROR: no .st files found under: ${corpusDir}`);
  process.exit(1);
}

log(`Discovered ${files.length} case(s)`);
log("");

// Run all cases
const { results, gates, advance } = runAll(files);

// Print per-layer gate summary
for (const gate of gates) {
  const icon = gate.status === "green" ? "✓" : gate.status === "pending" ? "~" : "✗";
  const counts =
    gate.status === "pending"
      ? "0 cases (pending)"
      : `${gate.positives} positive, ${gate.negatives} negative, ${gate.failures} failures`;
  log(`  ${icon} ${gate.layer}: ${counts} [${gate.status.toUpperCase()}]`);
}
log("");

// Print individual failures for debugging
const failures = results.filter((r) => r.status === "fail" || r.status === "error");
if (failures.length > 0) {
  logError("FAILURES:");
  for (const f of failures) {
    logError(`  [${f.status.toUpperCase()}] ${f.id} (${f.file})`);
    if (f.message) logError(`         ${f.message}`);
  }
  logError("");
}

// Traceability check (L6.E): bidirectional deviation log verification.
// traceOk gates the final exit alongside advance.exit0 — if traceability
// fails the run must exit 1 even when the layer gate is green.
const deviationLogPath = join(REPO_ROOT, "doc/research/log-de-desviaciones.md");
let traceOk = true;
try {
  const log_ = parseDeviationLog(deviationLogPath);
  const { loadConformanceCase } = await import("../test/harness/st-runner.js");
  const cases = files.map((f) => loadConformanceCase(f));
  const traceResult = verifyTraceability(cases, log_, REPO_ROOT);
  if (traceResult.ok) {
    log("Traceability: OK");
  } else {
    logError("Traceability ERRORS:");
    for (const e of traceResult.errors) logError(`  ${e}`);
    traceOk = false;
  }
} catch (e) {
  logError(`Traceability check failed: ${e instanceof Error ? e.message : String(e)}`);
  traceOk = false;
}
log("");

// Emit JUnit XML (L6.B)
const suites = groupIntoSuites(results);
const xml = buildJUnitXml(suites);
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, xml, "utf8");
log(`JUnit XML written to: ${outputFile}`);
log(`  ${results.length} testcase(s) across ${suites.length} suite(s)`);
log("");

// Advance rule summary (L6.G)
log(`Gate: ${advance.summary}`);
log("");

if (advance.exit0 && traceOk) {
  log("CONFORMANCE: PASS");
  process.exit(0);
} else {
  logError("CONFORMANCE: FAIL");
  process.exit(1);
}
