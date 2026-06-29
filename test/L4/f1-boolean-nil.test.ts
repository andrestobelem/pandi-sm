/**
 * L4 · F1 — extensión Boolean/nil (GATE-F1-BOOLEAN-EXT, GATE-L4-NO-INLINING).
 * NUEVO en este slice (origin=ingeniería/dialecto, se flaggea para el log L6):
 *   - Boolean EAGER: & | xor: (el argumento es un Boolean YA evaluado, NO un
 *     bloque — son los primos no-cortocircuito de and:/or:). xor: = receiver ~= arg.
 *   - UndefinedObject/Object: ifNil: / ifNotNil: / ifNil:ifNotNil: / ifNotNil:ifNil:.
 * NOTA léxica (DRIFT/desviación): un `|` aislado lexea como `verticalBar` (R10), no
 * como binarySelector, así que `true | false` NO es expresable como envío de
 * superficie; el selector `|` se instala igual y se ejercita vía send() directo.
 * GATE-L4-NO-INLINING: & | xor: viven en True/False.methodDict, así un receptor
 * no-Boolean cae a doesNotUnderstand: (no se inlinea).
 *
 * @section L4.f1-boolean-nil
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { evalWith } from "../../src/eval/eval.js";
import { eval as evalSt, printString, send } from "../../src/eval/index.js";

describe("L4 · F1 · GATE-F1-BOOLEAN-EXT · & (and eager, no cortocircuito)", () => {
  it("positivo 1 — true & true => true; true & false => false", () => {
    expect(printString(evalSt("true & true"))).toBe("true");
    expect(printString(evalSt("true & false"))).toBe("false");
  });

  it("positivo 2 — false & true => false; false & false => false", () => {
    expect(printString(evalSt("false & true"))).toBe("false");
    expect(printString(evalSt("false & false"))).toBe("false");
  });

  it("& es EAGER: el argumento es un Boolean ya evaluado (composición con comparación)", () => {
    expect(printString(evalSt("(3 < 4) & (2 < 1)"))).toBe("false");
    expect(printString(evalSt("(3 < 4) & (1 < 2)"))).toBe("true");
  });
});

describe("L4 · F1 · GATE-F1-BOOLEAN-EXT · xor:", () => {
  it("positivo 3 — true xor: false => true; true xor: true => false", () => {
    expect(printString(evalSt("true xor: false"))).toBe("true");
    expect(printString(evalSt("true xor: true"))).toBe("false");
  });

  it("positivo 4 — false xor: true => true; false xor: false => false", () => {
    expect(printString(evalSt("false xor: true"))).toBe("true");
    expect(printString(evalSt("false xor: false"))).toBe("false");
  });
});

describe("L4 · F1 · GATE-F1-BOOLEAN-EXT · | (or eager) vía send (no expresable en superficie)", () => {
  it("positivo 5 — true | false => true; false | false => false (EAGER, vía send)", () => {
    const { universe } = evalWith("nil");
    expect(printString(send(true, "|", [false], universe))).toBe("true");
    expect(printString(send(false, "|", [false], universe))).toBe("false");
  });

  it("positivo 6 — false | true => true; true | true => true (vía send)", () => {
    const { universe } = evalWith("nil");
    expect(printString(send(false, "|", [true], universe))).toBe("true");
    expect(printString(send(true, "|", [true], universe))).toBe("true");
  });
});

describe("L4 · F1 · GATE-F1-BOOLEAN-EXT · negativo (no-inlining de los nuevos)", () => {
  it("negativo — 3 & true => doesNotUnderstand: (& vive en True/False, no se inlinea)", () => {
    expect(() => evalSt("3 & true")).toThrow(/doesNotUnderstand/);
  });

  it("negativo — nil xor: true => doesNotUnderstand: (UndefinedObject no es Boolean)", () => {
    expect(() => evalSt("nil xor: true")).toThrow(/doesNotUnderstand/);
  });
});

describe("L4 · F1 · UndefinedObject ifNil:/ifNotNil: (extensión nil)", () => {
  it("nil ifNil: [42] => 42; 5 ifNil: [42] => 5 (Object>>ifNil: devuelve self)", () => {
    expect(printString(evalSt("nil ifNil: [42]"))).toBe("42");
    expect(printString(evalSt("5 ifNil: [42]"))).toBe("5");
  });

  it("nil ifNotNil: [99] => nil; 5 ifNotNil: [99] => 99", () => {
    expect(printString(evalSt("nil ifNotNil: [99]"))).toBe("nil");
    expect(printString(evalSt("5 ifNotNil: [99]"))).toBe("99");
  });

  it("nil ifNil: [1] ifNotNil: [2] => 1; 5 ifNil: [1] ifNotNil: [2] => 2", () => {
    expect(printString(evalSt("nil ifNil: [1] ifNotNil: [2]"))).toBe("1");
    expect(printString(evalSt("5 ifNil: [1] ifNotNil: [2]"))).toBe("2");
  });

  it("nil ifNotNil: [1] ifNil: [2] => 2; 5 ifNotNil: [1] ifNil: [2] => 1", () => {
    expect(printString(evalSt("nil ifNotNil: [1] ifNil: [2]"))).toBe("2");
    expect(printString(evalSt("5 ifNotNil: [1] ifNil: [2]"))).toBe("1");
  });

  it("laziness: la rama NO tomada de ifNil: no se evalúa", () => {
    const { value, universe } = evalWith("5 ifNil: [Transcript show: 'x'. 0]");
    expect(printString(value)).toBe("5");
    expect(universe.Transcript.pointers[0] ?? "").toBe("");
  });
});

describe("L4 · F1 · GATE-L4-NO-INLINING (sigue valiendo)", () => {
  it("3 ifTrue: [1] => doesNotUnderstand: (condicional pre-existente, no inline)", () => {
    expect(() => evalSt("3 ifTrue: [1]")).toThrow(/doesNotUnderstand/);
  });
});
