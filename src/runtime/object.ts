// L2 · Object model (MÍNIMO, walking skeleton — plan §4/§5.2 "alcance in").
// Un objeto Smalltalk es un plain JS object con slots indexados
// { class, hash, format, pointers } — sin object table, sin tagging/boxing.
// SmallInteger y String son VALORES NATIVOS JS (no STObject); classOf los mapea
// sin convertirlos. El cierre metacircular completo y el protocolo de 23
// selectores son L2-proper (diferidos); aquí sólo cableamos lo que send() (L3)
// necesita para hacer lookup por la superclass chain.

import type { STSymbol, SymbolId, SymbolTable } from "./symbol-table.js";

/** Formato mínimo de objeto (plan §5.2 enumera el set completo; el skeleton sólo distingue Pointers). */
export enum ObjectFormat {
  Pointers = 0,
}

/**
 * Primitiva del kernel instalada en un methodDict por L3. En L2 sólo declaramos
 * el tipo (los methodDict nacen vacíos); L3 aporta la firma real de invocación.
 */
export type Primitive = (receiver: STValue, args: STValue[], u: Universe) => STValue;

/** Objeto Smalltalk: plain JS object, ivars indexadas, sin object table. */
export interface STObject {
  class: STClass;
  hash: number;
  format: ObjectFormat;
  pointers: STValue[];
}

/**
 * Marcador de "home context" (plan §5.3): identidad por referencia (`===`). Un
 * `^` dentro de un bloque desenrolla hasta el home capturado en su creación. En
 * S1 el cierre sólo lo guarda; el unwind por NonLocalReturn llega en S3.
 */
export type HomeMarker = object;

/**
 * NonLocalReturn — objeto de control-flow del `^` (plan §2/§5.3, V8-2): una clase
 * JS PLANA (NO extends Error) para evitar la captura de stack de V8 en el hot path.
 * evalNode(ReturnNode) lanza este objeto; la frontera de programa/método cuyo
 * `home === e.home` lo captura y lo convierte en su valor de retorno; un home
 * ajeno se relanza (BlockCannotReturn para un home muerto es L5, diferido). La
 * misma maquinaria la reutiliza L5 para el unwind de excepciones.
 */
export class NonLocalReturn {
  constructor(
    readonly home: HomeMarker,
    readonly value: STValue,
  ) {}
}

/**
 * SignalException — objeto de control-flow de L5 (plan §5.5/§5.5.1 B, V8-2): un
 * envoltorio JS PLANO (NO extends Error, igual que NonLocalReturn) de la instancia
 * Smalltalk de excepción. Se CONSTRUYE en signal(); rara vez se lanza (el handler
 * corre sobre el frame vivo del signal, fase 1). messageText vive en el envoltorio
 * para esquivar el drift de instSize-no-acumulativo (S2 lo cablea). En S1 sólo
 * declaramos la forma para que el unwind compartido la tipe sin acoplar.
 */
export class SignalException {
  messageText?: STValue;
  constructor(readonly st: STObject) {}
}

/**
 * Unwind — objeto de control-flow de la FASE 2 de L5 (plan §5.5.1 G, V8-2): un
 * objeto JS PLANO (NO extends Error) que return:/retry/retryUsing:/fallOff lanzan
 * para abandonar el frame del signal hacia su on:do:. Mismo patrón de identidad
 * por marcador que NonLocalReturn (marker capturado por el frame de on:do:).
 * unwindTo() (compartida L3↔L5) lo propaga corriendo los ensure:/ifCurtailed:
 * intermedios en orden inverso. En S1 sólo lo declaramos (on:do:/signal son S2+).
 */
export class Unwind {
  constructor(
    readonly marker: HomeMarker,
    readonly value: STValue,
    readonly curtailed: boolean,
    readonly retry = false,
    readonly retryBlock: STValue | null = null,
  ) {}
}

/**
 * HandlerActionSignal — transferencia NO LOCAL de una acción de handler (return:/
 * resume:/retry/retryUsing:/pass) hacia el frame de signal() que corre el handler
 * block (plan §5.5.1 C/G). Objeto JS PLANO (NO extends Error, igual que Unwind/
 * NonLocalReturn). El handler block ABANDONA inmediatamente al invocar la acción
 * (las sentencias posteriores son inalcanzables; gana la PRIMERA acción). `token`
 * identifica la activación de signal() que debe interceptarlo: un signal re-entrante
 * dentro del handler block tiene su propio token, así su acción no se confunde con
 * la del handler externo. `value`/`block` portan el argumento de la acción.
 */
