// L5 · S2 — protocolo de control-flow de excepciones como primitivas TS (plan §5.5;
// §5.5.1 A–G). on:do:/on:do:on:do:/ExceptionSet ',' empujan HandlerContext en
// u.handlerStack y corren el protegido en un try/catch; signal()/signal: recorren la
// pila buscando el handler activo, lo corren SOBRE EL FRAME VIVO (fase 1) e
// interpretan su HandlerAction; return:/retry/retryUsing:/fallOff desenrollan con un
// Unwind plano (fase 2) que el on:do: dueño del marker reconoce; resume:/pass NO
// desenrollan. defaultAction: Error propaga al top-level, Warning resume nil.
//
// Las acciones del handler (return:/resume:/retry/retryUsing:/pass) son TRANSFERENCIAS
// NO LOCALES (plan §5.5.1 C/G): al invocarlas, el handler block se ABANDONA en el acto
// lanzando un HandlerActionSignal etiquetado con el `token` de la activación de signal()
// en curso. signalException() lo intercepta alrededor de la llamada al handler block e
// interpreta la PRIMERA acción (gana la primera; las sentencias posteriores del handler
// son inalcanzables). Esto hace que pass delegue de verdad (no lo pisa un return: tardío)
// y que resume:/return: corten el flujo como en ANSI, en vez de marcar una "pendingAction"
// leída sólo tras correr el block entero.

import {
  basicNew,
  HandlerActionSignal,
  type HandlerContext,
  type HomeMarker,
  type Primitive,
  type STClass,
  type STClosure,
  type STObject,
  type STValue,
  type Universe,
  Unwind,
} from "../runtime/index.js";
import { evalBlock } from "./eval.js";

// ─────────────────────────────────────────────────────────────────────────
// Estado por-instancia de excepción (DRIFT instSize-no-acumulativo): el
// messageText y el handler/token activos viven en un Side-Map por STObject,
// no en slots de ivar (una subclase con instSize 0 no tendría el slot). Identidad
// por referencia del STObject de la excepción.
// ─────────────────────────────────────────────────────────────────────────

/** Estado vivo de una instancia de excepción durante su señalamiento. */
interface ExceptionState {
  messageText: STValue;
  /** El HandlerContext en curso (para que return:/resume: sepan su marker/activación). */
  activeHandler: HandlerContext | null;
  /**
   * Token de la activación de signal() que corre el handler block AHORA. Las acciones
   * del handler lanzan un HandlerActionSignal con este token; signalException() sólo
   * intercepta el suyo (un signal re-entrante dentro del handler tiene otro token).
   */
  activeToken: object | null;
}

const exceptionState = new WeakMap<STObject, ExceptionState>();

/** Lee (creando si falta) el estado de una instancia de excepción. */
function stateOf(ex: STObject, u: Universe): ExceptionState {
  let s = exceptionState.get(ex);
  if (s === undefined) {
    s = { messageText: u.nil, activeHandler: null, activeToken: null };
    exceptionState.set(ex, s);
  }
  return s;
}

