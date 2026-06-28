/**
 * Toolchain smoke (L0) — NO es Smalltalk. Demuestra que la cadena
 * TypeScript → Vitest → JUnit XML conversa end-to-end, y sigue la convención
 * de frontmatter de tests documentada en `test/README.md`.
 *
 * @section toolchain.L0
 * @kind    positive
 * @layer   L0
 */
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("L0 · toolchain smoke", () => {
  it("compila y ejecuta TypeScript estricto bajo Vitest", () => {
    // Aritmética JS normal (NO Smalltalk): aquí `*` SÍ tiene precedencia → 11.
    // El walking skeleton (L1–L3) probará que en Smalltalk `3 + 4 * 2` = 14.
    const n: number = 3 + 4 * 2;
    expect(n).toBe(11);
  });

  it("importa el barrel raíz ESM sin lanzar", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
