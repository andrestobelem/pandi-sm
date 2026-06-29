// KERNELLOAD §5.4.0 · loadKernelSources — cargador de kernel .st en DOS PASADAS.
// Convierte fuentes .st en un grafo de STClass vivo y consistente reusando S1
// (subclass:/namespace, makeClassWithMetaclass) + S2 (CompiledMethod/super,
// defineMethod). NO añade parser: el class-def y los method-defs NO son parseables
// como expresiones por L1 (DRIFT-E), así que partimos la FUENTE por líneas y
// delegamos sólo el CUERPO `[ … ]` de cada método a parse() vía defineMethod.
//
// Formato .st de KERNELLOAD (delimitador documentado, plan §5.4.0 línea 846/852):
//   · Frontmatter de procedencia: un comentario `"@provenance: <tag>"` (opcional;
//     si falta, se deriva un tag no-vacío del nombre de clase) — KERNELLOAD-PROVENANCE.
//   · 1 class-def: `<Super> subclass: #<Name> [instanceVariableNames: '…' …]` (o la
//     variante corta `<Super> subclass: #<Name>`). PRIMER statement no-comentario.
//   · N method-defs: `<Name> >> <patrón> [ <cuerpo> ]`, uno por header `Name >>`.
//     El chunk `!`/Tonel queda RECHAZADO en el MVP (plan línea 844).
//
// Resolución forward-ref DETERMINISTA en dos pasadas sobre UN namespace (la única
// fuente de verdad, sembrada por bootstrap): Pasada-1 declara los stubs en orden
// topológico por superclase (cadenas + metaclases completas); Pasada-2 compila e
// instala los métodos (los cuerpos resuelven clases declaradas DESPUÉS vía el mismo
// namespace en tiempo de envío). installPrimitives corre ANTES (el caller lo hace),
// por lo que los cuerpos .st pueden llamar primitivas de su propia clase.

import {
  makeClassWithMetaclass,
  type STClass,
  type STValue,
  type Universe,
} from "../runtime/index.js";
import { defineMethod } from "./method.js";

/** Clases de fallo del cargador (negativos deterministas, GATE-KERNELLOAD-ERRORS). */
export type KernelLoadErrorKind =
  | "unresolved-superclass"
  | "cycle"
  | "duplicate-class"
  | "method-on-missing-class";

/**
 * KernelLoadError — fallo de carga durante una pasada (NO un dNU de runtime). Lleva
 * un `kind` discriminante para que los negativos sean testeables sin parsear texto.
 */
export class KernelLoadError extends Error {
  constructor(
    readonly kind: KernelLoadErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "KernelLoadError";
  }
}

/**
 * StSource — una fuente .st parseada a su forma estructural: el nombre de la clase
 * que define, el nombre de su superclase (sin resolver aún), la fuente del class-def
 * (texto del primer statement), las fuentes de los method-defs (cada una sin el
 * prefijo `Name >> `, lista para defineMethod) y el provenanceTag (no-vacío).
 */
export interface StSource {
  className: string;
  superclassName: string;
  /** Texto del class-def (primer statement). Conservado para depuración/provenance. */
  classDefNode: string;
  /** Cada method-def como `patrón [ cuerpo ]` (prefijo `Name >> ` ya retirado). */
  methodDefNodes: string[];
  /** Tag de procedencia NO vacío (frontmatter o derivado del nombre). */
  provenanceTag: string;
}

/** Cuenta los ivars de un `instanceVariableNames: '…'` ('a b c' -> 3). */
function countIvarsFromClassDef(classDef: string): number {
  // Captura el string-literal que sigue a instanceVariableNames:.
  const m = classDef.match(/instanceVariableNames:\s*'([^']*)'/);
  if (m === null) return 0;
  const trimmed = (m[1] as string).trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * parseStSource(source) — parte una fuente .st en su StSource. Lee el frontmatter
 * de procedencia (`"@provenance: tag"`), localiza el class-def (primer statement) y
 * los method-defs (líneas/bloques que empiezan por `Name >>`). NO usa parse() para
 * el class-def ni el patrón de método (L1 no los soporta); sólo extrae los nombres
 * y deja que defineMethod (S2) parsee el cuerpo del método en la pasada 2.
 */
