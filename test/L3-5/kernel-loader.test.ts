/**
 * L3.5 · KERNELLOAD S3 — cargador de kernel .st en dos pasadas (loadKernelSources).
 * Construye StSource desde una fuente .st (frontmatter de procedencia + 1 class-def
 * + N method-defs `Name >> patrón [ … ]`), y carga un conjunto de fuentes en un
 * grafo de STClass vivo y consistente reusando S1 (subclass:/namespace) + S2
 * (CompiledMethod/super). Resolución forward-ref determinista en dos pasadas:
 *   · Pasada 1 declareClassStub (orden topológico por superclase; KernelLoadError
 *     en ciclo/superclase-no-resuelta/duplicado; cadenas + metaclases completas);
 *   · Pasada 2 installMethods (compila -> CompiledMethod, addSelector:; los cuerpos
 *     resuelven clases declaradas DESPUÉS vía el namespace).
 * GATES (plan §5.4.0): FORWARDREF, TWOPASS-METHOD, METACLOSURE, ERRORS, PROVENANCE
 * + un puente de integración (dispatch send/super/dNU a profundidad ACOTADA, con
 * jerarquía sintética para NO chocar con las primitivas de Boolean/True/False L3).
 *
 * @section L3-5.kernel-loader
 * @kind    positive
 * @layer   L3.5
 */
import { describe, expect, it } from "vitest";
import { KernelLoadError, loadKernelSources, parseStSource } from "../../src/eval/kernel-loader.js";
import { installPrimitives } from "../../src/eval/primitives.js";
import { send } from "../../src/eval/send.js";
import { basicNew, bootstrapKernel, classOf, type STClass } from "../../src/runtime/index.js";

/** Universe fresco con primitivas instaladas (mismo bootstrap que evalWith). */
function freshUniverse() {
  const u = bootstrapKernel();
  installPrimitives(u);
  return u;
}

type Univ = ReturnType<typeof freshUniverse>;

/** Carga fuentes en un Universe fresco y devuelve {u}. */
function load(sources: string[]): Univ {
  const u = freshUniverse();
  loadKernelSources(u, sources);
  return u;
}

// Una fuente .st sintética: frontmatter de procedencia + class-def + method-defs.
const SHAPE = `"@provenance: shape.st"
Object subclass: #Shape instanceVariableNames: '' classVariableNames: '' package: 'Geo'
Shape >> area [ ^ 0 ]`;

describe("L3.5 · parseStSource (forma StSource)", () => {
  it("extrae className/superclassName/provenanceTag + method-defs", () => {
    const src = parseStSource(SHAPE);
    expect(src.className).toBe("Shape");
    expect(src.superclassName).toBe("Object");
    expect(src.provenanceTag).toBe("shape.st");
    expect(src.methodDefNodes.length).toBe(1);
    expect(src.classDefNode).not.toBeUndefined();
  });

  it("toda StSource lleva un provenanceTag NO vacío (KERNELLOAD-PROVENANCE)", () => {
    const src = parseStSource(SHAPE);
    expect(src.provenanceTag.length).toBeGreaterThan(0);
  });

  it("una fuente sin frontmatter explícito recibe un provenanceTag derivado no vacío", () => {
    const src = parseStSource(
      "Object subclass: #Bare instanceVariableNames: '' classVariableNames: '' package: 'P'",
    );
    expect(src.provenanceTag.length).toBeGreaterThan(0);
  });
});

