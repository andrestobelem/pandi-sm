// KERNELLOAD §5.4.0 · CompiledMethod — un método de usuario (cuerpo AST) instalado
// en un methodDict. DRIFT-B: methodDict es Map<SymbolId, Primitive>; en vez de
// ensanchar la unión en cada call-site (send/lookupMethod/perform:*), un método de
// usuario SE ENVUELVE como una Primitive (decisión "wrapper", karpathy: que la
// complejidad gane su lugar). La Primitive, al invocarse, abre un scope de método
// fresco (self=receiver, params ligados, temporaries nil, HomeMarker propio), corre
// el cuerpo con evalSequence y captura el NonLocalReturn cuyo home === ese marcador
// (reusando la maquinaria L3 de `^`). El defining-class se inyecta en el EvalCtx
// para que `super` arranque el lookup en su superclase (no en classOf(receiver)).
//
// El cargador (S3) NO parsea el patrón de método con parse() (L1 no tiene regla de
// method-def, DRIFT-E): aquí partimos el patrón nosotros (selector+params) y sólo
// el CUERPO entre `[`…`]` va a parse(). Delimitador del .st elegido para KERNELLOAD:
//   <Cuerpo> ::= '[' <secuencia> ']'   y   <Def> ::= <patrón> <Cuerpo>
// un method-def por header `Name >> patrón [ … ]` (documentado en el log; el chunk
// `!`/Tonel queda RECHAZADO en el MVP).

import type { SequenceNode } from "../ast/nodes.js";
import { parse } from "../parser/index.js";
import {
  type HomeMarker,
  NonLocalReturn,
  type Primitive,
  type Scope,
  type STClass,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { type EvalCtx, evalSequence } from "./eval.js";

/** Metadatos de un CompiledMethod (reflexión/provenance + defining-class para super). */
export interface CompiledMethodMeta {
  selector: string;
  params: string[];
  body: SequenceNode;
  definingClass: STClass;
  /** Tag de procedencia (.st de origen); no-vacío. KERNELLOAD-PROVENANCE. */
  provenanceTag: string;
}

/**
 * Side-Map Primitive -> meta: mantiene los call-sites de dispatch (send/lookupMethod)
 * intactos y Primitive-tipados (NO una unión), mientras expone los metadatos para
 * super, reflexión y depuración. Identidad por referencia del closure.
 */
const compiledMeta = new WeakMap<Primitive, CompiledMethodMeta>();

/** ¿`prim` es un CompiledMethod de usuario? (devuelve sus metadatos o undefined). */
export function compiledMethodOf(prim: Primitive): CompiledMethodMeta | undefined {
  return compiledMeta.get(prim);
}

/** Resultado de compilar un patrón de método: selector parseado + la Primitive lista. */
export interface CompiledMethod {
  selector: string;
  params: string[];
  prim: Primitive;
}

/**
 * Parte un patrón de método (`selector + params`) del CUERPO `[ … ]`. Devuelve el
 * selector concatenado (estilo AST: "at:put:"), los nombres de params en orden, y
 * el texto fuente del cuerpo (lo de DENTRO de los corchetes balanceados externos).
 * Soporta unario (`foo`), binario (`+ a`) y keyword (`at: k put: v`).
 */
function splitPattern(source: string): { selector: string; params: string[]; bodySource: string } {
  const open = source.indexOf("[");
  if (open < 0) throw new Error(`método sin cuerpo '[' : ${source}`);
  // El cuerpo es lo balanceado entre el PRIMER `[` y su `]` de cierre a nivel 0.
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`método con cuerpo sin cerrar ']' : ${source}`);
  const patternSrc = source.slice(0, open).trim();
  const bodySource = source.slice(open + 1, close);
  const tokens = patternSrc.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) throw new Error(`patrón de método vacío: ${source}`);
  const first = tokens[0] as string;
  // Keyword: el primer token termina en ':' -> pares (keyword, param) alternados.
  if (first.endsWith(":")) {
    const keywords: string[] = [];
    const params: string[] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      const kw = tokens[i] as string;
      const param = tokens[i + 1];
      if (!kw.endsWith(":") || param === undefined) {
        throw new Error(`patrón keyword mal formado: ${patternSrc}`);
      }
      keywords.push(kw);
      params.push(param);
    }
    return { selector: keywords.join(""), params, bodySource };
  }
  // Binario: un selector de símbolos + un param. Unario: sólo el selector.
  const isBinary = /^[+\-*/~<>=&|@%,?!]+$/.test(first);
  if (isBinary) {
    const param = tokens[1];
    if (param === undefined) throw new Error(`patrón binario sin parámetro: ${patternSrc}`);
    return { selector: first, params: [param], bodySource };
  }
  // Unario: el selector es el único token, sin parámetros.
  return { selector: first, params: [], bodySource };
}