export function parseStSource(source: string): StSource {
  // ── Provenance: primer comentario `"@provenance: <tag>"`; si no, derivado. ──
  const provMatch = source.match(/"@provenance:\s*([^"]+)"/);
  // Quitamos TODOS los comentarios "…" para no confundir el split del class-def.
  const noComments = source.replace(/"[^"]*"/g, "");

  // ── class-def: el class-def termina antes del primer header de method-def
  //    (`Name >>`). Todo lo anterior (sin comentarios) es el class-def. ──────
  const headerRe = /^[ \t]*([A-Za-z_]\w*)[ \t]+class[ \t]*>>|^[ \t]*([A-Za-z_]\w*)[ \t]*>>/m;
  const headerMatch = noComments.search(headerRe);
  const classDefPart = (headerMatch >= 0 ? noComments.slice(0, headerMatch) : noComments).trim();

  // El superclassName es el PRIMER token; el className es el símbolo tras subclass:.
  const supMatch = classDefPart.match(/^([A-Za-z_]\w*)\s+subclass:/);
  const nameMatch = classDefPart.match(/subclass:\s*#([A-Za-z_]\w*)/);
  if (supMatch === null || nameMatch === null) {
    throw new KernelLoadError(
      "unresolved-superclass",
      `class-def .st mal formado (se esperaba '<Super> subclass: #<Name> …'): ${classDefPart}`,
    );
  }
  const superclassName = supMatch[1] as string;
  const className = nameMatch[1] as string;

  // ── method-defs: cada uno empieza en un header `Name >> …` y abarca hasta el
  //    `]` que cierra su cuerpo (balanceado). Retiramos el prefijo `Name >> `. ──
  const methodDefNodes = splitMethodDefs(noComments, className);

  const provenanceTag =
    provMatch !== null ? (provMatch[1] as string).trim() : `derived:${className}`;

  return {
    className,
    superclassName,
    classDefNode: classDefPart,
    methodDefNodes,
    provenanceTag: provenanceTag.length > 0 ? provenanceTag : `derived:${className}`,
  };
}

/**
 * splitMethodDefs — extrae los method-defs `Name >> patrón [ cuerpo ]` de la fuente
 * (sin comentarios) y devuelve cada uno como `patrón [ cuerpo ]` (prefijo retirado).
 * Recorre buscando un header `<Owner> >>`; el cuerpo es lo balanceado entre el `[`
 * que sigue y su `]` de cierre a nivel 0. El owner debe coincidir con la clase de
 * la fuente; un owner ajeno (clase no declarada en ESTA fuente) es un error de carga.
 */
function splitMethodDefs(noComments: string, owner: string): string[] {
  const defs: string[] = [];
  // Header: `Name >>` o `Name class >>` (lado-clase se acepta sintácticamente pero
  // el lado-instancia es lo soportado; el lado-clase se documenta como diferido).
  const headerRe = /([A-Za-z_]\w*)[ \t]*(class[ \t]+)?>>/g;
  let m: RegExpExecArray | null = headerRe.exec(noComments);
  while (m !== null) {
    const ownerName = m[1] as string;
    // El cuerpo arranca en el primer `[` tras el header; lo balanceamos a nivel 0.
    const afterHeader = m.index + m[0].length;
    const open = noComments.indexOf("[", afterHeader);
    if (open < 0) {
      throw new KernelLoadError(
        "method-on-missing-class",
        `method-def sin cuerpo '[' para ${ownerName} >>`,
      );
    }
    let depth = 0;
    let close = -1;
    for (let i = open; i < noComments.length; i++) {
      const c = noComments[i];
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) {
      throw new KernelLoadError(
        "method-on-missing-class",
        `method-def con cuerpo sin cerrar ']' para ${ownerName} >>`,
      );
    }
    // El owner debe ser la clase de esta fuente (lado-instancia). Owner ajeno: error.
    if (ownerName !== owner) {
      throw new KernelLoadError(
        "method-on-missing-class",
        `method-def sobre '${ownerName}' en la fuente de '${owner}' (clase no declarada aquí)`,
      );
    }
    // `patrón [ cuerpo ]` (sin el prefijo `Name >> `): justo lo que defineMethod espera.
    const pattern = noComments.slice(afterHeader, open).trim();
    const body = noComments.slice(open, close + 1);
    defs.push(`${pattern} ${body}`);
    headerRe.lastIndex = close + 1;
    m = headerRe.exec(noComments);
  }
  return defs;
}

/**
 * topologicalOrder — ordena las fuentes de modo que la superclase de cada clase
 * aparezca ANTES (o ya esté en el namespace base). Resuelve forward refs de super
 * y detecta ciclos (KernelLoadError{cycle}) y duplicados (KernelLoadError{duplicate}).
 * Las superclases que NO están ni en el namespace base ni entre las fuentes son
 * superclases-no-resueltas. La detección de ciclo es la ausencia de progreso: si en
 * una pasada no se puede ubicar ninguna fuente restante, lo restante es ciclo o
 * super-no-resuelta (se distinguen mirando si la super es conocida en absoluto).
 */
