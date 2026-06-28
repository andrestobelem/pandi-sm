/**
 * L1 · Parser — recuperación de error y RECHAZO DETERMINISTA (R10).
 *
 * Fija los dos majors del verificador adversarial del parser:
 *  (1) Separador `.` omitido dentro de una colección/secuencia CUYO cierre SÍ está
 *      presente: no debe diagnosticarse como E_UNCLOSED_* ni descartar el cierre y
 *      los elementos siguientes. Debe reportar E_UNEXPECTED_TOKEN y recuperar
 *      consumiendo el resto (sin pérdida de tokens).
 *  (2) Tokens basura tras un corte de separador a nivel tope (`1 2`, `1 + 2 ) 3`)
 *      no pueden aceptarse en silencio: el parse debe rechazar (errors no vacío).
 *
 * @section L1.parser.recovery
 * @kind    negative+regression
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { astToJSON } from "../../src/ast/index.js";
import type { ProgramNode } from "../../src/ast/index.js";
import { parse } from "../../src/parser/index.js";

function body(ast: ProgramNode | null): Record<string, unknown> {
  if (ast === null) throw new Error("ast es null");
  return astToJSON(ast.body as never) as Record<string, unknown>;
}
// parse().errors es Array<LexError | ParseError>; ambos exponen `code: string`.
const codes = (errors: Array<{ code: string }>): string[] => errors.map((e) => e.code);
const statements = (ast: ProgramNode | null): unknown[] => body(ast).statements as unknown[];

describe("L1 · Parser · recuperación — separador omitido con cierre presente", () => {
  it("'{1 2}' -> E_UNEXPECTED_TOKEN (no E_UNCLOSED_DYNARRAY); cierre consumido, 2 elementos", () => {
    const r = parse("{1 2}");
    expect(codes(r.errors)).not.toContain("E_UNCLOSED_DYNARRAY");
    expect(r.errors.length).toBeGreaterThan(0); // rechazo determinista
    const dyn = statements(r.ast)[0] as Record<string, unknown>;
    expect(dyn.type).toBe("DynamicArray");
    expect((dyn.elements as unknown[]).length).toBe(2); // ni el 2 ni el `}` se pierden
  });

  it("'[1 2]' -> E_UNEXPECTED_TOKEN (no E_UNCLOSED_BLOCK); `]` consumido, body con 2 statements", () => {
    const r = parse("[1 2]");
    expect(codes(r.errors)).not.toContain("E_UNCLOSED_BLOCK");
    expect(r.errors.length).toBeGreaterThan(0);
    const block = statements(r.ast)[0] as Record<string, unknown>;
    expect(block.type).toBe("Block");
    const blockBody = block.body as Record<string, unknown>;
    expect((blockBody.statements as unknown[]).length).toBe(2);
  });
});

describe("L1 · Parser · recuperación — basura a nivel tope no se acepta en silencio", () => {
  it("'1 2' -> rechazo determinista (errors no vacío); ambos statements conservados", () => {
    const r = parse("1 2");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(statements(r.ast).length).toBe(2);
  });

  it("'1 + 2 ) 3' -> rechazo determinista (no parse limpio de basura)", () => {
    const r = parse("1 + 2 ) 3");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("L1 · Parser · recuperación — regresiones (lo bien-formado sigue verde)", () => {
  it("'{1. 2}' separado correctamente: sin errores, 2 elementos", () => {
    const r = parse("{1. 2}");
    expect(r.errors).toEqual([]);
    const dyn = statements(r.ast)[0] as Record<string, unknown>;
    expect((dyn.elements as unknown[]).length).toBe(2);
  });

  it("'1. 2' dos statements separados: sin errores", () => {
    const r = parse("1. 2");
    expect(r.errors).toEqual([]);
    expect(statements(r.ast).length).toBe(2);
  });

  it("genuinamente sin cerrar sigue siendo E_UNCLOSED_*: '{1' y '[1'", () => {
    expect(codes(parse("{1").errors)).toContain("E_UNCLOSED_DYNARRAY");
    expect(codes(parse("[1").errors)).toContain("E_UNCLOSED_BLOCK");
  });
});