export type HandlerActionKind = "return" | "retry" | "retryUsing" | "resume" | "pass";

export class HandlerActionSignal {
  constructor(
    readonly token: object,
    readonly kind: HandlerActionKind,
    readonly value: STValue,
    readonly block: STValue | null = null,
  ) {}
}

/**
 * HandlerContext — entrada de la handlerStack del heap (plan §5.5.1 §523/G). Un
 * on:do: empuja uno por handler; signal() la recorre de tope a base buscando el
 * primer `active` cuyo exceptionClass `handles:` la excepción. `active=false`
 * mientras su handlerBlock corre (deshabilitado durante su propio block, Pharo).
 * En S1 sólo declaramos la forma + la pila vacía en el Universe (la usa S2).
 */
export interface HandlerContext {
  exceptionClass: STValue;
  handlerBlock: STValue;
  protectedBlock: STValue;
  marker: HomeMarker;
  active: boolean;
}

/**
 * Message — reificación MÍNIMA de un envío no entendido (plan §5.3 / L5 dNU): el
 * selector ausente y los argumentos, que Object>>doesNotUnderstand: recibe. El
 * MessageNotUnderstood completo (Exception navegable) es L5; aquí basta lo
 * observable para un error determinista.
 */
export interface Message {
  selector: string;
  args: STValue[];
}

/**
 * Scope léxico (plan §5.3): cadena de entornos. `vars` son las temporaries/params
 * (mutación compartida por referencia — un temp mutado en un bloque es visible al
 * home). `self` se resuelve aquí (NO vía vars). `home` identifica el método/programa
 * para el desenrollado de `^`.
 */
export interface Scope {
  vars: Map<string, STValue>;
  parent: Scope | null;
  self: STValue;
  home: HomeMarker;
}

/**
 * BlockClosure: un STObject (class = u.BlockClosure) con campos extra. Reusa la
 * forma de STObject para que classOf lo despache por `.class` sin ramas nuevas;
 * `node`/`scope`/`home` son el cuerpo, el entorno capturado y el home de `^`.
 */
export interface STClosure extends STObject {
  // El AST del bloque vive en src/ast; lo tipamos laxo aquí para no acoplar
  // runtime->ast (la primitiva value/value: lo interpreta).
  node: import("../ast/nodes.js").BlockNode;
  scope: Scope;
  home: HomeMarker;
  // Clase DEFINIDORA del método donde se creó el bloque (KERNELLOAD §5.4.0): permite
  // que un `super sel` DENTRO del bloque arranque el lookup en su superclase aunque
  // el bloque se invoque después (vía value/value:/whileTrue:). undefined a tope de
  // programa o en un bloque fuera de un método de usuario.
  definingClass?: STClass;
}

/**
 * STFloat — Float BOXED (L4 F2): un STObject (class = u.Float) que porta el double
 * JS en un campo dedicado `floatValue` (NO en un slot de `pointers`, para esquivar
 * el drift instSize-no-acumulativo: una subclase con instSize 0 no tendría el slot).
 * El SmallInteger sigue NATIVO (number|bigint); SÓLO el Float se boxea, así classOf
 * lo despacha por `.class` sin tocar el hot-path entero. printString lo distingue de
 * un entero (3.0 imprime "3.0", no "3"). Float = por VALOR, == por referencia (ANSI).
 */
export interface STFloat extends STObject {
  floatValue: number;
}

/**
 * STCharacter — Character BOXED (L4 F2): un STObject (class = u.Character) que porta
 * el code point en un campo dedicado `codePoint`. El lexer emite el valor del literal
 * como STRING de 1 char (String.fromCodePoint); el evaluador deriva el code point con
 * value.codePointAt(0). == y = por VALOR (code point): $a == $a es true (GATE-L4-IDENTITY).
 */
export interface STCharacter extends STObject {
  codePoint: number;
}