describe("L3.5 · GATE-KERNELLOAD-FORWARDREF (>=5 clases, >=2 forward refs)", () => {
  // 5 clases con orden de declaración deliberadamente DESORDENADO (forward refs):
  // C antes que su super B; D referencia a E (declarada después) en un cuerpo.
  const sources = [
    `"@provenance: c.st"
Object subclass: #C instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    `"@provenance: b.st"
A subclass: #B instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    `"@provenance: a.st"
Object subclass: #A instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    `"@provenance: d.st"
B subclass: #D instanceVariableNames: '' classVariableNames: '' package: 'P'
D >> makeE [ ^ E ]`,
    `"@provenance: e.st"
C subclass: #E instanceVariableNames: '' classVariableNames: '' package: 'P'`,
  ];

  it("cada clase X tiene cadena de superclase que termina en Object->nil sin ciclos", () => {
    const u = load(sources);
    for (const name of ["A", "B", "C", "D", "E"]) {
      const cls = u.namespace.get(name) as STClass;
      expect(cls).not.toBeUndefined();
      // Caminamos la cadena ACOTADA hasta nil; verificamos terminación en Object.
      const chain: string[] = [];
      let cur: STClass | null = cls;
      let guard = 0;
      while (cur !== null && guard++ < 50) {
        chain.push(cur.name);
        const sup: STClass["superclass"] = cur.superclass;
        cur = sup !== null && sup !== u.nil && "methodDict" in sup ? (sup as STClass) : null;
      }
      expect(chain[chain.length - 1]).toBe("Object");
      expect(guard).toBeLessThan(50); // no hubo ciclo
    }
  });

  it("la cadena declarada de E es E->C->Object (forward ref de super resuelto)", () => {
    const u = load(sources);
    const E = u.namespace.get("E") as STClass;
    expect((E.superclass as STClass).name).toBe("C");
    expect(((E.superclass as STClass).superclass as STClass).name).toBe("Object");
  });

  it("la cadena declarada de D es D->B->A->Object", () => {
    const u = load(sources);
    const D = u.namespace.get("D") as STClass;
    expect((D.superclass as STClass).name).toBe("B");
    expect(((D.superclass as STClass).superclass as STClass).name).toBe("A");
  });
});

describe("L3.5 · GATE-KERNELLOAD-TWOPASS-METHOD (A>>m refs later-declared B)", () => {
  // A se declara y su método referencia B (declarada DESPUÉS). El cuerpo resuelve
  // B en tiempo de envío vía el namespace (no en compile-time).
  const sources = [
    `"@provenance: a.st"
Object subclass: #Aa instanceVariableNames: '' classVariableNames: '' package: 'P'
Aa >> theB [ ^ Bb ]`,
    `"@provenance: b.st"
Object subclass: #Bb instanceVariableNames: '' classVariableNames: '' package: 'P'`,
  ];

  it("Aa>>theB resuelve la clase Bb (declarada después) en tiempo de envío", () => {
    const u = load(sources);
    const Aa = u.namespace.get("Aa") as STClass;
    const Bb = u.namespace.get("Bb") as STClass;
    const inst = basicNew(Aa, u);
    expect(send(inst, "theB", [], u)).toBe(Bb);
  });
});

describe("L3.5 · GATE-KERNELLOAD-METACLOSURE (namespace completo + trampa Object)", () => {
  const sources = [
    `"@provenance: a.st"
Object subclass: #Ma instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    `"@provenance: b.st"
Ma subclass: #Mb instanceVariableNames: '' classVariableNames: '' package: 'P'`,
  ];

  it("classOf(classOf(X)) === Metaclass para todo el namespace", () => {
    const u = load(sources);
    for (const X of u.namespace.values()) {
      expect(classOf(classOf(X, u), u)).toBe(u.Metaclass);
    }
  });

  it("X class superclass === X superclass class para toda clase con super no-nil", () => {
    const u = load(sources);
    for (const X of u.namespace.values()) {
      const sup = X.superclass;
      if (sup !== null && sup !== u.nil && "methodDict" in sup) {
        expect(classOf(X, u).superclass).toBe(classOf(sup as STClass, u));
      }
    }
  });

  it("la trampa Object: classOf(Object).superclass === Class", () => {
    const u = load(sources);
    expect(classOf(u.Object, u).superclass).toBe(u.Class);
  });
});

