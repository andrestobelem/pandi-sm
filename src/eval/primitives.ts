// L3 · primitivas — instaladas en los methodDict del kernel en init (plan §5.3).
// Sólo las que el skeleton necesita: SmallInteger>>+ y SmallInteger>>* (aritmética
// JS con HOOK de auto-promoción a BigInt en overflow) y Transcript>>show: (acumula
// en un buffer en memoria). El protocolo numérico/colecciones completo es diferido.

import {
  basicNew,
  classOf,
  identical,
  identityHash as identityHashOf,
  isCharacter,
  isFloat,
  type Message,
  makeCharacter,
  makeClassWithMetaclass,
  makeFloat,
  notIdentical,
  type Primitive,
  type STCharacter,
  type STClass,
  type STClosure,
  type STFloat,
  type STObject,
  type STSymbol,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { evalBlock } from "./eval.js";
import { signalMessageNotUnderstood } from "./exceptions.js";
import { printString as hostPrintString } from "./print.js";
import { send } from "./send.js";

// ── L4 F2 · coerción mixta Int<->Float ──────────────────────────────────────
// REGLA (plan §5.4, origin=ingeniería/dialecto): la presencia de un Float en
// CUALQUIER operando de + - * / promueve la operación a aritmética Float (el otro
// operando se coerce con Number()) y el resultado es un Float boxed. bigint+Float es
// lossy (Number(bigint)) — aceptable en el MVP (se flaggea para el log L6). Las
// comparaciones mixtas producen un Boolean nativo (no boxean).

/** Lee el double JS de un Float boxed o el valor numérico de un SmallInteger nativo. */
function asJsNumber(v: STValue): number {
  if (isFloat(v)) return v.floatValue;
  return Number(v as number | bigint);
}

/** ¿Alguno de receptor/arg es un Float boxed? (gatilla la coerción mixta a Float). */
function anyFloat(a: STValue, b: STValue): boolean {
  return isFloat(a) || isFloat(b);
}

/** Suma SmallInteger. Mixto con Float => Float; HOOK BigInt en overflow entero. */
function smallIntegerPlus(receiver: STValue, args: STValue[], u: Universe): STValue {
  if (anyFloat(receiver, args[0] as STValue)) {
    return makeFloat(asJsNumber(receiver) + asJsNumber(args[0] as STValue), u);
  }
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) + BigInt(b);
  const r = a + b;
  if (!Number.isSafeInteger(r)) return BigInt(a) + BigInt(b);
  return r;
}

/** Resta SmallInteger. Mixto con Float => Float; mismo HOOK BigInt que la suma. */
function smallIntegerMinus(receiver: STValue, args: STValue[], u: Universe): STValue {
  if (anyFloat(receiver, args[0] as STValue)) {
    return makeFloat(asJsNumber(receiver) - asJsNumber(args[0] as STValue), u);
  }
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) - BigInt(b);
  const r = a - b;
  if (!Number.isSafeInteger(r)) return BigInt(a) - BigInt(b);
  return r;
}

/** Multiplica SmallInteger. Mixto con Float => Float; mismo HOOK de promoción. */
function smallIntegerTimes(receiver: STValue, args: STValue[], u: Universe): STValue {
  if (anyFloat(receiver, args[0] as STValue)) {
    return makeFloat(asJsNumber(receiver) * asJsNumber(args[0] as STValue), u);
  }
  const a = receiver as number | bigint;
  const b = args[0] as number | bigint;
  if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) * BigInt(b);
  const r = a * b;
  if (!Number.isSafeInteger(r)) return BigInt(a) * BigInt(b);
  return r;
}

/** ¿`v` es un divisor numérico igual a cero? (entero 0/0n o Float 0.0). */
function isZeroDivisor(v: STValue): boolean {
  if (typeof v === "number") return v === 0;
  if (typeof v === "bigint") return v === 0n;
  if (isFloat(v)) return v.floatValue === 0;
  return false;
}

