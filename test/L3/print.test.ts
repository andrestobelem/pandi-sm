/**
 * L3 · printString (skeleton) + fallo limpio de envíos no soportados.
 * Fija el minor del verificador adversarial: printString(nil) === "nil" (antes
 * daba "[object Object]"). printString completo (printOn:/displayString) es
 * L3-proper. El fallo de un envío no soportado es un throw del host OBSERVABLE
 * (doesNotUnderstand como mensaje Smalltalk es L3-proper, diferido).
 *
 * @section L3.print
 * @kind    positive+negative
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";

describe("L3 · printString (skeleton)", () => {
  it("nil imprime 'nil' (no '[object Object]')", () => {
    // programa vacío => nil; y la identidad nil del universo
    expect(printString(evalWith("").value)).toBe("nil");
    expect(printString(evalWith("").universe.nil)).toBe("nil");
  });

  it("números, bigint y strings imprimen su texto", () => {
    expect(printString(evalSt("3 + 4 * 2"))).toBe("14");
    expect(printString(evalSt("9007199254740993"))).toBe("9007199254740993"); // bigint exacto
    expect(printString(evalSt("'hola'"))).toBe("hola");
  });

  it("booleans imprimen 'true'/'false'", () => {
    expect(printString(true)).toBe("true");
    expect(printString(false)).toBe("false");
  });

  it("otros STObject usan el default 'a ClassName'", () => {
    expect(printString(evalWith("").universe.Transcript)).toMatch(/^a /);
  });
});

describe("L3 · envío no soportado falla limpio (doesNotUnderstand:)", () => {
  it("binario sin primitiva => throw observable (no corrupción silenciosa)", () => {
    // `//` (división entera) es L4, aún sin primitiva: el miss enruta por dNU.
    expect(() => evalSt("3 // 4")).toThrow(/entiende|doesNotUnderstand/i);
  });

  it("mensaje unario sin primitiva => throw observable (S1: los unarios ya despachan)", () => {
    // S1 habilitó el despacho de unarios (lo necesita `[block] value`); un selector
    // unario sin primitiva ahora es un miss observable, no un rechazo del skeleton.
    expect(() => evalSt("3 factorial")).toThrow(/entiende|doesNotUnderstand/i);
  });
});