/** ¿La clase `cls` está en la cadena de superclases de inicio `start` (o es ella)? */
function isKindOfClass(start: STClass, target: STClass): boolean {
  let cur: STClass | null = start;
  while (cur !== null) {
    if (cur === target) return true;
    const next: STClass | STObject | null = cur.superclass;
    cur = next !== null && "methodDict" in next ? (next as STClass) : null;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// ExceptionSet — unión de clases de excepción para on: (plan §5.5; §6.1 superficie
// del gate). `,` (Exception class>>',') la construye; handles: = OR sobre elementos.
// Es un STObject ligero con un campo JS `elements`; classOf lo despacha por su clase.
// ─────────────────────────────────────────────────────────────────────────

interface ExceptionSet extends STObject {
  elements: STClass[];
}

function isExceptionSet(v: STValue): v is ExceptionSet {
  return typeof v === "object" && "class" in v && Array.isArray((v as ExceptionSet).elements);
}

/** Exception class>>, otherClassOrSet — construye/extiende un ExceptionSet. */
function exceptionComma(receiver: STValue, args: STValue[], u: Universe): STValue {
  const left = receiver as STClass;
  const right = args[0] as STValue;
  const elements: STClass[] = [left];
  if (isExceptionSet(right)) elements.push(...right.elements);
  else elements.push(right as STClass);
  const set: ExceptionSet = {
    class: u.Object,
    hash: 0,
    format: left.format,
    pointers: [],
    elements,
  };
  return set;
}

/** ¿El selector-de-on: `selector` (clase o ExceptionSet) maneja la instancia `ex`? */
function handles(selector: STValue, ex: STObject): boolean {
  if (isExceptionSet(selector)) return selector.elements.some((c) => isKindOfClass(ex.class, c));
  if (typeof selector === "object" && "class" in selector) {
    return isKindOfClass(ex.class, selector as STClass);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// signal() — el corazón (fase 1 sobre el frame vivo; fase 2 vía Unwind). Recorre
// u.handlerStack de tope a base buscando el primer handler `active` cuyo `on:`
// handles: la instancia; lo desactiva, corre su block e intercepta el
// HandlerActionSignal que la acción invocada lanza (gana la primera; fallOff si el
// block terminó normal). resume:/pass NO desenrollan; return:/retry/retryUsing:/fallOff sí.
// ─────────────────────────────────────────────────────────────────────────

function signalException(ex: STObject, u: Universe): STValue {
  const st = stateOf(ex, u);
  let i = u.handlerStack.length - 1;
  while (i >= 0) {
    const hc = u.handlerStack[i] as HandlerContext;
    if (hc.active && handles(hc.exceptionClass, ex)) {
      hc.active = false; // handler deshabilitado mientras corre (Squeak/Pharo)
      // activeHandler/activeToken viven SÓLO mientras el handler block corre:
      // return:/retry/resume: sólo son válidos DENTRO de él (negativo #3). Guardamos
      // los previos (handlers anidados / reuso de instancia) y los restauramos SIEMPRE
      // en finally, también si el block desenrolla. El token identifica ESTA activación
      // de signal(); las acciones lanzan un HandlerActionSignal con él y aquí sólo
      // interceptamos el nuestro (un signal re-entrante dentro del block tiene otro).
      const prevActiveHandler = st.activeHandler;
      const prevActiveToken = st.activeToken;
      const token = {};
      st.activeHandler = hc;
      st.activeToken = token;
      let action: HandlerActionSignal;
      try {
        // Fase 1: llamada NORMAL al handler block sobre el frame vivo de signalException.
        // Si el block invoca return:/resume:/retry/retryUsing:/pass, ABANDONA aquí por
        // un HandlerActionSignal (gana la PRIMERA acción; lo posterior es inalcanzable).
        const blockValue = evalBlock(hc.handlerBlock as STClosure, [ex], u);
        // fallOff: el handler terminó sin invocar acción -> return: del valor del block.
        action = new HandlerActionSignal(token, "return", blockValue);
      } catch (e) {
        if (e instanceof HandlerActionSignal && e.token === token) {
          action = e; // la acción invocada por ESTE handler block
        } else {
          throw e; // Unwind/NonLocalReturn/HandlerActionSignal ajeno: sigue subiendo
        }
      } finally {
        st.activeHandler = prevActiveHandler;
        st.activeToken = prevActiveToken;
      }
      switch (action.kind) {
        case "resume":
          hc.active = true; // sigue vigente para la continuación
          return action.value;
        case "pass":
          hc.active = true; // re-elegible para señales FUTURAS; i-- evita reentrada en ÉSTA
          i--;
          continue;
        case "return":
          throw new Unwind(hc.marker, action.value, true);
        case "retry":
          throw new Unwind(hc.marker, u.nil, true, true, hc.protectedBlock);
        case "retryUsing":
          throw new Unwind(hc.marker, u.nil, true, true, action.block as STClosure);
      }
    }
    i--;
  }
  return defaultAction(ex, u);
}

/** defaultAction: Error (y subtipos) propaga al top-level; Warning resume nil. */
function defaultAction(ex: STObject, u: Universe): STValue {
  const warning = u.namespace.get("Warning");
  if (warning !== undefined && isKindOfClass(ex.class, warning)) {
    return u.nil; // Warning>>defaultAction: self resume: nil (positivo #19)
  }
  // Error (o Exception base sin handler): propaga un error de host OBSERVABLE.
  const st = stateOf(ex, u);
  const mnu = u.namespace.get("MessageNotUnderstood");
  const text = typeof st.messageText === "string" ? st.messageText : null;
  if (mnu !== undefined && isKindOfClass(ex.class, mnu)) {
    // Backward-compat: un MNU no capturado preserva el texto host 'doesNotUnderstand'.
    throw new Error(text ?? `doesNotUnderstand: ${ex.class.name}`);
  }
  throw new Error(text ?? `${ex.class.name} signal (sin handler)`);
}

// ─────────────────────────────────────────────────────────────────────────
// signal/signal: — clase e instancia. La forma de clase crea la instancia (basicNew)
// y delega en la de instancia. messageText se guarda en el Side-Map de estado.
// ─────────────────────────────────────────────────────────────────────────

/** Exception class>>signal — instancia nueva, sin texto, señalada. */
function classSignal(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const ex = basicNew(receiver as STClass, u);
  return signalException(ex, u);
}

/** Exception class>>signal: text — instancia nueva con messageText, señalada. */
function classSignalWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  const ex = basicNew(receiver as STClass, u);
  stateOf(ex, u).messageText = args[0] as STValue;
  return signalException(ex, u);
}

/** Exception>>signal — la instancia receptora se señala. */
function instSignal(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return signalException(receiver as STObject, u);
}

/** Exception>>signal: text — fija messageText y señala la instancia receptora. */
function instSignalWith(receiver: STValue, args: STValue[], u: Universe): STValue {
  stateOf(receiver as STObject, u).messageText = args[0] as STValue;
  return signalException(receiver as STObject, u);
}

// ── Consulta de la excepción ───────────────────────────────────────────────

/** Exception>>messageText — el texto fijado por signal: (nil si no se fijó). */
function instMessageText(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return stateOf(receiver as STObject, u).messageText;
}

/** Exception>>description — el messageText si lo hay, si no el nombre de la clase. */
function instDescription(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const ex = receiver as STObject;
  const text = stateOf(ex, u).messageText;
  return typeof text === "string" ? text : ex.class.name;
}

/** Exception>>isResumable — Warning resumable; Error (y base) no (plan §5.5). */
function instIsResumable(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const ex = receiver as STObject;
  const warning = u.namespace.get("Warning");
  return warning !== undefined && isKindOfClass(ex.class, warning);
}

// ── Acciones del handler (TRANSFEREN no-localmente al frame de signal vía throw) ──
// Cada acción ABANDONA el handler block en el acto: lanza un HandlerActionSignal con
// el token de la activación de signal() en curso. signalException() la intercepta e
// interpreta la PRIMERA (lo posterior en el handler block nunca corre). Fuera de un
// handler activo (activeToken === null) es un error (negativo #3).

function requireActiveToken(ex: STObject, u: Universe): object {
  const st = stateOf(ex, u);
  if (st.activeHandler === null || st.activeToken === null) {
    // return/retry/resume fuera de un handler activo = error (negativo #3).
    throw new Error("acción de handler fuera de un handler activo");
  }
  return st.activeToken;
}

function handlerReturn(receiver: STValue, args: STValue[], u: Universe): STValue {
  const token = requireActiveToken(receiver as STObject, u);
  throw new HandlerActionSignal(token, "return", (args[0] ?? u.nil) as STValue);
}

function handlerReturnNil(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const token = requireActiveToken(receiver as STObject, u);
  throw new HandlerActionSignal(token, "return", u.nil);
}

function handlerRetry(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const token = requireActiveToken(receiver as STObject, u);
  throw new HandlerActionSignal(token, "retry", u.nil);
}

function handlerRetryUsing(receiver: STValue, args: STValue[], u: Universe): STValue {
  const token = requireActiveToken(receiver as STObject, u);
  throw new HandlerActionSignal(token, "retryUsing", u.nil, args[0] as STClosure);
}

function handlerResume(receiver: STValue, args: STValue[], u: Universe): STValue {
  const ex = receiver as STObject;
  const token = requireActiveToken(ex, u);
  if (!isResumableInstance(ex, u)) {
    // resume de no-resumable: política de ingeniería (ANSI-erroneous) -> Error (negativo #1/#2).
    throw new Error(`resume de excepción no resumable: ${ex.class.name}`);
  }
  throw new HandlerActionSignal(token, "resume", (args[0] ?? u.nil) as STValue);
}

function handlerResumeNil(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const ex = receiver as STObject;
  const token = requireActiveToken(ex, u);
  if (!isResumableInstance(ex, u)) {
    throw new Error(`resume de excepción no resumable: ${ex.class.name}`);
  }
  throw new HandlerActionSignal(token, "resume", u.nil);
}

function handlerPass(receiver: STValue, _args: STValue[], u: Universe): STValue {
  const token = requireActiveToken(receiver as STObject, u);
  throw new HandlerActionSignal(token, "pass", u.nil);
}

/** ¿La instancia es resumable? (Warning sí; el resto no, plan §5.5). */
function isResumableInstance(ex: STObject, u: Universe): boolean {
  const warning = u.namespace.get("Warning");
  return warning !== undefined && isKindOfClass(ex.class, warning);
}

// ─────────────────────────────────────────────────────────────────────────
// on:do:/on:do:on:do: — evaluación protegida (plan §5.5.1 G runProtected). Empuja
// un HandlerContext por handler con un marker común; corre el protegido en un bucle
// (para soportar retry sin recursión); el finally hace pop SIEMPRE a la base.
// ─────────────────────────────────────────────────────────────────────────

function runProtected(
  protectedBlock: STClosure,
  handlerSpecs: { exceptionClass: STValue; handlerBlock: STValue }[],
  u: Universe,
): STValue {
  const marker: HomeMarker = {};
  for (const h of handlerSpecs) {
    u.handlerStack.push({
      exceptionClass: h.exceptionClass,
      handlerBlock: h.handlerBlock,
      protectedBlock,
      marker,
      active: true,
    });
  }
  const depth0 = u.handlerStack.length - handlerSpecs.length;
  let blockToRun: STClosure = protectedBlock;
  try {
    for (;;) {
      try {
        return evalBlock(blockToRun, [], u);
      } catch (e) {
        if (e instanceof Unwind && e.marker === marker) {
          if (e.retry) {
            blockToRun = e.retryBlock as STClosure;
            // Restaurar la pila a EXACTAMENTE nuestros handlers y reactivarlos.
            u.handlerStack.length = depth0 + handlerSpecs.length;
            for (let k = depth0; k < u.handlerStack.length; k++) {
              (u.handlerStack[k] as HandlerContext).active = true;
            }
            continue;
          }
          return e.value;
        }
        throw e; // NonLocalReturn de L3 u otro Unwind: sigue subiendo
      }
    }
  } finally {
    u.handlerStack.length = depth0; // pop SIEMPRE (también en retorno por resume)
  }
}

function blockOnDo(receiver: STValue, args: STValue[], u: Universe): STValue {
  return runProtected(
    receiver as STClosure,
    [{ exceptionClass: args[0] as STValue, handlerBlock: args[1] as STValue }],
    u,
  );
}

function blockOnDoOnDo(receiver: STValue, args: STValue[], u: Universe): STValue {
  return runProtected(
    receiver as STClosure,
    [
      { exceptionClass: args[0] as STValue, handlerBlock: args[1] as STValue },
      { exceptionClass: args[2] as STValue, handlerBlock: args[3] as STValue },
    ],
    u,
  );
}

// ── new/basicNew (instanciación) ────────────────────────────────────────────
// new = basicNew (sin initialize en el MVP; las excepciones no tienen ivars .st).

function classBasicNew(receiver: STValue, _args: STValue[], u: Universe): STValue {
  return basicNew(receiver as STClass, u);
}

// ─────────────────────────────────────────────────────────────────────────
// dNU -> MessageNotUnderstood (plan §5.5; cierra el lazo L3↔L5). Construye un MNU,
// le fija el messageText con el texto host backward-compat y lo señala. Si nadie lo
// captura, defaultAction propaga el texto 'doesNotUnderstand' (tests L3 intactos).
// ─────────────────────────────────────────────────────────────────────────

/** signalMessageNotUnderstood — señala un MNU por un envío no entendido. */
export function signalMessageNotUnderstood(
  receiverClassName: string,
  selector: string,
  u: Universe,
): STValue {
  const mnu = u.namespace.get("MessageNotUnderstood");
  if (mnu === undefined) {
    // La jerarquía no está cargada (no debería pasar en evalWith): error de host.
    throw new Error(`doesNotUnderstand: ${receiverClassName} no entiende #${selector}`);
  }
  const ex = basicNew(mnu, u);
  stateOf(ex, u).messageText = `doesNotUnderstand: ${receiverClassName} no entiende #${selector}`;
  return signalException(ex, u);
}

/** installExceptionPrimitives — cablea el protocolo L5 S2 en los methodDict. */
export function installExceptionPrimitives(u: Universe): void {
  const exception = u.namespace.get("Exception");
  if (exception === undefined) {
    throw new Error("installExceptionPrimitives: jerarquía de excepciones no cargada");
  }
  // ── Lado-instancia (Exception.methodDict, heredado por subtipos) ──────────
  const instSel: [string, Primitive][] = [
    ["signal", instSignal],
    ["signal:", instSignalWith],
    ["messageText", instMessageText],
    ["description", instDescription],
    ["isResumable", instIsResumable],
    ["return", handlerReturnNil],
    ["return:", handlerReturn],
    ["retry", handlerRetry],
    ["retryUsing:", handlerRetryUsing],
    ["resume", handlerResumeNil],
    ["resume:", handlerResume],
    ["pass", handlerPass],
  ];
  for (const [sel, prim] of instSel) exception.methodDict.set(u.symbols.intern(sel), prim);

  // ── Lado-clase (la metaclase de Exception, heredada por las metaclases de los
  //    subtipos): signal/signal:/new/basicNew/`,`. Object class las haría globales,
  //    pero las acotamos a Exception class para no contaminar todas las clases con
  //    signal; new/basicNew/`,` sí se instalan en Object class (instanciación general).
  const exceptionMeta = exception.class;
  exceptionMeta.methodDict.set(u.symbols.intern("signal"), classSignal);
  exceptionMeta.methodDict.set(u.symbols.intern("signal:"), classSignalWith);
  exceptionMeta.methodDict.set(u.symbols.intern(","), exceptionComma);

  // new/basicNew en Object class (metaclase raíz): instanciación general (las
  // metaclases de Exception y subtipos la heredan por la cadena de metaclases).
  const objectMeta = u.Object.class;
  objectMeta.methodDict.set(u.symbols.intern("new"), classBasicNew);
  objectMeta.methodDict.set(u.symbols.intern("basicNew"), classBasicNew);

  // ── Evaluación protegida + terminación (BlockClosure) ─────────────────────
  u.BlockClosure.methodDict.set(u.symbols.intern("on:do:"), blockOnDo);
  u.BlockClosure.methodDict.set(u.symbols.intern("on:do:on:do:"), blockOnDoOnDo);
}
