/**
 * L1 · Parser — reparación de defectos del verificador adversarial.
 * Tres familias de bug:
 *  1) E_KEYWORD_NO_ARG (R10): `x at:` debe emitir E_KEYWORD_NO_ARG (no
 *     E_UNEXPECTED_TOKEN(eof)) y NO inyectar un arg fantasma `Variable{name:""}`.
 *  2) AST bien formado (R12): un token inesperado donde se espera un primary NO
 *     debe acuñar un Variable con el lexema del token rechazado (`+`, `)`) ni un
 *     Variable vacío (eof). El slot malformado se OMITE.
 *  3) Determinismo (R10): `( )` y `()` producen UN solo error (no E_UNEXPECTED_TOKEN
 *     + E_UNCLOSED_PAREN encadenados por la misma raíz).
 *
 * @section L1.parser
 * @kind    negative
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { astToJSON } from "../../src/ast/index.js";
import type { ProgramNode } from "../../src/ast/index.js";
import type { ParseError } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

function codes(errors: Array<ParseError | { code?: string }>): string[] {
  return errors.map((e) => (e as ParseError).code);
}

const span = (so: number, eo: number) => ({
  start: { offset: so, line: 1, column: so + 1 },
  end: { offset: eo, line: 1, column: eo + 1 },
});

/** Lista de astToJSON de cada statement del programa. */
function statements(ast: ProgramNode | null): unknown[] {
  if (ast === null) throw new Error("ast es null");
  return ast.body.statements.map((s) => astToJSON(s as never));
}

/** Aplana el AST a JSON-string para buscar nodos malformados embebidos a cualquier profundidad. */
function astString(ast: ProgramNode | null): string {
  if (ast === null) return "";
  return JSON.stringify(astToJSON(ast as never));
}

describe("L1 · Parser · E_KEYWORD_NO_ARG (R10)", () => {
  it("'x at:' -> E_KEYWORD_NO_ARG, sin arg fantasma Variable{name:''}", () => {
    const r = parse("x at:");
    expect(codes(r.errors)).toContain("E_KEYWORD_NO_ARG");
    expect(codes(r.errors)).not.toContain("E_UNEXPECTED_TOKEN");
    // No debe existir ningún Variable con name vacío en el árbol.
    expect(astString(r.ast)).not.toContain('"name":""');
  });

  it("'x foo: ' -> E_KEYWORD_NO_ARG en el span del keyword", () => {
    const r = parse("x foo: ");
    expect(codes(r.errors)).toContain("E_KEYWORD_NO_ARG");
    const e = r.errors.find((x) => (x as ParseError).code === "E_KEYWORD_NO_ARG");
    // El keyword `foo:` empieza en offset 2.
    expect(e?.span.start.offset).toBe(2);
  });

  it("cascada con keyword sin arg 'x m; at:' -> E_KEYWORD_NO_ARG, sin Variable vacío", () => {
    const r = parse("x m; at:");
    expect(codes(r.errors)).toContain("E_KEYWORD_NO_ARG");
    expect(astString(r.ast)).not.toContain('"name":""');
  });

  it("determinista: 'x at:' produce idéntico resultado en dos corridas", () => {
    const r1 = parse("x at:");
    const r2 = parse("x at:");
    expect(r2.errors).toEqual(r1.errors);
  });
});

describe("L1 · Parser · AST bien formado (R12) — sin Variable acuñado de token inválido", () => {
  it("'+' -> E_UNEXPECTED_TOKEN y NINGÚN Variable{name:'+'}", () => {
    const r = parse("+");
    expect(codes(r.errors)).toContain("E_UNEXPECTED_TOKEN");
    expect(astString(r.ast)).not.toContain('"name":"+"');
    // No hay statement bien formado que reportar.
    expect(statements(r.ast)).toEqual([]);
  });

  it("')' -> E_UNEXPECTED_TOKEN y NINGÚN Variable{name:')'}", () => {
    const r = parse(")");
    expect(codes(r.errors)).toContain("E_UNEXPECTED_TOKEN");
    expect(astString(r.ast)).not.toContain('"name":")"');
    expect(statements(r.ast)).toEqual([]);
  });

  it("'a := ' -> Assignment.value NO es Variable{name:''} (slot malformado omitido)", () => {
    const r = parse("a := ");
    // value faltante: no debe haber Variable vacío en el árbol.
    expect(astString(r.ast)).not.toContain('"name":""');
  });

  it("'^' -> Return.value NO es Variable{name:''} (slot malformado omitido)", () => {
    const r = parse("^");
    expect(astString(r.ast)).not.toContain('"name":""');
  });
});

