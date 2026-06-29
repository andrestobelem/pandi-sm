/**
 * L4 · F2 · S3 — Float + Character (cierra GATE-F2-NUMBER/ZERODIVIDE/IDENTITY para
 * la familia boxed). Construye sobre S2 (núcleo de la torre): aquí ejercemos la
 * aritmética Float-sobre-Float (no sólo mixta), las comparaciones Float, Float/0 =>
 * ZeroDivide UNIFORME con Integer (§8.2), la evaluación de literales Float (incl. la
 * notación científica `1e3`) y el protocolo Character completo asInteger/value/
 * asCharacter con su round-trip ($a asInteger asCharacter => $a), más la identidad
 * $a == $a (cierra el Character-identity diferido de L2).
 *
 * NUEVO en este slice (origin=ingeniería/dialecto, se flaggea para el log L6):
 *   - Integer>>asCharacter y Character>>asCharacter (round-trip code point <-> Character).
 *     El resto (aritmética/comparación Float, Float/0, literales) ya vive de S2.
 *
 * @section L4.f2-float-character
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F2 · S3 · aritmética Float-sobre-Float", () => {
  it("+ - * / entre Floats producen Float boxed (printString con punto)", () => {
    expect(printString(evalSt("3.0 + 2.0"))).toBe("5.0");
    expect(printString(evalSt("5.0 - 1.5"))).toBe("3.5");
    expect(printString(evalSt("2.0 * 3.0"))).toBe("6.0");
    expect(printString(evalSt("10.0 / 4.0"))).toBe("2.5");
  });

  it("abs y negated sobre Float devuelven Float", () => {
    expect(printString(evalSt("2.5 negated"))).toBe("-2.5");
    expect(printString(evalSt("-2.5 abs"))).toBe("2.5");
    expect(printString(evalSt("2.5 abs"))).toBe("2.5");
  });

  it("comparaciones Float (< <= > >= = ~=) producen Boolean nativo", () => {
    expect(printString(evalSt("3.0 < 4.0"))).toBe("true");
    expect(printString(evalSt("4.0 > 3.0"))).toBe("true");
    expect(printString(evalSt("3.0 <= 3.0"))).toBe("true");
    expect(printString(evalSt("3.0 >= 4.0"))).toBe("false");
    expect(printString(evalSt("3.0 = 3.0"))).toBe("true");
    expect(printString(evalSt("3.0 ~= 3.5"))).toBe("true");
  });

  it("max:/min: sobre Float (derivados de Magnitude vía <)", () => {
    expect(printString(evalSt("3.0 max: 4.5"))).toBe("4.5");
    expect(printString(evalSt("3.0 min: 4.5"))).toBe("3.0");
  });
});

describe("L4 · F2 · S3 · coerción mixta Int<->Float (presencia de Float promueve)", () => {
  it("3 + 2.5 => 5.5 en ambos órdenes", () => {
    expect(printString(evalSt("3 + 2.5"))).toBe("5.5");
    expect(printString(evalSt("2.5 + 3"))).toBe("5.5");
  });

  it("comparación mixta produce Boolean nativo", () => {
    expect(printString(evalSt("3 < 3.5"))).toBe("true");
    expect(printString(evalSt("3.5 < 3"))).toBe("false");
  });
});

describe("L4 · F2 · S3 · evaluación de literales Float", () => {
  it("literal decimal y notación científica colapsan a Float boxed", () => {
    expect(printString(evalSt("3.14"))).toBe("3.14");
    expect(printString(evalSt("1e3"))).toBe("1000.0");
    expect(printString(evalSt("1.5e2"))).toBe("150.0");
    expect(printString(evalSt("3.0 class name"))).toBe("Float");
    // `1e3` es entero en valor pero Float en tipo (notación científica): imprime con punto.
    expect(printString(evalSt("1e3 class name"))).toBe("Float");
  });

  it("Float integral en rango exponencial (|n|>=1e21) NO añade '.0' espurio", () => {
    // Regresión: printFloat hacía `${1e21}.0` => "1e+21.0" (malformado/imparseable).
    // String(1e21) ya es "1e+21"; normalizamos el '+' del exponente a forma Smalltalk.
    expect(printString(evalSt("1e21"))).toBe("1e21");
    expect(printString(evalSt("1e22"))).toBe("1e22");
    expect(printString(evalSt("1.5e300 + 1.5e300"))).toBe("3e300");
    expect(printString(evalSt("1e21 negated"))).toBe("-1e21");
  });
});

describe("L4 · F2 · S3 · GATE-F2-ZERODIVIDE · Float/0 uniforme con Integer (§8.2)", () => {
  it("3.0 / 0 señala ZeroDivide (NO Infinity), capturable por on: ZeroDivide do:", () => {
    expect(printString(evalSt("[3.0 / 0] on: ZeroDivide do: [:e | 99]"))).toBe("99");
  });

  it("3.0 / 0.0 también señala ZeroDivide (divisor Float cero)", () => {
    expect(printString(evalSt("[3.0 / 0.0] on: ZeroDivide do: [:e | 1]"))).toBe("1");
  });

  it("Float/0 capturable por el supertipo ArithmeticError", () => {
    expect(printString(evalSt("[3.0 / 0] on: ArithmeticError do: [:e | 7]"))).toBe("7");
  });

  it("sin handler, Float/0 propaga (NO devuelve un número finito ni Infinity)", () => {
    expect(() => evalSt("3.0 / 0")).toThrow();
  });
});

describe("L4 · F2 · S3 · Character protocolo asInteger/value/asCharacter", () => {
  it("$a asInteger / value => 97 (code point)", () => {
    expect(printString(evalSt("$a asInteger"))).toBe("97");
    expect(printString(evalSt("$a value"))).toBe("97");
    expect(printString(evalSt("$Z asInteger"))).toBe("90");
  });

  it("Integer>>asCharacter => Character con ese code point (NUEVO en S3)", () => {
    expect(printString(evalSt("97 asCharacter"))).toBe("$a");
    expect(printString(evalSt("65 asCharacter"))).toBe("$A");
    expect(printString(evalSt("97 asCharacter class name"))).toBe("Character");
  });

  it("round-trip asInteger <-> asCharacter es identidad de valor", () => {
    // $a asInteger => 97; 97 asCharacter => $a; el == cierra el lazo por code point.
    expect(printString(evalSt("$a asInteger asCharacter"))).toBe("$a");
    expect(printString(evalSt("$a asInteger asCharacter == $a"))).toBe("true");
    // 65 asCharacter asInteger => 65 (vuelta entera).
    expect(printString(evalSt("65 asCharacter asInteger"))).toBe("65");
  });

  it("Character>>asCharacter devuelve self (idempotente, completitud ANSI)", () => {
    expect(printString(evalSt("$a asCharacter"))).toBe("$a");
    expect(printString(evalSt("$a asCharacter == $a"))).toBe("true");
  });

  it("comparación de Character por code point (< <= > >=)", () => {
    expect(printString(evalSt("$a < $b"))).toBe("true");
    expect(printString(evalSt("$b > $a"))).toBe("true");
    expect(printString(evalSt("$a <= $a"))).toBe("true");
    expect(printString(evalSt("$b >= $c"))).toBe("false");
  });
});

describe("L4 · F2 · S3 · GATE-L4-IDENTITY · Character/Float", () => {
  it("$a == $a => true (Character == por code point); $a == $b => false", () => {
    expect(printString(evalSt("$a == $a"))).toBe("true");
    expect(printString(evalSt("$a == $b"))).toBe("false");
  });

  it("$a = $a por valor; identityHash coincide con el code point", () => {
    expect(printString(evalSt("$a = $a"))).toBe("true");
    expect(printString(evalSt("$a identityHash"))).toBe("97");
  });

  it("dos Floats con igual valor son = por valor (Float = por valor)", () => {
    expect(printString(evalSt("3.0 = 3.0"))).toBe("true");
    expect(printString(evalSt("3.0 = 3.5"))).toBe("false");
  });
});
