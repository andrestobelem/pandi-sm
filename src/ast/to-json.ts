// L1 · astToJSON — serialización CANÓNICA del AST (R12).
// Orden de claves fijo (`type` primero, `span` último), claves ausentes omitidas,
// bigint -> {"$bigint":"<decimal>"}, `origin` solo si "ext:pharo-squeak".
// La igualdad estructural de los tests compara `astToJSON(ast)` con deepEqual.

import type {
  CascadeMsg,
  LiteralNode,
  Node,
  Position,
  SourceSpan,
} from "./nodes.js";

function posJSON(p: Position): unknown {
  return { offset: p.offset, line: p.line, column: p.column };
}

function spanJSON(s: SourceSpan): unknown {
  return { start: posJSON(s.start), end: posJSON(s.end) };
}

function valueJSON(v: number | bigint | string | boolean | null): unknown {
  return typeof v === "bigint" ? { $bigint: v.toString() } : v;
}

/** Serializa cualquier nodo AST a su forma JSON canónica (orden de claves estable). */
export function astToJSON(node: Node): unknown {
  switch (node.type) {
    case "Program":
      return { type: node.type, body: astToJSON(node.body), span: spanJSON(node.span) };
    case "Sequence":
      return {
        type: node.type,
        temporaries: node.temporaries.map(astToJSON),
        statements: node.statements.map(astToJSON),
        span: spanJSON(node.span),
      };
    case "Return":
      return { type: node.type, value: astToJSON(node.value), span: spanJSON(node.span) };
    case "Assignment":
      return {
        type: node.type,
        target: astToJSON(node.target),
        value: astToJSON(node.value),
        span: spanJSON(node.span),
      };
    case "MessageSend":
      return {
        type: node.type,
        kind: node.kind,
        receiver: astToJSON(node.receiver),
        selector: node.selector,
        args: node.args.map(astToJSON),
        span: spanJSON(node.span),
      };
    case "Cascade":
      return {
        type: node.type,
        receiver: astToJSON(node.receiver),
        messages: node.messages.map(msgJSON),
        span: spanJSON(node.span),
      };
    case "Block":
      return {
        type: node.type,
        params: node.params.map(astToJSON),
        body: astToJSON(node.body),
        span: spanJSON(node.span),
      };
    case "Variable":
      return { type: node.type, name: node.name, span: spanJSON(node.span) };
    case "DynamicArray":
      return {
        type: node.type,
        elements: node.elements.map(astToJSON),
        origin: node.origin,
        span: spanJSON(node.span),
      };
    case "Literal":
      return literalJSON(node);
  }
}

function msgJSON(m: CascadeMsg): unknown {
  return {
    kind: m.kind,
    selector: m.selector,
    args: m.args.map(astToJSON),
    span: spanJSON(m.span),
  };
}

function literalJSON(node: LiteralNode): unknown {
  // Orden fijo: type, lit, raw, value?, floatKind?, scale?, origin?, elements?, span.
  const out: Record<string, unknown> = { type: node.type, lit: node.lit, raw: node.raw };
  if (node.value !== undefined) out.value = valueJSON(node.value); // null se emite; undefined se omite
  if (node.floatKind !== undefined) out.floatKind = node.floatKind;
  if (node.scale !== undefined) out.scale = node.scale;
  if (node.origin === "ext:pharo-squeak") out.origin = node.origin;
  if (node.elements !== undefined) out.elements = node.elements.map(astToJSON);
  out.span = spanJSON(node.span);
  return out;
}
