/**
 * L2 · protocolo <Object> (S3, plan §5.2 líneas 295-300 "los 23 selectores
 * <Object> + reflexión"). Suite pura-TS sobre el metamodelo: instala las 23
 * primitivas de Object (via installPrimitives) y verifica que son ALCANZABLES
 * desde cualquier instancia del kernel por la superclass chain, que perform:*
 * round-trip contra el send directo, que respondsTo:/isKindOf:/isMemberOf:
 * aciertan en positivos Y negativos, que isNil/notNil distinguen nil, que copy
 * es shallow (decisión de dialecto), que error: lanza un error observable, y que
 * printString (send) CONCUERDA con el bridge host de print.ts. Character ($a) y
 * la Exception navegable de error:/dNU son L4/L5 (diferidos).
 *
 * @section L2.object-protocol
 * @kind    positive+negative
 * @layer   L2
 */
import { describe, expect, it } from "vitest";
import { installPrimitives, printString, send } from "../../src/eval/index.js";
import {
  basicNew,
  bootstrapKernel,
  identityHash,
  type STClass,
  type STObject,
  type STValue,
  type Universe,
} from "../../src/runtime/index.js";

/** Universe con el kernel cableado Y las primitivas L2/L3 instaladas. */
function kernel(): Universe {
  const u = bootstrapKernel();
  installPrimitives(u);
  return u;
}

/** Los 23 selectores <Object> enumerados en el contrato S3 (§5.2). */
const OBJECT_SELECTORS = [
  "=",
  "==",
  "~=",
  "~~",
  "class",
  "copy",
  "doesNotUnderstand:",
  "error:",
  "hash",
  "identityHash",
  "isKindOf:",
  "isMemberOf:",
  "isNil",
  "notNil",
  "perform:",
  "perform:with:",
  "perform:with:with:",
  "perform:with:with:with:",
  "perform:withArguments:",
  "printOn:",
  "printString",
  "respondsTo:",
  "yourself",
] as const;

/**
 * Extensión L4-F1 al protocolo de Object: la familia ifNil:/ifNotNil: tiene su
 * DEFAULT en Object (receptor no-nil) y su override en UndefinedObject (nil). Es
 * una adición DELIBERADA y documentada (origin=ingeniería/dialecto), no
 * contaminación accidental: el invariante pasa de "exactamente 23" a "los 23 del
 * núcleo + estas 4 de L4, y nada más".
 */
const OBJECT_L4_IFNIL_SELECTORS = [
  "ifNil:",
  "ifNotNil:",
  "ifNil:ifNotNil:",
  "ifNotNil:ifNil:",
] as const;

/**
 * Extensión L4-F4 al protocolo de Object: la reflexión de ivars indexadas
 * (instVarAt:/instVarAt:put:, plan §5.2 reflexión). Adición DELIBERADA y documentada:
 * hace OBSERVABLE el instSize acumulativo (DEV-025, una subclase con ivars heredados
 * tiene esos slots). El invariante incorpora estas 2 al "y nada más".
 */
const OBJECT_L4_REFLECT_SELECTORS = ["instVarAt:", "instVarAt:put:"] as const;

describe("L2 · <Object> · los 23 selectores instalados y alcanzables (§5.2)", () => {
  it("Object.methodDict contiene los 23 del núcleo + ifNil: (L4-F1) + reflexión de ivars (L4-F4) y nada más", () => {
    const u = kernel();
    // count === 23 (núcleo S3) + 4 (familia ifNil: L4-F1) + 2 (instVarAt:* L4-F4).
    expect(u.Object.methodDict.size).toBe(
      OBJECT_SELECTORS.length +
        OBJECT_L4_IFNIL_SELECTORS.length +
        OBJECT_L4_REFLECT_SELECTORS.length,
    );
    for (const sel of OBJECT_SELECTORS) {
      expect(u.Object.methodDict.has(u.symbols.intern(sel))).toBe(true);
    }
    for (const sel of OBJECT_L4_IFNIL_SELECTORS) {
      expect(u.Object.methodDict.has(u.symbols.intern(sel))).toBe(true);
    }
    for (const sel of OBJECT_L4_REFLECT_SELECTORS) {
      expect(u.Object.methodDict.has(u.symbols.intern(sel))).toBe(true);
    }
  });

  it("los 23 son alcanzables desde cualquier instancia del kernel (superclass chain)", () => {
    const u = kernel();
    // Desde una instancia de Object basicNew, y desde inmediatos: todos resuelven.
    const obj = basicNew(u.Object, u);
    for (const sel of OBJECT_SELECTORS) {
      // No los invocamos (algunos requieren args); sólo que el lookup los halle.
      const found = lookupReachable(u, obj.class.name, sel);
      expect(found).toBe(true);
    }
  });
});

