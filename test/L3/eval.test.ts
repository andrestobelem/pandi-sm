/**
 * L3 · eval — evaluador tree-walking MÍNIMO (walking skeleton, plan §4/§5.3).
 * Subconjunto: LiteralNode (integer/string) + MessageSendNode (binary/keyword);
 * send() con lookup por la superclass chain; primitivas SmallInteger>>+/* y
 * Transcript>>show:. SIN precedencia aritmética (binario es left-to-right, Anexo
 * A.2). Bloques, super, dNU y non-local-return son L3-proper (diferidos).
 *
 * @section L3.eval
 * @kind    positive
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, evalWith, printString } from "../../src/eval/index.js";

describe("L3 · eval · aritmética binaria sin precedencia (Anexo A.2)", () => {
  it("'3 + 4 * 2' evalúa left-to-right => 14 (NO 11)", () => {
    expect(printString(evalSt("3 + 4 * 2"))).toBe("14");
  });

  it("'3 + 4' (un solo binario) => 7", () => {
    expect(printString(evalSt("3 + 4"))).toBe("7");
  });

  it("'2 * 3 + 4' => 10 (((2*3)+4), prueba que no hay precedencia)", () => {
    expect(printString(evalSt("2 * 3 + 4"))).toBe("10");
  });
});

describe("L3 · eval · literales", () => {
  it("literal string 'hi' => un String BOXED cuyos chars imprimen 'hi'", () => {
    // L4 F5 (boxing, DEV-037): un literal String ya NO es un nativo JS sino un STObject boxed
    // {class:u.String, …, chars:'hi'}; el valor observable por código de usuario es su texto.
    const v = evalSt("'hi'");
    expect(typeof v).toBe("object");
    expect(printString(v)).toBe("hi");
  });

  it("printString sobre bigint usa toString", () => {
    expect(printString(9007199254740993n)).toBe("9007199254740993");
  });
});

describe("L3 · eval · Transcript show: (efecto en buffer)", () => {
  it("Transcript show: 'hi' acumula 'hi' en el buffer", () => {
    const { universe } = evalWith("Transcript show: 'hi'");
    expect(universe.Transcript.pointers[0]).toBe("hi");
  });
});

describe("L3 · send · lookup por la superclass chain", () => {
  it("un selector desconocido NO tiene éxito silencioso (lookup miss observable)", () => {
    expect(() => evalSt("3 frobnicate: 4")).toThrow();
  });
});
