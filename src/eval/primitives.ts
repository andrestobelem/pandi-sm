// L3 · primitivas — instaladas en los methodDict del kernel en init (plan §5.3).
// Sólo las que el skeleton necesita: SmallInteger>>+ y SmallInteger>>* (aritmética
// JS con HOOK de auto-promoción a BigInt en overflow) y Transcript>>show: (acumula
// en un buffer en memoria). El protocolo numérico/colecciones completo es diferido.

import {
  basicNew,
  classOf,
  identical,
  identityHash as identityHashOf,
  type Message,
  notIdentical,
  type Primitive,
  type STClass,
  type STClosure,
  type STObject,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { evalBlock } from "./eval.js";
import { printString as hostPrintString } from "./print.js";
import { send } from "./send.js";

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

// ─────────────────────────────────────────────────────────────────────────
// L2-proper · protocolo <Object> (S3, plan §5.2 líneas 295-300). Los 23
// selectores comunes a TODO objeto, instalados en Object.methodDict y por tanto
// alcanzables desde cualquier instancia por la superclass chain. Reflexión
// (perform:*/respondsTo:/isKindOf:/isMemberOf:), identidad por defecto (= == ~= ~~),
// copy SHALLOW (decisión de dialecto, NO ANSI — se documenta en L6), error: como
// error de host observable (la Exception navegable es L5), y printString/printOn:
// como sends que CONCUERDAN con el bridge host de print.ts (no lo reemplazan).
// ─────────────────────────────────────────────────────────────────────────

/** yourself — devuelve el receptor sin cambios (idiom de encadenado en cascada). */
function objectYourself(receiver: STValue): STValue {
  return receiver;
}

/** class — la clase del receptor (classOf mapea inmediatos sin convertir). */
function objectClass(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return classOf(receiver, u);
}

/** identityHash/hash — hash estable consistente con `==` (inmediatos por valor). */
function objectIdentityHash(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return identityHashOf(receiver, u);
}

/** == — identidad por referencia (valor para inmediatos); ~~ su negación. */
function objectIdentical(receiver: STValue, args: STValue[]): STValue {
  return identical(receiver, args[0] as STValue);
}

/** ~~ — la negación de `==`. */
function objectNotIdentical(receiver: STValue, args: STValue[]): STValue {
  return notIdentical(receiver, args[0] as STValue);
}

/**
 * = (default de Object) — igualdad por defecto = identidad. SmallInteger>>= (por
 * valor) lo OVERRIDE: vive en SmallInteger.methodDict, así que el lookup lo halla
 * antes de subir a Object. ~= es la negación del mismo default.
 */
function objectEquals(receiver: STValue, args: STValue[]): STValue {
  return identical(receiver, args[0] as STValue);
}

function objectNotEquals(receiver: STValue, args: STValue[]): STValue {
  return notIdentical(receiver, args[0] as STValue);
}

/** isNil — true sólo para nil (la instancia única de UndefinedObject); notNil su negación. */
function objectIsNil(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return receiver === u.nil;
}

function objectNotNil(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return receiver !== u.nil;
}

/**
 * isMemberOf: — true sólo si la clase del receptor es EXACTAMENTE el argumento
 * (estricto, sin herencia). isKindOf: en cambio camina la superclass chain.
 */
function objectIsMemberOf(receiver: STValue, args: STValue[], u: Universe): STValue {
  return classOf(receiver, u) === (args[0] as STClass);
}

/** isKindOf: — true si el argumento está en la superclass chain de classOf(receiver). */
function objectIsKindOf(receiver: STValue, args: STValue[], u: Universe): STValue {
  const target = args[0] as STClass;
  let cur: STClass | null = classOf(receiver, u);
  while (cur !== null) {
    if (cur === target) return true;
    const next: STClass | STObject | null = cur.superclass;
    cur = next !== null && "methodDict" in next ? (next as STClass) : null;
  }
  return false;
}

/** respondsTo: — true si lookup por la cadena halla el selector argumento. */
function objectRespondsTo(receiver: STValue, args: STValue[], u: Universe): STValue {
  const sym = u.symbols.intern(args[0] as string);
  let cur: STClass | null = classOf(receiver, u);
  while (cur !== null) {
    if (cur.methodDict.has(sym)) return true;
    const next: STClass | STObject | null = cur.superclass;
    cur = next !== null && "methodDict" in next ? (next as STClass) : null;
  }
  return false;
}

/**
 * perform:withArguments: — reenvía `selector` al receptor con `argArray` (el
 * núcleo de la familia perform:). En L2 aún no hay literales de Array, así que el
 * arg-array llega como un STValue[] nativo desde el caller/perform:withN. Round-
 * trips EXACTAMENTE como un send directo (misma maquinaria de dispatch).
 */
function objectPerformWithArguments(receiver: STValue, args: STValue[], u: Universe): STValue {
  const selector = args[0] as string;
  const argArray = (args[1] ?? []) as STValue[];
  return send(receiver, selector, argArray, u);
}

/** perform: (aridad 0) — perform:withArguments: con array vacío. */
function objectPerform(receiver: STValue, args: STValue[], u: Universe): STValue {
  return send(receiver, args[0] as string, [], u);
}

/** perform:with: (aridad 1) — un argumento posicional reenviado. */
function objectPerformWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  return send(receiver, args[0] as string, [args[1] as STValue], u);
}

/** perform:with:with: (aridad 2). */
function objectPerformWithWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  return send(receiver, args[0] as string, [args[1] as STValue, args[2] as STValue], u);
}