/**
 * SEÑALA ZeroDivide vía la máquina L5 (plan §8.2): enviamos `signal:` a la clase
 * ZeroDivide resuelta DESDE el namespace (no hardcode), reusando signalException/
 * handlerStack sin maquinaria nueva. Capturable por on: ZeroDivide do: y por su
 * supertipo on: ArithmeticError do:. NO devuelve (signal lanza/desenrolla); el `as
 * never`/throw cubre el caso sin handler (defaultAction propaga un Error de host).
 */
function signalZeroDivide(u: Universe): never {
  const zeroDivide = u.namespace.get("ZeroDivide");
  if (zeroDivide === undefined) throw new Error("ZeroDivide: jerarquía L5 no cargada");
  send(zeroDivide, "signal:", ["ZeroDivide: divisor cero"], u);
  // signal: con handler desenrolla por Unwind; sin handler defaultAction ya lanzó.
  throw new Error("ZeroDivide: divisor cero (sin handler)");
}

/**
 * SmallInteger>>/ (NUEVO L4 F2). Divisor 0 => SEÑALA ZeroDivide. Si algún operando es
 * Float => división Float. Entre enteros: EXACTA (resto 0) => Integer (SmallInteger/
 * bigint); NO-exacta => Float (Fraction DIFERIDA, desviación log L6).
 */
function smallIntegerDivide(receiver: STValue, args: STValue[], u: Universe): STValue {
  const b = args[0] as STValue;
  if (isZeroDivisor(b)) signalZeroDivide(u);
  if (anyFloat(receiver, b)) return makeFloat(asJsNumber(receiver) / asJsNumber(b), u);
  const ai = BigInt(receiver as number | bigint);
  const bi = BigInt(b as number | bigint);
  if (ai % bi === 0n) {
    // Exacta: cociente entero. Volvemos a number si es seguro (hot-path nativo).
    const q = ai / bi;
    return q >= BigInt(Number.MIN_SAFE_INTEGER) && q <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(q)
      : q;
  }
  // No-exacta: Float (sin Fraction). Number() de los enteros (lossy si enormes, MVP).
  return makeFloat(Number(receiver as number | bigint) / Number(b as number | bigint), u);
}

/** SmallInteger>>abs — valor absoluto (preserva number/bigint). */
function smallIntegerAbs(receiver: STValue): STValue {
  const a = receiver as number | bigint;
  if (typeof a === "bigint") return a < 0n ? -a : a;
  return Math.abs(a);
}

/** SmallInteger>>negated — el opuesto aditivo (preserva number/bigint). */
function smallIntegerNegated(receiver: STValue): STValue {
  const a = receiver as number | bigint;
  if (typeof a === "bigint") return -a;
  return -a;
}

// ── L4 F2 · Float (boxed) · aritmética y comparación ────────────────────────
// El receptor es siempre un STFloat; el arg puede ser Float o SmallInteger (se coerce
// con asJsNumber). Aritmética => Float boxed; comparación => Boolean nativo.

function floatBinary(op: (a: number, b: number) => number): Primitive {
  return (receiver, args, u) =>
    makeFloat(op(asJsNumber(receiver), asJsNumber(args[0] as STValue)), u);
}

function floatCompare(op: (a: number, b: number) => boolean): Primitive {
  return (receiver, args) => op(asJsNumber(receiver), asJsNumber(args[0] as STValue));
}

/** Float>>/ — divisor 0 => ZeroDivide (NO Infinity); si no, división Float. */
function floatDivide(receiver: STValue, args: STValue[], u: Universe): STValue {
  const b = args[0] as STValue;
  if (isZeroDivisor(b)) signalZeroDivide(u);
  return makeFloat(asJsNumber(receiver) / asJsNumber(b), u);
}

/** Float>>abs / negated. */
function floatAbs(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeFloat(Math.abs((receiver as STFloat).floatValue), u);
}
function floatNegated(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeFloat(-(receiver as STFloat).floatValue, u);
}

// ── L4 F2 · Character (boxed) · protocolo mínimo ────────────────────────────
// asInteger/value => el code point (SmallInteger nativo). Las comparaciones < <= > >=
// = ~= viven aquí (por code point); max:/min:/between:and: las hereda de Magnitude.

function characterAsInteger(receiver: STValue): STValue {
  return (receiver as STCharacter).codePoint;
}

