/**
 * L1 · Parser — slice P3: BlockNode + CascadeNode.
 * - Block `[` (`:id`)* (`|` si hay params) body:Sequence `]` — params via colon+identifier
 *   (DEV-015/R3), temporaries viven en body:Sequence (R13). E_UNCLOSED_BLOCK si falta `]`.
 * - Cascade: `recv msg ; msg (; msg)*` — R9: CascadeNode.receiver = receptor del mensaje
 *   anterior al primer `;`; el mensaje previo se descompone en CascadeMsg (kind/selector/args,
 *   SIN receptor). El head debe ser un MessageSend, si no E_CASCADE_NO_RECEIVER.
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

const varNode = (name: string, so: number, eo: number) => ({
  type: "Variable",
  name,
  span: span(so, eo),
});

/** astToJSON del primer statement del programa. */
function stmt0(ast: ProgramNode | null): Record<string, unknown> {
  if (ast === null) throw new Error("ast es null");
  const seq = astToJSON(ast.body as never) as Record<string, unknown>;
  return (seq.statements as Record<string, unknown>[])[0] as Record<string, unknown>;
}

function codes(errors: Array<ParseError | { code?: string }>): string[] {
  return errors.map((e) => (e as ParseError).code);
}

describe("L1 · Parser · block", () => {
  it("bloque vacío '[]' -> Block{params:[], body:Sequence vacío}", () => {
    const r = parse("[]");
    expect(r.errors).toEqual([]);
    expect(stmt0(r.ast)).toEqual({
      type: "Block",
      params: [],
      body: { type: "Sequence", temporaries: [], statements: [], span: span(1, 1) },
      span: span(0, 2),
    });
  });

  it("bloque con cuerpo '[1. 2]' -> body.statements [Lit 1, Lit 2]", () => {
    const r = parse("[1. 2]");
    expect(r.errors).toEqual([]);
    const blk = stmt0(r.ast);
    expect(blk.type).toBe("Block");
    expect(blk.params).toEqual([]);
    const body = blk.body as Record<string, unknown>;
    expect(body.statements).toEqual([intLit("1", 1, 1, 2), intLit("2", 2, 4, 5)]);
    expect(blk.span).toEqual(span(0, 6));
  });

  it("params '[:x :y | x]' -> params [Variable x, Variable y], body [Variable x]", () => {
    const r = parse("[:x :y | x]");
    expect(r.errors).toEqual([]);
    const blk = stmt0(r.ast);
    expect(blk.params).toEqual([varNode("x", 2, 3), varNode("y", 5, 6)]);
    const body = blk.body as Record<string, unknown>;
    expect(body.statements).toEqual([varNode("x", 9, 10)]);
    expect(blk.span).toEqual(span(0, 11));
  });

  it("params + temporaries '[:x | | t | t := x]' -> params [x], body.temporaries [t]", () => {
    const r = parse("[:x | | t | t := x]");
    expect(r.errors).toEqual([]);
    const blk = stmt0(r.ast);
    expect(blk.params).toEqual([varNode("x", 2, 3)]);
    const body = blk.body as Record<string, unknown>;
    expect(body.temporaries).toEqual([varNode("t", 8, 9)]);
    expect((body.statements as unknown[]).length).toBe(1);
    expect((body.statements as Record<string, unknown>[])[0]?.type).toBe("Assignment");
  });

  it("NEGATIVO '[1' -> E_UNCLOSED_BLOCK con span desde '['", () => {
    const r1 = parse("[1");
    const r2 = parse("[1");
    expect(codes(r1.errors)).toContain("E_UNCLOSED_BLOCK");
    const e = r1.errors.find((x) => (x as ParseError).code === "E_UNCLOSED_BLOCK");
    expect(e?.span.start.offset).toBe(0);
    expect(r2.errors).toEqual(r1.errors);
  });
});

describe("L1 · Parser · cascade", () => {
  it("cascade unario 'a foo; bar' -> Cascade{receiver Variable a, messages [foo, bar]}", () => {
    const r = parse("a foo; bar");
    expect(r.errors).toEqual([]);
    expect(stmt0(r.ast)).toEqual({
      type: "Cascade",
      receiver: varNode("a", 0, 1),
      messages: [
        { kind: "unary", selector: "foo", args: [], span: span(2, 5) },
        { kind: "unary", selector: "bar", args: [], span: span(7, 10) },
      ],
      span: span(0, 10),
    });
  });

  it("R9 descomposición 'a foo bar; baz' -> receiver (a foo), messages [bar, baz]", () => {
    const r = parse("a foo bar; baz");
    expect(r.errors).toEqual([]);
    const casc = stmt0(r.ast);
    expect(casc.type).toBe("Cascade");
    // receiver = (a foo) : MessageSend unary 'foo' sobre Variable a
    expect(casc.receiver).toEqual({
      type: "MessageSend",
      kind: "unary",
      receiver: varNode("a", 0, 1),
      selector: "foo",
      args: [],
      span: span(0, 5),
    });
    expect(casc.messages).toEqual([
      { kind: "unary", selector: "bar", args: [], span: span(6, 9) },
      { kind: "unary", selector: "baz", args: [], span: span(11, 14) },
    ]);
  });

  it("cascade keyword 'c add: 1; add: 2' -> receiver Variable c, messages [add:1, add:2]", () => {
    const r = parse("c add: 1; add: 2");
    expect(r.errors).toEqual([]);
    const casc = stmt0(r.ast);
    expect(casc.receiver).toEqual(varNode("c", 0, 1));
    expect(casc.messages).toEqual([
      { kind: "keyword", selector: "add:", args: [intLit("1", 1, 7, 8)], span: span(2, 8) },
      { kind: "keyword", selector: "add:", args: [intLit("2", 2, 15, 16)], span: span(10, 16) },
    ]);
  });

  it("NEGATIVO '3; foo' (head no es MessageSend) -> E_CASCADE_NO_RECEIVER", () => {
    const r = parse("3; foo");
    expect(codes(r.errors)).toContain("E_CASCADE_NO_RECEIVER");
  });
});