/**
 * STArray — Array BOXED (L4 F4): un STObject (class = u.Array) que porta sus elementos
 * en un campo dedicado `elements` (NO en slots de `pointers`, mismo motivo que Float/
 * Character: una subclase con instSize 0 no tendría slots indexados, y el acceso por
 * nombre de ivar en cuerpos .st no está cableado). Tamaño FIJO (at:put: escribe slots
 * existentes; el crecimiento vive en OrderedCollection, S2). { }/#( )/#[ ] reifican aquí.
 */
export interface STArray extends STObject {
  elements: STValue[];
}

/**
 * STOrderedCollection — colección GROWABLE (L4 F3): un STObject (class = u.OrderedCollection)
 * que porta sus elementos en el MISMO campo dedicado `elements` que STArray (mismo motivo:
 * el acceso por nombre de ivar en cuerpos .st no está cableado). A diferencia de Array es de
 * tamaño VARIABLE: add: hace push. Hereda do:/collect:/select:/… de Collection (.st). MVP
 * mínimo (S2): cubre el add: positivo de GATE-F3 sobre un receptor genuinamente growable.
 */
export interface STOrderedCollection extends STObject {
  elements: STValue[];
}

/**
 * STInterval — Interval COMPUTADO (L4 F4/S3): un STObject (class = u.Interval) que NO
 * guarda elementos, sino los tres números `from`/`to`/`by` en campos dedicados (mismo
 * motivo que Float/Array: el acceso por nombre de ivar en cuerpos .st no está cableado).
 * size/at:/do: se CALCULAN desde from/to/by (sin materializar el rango). `(1 to: 5)` y
 * `(1 to: 10 by: 2)` reifican aquí. collect:/select:/… (heredados de Collection) producen
 * un Array (species = Array para todo receptor secuenciable, origin=dialecto, §8.10).
 */
export interface STInterval extends STObject {
  from: number;
  to: number;
  by: number;
}

/**
 * STString — String BOXED (L4 F5): un STObject (class = u.String) que porta sus caracteres
 * en un campo dedicado `chars` (un string JS), mirroring STArray.elements (DEV-028: una sola
 * representación por clase, sin split nativo/boxed). El boxing es OBLIGATORIO para GATE-F5: un
 * string JS nativo es value-idéntico ('foo' === 'foo'), así que la IDENTIDAD ('==' por
 * referencia, 'foo' == 'foo' copy => false) es imposible sin caja. Los string JS NATIVOS
 * quedan INTERNOS (claves de la SymbolTable, el campo STClass.name de almacenamiento, el
 * STSymbol.text, el texto de error interno y el valor de retorno del bridge print.ts); los
 * STString boxed son la capa de VALOR de usuario (literales, Class>>name, Symbol>>asString…).
 */
export interface STString extends STObject {
  chars: string;
}

/** ¿`v` es un Float boxed? (tiene el campo dedicado `floatValue`). */
export function isFloat(v: STValue): v is STFloat {
  return typeof v === "object" && "class" in v && typeof (v as STFloat).floatValue === "number";
}

/** ¿`v` es un Interval computado? (tiene los campos dedicados from/to/by). */
export function isInterval(v: STValue): v is STInterval {
  return (
    typeof v === "object" &&
    "class" in v &&
    typeof (v as STInterval).from === "number" &&
    typeof (v as STInterval).to === "number" &&
    typeof (v as STInterval).by === "number"
  );
}

/**
 * ¿`v` lleva un campo `elements`? (Array boxed o OrderedCollection growable — ambos comparten
 * la representación por campo dedicado). El llamador distingue Array de OrderedCollection por
 * `v.class` cuando importa (p.ej. add: señala sobre Array, hace push sobre OrderedCollection).
 */
export function isArray(v: STValue): v is STArray {
  return typeof v === "object" && "class" in v && Array.isArray((v as STArray).elements);
}

/** ¿`v` es un Character boxed? (tiene el campo dedicado `codePoint`). */
export function isCharacter(v: STValue): v is STCharacter {
  return typeof v === "object" && "class" in v && typeof (v as STCharacter).codePoint === "number";
}

/** ¿`v` es un String boxed? (tiene el campo dedicado `chars`). NO confunde un string JS nativo. */
export function isString(v: STValue): v is STString {
  return typeof v === "object" && "class" in v && typeof (v as STString).chars === "string";
}

