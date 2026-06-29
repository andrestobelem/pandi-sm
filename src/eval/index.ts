// L3 · eval — barrel. Evaluador tree-walking mínimo (walking skeleton): evalNode,
// send, primitivas del kernel, printString y la entrada pública eval(source).

export { type EvalResult, evalNode, evalSource as eval, evalWith } from "./eval.js";
export { installPrimitives } from "./primitives.js";
export { printString } from "./print.js";
export { send } from "./send.js";
