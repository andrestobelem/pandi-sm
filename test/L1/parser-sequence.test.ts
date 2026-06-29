/**
 * L1 · Parser — slice P2: parseSequence + Return (R13 terminal) + Assignment.
 * - Sequence: temporaries `| a b |` (VariableNode[] en Sequence, único hogar, DEV-012/R13);
 *   statements separados por `.`, `.` final permitida (sin statement vacío).
 * - Return: `^ expr` => ReturnNode; R13 terminal: tras `^expr` sólo una `.` opcional y
 *   el cierre (eof/`]`); cualquier statement posterior => E_UNEXPECTED_TOKEN.
 * - Assignment: `variable := expr`, right-assoc (`a := b := c` anida); target no-variable
 *   (p.ej. `3 := 4`, `a foo := 1`) => E_UNEXPECTED_TOKEN en `:=` (CORR-2/DEV-010, R8).
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

/** astToJSON del Sequence (body del programa). */
function body(ast: ProgramNode | null): Record<string, unknown> {
  if (ast === null) throw new Error("ast es null");
  return astToJSON(ast.body as never) as Record<string, unknown>;
}

function codes(errors: Array<ParseError | { code?: string }>): string[] {
  return errors.map((e) => (e as ParseError).code);
}

describe("L1 · Parser · sequence/return/assignment", () => {
  // ── Assignment ──────────────────────────────────────────────────────────
  it("'x := 3' -> Assignment{target:Variable x, value:Literal 3}", () => {
    const r = parse("x := 3");
    expect(r.errors).toEqual([]);
    expect((body(r.ast).statements as unknown[])[0]).toEqual({
      type: "Assignment",
      target: varNode("x", 0, 1),
      value: intLit("3", 3, 5, 6),
      span: span(0, 6),
    });
  });

  it("right-assoc 'a := b := c' -> Assignment(a, Assignment(b, Variable c))", () => {
    const r = parse("a := b := c");
    expect(r.errors).toEqual([]);
    expect((body(r.ast).statements as unknown[])[0]).toEqual({
      type: "Assignment",
      target: varNode("a", 0, 1),
      value: {
        type: "Assignment",
        target: varNode("b", 5, 6),
        value: varNode("c", 10, 11),
        span: span(5, 11),
      },
      span: span(0, 11),
    });
  });

  it("NEGATIVO '3 := 4' -> E_UNEXPECTED_TOKEN en `:=` (target literal, CORR-2/DEV-010)", () => {
    const r1 = parse("3 := 4");
    const r2 = parse("3 := 4");
    expect(codes(r1.errors)).toContain("E_UNEXPECTED_TOKEN");
    const e = r1.errors.find((x) => (x as ParseError).code === "E_UNEXPECTED_TOKEN");
    expect(e?.span.start.offset).toBe(2);
    expect(r2.errors).toEqual(r1.errors);
  });

  it("NEGATIVO 'a foo := 1' -> E_UNEXPECTED_TOKEN en `:=` (target no asignable, R8)", () => {
    const r = parse("a foo := 1");
    expect(codes(r.errors)).toContain("E_UNEXPECTED_TOKEN");
    const e = r.errors.find((x) => (x as ParseError).code === "E_UNEXPECTED_TOKEN");
    expect(e?.span.start.offset).toBe(6);
  });

  // ── Temporaries ─────────────────────────────────────────────────────────
  it("temporaries '| a b | a := 1' -> Sequence.temporaries = [Variable a, Variable b]", () => {
    const r = parse("| a b | a := 1");
    expect(r.errors).toEqual([]);
    const seq = body(r.ast);
    expect(seq.temporaries).toEqual([varNode("a", 2, 3), varNode("b", 4, 5)]);
    expect((seq.statements as unknown[]).length).toBe(1);
    expect((seq.statements as unknown[])[0]).toEqual({
      type: "Assignment",
      target: varNode("a", 8, 9),
      value: intLit("1", 1, 13, 14),
      span: span(8, 14),
    });
  });

  // ── Statements / separadores ──────────────────────────────────────────────
  it("múltiples statements 'a. b. c' -> Sequence.statements length 3", () => {
    const r = parse("a. b. c");
    expect(r.errors).toEqual([]);
    const seq = body(r.ast);
    expect((seq.statements as unknown[]).length).toBe(3);
    expect(seq.statements).toEqual([varNode("a", 0, 1), varNode("b", 3, 4), varNode("c", 6, 7)]);
  });

  it("`.` final permitida 'a.' -> length 1 (sin statement vacío)", () => {
    const r = parse("a.");
    expect(r.errors).toEqual([]);
    expect((body(r.ast).statements as unknown[]).length).toBe(1);
  });

  // ── Return ────────────────────────────────────────────────────────────────
  it("'^ 3' -> Sequence.statements = [Return{value:Literal 3}]", () => {
    const r = parse("^ 3");
    expect(r.errors).toEqual([]);
    expect((body(r.ast).statements as unknown[])[0]).toEqual({
      type: "Return",
      value: intLit("3", 3, 2, 3),
      span: span(0, 3),
    });
  });

  it("R13 terminal: '^3. 4' -> statement posterior => E_UNEXPECTED_TOKEN", () => {
    const r = parse("^3. 4");
    expect(codes(r.errors)).toContain("E_UNEXPECTED_TOKEN");
    const e = r.errors.find((x) => (x as ParseError).code === "E_UNEXPECTED_TOKEN");
    // El `4` posterior empieza en offset 4.
    expect(e?.span.start.offset).toBe(4);
  });

  it("R13 terminal: '^3.' (`.` final + eof) es OK, un solo statement Return", () => {
    const r = parse("^3.");
    expect(r.errors).toEqual([]);
    const seq = body(r.ast);
    expect((seq.statements as unknown[]).length).toBe(1);
    expect(((seq.statements as unknown[])[0] as Record<string, unknown>).type).toBe("Return");
  });

  // ── Program wrapping ────────────────────────────────────────────────────────
  it("parse('3') -> Program{body:Sequence{temporaries:[],statements:[Literal 3]}}", () => {
    const r = parse("3");
    expect(r.errors).toEqual([]);
    const json = astToJSON(r.ast as never) as Record<string, unknown>;
    expect(json.type).toBe("Program");
    const seq = json.body as Record<string, unknown>;
    expect(seq.temporaries).toEqual([]);
    expect(seq.statements).toEqual([intLit("3", 3, 0, 1)]);
    // Program.span cubre 0..fin.
    expect(json.span).toEqual(span(0, 1));
  });

  it("fuente vacía/espacios -> Program con Sequence vacío (temporaries [], statements [])", () => {
    const r = parse("   ");
    expect(r.errors).toEqual([]);
    const seq = body(r.ast);
    expect(seq.temporaries).toEqual([]);
    expect(seq.statements).toEqual([]);
  });
});