function topologicalOrder(sources: StSource[], u: Universe): StSource[] {
  // Duplicados: dos fuentes con el mismo className, o un className ya en el namespace.
  const byName = new Map<string, StSource>();
  for (const s of sources) {
    if (byName.has(s.className) || u.namespace.has(s.className)) {
      throw new KernelLoadError(
        "duplicate-class",
        `clase duplicada: ${s.className} ya declarada (en otra fuente o en el núcleo)`,
      );
    }
    byName.set(s.className, s);
  }
  const known = new Set<string>(u.namespace.keys());
  const allNames = new Set<string>([...known, ...byName.keys()]);
  // Superclase desconocida en absoluto (ni núcleo ni fuente) => no resoluble.
  for (const s of sources) {
    if (!allNames.has(s.superclassName)) {
      throw new KernelLoadError(
        "unresolved-superclass",
        `superclase no resuelta: ${s.superclassName} (super de ${s.className})`,
      );
    }
  }
  // Orden topológico de Kahn: emite una fuente cuando su super ya está resuelta.
  const ordered: StSource[] = [];
  const resolved = new Set<string>(known);
  const pending = new Set<string>(byName.keys());
  let progress = true;
  while (pending.size > 0 && progress) {
    progress = false;
    for (const name of [...pending]) {
      const s = byName.get(name) as StSource;
      if (resolved.has(s.superclassName)) {
        ordered.push(s);
        resolved.add(name);
        pending.delete(name);
        progress = true;
      }
    }
  }
  if (pending.size > 0) {
    // Sin progreso con fuentes restantes: las supers son entre-sí (ciclo). Las
    // supers desconocidas ya se filtraron arriba, así que esto SÓLO puede ser ciclo.
    throw new KernelLoadError("cycle", `ciclo de herencia entre: ${[...pending].join(", ")}`);
  }
  return ordered;
}

/**
 * loadKernelSources(u, rawSources) — carga las fuentes .st en el Universe `u` en dos
 * pasadas. Pasada-1: declara cada clase (orden topológico) vía makeClassWithMetaclass
 * (el MISMO camino que la primitiva subclass:, sin drift); las cadenas y metaclases
 * quedan completas y registradas en el namespace. Pasada-2: compila e instala cada
 * method-def (defineMethod), cuyos cuerpos resuelven cualquier clase del namespace
 * (incl. las declaradas después) en tiempo de envío. Devuelve las StSource cargadas.
 */
export function loadKernelSources(u: Universe, rawSources: string[]): StSource[] {
  const sources = rawSources.map(parseStSource);

  // ── Pasada 1: declarar los stubs de clase en orden topológico ────────────
  const ordered = topologicalOrder(sources, u);
  for (const s of ordered) {
    const superclass = u.namespace.get(s.superclassName) as STClass;
    // DEV-025: instSize ACUMULATIVO = ivars propios del class-def + slots heredados de
    // la superclase (ya declarada en orden topológico). Sin esto, una subclase .st con
    // ivars heredados tendría menos slots que su cadena y instVarAt: del slot heredado
    // caería fuera de rango.
    const instSize = countIvarsFromClassDef(s.classDefNode) + superclass.instSize;
    makeClassWithMetaclass(s.className, superclass, instSize, u);
  }

  // ── Pasada 2: compilar e instalar los métodos (forward refs en los cuerpos) ──
  for (const s of sources) {
    const cls = u.namespace.get(s.className) as STClass;
    for (const def of s.methodDefNodes) {
      defineMethod(cls, def, u, s.provenanceTag);
    }
  }

  // Reaseveramos la terminación de cadenas: toda clase recién cargada llega a Object.
  for (const s of sources) {
    assertChainTerminates(u.namespace.get(s.className) as STClass, u);
  }
  return sources;
}

/** Camina la cadena de superclases (acotada) verificando que termina en Object->nil. */
function assertChainTerminates(cls: STClass, u: Universe): void {
  let cur: STClass | null = cls;
  let guard = 0;
  while (cur !== null) {
    if (guard++ > 1000) {
      throw new KernelLoadError("cycle", `cadena de superclase no termina para ${cls.name}`);
    }
    const sup: STValue | null = cur.superclass;
    cur = sup !== null && sup !== u.nil && "methodDict" in sup ? (sup as STClass) : null;
  }
}
