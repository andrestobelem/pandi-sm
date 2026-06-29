/**
 * L3 · Boolean — clases True/False, valores nativos true/false (classOf los mapea),
 * condicionales como SENDS REALES (ifTrue:/ifFalse:/ifTrue:ifFalse:/ifFalse:ifTrue:/
 * and:/or:/not, DEV-003: receptor no-Boolean => doesNotUnderstand:) y comparaciones
 * de SmallInteger (< > <= >= = ~=) que devuelven true/false (plan §5.3, S2).
 *
 * @section L3.boolean
 * @kind    positive
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { evalWith } from "../../src/eval/eval.js";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L3 · condicionales · ifTrue:ifFalse: (sends reales)", () => {
  it("true ifTrue: [1] ifFalse: [2] => 1 (aceptación)", () => {
    expect(printString(evalSt("true ifTrue: [1] ifFalse: [2]"))).toBe("1");
  });

  it("false ifTrue: [1] ifFalse: [2] => 2 (aceptación)", () => {
    expect(printString(evalSt("false ifTrue: [1] ifFalse: [2]"))).toBe("2");
  });

  it("true ifTrue: [42] => 42; false ifTrue: [42] => nil", () => {
    expect(printString(evalSt("true ifTrue: [42]"))).toBe("42");
    expect(printString(evalSt("false ifTrue: [42]"))).toBe("nil");
  });

  it("false ifFalse: [7] => 7; true ifFalse: [7] => nil", () => {
    expect(printString(evalSt("false ifFalse: [7]"))).toBe("7");
    expect(printString(evalSt("true ifFalse: [7]"))).toBe("nil");
  });

  it("false ifFalse: [1] ifTrue: [2] => 1; true ifFalse: [1] ifTrue: [2] => 2", () => {
    expect(printString(evalSt("false ifFalse: [1] ifTrue: [2]"))).toBe("1");
    expect(printString(evalSt("true ifFalse: [1] ifTrue: [2]"))).toBe("2");
  });
});

describe("L3 · condicionales · and: / or: (cortocircuito)", () => {
  it("true and: [false] => false; false or: [true] => true", () => {
    expect(printString(evalSt("true and: [false]"))).toBe("false");
    expect(printString(evalSt("false or: [true]"))).toBe("true");
  });

  it("true and: [true] => true; false or: [false] => false", () => {
    expect(printString(evalSt("true and: [true]"))).toBe("true");
    expect(printString(evalSt("false or: [false]"))).toBe("false");
  });

  it("laziness: false and: [Transcript show: 'x'. true] NO ejecuta el bloque", () => {
    const { value, universe } = evalWith("false and: [Transcript show: 'x'. true]");
    expect(printString(value)).toBe("false");
    expect(universe.Transcript.pointers[0] ?? "").toBe("");
  });

  it("laziness: true or: [Transcript show: 'x'. false] NO ejecuta el bloque", () => {
    const { value, universe } = evalWith("true or: [Transcript show: 'x'. false]");
    expect(printString(value)).toBe("true");
    expect(universe.Transcript.pointers[0] ?? "").toBe("");
  });
});

describe("L3 · condicionales · not", () => {
  it("true not => false; false not => true", () => {
    expect(printString(evalSt("true not"))).toBe("false");
    expect(printString(evalSt("false not"))).toBe("true");
  });
});

describe("L3 · comparaciones · SmallInteger devuelve true/false", () => {
  it("3 > 2 => true; 2 > 3 => false (aceptación)", () => {
    expect(printString(evalSt("3 > 2"))).toBe("true");
    expect(printString(evalSt("2 > 3"))).toBe("false");
  });

  it("2 < 3 => true; 3 < 2 => false", () => {
    expect(printString(evalSt("2 < 3"))).toBe("true");
    expect(printString(evalSt("3 < 2"))).toBe("false");
  });

  it("3 = 3 => true; 3 ~= 3 => false; 3 ~= 4 => true", () => {
    expect(printString(evalSt("3 = 3"))).toBe("true");
    expect(printString(evalSt("3 ~= 3"))).toBe("false");
    expect(printString(evalSt("3 ~= 4"))).toBe("true");
  });

  it("3 <= 3 => true; 4 <= 3 => false; 3 >= 4 => false; 4 >= 4 => true", () => {
    expect(printString(evalSt("3 <= 3"))).toBe("true");
    expect(printString(evalSt("4 <= 3"))).toBe("false");
    expect(printString(evalSt("3 >= 4"))).toBe("false");
    expect(printString(evalSt("4 >= 4"))).toBe("true");
  });

  it("una comparación compone con un condicional: (3 > 2) ifTrue: [10] ifFalse: [20] => 10", () => {
    expect(printString(evalSt("(3 > 2) ifTrue: [10] ifFalse: [20]"))).toBe("10");
  });
});

describe("L3 · DEV-003 · condicionales son sends reales (no inlining)", () => {
  it("3 ifTrue: [1] => doesNotUnderstand: (receptor no-Boolean prueba que NO hay inlining)", () => {
    expect(() => evalSt("3 ifTrue: [1]")).toThrow(/doesNotUnderstand/);
  });

  it("nil ifTrue: [1] ifFalse: [2] => doesNotUnderstand: (UndefinedObject no es Boolean)", () => {
    expect(() => evalSt("nil ifTrue: [1] ifFalse: [2]")).toThrow(/doesNotUnderstand/);
  });
});

describe("L3 · classOf · true/false mapean a True/False", () => {
  it("true es instancia de True (responde a su propio ifTrue:)", () => {
    // Si classOf no mapeara boolean a True/False, el send caería a Object y daría dNU.
    expect(printString(evalSt("true ifTrue: ['si'] ifFalse: ['no']"))).toBe("si");
  });
});
