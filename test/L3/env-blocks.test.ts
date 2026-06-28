/**
 * L3 · env + bloques — entornos léxicos (temporaries, params de bloque, self,
 * globals), AssignmentNode y BlockClosure con value/value:/... (plan §5.3, S1).
 * Los condicionales son sends reales (DEV-003) y los loops son iterativos; aquí
 * sólo se ejercita la maquinaria de scope + cierre + invocación de bloque.
 *
 * @section L3.env-blocks
 * @kind    positive
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L3 · bloques · value / value:", () => {
  it("[:x | x] value: 42 => 42 (aceptación)", () => {
    expect(printString(evalSt("[:x | x] value: 42"))).toBe("42");
  });

  it("[:a :b | a + b] value: 3 value: 4 => 7 (aceptación)", () => {
    expect(printString(evalSt("[:a :b | a + b] value: 3 value: 4"))).toBe("7");
  });

  it("[] value => nil (bloque vacío)", () => {
    expect(printString(evalSt("[] value"))).toBe("nil");
  });

  it("[:a :b :c | a + b + c] value: 1 value: 2 value: 3 => 6", () => {
    expect(printString(evalSt("[:a :b :c | a + b + c] value: 1 value: 2 value: 3"))).toBe("6");
  });
});

describe("L3 · bloques · clausura sobre temporaries", () => {
  it("| t | t := 10. [t] value => 10 (el cierre captura la temporary)", () => {
    expect(printString(evalSt("| t | t := 10. [t] value"))).toBe("10");
  });

  it("| t | t := 1. [:n | t := n] value: 9. t => 9 (mutación compartida por referencia)", () => {
    expect(printString(evalSt("| t | t := 1. [:n | t := n] value: 9. t"))).toBe("9");
  });

  it("bloques anidados capturan el scope externo: [:a | [:b | a + b] value: 5] value: 2 => 7", () => {
    expect(printString(evalSt("[:a | [:b | a + b] value: 5] value: 2"))).toBe("7");
  });
});

describe("L3 · variables · self y globals", () => {
  it("self a nivel de programa resuelve a nil", () => {
    expect(printString(evalSt("self"))).toBe("nil");
  });

  it("el global Transcript sigue resolviendo (sin regresión del skeleton)", () => {
    expect(printString(evalSt("Transcript show: 'hi'"))).toBe("a Transcript class");
  });

  it("una temporary sin asignar arranca en nil", () => {
    expect(printString(evalSt("| t | t"))).toBe("nil");
  });
});

describe("L3 · bloques · errores deterministas", () => {
  it("[:a | a] value (aridad incorrecta) => error determinista", () => {
    expect(() => evalSt("[:a | a] value")).toThrow();
  });

  it("asignar a una variable no declarada => error determinista", () => {
    expect(() => evalSt("noDeclarada := 1")).toThrow();
  });

  it("una variable libre no resoluble => error", () => {
    expect(() => evalSt("noExiste")).toThrow();
  });
});
