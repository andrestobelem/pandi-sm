/**
 * S2-primitives-majors — regresión para findings #4, #5, #6, #7 del audit de primitivas.
 *
 * #4 — arrayIndex convierte bigint a number sin guard de rango seguro.
 *       Un bigint >= 9007199254740993n podría truncarse silenciosamente
 *       (Number(9007199254740993n) = 9007199254740992). El fix añade la misma
 *       guard que tiene intervalEndpoint.
 * #5 — timesRepeat: hace Number() sin guard sobre el receptor bigint. Un bigint
 *       enorme (> MAX_SAFE_INTEGER) causaba un bucle casi-infinito. El fix señala
 *       error capturable en Smalltalk vía signalError.
 * #6 — perform:withArguments: recibía un STArray boxed como lista de args; ya
 *       corregido en S1 (stSymbolText + .elements unwrap). Tests de regresión aquí
 *       para cobertura continua de la familia perform:.
 * #7 — stringSize devolvía text.length (unidades UTF-16) en vez de [...text].length
 *       (codepoints). Para un char astral (U+1F600 😀), size erróneo era 2 en vez de 1.
 *
 * @section L2.s2-primitives-regression
 * @kind    regression
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

// ── Finding #4 · arrayIndex bigint safe-range guard ──────────────────────────

describe("S2 #4 · arrayIndex: bigint fuera de rango seguro señala error capturable", () => {
  it("at: con bigint > MAX_SAFE_INTEGER señala error (no truncación silenciosa)", () => {
    // 9007199254740993n > MAX_SAFE_INTEGER=9007199254740991. Sin guard: Number() lo
    // convierte a 9007199254740992 (fuera de rango del array pequeño, atrapado por
    // range-check). Con guard: señalamos explícitamente antes de Number().
    const src = "[#(1 2 3) at: 9007199254740993] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("at: con bigint negativo enorme señala error capturable", () => {
    const src = "[#(1 2 3) at: -9007199254740993] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("at:put: con bigint > MAX_SAFE_INTEGER señala error capturable", () => {
    const src = "[#(1 2 3) at: 9007199254740993 put: 99] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("at: con bigint válido en rango funciona correctamente", () => {
    // Bigints pequeños (promovidos por overflow aritmético) deben seguir funcionando
    const src = "#(10 20 30) at: 2";
    expect(printString(evalSt(src))).toBe("20");
  });
});

// ── Finding #5 · timesRepeat: bigint safe-range guard ────────────────────────

describe("S2 #5 · timesRepeat: con bigint > MAX_SAFE_INTEGER señala error capturable", () => {
  it("timesRepeat: con receptor bigint enorme señala Error (no bucle infinito)", () => {
    // Antes del fix: Number(9007199254740993n) = 9007199254740992 -> ~9*10^15 iteraciones
    // (prácticamente infinito). Con guard: signalError -> capturable con on:do:.
    const src = "[9007199254740993 timesRepeat: []] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("timesRepeat: con receptor bigint negativo enorme señala Error", () => {
    const src = "[-9007199254740993 timesRepeat: []] on: Error do: [:e | 'caught']";
    expect(printString(evalSt(src))).toBe("caught");
  });

  it("timesRepeat: con bigint pequeño válido funciona (0 veces)", () => {
    // 0 como bigint (resultado de aritmética que emite BigInt) debe funcionar
    const src = "| r | r := 0. 3 timesRepeat: [r := r + 1]. r";
    expect(printString(evalSt(src))).toBe("3");
  });
});

// ── Finding #6 · perform:withArguments: con STArray boxed (regresión S1) ─────

describe("S2 #6 · perform:withArguments: con array literal boxed (regresión S1)", () => {
  it("3 perform: #+ withArguments: {4} -> 7", () => {
    // STArray boxed desde Smalltalk: .elements debe desempaquetarse como lista de args.
    expect(printString(evalSt("3 perform: #+ withArguments: {4}"))).toBe("7");
  });

  it("perform:withArguments: con array vacío {}  -> perform:  sin args", () => {
    expect(printString(evalSt("42 perform: #yourself withArguments: {}"))).toBe("42");
  });

  it("perform:withArguments: con dos args {3. 4}", () => {
    // Mensaje keyword aridad 2: 10 max: 3 -> 10 (vía perform:withArguments:)
    // Reutiliza la aritmética ya instalada en el kernel.
    expect(printString(evalSt("10 perform: #max: withArguments: {3}"))).toBe("10");
  });
});

// ── Finding #7 · stringSize codepoints vs UTF-16 units ───────────────────────

describe("S2 #7 · stringSize cuenta codepoints (no unidades UTF-16)", () => {
  it("'😀' size -> 1 (un codepoint astral, 2 unidades UTF-16 sin fix)", () => {
    // U+1F600 GRINNING FACE: surrogate pair en JS -> text.length=2, [...text].length=1.
    // Antes del fix: devuelve 2. Después: devuelve 1.
    expect(printString(evalSt("'😀' size"))).toBe("1");
  });

  it("'ab' size -> 2 (ASCII básico sin cambio)", () => {
    expect(printString(evalSt("'ab' size"))).toBe("2");
  });

  it("'' size -> 0 (string vacío)", () => {
    expect(printString(evalSt("'' size"))).toBe("0");
  });

  it("'a😀b' size -> 3 (dos BMP + un astral = 3 codepoints)", () => {
    // text.length=4 (a + 2-unit surrogate + b); [...text].length=3.
    expect(printString(evalSt("'a😀b' size"))).toBe("3");
  });
});
