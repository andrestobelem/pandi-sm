// L2 · Object model (MÍNIMO, walking skeleton — plan §4/§5.2 "alcance in").
// Un objeto Smalltalk es un plain JS object con slots indexados
// { class, hash, format, pointers } — sin object table, sin tagging/boxing.
// SmallInteger y String son VALORES NATIVOS JS (no STObject); classOf los mapea
// sin convertirlos. El cierre metacircular completo y el protocolo de 23
// selectores son L2-proper (diferidos); aquí sólo cableamos lo que send() (L3)
// necesita para hacer lookup por la superclass chain.

import type { SymbolId, SymbolTable } from "./symbol-table.js";

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

/** number = SmallInteger; string = String; STObject = todo lo demás (incl. nil y Transcript). */
export type STValue = number | bigint | string | boolean | STObject;

/** Referencias nombradas del kernel + la SymbolTable inyectada. */
export interface Universe {
  Object: STClass;
  Behavior: STClass;
  ClassDescription: STClass;
  Class: STClass;
  Metaclass: STClass;
  UndefinedObject: STClass;
  SmallInteger: STClass;
  String: STClass;
  Boolean: STClass;
  True: STClass;
  False: STClass;
  BlockClosure: STClass;
  Transcript_class: STClass;
  nil: STObject; // instancia única de UndefinedObject
  Transcript: STObject; // instancia única; su 'show:' (L3) acumula en un buffer
  symbols: SymbolTable;
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
