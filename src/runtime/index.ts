// L2 · runtime — barrel. Object model mínimo (walking skeleton): representación
// de objeto, classOf, bootstrapKernel y SymbolTable. L3 (eval/send/primitivas)
// consume estos tipos e instala las primitivas en los methodDict.

export { bootstrapKernel } from "./kernel.js";
export {
  basicNew,
  classOf,
  type HomeMarker,
  identical,
  identityHash,
  instVarAt,
  instVarAtPut,
  lookupMethod,
  type Message,
  NonLocalReturn,
  notIdentical,
  ObjectFormat,
  type Primitive,
  type Scope,
  type STClass,
  type STClosure,
  type STObject,
  type STValue,
  type Universe,
} from "./object.js";
export { type STSymbol, type SymbolId, SymbolTable } from "./symbol-table.js";