/**
 * ¿`v` es un Symbol interned? Un STSymbol es un plain object {text} SIN slot `class` (a
 * diferencia de todo STObject/boxed). Formaliza el patrón inline `typeof v === "object" &&
 * v !== null && !("class" in v)` que se repetía en las primitivas de String (un Symbol < String
 * hereda =/asSymbol/size/, y sin esta guarda esos cuerpos lo trataban como sin texto — DEV-044..).
 */
export function isSymbol(v: STValue): v is STSymbol {
  return typeof v === "object" && v !== null && !("class" in v);
}

/**
 * textOf(v) — el texto subyacente de un String boxed (.chars) o un Symbol (.text), o null si
 * `v` no es ninguno. Es el origen de verdad para los cuerpos de String que un Symbol hereda
 * (=, size, ,, asSymbol): antes leían sólo `.chars`, así que un receptor/arg Symbol caía a ""
 * o a `no es igual` (DEV-044 Symbol>>= no reflexiva; DEV-045 asSymbol => #).
 */
export function textOf(v: STValue): string | null {
  if (isString(v)) return v.chars;
  if (isSymbol(v)) return v.text;
  return null;
}

/**
 * STStream — Stream EN MEMORIA (L4 F6): un STObject (class = una de la jerarquía Stream)
 * que es DUEÑO de su propio buffer JS (`buffer: STValue[]`) + una `position` 0-based en
 * campos dedicados (NO en `pointers`/ivars con nombre — el acceso por ivar en cuerpos .st no
 * está cableado; mismo motivo que Array.elements / Interval.from). `species` recuerda la
 * especie de la colección de respaldo ("String" => contents/upToEnd materializan un String
 * vía makeString; "Array" => un Array vía makeArray), de modo que un WriteStream sobre '' rinde
 * un String y sobre #() un Array (DRIFT-7: los streams llevan su propio buffer, no dependen de
 * un String growable ni de `String new`).
 */
export interface STStream extends STObject {
  buffer: STValue[];
  position: number;
  species: "String" | "Array";
}

/** ¿`v` es un Stream en memoria? (tiene los campos dedicados buffer/position/species). */
export function isStream(v: STValue): v is STStream {
  return (
    typeof v === "object" &&
    "class" in v &&
    Array.isArray((v as STStream).buffer) &&
    typeof (v as STStream).position === "number"
  );
}

/** Una clase es un STObject extendido con estado de Behavior (method dict + cadena de superclases). */
export interface STClass extends STObject {
  name: string;
  // Object.superclass === nil (el STObject nil termina la cadena, plan §5.2);
  // L3 detiene el lookup cuando superclass deja de ser una clase con methodDict.
  superclass: STClass | STObject | null;
  methodDict: Map<SymbolId, Primitive>; // Map, VACÍO en bootstrap; L3 instala primitivas
  instSize: number;
}

/**
 * number = SmallInteger; string = String; STSymbol = Symbol (símbolo interned,
 * identidad por referencia — lo que produce un literal #Foo); STObject = todo lo
 * demás (incl. nil y Transcript). STSymbol es un plain object {text} SIN slot
 * `class`; classOf lo mapea a u.Symbol explícitamente (KERNELLOAD §5.4.0).
 */
export type STValue = number | bigint | string | boolean | STSymbol | STObject;