/** Character>>asCharacter — idempotente: un Character ya ES un Character (completitud ANSI). */
function characterAsCharacter(receiver: STValue): STValue {
  return receiver;
}

/**
 * Integer>>asCharacter (NUEVO L4 F3/S3) — caja el code point del receptor entero como
 * un Character (cierra el round-trip asInteger<->asCharacter: $a asInteger asCharacter
 * == $a). Number() colapsa un bigint al code point JS; un valor fuera del rango Unicode
 * lo deja en manos de makeCharacter/String.fromCodePoint (un RangeError de host se mapea
 * a error observable, misma disciplina §8.3). Origin=dialecto: vive en SmallInteger.
 */
function smallIntegerAsCharacter(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeCharacter(Number(receiver as number | bigint), u);
}

function characterCompare(op: (a: number, b: number) => boolean): Primitive {
  return (receiver, args) => {
    const b = args[0] as STValue;
    const bcp = isCharacter(b) ? b.codePoint : Number(b as number | bigint);
    return op((receiver as STCharacter).codePoint, bcp);
  };
}

/** Character>>= — igualdad por VALOR (code point); ~= su negación. */
function characterEquals(receiver: STValue, args: STValue[]): STValue {
  const b = args[0] as STValue;
  return isCharacter(b) && (receiver as STCharacter).codePoint === b.codePoint;
}
function characterNotEquals(receiver: STValue, args: STValue[]): STValue {
  return !(characterEquals(receiver, args) as boolean);
}

