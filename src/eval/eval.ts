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
// KERNELLOAD §5.4.0 (S2) añade super-dispatch: `super sel` (parser: Variable "super")
// arranca el lookup en la superclase de la clase DEFINIDORA del método (definingClass
// en EvalCtx), no en classOf(self). La activación de métodos de usuario vive en
// method.ts (CompiledMethod), que reusa evalSequence + el home/NonLocalReturn de L3.

import type {
  BlockNode,
  CascadeNode,
  Expression,
  MessageSendNode,
  SequenceNode,
  Statement,
} from "../ast/nodes.js";
import { parse } from "../parser/index.js";
import {
  bootstrapKernel,
  type HomeMarker,
  makeArray,
  makeCharacter,
  makeFloat,
  makeString,
  NonLocalReturn,
  ObjectFormat,
  type Scope,
  type STClosure,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { installExceptionPrimitives } from "./exceptions.js";
import { loadCollectionMethods } from "./kernel-collections.js";
import { KERNEL_EXCEPTION_SOURCES } from "./kernel-exceptions.js";
import { loadKernelSources } from "./kernel-loader.js";
import { loadNumericMethods } from "./kernel-numerics.js";
import { loadStringMethods } from "./kernel-strings.js";
import { installPrimitives, intervalEndpoint } from "./primitives.js";
import { send, superSend } from "./send.js";

/**
 * Contexto de evaluación: el scope léxico actual + el Universe (para send/globals).
 * `definingClass` es la clase que DEFINIÓ el método en ejecución (KERNELLOAD §5.4.0):
 * `super` arranca el lookup en su superclase, NO en classOf(receiver). Es undefined
 * a tope de programa (un `super` sin método definidor es un error/dNU).
 */
export interface EvalCtx {
  scope: Scope;
  u: Universe;
  definingClass?: import("../runtime/index.js").STClass;
}

let nextClosureHash = 1;

/**
 * Resuelve un global por nombre desde el Universe. Las pseudo-vars (nil/true/
 * false/Transcript) tienen ramas explícitas; TODO nombre de clase se delega al
 * namespace mutable del Universe (única fuente de verdad, KERNELLOAD §5.4.0), de
 * modo que las clases del núcleo Y las creadas por subclass: son resolubles igual.
 */
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
    default:
      return u.namespace.get(name);
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
        // L4 F5 · String boxed: el literal evalúa a un STString FRESCO (class u.String,
        // campo `chars`), NO al string JS nativo. Dos literales 'foo' son cajas distintas
        // (identidad '==' por referencia, GATE-F5); la igualdad por contenido la da String>>=.
        if (typeof node.value === "string") return makeString(node.value, ctx.u);
        throw new Error("literal string sin value");
      }
      if (node.lit === "symbol") {
        // #Foo evalúa al símbolo interned (identidad ==), reusando la SymbolTable
        // que ya da identidad a los selectores (KERNELLOAD §5.4.0). classOf lo
        // mapea a u.Symbol; el subclass: lee su .text como nombre de clase.
        if (typeof node.value === "string") return ctx.u.symbols.intern(node.value);
        throw new Error("literal symbol sin value");
      }
      // L4 F2 · Float boxed: el lexer ya hizo parseFloat (number); las variantes
      // e/d/q colapsan a un único Float en el MVP (FloatE/D/Q diferidas, log L6).
      if (node.lit === "float") {
        if (typeof node.value === "number") return makeFloat(node.value, ctx.u);
        throw new Error("literal float sin value numérico");
      }
      // L4 F2 · Character boxed: el lexer emite el valor como STRING de 1 char
      // (String.fromCodePoint); derivamos el code point con codePointAt(0).
      if (node.lit === "character") {
        if (typeof node.value === "string") {
          return makeCharacter(node.value.codePointAt(0) as number, ctx.u);
        }
        throw new Error("literal character sin value string");
      }
      // L4 F4 · #( ) / #[ ] -> Array (boxed). Los elementos de un literal-array son
      // LiteralNode[] (no `value`): los reificamos recursivamente (un anidado #( … ) es
      // otro lit:'array'). #[ ] es un Array de SmallIntegers en el MVP (NO una clase
      // ByteArray distinta; marcado, se flaggea para el log L6). Los símbolos bare-word
      // dentro de #( ) quedan diferidos (MVP numbers-only, plan §5.4).
      if (node.lit === "array" || node.lit === "byteArray") {
        const els = (node.elements ?? []).map((e) => evalNode(e, ctx));
        return makeArray(els, ctx.u);
      }
      // Dentro de #( ) las pseudo-vars true/false/nil son LiteralNodes (a nivel
      // top-level parsean como Variable y resuelven vía lookupGlobal). Reifican a
      // los MISMOS singletons que lookupGlobal (eval.ts:67-72): native true/false,
      // u.nil. Sin estas ramas, #(true false nil) —sintaxis Smalltalk de base—
      // caía al throw de host (NO capturable por on:Error do:). Símbolos bare-word
      // (#(a b c)) ya reifican vía la rama "symbol"; números/strings/chars/floats
      // /anidados ya funcionaban: true/false/nil eran el único hueco inconsistente.
      if (node.lit === "true") return true;
      if (node.lit === "false") return false;
      if (node.lit === "nil") return ctx.u.nil;
      // scaledDecimal (`3.14s2`): el lexer/parser lo aceptan (DEV-011) pero ScaledDecimal
      // como tipo numérico exacto está diferido. En vez de un throw de host NO capturable,
      // señala un Error capturable por on:do: (no colapsamos a Float: cambiaría la semántica
      // exacta en silencio). El soporte numérico real queda para L6.
      if (node.lit === "scaledDecimal") {
        return signalError(`scaledDecimal (${node.raw}) no soportado todavía (MVP)`, ctx.u);
      }
      throw new Error(`literal no soportado en el skeleton: ${node.lit}`);
    }
    case "MessageSend":
      return evalMessageSend(node, ctx);
    case "Cascade":
      return evalCascade(node, ctx);
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
    case "DynamicArray": {
      // L4 F4 · { e1. e2 } -> Array: a diferencia de #( ), los elementos son
      // EXPRESIONES (no literales), así que se evalúan en el contexto léxico actual.
      const els = node.elements.map((e) => evalNode(e, ctx));
      return makeArray(els, ctx.u);
    }
    default:
      throw new Error(`nodo no soportado en el skeleton: ${(node as Expression).type}`);
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
    // Capturamos la clase definidora para que un `super` interno al bloque arranque
    // el lookup en su superclase aunque el bloque se invoque después (KERNELLOAD §5.4.0).
    // exactOptionalPropertyTypes: sólo añadimos la propiedad si hay valor.
    ...(ctx.definingClass !== undefined ? { definingClass: ctx.definingClass } : {}),
  };
}

