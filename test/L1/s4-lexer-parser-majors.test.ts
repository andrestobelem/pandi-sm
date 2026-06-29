/**
 * L1 · S4 lexer+parser majors — regresiones para los hallazgos #14, #15, #17, #18, #19.
 * TDD: cada describe reproduce el bug (RED antes del fix, GREEN después).
 *
 * @section L1.s4-regressions
 * @kind    negative+positive
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/lexer/index.js";
import type { ParseError } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

const types = (src: string): string[] => tokenize(src).tokens.map((t) => t.type);
const codes = (src: string): string[] => tokenize(src).errors.map((e) => e.code);
const pcodes = (src: string): string[] => parse(src).errors.map((e) => (e as ParseError).code);

// ---------------------------------------------------------------------------
// #14 · Byte-range check silently skips bigint values in #[...]
// ---------------------------------------------------------------------------
describe("S4 · #14 · byte-range: bigint fuera de [0,255] debe emitir E_BYTE_RANGE", () => {
  it("NEGATIVO: '#[16rFFFFFFFFFFFFFFFF]' debe emitir E_BYTE_RANGE (bigint > 255)", () => {
    // 16rFFFFFFFFFFFFFFFF = 18446744073709551615n — claramente > 255.
    // Antes del fix: typeof t.value === 'number' es false para bigint => se omite el check.
    const r = parse("#[16rFFFFFFFFFFFFFFFF]");
    const cs = r.errors.map((e) => (e as ParseError).code);
    expect(cs).toContain("E_BYTE_RANGE");
  });

  it("NEGATIVO: '#[300]' sigue emitiendo E_BYTE_RANGE (número normal, regresión)", () => {
    // Regresión: el check para numbers normales sigue funcionando.
    const r = parse("#[300]");
    const cs = r.errors.map((e) => (e as ParseError).code);
    expect(cs).toContain("E_BYTE_RANGE");
  });

  it("POSITIVO: '#[255]' no produce error (límite superior exacto)", () => {
    const r = parse("#[255]");
    expect(r.errors).toEqual([]);
  });

  it("POSITIVO: '#[0]' no produce error (límite inferior exacto)", () => {
    const r = parse("#[0]");
    expect(r.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #15 · parseArrayElement default branch inserts phantom AST node on error
// ---------------------------------------------------------------------------
describe("S4 · #15 · phantom AST node: token inesperado en literalArray no debe insertarse", () => {
  it("NEGATIVO: '#( ] )' debe producir E_UNEXPECTED_TOKEN pero cero elementos en el array", () => {
    // Antes del fix: parseArrayElement retorna symbolLiteral(bad) y parseLiteralArray lo
    // empuja => el array termina con un elemento bogus con valor ']'.
    const r = parse("#( ] )");
    const cs = r.errors.map((e) => (e as ParseError).code);
    expect(cs).toContain("E_UNEXPECTED_TOKEN");
    // El nodo raíz debe ser un array vacío (el ']' no debe aparecer como elemento).
    const stmt = r.ast?.body.statements[0];
    expect(stmt?.type).toBe("Literal");
    if (stmt?.type === "Literal") {
      expect(stmt.lit).toBe("array");
      expect(stmt.elements).toHaveLength(0);
    }
  });

  it("POSITIVO: '#(1 2)' normal — sin error, dos elementos", () => {
    const r = parse("#(1 2)");
    expect(r.errors).toEqual([]);
    const stmt = r.ast?.body.statements[0];
    expect(stmt?.type).toBe("Literal");
    if (stmt?.type === "Literal") {
      expect(stmt.elements).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// #17 · scanRadix: base < 2 swallows subsequent identifier tokens
// ---------------------------------------------------------------------------
describe("S4 · #17 · scanRadix base<2: tokens posteriores no deben perderse", () => {
  it("NEGATIVO: '1rFoo x' — E_RADIX_BASE y 'x' debe aparecer como identifier aparte", () => {
    // Antes del fix: la guard 'base >= 2n' cortocircuita la check de dígito-rango
    // => 'Foo' se consume como dígitos del radix erróneo => 'x' se pierde.
    const result = tokenize("1rFoo x");
    const cs = result.errors.map((e) => e.code);
    expect(cs).toContain("E_RADIX_BASE");
    // 'x' debe estar en los tokens (no consumido por el radix inválido).
    const ts = result.tokens.map((t) => t.type);
    expect(ts).toContain("identifier");
    const ids = result.tokens.filter((t) => t.type === "identifier");
    expect(ids.some((t) => t.lexeme === "x")).toBe(true);
  });

  it("POSITIVO regresión: '1r0' -> E_RADIX_BASE (base=1 < 2)", () => {
    expect(codes("1r0")).toEqual(["E_RADIX_BASE"]);
  });

  it("POSITIVO regresión: '37r0' -> E_RADIX_BASE (base=37 > 36)", () => {
    expect(codes("37r0")).toEqual(["E_RADIX_BASE"]);
  });

  it("POSITIVO regresión: '2r2' -> E_RADIX_DIGIT (dígito ≥ base, con dígitos previos: break)", () => {
    expect(codes("2r2")).toEqual(["E_RADIX_DIGIT"]);
  });

  it("POSITIVO regresión: '16rG' -> E_RADIX_DIGIT (dígito ≥ base sin previo)", () => {
    expect(codes("16rG")).toEqual(["E_RADIX_DIGIT"]);
  });

  it("POSITIVO regresión: '16r' -> E_RADIX_NO_DIGITS", () => {
    expect(codes("16r")).toEqual(["E_RADIX_NO_DIGITS"]);
  });
});

// ---------------------------------------------------------------------------
// #18 · E_EXPONENT_MALFORMED drops the already-scanned integer/float mantissa
// ---------------------------------------------------------------------------
describe("S4 · #18 · exponente malformado: la mantissa ya escaneada debe emitirse como token", () => {
  it("NEGATIVO: tokenize('1e+x') debe emitir un token number '1' además de E_EXPONENT_MALFORMED", () => {
    // Antes del fix: la rama E_EXPONENT_MALFORMED hace 'return' sin emitir ningún token;
    // '1e+' consume el '1', '+' y retorna vacío. Solo queda el identifier 'x' y eof.
    const result = tokenize("1e+x");
    const cs = result.errors.map((e) => e.code);
    expect(cs).toContain("E_EXPONENT_MALFORMED");
    // Debe haber un token numérico para '1'.
    const numTokens = result.tokens.filter((t) => t.type === "number");
    expect(numTokens.length).toBeGreaterThanOrEqual(1);
    expect(numTokens[0]?.value).toBe(1);
  });

  it("NEGATIVO: tokenize('1.5e+') debe emitir un token float '1.5' además del error", () => {
    const result = tokenize("1.5e+");
    const cs = result.errors.map((e) => e.code);
    expect(cs).toContain("E_EXPONENT_MALFORMED");
    const numTokens = result.tokens.filter((t) => t.type === "number");
    expect(numTokens.length).toBeGreaterThanOrEqual(1);
    // La mantissa '1.5' debe estar presente.
    const firstNum = numTokens[0];
    expect(firstNum).toBeDefined();
    // El token tiene value 1.5 (float) o el lexema correcto.
    expect(firstNum?.lexeme).toMatch(/^1\.5/);
  });

  it("POSITIVO regresión: codes('1.5e+') sigue siendo ['E_EXPONENT_MALFORMED']", () => {
    expect(codes("1.5e+")).toEqual(["E_EXPONENT_MALFORMED"]);
  });

  it("POSITIVO regresión: codes('1e-') sigue siendo ['E_EXPONENT_MALFORMED']", () => {
    expect(codes("1e-")).toEqual(["E_EXPONENT_MALFORMED"]);
  });
});

// ---------------------------------------------------------------------------
// #19 · startsNumberAfterSign: '-.5' float vs '.5' period+integer — asimetría
// ---------------------------------------------------------------------------
describe("S4 · #19 · asimetría -.5 vs .5 — simplificar quitando rama .digit", () => {
  it("DOCUMENTACIÓN: '-.5' se parsea como binarySelector '-' + period + number '5'", () => {
    // Después del fix (quitar rama .digit de startsNumberAfterSign):
    // '-.5' ya no se acepta como float => '-' es binarySelector, '.5' es period+5.
    // Antes del fix: '-' + '.5' se mergea en float -0.5 (asimetría con '.5' positivo).
    const result = tokenize("-.5");
    const ts = result.tokens.map((t) => t.type);
    // Esperamos: binarySelector('-'), period('.'), number(5), eof
    // O si se decide mantener la asimetría y solo documentar, el test es descriptivo.
    // La decisión del contrato es: DROP la rama .digit => simetría.
    expect(ts).toContain("period");
    // No debe haber un token numérico con valor -0.5.
    const floatToken = result.tokens.find(
      (t) => t.type === "number" && t.numKind === "float" && t.value === -0.5,
    );
    expect(floatToken).toBeUndefined();
  });

  it("POSITIVO: '.5' -> period + number 5 (comportamiento ya existente)", () => {
    const result = tokenize(".5");
    const ts = result.tokens.map((t) => t.type);
    expect(ts).toEqual(["period", "number", "eof"]);
  });
});
