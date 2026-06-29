/**
 * L6 · traceability — bidirectional deviation log checks (L6.E, L6.F).
 *
 * TDD RED phase: these tests FAIL until parseDeviationLog / verifyTraceability
 * are implemented in traceability.ts.
 *
 * @section harness.L6.traceability
 * @kind    positive
 * @layer   L6
 */
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseDeviationLog, verifyTraceability, type DeviationEntry } from "./traceability.js";
import type { ConformanceCase } from "./st-runner.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REAL_LOG = join(REPO_ROOT, "doc/research/log-de-desviaciones.md");

// ─── L6.F: parseDeviationLog extracts entries from the real log ───────────

describe("L6.F · parseDeviationLog · real deviation log", () => {
  it("parses at least 10 entries (L6.F >= 10)", () => {
    const entries = parseDeviationLog(REAL_LOG);
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it("parses exactly 61 entries from the real log", () => {
    const entries = parseDeviationLog(REAL_LOG);
    expect(entries.length).toBe(61);
  });

  it("first entry has id DEV-001", () => {
    const entries = parseDeviationLog(REAL_LOG);
    expect(entries[0]?.id).toBe("DEV-001");
  });

  it("last entry has id DEV-061", () => {
    const entries = parseDeviationLog(REAL_LOG);
    expect(entries[entries.length - 1]?.id).toBe("DEV-061");
  });

  it("implementada entries have at least one coveredBy reference", () => {
    const entries = parseDeviationLog(REAL_LOG);
    const implemented = entries.filter((e) => e.estado.toLowerCase().includes("implementada"));
    // Every implementada entry must have >= 1 coveredBy path extracted
    for (const entry of implemented) {
      expect(entry.coveredBy.length, `${entry.id} has no coveredBy`).toBeGreaterThan(0);
    }
  });

  it("DEV-025 coveredBy includes test/L4/f4-array.test.ts", () => {
    const entries = parseDeviationLog(REAL_LOG);
    const dev025 = entries.find((e) => e.id === "DEV-025");
    expect(dev025).toBeDefined();
    expect(dev025?.coveredBy).toContain("test/L4/f4-array.test.ts");
  });

  it("DEV-055 coveredBy includes test/harness/conformance-schema.test.ts", () => {
    const entries = parseDeviationLog(REAL_LOG);
    const dev055 = entries.find((e) => e.id === "DEV-055");
    expect(dev055).toBeDefined();
    expect(dev055?.coveredBy).toContain("test/harness/conformance-schema.test.ts");
  });
});

// ─── L6.E meta-test (a): direction (i) RED ────────────────────────────────
// A synthetic implementada entry with a nonexistent coveredBy file must
// cause verifyTraceability to return { ok: false }.

describe("L6.E · verifyTraceability · direction (i) — coveredBy file must exist", () => {
  it("returns ok=false when coveredBy file does not exist on disk", () => {
    const syntheticLog: DeviationEntry[] = [
      {
        id: "DEV-SYNTH-1",
        deviation: "synthetic test deviation",
        respectoDe: "ANSI",
        origin: "ingeniería",
        donde: "L6",
        estado: "implementada (`test/DOES-NOT-EXIST/fake.test.ts`)",
        coveredBy: ["test/DOES-NOT-EXIST/fake.test.ts"],
      },
    ];
    const result = verifyTraceability([], syntheticLog, REPO_ROOT);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns ok=true when coveredBy file exists on disk", () => {
    const syntheticLog: DeviationEntry[] = [
      {
        id: "DEV-SYNTH-2",
        deviation: "synthetic test deviation",
        respectoDe: "ANSI",
        origin: "ingeniería",
        donde: "L6",
        estado: "implementada (`test/harness/conformance-schema.test.ts`)",
        coveredBy: ["test/harness/conformance-schema.test.ts"],
      },
    ];
    const result = verifyTraceability([], syntheticLog, REPO_ROOT);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── L6.E meta-test (b): direction (ii) RED ───────────────────────────────
// A synthetic non-spec-ANSI corpus case with no deviation field must
// cause verifyTraceability to return { ok: false }.

describe("L6.E · verifyTraceability · direction (ii) — non-ANSI cases need deviation field", () => {
  it("returns ok=false when a non-ANSI case has no deviation field", () => {
    const syntheticCase: ConformanceCase = {
      file: "fake.st",
      meta: {
        id: "fake",
        kind: "positive",
        phase: "parse",
        layer: "L1",
        spec: "anexoA:x",
        origin: "extension-propia",
        section: "x",
      },
      body: "3 + 4",
    };
    const result = verifyTraceability([syntheticCase], [], REPO_ROOT);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns ok=false when deviation field references a nonexistent log entry", () => {
    const syntheticCase: ConformanceCase = {
      file: "fake.st",
      meta: {
        id: "fake",
        kind: "positive",
        phase: "parse",
        layer: "L1",
        spec: "anexoA:x",
        origin: "extension-propia",
        section: "x",
        deviation: "DEV-999",
      },
      body: "3 + 4",
    };
    const result = verifyTraceability([syntheticCase], [], REPO_ROOT);
    expect(result.ok).toBe(false);
  });

  it("returns ok=true when a non-ANSI case references an existing log entry", () => {
    const syntheticLog: DeviationEntry[] = [
      {
        id: "DEV-100",
        deviation: "synthetic",
        respectoDe: "ANSI",
        origin: "ingeniería",
        donde: "L6",
        estado: "decidida",
        coveredBy: [],
      },
    ];
    const syntheticCase: ConformanceCase = {
      file: "fake.st",
      meta: {
        id: "fake",
        kind: "positive",
        phase: "parse",
        layer: "L1",
        spec: "anexoA:x",
        origin: "extension-propia",
        section: "x",
        deviation: "DEV-100",
      },
      body: "3 + 4",
    };
    const entry = syntheticLog[0];
    if (!entry) throw new Error("syntheticLog must not be empty");
    const result = verifyTraceability([syntheticCase], [entry], REPO_ROOT);
    expect(result.ok).toBe(true);
  });
});

// ─── L6.E: real corpus passes verifyTraceability ─────────────────────────
// All 75 L1 corpus files have origin: spec-ANSI, so direction (ii) has
// an empty trigger set — trivially ok=true.

describe("L6.E · verifyTraceability · real corpus + real log pass", () => {
  it("real corpus (all spec-ANSI) with real log yields ok=true", async () => {
    const { discoverStFiles, loadConformanceCase } = await import("./st-runner.js");
    const corpusDir = fileURLToPath(new URL("../corpus/L1/", import.meta.url));
    const files = discoverStFiles(corpusDir);
    const cases = files.map((f) => loadConformanceCase(f));
    const log = parseDeviationLog(REAL_LOG);
    const result = verifyTraceability(cases, log, REPO_ROOT);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