describe("L1 · Parser · determinismo de paréntesis (R10)", () => {
  it("'( )' -> UN solo error (no E_UNEXPECTED_TOKEN + E_UNCLOSED_PAREN), sin Variable{name:')'}", () => {
    const r = parse("( )");
    expect(r.errors).toHaveLength(1);
    expect(astString(r.ast)).not.toContain('"name":")"');
  });

  it("'()' -> UN solo error, sin Variable acuñado", () => {
    const r = parse("()");
    expect(r.errors).toHaveLength(1);
    expect(astString(r.ast)).not.toContain('"name":")"');
  });

  it("determinista: '( )' idéntico en dos corridas", () => {
    const r1 = parse("( )");
    const r2 = parse("( )");
    expect(r2.errors).toEqual(r1.errors);
  });
});

/** Mensajes (astToJSON) del primer statement, asumido Cascade. */
function cascadeMessages(ast: ProgramNode | null): Record<string, unknown>[] {
  if (ast === null) throw new Error("ast es null");
  const seq = astToJSON(ast.body as never) as Record<string, unknown>;
  const s0 = (seq.statements as Record<string, unknown>[])[0] as Record<string, unknown>;
  expect(s0?.type).toBe("Cascade");
  return s0.messages as Record<string, unknown>[];
}

describe("L1 · Parser · cascade — sin tragarse tokens estructurales (R12/R10/cascade)", () => {
  it("'[a foo;]' -> ']' NO se consume como selector unario; el bloque cierra sin E_UNCLOSED_BLOCK", () => {
    const r = parse("[a foo;]");
    expect(codes(r.errors)).not.toContain("E_UNCLOSED_BLOCK");
    // El selector ']' NUNCA debe aparecer como mensaje de cascada.
    expect(astString(r.ast)).not.toContain('"selector":"]"');
  });

  it("'[a b; ]' -> ']' NO se consume; sin E_UNCLOSED_BLOCK ni selector fantasma ']'", () => {
    const r = parse("[a b; ]");
    expect(codes(r.errors)).not.toContain("E_UNCLOSED_BLOCK");
    expect(astString(r.ast)).not.toContain('"selector":"]"');
  });

  it("'a foo; . b' -> el '.' separador NO se traga como selector de cascada", () => {
    const r = parse("a foo; . b");
    expect(astString(r.ast)).not.toContain('"selector":"."');
  });
});

describe("L1 · Parser · cascade — keyword sin arg: SIN CascadeMsg fantasma (R10/R12)", () => {
  it("'x foo; bar:' -> E_KEYWORD_NO_ARG y messages = [unary foo] (sin keyword vacío)", () => {
    const r = parse("x foo; bar:");
    expect(codes(r.errors)).toContain("E_KEYWORD_NO_ARG");
    const msgs = cascadeMessages(r.ast);
    expect(msgs).toEqual([{ kind: "unary", selector: "foo", args: [], span: span(2, 5) }]);
    // No debe haber ningún selector keyword vacío en el árbol.
    expect(astString(r.ast)).not.toContain('"selector":""');
  });

  it("'x foo; bar: ]' -> sin CascadeMsg keyword fantasma con selector ''", () => {
    const r = parse("x foo; bar: ]");
    expect(astString(r.ast)).not.toContain('"selector":""');
  });

  it("'x foo; bar: . c' -> sin CascadeMsg keyword fantasma con selector ''", () => {
    const r = parse("x foo; bar: . c");
    expect(astString(r.ast)).not.toContain('"selector":""');
  });
});

describe("L1 · Parser · cascade — binary sin arg: SIN mensaje binario malformado (arity)", () => {
  it("'a foo; +' -> NINGÚN CascadeMsg binary con args:[] (arity 1 obligatoria)", () => {
    const r = parse("a foo; +");
    const msgs = cascadeMessages(r.ast);
    // El único mensaje válido es el unary 'foo'; el '+' sin arg no produce nodo.
    expect(msgs).toEqual([{ kind: "unary", selector: "foo", args: [], span: span(2, 5) }]);
    // No debe existir un binary con args vacío.
    expect(astString(r.ast)).not.toContain('"kind":"binary","selector":"+","args":[]');
  });
});
