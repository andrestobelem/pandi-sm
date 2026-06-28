// L3 · eval — barrel. Evaluador tree-walking mínimo (walking skeleton): evalNode,
// send, primitivas del kernel, printString y la entrada pública eval(source).

export { evalNode, evalSource as eval, evalWith, type EvalResult } from "./eval.js";
export { send } from "./send.js";
export { installPrimitives } from "./primitives.js";
export { printString } from "./print.js";