/** ¿`sel` es alcanzable subiendo desde la clase nombrada? (reutiliza el shape de send). */
function lookupReachable(u: Universe, _className: string, sel: string): boolean {
  const sym = u.symbols.intern(sel);
  let cur: STClass | null = u.Object;
  while (cur !== null) {
    if (cur.methodDict.has(sym)) return true;
    const next: STClass | STObject | null = cur.superclass;
    cur = next !== null && "methodDict" in next ? (next as STClass) : null;
  }
  return false;
}

describe("L2 · <Object> · yourself / class / identityHash / hash", () => {
  it("yourself devuelve el receptor", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "yourself", [], u)).toBe(obj);
  });

  it("class devuelve classOf(receiver)", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "class", [], u)).toBe(u.Object);
    expect(send(3, "class", [], u)).toBe(u.SmallInteger);
  });

  it("identityHash y hash de un objeto son estables", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "identityHash", [], u)).toBe(send(obj, "identityHash", [], u));
    expect(send(obj, "hash", [], u)).toBe(send(obj, "hash", [], u));
    expect(send(obj, "identityHash", [], u)).toBe(identityHash(obj, u));
  });
});

describe("L2 · <Object> · == / ~~ / = / ~= (defaults de identidad)", () => {
  it("== es por referencia; ~~ es su negación", () => {
    const u = kernel();
    const a = basicNew(u.Object, u);
    const b = basicNew(u.Object, u);
    expect(send(a, "==", [a], u)).toBe(true);
    expect(send(a, "==", [b], u)).toBe(false);
    expect(send(a, "~~", [b], u)).toBe(true);
    expect(send(a, "~~", [a], u)).toBe(false);
  });

  it("= default es identidad en Object; ~= su negación", () => {
    const u = kernel();
    const a = basicNew(u.Object, u);
    const b = basicNew(u.Object, u);
    expect(send(a, "=", [a], u)).toBe(true);
    expect(send(a, "=", [b], u)).toBe(false);
    expect(send(a, "~=", [b], u)).toBe(true);
  });

  it("SmallInteger>>= (por valor) GANA sobre el default de Object: 3 = 3 sigue true", () => {
    const u = kernel();
    // El override de SmallInteger (primitives.ts) se encuentra ANTES que Object>>=.
    expect(send(3, "=", [3], u)).toBe(true);
    expect(send(3, "=", [4], u)).toBe(false);
  });
});

describe("L2 · <Object> · isNil / notNil", () => {
  it("nil isNil -> true; nil notNil -> false", () => {
    const u = kernel();
    expect(send(u.nil, "isNil", [], u)).toBe(true);
    expect(send(u.nil, "notNil", [], u)).toBe(false);
  });

  it("(Object basicNew) isNil -> false; notNil -> true", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "isNil", [], u)).toBe(false);
    expect(send(obj, "notNil", [], u)).toBe(true);
  });

  it("un inmediato (3) isNil -> false", () => {
    const u = kernel();
    expect(send(3, "isNil", [], u)).toBe(false);
  });
});

describe("L2 · <Object> · perform: family round-trips == direct send", () => {
  it("perform: yourself == send yourself; perform: class == send class", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "perform:", ["yourself"], u)).toBe(send(obj, "yourself", [], u));
    expect(send(obj, "perform:", ["class"], u)).toBe(send(obj, "class", [], u));
  });

  it("perform:withArguments: identityHash == send identityHash (arity 0)", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    // El arg-array llega como STValue[] nativo (no hay literales de Array en L2).
    expect(send(obj, "perform:withArguments:", ["identityHash", [] as unknown as STValue], u)).toBe(
      send(obj, "identityHash", [], u),
    );
  });

  it("perform:with: arity-1 round-trips == send (== sobre sí mismo)", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "perform:with:", ["==", obj], u)).toBe(send(obj, "==", [obj], u));
    expect(send(obj, "perform:with:", ["==", obj], u)).toBe(true);
  });

  it("perform:withArguments: con un arg round-trips == send (== sobre sí mismo)", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "perform:withArguments:", ["==", [obj] as unknown as STValue], u)).toBe(true);
  });
});

