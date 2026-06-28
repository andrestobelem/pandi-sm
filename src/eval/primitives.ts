// L3 · primitivas — instaladas en los methodDict del kernel en init (plan §5.3).
// Sólo las que el skeleton necesita: SmallInteger>>+ y SmallInteger>>* (aritmética
// JS con HOOK de auto-promoción a BigInt en overflow) y Transcript>>show: (acumula
// en un buffer en memoria). El protocolo numérico/colecciones completo es diferido.

import type { Message, Primitive, STClosure, STValue, Universe } from "../runtime/index.js";
import { evalBlock } from "./eval.js";

/** Suma SmallInteger. HOOK: si el resultado nativo no es seguro, promueve a BigInt. */
function smallIntegerPlus(receiver: STValue, args: STValue[]): STValue {
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) + BigInt(b);
  const r = a + b;
  if (!Number.isSafeInteger(r)) return BigInt(a) + BigInt(b);
  return r;
}

/** Resta SmallInteger. Mismo HOOK de promoción a BigInt en overflow que la suma. */
function smallIntegerMinus(receiver: STValue, args: STValue[]): STValue {
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) - BigInt(b);
  const r = a - b;
  if (!Number.isSafeInteger(r)) return BigInt(a) - BigInt(b);
  return r;
}

/** Multiplica SmallInteger. Mismo HOOK de promoción que en la suma. */
function smallIntegerTimes(receiver: STValue, args: STValue[]): STValue {
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) * BigInt(b);
  const r = a * b;
  if (!Number.isSafeInteger(r)) return BigInt(a) * BigInt(b);
  return r;
}

/** Transcript>>show: acumula el argumento (texto) en el buffer del Transcript. */
function transcriptShow(receiver: STValue, args: STValue[], u: Universe): STValue {
  const transcript = receiver as import("../runtime/index.js").STObject;
  const prev = typeof transcript.pointers[0] === "string" ? transcript.pointers[0] : "";
  const arg = args[0];
  transcript.pointers[0] = prev + (typeof arg === "string" ? arg : String(arg));
  // void en Smalltalk devuelve el receptor; mantenemos esa convención.
  return u.Transcript;
}

/**
 * BlockClosure>>value/value:/... — invoca el bloque con los argumentos posicionales.
 * Reentra al evaluador vía evalBlock (que chequea aridad y abre el scope hijo).
 * valueWithArguments: recibe un Array reificado (L4); aquí aún no hay literales de
 * array, así que el receptor de args se pasa tal cual como STValue[] desde send.
 */
function blockValue(receiver: STValue, args: STValue[], u: Universe): STValue {
  return evalBlock(receiver as STClosure, args, u);
}

/**
 * Integer>>timesRepeat: (DEV-004) — repite el bloque `n` veces ITERATIVAMENTE
 * (un bucle JS, sin recursión por iteración, equivalente a `1 to: self do:`). No
 * es special-form: Squeak NO inlinea timesRepeat:; aquí es un envío ordinario que
 * itera. Un `^` dentro del bloque atraviesa el bucle por throw (NonLocalReturn).
 * Devuelve el receptor (convención del bucle). El bloque debe ser de aridad 0.
 */
function timesRepeat(receiver: STValue, args: STValue[], u: Universe): STValue {
  const n = Number(receiver as number | bigint);
  const block = args[0] as STClosure;
  for (let i = 0; i < n; i++) {
    evalBlock(block, [], u);
  }
  return receiver;
}

/**
 * Object>>doesNotUnderstand: — acción por defecto de un envío no entendido (S3).
 * send() llega aquí con un Message reificado (selector + args). Lanzamos un Error
 * de host OBSERVABLE y DETERMINISTA que nombra la clase del receptor y el selector;
 * el MessageNotUnderstood como Exception navegable (capturable con on:do:) es L5.
 */
function doesNotUnderstand(receiver: STValue, args: STValue[], u: Universe): STValue {
  const message = args[0] as unknown as Message;
  const recvClass = receiver === u.nil ? "UndefinedObject" : describeReceiver(receiver, u);
  throw new Error(`doesNotUnderstand: ${recvClass} no entiende #${message.selector}`);
}

/** Nombre de la clase del receptor para el mensaje de error de dNU. */
function describeReceiver(receiver: STValue, u: Universe): string {
  if (typeof receiver === "number" || typeof receiver === "bigint") return u.SmallInteger.name;
  if (typeof receiver === "string") return u.String.name;
  if (typeof receiver === "boolean") return receiver ? u.True.name : u.False.name;
  return receiver.class.name;
}

/**
 * Comparaciones de SmallInteger (< > <= >= = ~=). Devuelven booleanos nativos JS
 * (classOf los mapea a True/False). number|bigint comparan numéricamente entre sí;
 * BigInt(a) <op> BigInt(b) cuando alguno es bigint, evitando coerción a number.
 */
function compareSmallInteger(op: (a: bigint, b: bigint) => boolean): Primitive {
  return (receiver: STValue, args: STValue[]): STValue => {
    // BigInt en ambos lados: compara number y bigint correctamente sin coerción
    // lossy a number (un SmallInteger puede ser bigint tras promoción por overflow).
    return op(BigInt(receiver as number | bigint), BigInt(args[0] as number | bigint));
  };
}