/** Señala un Error de Smalltalk capturable (mismo patrón que en method.ts/primitives.ts). */
function signalError(text: string, u: Universe): never {
  const error = u.namespace.get("Error");
  if (error === undefined) throw new Error(text);
  send(error, "signal:", [makeString(text, u)], u);
  throw new Error(`${text} (sin handler)`);
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
    signalError(
      `aridad incorrecta: el bloque espera ${params.length} argumento(s), recibió ${args.length}`,
      u,
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
  // El definingClass capturado en la creación viaja al ctx hijo: un `super` dentro
  // del bloque arranca el lookup en su superclase (KERNELLOAD §5.4.0).
  const ctx: EvalCtx =
    closure.definingClass !== undefined
      ? { scope, u, definingClass: closure.definingClass }
      : { scope, u };
  return evalSequence(closure.node.body, ctx);
}

/** Evalúa receptor y argumentos, luego despacha por send(). */
function evalMessageSend(node: MessageSendNode, ctx: EvalCtx): STValue {
  // Bucles = special-forms iterativas (plan §5.3.1): reconocidas ANTES del envío
  // dinámico SÓLO cuando los operandos exigidos son BlockNode literales (mismo
  // gating-por-bloque-literal que Squeak). Reúsan el frame JS (sin recursión por
  // iteración) y NO interceptan el NonLocalReturn: un `^` los atraviesa por throw.
  const loop = tryLoopSpecialForm(node, ctx);
  if (loop !== NO_LOOP) return loop;
  // `super sel ...`: el parser representa `super` como un Variable{name:"super"}
  // (DRIFT-D, no hay nodo dedicado). El receptor-VALOR sigue siendo self; el lookup
  // arranca en la superclase de la clase DEFINIDORA del método en curso (plan §5.4.0
  // normativo), no en classOf(self). Un `super` a tope de programa (sin definingClass)
  // no es resoluble: cae al envío normal, que enruta por doesNotUnderstand:.
  if (node.receiver.type === "Variable" && node.receiver.name === "super") {
    const args = node.args.map((arg) => evalNode(arg, ctx));
    if (ctx.definingClass !== undefined) {
      return superSend(ctx.scope.self, node.selector, args, ctx.definingClass, ctx.u);
    }
  }
  const receiver = evalNode(node.receiver, ctx);
  const args = node.args.map((arg) => evalNode(arg, ctx));
  return send(receiver, node.selector, args, ctx.u);
}

/**
 * evalCascade — `recv m1; m2; …` (R9). El RECEPTOR (el operando previo al primer
 * ';') se evalúa UNA sola vez; cada mensaje de `node.messages` se le envía en orden
 * con sus argumentos evaluados en el contexto léxico actual. La cascada vale el
 * resultado del ÚLTIMO mensaje (convención Smalltalk). `messages` siempre trae ≥2
 * entradas (la cabeza incluida), así que nunca devuelve el receptor crudo.
 */
function evalCascade(node: CascadeNode, ctx: EvalCtx): STValue {
  const receiver = evalNode(node.receiver, ctx);
  let result: STValue = ctx.u.nil;
  for (const msg of node.messages) {
    const args = msg.args.map((arg) => evalNode(arg, ctx));
    result = send(receiver, msg.selector, args, ctx.u);
  }
  return result;
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
  // `super to: … do: […]`: la special-form evaluaría `super` como receptor con
  // evalNode(Variable "super") -> "variable no resoluble: super" (throw de host NO
  // capturable). Un `super` siempre debe ir por el super-dispatch de evalMessageSend
  // (KERNELLOAD §5.4.0), nunca por el atajo iterativo: devolvemos NO_LOOP para que caiga
  // allí. (DEV-020 cubría super a tope de programa; DEV-036 super con bloque NO literal;
  // este hueco —super con bloque LITERAL dentro de un método— quedaba sin cubrir.)
  if (node.receiver.type === "Variable" && node.receiver.name === "super") return NO_LOOP;
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
      const receiverValue = evalNode(node.receiver, ctx);
      // Guard de cota segura (DEV-035): el camino con bloque LITERAL no pasa por
      // smallIntegerTo, así que aplicamos AQUÍ el mismo intervalEndpoint. Sin él, un
      // `Number(cota)` ciego colapsa a NaN (cota Float => 0 iteraciones silenciosas) o
      // corre ~10^21 vueltas (cota bigint > 2^53-1 => CUELGA). Ahora señala un Error
      // capturable por on:do: ANTES de iterar, en vez de colgar o miscomputar en silencio.
      const start = intervalEndpoint(receiverValue, "inicio", u);
      const stop = intervalEndpoint(evalNode(node.args[0] as Expression, ctx), "fin", u);
      const bodyClosure = makeClosure(body, ctx);
      for (let i = start; i <= stop; i++) {
        evalBlock(bodyClosure, [i], u);
      }
      return receiverValue; // to:do: devuelve el receptor.
    }
    case "to:by:do:": {
      const body = node.args[2];
      if (body === undefined || !isLiteralBlock(body)) return NO_LOOP;
      const receiverValue = evalNode(node.receiver, ctx);
      // Mismo guard de cota/paso seguro que to:do: (DEV-035): un paso/extremo Float o
      // bigint inseguro señala un Error capturable ANTES de iterar (no NaN-silencio ni cuelgue).
      const start = intervalEndpoint(receiverValue, "inicio", u);
      const stop = intervalEndpoint(evalNode(node.args[0] as Expression, ctx), "fin", u);
      const step = intervalEndpoint(evalNode(node.args[1] as Expression, ctx), "paso", u);
      const bodyClosure = makeClosure(body, ctx);
      if (step > 0) {
        for (let i = start; i <= stop; i += step) evalBlock(bodyClosure, [i], u);
      } else if (step < 0) {
        for (let i = start; i >= stop; i += step) evalBlock(bodyClosure, [i], u);
      }
      // step === 0 no itera (evita bucle infinito); SmallInteger>>to:by:do: con
      // paso 0 es erróneo en Smalltalk, lo dejamos como no-op determinista.
      return receiverValue; // to:by:do: devuelve el receptor.
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
export function evalSequence(seq: SequenceNode, ctx: EvalCtx): STValue {
  for (const temp of seq.temporaries) {
    // Guard: if a parameter binding already exists (e.g. a block param reused
    // as a temp variable name), preserve it — do NOT overwrite with nil.
    if (!ctx.scope.vars.has(temp.name)) {
      ctx.scope.vars.set(temp.name, ctx.u.nil);
    }
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
  // L5 S2: carga la jerarquía .st de excepciones (Exception<-Error/Warning,
  // ArithmeticError<-ZeroDivide, MessageNotUnderstood) y cablea el protocolo de
  // control-flow (signal/on:do:/return:/resume:/pass/...) como primitivas TS sobre
  // ella. La carga corre DESPUÉS de installPrimitives (los cuerpos .st podrían usar
  // primitivas) y ANTES de la evaluación, así Error/Warning/... son resolubles.
  loadKernelSources(universe, KERNEL_EXCEPTION_SOURCES);
  installExceptionPrimitives(universe);
  // L4 F2: métodos derivados de Magnitude (.st: max:/min:/between:and:) sobre la
  // torre numérica del núcleo (Magnitude/Number/Integer/Float/Character ya viven en
  // bootstrap; aquí sólo se añaden los cuerpos, con tag de procedencia).
  loadNumericMethods(universe);
  // L4 F4: cuerpos derivados de la base de colecciones (.st: first/last sobre
  // SequenceableCollection, en términos de at:/size). La cadena abstracta Collection<-
  // SequenceableCollection<-Array vive en bootstrap; aquí sólo se añaden los cuerpos,
  // con tag de procedencia (GATE-L4-PROVENANCE).
  loadCollectionMethods(universe);
  // L4 F5: cuerpos derivados de String (.st: asString => ^self). El protocolo a nivel de chars
  // (, / size / asSymbol / =) lo aportan primitivas en installPrimitives; aquí sólo el cuerpo
  // puro por envío, con tag de procedencia (GATE-L4-PROVENANCE).
  loadStringMethods(universe);
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
