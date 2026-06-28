/**
 * L1 · Lexer slice 2 — números: decimalInteger (+BigInt), radix, float (e/d/q),
 * scaledDecimal, y la regla del `-` negativo por posición (R2, CORR-1). TDD.
 *
 * @section L1.lexer.slice2
 * @kind    positive+negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/lexer/index.js";
import type { Token } from "../../src/lexer/index.js";

const types = (src: string): string[] => tokenize(src).tokens.map((t) => t.type);
const lexemes = (src: string): string[] => tokenize(src).tokens.map((t) => t.lexeme);
const first = (src: string): Token => {
  const t = tokenize(src).tokens[0];
  if (t === undefined) throw new Error("sin tokens");
  return t;
};
const codes = (src: string): string[] => tokenize(src).errors.map((e) => e.code);

describe("L1 · lexer slice 2 — decimal + BigInt (R4)", () => {
  it("entero decimal simple (regresión slice1)", () => {
    expect(first("42").value).toBe(42);
    expect(first("42").numKind).toBe("integer");
    expect(typeof first("42").value).toBe("number");
  });

  it("promueve a BigInt por magnitud", () => {
    expect(first("9007199254740991").value).toBe(9007199254740991);
    expect(first("9007199254740993").value).toBe(9007199254740993n);
    expect(typeof first("9007199254740993").value).toBe("bigint");
  });
});

describe("L1 · lexer slice 2 — negativo por posición (R2 / CORR-1)", () => {
  it("`-` en posición de operando inicia literal negativo", () => {
    expect(types("x := -5")).toEqual(["identifier", "assignmentOperator", "number", "eof"]);
    expect(tokenize("x := -5").tokens[2]?.value).toBe(-5);
    expect(tokenize("(-4)").tokens.map((t) => t.type)).toEqual(["lparen", "number", "rparen", "eof"]);
    expect(tokenize("(-4)").tokens[1]?.value).toBe(-4);
  });

  it("`-` tras valor es binarySelector (maximal munch)", () => {
    // 3 -4: token previo (3) es valor => `-` binario
    expect(types("3 -4")).toEqual(["number", "binarySelector", "number", "eof"]);
    expect(lexemes("3 -4")).toEqual(["3", "-", "4", ""]);
    // 3-4
    expect(types("3-4")).toEqual(["number", "binarySelector", "number", "eof"]);
  });

  it("CORR-1 diferencial: `3 --4` vs `3 - -4` (sin E_NEG_NO_SPACE)", () => {
    expect(types("3 --4")).toEqual(["number", "binarySelector", "number", "eof"]);
    expect(lexemes("3 --4")).toEqual(["3", "--", "4", ""]);
    expect(codes("3 --4")).toEqual([]);
    // `3 - -4`: el segundo `-` está en posición de operando (tras binarySelector)
    expect(types("3 - -4")).toEqual(["number", "binarySelector", "number", "eof"]);
    expect(tokenize("3 - -4").tokens[2]?.value).toBe(-4);
  });

  it("negativo grande promueve a BigInt con signo", () => {
    expect(first("-9007199254740993").value).toBe(-9007199254740993n);
    // garantiza que `-` al inicio del input es operando
    expect(first("-5").value).toBe(-5);
  });
});

describe("L1 · lexer slice 2 — radix (R4)", () => {
  it("radix básico", () => {
    expect(first("16rFF").value).toBe(255);
    expect(first("16rFF").numKind).toBe("integer");
    expect(first("2r1010").value).toBe(10);
    expect(first("36rZ").value).toBe(35);
  });

  it("radix grande degrada/promueve por magnitud", () => {
    expect(first("16rFFFFFFFFFFFFFFFF").value).toBe(0xffffffffffffffffn);
    expect(typeof first("16rFFFFFFFFFFFFFFFF").value).toBe("bigint");
  });

  it("errores de radix", () => {
    expect(codes("1r0")).toEqual(["E_RADIX_BASE"]);
    expect(codes("37r0")).toEqual(["E_RADIX_BASE"]);
    expect(codes("2r2")).toEqual(["E_RADIX_DIGIT"]);
    expect(codes("16r")).toEqual(["E_RADIX_NO_DIGITS"]);
  });

  it("maximal-munch: un alnum ≥ base TERMINA el radix (no es error) si ya hay ≥1 dígito", () => {
    // `10r5e3`: `e`(=14) ≥ 10 cierra el radix `10r5` (=5); luego `e3` es identifier.
    expect(types("10r5e3")).toEqual(["number", "identifier", "eof"]);
    expect(lexemes("10r5e3")).toEqual(["10r5", "e3", ""]);
    expect(first("10r5e3").value).toBe(5);
    expect(first("10r5e3").numKind).toBe("integer");
    expect(codes("10r5e3")).toEqual([]);

    // `16rFs2`: `s`(=28) ≥ 16 cierra el radix `16rF` (=15); luego `s2`.
    expect(first("16rFs2").lexeme).toBe("16rF");
    expect(first("16rFs2").value).toBe(15);
    expect(first("16rFs2").numKind).toBe("integer");
    expect(codes("16rFs2")).toEqual([]);

    // `16rFe2`: `e`(=14) < 16 SÍ es dígito hex válido => 16rFe2 = 4066 (un solo número).
    expect(first("16rFe2").value).toBe(4066);
    expect(first("16rFe2").numKind).toBe("integer");
    expect(lexemes("16rFe2")).toEqual(["16rFe2", ""]);
    expect(codes("16rFe2")).toEqual([]);

    // `16rG`: `G`(=16) ≥ 16 SIN dígito previo => sigue siendo error (count===0).
    expect(codes("16rG")).toEqual(["E_RADIX_DIGIT"]);
  });
});

describe("L1 · lexer slice 2 — float (R4/R7)", () => {
  it("fracción simple", () => {
    expect(first("3.14").value).toBe(3.14);
    expect(first("3.14").numKind).toBe("float");
  });

  it("`1.e5` NO es float: `.` sin dígito siguiente", () => {
    expect(types("1.e5")).toEqual(["number", "period", "identifier", "eof"]);
    expect(tokenize("1.e5").tokens[0]?.value).toBe(1);
  });

  it("exponente y floatKind", () => {
    expect(first("1.5e2").value).toBe(150);
    expect(first("1.5e2").floatKind).toBe("e");
    expect(first("1.5d2").floatKind).toBe("d");
    expect(first("1.5d2").value).toBe(150);
    expect(first("2.0q3").floatKind).toBe("q");
    expect(first("2.0q3").value).toBe(2000);
    expect(first("1e10").numKind).toBe("float");
    expect(first("1e10").floatKind).toBe("e");
  });

  it("backtrack de exponente (R7): letra sin `[+-]?digit` no se consume", () => {
    expect(types("1.5e")).toEqual(["number", "identifier", "eof"]);
    expect(tokenize("1.5e").tokens[0]?.value).toBe(1.5);
    expect(lexemes("1.5e")).toEqual(["1.5", "e", ""]);
    expect(types("2eX")).toEqual(["number", "identifier", "eof"]);
    expect(tokenize("2eX").tokens[0]?.value).toBe(2);
  });

  it("exponente malformado (R7): `1.5e+` y `1e-`", () => {
    expect(codes("1.5e+")).toEqual(["E_EXPONENT_MALFORMED"]);
    expect(codes("1e-")).toEqual(["E_EXPONENT_MALFORMED"]);
  });
});

describe("L1 · lexer slice 2 — scaledDecimal (R4 / DEV-011)", () => {
  it("mantissa string + scale; nunca E_SCALED_*", () => {
    expect(first("123s").numKind).toBe("scaledDecimal");
    expect(first("123s").value).toBe("123");
    expect(first("123s2").value).toBe("123");
    expect(first("123s2").scale).toBe(2);
    expect(first("1.5s2").value).toBe("1.5");
    expect(first("1.5s2").scale).toBe(2);
    expect(codes("1.5s2")).toEqual([]);
  });
});

describe("L1 · lexer slice 2 — determinismo", () => {
  it("mismo input malformado => mismos errores", () => {
    expect(tokenize("1.5e+").errors).toEqual(tokenize("1.5e+").errors);
  });
});