/** Referencias nombradas del kernel + la SymbolTable inyectada. */
export interface Universe {
  Object: STClass;
  Behavior: STClass;
  ClassDescription: STClass;
  Class: STClass;
  Metaclass: STClass;
  UndefinedObject: STClass;
  SmallInteger: STClass;
  // L4 F2: clases de la torre numérica boxeada. Float/Character son STObjects con un
  // campo dedicado (floatValue/codePoint); se materializan vía .st (loadKernelSources)
  // y se cablean aquí para que classOf y los constructores las referencien sin lookup.
  Float: STClass;
  Character: STClass;
  // L4 F4: clase concreta de los Arrays boxed (STObject con campo dedicado `elements`).
  // Se materializa vía .st (kernel-collections) y se cablea aquí para que classOf y los
  // constructores { }/#( )/#[ ] la referencien sin lookup.
  Array: STClass;
  // L4 F3: colección growable (STObject con campo dedicado `elements`, igual que Array pero de
  // tamaño variable). Materializada en bootstrap; su add: hace push, su new arranca vacía.
  OrderedCollection: STClass;
  // L4 F4/S3: Interval COMPUTADO (STObject con campos dedicados from/to/by, sin `elements`).
  // size/at:/do: se calculan. (n to: m) / (n to: m by: k) lo reifican vía SmallInteger>>to:.
  Interval: STClass;
  String: STClass;
  Boolean: STClass;
  True: STClass;
  False: STClass;
  BlockClosure: STClass;
  // L4 F6: jerarquía Stream en memoria. Stream <- PositionableStream <- ReadStream/WriteStream/
  // ReadWriteStream. Se cablean en bootstrap (deben existir antes de classOf y de la primitiva
  // de clase `on:`); sus instancias son STStream (campos dedicados buffer/position/species).
  Stream: STClass;
  PositionableStream: STClass;
  ReadStream: STClass;
  WriteStream: STClass;
  ReadWriteStream: STClass;
  Symbol: STClass; // clase de los símbolos interned (literal #Foo); classOf(STSymbol)
  Transcript_class: STClass;
  nil: STObject; // instancia única de UndefinedObject
  Transcript: STObject; // instancia única; su 'show:' (L3) acumula en un buffer
  symbols: SymbolTable;
  // Pila de handlers en el HEAP (plan §5.5.1 B/G), independiente de la pila JS:
  // on:do: empuja, su finally hace pop, signal() la recorre. Sembrada a [] por
  // bootstrapKernel (NO un global de módulo: hay un Universe fresco por evalWith).
  // En S1 sólo es scaffolding (ensure:/ifCurtailed: no la tocan); S2 la consume.
  handlerStack: HandlerContext[];
  // Namespace mutable de globals de clase (única fuente de verdad, KERNELLOAD
  // §5.4.0): sembrado con el núcleo por bootstrapKernel; subclass: registra aquí
  // cada clase nueva; lookupGlobal lo consulta para resolver nombres de clase.
  namespace: Map<string, STClass>;
}

/**
 * classOf — mapea valores nativos y STObjects a su clase SIN convertir a STObject.
 * number|bigint -> SmallInteger; string -> String; STObject -> su slot .class
 * (lo que cubre nil -> UndefinedObject y Transcript -> Transcript_class).
 */
export function classOf(v: STValue, u: Universe): STClass {
  if (typeof v === "number" || typeof v === "bigint") return u.SmallInteger;
  if (typeof v === "string") return u.String;
  // boolean nativo: true -> True, false -> False (ANTES de la rama de objeto).
  // Es la vía SECUNDARIA (una vez el boolean fluye como receptor de un send); la
  // vía PRIMARIA es el binding global true/false en eval.ts.
  if (typeof v === "boolean") return v ? u.True : u.False;
  // STSymbol es un plain object {text} SIN slot `class` (a diferencia de STObject);
  // lo distinguimos por la ausencia de `class` y lo mapeamos a u.Symbol.
  if (typeof v === "object" && !("class" in v)) return u.Symbol;
  if (typeof v === "object") return v.class;
  return u.Object;
}

// ─────────────────────────────────────────────────────────────────────────
// L2-proper · instanciación + identidad (S2, plan §5.2 "instanciación e
// identidad"). Funciones puras del modelo de objetos; L3 las cablea como
// primitivas del kernel (basicNew, ==/~~, instVarAt:/instVarAt:put:,
// identityHash). subclass:/new-con-initialize son KERNELLOAD/§5.4.0 (diferidos).
// ─────────────────────────────────────────────────────────────────────────

/** Contador monótono de hash por proceso; cada basicNew toma el siguiente. */
let nextInstanceHash = 1 << 20;

/**
 * basicNew(cls) — instancia "vacía" de `cls`: un STObject con `pointers` de
 * largo `cls.instSize`, cada slot inicializado a `u.nil` (NO undefined). No
 * ejecuta initialize (eso es `new` = basicNew + initialize, diferido hasta que
 * existan clases/métodos de usuario en KERNELLOAD). El hash nace estable y único.
 */
export function basicNew(cls: STClass, u: Universe): STObject {
  const pointers: STValue[] = new Array(cls.instSize).fill(u.nil);
  return {
    class: cls,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers,
  };
}

