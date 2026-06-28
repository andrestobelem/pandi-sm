/**
 * L3 · bucles + non-local return + doesNotUnderstand: (S3, plan §5.3.1).
 * Bucles como SPECIAL-FORMS ITERATIVAS (whileTrue:/whileFalse:/to:do:/to:by:do:/
 * timesRepeat: vía to:do:, DEV-004): un `while`/`for` de JS reusa el frame, sin
 * recursión por iteración. `^` dentro de un bloque lanza un NonLocalReturn PLANO
 * (no extends Error, plan §2/V8-2) que desenrolla al home capturado. Un envío que
 * no encuentra método llama a Object>>doesNotUnderstand:, observable y determinista.
 * SmallInteger>>- se añade aquí (lo que el control-flow de cuentas-atrás necesita).
 *
 * @section L3.loops-return-dnu
 * @kind    positive
 * @layer   L3
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L3 · SmallInteger>>- (resta, para cuentas atrás)", () => {
  it("5 - 3 => 2; 3 - 5 => -2", () => {
    expect(printString(evalSt("5 - 3"))).toBe("2");
    expect(printString(evalSt("3 - 5"))).toBe("-2");
  });
});

describe("L3 · to:do: (special-form iterativa)", () => {
  it("| sum | sum := 0. 1 to: 5 do: [:i | sum := sum + i]. sum => 15 (aceptación)", () => {
    expect(printString(evalSt("| sum | sum := 0. 1 to: 5 do: [:i | sum := sum + i]. sum"))).toBe(
      "15",
    );
  });

  it("rango vacío (1 to: 0 do:) no ejecuta el cuerpo", () => {
    expect(printString(evalSt("| n | n := 0. 1 to: 0 do: [:i | n := n + 1]. n"))).toBe("0");
  });
});

describe("L3 · to:by:do: (paso, incluso negativo)", () => {
  it("to:by:do: con paso negativo cuenta hacia atrás", () => {
    expect(printString(evalSt("| s | s := 0. 5 to: 1 by: -1 do: [:i | s := s + i]. s"))).toBe("15");
  });

  it("to:by:do: con paso positivo > 1 salta", () => {
    expect(printString(evalSt("| s | s := 0. 1 to: 10 by: 2 do: [:i | s := s + i]. s"))).toBe("25");
  });
});

describe("L3 · whileTrue: / whileFalse: (special-form iterativa)", () => {
  it("| x | x := 3. [x > 0] whileTrue: [x := x - 1]. x => 0 (aceptación)", () => {
    expect(printString(evalSt("| x | x := 3. [x > 0] whileTrue: [x := x - 1]. x"))).toBe("0");
  });

  it("whileFalse: itera mientras la condición sea false", () => {
    expect(printString(evalSt("| x | x := 0. [x >= 3] whileFalse: [x := x + 1]. x"))).toBe("3");
  });

  it("truthy señala: condición no-Boolean en whileTrue: => doesNotUnderstand: (no bucle infinito)", () => {
    expect(() => evalSt("[42] whileTrue: [1]")).toThrow(/doesNotUnderstand/);
  });
});

describe("L3 · timesRepeat: (DEV-004, vía to:do:)", () => {
  it("| n | n := 0. 3 timesRepeat: [n := n + 1]. n => 3", () => {
    expect(printString(evalSt("| n | n := 0. 3 timesRepeat: [n := n + 1]. n"))).toBe("3");
  });

  it("0 timesRepeat: no ejecuta el cuerpo", () => {
    expect(printString(evalSt("| n | n := 7. 0 timesRepeat: [n := n + 1]. n"))).toBe("7");
  });
});

describe("L3 · non-local return (^ desde un bloque desenrolla al home)", () => {
  it("(1 to: 9 do: [:i | i = 4 ifTrue: [^i]]) => 4 (aceptación)", () => {
    expect(printString(evalSt("1 to: 9 do: [:i | i = 4 ifTrue: [^i]]"))).toBe("4");
  });

  it("^ a través de whileTrue: desenrolla al programa", () => {
    expect(
      printString(evalSt("| x | x := 0. [true] whileTrue: [x := x + 1. x = 3 ifTrue: [^x]]")),
    ).toBe("3");
  });

  it("^ dentro de un bloque value desenrolla al programa, no devuelve el valor del bloque", () => {
    // El segundo statement (99) NO debe alcanzarse: el ^ corta el programa entero.
    expect(printString(evalSt("[^7] value. 99"))).toBe("7");
  });

  it("^ a tope de programa (sin bloque) sigue dando el valor de la expresión", () => {
    expect(printString(evalSt("^ 5"))).toBe("5");
  });
});

describe("L3 · Object>>doesNotUnderstand: (miss observable y determinista)", () => {
  it("5 fooBar => doesNotUnderstand: (aceptación)", () => {
    expect(() => evalSt("5 fooBar")).toThrow(/doesNotUnderstand/);
  });

  it("nil zork: 1 => doesNotUnderstand: (selector con argumento)", () => {
    expect(() => evalSt("nil zork: 1")).toThrow(/doesNotUnderstand/);
  });

  it("el error de dNU es determinista: nombra el selector ausente", () => {
    expect(() => evalSt("5 fooBar")).toThrow(/fooBar/);
  });
});