/** perform:with:with:with: (aridad 3). */
function objectPerformWithWithWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  return send(
    receiver,
    args[0] as string,
    [args[1] as STValue, args[2] as STValue, args[3] as STValue],
    u,
  );
}

/**
 * copy — copia SHALLOW (decisión de dialecto/ingeniería, NO ANSI; copy profundo
 * NUNCA, plan §5.2 línea 311/323 — se documenta en el log de desviaciones L6).
 * Para inmediatos (number/bigint/string/boolean) el valor es la copia (no hay
 * estado mutable). Para STObjects: nuevo objeto, misma clase, slots copiados POR
 * REFERENCIA (los slots no se clonan en profundidad). El hash NO se preserva: la
 * copia es un objeto nuevo con identidad propia (basicNew da hash fresco).
 */
function objectCopy(receiver: STValue, _args: STValue[], u: Universe): STValue {
  if (typeof receiver !== "object") return receiver;
  // Shallow: nuevo objeto con TODOS los slots propios copiados POR REFERENCIA.
  // El spread (no un pick parcial de {class,hash,format,pointers}) preserva los
  // campos extra de STClass —name/superclass/methodDict/instSize— cuando el
  // receptor es una clase; un pick parcial dejaba un shell de clase roto. El
  // array `pointers` se copia (slice) para que la copia tenga sus propios slots
  // indexados (sus elementos siguen compartidos: shallow). El hash NO se
  // preserva: la copia es un objeto nuevo con identidad propia.
  return {
    ...receiver,
    hash: basicNew(receiver.class, u).hash,
    pointers: receiver.pointers.slice(),
  };
}

/**
 * error: — señala un error con el mensaje argumento. En L2/L3 lanza un Error de
 * host OBSERVABLE y determinista (full Exception navegable, capturable con on:do:,
 * es L5, diferido). Esto refleja la decisión §5.2 línea 336.
 */
function objectError(_receiver: STValue, args: STValue[]): STValue {
  const msg = typeof args[0] === "string" ? args[0] : String(args[0]);
  throw new Error(msg);
}

/**
 * printString — texto del receptor. DELEGA en el bridge host print.ts para que el
 * send y la función host CONCUERDEN (el harness compara con === la salida host).
 * print.ts NO se elimina: es la fuente única de verdad de la representación.
 */
function objectPrintString(receiver: STValue): STValue {
  return hostPrintString(receiver);
}

/**
 * printOn: — protocolo ANSI: escribe la representación en un stream. En L2 aún no
 * hay WriteStream real; mantenemos la forma del selector devolviendo el receptor
 * (convención de void) tras computar el texto vía el mismo bridge. El stream real
 * (nextPutAll:) es L3-proper/L4. El selector existe para que printString lo pueda
 * delegar en el futuro y para completar el conteo de 23.
 */
function objectPrintOn(receiver: STValue): STValue {
  // Computa el texto (efecto observable futuro) y devuelve el receptor (void).
  hostPrintString(receiver);
  return receiver;
}

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
  // ── Protocolo <Object> (S3): los 23 selectores comunes a todo objeto ──────
  // Object>>doesNotUnderstand: — raíz de la cadena; send() la invoca en todo miss.
  u.Object.methodDict.set(u.symbols.intern("doesNotUnderstand:"), doesNotUnderstand);
  u.Object.methodDict.set(u.symbols.intern("yourself"), objectYourself);
  u.Object.methodDict.set(u.symbols.intern("class"), objectClass);
  u.Object.methodDict.set(u.symbols.intern("identityHash"), objectIdentityHash);
  u.Object.methodDict.set(u.symbols.intern("hash"), objectIdentityHash);
  u.Object.methodDict.set(u.symbols.intern("=="), objectIdentical);
  u.Object.methodDict.set(u.symbols.intern("~~"), objectNotIdentical);
  // = / ~= son DEFAULTS en Object (identidad); SmallInteger los override por valor.
  u.Object.methodDict.set(u.symbols.intern("="), objectEquals);
  u.Object.methodDict.set(u.symbols.intern("~="), objectNotEquals);
  u.Object.methodDict.set(u.symbols.intern("isNil"), objectIsNil);
  u.Object.methodDict.set(u.symbols.intern("notNil"), objectNotNil);
  u.Object.methodDict.set(u.symbols.intern("isMemberOf:"), objectIsMemberOf);
  u.Object.methodDict.set(u.symbols.intern("isKindOf:"), objectIsKindOf);
  u.Object.methodDict.set(u.symbols.intern("respondsTo:"), objectRespondsTo);
  u.Object.methodDict.set(u.symbols.intern("perform:"), objectPerform);
  u.Object.methodDict.set(u.symbols.intern("perform:with:"), objectPerformWith);
  u.Object.methodDict.set(u.symbols.intern("perform:with:with:"), objectPerformWithWith);
  u.Object.methodDict.set(u.symbols.intern("perform:with:with:with:"), objectPerformWithWithWith);
  u.Object.methodDict.set(u.symbols.intern("perform:withArguments:"), objectPerformWithArguments);
  u.Object.methodDict.set(u.symbols.intern("copy"), objectCopy);
  u.Object.methodDict.set(u.symbols.intern("error:"), objectError);
  u.Object.methodDict.set(u.symbols.intern("printString"), objectPrintString);
  u.Object.methodDict.set(u.symbols.intern("printOn:"), objectPrintOn);
}