describe("L3.5 · GATE-KERNELLOAD-ERRORS (>=3 negativos deterministas)", () => {
  it("superclase no resuelta -> KernelLoadError{kind:'unresolved-superclass'}", () => {
    const sources = [
      `"@provenance: x.st"
NoSuchSuper subclass: #X instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    ];
    try {
      load(sources);
      throw new Error("se esperaba KernelLoadError");
    } catch (e) {
      expect(e).toBeInstanceOf(KernelLoadError);
      expect((e as KernelLoadError).kind).toBe("unresolved-superclass");
    }
  });

  it("ciclo de herencia -> KernelLoadError{kind:'cycle'}", () => {
    // P < Q y Q < P: ninguna tiene super resoluble al núcleo => ciclo.
    const sources = [
      `"@provenance: p.st"
Qy subclass: #Py instanceVariableNames: '' classVariableNames: '' package: 'P'`,
      `"@provenance: q.st"
Py subclass: #Qy instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    ];
    try {
      load(sources);
      throw new Error("se esperaba KernelLoadError");
    } catch (e) {
      expect(e).toBeInstanceOf(KernelLoadError);
      expect((e as KernelLoadError).kind).toBe("cycle");
    }
  });

  it("method-def sobre clase no declarada -> KernelLoadError{kind:'method-on-missing-class'}", () => {
    const sources = [
      `"@provenance: m.st"
Object subclass: #Mm instanceVariableNames: '' classVariableNames: '' package: 'P'
Ghost >> boo [ ^ 1 ]`,
    ];
    try {
      load(sources);
      throw new Error("se esperaba KernelLoadError");
    } catch (e) {
      expect(e).toBeInstanceOf(KernelLoadError);
      expect((e as KernelLoadError).kind).toBe("method-on-missing-class");
    }
  });

  it("clase duplicada -> KernelLoadError{kind:'duplicate-class'}", () => {
    const sources = [
      `"@provenance: d1.st"
Object subclass: #Dup instanceVariableNames: '' classVariableNames: '' package: 'P'`,
      `"@provenance: d2.st"
Object subclass: #Dup instanceVariableNames: '' classVariableNames: '' package: 'P'`,
    ];
    try {
      load(sources);
      throw new Error("se esperaba KernelLoadError");
    } catch (e) {
      expect(e).toBeInstanceOf(KernelLoadError);
      expect((e as KernelLoadError).kind).toBe("duplicate-class");
    }
  });
});

describe("L3.5 · GATE-KERNELLOAD-PROVENANCE (0 StSource sin tag)", () => {
  it("toda StSource derivada de un .st lleva provenanceTag no vacío", () => {
    const sources = [SHAPE, "Object subclass: #Bare2"];
    for (const s of sources) {
      const parsed = parseStSource(s);
      expect(parsed.provenanceTag.length).toBeGreaterThan(0);
    }
  });
});

describe("L3.5 · puente de integración (send/super/dNU a profundidad ACOTADA)", () => {
  // Jerarquía SINTÉTICA (NO Boolean/True/False, que conservan sus primitivas L3).
  // Base define greet; Mid override con super; Leaf hereda. Recursión acotada.
  const sources = [
    `"@provenance: base.st"
Object subclass: #Base instanceVariableNames: '' classVariableNames: '' package: 'P'
Base >> tag [ ^ 1 ]`,
    `"@provenance: mid.st"
Base subclass: #Mid instanceVariableNames: '' classVariableNames: '' package: 'P'
Mid >> tag [ ^ (super tag) + 10 ]`,
    `"@provenance: leaf.st"
Mid subclass: #Leaf instanceVariableNames: '' classVariableNames: '' package: 'P'
Leaf >> count: n [ ^ (n <= 0) ifTrue: [ self tag ] ifFalse: [ self count: n - 1 ] ]`,
  ];

  it("super sube por la cadena de .st: Mid>>tag = super tag + 10 = 11", () => {
    const u = load(sources);
    const Mid = u.namespace.get("Mid") as STClass;
    expect(send(basicNew(Mid, u), "tag", [], u)).toBe(11);
  });

  it("Leaf hereda tag de Mid (=11) y la recursión acotada termina", () => {
    const u = load(sources);
    const Leaf = u.namespace.get("Leaf") as STClass;
    // count: hace auto-recursión acotada hasta n<=0, luego self tag (=11 via Mid).
    expect(send(basicNew(Leaf, u), "count:", [5], u)).toBe(11);
  });

  it("un envío no entendido cae a doesNotUnderstand: (error de host determinista)", () => {
    const u = load(sources);
    const Base = u.namespace.get("Base") as STClass;
    expect(() => send(basicNew(Base, u), "noSuchMethod", [], u)).toThrowError(
      /doesNotUnderstand|no entiende/,
    );
  });
});
