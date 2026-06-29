// L5 · S2 — fuentes .st de la jerarquía núcleo de excepciones (plan §5.5 alcance-in:
// "Exception, Error, Warning, ArithmeticError→ZeroDivide, MessageNotUnderstood").
// Se cargan vía loadKernelSources (KERNELLOAD §5.4.0) sobre el Universe fresco de
// cada evalWith. La jerarquía es .st (Object subclass: ...); el ESTADO de la
// instancia (messageText) y TODO el protocolo de control-flow (signal/on:do:/
// return:/resume:/pass/...) vive en primitivas TS (necesitan u.handlerStack, el
// try/finally del frame JS y callBlock — no expresable en .st sin instVarAt:).
//
// DRIFT (flag para el log L6, NO editamos docs aquí): instSize NO es acumulativo en
// la cadena (kernel.ts:49/primitives.ts:countIvars cuentan SÓLO los ivars propios).
// Por eso NO declaramos `instanceVariableNames:` en Exception: el messageText se
// guarda como campo JS en el STObject de la instancia (instExceptionState), no en un
// slot de ivar — esquiva el range-error de basicNew de una subclase con instSize 0.
//
// Los cuerpos `[ ... ]` son mínimos (devuelven self / un literal) sólo para que el
// method-def del cargador tenga forma válida; el comportamiento REAL lo override la
// primitiva TS del MISMO selector instalada en installPrimitives (la primitiva gana
// el lookup porque vive en la misma clase, instalada DESPUÉS de la carga .st).

/**
 * KERNEL_EXCEPTION_SOURCES — una fuente .st por clase de la jerarquía MVP, en orden
 * topológico (la super de cada una ya está en el namespace base o declarada antes).
 * Sin method-defs: el protocolo es 100% primitivas TS (instaladas aparte). El
 * class-def basta para materializar la STClass + su metaclase en el namespace.
 */
export const KERNEL_EXCEPTION_SOURCES: string[] = [
  '"@provenance: l5-exceptions" Object subclass: #Exception',
  '"@provenance: l5-exceptions" Exception subclass: #Error',
  '"@provenance: l5-exceptions" Exception subclass: #Warning',
  '"@provenance: l5-exceptions" Error subclass: #ArithmeticError',
  '"@provenance: l5-exceptions" ArithmeticError subclass: #ZeroDivide',
  '"@provenance: l5-exceptions" Error subclass: #MessageNotUnderstood',
];
