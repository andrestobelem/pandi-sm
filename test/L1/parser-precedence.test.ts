/**
 * L1 · Parser — slice P1: scaffold + núcleo de precedencia.
 * parsePrimary (literales/variable/paren) -> parseUnary -> parseBinary -> parseKeyword.
 * Precedencia Smalltalk: unary > binary > keyword; binarios left-assoc SIN precedencia
 * entre sí (R8). parse(source) tokeniza vía lexer, arrastra LexError, parsea.
 *
 * @section L1.parser
 * @kind    positive+negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { astToJSON } from "../../src/ast/index.js";
import type { ProgramNode } from "../../src/ast/index.js";
import type { ParseError } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

/** Extrae el único statement del programa (helper de los golden de expresión). */
function only(ast: ProgramNode | null): unknown {
  if (ast === null) throw new Error("ast es null");
  return astToJSON(ast.body.statements[0] as never);
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

describe("L1 · Parser · scaffold + precedencia", () => {
  it("'3 + 4 * 2' — binarios left-assoc, SIN precedencia entre binarios (golden)", () => {
    const r = parse("3 + 4 * 2");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "MessageSend",
      kind: "binary",
      receiver: {
        type: "MessageSend",
        kind: "binary",
        receiver: intLit("3", 3, 0, 1),
        selector: "+",
        args: [intLit("4", 4, 4, 5)],
        span: span(0, 5),
      },
      selector: "*",
      args: [intLit("2", 2, 8, 9)],
      span: span(0, 9),
    });
  });

  it("envuelve en ProgramNode { body: Sequence{ temporaries:[], statements:[expr] } }", () => {
    const r = parse("3 + 4 * 2");
    const json = astToJSON(r.ast as never) as Record<string, unknown>;
    expect(json.type).toBe("Program");
    const body = json.body as Record<string, unknown>;
    expect(body.type).toBe("Sequence");
    expect(body.temporaries).toEqual([]);
    expect((body.statements as unknown[]).length).toBe(1);
  });

  it("cadena unary 'a foo bar' anida (bar (foo a))", () => {
    const r = parse("a foo bar");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "MessageSend",
      kind: "unary",
      receiver: {
        type: "MessageSend",
        kind: "unary",
        receiver: { type: "Variable", name: "a", span: span(0, 1) },
        selector: "foo",
        args: [],
        span: span(0, 5),
      },
      selector: "bar",
      args: [],
      span: span(0, 9),
    });
  });

  it("unary liga más fuerte que binary: 'a foo + b bar'", () => {
    const r = parse("a foo + b bar");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "MessageSend",
      kind: "binary",
      receiver: {
        type: "MessageSend",
        kind: "unary",
        receiver: { type: "Variable", name: "a", span: span(0, 1) },
        selector: "foo",
        args: [],
        span: span(0, 5),
      },
      selector: "+",
      args: [
        {
          type: "MessageSend",
          kind: "unary",
          receiver: { type: "Variable", name: "b", span: span(8, 9) },
          selector: "bar",
          args: [],
          span: span(8, 13),
        },
      ],
      span: span(0, 13),
    });
  });

  it("'3 * 4 + 2' == (3*4)+2 (re-asegura left-assoc sin precedencia)", () => {
    const r = parse("3 * 4 + 2");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "MessageSend",
      kind: "binary",
      receiver: {
        type: "MessageSend",
        kind: "binary",
        receiver: intLit("3", 3, 0, 1),
        selector: "*",
        args: [intLit("4", 4, 4, 5)],
        span: span(0, 5),
      },
      selector: "+",
      args: [intLit("2", 2, 8, 9)],
      span: span(0, 9),
    });
  });

  it("keyword 'a at: 1 put: 2' — selector concatenado, args binarios", () => {
    const r = parse("a at: 1 put: 2");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual({
      type: "MessageSend",
      kind: "keyword",
      receiver: { type: "Variable", name: "a", span: span(0, 1) },
      selector: "at:put:",
      args: [intLit("1", 1, 6, 7), intLit("2", 2, 13, 14)],
      span: span(0, 14),
    });
  });

  it("keyword liga más flojo que binary: 'a max: b + c'", () => {
    const r = parse("a max: b + c");
    expect(r.errors).toEqual([]);
    const json = only(r.ast) as Record<string, unknown>;
    expect(json.kind).toBe("keyword");
    expect(json.selector).toBe("max:");
    const args = json.args as unknown[];
    expect(args).toHaveLength(1);
    const arg = args[0] as Record<string, unknown>;
    expect(arg.kind).toBe("binary");
    expect(arg.selector).toBe("+");
  });

  it("'(3)' — paréntesis agrupan, devuelve el literal interior", () => {
    const r = parse("(3)");
    expect(r.errors).toEqual([]);
    expect(only(r.ast)).toEqual(intLit("3", 3, 1, 2));
  });

  it("paréntesis cambian precedencia: '(3 + 4) * 2'", () => {
    const r = parse("(3 + 4) * 2");
    expect(r.errors).toEqual([]);
    const json = only(r.ast) as Record<string, unknown>;
    expect(json.selector).toBe("*");
    const recv = json.receiver as Record<string, unknown>;
    expect(recv.selector).toBe("+");
  });

  it("NEGATIVO '(3' -> E_UNCLOSED_PAREN, determinista", () => {
    const r1 = parse("(3");
    const r2 = parse("(3");
    const codes = r1.errors.map((e) => (e as ParseError).code);
    expect(codes).toContain("E_UNCLOSED_PAREN");
    const e1 = r1.errors.find((e) => (e as ParseError).code === "E_UNCLOSED_PAREN");
    expect(e1?.span.start.offset).toBe(0);
    expect(r2.errors).toEqual(r1.errors);
  });

  it("ParseError tiene exactamente las claves code, span, message (paridad con LexError)", () => {
    const e: ParseError = { code: "E_UNEXPECTED_TOKEN", span: span(0, 1), message: "msg" };
    expect(Object.keys(e).sort()).toEqual(["code", "message", "span"]);
    expect(e.code).toBe("E_UNEXPECTED_TOKEN");
  });
});
