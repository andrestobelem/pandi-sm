// pandi-sm — barrel raíz. En L0 sólo expone VERSION y re-exporta los barrels
// (vacíos) de L1. Las exportaciones reales aterrizan cuando cada capa esté verde.
export const VERSION = "0.0.0";

export * from "./ast/index.js";
export * from "./lexer/index.js";
