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
  if (typeof v === "object") return v.class;
  // boolean no se cablea en el skeleton (True/False es L3-proper); cae a Object.
  return u.Object;
}
