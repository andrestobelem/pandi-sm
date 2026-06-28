// L2 · runtime — barrel. Object model mínimo (walking skeleton): representación
// de objeto, classOf, bootstrapKernel y SymbolTable. L3 (eval/send/primitivas)
// consume estos tipos e instala las primitivas en los methodDict.

export {
  classOf,
  ObjectFormat,
  type Primitive,
  type STClass,
  type STObject,
  type STValue,
  type Universe,
} from "./object.js";
export { bootstrapKernel } from "./kernel.js";
export { type STSymbol, SymbolTable, type SymbolId } from "./symbol-table.js";
