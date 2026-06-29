/**
 * L6 · conformance schema — validates strict frontmatter loading (L6.C).
 *
 * TDD RED phase: these tests FAIL until validateFrontmatter / loadConformanceCase
 * are implemented in st-runner.ts.
 *
 * @section harness.L6.schema
 * @kind    positive
 * @layer   L6
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  validateFrontmatter,
  loadConformanceCase,
  discoverStFiles,
  type ConformanceMeta,
} from "./st-runner.js";

// Temporary scratch directory for injected fixtures.
const SCRATCH =
  "/private/tmp/claude-501/-Users-andrestobelem-ws-at-pandi-sm/41d1ffe5-fa96-43c8-bbac-f0a2db6da9c3/scratchpad/conformance-schema-test";

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

// ─── L6.C: missing frontmatter FAILS load (not skip) ──────────────────────

describe("L6.C · conformance schema · strict validation", () => {
  it("validates a fully-correct conformance meta without throwing", () => {
    const meta: ConformanceMeta = {
      id: "array-literal",
      kind: "positive",
      phase: "parse",
      layer: "L1",
      spec: "anexoA:array.literal",
      origin: "spec-ANSI",
      section: "array.literal",
    };
    expect(() => validateFrontmatter(meta)).not.toThrow();
  });

  it("throws when 'id' is missing", () => {
    const meta = {
      kind: "positive",
      phase: "parse",
      layer: "L1",
      spec: "anexoA:array.literal",
      origin: "spec-ANSI",
      section: "array.literal",
    } as Partial<ConformanceMeta>;
    expect(() => validateFrontmatter(meta as ConformanceMeta)).toThrow(/id/);
  });

  it("throws when 'kind' has an invalid enum value", () => {
    const meta = {
      id: "test",
      kind: "neutral",
      phase: "parse",
      layer: "L1",
      spec: "x",
      origin: "spec-ANSI",
      section: "x",
    } as unknown as ConformanceMeta;
    expect(() => validateFrontmatter(meta)).toThrow(/kind/);
  });

  it("throws when 'phase' has an invalid enum value", () => {
    const meta = {
      id: "test",
      kind: "positive",
      phase: "run",
      layer: "L1",
      spec: "x",
      origin: "spec-ANSI",
      section: "x",
    } as unknown as ConformanceMeta;
    expect(() => validateFrontmatter(meta)).toThrow(/phase/);
  });

  it("throws when 'layer' is missing", () => {
    const meta = {
      id: "test",
      kind: "positive",
      phase: "parse",
      spec: "x",
      origin: "spec-ANSI",
      section: "x",
    } as Partial<ConformanceMeta>;
    expect(() => validateFrontmatter(meta as ConformanceMeta)).toThrow(/layer/);
  });

  it("throws when 'origin' is missing", () => {
    const meta = {
      id: "test",
      kind: "positive",
      phase: "parse",
      layer: "L1",
      spec: "x",
      section: "x",
    } as Partial<ConformanceMeta>;
    expect(() => validateFrontmatter(meta as ConformanceMeta)).toThrow(/origin/);
  });

  it("throws when 'origin' has an invalid enum value", () => {
    const meta = {
      id: "test",
      kind: "positive",
      phase: "parse",
      layer: "L1",
      spec: "x",
      origin: "made-up",
      section: "x",
    } as unknown as ConformanceMeta;
    expect(() => validateFrontmatter(meta)).toThrow(/origin/);
  });

  it("loadConformanceCase throws on a .st file with NO frontmatter", () => {
    const f = writeTmp("no-frontmatter.st", "3 + 4\n");
    expect(() => loadConformanceCase(f)).toThrow();
  });

  it("loadConformanceCase throws on a .st file with frontmatter missing required keys", () => {
    const f = writeTmp(
      "missing-keys.st",
      ['"---', "kind: positive", "section: array.literal", '---"', "#(1 2 3)"].join("\n"),
    );
    expect(() => loadConformanceCase(f)).toThrow();
  });

  it("loadConformanceCase succeeds on a fully-valid .st with all required keys", () => {
    const f = writeTmp(
      "valid.st",
      [
        '"---',
        "id: array-literal",
        "kind: positive",
        "phase: parse",
        "layer: L1",
        "spec: anexoA:array.literal",
        "origin: spec-ANSI",
        "section: array.literal",
        "note: test case",
        '---"',
        "#(1 2 3)",
      ].join("\n"),
    );
    const c = loadConformanceCase(f);
    expect(c.meta.id).toBe("array-literal");
    expect(c.meta.kind).toBe("positive");
    expect(c.meta.phase).toBe("parse");
    expect(c.meta.layer).toBe("L1");
    expect(c.body).toBe("#(1 2 3)");
  });

  it("negative case with deviation field is valid", () => {
    const f = writeTmp(
      "with-deviation.st",
      [
        '"---',
        "id: some-case",
        "kind: negative",
        "phase: lex",
        "layer: L1",
        "spec: anexoA:error.empty-symbol",
        "origin: spec-ANSI",
        "section: error.empty-symbol",
        "codes: E_EMPTY_SYMBOL",
        "deviation: DEV-009",
        '---"',
        "#",
      ].join("\n"),
    );
    const c = loadConformanceCase(f);
    expect(c.meta.deviation).toBe("DEV-009");
  });
});

// ─── L6.C: all 75 real corpus files pass strict validation ───────────────

const CORPUS_DIR = new URL("../corpus/L1/", import.meta.url).pathname;
const corpusFiles = discoverStFiles(CORPUS_DIR);

describe("L6.C · conformance schema · all L1 corpus files have valid frontmatter", () => {
  it("corpus has 75 files", () => {
    expect(corpusFiles.length).toBe(75);
  });

  it.each(corpusFiles.map((f) => [f] as const))("valid frontmatter: %s", (f) => {
    expect(() => loadConformanceCase(f)).not.toThrow();
  });
});
