// L6 · traceability — parseDeviationLog + verifyTraceability (L6.E, L6.F).
//
// parseDeviationLog: parses the markdown table in the deviation log,
// extracting DeviationEntry records.  Tolerates blank lines within the
// table body and stops at the first `## ` heading after the table starts.
//
// verifyTraceability: bidirectional check —
//   (i)  every `implementada` entry must have >= 1 coveredBy path that
//        EXISTS on disk (relative to repoRoot).
//   (ii) every corpus case with origin != 'spec-ANSI' must have a
//        `deviation: DEV-NNN` frontmatter field pointing to an existing
//        DeviationEntry in the log.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConformanceCase } from "./st-runner.js";

// ─── Public types ─────────────────────────────────────────────────────────

export interface DeviationEntry {
  id: string;
  deviation: string;
  respectoDe: string;
  origin: string;
  donde: string;
  estado: string;
  /** Test file paths extracted from backtick tokens in the Estado column. */
  coveredBy: string[];
}

export interface TraceabilityResult {
  ok: boolean;
  errors: string[];
}

// ─── parseDeviationLog ────────────────────────────────────────────────────

/**
 * Parses the markdown table in the deviation log file at `mdPath`.
 * Extracts one DeviationEntry per data row.  Blank lines within the table
 * body are tolerated (skipped).  Stops at any `## ` heading encountered
 * after the table header row.
 */
export function parseDeviationLog(mdPath: string): DeviationEntry[] {
  const src = readFileSync(mdPath, "utf8");
  const lines = src.split("\n");

  // Regex to match backtick-quoted tokens that look like test file paths.
  const TEST_REF = /`(test\/[^`]+\.(?:ts|st))[^`]*`/g;

  const entries: DeviationEntry[] = [];
  let inTable = false;
  let separatorSeen = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Detect the table header: must contain all six expected column headers.
    if (
      !inTable &&
      line.includes("| ID |") &&
      line.includes("Desviación") &&
      line.includes("Estado |")
    ) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;

    // Stop at any second-level heading (## …) — these come after the table.
    if (line.startsWith("## ")) {
      break;
    }

    // Skip the separator row (|---|---|...)
    if (!separatorSeen && /^\s*\|[\s-|]+\|\s*$/.test(line)) {
      separatorSeen = true;
      continue;
    }

    // Skip blank lines within the table body.
    if (line.trim() === "") continue;

    // Skip non-table lines (shouldn't appear, but be robust).
    if (!line.trim().startsWith("|")) continue;

    // Split the row into cells by `|`.
    // Row format: | ID | Desviación | Respecto de | Origen | Dónde | Estado |
    const cells = line.split("|").map((c) => c.trim());
    // cells[0] is empty (before first |), cells[1..6] are the six columns,
    // cells[7] is empty (after last |).
    if (cells.length < 7) continue;

    const id = cells[1] ?? "";
    const deviation = cells[2] ?? "";
    const respectoDe = cells[3] ?? "";
    const origin = cells[4] ?? "";
    const donde = cells[5] ?? "";
    const estado = cells[6] ?? "";

    // Only process rows that start with DEV-
    if (!id.startsWith("DEV-")) continue;

    // Extract coveredBy paths from backtick tokens in the Estado cell.
    const coveredBy: string[] = [];
    TEST_REF.lastIndex = 0;
    for (let m = TEST_REF.exec(estado); m !== null; m = TEST_REF.exec(estado)) {
      if (m[1] !== undefined) coveredBy.push(m[1]);
    }

    entries.push({ id, deviation, respectoDe, origin, donde, estado, coveredBy });
  }

  return entries;
}

// ─── verifyTraceability ───────────────────────────────────────────────────

/**
 * Bidirectional traceability check.
 *
 * Direction (i): every DeviationEntry whose `estado` contains 'implementada'
 * must have >= 1 coveredBy path that EXISTS on disk (relative to repoRoot).
 *
 * Direction (ii): every ConformanceCase with origin != 'spec-ANSI' must have
 * a `deviation: DEV-NNN` frontmatter field that references an existing entry
 * in the log.
 *
 * Returns { ok: true, errors: [] } when both directions pass.
 */
export function verifyTraceability(
  cases: ConformanceCase[],
  log: DeviationEntry[],
  repoRoot: string = process.cwd(),
): TraceabilityResult {
  const errors: string[] = [];
  const logById = new Map(log.map((e) => [e.id, e]));

  // Direction (i) — implemented entries must have existing coveredBy files.
  for (const entry of log) {
    if (!entry.estado.toLowerCase().includes("implementada")) continue;
    if (entry.coveredBy.length === 0) {
      errors.push(`[D1] ${entry.id}: estado='implementada' but has no coveredBy test references`);
      continue;
    }
    for (const ref of entry.coveredBy) {
      const abs = join(repoRoot, ref);
      if (!existsSync(abs)) {
        errors.push(`[D1] ${entry.id}: coveredBy path not found on disk: '${ref}'`);
      }
    }
  }

  // Direction (ii) — non-spec-ANSI cases must reference an existing log entry.
  for (const c of cases) {
    if (c.meta.origin === "spec-ANSI") continue;
    if (!c.meta.deviation) {
      errors.push(`[D2] ${c.file}: origin='${c.meta.origin}' but has no 'deviation' field`);
      continue;
    }
    if (!logById.has(c.meta.deviation)) {
      errors.push(`[D2] ${c.file}: deviation='${c.meta.deviation}' not found in log`);
    }
  }

  return { ok: errors.length === 0, errors };
}
