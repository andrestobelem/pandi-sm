// L3 · primitivas — instaladas en los methodDict del kernel en init (plan §5.3).
// Sólo las que el skeleton necesita: SmallInteger>>+ y SmallInteger>>* (aritmética
// JS con HOOK de auto-promoción a BigInt en overflow) y Transcript>>show: (acumula
// en un buffer en memoria). El protocolo numérico/colecciones completo es diferido.

import {
  basicNew,
  classOf,
  identical,
  identityHash as identityHashOf,
  instVarAt as instVarAtOf,
  instVarAtPut as instVarAtPutOf,
  isArray,
  isCharacter,
  isFloat,
  isStream,
  isString,
  isSymbol,
  type Message,
  makeArray,
  makeCharacter,
  makeClassWithMetaclass,
  makeFloat,
  makeInterval,
  makeOrderedCollection,
  makeStream,
  makeString,
  notIdentical,
  type Primitive,
  type STArray,
  type STCharacter,
  type STClass,
  type STClosure,
  type STFloat,
  type STInterval,
  type STObject,
  type STOrderedCollection,
  type STStream,
  type STSymbol,
  type STValue,
  textOf,
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

/**
 * ¿`v` es un operando numérico válido (number|bigint nativo o Float boxed)? Único punto
 * de verdad para la validación de operandos de la torre numérica. Un Character boxed, un
 * String, nil o cualquier otro STObject NO es numérico: pasarlo a BigInt()/Number() daría
 * un TypeError de host INCAPTURABLE (lado entero) o un NaN silenciosamente erróneo (lado
 * Float). Ver guardNumericOperand.
 */
function isNumericOperand(v: STValue): boolean {
  return typeof v === "number" || typeof v === "bigint" || isFloat(v);
}

/**
 * Valida el arg de una primitiva ARITMÉTICA/COMPARACIÓN-ORDENADA (+ - * / < > <= >=): si
 * no es numérico, SEÑALA un doesNotUnderstand: de nivel-Smalltalk (capturable por on:do:),
 * en vez de reventar el host con BigInt(STObject)/Number(STObject)=>NaN. El selector se
 * reporta sobre la clase del RECEPTOR (es el receptor quien no sabe coercir el arg ajeno).
 * Devuelve true si el operando es válido; si no, NO retorna (signal desenrolla/lanza).
 * NOTA: la IGUALDAD (=/~=) NO usa esto — un no-número simplemente NO es igual (=> false),
 * nunca un error (semántica ANSI Object>>=).
 */
function guardNumericOperand(receiver: STValue, arg: STValue, selector: string, u: Universe): true {
  if (isNumericOperand(arg)) return true;
  signalMessageNotUnderstood(classOf(receiver, u).name, selector, u);
  // signalMessageNotUnderstood no retorna por la ruta normal (señala/desenrolla).
  throw new Error(`${selector}: operando no numérico (sin handler)`);
}

/** Suma SmallInteger. Mixto con Float => Float; HOOK BigInt en overflow entero. */
function smallIntegerPlus(receiver: STValue, args: STValue[], u: Universe): STValue {
  guardNumericOperand(receiver, args[0] as STValue, "+", u);
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
  guardNumericOperand(receiver, args[0] as STValue, "-", u);
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
  guardNumericOperand(receiver, args[0] as STValue, "*", u);
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
 * SEÑALA un Error genérico vía la máquina L5 (plan §5.4/§8.10): enviamos `signal:` a la
 * clase Error resuelta DESDE el namespace (no hardcode), reusando signalException/
 * handlerStack sin maquinaria nueva — EXACTO mismo patrón que signalZeroDivide. NO existe
 * SystemExceptions.IndexOutOfRange en el MVP (DRIFT-3), así que un at: fuera de rango señala
 * el Error genérico, capturable por on: Error do:. NO devuelve (signal lanza/desenrolla); el
 * throw final cubre el caso sin handler (defaultAction ya propagó un Error de host).
 */
function signalError(text: string, u: Universe): never {
  const error = u.namespace.get("Error");
  if (error === undefined) throw new Error("Error: jerarquía L5 no cargada");
  // L4 F5: el texto se boxea como STString (capa de valor de usuario), de modo que un handler
  // que lea `e messageText` reciba un String que responde protocolo, no un nativo interno.
  // defaultAction lo des-boxea para el Error de host sin handler (messageTextHost).
  send(error, "signal:", [makeString(text, u)], u);
  throw new Error(`${text} (sin handler)`);
}

// ── L4 F4 · Array (boxed) · acceso indexado 1-based ─────────────────────────
// El receptor es siempre un STArray; los elementos viven en el campo dedicado
// `elements`. at:/at:put: son 1-based (Smalltalk indexa desde 1, origin=dialecto vs el
// 0-based de JS, §5.4); un índice fuera de 1..size SEÑALA un Error capturable (L5).

/**
 * Convierte un índice Smalltalk (number|bigint) a entero JS, o señala si no es entero.
 * Para bigint, aplica el mismo guard de rango seguro que intervalEndpoint (#4 audit):
 * Number() de un bigint > 2^53-1 pierde precisión y podría indexar el slot equivocado
 * silenciosamente.
 */
function arrayIndex(arg: STValue, u: Universe): number {
  if (typeof arg === "number") return arg;
  if (typeof arg === "bigint") return safeIntFromBigInt(arg, "Array>>at:: índice", u);
  signalError(`Array>>at:: índice no entero`, u);
}

/** Array>>size — la cantidad de elementos (SmallInteger nativo). */
function arraySize(receiver: STValue): STValue {
  return (receiver as STArray).elements.length;
}

/** Array>>at: index — lee el elemento 1-based; fuera de 1..size señala un Error (L5). */
function arrayAt(receiver: STValue, args: STValue[], u: Universe): STValue {
  const arr = receiver as STArray;
  const i = arrayIndex(args[0] as STValue, u);
  if (i < 1 || i > arr.elements.length) {
    signalError(`Array>>at:: índice ${i} fuera de rango 1..${arr.elements.length}`, u);
  }
  return arr.elements[i - 1] as STValue;
}

/** Array>>at:put: index value — escribe el slot 1-based y devuelve el valor; fuera de rango señala. */
function arrayAtPut(receiver: STValue, args: STValue[], u: Universe): STValue {
  const arr = receiver as STArray;
  const i = arrayIndex(args[0] as STValue, u);
  const value = args[1] as STValue;
  if (i < 1 || i > arr.elements.length) {
    signalError(`Array>>at:put:: índice ${i} fuera de rango 1..${arr.elements.length}`, u);
  }
  arr.elements[i - 1] = value;
  return value;
}

// ── L4 F3 · enumeración base · do: (PRIMITIVA del hot-path de iteración) ─────
// do: itera `elements` reentrando al evaluador (evalBlock) con cada elemento. Es el
// CIMIENTO sobre el que Collection (.st) deriva collect:/select:/reject:/detect:/inject:
// /includes: por envíos puros. Instalado sobre Array y OrderedCollection (ambos llevan
// el campo `elements`). Devuelve el receptor (convención del bucle).

/** Collection>>do: aBlock — invoca el bloque por cada elemento (1-aridad). Devuelve self. */
function collectionDo(receiver: STValue, args: STValue[], u: Universe): STValue {
  const els = (receiver as STArray).elements;
  const block = args[0] as STClosure;
  for (const e of els) {
    evalBlock(block, [e], u);
  }
  return receiver;
}

// ── L4 F3 · OrderedCollection growable · add:/at:/at:put:/size + new ─────────
// Misma representación por campo `elements` que Array, pero de tamaño VARIABLE: add: hace
// push. at:/at:put:/size son 1-based (reusan el chequeo de rango y señalan vía L5).

/** OrderedCollection>>add: value — agrega al final (push) y devuelve el valor agregado. */
function orderedAdd(receiver: STValue, args: STValue[]): STValue {
  const oc = receiver as STOrderedCollection;
  const value = args[0] as STValue;
  oc.elements.push(value);
  return value;
}

/** Array>>add: — Array es de tamaño FIJO: add: SEÑALA un Error (shouldNotImplement, §5.4). */
function arrayAdd(_receiver: STValue, _args: STValue[], u: Universe): STValue {
  signalError(`Array>>add:: un Array es de tamaño fijo (use OrderedCollection)`, u);
}

/**
 * Collection class>>new — para OrderedCollection crea una instancia GROWABLE vacía
 * (campo `elements: []`), NO un basicNew con `pointers` (que no tendría `elements`).
 * El receptor es la clase OrderedCollection (vía su metaclase).
 */
function orderedNew(_receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeOrderedCollection([], u);
}

/**
 * OrderedCollection>>asArray — copia los elementos a un Array FRESCO (species). Es el
 * mecanismo con el que collect:/select:/reject: (Collection .st) producen un Array tras
 * acumular en una OrderedCollection growable (species = Array, origin=dialecto, §8.10).
 */
function orderedAsArray(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeArray((receiver as STOrderedCollection).elements.slice(), u);
}

// ── L4 F4/S3 · Interval COMPUTADO · do:/at:/size + construcción (to:/to:by:) ─
// El receptor es siempre un STInterval (campos from/to/by). El rango NO se materializa:
// size se calcula, at: computa el i-ésimo término, do: itera reentrando al evaluador.
// 1-based y origin=dialecto (igual que Array). collect:/select:/… los hereda de Collection.

/** Cantidad de términos de un Interval (from/to/by), >= 0. (10 to: 1) o paso adverso => 0. */
function intervalLength(iv: STInterval): number {
  const span = iv.to - iv.from;
  // Paso 0 sería un Interval mal formado; lo tratamos como vacío (defensivo, no debería ocurrir).
  if (iv.by === 0) return 0;
  const n = Math.floor(span / iv.by) + 1;
  return n > 0 ? n : 0;
}

/** Interval>>size — la cantidad de términos (SmallInteger nativo). */
function intervalSize(receiver: STValue): STValue {
  return intervalLength(receiver as STInterval);
}

/** Interval>>at: index — el i-ésimo término 1-based: from + (i-1)*by. Fuera de rango señala. */
function intervalAt(receiver: STValue, args: STValue[], u: Universe): STValue {
  const iv = receiver as STInterval;
  const i = arrayIndex(args[0] as STValue, u);
  const len = intervalLength(iv);
  if (i < 1 || i > len) {
    signalError(`Interval>>at:: índice ${i} fuera de rango 1..${len}`, u);
  }
  return iv.from + (i - 1) * iv.by;
}

/** Interval>>do: aBlock — itera los términos computados (from..to por by). Devuelve self. */
function intervalDo(receiver: STValue, args: STValue[], u: Universe): STValue {
  const iv = receiver as STInterval;
  const block = args[0] as STClosure;
  const len = intervalLength(iv);
  for (let k = 0; k < len; k++) {
    evalBlock(block, [iv.from + k * iv.by], u);
  }
  return receiver;
}

/**
 * safeIntFromBigInt — convierte un bigint a number JS SOLO si está dentro del rango
 * seguro de enteros IEEE 754 (|v| <= 9007199254740991 = 2^53-1). Fuera de ese rango,
 * Number() pierde precisión silenciosamente (p.ej. 9007199254740993n -> 9007199254740992),
 * produciendo índices erróneos o bucles de ~10^15 iteraciones. Señala un Error capturable
 * vía signalError. `label` identifica el operando en el mensaje de error.
 *
 * Fuente única de verdad reutilizada por arrayIndex (#4 audit), timesRepeat: (#5),
 * e intervalEndpoint (guardas pre-existentes de intervalos).
 */
function safeIntFromBigInt(v: bigint, label: string, u: Universe): number {
  if (v < -9007199254740991n || v > 9007199254740991n) {
    signalError(`${label} fuera del rango seguro de entero JS (${v.toString()})`, u);
  }
  return Number(v);
}

/**
 * Coerce un extremo/paso de Interval (receptor `to:`/arg) a un entero JS seguro, o SEÑALA
 * RUIDOSAMENTE. El STInterval guarda `from`/`to`/`by` como `number` (double): convertirlos
 * a ciegas con Number() esconde DOS trampas silenciosas (DRIFT-L4):
 *   (a) un Float boxed (p.ej. `0.5`) NO es number|bigint => Number(STFloat)===NaN, y el
 *       Interval colapsa a vacío (size 0) sin avisar. Un paso/extremo no entero NO está
 *       soportado en el MVP (Interval de enteros, §5.4); se DIFIERE en voz alta.
 *   (b) un bigint fuera de 2^53-1 colapsa su precisión con Number() (p.ej. 10^21+2 -> 10^21),
 *       dando size/at:/last erróneos Y un bucle de impresión que no avanza (1e21+1===1e21).
 * En ambos casos señalamos un Error genérico capturable (mismo enrutado L5 que at: fuera de
 * rango), en vez de miscomputar en silencio. `label` identifica el operando en el mensaje.
 *
 * EXPORTADO porque el special-form de bucle (to:do:/to:by:do:, eval.ts) DEBE aplicar el
 * MISMO guard sobre sus cotas/paso ANTES de iterar: el camino con bloque LITERAL nunca llega
 * a smallIntegerTo, así que sin este guard un `Number(bound)` ciego o (a) colapsa a NaN
 * (paso/cota Float => `i <= NaN` falso => 0 iteraciones SILENCIOSAS) o (b) corre ~10^21
 * iteraciones (cota bigint > 2^53-1 => CUELGA). Reusar el guard cierra ambos huecos.
 */
export function intervalEndpoint(v: STValue, label: string, u: Universe): number {
  if (isFloat(v)) {
    signalError(`Interval con ${label} no entero (${hostPrintString(v)}) no soportado (MVP)`, u);
  }
  if (typeof v === "bigint") {
    return safeIntFromBigInt(v, `Interval con ${label}`, u);
  }
  if (typeof v === "number") return v;
  // Cualquier otro STValue (Character, String, nil, …) no es un extremo numérico válido.
  signalError(`Interval con ${label} no numérico no soportado (MVP)`, u);
}

/**
 * SmallInteger>>to: stop — construye un Interval (from=self, to=stop, by=1). NO es el
 * special-form de bucle (ése es `to:do:` con bloque literal, reconocido en eval.ts ANTES
 * del envío). Un `(1 to: 5)` sin `do:` reifica el Interval; el caller decide qué hacer.
 */
function smallIntegerTo(receiver: STValue, args: STValue[], u: Universe): STValue {
  const from = intervalEndpoint(receiver, "inicio", u);
  const to = intervalEndpoint(args[0] as STValue, "fin", u);
  return makeInterval(from, to, 1, u);
}

/** SmallInteger>>to:by: stop step — Interval con paso explícito (from=self, to=stop, by=step). */
function smallIntegerToBy(receiver: STValue, args: STValue[], u: Universe): STValue {
  const from = intervalEndpoint(receiver, "inicio", u);
  const to = intervalEndpoint(args[0] as STValue, "fin", u);
  const by = intervalEndpoint(args[1] as STValue, "paso", u);
  return makeInterval(from, to, by, u);
}

/** SmallInteger>>/ (NUEVO L4 F2). Divisor 0 => SEÑALA ZeroDivide. Si algún operando es
 * Float => división Float. Entre enteros: EXACTA (resto 0) => Integer (SmallInteger/
 * bigint); NO-exacta => Float (Fraction DIFERIDA, desviación log L6).
 */
function smallIntegerDivide(receiver: STValue, args: STValue[], u: Universe): STValue {
  const b = args[0] as STValue;
  guardNumericOperand(receiver, b, "/", u);
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

function floatBinary(selector: string, op: (a: number, b: number) => number): Primitive {
  return (receiver, args, u) => {
    const b = args[0] as STValue;
    guardNumericOperand(receiver, b, selector, u);
    return makeFloat(op(asJsNumber(receiver), asJsNumber(b)), u);
  };
}

function floatCompare(selector: string, op: (a: number, b: number) => boolean): Primitive {
  return (receiver, args, u) => {
    const b = args[0] as STValue;
    guardNumericOperand(receiver, b, selector, u);
    return op(asJsNumber(receiver), asJsNumber(b));
  };
}

/** Float>>/ — divisor 0 => ZeroDivide (NO Infinity); si no, división Float. */
function floatDivide(receiver: STValue, args: STValue[], u: Universe): STValue {
  const b = args[0] as STValue;
  guardNumericOperand(receiver, b, "/", u);
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

function characterCompare(selector: string, op: (a: number, b: number) => boolean): Primitive {
  return (receiver, args, u) => {
    const b = args[0] as STValue;
    // Un Float boxed es un STObject: Number(<STObject>) daría NaN y TODA comparación
    // contra NaN sería false (un valor silenciosamente erróneo). Derivamos el double del
    // campo dedicado vía isFloat/isCharacter ANTES de caer al Number() de un entero nativo.
    // Un arg ni numérico ni Character (nil/String/...) NO puede compararse por code point:
    // señalamos un dNU capturable (mismo principio que el lado entero/Float) en vez de NaN.
    if (!isCharacter(b) && !isNumericOperand(b)) {
      guardNumericOperand(receiver, b, selector, u);
    }
    const bcp = isFloat(b)
      ? b.floatValue
      : isCharacter(b)
        ? b.codePoint
        : Number(b as number | bigint);
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

// ── L4 F6 · Stream EN MEMORIA · on:/next/nextPut:/atEnd/contents/upToEnd/reset ──
// El receptor de instancia es siempre un STStream (campos buffer/position/species). El stream
// es DUEÑO de su buffer (JS array de STValue); position es 0-based (índice del PRÓXIMO elemento).
// `on:` materializa el buffer desde un Array (elements) o un String (chars -> Characters boxed),
// recordando la especie para que contents/upToEnd rindan la colección de respaldo (DRIFT-7: los
// streams llevan su propio buffer, no dependen de `String new` ni de un String growable).

/**
 * desestructura el argumento de `on:` en (buffer, species): un Array boxed aporta una COPIA de
 * sus elementos (species=Array); un String boxed aporta sus chars como Characters boxed
 * (species=String); cualquier otro receptor cae a un Error capturable (no host). Un String vacío
 * o un Array vacío rinden un buffer vacío (el caso WriteStream típico: `on: ''` / `on: #()`).
 */
function streamBufferOf(
  arg: STValue,
  u: Universe,
): { buffer: STValue[]; species: "String" | "Array" } | null {
  if (isString(arg)) {
    const buffer: STValue[] = [];
    for (const ch of arg.chars) buffer.push(makeCharacter(ch.codePointAt(0) as number, u));
    return { buffer, species: "String" };
  }
  if (isArray(arg)) return { buffer: arg.elements.slice(), species: "Array" };
  return null;
}

/**
 * Stream class>>on: aCollection — construye un stream sobre una COPIA de la colección. Para un
 * ReadStream la position arranca en 0 (lee desde el inicio). Para Write/ReadWriteStream la
 * convención de escritura es position=0 sobre un buffer que se TRUNCA al escribir (un WriteStream
 * sobreescribe desde el inicio, ANSI: `WriteStream on:` ignora el contenido previo del backing y
 * comienza vacío) — por eso WriteStream arranca con buffer VACÍO conservando sólo la especie.
 * El receptor es la clase concreta (vía su metaclase); makeStream usa esa clase.
 */
function streamOn(receiver: STValue, args: STValue[], u: Universe): STValue {
  const cls = receiver as STClass;
  const parsed = streamBufferOf(args[0] as STValue, u);
  if (parsed === null) {
    return signalError("Stream class>>on: requiere una colección secuenciable (Array o String)", u);
  }
  // WriteStream sobreescribe desde el inicio: arranca VACÍO (sólo recuerda la especie del
  // respaldo). Read/ReadWriteStream leen la colección dada desde position 0.
  const writeOnly = cls.name === "WriteStream";
  const buffer = writeOnly ? [] : parsed.buffer;
  return makeStream(cls, buffer, 0, parsed.species);
}

/**
 * Stream>>next — devuelve el elemento en `position` y avanza. Pasado el final (atEnd) devuelve
 * `nil` (retorno UNSPECIFIED en ANSI; pandi-sm elige nil, DEV-042). NO señala error: leer de un
 * stream agotado es benigno (a diferencia de at: fuera de rango).
 */
function streamNext(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const s = receiver as STStream;
  if (s.position >= s.buffer.length) return u.nil;
  const value = s.buffer[s.position] as STValue;
  s.position += 1;
  return value;
}

/**
 * Stream>>nextPut: anObject — escribe en `position` (sobreescribe o extiende el buffer) y avanza.
 * Devuelve el objeto escrito (ANSI: nextPut: responde su argumento; DEV-042 lo fija). Para un
 * stream con backing String, un Character escrito conserva su caja (contents lo re-materializa).
 */
function streamNextPut(receiver: STValue, args: STValue[]): STValue {
  const s = receiver as STStream;
  const value = args[0] as STValue;
  s.buffer[s.position] = value;
  s.position += 1;
  return value;
}

/** Stream>>atEnd — true si position alcanzó el final del buffer (no hay más que leer). */
function streamAtEnd(receiver: STValue): STValue {
  const s = receiver as STStream;
  return s.position >= s.buffer.length;
}

/** materializa un buffer a la especie del stream: String (chars de los Characters) o Array. */
function materializeStream(buffer: STValue[], species: "String" | "Array", u: Universe): STValue {
  if (species === "String") {
    let chars = "";
    for (const e of buffer) {
      // El buffer de un stream-String guarda Characters boxed; reconstruimos sus chars. Un
      // elemento no-Character (defensivo) se imprime por su printString host.
      chars += isCharacter(e) ? String.fromCodePoint(e.codePoint) : hostPrintString(e);
    }
    return makeString(chars, u);
  }
  return makeArray(buffer.slice(), u);
}

/**
 * Stream>>contents — la colección COMPLETA acumulada (todo el buffer), materializada a la especie
 * del respaldo (String/Array), INDEPENDIENTE de la position. Para un WriteStream es lo escrito.
 */
function streamContents(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const s = receiver as STStream;
  return materializeStream(s.buffer, s.species, u);
}

/**
 * Stream>>upToEnd — el RESTO desde `position` hasta el final, materializado a la especie, y
 * avanza la position al final (consume lo entregado, ANSI). Vacío si ya estaba al final.
 */
function streamUpToEnd(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const s = receiver as STStream;
  const rest = s.buffer.slice(s.position);
  s.position = s.buffer.length;
  return materializeStream(rest, s.species, u);
}

/** Stream>>reset — vuelve la position al inicio (0); permite releer/sobreescribir. Devuelve self. */
function streamReset(receiver: STValue): STValue {
  const s = receiver as STStream;
  s.position = 0;
  return receiver;
}

/** Stream>>position — la posición actual 0-based (SmallInteger nativo). */
function streamPosition(receiver: STValue): STValue {
  return (receiver as STStream).position;
}

// ── L4 F5 · String (boxed) · igualdad por CONTENIDO + interning ──────────────
// La IDENTIDAD ('==') de un String boxed es por referencia (Object>>== vía identical(): dos
// cajas distintas NO son ==, GATE-F5). Pero la igualdad ('=') es por CONTENIDO: String>>=
// OVERRIDE el default Object>>= (que es identidad) comparando chars. Sin este override
// 'foo' = 'foo' (dos cajas distintas) daría false — regresión sobre f0-identity. Un Symbol
// (subclase de String) hereda esta '=' por contenido; su identidad interned (#foo == #foo)
// la da el == heredado de Object sobre el MISMO objeto interned.

/**
 * String>>= — igualdad por VALOR (texto); un no-String/Symbol NO es igual (ANSI Object>>=, sin
 * error). Un Symbol (< String) HEREDA esta '=', así que el RECEPTOR puede ser un String boxed
 * (.chars) o un Symbol (.text): textOf() unifica ambos. Sin desenvolver el receptor por texto,
 * `#foo = #foo` daba false (Symbol no es un String boxed) — no reflexiva (DEV-044).
 */
function stringEquals(receiver: STValue, args: STValue[]): STValue {
  const recvText = textOf(receiver);
  if (recvText === null) return false;
  // El argumento también puede ser String boxed o Symbol: comparamos por contenido textual
  // (Symbol < String), de modo que 'foo' = #foo y #foo = 'foo' siguen la igualdad por contenido.
  const argText = textOf(args[0] as STValue);
  if (argText === null) return false;
  return recvText === argText;
}
function stringNotEquals(receiver: STValue, args: STValue[]): STValue {
  return !(stringEquals(receiver, args) as boolean);
}

/**
 * Symbol>>= — igualdad por IDENTIDAD (override de la '=' por contenido que Symbol heredaría de
 * String). En ANSI/Pharo un Symbol es único por interning, así que su '=' ES '==': `#foo = #foo`
 * true (mismo objeto interned), pero `#foo = 'foo'` FALSE (un String NO es el Symbol, aunque
 * comparta los chars). Asimetría deliberada de Smalltalk: `'foo' = #foo` SÍ es true (String>>=
 * compara contenido y un Symbol < String aporta su .text). Sin este override, Symbol heredaba
 * stringEquals y `#foo = 'foo'` daba true (divergía del oráculo gst/Pharo — lo marcaría L6).
 */
function symbolEquals(receiver: STValue, args: STValue[]): STValue {
  return identical(receiver, args[0] as STValue);
}
/** Symbol>>~= — coherente con Symbol>>= por identidad (String>>~= llama a stringEquals por
 *  contenido directamente, no por dispatch, así que Symbol DEBE portar su propio ~=). */
function symbolNotEquals(receiver: STValue, args: STValue[]): STValue {
  return !(symbolEquals(receiver, args) as boolean);
}

/**
 * String>>, (concat) — devuelve un String FRESCO con los chars de self seguidos de los del
 * argumento. Es una operación a nivel de chars (no se expresa por do:/at: porque String no
 * hereda el protocolo de colección — DRIFT-6: el ',' de SequenceableCollection devolvería un
 * Array). Un argumento Symbol (< String) aporta su .text; un nativo (red de seguridad) su
 * propio valor; cualquier otro receptor/arg no-String señala un Error capturable (no host).
 */
function stringConcat(receiver: STValue, args: STValue[], u: Universe): STValue {
  // El receptor puede ser un String boxed (.chars) o un Symbol (.text) que HEREDA este ','.
  const head = textOf(receiver);
  if (head === null) {
    return signalError("String>>, requiere un receptor String", u);
  }
  const arg = args[0] as STValue;
  // Un argumento String/Symbol aporta su texto; un nativo (red de seguridad) su propio valor.
  const tail = textOf(arg) ?? (typeof arg === "string" ? arg : null);
  if (tail === null) {
    return signalError("String>>, requiere un argumento String", u);
  }
  return makeString(head + tail, u);
}

/**
 * String>>size — cantidad de CODEPOINTS (no unidades UTF-16). Symbol < String hereda.
 *
 * (#7 audit) text.length cuenta unidades UTF-16: un carácter astral (p.ej. U+1F600 😀)
 * tiene length=2 pero es 1 codepoint. streamBufferOf construye un STCharacter POR
 * CODEPOINT via for...of, por lo que devolver text.length producía una asimetría:
 * `'😀' size` → 2 pero `'😀' readStream size` → 1. Ahora usamos [...text].length
 * (iteración Unicode sobre codepoints), de modo que size y stream coinciden.
 */
function stringSize(receiver: STValue, _args: STValue[], u: Universe): STValue {
  // String boxed (.chars) o Symbol (.text, < String hereda size): textOf unifica ambos.
  const text = textOf(receiver);
  if (text === null) return signalError("String>>size requiere un receptor String", u);
  // [...text] itera codepoints (mismo modelo que streamBufferOf); evita asimetría con
  // strings que contienen caracteres astrales (pares sustitutos UTF-16).
  return [...text].length;
}

/**
 * String>>asSymbol — interna los chars en la MISMA SymbolTable que da identidad a los
 * selectores y literales #foo, de modo que 'foo' asSymbol == #foo es true por IDENTIDAD
 * (el mismo objeto interned). Reusa u.symbols.intern (no construye un Symbol nuevo).
 */
function stringAsSymbol(receiver: STValue, _args: STValue[], u: Universe): STValue {
  // El receptor puede ser un String boxed (.chars) o un Symbol (.text) que HEREDA asSymbol
  // (ANSI Symbol>>asSymbol es ^self; re-internar su .text devuelve el MISMO objeto interned, así
  // que #foo asSymbol == #foo). Antes leía sólo .chars y un Symbol caía a "" => # (DEV-045).
  const text = textOf(receiver);
  return u.symbols.intern(text ?? "");
}

/**
 * String>>hash (heredado por Symbol) — hash por CONTENIDO, consistente con String>>= por valor
 * (Smalltalk: a = b => a hash = b hash; lo exige el contrato Dictionary/Set). El default
 * Object>>hash es identityHash (por objeto, monótono), así que 'foo' hash ~= 'foo' copy hash
 * y dos cajas iguales mis-bucketean (DEV-046). Reusa el hash de string estilo Java de
 * identityHashOf aplicado al texto (textOf unifica String boxed y Symbol). El identityHash POR
 * OBJETO (Object>>identityHash) se conserva intacto — sólo `hash` pasa a ser por contenido.
 */
function stringHash(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const text = textOf(receiver);
  if (text === null) return identityHashOf(receiver, u);
  // identityHashOf() ya implementa el hash estilo Java para un string JS nativo; lo reusamos
  // sobre el texto desenvuelto en vez de duplicar el algoritmo.
  return identityHashOf(text, u);
}

/**
 * String class>>new — un String boxed VACÍO (chars ''), no el basicNew de Object class (que daría
 * un STObject SIN campo `chars`, sobre el que size/,/= misfire — isString() lo rechaza, DEV-047).
 * Override en la metaclase de String. ANSI `String new` (sin tamaño) es la cadena vacía; el
 * String mutable growable completo (at:put: que crece) queda diferido (DEV-047, no lo pide F5).
 */
function stringClassNew(_receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeString("", u);
}

/**
 * Symbol>>asString — devuelve un String BOXED con los chars del símbolo (ANSI: asString es
 * un String mutable independiente). El receptor es un STSymbol (plain object {text}); su
 * .text es el string JS interno que boxeamos. NO devuelve el mismo objeto (un String no es
 * interned), así que 'foo' = #foo asString es true por contenido pero no por identidad.
 */
function symbolAsString(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const text = (receiver as STSymbol).text;
  return makeString(text, u);
}

/** Transcript>>show: acumula el argumento (texto) en el buffer del Transcript. */
function transcriptShow(receiver: STValue, args: STValue[], u: Universe): STValue {
  const transcript = receiver as import("../runtime/index.js").STObject;
  const prev = typeof transcript.pointers[0] === "string" ? transcript.pointers[0] : "";
  // El buffer del Transcript es un string JS nativo INTERNO (lo lee el adapter). El arg de
  // show: ahora llega como STString boxed (el literal ya no es nativo): lo desenvolvemos a
  // .chars antes de acumular. Un nativo (red de seguridad) o no-string conservan lo previo.
  const arg = args[0] as STValue;
  const text = isString(arg) ? arg.chars : typeof arg === "string" ? arg : String(arg);
  transcript.pointers[0] = prev + text;
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
 *
 * (#5 audit) Un receptor bigint > 2^53-1 causaba un bucle de ~10^15 iteraciones por
 * Number() sin guard. Ahora aplicamos safeIntFromBigInt (misma lógica que intervalEndpoint)
 * para señalar un Error capturable antes de iterar.
 */
function timesRepeat(receiver: STValue, args: STValue[], u: Universe): STValue {
  const raw = receiver as number | bigint;
  const n =
    typeof raw === "bigint" ? safeIntFromBigInt(raw, "timesRepeat: contador", u) : Number(raw);
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
  if (isSymbol(receiver)) return u.Symbol.name;
  return receiver.class.name;
}

/**
 * Comparaciones de SmallInteger (< > <= >= = ~=). Devuelven booleanos nativos JS
 * (classOf los mapea a True/False). number|bigint comparan numéricamente entre sí;
 * BigInt(a) <op> BigInt(b) cuando alguno es bigint, evitando coerción a number.
 *
 * VALIDACIÓN DE OPERANDO (ronda 2): un arg no-numérico revienta BigInt(STObject) con un
 * TypeError de host INCAPTURABLE. Para las comparaciones ORDENADAS (selector !== "=" y
 * "~=") señalamos un dNU capturable por on:do: vía guardNumericOperand. Para la IGUALDAD
 * (=/~=) un no-número NO es igual (semántica ANSI Object>>=): "=" => false, "~=" => true,
 * NUNCA un error.
 */
function compareSmallInteger(
  selector: string,
  op: (a: bigint, b: bigint) => boolean,
  fop: (a: number, b: number) => boolean,
): Primitive {
  const isEquality = selector === "=" || selector === "~=";
  return (receiver: STValue, args: STValue[], u: Universe): STValue => {
    const b = args[0] as STValue;
    if (!isNumericOperand(b)) {
      // Igualdad con no-número => false/true; comparación ordenada => dNU capturable.
      if (isEquality) return selector === "~=";
      guardNumericOperand(receiver, b, selector, u);
    }
    // L4 F2 · mixto con Float: compara como double (la presencia de un Float promueve
    // la comparación a Float; el resultado es Boolean nativo, NO se boxea).
    if (isFloat(b)) {
      return fop(Number(receiver as number | bigint), (b as STFloat).floatValue);
    }
    // BigInt en ambos lados: compara number y bigint correctamente sin coerción
    // lossy a number (un SmallInteger puede ser bigint tras promoción por overflow).
    return op(BigInt(receiver as number | bigint), BigInt(b as number | bigint));
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

/**
 * instVarAt: index — lee la ivar 1-based del receptor (reflexión, plan §5.2). Delega en
 * la función de runtime (mismo chequeo de rango). Sólo aplica a STObjects con `pointers`
 * (un inmediato no tiene ivars). Hace observable la acumulación de instSize (DEV-025):
 * una subclase con ivars heredados tiene esos slots.
 */
function objectInstVarAt(receiver: STValue, args: STValue[], u: Universe): STValue {
  // Inmediatos (número, bigint, booleano) y STSymbol (sin slot `class`) no tienen ivars.
  // Señalar un Error capturable (L5) en lugar de dejar que .pointers sea undefined y
  // cause un TypeError de host imparseable.
  if (
    typeof receiver !== "object" ||
    receiver === null ||
    !("class" in receiver) ||
    !Array.isArray((receiver as STObject).pointers)
  ) {
    return signalError("instVarAt:: el receptor no es un STObject con ivars", u);
  }
  const obj = receiver as STObject;
  const i = Number(args[0] as number | bigint);
  // Fuera de 1..instSize SEÑALA un Error capturable (L5), igual que Array>>at: — NO un
  // throw de host imparseable. instVarAtOf re-chequea (defensa en profundidad), pero el
  // guard de aquí lo hace inalcanzable para el caso fuera de rango.
  if (i < 1 || i > obj.pointers.length) {
    signalError(`instVarAt:: índice ${i} fuera de rango 1..${obj.pointers.length}`, u);
  }
  return instVarAtOf(obj, i);
}

/** instVarAt:put: index value — escribe la ivar 1-based del receptor y devuelve el valor. */
function objectInstVarAtPut(receiver: STValue, args: STValue[], u: Universe): STValue {
  // Misma guardia que objectInstVarAt: señalar Error capturable si el receptor es inmediato.
  if (
    typeof receiver !== "object" ||
    receiver === null ||
    !("class" in receiver) ||
    !Array.isArray((receiver as STObject).pointers)
  ) {
    return signalError("instVarAt:put:: el receptor no es un STObject con ivars", u);
  }
  const obj = receiver as STObject;
  const i = Number(args[0] as number | bigint);
  if (i < 1 || i > obj.pointers.length) {
    signalError(`instVarAt:put:: índice ${i} fuera de rango 1..${obj.pointers.length}`, u);
  }
  return instVarAtPutOf(obj, i, args[1] as STValue);
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
  // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
  const sym = u.symbols.intern(stSymbolText(args[0]!));
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
  // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
  const selector = stSymbolText(args[0]!);
  // args[1] puede ser un STArray boxed (desde Smalltalk) o un array JS nativo (desde tests)
  const raw = args[1];
  const argArray: STValue[] =
    raw !== null &&
    raw !== undefined &&
    typeof raw === "object" &&
    "class" in raw &&
    Array.isArray((raw as unknown as { elements?: unknown }).elements)
      ? ((raw as unknown as { elements: STValue[] }).elements as STValue[])
      : ((raw ?? []) as STValue[]);
  return send(receiver, selector, argArray, u);
}

/** perform: (aridad 0) — perform:withArguments: con array vacío. */
function objectPerform(receiver: STValue, args: STValue[], u: Universe): STValue {
  // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
  return send(receiver, stSymbolText(args[0]!), [], u);
}

/** perform:with: (aridad 1) — un argumento posicional reenviado. */
function objectPerformWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
  return send(receiver, stSymbolText(args[0]!), [args[1] as STValue], u);
}

/** perform:with:with: (aridad 2). */
function objectPerformWithWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
  return send(receiver, stSymbolText(args[0]!), [args[1] as STValue, args[2] as STValue], u);
}

/** perform:with:with:with: (aridad 3). */
function objectPerformWithWithWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  return send(
    receiver,
    // biome-ignore lint/style/noNonNullAssertion: args[0] siempre presente en dispatch
    stSymbolText(args[0]!),
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
  const result: STObject = {
    ...receiver,
    hash: basicNew(receiver.class, u).hash,
    pointers: receiver.pointers.slice(),
  };
  // Fix S1-#3: STArray y STOrderedCollection tienen un campo `elements` independiente
  // del `pointers` de STObject. Sin este slice, la copia comparte la misma referencia
  // de array que el original y cualquier mutación (at:put:, add:) corrompe el original.
  if (isArray(result as STValue)) {
    (result as unknown as STArray).elements = (receiver as unknown as STArray).elements.slice();
  }
  // STStream tiene un campo `buffer` análogo: también lo aislamos.
  if (isStream(result as STValue)) {
    (result as unknown as STStream).buffer = (receiver as unknown as STStream).buffer.slice();
  }
  return result;
}

/**
 * error: — señala un error con el mensaje argumento. En L2/L3 lanza un Error de
 * host OBSERVABLE y determinista (full Exception navegable, capturable con on:do:,
 * es L5, diferido). Esto refleja la decisión §5.2 línea 336.
 */
function objectError(_receiver: STValue, args: STValue[]): STValue {
  // El arg de `error:` ahora llega como STString boxed (el literal ya no es nativo): lo
  // desenvolvemos a .chars para que el texto del error de host sea el real (String(STObject)
  // daría '[object Object]'). Un string JS nativo (red de seguridad) o cualquier otro valor
  // conservan el comportamiento previo.
  const arg = args[0] as STValue;
  const msg = isString(arg) ? arg.chars : typeof arg === "string" ? arg : String(arg);
  throw new Error(msg);
}

/**
 * printString — texto del receptor. DELEGA en el bridge host print.ts para que el
 * send y la función host CONCUERDEN (el harness compara con === la salida host).
 * print.ts NO se elimina: es la fuente única de verdad de la representación.
 */
function objectPrintString(receiver: STValue, _args: STValue[], u: Universe): STValue {
  // El SEND debe devolver un String boxed (capa de valor de usuario), no un string JS
  // nativo: de lo contrario `x printString == y printString` compararía por valor (hueco
  // de identidad, GATE-L4-IDENTITY) y `(3 printString) asSymbol` internaría '' (textOf de
  // un nativo es null). hostPrintString sigue siendo la fuente única de la representación;
  // sólo BOXEAMOS su salida al cruzar a la capa de usuario.
  return makeString(hostPrintString(receiver), u);
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

/**
 * stSymbolText — desenvuelve un STSymbol boxed o STString boxed a su string JS.
 * Reutiliza `textOf` (fuente única de verdad en runtime/object.ts) y añade
 * un fallback para strings JS nativos (red de seguridad interna). Usado por
 * perform: y respondsTo: para extraer el selector antes de pasarlo a send()/intern().
 */
function stSymbolText(arg: STValue): string {
  const t = textOf(arg);
  if (t !== null) return t;
  if (typeof arg === "string") return arg;
  throw new Error(`stSymbolText: se esperaba STSymbol/STString/string, recibió ${String(arg)}`);
}

// ─────────────────────────────────────────────────────────────────────────
// KERNELLOAD §5.4.0 · primitivas de DEFINICIÓN del lado del metamodelo. Ancladas
// por selector e instaladas en Class.methodDict, NO sintaxis especial: `Object
// subclass: #Foo ...` es un keyword-send ordinario cuyo receptor es la STClass
// Object. Todas enrutan al CAMINO ÚNICO de construcción (makeClassWithMetaclass),
// reusando la lógica de braid del bootstrap (sin camino divergente).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Lee el nombre de clase de un argumento: un STString boxed (su .chars), un STSymbol (su
 * .text) o un string JS nativo (red de seguridad interna). `subclass: #Foo` pasa un Symbol;
 * `subclass: 'Foo'` ahora pasa un STString boxed (el literal ya no es nativo) — ambos se
 * desenvuelven al string JS que el constructor necesita.
 */
function classNameArg(arg: STValue): string {
  // textOf desenvuelve un String boxed (.chars) o un Symbol (.text); el nativo es red de seguridad.
  const text = textOf(arg);
  if (text !== null) return text;
  if (typeof arg === "string") return arg;
  throw new Error("subclass: nombre de clase inválido (se esperaba un símbolo o string)");
}

/**
 * Deriva instSize de un `instanceVariableNames:` ('a b c' -> 3). Cuenta los
 * tokens separados por espacios; cadena vacía/sólo-espacios -> 0. Las class-vars
 * y el package se aceptan pero el loader las ignora en esta capa (documentado).
 */
function countIvars(arg: STValue | undefined): number {
  // El arg de instanceVariableNames: ('a b c') ahora llega como STString boxed (el literal ya
  // no es nativo). Desenvolvemos .chars; si fuera un string JS nativo (red de seguridad) o
  // cualquier otra cosa, el comportamiento previo se conserva (no-string => 0 ivars).
  if (arg === undefined) return 0;
  const chars = isString(arg) ? arg.chars : typeof arg === "string" ? arg : null;
  if (chars === null) return 0;
  const trimmed = chars.trim();
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
  // Guard: reject duplicate class names (finding #22). loadKernelSources already
  // throws KernelLoadError{kind:'duplicate-class'}; here we signal a capturable Error.
  if (u.namespace.has(name)) {
    signalError(`subclass:: '${name}' ya existe en el namespace`, u);
  }
  // DEV-025: instSize ACUMULATIVO = ivars propios + instSize de la superclase. Una
  // subclase hereda los slots de su super, así que su instancia tiene tantos slots
  // como toda la cadena (sin esto, instVarAt: del slot heredado caería fuera de rango).
  const instSize = countIvars(args[1]) + superclass.instSize;
  return makeClassWithMetaclass(name, superclass, instSize, u);
}

/** Variante corta `subclass:` (sin ivars/class-vars/package): hereda los slots de la super. */
function subclassShort(receiver: STValue, args: STValue[], u: Universe): STValue {
  const superclass = receiver as STClass;
  const name = classNameArg(args[0] as STValue);
  // Guard: reject duplicate class names (finding #22).
  if (u.namespace.has(name)) {
    signalError(`subclass:: '${name}' ya existe en el namespace`, u);
  }
  // DEV-025: sin ivars propios, pero hereda los slots de la superclase (acumulativo).
  return makeClassWithMetaclass(name, superclass, superclass.instSize, u);
}

/**
 * Behavior>>name — el nombre de la clase receptora como String BOXED (ANSI Behavior>>name
 * es un String). EL leak clave de la frontera: `aClass name` llega a código de usuario, así
 * que debe ser un STString (no el campo nativo STClass.name de almacenamiento), que responde
 * protocolo (=/,/printString). El bridge print.ts lo des-boxea, así que `X class name`
 * impreso sigue dando el texto.
 */
function classNamePrim(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return makeString((receiver as STClass).name, u);
}

/** ClassDescription>>instanceVariableNames: — ajusta instSize (acumulativo, DEV-025). */
function classInstanceVariableNames(receiver: STValue, args: STValue[]): STValue {
  const cls = receiver as STClass;
  // DEV-025: cuenta los ivars PROPIOS y suma los slots heredados de la superclase.
  const superInstSize =
    cls.superclass !== null && "methodDict" in cls.superclass
      ? (cls.superclass as STClass).instSize
      : 0;
  cls.instSize = countIvars(args[0]) + superInstSize;
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
  // L4 F4/S3 · to:/to:by: construyen un Interval (NO el special-form de bucle, que es
  // to:do:/to:by:do: con bloque literal, reconocido en eval.ts ANTES del envío).
  u.SmallInteger.methodDict.set(u.symbols.intern("to:"), smallIntegerTo);
  u.SmallInteger.methodDict.set(u.symbols.intern("to:by:"), smallIntegerToBy);
  // Comparaciones: devuelven booleanos nativos (true/false -> True/False). El 2º
  // comparador (sobre double) cubre el caso mixto con Float (L4 F2).
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<"),
    compareSmallInteger(
      "<",
      (a, b) => a < b,
      (a, b) => a < b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">"),
    compareSmallInteger(
      ">",
      (a, b) => a > b,
      (a, b) => a > b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("<="),
    compareSmallInteger(
      "<=",
      (a, b) => a <= b,
      (a, b) => a <= b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern(">="),
    compareSmallInteger(
      ">=",
      (a, b) => a >= b,
      (a, b) => a >= b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("="),
    compareSmallInteger(
      "=",
      (a, b) => a === b,
      (a, b) => a === b,
    ),
  );
  u.SmallInteger.methodDict.set(
    u.symbols.intern("~="),
    compareSmallInteger(
      "~=",
      (a, b) => a !== b,
      (a, b) => a !== b,
    ),
  );
  // ── L4 F2 · Float (boxed) · aritmética + comparación + abs/negated ──────────
  u.Float.methodDict.set(
    u.symbols.intern("+"),
    floatBinary("+", (a, b) => a + b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("-"),
    floatBinary("-", (a, b) => a - b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("*"),
    floatBinary("*", (a, b) => a * b),
  );
  u.Float.methodDict.set(u.symbols.intern("/"), floatDivide);
  u.Float.methodDict.set(u.symbols.intern("abs"), floatAbs);
  u.Float.methodDict.set(u.symbols.intern("negated"), floatNegated);
  u.Float.methodDict.set(
    u.symbols.intern("<"),
    floatCompare("<", (a, b) => a < b),
  );
  u.Float.methodDict.set(
    u.symbols.intern(">"),
    floatCompare(">", (a, b) => a > b),
  );
  u.Float.methodDict.set(
    u.symbols.intern("<="),
    floatCompare("<=", (a, b) => a <= b),
  );
  u.Float.methodDict.set(
    u.symbols.intern(">="),
    floatCompare(">=", (a, b) => a >= b),
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
    characterCompare("<", (a, b) => a < b),
  );
  u.Character.methodDict.set(
    u.symbols.intern(">"),
    characterCompare(">", (a, b) => a > b),
  );
  u.Character.methodDict.set(
    u.symbols.intern("<="),
    characterCompare("<=", (a, b) => a <= b),
  );
  u.Character.methodDict.set(
    u.symbols.intern(">="),
    characterCompare(">=", (a, b) => a >= b),
  );
  u.Character.methodDict.set(u.symbols.intern("="), characterEquals);
  u.Character.methodDict.set(u.symbols.intern("~="), characterNotEquals);
  // ── L4 F5 · String (boxed) · = por contenido (override de Object>>= identidad) + interning ──
  // Symbol (< String) HEREDA = / ~= / asSymbol; Symbol>>asString se instala aparte (boxea su .text).
  u.String.methodDict.set(u.symbols.intern("="), stringEquals);
  u.String.methodDict.set(u.symbols.intern("~="), stringNotEquals);
  u.String.methodDict.set(u.symbols.intern("asSymbol"), stringAsSymbol);
  // , (concat) y size son a nivel de chars: String NO hereda el protocolo de SequenceableCollection
  // (su ',' devolvería un Array — DRIFT-6), así que String porta el suyo propio (devuelve String).
  // Symbol (< String) HEREDA , / size; Symbol>>asString se instala aparte (boxea su .text).
  u.String.methodDict.set(u.symbols.intern(","), stringConcat);
  u.String.methodDict.set(u.symbols.intern("size"), stringSize);
  // hash por CONTENIDO (override del default Object>>hash por objeto): a = b => a hash = b hash
  // (contrato Dictionary/Set). Symbol (< String) lo hereda; identityHash sigue por objeto.
  u.String.methodDict.set(u.symbols.intern("hash"), stringHash);
  // String class>>new => '' boxed (no el basicNew de Object class, que daría un String roto).
  u.String.class.methodDict.set(u.symbols.intern("new"), stringClassNew);
  u.Symbol.methodDict.set(u.symbols.intern("asString"), symbolAsString);
  // Symbol>>= / ~= por IDENTIDAD (override del = por contenido heredado de String): #foo = #foo
  // true (interned), #foo = 'foo' false (ANSI/Pharo Symbol identity-=). 'foo' = #foo sigue true
  // (String>>= por contenido — asimetría deliberada de Smalltalk).
  u.Symbol.methodDict.set(u.symbols.intern("="), symbolEquals);
  u.Symbol.methodDict.set(u.symbols.intern("~="), symbolNotEquals);
  // ── L4 F4 · Array (boxed) · acceso indexado 1-based (at:/at:put:/size) ──────
  // at: fuera de 1..size SEÑALA un Error (L5), capturable por on: Error do:.
  u.Array.methodDict.set(u.symbols.intern("at:"), arrayAt);
  u.Array.methodDict.set(u.symbols.intern("at:put:"), arrayAtPut);
  u.Array.methodDict.set(u.symbols.intern("size"), arraySize);
  // L4 F3 · do: es el cimiento de la enumeración (primitiva del hot-path). Se instala en
  // Collection (heredada por Array/OrderedCollection/Interval); at:/at:put:/size siguen
  // siendo primitivas concretas porque Interval no las comparte (S3 las redefine).
  u.namespace.get("Collection")?.methodDict.set(u.symbols.intern("do:"), collectionDo);
  // Array>>add: señala (tamaño fijo); OrderedCollection es la colección growable.
  u.Array.methodDict.set(u.symbols.intern("add:"), arrayAdd);
  u.OrderedCollection.methodDict.set(u.symbols.intern("at:"), arrayAt);
  u.OrderedCollection.methodDict.set(u.symbols.intern("at:put:"), arrayAtPut);
  u.OrderedCollection.methodDict.set(u.symbols.intern("size"), arraySize);
  u.OrderedCollection.methodDict.set(u.symbols.intern("add:"), orderedAdd);
  u.OrderedCollection.methodDict.set(u.symbols.intern("asArray"), orderedAsArray);
  // ── L4 F4/S3 · Interval COMPUTADO · do:/at:/size propios (no leen `elements`) ──
  // do: NO se hereda de Collection (esa primitiva itera `elements`, que Interval no tiene):
  // Interval instala su PROPIA do:/at:/size que computan desde from/to/by. collect:/select:/
  // …/inject:into:/includes: SÍ se heredan de Collection (sólo necesitan do:).
  u.Interval.methodDict.set(u.symbols.intern("do:"), intervalDo);
  u.Interval.methodDict.set(u.symbols.intern("at:"), intervalAt);
  u.Interval.methodDict.set(u.symbols.intern("size"), intervalSize);
  // new growable (campo `elements: []`) en la metaclase de OrderedCollection (override del
  // new de Object class, que daría un basicNew sin `elements`).
  u.OrderedCollection.class.methodDict.set(u.symbols.intern("new"), orderedNew);
  // ── L4 F6 · Stream EN MEMORIA · protocolo de instancia en Stream (heredado por toda la
  // jerarquía) + `on:` en la metaclase de cada clase concreta (Read/Write/ReadWriteStream).
  u.Stream.methodDict.set(u.symbols.intern("next"), streamNext);
  u.Stream.methodDict.set(u.symbols.intern("nextPut:"), streamNextPut);
  u.Stream.methodDict.set(u.symbols.intern("atEnd"), streamAtEnd);
  u.Stream.methodDict.set(u.symbols.intern("contents"), streamContents);
  u.Stream.methodDict.set(u.symbols.intern("upToEnd"), streamUpToEnd);
  u.Stream.methodDict.set(u.symbols.intern("reset"), streamReset);
  u.Stream.methodDict.set(u.symbols.intern("position"), streamPosition);
  // `on:` en la metaclase de cada clase CONCRETA: streamOn usa el nombre de la clase receptora
  // para decidir si arranca vacío (WriteStream sobreescribe) o sobre la colección dada (Read/RW).
  for (const cls of [u.ReadStream, u.WriteStream, u.ReadWriteStream]) {
    cls.class.methodDict.set(u.symbols.intern("on:"), streamOn);
  }
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
  // Reflexión de ivars indexadas (1-based): hacen observable el instSize acumulativo (DEV-025).
  u.Object.methodDict.set(u.symbols.intern("instVarAt:"), objectInstVarAt);
  u.Object.methodDict.set(u.symbols.intern("instVarAt:put:"), objectInstVarAtPut);
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