/** Float>>= — igualdad por VALOR (double); ~= su negación. Acepta Int coercido. */
function floatEquals(receiver: STValue, args: STValue[]): STValue {
  const b = args[0] as STValue;
  if (isFloat(b)) return (receiver as STFloat).floatValue === b.floatValue;
  if (typeof b === "number" || typeof b === "bigint") {
    return (receiver as STFloat).floatValue === Number(b);
  }
  return false;
}
function floatNotEquals(receiver: STValue, args: STValue[]): STValue {
  return !(floatEquals(receiver, args) as boolean);
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
 * BlockClosure>>ensure: (L5 S1, plan §5.5 #14/#15/#16; §5.5.1 D) — terminación
 * GARANTIZADA: corre el bloque protegido (receptor) y, pase lo que pase, corre el
 * bloque de cierre. El `finally` de JS dispara en retorno normal, en un throw de
 * host (dNU), en un NonLocalReturn de L3 (`^`) y en un Unwind de L5 (PROBE1): una
 * sola maquinaria de unwind compartida L3↔L5. El valor de la expresión es el del
 * protegido (NO el del cierre). El orden inverso de ensure: anidados cae solo del
 * anidamiento de los try/finally (el más interno corre primero).
 * NOTA S1: un `resume:` exitoso (S2) NO cruza este frame hacia afuera, así que NO
 * dispara el cierre — correcto y deseado (§5.5.1 I-3); se cablea con on:do: en S2.
 */
function blockEnsure(receiver: STValue, args: STValue[], u: Universe): STValue {
  const protectedBlock = receiver as STClosure;
  const ensureBlock = args[0] as STClosure;
  try {
    return evalBlock(protectedBlock, [], u);
  } finally {
    evalBlock(ensureBlock, [], u);
  }
}

/**
 * BlockClosure>>ifCurtailed: (L5 S1, plan §5.5 #17/#18; §5.5.1 D) — corre el
 * bloque de cierre SÓLO si el protegido termina de forma ANORMAL (un throw que
 * cruza el frame: dNU de host, NonLocalReturn de L3, o Unwind de L5). En retorno
 * normal el cierre NO corre (a diferencia de ensure:). Lo implementamos con
 * try/catch: si el protegido lanza, corremos el cierre y RELANZAMOS el mismo
 * objeto de control-flow (no lo tragamos). El orden inverso de ifCurtailed:
 * anidados cae del anidamiento de los try/catch (el más interno corre primero).
 */
function blockIfCurtailed(receiver: STValue, args: STValue[], u: Universe): STValue {
  const protectedBlock = receiver as STClosure;
  const curtailedBlock = args[0] as STClosure;
  try {
    return evalBlock(protectedBlock, [], u);
  } catch (e) {
    evalBlock(curtailedBlock, [], u);
    throw e;
  }
}

/**
 * Object>>doesNotUnderstand: — acción por defecto de un envío no entendido (S3/L5).
 * send() llega aquí con un Message reificado (selector + args). L5 S2: SEÑALA un
 * MessageNotUnderstood (capturable con on: MessageNotUnderstood do:), cerrando el
 * lazo L3↔L5. Si nadie lo captura, su defaultAction propaga un error de host cuyo
 * texto conserva 'doesNotUnderstand' (backward-compat de los tests L3). Si la
 * jerarquía aún no está cargada (uso de send fuera de evalWith), cae al error host.
 */
function doesNotUnderstand(receiver: STValue, args: STValue[], u: Universe): STValue {
  const message = args[0] as unknown as Message;
  const recvClass = receiver === u.nil ? "UndefinedObject" : describeReceiver(receiver, u);
  if (u.namespace.has("MessageNotUnderstood")) {
    return signalMessageNotUnderstood(recvClass, message.selector, u);
  }
  throw new Error(`doesNotUnderstand: ${recvClass} no entiende #${message.selector}`);
}

/** Nombre de la clase del receptor para el mensaje de error de dNU. */
function describeReceiver(receiver: STValue, u: Universe): string {
  if (typeof receiver === "number" || typeof receiver === "bigint") return u.SmallInteger.name;
  if (typeof receiver === "string") return u.String.name;
  if (typeof receiver === "boolean") return receiver ? u.True.name : u.False.name;
  // STSymbol (plain object {text}, sin slot `class`): su clase es Symbol.
  if (typeof receiver === "object" && !("class" in receiver)) return u.Symbol.name;
  return receiver.class.name;
}

/**
 * Comparaciones de SmallInteger (< > <= >= = ~=). Devuelven booleanos nativos JS
 * (classOf los mapea a True/False). number|bigint comparan numéricamente entre sí;
 * BigInt(a) <op> BigInt(b) cuando alguno es bigint, evitando coerción a number.
 */
function compareSmallInteger(
  op: (a: bigint, b: bigint) => boolean,
  fop: (a: number, b: number) => boolean,
): Primitive {
  return (receiver: STValue, args: STValue[]): STValue => {
    // L4 F2 · mixto con Float: compara como double (la presencia de un Float promueve
    // la comparación a Float; el resultado es Boolean nativo, NO se boxea).
    if (isFloat(args[0] as STValue)) {
      return fop(Number(receiver as number | bigint), (args[0] as STFloat).floatValue);
    }
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

// ── L4 F1-ext (origin=ingeniería/dialecto, ver log L6) · & | xor: EAGER ──────
// Primos NO-cortocircuito de and:/or: (ANSI/Pharo): el ARGUMENTO es un Boolean YA
// evaluado (NO un bloque). Viven en True/False.methodDict (no se inlinean: un
// no-Boolean cae a doesNotUnderstand:, GATE-L4-NO-INLINING). NOTA léxica: `|`
// aislado lexea como verticalBar (R10), así que el envío de superficie `true | x`
// no es parseable; el selector se instala igual y es alcanzable por send/perform.
const trueAndEager: Primitive = (_r, args) => args[0] as boolean;
const falseAndEager: Primitive = (_r, _args) => false;
const trueOrEager: Primitive = (_r, _args) => true;
const falseOrEager: Primitive = (_r, args) => args[0] as boolean;
// a xor: b == (a ~= b). receptor true => !arg; receptor false => arg.
const trueXor: Primitive = (_r, args) => !(args[0] as boolean);
const falseXor: Primitive = (_r, args) => args[0] as boolean;

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

// ── L4 F1-ext (origin=ingeniería/dialecto, ver log L6) · familia ifNil:/ifNotNil:
// Default en Object (receptor NO-nil) y override en UndefinedObject (receptor nil).
// La rama NO tomada NUNCA se evalúa (cortocircuito por bloque, como ifTrue:). El
// bloque se invoca con aridad 0 (la variante 1-arg de Pharo que recibe self se
// difiere). nil ifNil: [b] => b; x ifNil: [b] => x. nil ifNotNil: [b] => nil;
// x ifNotNil: [b] => b.
const objectIfNil: Primitive = (receiver) => receiver; // no-nil: devuelve self
const undefinedIfNil: Primitive = (_r, args, u) => evalBranch(args[0], u); // nil: corre el bloque
const objectIfNotNil: Primitive = (_r, args, u) => evalBranch(args[0], u); // no-nil: corre el bloque
const undefinedIfNotNil: Primitive = (_r, _args, u) => u.nil; // nil: devuelve nil
// ifNil:ifNotNil: — no-nil corre arg[1]; nil corre arg[0].
const objectIfNilIfNotNil: Primitive = (_r, args, u) => evalBranch(args[1], u);
const undefinedIfNilIfNotNil: Primitive = (_r, args, u) => evalBranch(args[0], u);
// ifNotNil:ifNil: — no-nil corre arg[0]; nil corre arg[1].
const objectIfNotNilIfNil: Primitive = (_r, args, u) => evalBranch(args[0], u);
const undefinedIfNotNilIfNil: Primitive = (_r, args, u) => evalBranch(args[1], u);

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
  // STSymbol (sin slot `class`): inmutable e interned, su copia es él mismo.
  if (!("class" in receiver)) return receiver;
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

// ─────────────────────────────────────────────────────────────────────────
// KERNELLOAD §5.4.0 · primitivas de DEFINICIÓN del lado del metamodelo. Ancladas
// por selector e instaladas en Class.methodDict, NO sintaxis especial: `Object
// subclass: #Foo ...` es un keyword-send ordinario cuyo receptor es la STClass
// Object. Todas enrutan al CAMINO ÚNICO de construcción (makeClassWithMetaclass),
// reusando la lógica de braid del bootstrap (sin camino divergente).
// ─────────────────────────────────────────────────────────────────────────

/** Lee el nombre de clase de un argumento: STSymbol (su .text) o String nativo. */
function classNameArg(arg: STValue): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "object" && arg !== null && !("class" in arg)) return (arg as STSymbol).text;
  throw new Error("subclass: nombre de clase inválido (se esperaba un símbolo o string)");
}

/**
 * Deriva instSize de un `instanceVariableNames:` ('a b c' -> 3). Cuenta los
 * tokens separados por espacios; cadena vacía/sólo-espacios -> 0. Las class-vars
 * y el package se aceptan pero el loader las ignora en esta capa (documentado).
 */
function countIvars(arg: STValue | undefined): number {
  if (typeof arg !== "string") return 0;
  const trimmed = arg.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * subclass:... — fabrica una subclase del receptor (una STClass) con la metaclase
 * cableada y la registra en el namespace. Receptor no-Behavior (3, nil…) NUNCA
 * llega aquí: la primitiva vive sólo en Class.methodDict, así que send() de un
 * SmallInteger cae a doesNotUnderstand: (anclaje por selector, no sintaxis).
 */
function subclassFull(receiver: STValue, args: STValue[], u: Universe): STValue {
  const superclass = receiver as STClass;
  const name = classNameArg(args[0] as STValue);
  const instSize = countIvars(args[1]);
  return makeClassWithMetaclass(name, superclass, instSize, u);
}

/** Variante corta `subclass:` (sin ivars/class-vars/package): instSize 0. */
function subclassShort(receiver: STValue, args: STValue[], u: Universe): STValue {
  const superclass = receiver as STClass;
  const name = classNameArg(args[0] as STValue);
  return makeClassWithMetaclass(name, superclass, 0, u);
}

/** Behavior>>name — el nombre de la clase receptora (como String). */
function classNamePrim(receiver: STValue): STValue {
  return (receiver as STClass).name;
}

/** ClassDescription>>instanceVariableNames: — ajusta instSize por conteo de tokens. */
function classInstanceVariableNames(receiver: STValue, args: STValue[]): STValue {
  const cls = receiver as STClass;
  cls.instSize = countIvars(args[0]);
  return cls;
}

/** Class>>superclass: — recablea la superclase (la metaclase no se re-deriva aquí). */
function classSetSuperclass(receiver: STValue, args: STValue[]): STValue {
  const cls = receiver as STClass;
  cls.superclass = args[0] as STClass;
  return cls;
}

/** installPrimitives — cablea las primitivas del skeleton en los methodDict. */
export function installPrimitives(u: Universe): void {
  u.SmallInteger.methodDict.set(u.symbols.intern("+"), smallIntegerPlus);
  u.SmallInteger.methodDict.set(u.symbols.intern("-"), smallIntegerMinus);
  u.SmallInteger.methodDict.set(u.symbols.intern("*"), smallIntegerTimes);
  // L4 F2 · / abs negated (NUEVOS). / exacta=>Integer, no-exacta=>Float; /0=>ZeroDivide.
  u.SmallInteger.methodDict.set(u.symbols.intern("/"), smallIntegerDivide);
  u.SmallInteger.methodDict.set(u.symbols.intern("abs"), smallIntegerAbs);
  u.SmallInteger.methodDict.set(u.symbols.intern("negated"), smallIntegerNegated);
  // L4 S3 · asCharacter: code point entero => Character boxed (round-trip con asInteger).
  u.SmallInteger.methodDict.set(u.symbols.intern("asCharacter"), smallIntegerAsCharacter);
  // timesRepeat: itera (DEV-004); el bucle vive en la primitiva, no en la AST.
  u.SmallInteger.methodDict.set(u.symbols.intern("timesRepeat:"), timesRepeat);
  // Comparaciones: devuelven booleanos nativos (true/false -> True/False). El 2º
  // comparador (sobre double) cubre el caso mixto con Float (L4 F2).
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<"),
    compareSmallInteger(
      (a, b) => a < b,
      (a, b) => a < b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">"),
    compareSmallInteger(
      (a, b) => a > b,
      (a, b) => a > b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<="),
    compareSmallInteger(
      (a, b) => a <= b,
      (a, b) => a <= b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">="),
    compareSmallInteger(
      (a, b) => a >= b,
      (a, b) => a >= b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("="),
    compareSmallInteger(
      (a, b) => a === b,
      (a, b) => a === b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("~="),
    compareSmallInteger(
      (a, b) => a !== b,
      (a, b) => a !== b,
    ),
  );
  // ── L4 F2 · Float (boxed) · aritmética + comparación + abs/negated ──────────
  u.Float.methodDict.set(
    u.symbols.intern("+"),
    floatBinary((a, b) => a + b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("-"),
    floatBinary((a, b) => a - b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("*"),
    floatBinary((a, b) => a * b),
  );
  u.Float.methodDict.set(u.symbols.intern("/"), floatDivide);
  u.Float.methodDict.set(u.symbols.intern("abs"), floatAbs);
  u.Float.methodDict.set(u.symbols.intern("negated"), floatNegated);
  u.Float.methodDict.set(
    u.symbols.intern("<"),
    floatCompare((a, b) => a < b),
  );
  u.Float.methodDict.set(
    u.symbols.intern(">"),
    floatCompare((a, b) => a > b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("<="),
    floatCompare((a, b) => a <= b),
  );
  u.Float.methodDict.set(
    u.symbols.intern(">="),
    floatCompare((a, b) => a >= b),
  );
  u.Float.methodDict.set(u.symbols.intern("="), floatEquals);
  u.Float.methodDict.set(u.symbols.intern("~="), floatNotEquals);
  // ── L4 F2 · Character (boxed) · asInteger/value + comparación ───────────────
  u.Character.methodDict.set(u.symbols.intern("asInteger"), characterAsInteger);
  u.Character.methodDict.set(u.symbols.intern("value"), characterAsInteger);
  // L4 S3 · asCharacter sobre un Character es self (completitud ANSI del round-trip).
  u.Character.methodDict.set(u.symbols.intern("asCharacter"), characterAsCharacter);
  u.Character.methodDict.set(
    u.symbols.intern("<"),
    characterCompare((a, b) => a < b),
  );
  u.Character.methodDict.set(
    u.symbols.intern(">"),
    characterCompare((a, b) => a > b),
  );
  u.Character.methodDict.set(
    u.symbols.intern("<="),
    characterCompare((a, b) => a <= b),
  );
  u.Character.methodDict.set(
    u.symbols.intern(">="),
    characterCompare((a, b) => a >= b),
  );
  u.Character.methodDict.set(u.symbols.intern("="), characterEquals);
  u.Character.methodDict.set(u.symbols.intern("~="), characterNotEquals);
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
  // L4 F1-ext · & | xor: EAGER (no son bloques; viven en True/False, no se inlinean).
  u.True.methodDict.set(u.symbols.intern("&"), trueAndEager);
  u.False.methodDict.set(u.symbols.intern("&"), falseAndEager);
  u.True.methodDict.set(u.symbols.intern("|"), trueOrEager);
  u.False.methodDict.set(u.symbols.intern("|"), falseOrEager);
  u.True.methodDict.set(u.symbols.intern("xor:"), trueXor);
  u.False.methodDict.set(u.symbols.intern("xor:"), falseXor);
  // not se define en Boolean (compartido por True/False vía la superclass chain).
  u.Boolean.methodDict.set(u.symbols.intern("not"), booleanNot);
  u.Transcript_class.methodDict.set(u.symbols.intern("show:"), transcriptShow);
  // value/value:/value:value:/value:value:value: comparten blockValue: send ya
  // entrega exactamente los argumentos del selector como STValue[] (0..3).
  u.BlockClosure.methodDict.set(u.symbols.intern("value"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:value:"), blockValue);
  u.BlockClosure.methodDict.set(u.symbols.intern("value:value:value:"), blockValue);
  // ── L5 S1 · terminación garantizada (plan §5.5): ensure:/ifCurtailed: como
  // primitivas TS (necesitan el try/finally del frame JS y callBlock). Su
  // contrato observable se cierra AQUÍ, no en L3 (corrección de solapamiento).
  u.BlockClosure.methodDict.set(u.symbols.intern("ensure:"), blockEnsure);
  u.BlockClosure.methodDict.set(u.symbols.intern("ifCurtailed:"), blockIfCurtailed);
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
  // L4 F1-ext · familia ifNil:/ifNotNil: — default en Object, override en
  // UndefinedObject (el lookup halla el override de nil antes de subir a Object).
  u.Object.methodDict.set(u.symbols.intern("ifNil:"), objectIfNil);
  u.UndefinedObject.methodDict.set(u.symbols.intern("ifNil:"), undefinedIfNil);
  u.Object.methodDict.set(u.symbols.intern("ifNotNil:"), objectIfNotNil);
  u.UndefinedObject.methodDict.set(u.symbols.intern("ifNotNil:"), undefinedIfNotNil);
  u.Object.methodDict.set(u.symbols.intern("ifNil:ifNotNil:"), objectIfNilIfNotNil);
  u.UndefinedObject.methodDict.set(u.symbols.intern("ifNil:ifNotNil:"), undefinedIfNilIfNotNil);
  u.Object.methodDict.set(u.symbols.intern("ifNotNil:ifNil:"), objectIfNotNilIfNil);
  u.UndefinedObject.methodDict.set(u.symbols.intern("ifNotNil:ifNil:"), undefinedIfNotNilIfNil);
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
  // ── Primitivas de DEFINICIÓN del metamodelo (KERNELLOAD §5.4.0) ──────────
  // Instaladas en Class.methodDict (lado-metamodelo): un keyword-send subclass:
  // a una STClass resuelve aquí; a un no-Behavior cae a doesNotUnderstand:.
  u.Class.methodDict.set(
    u.symbols.intern("subclass:instanceVariableNames:classVariableNames:package:"),
    subclassFull,
  );
  u.Class.methodDict.set(u.symbols.intern("subclass:"), subclassShort);
  u.Class.methodDict.set(u.symbols.intern("name"), classNamePrim);
  u.Class.methodDict.set(u.symbols.intern("instanceVariableNames:"), classInstanceVariableNames);
  u.Class.methodDict.set(u.symbols.intern("superclass:"), classSetSuperclass);
}