/**
 * makeFloat(value, u) — caja un double JS como STFloat (class = u.Float). El valor
 * vive en el campo dedicado `floatValue`; `pointers` queda vacío (no usa ivars). El
 * hash nace estable/único (identidad por referencia para ==, la igualdad por valor
 * la da Float>>=). NO clamp/redondeo: el double se conserva tal cual lo dio el lexer.
 */
export function makeFloat(value: number, u: Universe): STFloat {
  return {
    class: u.Float,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    floatValue: value,
  };
}

/**
 * makeCharacter(codePoint, u) — caja un code point como STCharacter (class = u.Character).
 * El code point vive en el campo dedicado `codePoint`. El hash NO se usa para `==`: la
 * identidad de Character es por VALOR (code point), igual que un inmediato (identical()
 * y identityHash() lo tratan por code point). $a == $a es true sin tabla de interning.
 */
export function makeCharacter(codePoint: number, u: Universe): STCharacter {
  return {
    class: u.Character,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    codePoint,
  };
}

/**
 * makeString(chars, u) — caja un string JS como STString (class = u.String). Los caracteres
 * viven en el campo dedicado `chars`; `pointers` queda vacío (no usa ivars), espejo EXACTO de
 * makeArray/makeCharacter. El hash nace estable/único: la IDENTIDAD de un String es por
 * REFERENCIA (dos cajas distintas con mismos chars NO son ==, GATE-F5); la igualdad por
 * CONTENIDO la da String>>=. Los literales, Class>>name y Symbol>>asString construyen aquí.
 */
export function makeString(chars: string, u: Universe): STString {
  return {
    class: u.String,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    chars,
  };
}

/**
 * makeArray(elements, u) — caja un JS array de STValue como STArray (class = u.Array).
 * Los elementos viven en el campo dedicado `elements`; `pointers` queda vacío (no usa
 * ivars). El hash nace estable/único (identidad por referencia para ==). El array se
 * toma TAL CUAL (el caller decide si pasar una copia); { }/#( )/#[ ] construyen uno fresco.
 */
export function makeArray(elements: STValue[], u: Universe): STArray {
  return {
    class: u.Array,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    elements,
  };
}

/**
 * makeOrderedCollection(elements, u) — caja un JS array de STValue como STOrderedCollection
 * (class = u.OrderedCollection). Mismo campo dedicado `elements` que makeArray; la diferencia
 * es la clase (y por ende el methodDict: add: hace push). `new` arranca vacío ([]).
 */
export function makeOrderedCollection(elements: STValue[], u: Universe): STOrderedCollection {
  return {
    class: u.OrderedCollection,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    elements,
  };
}

/**
 * makeInterval(from, to, by, u) — caja un rango como STInterval (class = u.Interval). Los
 * tres números viven en campos dedicados; `pointers` queda vacío (no usa ivars). El rango NO
 * se materializa (size/at:/do: lo computan). El hash nace estable/único (identidad por
 * referencia para ==). `by` debe ser != 0 (un paso 0 daría un Interval mal formado; el caller
 * — SmallInteger>>to: — siempre pasa 1 o el paso explícito).
 */
export function makeInterval(from: number, to: number, by: number, u: Universe): STInterval {
  return {
    class: u.Interval,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    from,
    to,
    by,
  };
}

/**
 * makeStream(streamClass, buffer, position, species, u) — caja un Stream en memoria. El stream
 * es DUEÑO del `buffer` (un JS array de STValue) y de su `position` (0-based, el índice del
 * PRÓXIMO elemento a leer/escribir); `pointers` queda vacío. `species` define a qué colección
 * materializan contents/upToEnd (String/Array). El hash nace estable/único (identidad por
 * referencia). El caller (la primitiva `on:`) decide la clase concreta (Read/Write/ReadWrite).
 * NO toma `u` (a diferencia de make{Float,Array,…}): la clase concreta llega explícita en
 * `streamClass` y el hash sale del contador de módulo, así que no hay nada que mirar del Universe.
 */
export function makeStream(
  streamClass: STClass,
  buffer: STValue[],
  position: number,
  species: "String" | "Array",
): STStream {
  return {
    class: streamClass,
    hash: nextInstanceHash++,
    format: ObjectFormat.Pointers,
    pointers: [],
    buffer,
    position,
    species,
  };
}

/** Mensaje de error determinista para un índice de ivar fuera de rango (base-1). */
function rangeError(i: number, instSize: number): Error {
  return new Error(`instVarAt: index ${i} fuera de rango 1..${instSize}`);
}

