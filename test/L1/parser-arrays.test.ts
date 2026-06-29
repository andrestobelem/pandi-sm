/**
 * L1 · Parser — slice P4: arrays.
 *  - literalArray `#( )` (R5/R11): bare nil/true/false => literales reservados;
 *    otros barewords/keyword-runs/binarySelectors => símbolos; anidamiento de
 *    `#(`/`(` y `#[`; ANSI (sin origin); E_UNCLOSED_ARRAY.
 *  - byteArray `#[ ]`: bytes enteros [0,255]; E_BYTE_RANGE para >255; `-` no es
 *    entero => E_UNEXPECTED_TOKEN; origin ext:pharo-squeak; E_UNCLOSED_BYTEARRAY.
 *  - dynamicArray `{ }`: expresiones separadas por `.`; origin ext:pharo-squeak;
 *    E_UNCLOSED_DYNARRAY.
 *
 * @section L1.parser
 * @kind    positive+negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import type { ProgramNode } from "../../src/ast/index.js";
import { astToJSON } from "../../src/ast/index.js";
import type { ParseError } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

function only(ast: ProgramNode | null): unknown {
  if (ast === null) throw new Error("ast es null");
  return astToJSON(ast.body.statements[0] as never);
}

function keys(o: unknown): string[] {
  return Object.keys(o as Record<string, unknown>);
}

const span = (so: number, eo: number) => ({
  start: { offset: so, line: 1, column: so + 1 },
  end: { offset: eo, line: 1, column: eo + 1 },
});

const intLit = (raw: string, value: number, so: number, eo: number) => ({
  type: "Literal",
  lit: "integer",
  raw,
  value,
  span: span(so, eo),
});

const sym = (raw: string, value: string, so: number, eo: number) => ({
  type: "Literal",
  lit: "symbol",
  raw,
  value,
  span: span(so, eo),
});

describe("L1 · Parser · literalArray #( )", () => {
  it("'#(1 2)' — enteros, ANSI (OMITE origin)", () => {
    const r = parse("#(1 2)");
    expect(r.errors).toEqual([]);
    const json = only(r.ast);
    expect(json).toEqual({
      type: "Literal",
      lit: "array",
      raw: "#(1 2)",
      elements: [intLit("1", 1, 2, 3), intLit("2", 2, 4, 5)],
      span: span(0, 6),
    });
    expect(keys(json)).not.toContain("origin");
  });

  it("R5 — '#(nil true false)' reifica reservados DENTRO del array", () => {
    const r = parse("#(nil true false)");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "Literal",
      lit: "array",
      raw: "#(nil true false)",
      elements: [
        { type: "Literal", lit: "nil", raw: "nil", value: null, span: span(2, 5) },
        { type: "Literal", lit: "true", raw: "true", value: true, span: span(6, 10) },
        { type: "Literal", lit: "false", raw: "false", value: false, span: span(11, 16) },
      ],
      span: span(0, 17),
    });
  });

  it("'#(foo at:put: +)' — barewords/keyword-runs/binarySelectors => símbolos", () => {
    const r = parse("#(foo at:put: +)");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "Literal",
      lit: "array",
      raw: "#(foo at:put: +)",
      elements: [sym("foo", "foo", 2, 5), sym("at:put:", "at:put:", 6, 13), sym("+", "+", 14, 15)],
      span: span(0, 16),
    });
  });

  it("'#(1 #(2) (3))' — anidamiento de #( y (", () => {
    const r = parse("#(1 #(2) (3))");
    expect(r.errors).toEqual([]);
    const json = only(r.ast) as Record<string, unknown>;
    expect(json.lit).toBe("array");
    const els = json.elements as Array<Record<string, unknown>>;
    const [e0, e1, e2] = els;
    expect(e0).toEqual(intLit("1", 1, 2, 3));
    expect(e1?.lit).toBe("array");
    expect((e1?.elements as unknown[])[0]).toEqual(intLit("2", 2, 6, 7));
    expect(e2?.lit).toBe("array");
    expect((e2?.elements as unknown[])[0]).toEqual(intLit("3", 3, 10, 11));
  });

  it("NEGATIVO '#(1' -> E_UNCLOSED_ARRAY (determinista)", () => {
    const r1 = parse("#(1");
    const r2 = parse("#(1");
    const codes = r1.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_UNCLOSED_ARRAY");
    const e = r1.errors.find((x) => (x as ParseError).code === "E_UNCLOSED_ARRAY");
    expect(e?.span.start.offset).toBe(0);
    expect(r2.errors).toEqual(r1.errors);
  });
});

describe("L1 · Parser · byteArray #[ ]", () => {
  it("'#[1 255]' — bytes, origin ext:pharo-squeak (EMITE origin)", () => {
    const r = parse("#[1 255]");
    expect(r.errors).toEqual([]);
    const json = only(r.ast);
    expect(json).toEqual({
      type: "Literal",
      lit: "byteArray",
      raw: "#[1 255]",
      origin: "ext:pharo-squeak",
      elements: [intLit("1", 1, 2, 3), intLit("255", 255, 4, 7)],
      span: span(0, 8),
    });
    expect(keys(json)).toContain("origin");
  });

  it("NEGATIVO '#[256]' -> E_BYTE_RANGE (byte > 255), determinista", () => {
    const r1 = parse("#[256]");
    const r2 = parse("#[256]");
    const codes = r1.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_BYTE_RANGE");
    expect(r2.errors).toEqual(r1.errors);
  });

  it("NEGATIVO '#[-4]' -> E_UNEXPECTED_TOKEN ('-' no es entero)", () => {
    const r = parse("#[-4]");
    const codes = r.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_UNEXPECTED_TOKEN");
  });

  it("NEGATIVO '#[1' -> E_UNCLOSED_BYTEARRAY", () => {
    const r = parse("#[1");
    const codes = r.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_UNCLOSED_BYTEARRAY");
  });
});

describe("L1 · Parser · dynamicArray { }", () => {
  it("'{}' vacío -> DynamicArray (EMITE origin)", () => {
    const r = parse("{}");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "DynamicArray",
      elements: [],
      origin: "ext:pharo-squeak",
      span: span(0, 2),
    });
  });

  it("'{1. 2}' -> elementos literales", () => {
    const r = parse("{1. 2}");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "DynamicArray",
      elements: [intLit("1", 1, 1, 2), intLit("2", 2, 4, 5)],
      origin: "ext:pharo-squeak",
      span: span(0, 6),
    });
  });

  it("'{a foo. b + c}' — elementos son expresiones completas", () => {
    const r = parse("{a foo. b + c}");
    expect(r.errors).toEqual([]);
    const json = only(r.ast) as Record<string, unknown>;
    expect(json.type).toBe("DynamicArray");
    const els = json.elements as Array<Record<string, unknown>>;
    expect(els[0]?.kind).toBe("unary");
    expect(els[1]?.kind).toBe("binary");
  });

  it("'{1.}' — period final permitido", () => {
    const r = parse("{1.}");
    expect(r.errors).toEqual([]);
    const json = only(r.ast) as Record<string, unknown>;
    expect((json.elements as unknown[]).length).toBe(1);
  });

  it("NEGATIVO '{1' -> E_UNCLOSED_DYNARRAY", () => {
    const r = parse("{1");
    const codes = r.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_UNCLOSED_DYNARRAY");
  });
});
