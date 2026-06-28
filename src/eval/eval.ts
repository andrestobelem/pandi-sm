// L3 · eval — evaluador tree-walking (plan §4/§5.3). Sobre el subconjunto del
// skeleton (Literal + MessageSend) S1 añade: entornos léxicos reales (Scope con
// vars/parent/self/home), AssignmentNode (mutación en el scope más cercano que
// declara la variable), SequenceNode (temporaries inicializadas a nil) y
// BlockNode -> BlockClosure (captura scope + home). La invocación del bloque
// (value/value:/...) vive en primitives.ts y reentra por evalBlock.
// La aritmética binaria es left-to-right SIN precedencia (Anexo A.2): el árbol
// del parser ya codifica el orden. S3 añade: bucles como special-forms iterativas
// (whileTrue:/whileFalse:/to:do:/to:by:do:, gating-por-bloque-literal, §5.3.1) y
// non-local return (^ -> NonLocalReturn plano, capturado en la frontera de programa).
// super queda diferido (no hay métodos de usuario contra los que super-despachar).

import type {
  BlockNode,
  Expression,
  MessageSendNode,
  SequenceNode,
  Statement,
} from "../ast/nodes.js";
import { parse } from "../parser/index.js";
import {
  bootstrapKernel,
  type HomeMarker,
  NonLocalReturn,
  type Scope,
  type STClosure,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { ObjectFormat } from "../runtime/index.js";
import { installPrimitives } from "./primitives.js";
import { send } from "./send.js";

/** Contexto de evaluación: el scope léxico actual + el Universe (para send/globals). */
export interface EvalCtx {
  scope: Scope;
  u: Universe;
}

let nextClosureHash = 1;

/** Resuelve un global por nombre desde el Universe (clases + pseudo-vars). */
function lookupGlobal(name: string, u: Universe): STValue | undefined {
  switch (name) {
    case "nil":
      return u.nil;
    case "true":
      return true;
    case "false":
      return false;
    case "Transcript":
      return u.Transcript;
    case "Object":
      return u.Object;
    case "Behavior":
      return u.Behavior;
    case "ClassDescription":
      return u.ClassDescription;
    case "Class":
      return u.Class;
    case "Metaclass":
      return u.Metaclass;
    case "UndefinedObject":
      return u.UndefinedObject;
    case "SmallInteger":
      return u.SmallInteger;
    case "String":
      return u.String;
    case "Boolean":
      return u.Boolean;
    case "True":
      return u.True;
    case "False":
      return u.False;
    case "BlockClosure":
      return u.BlockClosure;
    default:
      return undefined;
  }
}

/** Busca el scope MÁS CERCANO (incl. el actual) cuyo `vars` declara `name`. */
function declaringScope(scope: Scope, name: string): Scope | null {
  let current: Scope | null = scope;
  while (current !== null) {
    if (current.vars.has(name)) return current;
    current = current.parent;
  }
  return null;
}

/** Resuelve una variable: self -> scope.self; vars (cadena); luego globals. */
function resolveVariable(name: string, ctx: EvalCtx): STValue {
  if (name === "self") return ctx.scope.self;
  const owner = declaringScope(ctx.scope, name);
  if (owner !== null) {
    // `has` garantizó la presencia; Map.get devuelve el valor (nil si sin asignar).
    return owner.vars.get(name) as STValue;
  }
  const global = lookupGlobal(name, ctx.u);
  if (global !== undefined) return global;
  throw new Error(`variable no resoluble: ${name}`);
}

/** evalNode — evalúa una expresión en el contexto léxico `ctx`. */
export function evalNode(node: Expression, ctx: EvalCtx): STValue {
  switch (node.type) {
    case "Literal": {
      // El lexer ya promovió el entero (number|bigint) y des-escapó el string.
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
      return evalMessageSend(node, ctx);
    case "Variable":
      return resolveVariable(node.name, ctx);
    case "Assignment": {
      const value = evalNode(node.value, ctx);
      const owner = declaringScope(ctx.scope, node.target.name);
      if (owner === null) {
        // Asignar a una variable no declarada es un error (asignación a
        // clase/global es diferida). Error de host determinista (no Smalltalk: L5).
        throw new Error(`variable no declarada: ${node.target.name}`);
      }
      owner.vars.set(node.target.name, value);
      return value;
    }
    case "Block":
      return makeClosure(node, ctx);
    default:
      throw new Error(`nodo no soportado en el skeleton: ${node.type}`);
  }
}

/** evalNode(BlockNode) -> BlockClosure: captura el scope y el home actuales. */
function makeClosure(node: BlockNode, ctx: EvalCtx): STClosure {
  return {
    class: ctx.u.BlockClosure,
    hash: nextClosureHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    node,
    scope: ctx.scope,
    home: ctx.scope.home,
  };
}

/**
 * evalBlock — invoca un BlockClosure con `args` (value/value:/...). Abre un scope
 * hijo del scope capturado, liga los params (chequea aridad), evalúa el cuerpo y
 * devuelve el valor del último statement (nil si vacío). El home es el capturado
 * en la creación, de modo que `^` (S3) desenrolla al método/programa de origen.
 */
export function evalBlock(closure: STClosure, args: STValue[], u: Universe): STValue {
  const params = closure.node.params;
  if (params.length !== args.length) {
    throw new Error(
      `aridad incorrecta: el bloque espera ${params.length} argumento(s), recibió ${args.length}`,
    );
  }
  const scope: Scope = {
    vars: new Map(),
    parent: closure.scope,
    self: closure.scope.self,
    home: closure.home,
  };
  // Aridad ya verificada arriba; recorremos params y tomamos el arg paralelo.
  params.forEach((param, i) => {
    scope.vars.set(param.name, args[i] as STValue);
  });
  return evalSequence(closure.node.body, { scope, u });
}

/** Evalúa receptor y argumentos, luego despacha por send(). */
function evalMessageSend(node: MessageSendNode, ctx: EvalCtx): STValue {
  // Bucles = special-forms iterativas (plan §5.3.1): reconocidas ANTES del envío
  // dinámico SÓLO cuando los operandos exigidos son BlockNode literales (mismo
  // gating-por-bloque-literal que Squeak). Reúsan el frame JS (sin recursión por
  // iteración) y NO interceptan el NonLocalReturn: un `^` los atraviesa por throw.
  const loop = tryLoopSpecialForm(node, ctx);
  if (loop !== NO_LOOP) return loop;
  const receiver = evalNode(node.receiver, ctx);
  const args = node.args.map((arg) => evalNode(arg, ctx));
  return send(receiver, node.selector, args, ctx.u);
}

/** Centinela: distingue "no es un bucle" de un bucle que devolvió nil. */
const NO_LOOP = Symbol("no-loop");

/** ¿`node` es un BlockNode literal en el AST? (gating-por-bloque-literal). */
function isLiteralBlock(node: Expression): node is BlockNode {
  return node.type === "Block";
}

/**
 * truthy(v) SEÑALA, no asume falsy (plan §5.3.1): compara contra los singletons
 * nativos true/false. Si no es ninguno, NO trata cualquier no-false como true ni
 * cae en bucle infinito: envía `mustBeBoolean` a un no-Boolean, que cae a Object
 * y enruta por doesNotUnderstand: — el MISMO miss determinista que daría un ifTrue:
 * real sobre ese receptor (preserva la frontera de Booleanidad de la condición).
 */
function truthy(v: STValue, u: Universe): boolean {
  if (v === true) return true;
  if (v === false) return false;
  // No es Boolean: provoca el dNU determinista (el no-Boolean no entiende los
  // selectores condicionales) en vez de asumir Booleanidad o entrar en bucle.
  return send(v, "mustBeBoolean", [], u) as boolean;
}

/**
 * tryLoopSpecialForm — si `node` es un selector de bucle con bloques literales,
 * ejecuta el bucle iterativo y devuelve su valor (el receptor, convención de los
 * bucles en Smalltalk); en otro caso devuelve NO_LOOP para caer al envío normal.
 * timesRepeat: NO está aquí: se implementa como primitiva delegando en to:do: (DEV-004).
 */
function tryLoopSpecialForm(node: MessageSendNode, ctx: EvalCtx): STValue | typeof NO_LOOP {
  const { u } = ctx;
  switch (node.selector) {
    case "whileTrue:":
    case "whileFalse:": {
      const recv = node.receiver;
      const body = node.args[0];
      if (!isLiteralBlock(recv) || body === undefined || !isLiteralBlock(body)) return NO_LOOP;
      const cond = makeClosure(recv, ctx);
      const bodyClosure = makeClosure(body, ctx);
      const want = node.selector === "whileTrue:";
      while (truthy(evalBlock(cond, [], u), u) === want) {
        evalBlock(bodyClosure, [], u);
      }
      return u.nil;
    }
    case "to:do:": {
      const body = node.args[1];
      if (body === undefined || !isLiteralBlock(body)) return NO_LOOP;
      // Receptor/cota se evalúan UNA vez (un side-effect en ellos ocurre una sola vez).
      const receiver = evalNode(node.receiver, ctx);
      const stop = Number(evalNode(node.args[0] as Expression, ctx) as number | bigint);
      const bodyClosure = makeClosure(body, ctx);
      for (let i = Number(receiver as number | bigint); i <= stop; i++) {
        evalBlock(bodyClosure, [i], u);
      }
      return receiver; // to:do: devuelve el receptor.
    }
    case "to:by:do:": {
      const body = node.args[2];
      if (body === undefined || !isLiteralBlock(body)) return NO_LOOP;
      const receiver = evalNode(node.receiver, ctx);
      const start = Number(receiver as number | bigint);
      const stop = Number(evalNode(node.args[0] as Expression, ctx) as number | bigint);
      const step = Number(evalNode(node.args[1] as Expression, ctx) as number | bigint);
      const bodyClosure = makeClosure(body, ctx);
      if (step > 0) {
        for (let i = start; i <= stop; i += step) evalBlock(bodyClosure, [i], u);
      } else if (step < 0) {
        for (let i = start; i >= stop; i += step) evalBlock(bodyClosure, [i], u);
      }
      // step === 0 no itera (evita bucle infinito); SmallInteger>>to:by:do: con
      // paso 0 es erróneo en Smalltalk, lo dejamos como no-op determinista.
      return receiver; // to:by:do: devuelve el receptor.
    }
    default:
      return NO_LOOP;
  }
}

/**
 * evalSequence — declara las temporaries de la secuencia (inicializadas a nil en
 * el scope dado) y evalúa los statements en orden. Devuelve el valor del último
 * (nil si vacía). Un ReturnNode terminal se evalúa como el valor de la secuencia
 * (el unwind por NonLocalReturn es S3; aquí `^` sólo aparece a tope de programa).
 */
function evalSequence(seq: SequenceNode, ctx: EvalCtx): STValue {
  for (const temp of seq.temporaries) {
    ctx.scope.vars.set(temp.name, ctx.u.nil);
  }
  let value: STValue = ctx.u.nil;
  for (const stmt of seq.statements) {
    value = evalStatement(stmt, ctx);
  }
  return value;
}

/** Evalúa un statement (expresión o `^expr`). */
function evalStatement(stmt: Statement, ctx: EvalCtx): STValue {
  if (stmt.type === "Return") {
    // `^expr` desenrolla al home del scope actual lanzando un NonLocalReturn PLANO
    // (no extends Error, plan §2/V8-2). La frontera de programa (evalWith) cuyo
    // home === ctx.scope.home lo captura; desde un bloque el home es el capturado
    // en su creación, así que el `^` atraviesa los frames JS de value/bucles hasta
    // su origen. (Un home muerto -> BlockCannotReturn es L5, diferido.)
    throw new NonLocalReturn(ctx.scope.home, evalNode(stmt.value, ctx));
  }
  return evalNode(stmt, ctx);
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
  // Scope de programa: self = nil (no hay receptor de método a tope de programa;
  // nil es el receptor convencional del doIt). home = un marcador fresco.
  const home: HomeMarker = {};
  const scope: Scope = { vars: new Map(), parent: null, self: universe.nil, home };
  try {
    const value = evalSequence(ast.body, { scope, u: universe });
    return { value, universe };
  } catch (e) {
    // `^` que desenrolla al home del programa: su valor ES el valor del programa.
    // Un home ajeno (no debería ocurrir a este nivel) se relanza.
    if (e instanceof NonLocalReturn && e.home === home) {
      return { value: e.value, universe };
    }
    throw e;
  }
}

/**
 * eval(source) — entrada pública L3. Devuelve el valor del ÚLTIMO statement.
 * El buffer del Transcript se expone vía evalWith().universe (no es valor).
 */
export function evalSource(source: string): STValue {
  return evalWith(source).value;
}