/**
 * instVarAt(obj, i) — lee la ivar `i` en base-1 (Smalltalk indexa desde 1).
 * Índice 0 o > instSize lanza un Error de host observable (range error). El
 * Exception navegable (SystemExceptions.IndexOutOfRange) es L5, diferido.
 */
export function instVarAt(obj: STObject, i: number): STValue {
  if (i < 1 || i > obj.pointers.length) throw rangeError(i, obj.pointers.length);
  return obj.pointers[i - 1] as STValue;
}

/** instVarAtPut(obj, i, value) — escribe la ivar `i` (base-1), mismo chequeo de rango. */
export function instVarAtPut(obj: STObject, i: number, value: STValue): STValue {
  if (i < 1 || i > obj.pointers.length) throw rangeError(i, obj.pointers.length);
  obj.pointers[i - 1] = value;
  return value;
}

/**
 * identityHash(v) — hash estable consistente con `==`. Para INMEDIATOS deriva
 * del valor (3 == 3 => mismo hash, por valor), de modo que objetos idénticos
 * comparten hash. Para STObjects usa el `hash` que llevan desde su creación
 * (único por objeto, estable entre llamadas). booleans -> 1/0.
 */
export function identityHash(v: STValue, _u: Universe): number {
  if (typeof v === "number") return v | 0;
  if (typeof v === "bigint") return Number(v % 0x7fffffffn) | 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    // Hash de string estilo Java (determinista): consistente con `==` por valor.
    let h = 0;
    for (let i = 0; i < v.length; i++) h = (Math.imul(31, h) + v.charCodeAt(i)) | 0;
    return h;
  }
  // STSymbol (plain object {text}, sin slot `hash`): hash por su texto (estable,
  // y consistente con su identidad interned: mismo texto => mismo símbolo).
  if (!("hash" in v)) {
    let h = 0;
    const t = (v as { text: string }).text;
    for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
    return h;
  }
  // L4 F2 · Character: hash POR VALOR (code point), consistente con `==` por valor
  // ($a == $a true => mismo hash). ANTES de la rama de hash-por-objeto.
  if (isCharacter(v)) return v.codePoint;
  return v.hash;
}

/**
 * identical(a, b) — semántica de `==`: identidad por referencia para STObjects,
 * igualdad por valor para INMEDIATOS (number/bigint/string/boolean son valores
 * nativos JS; `3 == 3` es true por valor, no por boxing). Character es L4. number
 * y bigint con el mismo valor numérico se consideran idénticos (promoción por
 * overflow no debe romper la identidad de un mismo entero).
 */
export function identical(a: STValue, b: STValue): boolean {
  if (
    (typeof a === "number" || typeof a === "bigint") &&
    (typeof b === "number" || typeof b === "bigint")
  ) {
    return BigInt(a) === BigInt(b);
  }
  // L4 F2 · Character: identidad por VALOR (code point), no por referencia. Sin tabla
  // de interning: dos cajas $a distintas son `==` si comparten code point (GATE-L4-IDENTITY).
  if (isCharacter(a) && isCharacter(b)) return a.codePoint === b.codePoint;
  // Float: `==` es por REFERENCIA (ANSI; la igualdad por valor la da Float>>=), así que
  // cae al `a === b` de abajo (dos cajas distintas con igual valor NO son ==).
  return a === b;
}

/** notIdentical(a, b) — semántica de `~~`: la negación de `==` por identidad/valor. */
export function notIdentical(a: STValue, b: STValue): boolean {
  return !identical(a, b);
}

/**
 * lookupMethod(cls, sym) — sube la cadena de superclases buscando la primitiva
 * de `sym`, devolviendo la definición MÁS específica (la subclase gana). La
 * cadena termina cuando `superclass` deja de ser una clase con methodDict
 * (Object.superclass === nil). Misma forma que el lookup de send() (L3).
 */
export function lookupMethod(cls: STClass, sym: SymbolId): Primitive | undefined {
  let current: STClass | null = cls;
  while (current !== null) {
    const prim = current.methodDict.get(sym);
    if (prim !== undefined) return prim;
    const next: STClass | STObject | null = current.superclass;
    current = next !== null && "methodDict" in next ? next : null;
  }
  return undefined;
}
