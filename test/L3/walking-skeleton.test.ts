/**
 * L3 · walking skeleton — tubería end-to-end a través del host-runner.
 * Conduce los dos fragmentos canónicos (Anexo A.2 precedencia + protocolo de
 * mensaje keyword Transcript>>show:) por el RuntimeAdapter real (parse L1 +
 * eval L3), y los .st del corpus por discoverStFiles/loadStCase/parseFrontmatter.
 * Reusa la config vitest que emite JUnit XML (gate de CI), sin nuevo harness.
 *
 * @section L3.skeleton
 * @kind    positive
 * @layer   L3
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PandiRuntimeAdapter } from "../../src/runtime/adapter.js";
import { discoverStFiles, loadStCase, parseFrontmatter } from "../harness/st-runner.js";

const FIXTURES = join(__dirname, "fixtures");

describe("L3 · walking skeleton · adapter real (end-to-end)", () => {
  it("'3 + 4 * 2' => printString '14' (left-to-right, sin precedencia)", () => {
    const rt = new PandiRuntimeAdapter();
    expect(rt.evaluate("3 + 4 * 2").printString).toBe("14");
  });

  it("Transcript show: 'hi' deja el buffer del adapter en 'hi'", () => {
    const rt = new PandiRuntimeAdapter();
    const result = rt.evaluate("Transcript show: 'hi'");
    expect(result.transcript).toBe("hi");
  });

  it("cada evaluate() corre sobre un Universe fresco (sin fuga de buffer)", () => {
    const rt = new PandiRuntimeAdapter();
    rt.evaluate("Transcript show: 'first'");
    expect(rt.evaluate("Transcript show: 'second'").transcript).toBe("second");
  });

  it("parse() del adapter delega en L1 (sin errores para fuente válida)", () => {
    const rt = new PandiRuntimeAdapter();
    const parsed = rt.parse("3 + 4") as { ast: unknown; errors: unknown[] };
    expect(parsed.ast).not.toBeNull();
    expect(parsed.errors).toHaveLength(0);
  });
});

describe("L3 · walking skeleton · corpus .st por el host-runner", () => {
  it("descubre los dos fixtures .st", () => {
    const files = discoverStFiles(FIXTURES);
    expect(files.map((f) => f.split("/").pop())).toEqual(["precedence.st", "transcript.st"]);
  });

  it("parseFrontmatter lee la metadata phase: eval de cada fixture", () => {
    for (const file of discoverStFiles(FIXTURES)) {
      const { meta } = parseFrontmatter(readFileSync(file, "utf8"));
      expect(meta.phase).toBe("eval");
      expect(meta.layer).toBe("L3");
    }
  });

  it("corre cada fixture por el adapter y casa con el printString/transcript esperado", () => {
    const rt = new PandiRuntimeAdapter();
    for (const file of discoverStFiles(FIXTURES)) {
      const stCase = loadStCase(file);
      const result = rt.evaluate(stCase.body);
      if (stCase.meta.printString !== undefined) {
        expect(result.printString).toBe(stCase.meta.printString);
      }
      if (stCase.meta.transcript !== undefined) {
        expect(result.transcript).toBe(stCase.meta.transcript);
      }
    }
  });
});
