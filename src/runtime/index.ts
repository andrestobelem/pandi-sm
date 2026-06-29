// L2 · runtime — barrel. Object model mínimo (walking skeleton): representación
// de objeto, classOf, bootstrapKernel y SymbolTable. L3 (eval/send/primitivas)
// consume estos tipos e instala las primitivas en los methodDict.

export { bootstrapKernel, makeClassWithMetaclass } from "./kernel.js";
export {
  basicNew,
  classOf,
  type HandlerActionKind,
  HandlerActionSignal,
  type HandlerContext,
  type HomeMarker,
  identical,
  identityHash,
  instVarAt,
  instVarAtPut,
  isCharacter,
  isFloat,
  lookupMethod,
  type Message,
  makeCharacter,
  makeFloat,
  NonLocalReturn,
  notIdentical,
  ObjectFormat,
  type Primitive,
  type Scope,
  SignalException,
  type STCharacter,
  type STClass,
  type STClosure,
  type STFloat,
  type STObject,
  type STValue,
  type Universe,
  Unwind,
} from "./object.js";
export { type STSymbol, type SymbolId, SymbolTable } from "./symbol-table.js";
