// L3 · eval — evaluador tree-walking MÍNIMO (plan §4/§5.3). Consume el AST de L1.
// Subconjunto: LiteralNode (integer/string) y MessageSendNode (binary/keyword).
// La aritmética binaria es left-to-right SIN precedencia (Anexo A.2): la
// estructura del árbol del parser ya codifica el orden, evalNode sólo lo recorre.
// Bloques, super, dNU y non-local-return son L3-proper (diferidos).

import type { Expression, MessageSendNode } from "../ast/nodes.js";
import { parse } from "../parser/index.js";
import { bootstrapKernel, type STValue, type Universe } from "../runtime/index.js";
import { installPrimitives } from "./primitives.js";
import { send } from "./send.js";

/** evalNode — evalúa una expresión del subconjunto del skeleton. */
export function evalNode(node: Expression, u: Universe): STValue {
  switch (node.type) {
    case "Literal": {
      // El lexer ya promovió el entero (number|bigint) y des-escapó el string;
      // leemos node.value directamente (ver log-de-desviaciones / l1-decisiones).
      if (node.lit === "integer") {
        const v = node.value;
        if (typeof v === "number" || typeof v === "bigint") return v;
        throw new Error("literal entero sin value numérico");
      }
      if (node.lit === "string") {
        if (typeof node.value === "string") return node.value;
        throw new Error("literal string sin value");
      }
      throw new Error(`literal no soportado en el skeleton: ${node.lit}`);
    }
    case "MessageSend":
      return evalMessageSend(node, u);
    case "Variable": {
      // El skeleton sólo resuelve el global `Transcript`; el binding completo
      // de variables (temporaries/instancias/globals) es L3-proper (diferido).
      if (node.name === "Transcript") return u.Transcript;
      if (node.name === "nil") return u.nil;
      throw new Error(`variable no resoluble en el skeleton: ${node.name}`);
    }
    default:
      throw new Error(`nodo no soportado en el skeleton: ${node.type}`);
  }
}

/** Evalúa receptor y argumentos, luego despacha por send(). Binary/keyword sólo. */
function evalMessageSend(node: MessageSendNode, u: Universe): STValue {
  if (node.kind === "unary") {
    throw new Error("mensajes unarios no soportados en el skeleton");
  }
  const receiver = evalNode(node.receiver, u);
  const args = node.args.map((arg) => evalNode(arg, u));
  return send(receiver, node.selector, args, u);
}

/** Resultado enriquecido: el último valor + el Universe (para leer el buffer). */
export interface EvalResult {
  value: STValue;
  universe: Universe;
}

/** evalWith — parsea (L1), evalúa la secuencia y devuelve valor + Universe fresco. */
export function evalWith(source: string): EvalResult {
  const { ast, errors } = parse(source);
  if (errors.length > 0 || ast === null) {
    throw new Error(`error de parseo (L1): ${errors.length} error(es)`);
  }
  const universe = bootstrapKernel();
  installPrimitives(universe);
  let value: STValue = universe.nil;
  for (const stmt of ast.body.statements) {
    if (stmt.type === "Return") {
      value = evalNode(stmt.value, universe);
      break; // ^ termina la secuencia (terminal)
    }
    value = evalNode(stmt, universe);
  }
  return { value, universe };
}

/**
 * eval(source) — entrada pública L3. Devuelve el valor del ÚLTIMO statement.
 * El buffer del Transcript se expone vía evalWith().universe (no es valor).
 */
export function evalSource(source: string): STValue {
  return evalWith(source).value;
}
