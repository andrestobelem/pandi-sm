/**
 * Verifica el host-runner de L0: descubrimiento de `.st` + parseo de frontmatter,
 * SIN runtime Smalltalk real (el adapter es un stub que falla limpio).
 *
 * @section harness.L0
 * @kind    positive
 * @layer   L0
 */
import { describe, expect, it } from "vitest";
import { NotImplementedError, StubRuntimeAdapter } from "./runtime-adapter.js";
import { discoverStFiles, parseFrontmatter } from "./st-runner.js";

describe("L0 · host-runner (stub)", () => {
  it("parsea el frontmatter fenced de un caso .st", () => {
    const src = [
      '"---',
      "section: A.2",
      "kind: positive",
      "phase: parse",
      "layer: L1",
      '---"',
      "3 + 4 * 2",
    ].join("\n");

    const { meta, body } = parseFrontmatter(src);
    expect(meta).toEqual({ section: "A.2", kind: "positive", phase: "parse", layer: "L1" });
    expect(body).toBe("3 + 4 * 2");
  });

  it("devuelve {} y el fuente íntegro cuando no hay frontmatter", () => {
    const { meta, body } = parseFrontmatter("3 + 4");
    expect(meta).toEqual({});
    expect(body).toBe("3 + 4");
  });

  it("descubre un corpus vacío sin lanzar (aún no hay .st en L0)", () => {
    expect(discoverStFiles("test/corpus-inexistente")).toEqual([]);
  });

  it("el adapter stub falla limpio: la tubería real llega con L1/L3", () => {
    const rt = new StubRuntimeAdapter();
    expect(() => rt.parse("3 + 4")).toThrow(NotImplementedError);
    expect(() => rt.evaluate("3 + 4")).toThrow(NotImplementedError);
  });
});