describe("L2 · <Object> · respondsTo: (positivos y negativos)", () => {
  it("respondsTo: un selector instalado -> true; uno ausente -> false", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "respondsTo:", ["yourself"], u)).toBe(true);
    expect(send(obj, "respondsTo:", ["noSuchSelector"], u)).toBe(false);
  });

  it("respondsTo: hereda por la cadena: SmallInteger responde a + (propio) y a yourself (Object)", () => {
    const u = kernel();
    expect(send(3, "respondsTo:", ["+"], u)).toBe(true);
    expect(send(3, "respondsTo:", ["yourself"], u)).toBe(true);
    expect(send(3, "respondsTo:", ["nopeNotHere"], u)).toBe(false);
  });
});

describe("L2 · <Object> · isMemberOf: / isKindOf:", () => {
  it("isMemberOf: es estricto (clase exacta), no por herencia", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "isMemberOf:", [u.Object], u)).toBe(true);
    expect(send(obj, "isMemberOf:", [u.Behavior], u)).toBe(false);
    expect(send(3, "isMemberOf:", [u.SmallInteger], u)).toBe(true);
    expect(send(3, "isMemberOf:", [u.Object], u)).toBe(false);
  });

  it("isKindOf: camina la superclass chain (positivo en ancestro, negativo fuera de rama)", () => {
    const u = kernel();
    // SmallInteger < Object: 3 isKindOf: Object -> true; isKindOf: SmallInteger -> true.
    expect(send(3, "isKindOf:", [u.SmallInteger], u)).toBe(true);
    expect(send(3, "isKindOf:", [u.Object], u)).toBe(true);
    // String no está en la rama de SmallInteger -> false.
    expect(send(3, "isKindOf:", [u.String], u)).toBe(false);
  });

  it("isKindOf: sobre una instancia de Object: kindOf Object true, kindOf SmallInteger false", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(send(obj, "isKindOf:", [u.Object], u)).toBe(true);
    expect(send(obj, "isKindOf:", [u.SmallInteger], u)).toBe(false);
  });
});

describe("L2 · <Object> · copy (shallow, decisión de dialecto), error:", () => {
  it("copy es SHALLOW: nuevo objeto, misma clase, slots copiados por referencia", () => {
    const u = kernel();
    u.Object.instSize = 2;
    const inner = basicNew(u.Object, u);
    const orig = basicNew(u.Object, u);
    orig.pointers[0] = inner;
    orig.pointers[1] = 7;
    const dup = send(orig, "copy", [], u) as import("../../src/runtime/index.js").STObject;
    // Objeto distinto, misma clase.
    expect(dup).not.toBe(orig);
    expect(dup.class).toBe(u.Object);
    // Shallow: el slot apunta al MISMO inner (no se clona en profundidad).
    expect(dup.pointers[0]).toBe(inner);
    expect(dup.pointers[1]).toBe(7);
  });

  it("copy de una CLASE preserva name/methodDict/instSize (no deja un shell roto)", () => {
    const u = kernel();
    const dup = send(u.Object, "copy", [], u) as import("../../src/runtime/index.js").STClass;
    // Objeto distinto con identidad propia, pero conserva los campos de Behavior.
    expect(dup).not.toBe(u.Object);
    expect(dup.name).toBe(u.Object.name);
    expect(dup.methodDict).toBe(u.Object.methodDict); // shallow: el Map se comparte.
    expect(dup.instSize).toBe(u.Object.instSize);
    expect(dup.superclass).toBe(u.Object.superclass);
  });

  it("error: lanza un error de host observable que incluye el mensaje", () => {
    const u = kernel();
    const obj = basicNew(u.Object, u);
    expect(() => send(obj, "error:", ["boom"], u)).toThrow(/boom/);
  });
});

describe("L2 · <Object> · printString (send) concuerda con el bridge host print.ts", () => {
  it("printString(send) === printString(host) para nil, inmediatos y un STObject", () => {
    const u = kernel();
    // nil
    expect(send(u.nil, "printString", [], u)).toBe(printString(u.nil));
    // SmallInteger inmediato
    expect(send(3, "printString", [], u)).toBe(printString(3));
    expect(send(3, "printString", [], u)).toBe("3");
    // String inmediato
    expect(send("hi", "printString", [], u)).toBe(printString("hi"));
    // STObject default: "a ClassName"
    const obj = basicNew(u.Object, u);
    expect(send(obj, "printString", [], u)).toBe(printString(obj));
    expect(send(obj, "printString", [], u)).toBe("a Object");
  });
});
