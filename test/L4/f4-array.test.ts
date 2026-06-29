/**
 * L4 · F4 · S1 — instSize acumulativo (DEV-025) + Array concreto + literales de
 * array. Primer slice de la base de colecciones (plan §5.4 F4): Array boxed (campo
 * dedicado `elements`), at:/at:put:/size 1-based, at: fuera de rango => SEÑALA Error
 * (máquina L5, capturable por on:do:), classOf(Array)===Array, printString, y los
 * tres constructores de superficie { } / #( ) / #[ ] -> Array.
 *
 * DEV-025: instSize debe ser ACUMULATIVO en la cadena (own + superclass.instSize) en
 * AMBOS caminos: el keyword-send (Object subclass: ... instanceVariableNames:) y el
 * cargador .st. Observable indirectamente vía instVarAt:/instVarAt:put: en el índice
 * heredado (un B<A con 1 ivar cada uno acepta instVarAt:put: en el índice 2).
 *
 * @section L4.f4-array
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F4 · S1 · DEV-025 instSize acumulativo", () => {
  it("subclase 2-deep (A ivar x; B<A ivar y) tiene instSize 2 (keyword-send)", () => {
    // B instance: 2 slots (1 heredado de A + 1 propio). instVarAt:put: 2 funciona;
    // si instSize fuese no-acumulativo (=1), el índice 2 caería fuera de rango.
    const src = `
      | b |
      Object subclass: #A instanceVariableNames: 'x' classVariableNames: '' package: 'T'.
      A subclass: #B instanceVariableNames: 'y' classVariableNames: '' package: 'T'.
      b := B new.
      b instVarAt: 2 put: 42.
      b instVarAt: 2`;
    expect(printString(evalSt(src))).toBe("42");
  });

  it("instVarAt: en el slot HEREDADO (índice 1) también responde", () => {
    const src = `
      | b |
      Object subclass: #A2 instanceVariableNames: 'x' classVariableNames: '' package: 'T'.
      A2 subclass: #B2 instanceVariableNames: 'y' classVariableNames: '' package: 'T'.
      b := B2 new.
      b instVarAt: 1 put: 7.
      b instVarAt: 1`;
    expect(printString(evalSt(src))).toBe("7");
  });
});

describe("L4 · F4 · S1 · Array literal de superficie", () => {
  it("{ 1. 2. 3 } evalúa a un Array con elementos evaluados", () => {
    expect(printString(evalSt("{ 1. 2. 3 }"))).toBe("#(1 2 3)");
  });

  it("{ } evalúa los elementos como EXPRESIONES (no literales)", () => {
    expect(printString(evalSt("{ 1 + 1. 2 * 3 }"))).toBe("#(2 6)");
  });

  it("#(1 2 3) literal de array evalúa a un Array", () => {
    expect(printString(evalSt("#(1 2 3)"))).toBe("#(1 2 3)");
  });

  it("#(1 #(2 3)) array literal anidado evalúa a un Array de Arrays", () => {
    expect(printString(evalSt("#(1 #(2 3))"))).toBe("#(1 #(2 3))");
  });

  it("#[1 2 3] byteArray literal evalúa a un Array de SmallIntegers (MVP)", () => {
    expect(printString(evalSt("#[1 2 3]"))).toBe("#(1 2 3)");
  });

  it("classOf de un Array es Array (identidad con el global Array)", () => {
    expect(printString(evalSt("{ 1. 2 } class == Array"))).toBe("true");
  });

  it("un Array es kindOf SequenceableCollection y Collection", () => {
    expect(printString(evalSt("{ 1 } isKindOf: SequenceableCollection"))).toBe("true");
    expect(printString(evalSt("{ 1 } isKindOf: Collection"))).toBe("true");
  });

  it("printString de un Array vacío", () => {
    expect(printString(evalSt("{ }"))).toBe("#()");
  });
});

describe("L4 · F4 · S1 · Array at:/at:put:/size (1-based)", () => {
  it("size devuelve la cantidad de elementos", () => {
    expect(printString(evalSt("{ 10. 20. 30 } size"))).toBe("3");
    expect(printString(evalSt("{ } size"))).toBe("0");
  });

  it("at: es 1-based (at: 1 es el primero)", () => {
    expect(printString(evalSt("{ 10. 20. 30 } at: 1"))).toBe("10");
    expect(printString(evalSt("{ 10. 20. 30 } at: 3"))).toBe("30");
  });

  it("at:put: muta el slot y devuelve el valor escrito (1-based)", () => {
    const src = `
      | a |
      a := { 10. 20. 30 }.
      a at: 2 put: 99.
      a at: 2`;
    expect(printString(evalSt(src))).toBe("99");
  });

  it("at:put: devuelve el valor escrito", () => {
    expect(printString(evalSt("{ 1. 2. 3 } at: 1 put: 5"))).toBe("5");
  });
});

describe("L4 · F4 · S1 · first/last derivados (.st, en términos de at:/size)", () => {
  it("first es at: 1 (1-based)", () => {
    expect(printString(evalSt("{ 7. 8. 9 } first"))).toBe("7");
  });

  it("last es at: self size", () => {
    expect(printString(evalSt("{ 7. 8. 9 } last"))).toBe("9");
  });
});

describe("L4 · F4 · S1 · Array at: fuera de rango SEÑALA Error (capturable)", () => {
  it("at: 0 señala un Error capturable por on:do:", () => {
    const src = `[ { 10. 20 } at: 0 ] on: Error do: [:e | #fuera ]`;
    expect(printString(evalSt(src))).toBe("#fuera");
  });

  it("at: size+1 señala un Error capturable por on:do:", () => {
    const src = `[ { 10. 20 } at: 3 ] on: Error do: [:e | #fuera ]`;
    expect(printString(evalSt(src))).toBe("#fuera");
  });

  it("at:put: fuera de rango señala un Error capturable", () => {
    const src = `[ { 10. 20 } at: 5 put: 1 ] on: Error do: [:e | #fuera ]`;
    expect(printString(evalSt(src))).toBe("#fuera");
  });
});

describe("L4 · F4 · S1 · regresión: bucles literales siguen funcionando", () => {
  it("(1 to: 5 do: [:i | ...]) sigue iterando", () => {
    const src = `
      | sum |
      sum := 0.
      1 to: 5 do: [:i | sum := sum + i].
      sum`;
    expect(printString(evalSt(src))).toBe("15");
  });
});