/** Negación booleana. Receptor true/false nativo (classOf -> True/False). */
function booleanNot(receiver: STValue): STValue {
  return !(receiver as boolean);
}

/**
 * Condicionales como SENDS REALES (DEV-003, sin inlining): el receptor true/false
 * despacha a True/False, los argumentos son BlockClosures y la rama tomada se
 * evalúa con value (evalBlock); la NO tomada nunca se invoca (cortocircuito).
 * Un receptor no-Boolean (3, nil, ...) cae a Object y send() lanza dNU.
 */
function evalBranch(arg: STValue | undefined, u: Universe): STValue {
  return evalBlock(arg as STClosure, [], u);
}

// True>>ifTrue: evalúa el bloque; False>>ifTrue: => nil. Simétrico para ifFalse:.
const trueIfTrue: Primitive = (_r, args, u) => evalBranch(args[0], u);
const falseIfTrue: Primitive = (_r, _args, u) => u.nil;
const trueIfFalse: Primitive = (_r, _args, u) => u.nil;
const falseIfFalse: Primitive = (_r, args, u) => evalBranch(args[0], u);
// ifTrue:ifFalse: y su simétrico: True toma el bloque "true", False el "false".
const trueIfTrueIfFalse: Primitive = (_r, args, u) => evalBranch(args[0], u);
const falseIfTrueIfFalse: Primitive = (_r, args, u) => evalBranch(args[1], u);
const trueIfFalseIfTrue: Primitive = (_r, args, u) => evalBranch(args[1], u);
const falseIfFalseIfTrue: Primitive = (_r, args, u) => evalBranch(args[0], u);
// and:/or: con cortocircuito: sólo se evalúa el bloque en la rama relevante.
const trueAnd: Primitive = (_r, args, u) => evalBranch(args[0], u);
const falseAnd: Primitive = (_r, _args) => false;
const trueOr: Primitive = (_r, _args) => true;
const falseOr: Primitive = (_r, args, u) => evalBranch(args[0], u);

/** installPrimitives — cablea las primitivas del skeleton en los methodDict. */
export function installPrimitives(u: Universe): void {
  u.SmallInteger.methodDict.set(u.symbols.intern("+"), smallIntegerPlus);
  u.SmallInteger.methodDict.set(u.symbols.intern("-"), smallIntegerMinus);
  u.SmallInteger.methodDict.set(u.symbols.intern("*"), smallIntegerTimes);
  // timesRepeat: itera (DEV-004); el bucle vive en la primitiva, no en la AST.
  u.SmallInteger.methodDict.set(u.symbols.intern("timesRepeat:"), timesRepeat);
  // Comparaciones: devuelven booleanos nativos (true/false -> True/False).
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<"),
    compareSmallInteger((a, b) => a < b),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">"),
    compareSmallInteger((a, b) => a > b),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<="),
    compareSmallInteger((a, b) => a <= b),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">="),
    compareSmallInteger((a, b) => a >= b),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("="),
    compareSmallInteger((a, b) => a === b),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("~="),
    compareSmallInteger((a, b) => a !== b),
  );
  // Condicionales como sends reales (DEV-003): instalados en True/False, no inline.
  u.True.methodDict.set(u.symbols.intern("ifTrue:"), trueIfTrue);
  u.False.methodDict.set(u.symbols.intern("ifTrue:"), falseIfTrue);
  u.True.methodDict.set(u.symbols.intern("ifFalse:"), trueIfFalse);
  u.False.methodDict.set(u.symbols.intern("ifFalse:"), falseIfFalse);
  u.True.methodDict.set(u.symbols.intern("ifTrue:ifFalse:"), trueIfTrueIfFalse);
  u.False.methodDict.set(u.symbols.intern("ifTrue:ifFalse:"), falseIfTrueIfFalse);
  u.True.methodDict.set(u.symbols.intern("ifFalse:ifTrue:"), trueIfFalseIfTrue);
  u.False.methodDict.set(u.symbols.intern("ifFalse:ifTrue:"), falseIfFalseIfTrue);
  u.True.methodDict.set(u.symbols.intern("and:"), trueAnd);
  u.False.methodDict.set(u.symbols.intern("and:"), falseAnd);
  u.True.methodDict.set(u.symbols.intern("or:"), trueOr);
  u.False.methodDict.set(u.symbols.intern("or:"), falseOr);
  // not se define en Boolean (compartido por True/False vía la superclass chain).
  u.Boolean.methodDict.set(u.symbols.intern("not"), booleanNot);
  u.Transcript_class.methodDict.set(u.symbols.intern("show:"), transcriptShow);
  // value/value:/value:value:/value:value:value: comparten blockValue: send ya
  // entrega exactamente los argumentos del selector como STValue[] (0..3).
  u.BlockClosure.methodDict.set(u.symbols.intern("value"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:value:"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:value:value:"), blockValue);
  // Object>>doesNotUnderstand: — raíz de la cadena; send() la invoca en todo miss.
  u.Object.methodDict.set(u.symbols.intern("doesNotUnderstand:"), doesNotUnderstand);
}