/**
 * Activa un CompiledMethod: abre un scope de método fresco y corre el cuerpo. El
 * home es un marcador NUEVO por activación: un `^` interno lanza un NonLocalReturn
 * que capturamos aquí por identidad (home === este marcador) y convertimos en el
 * valor de retorno. Sin `^`, el método devuelve el receptor (convención Smalltalk).
 * El defining-class viaja en el EvalCtx para que `super` arranque en su superclase.
 */
function activate(
  meta: CompiledMethodMeta,
  receiver: STValue,
  args: STValue[],
  u: Universe,
): STValue {
  const home: HomeMarker = {};
  const vars = new Map<string, STValue>();
  meta.params.forEach((name, i) => {
    vars.set(name, (args[i] ?? u.nil) as STValue);
  });
  const scope: Scope = { vars, parent: null, self: receiver, home };
  const ctx: EvalCtx = { scope, u, definingClass: meta.definingClass };
  try {
    evalSequence(meta.body, ctx);
  } catch (e) {
    // `^` cuyo home es ESTA activación: su valor es el del método. Un home ajeno
    // (p.ej. de un método llamante) se relanza para que su propia frontera lo capture.
    if (e instanceof NonLocalReturn && e.home === home) return e.value;
    throw e;
  }
  // Sin `^` explícito: un método devuelve self (NO el valor del último statement).
  return receiver;
}

/**
 * compileMethod(source, definingClass, u) — parte el patrón, parsea SÓLO el cuerpo
 * (L1) y devuelve el selector + la Primitive envolvente con sus metadatos colgados
 * en el side-Map. NO instala nada (eso es defineMethod/el cargador en S3).
 */
export function compileMethod(
  source: string,
  definingClass: STClass,
  _u: Universe,
  provenanceTag = "inline",
): CompiledMethod {
  const { selector, params, bodySource } = splitPattern(source);
  const { ast, errors } = parse(bodySource);
  if (errors.length > 0 || ast === null) {
    throw new Error(
      `error de parseo en el cuerpo del método ${selector}: ${errors.length} error(es)`,
    );
  }
  const body = ast.body;
  const meta: CompiledMethodMeta = { selector, params, body, definingClass, provenanceTag };
  const prim: Primitive = (receiver, args, universe) => activate(meta, receiver, args, universe);
  compiledMeta.set(prim, meta);
  return { selector, params, prim };
}

/**
 * defineMethod(cls, source, u) — compila e instala el método en cls.methodDict
 * (addSelector:withMethod:). Devuelve el selector instalado. Camino de conveniencia
 * para tests y para el cargador (S3 lo usa por cada method-def del .st).
 */
export function defineMethod(
  cls: STClass,
  source: string,
  u: Universe,
  provenanceTag = "inline",
): string {
  const { selector, prim } = compileMethod(source, cls, u, provenanceTag);
  cls.methodDict.set(u.symbols.intern(selector), prim);
  return selector;
}
