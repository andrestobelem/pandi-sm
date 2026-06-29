// Host-runner · descubrimiento de corpus `.st` + parseo de frontmatter (L0).
//
// Convención de frontmatter (ver `test/README.md`): el primer comentario
// Smalltalk del archivo contiene un bloque `key: value` delimitado por líneas
// `---`. En L0 sólo descubrimos y parseamos; la EJECUCIÓN del corpus se activa
// cuando el RuntimeAdapter real (L1/L3) sustituya al stub.
//
// L6: añade ConformanceMeta, validateFrontmatter y loadConformanceCase para
// validación ESTRICTA del frontmatter (fail-not-skip, L6.C).  parseFrontmatter
// y loadStCase permanecen LENIENTES para compatibilidad con callers de L0/L1.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface StCase {
  file: string;
  meta: Record<string, string>;
  body: string;
}

// ─── L6 conformance schema ───────────────────────────────────────────────────

/** Valid values for the `kind` field. */
const KIND_VALUES = ["positive", "negative"] as const;
type Kind = (typeof KIND_VALUES)[number];

/** Valid values for the `phase` field. */
const PHASE_VALUES = ["lex", "parse", "eval"] as const;
type Phase = (typeof PHASE_VALUES)[number];

/** Valid values for the `origin` field. */
const ORIGIN_VALUES = [
  "spec-ANSI",
  "dialecto:pharo",
  "dialecto:squeak",
  "extension-propia",
  "ingenieria",
] as const;
type Origin = (typeof ORIGIN_VALUES)[number];

/**
 * Strictly-typed frontmatter for conformance corpus files (L6).
 *
 * Required: id, kind, phase, layer, spec, origin, section.
 * Optional: title, note, codes (required for negatives by convention),
 *           deviation (DEV-NNN, for non-spec-ANSI cases).
 */
export interface ConformanceMeta {
  /** Unique identifier = filename stem. */
  id: string;
  kind: Kind;
  phase: Phase;
  /** Layer tag, e.g. "L1". */
  layer: string;
  /** Spec anchor, e.g. "anexoA:array.literal". */
  spec: string;
  origin: Origin;
  /** Human-readable section tag (kept from legacy frontmatter). */
  section: string;
  /** Optional prose description. */
  note?: string;
  /** Optional human-readable title. */
  title?: string;
  /** Space-separated error codes (required for negatives). */
  codes?: string;
  /** DEV-NNN entry that covers this case (required if origin != spec-ANSI). */
  deviation?: string;
  /** Expected printString for positive eval cases (optional assertion). */
  printString?: string;
}

/** A conformance case with STRICT typed metadata. */
export interface ConformanceCase {
  file: string;
  meta: ConformanceMeta;
  body: string;
}

/**
 * Validates that a parsed frontmatter record satisfies the ConformanceMeta
 * schema.  Throws a descriptive error on the FIRST violation (fail-not-skip,
 * L6.C).
 */
export function validateFrontmatter(meta: ConformanceMeta): void {
  const require = (key: keyof ConformanceMeta, label = key as string): void => {
    if (!meta[key]) throw new Error(`conformance frontmatter missing required field: '${label}'`);
  };

  require("id");
  require("layer");
  require("spec");
  require("section");
  require("origin");

  // kind
  if (!meta.kind) throw new Error("conformance frontmatter missing required field: 'kind'");
  if (!(KIND_VALUES as readonly string[]).includes(meta.kind)) {
    throw new Error(
      `conformance frontmatter invalid 'kind': '${meta.kind}'. Expected one of: ${KIND_VALUES.join(", ")}`,
    );
  }

  // phase
  if (!meta.phase) throw new Error("conformance frontmatter missing required field: 'phase'");
  if (!(PHASE_VALUES as readonly string[]).includes(meta.phase)) {
    throw new Error(
      `conformance frontmatter invalid 'phase': '${meta.phase}'. Expected one of: ${PHASE_VALUES.join(", ")}`,
    );
  }

  // origin (already checked for presence above, but check enum too)
  if (!(ORIGIN_VALUES as readonly string[]).includes(meta.origin)) {
    throw new Error(
      `conformance frontmatter invalid 'origin': '${meta.origin}'. Expected one of: ${ORIGIN_VALUES.join(", ")}`,
    );
  }
}

/**
 * Loads a `.st` corpus file and validates its frontmatter STRICTLY.
 * Throws if frontmatter is absent, malformed, or missing any required field.
 * (L6.C fail-not-skip contract.)
 */
export function loadConformanceCase(file: string): ConformanceCase {
  const src = readFileSync(file, "utf8");
  const { meta: rawMeta, body } = parseFrontmatter(src);

  // If parseFrontmatter returned an empty meta, the .st has no valid frontmatter.
  if (Object.keys(rawMeta).length === 0) {
    throw new Error(`conformance: no valid frontmatter found in '${file}'`);
  }

  // Cast to ConformanceMeta (raw values are strings; type-cast then validate).
  const meta = rawMeta as unknown as ConformanceMeta;
  validateFrontmatter(meta);

  return { file, meta, body };
}

const FENCE = "---";
// Primer comentario Smalltalk del fuente: "..." con "" como escape de comilla.
const LEADING_COMMENT = /^\s*"((?:[^"]|"")*)"/;

/** Extrae el frontmatter fenced del primer comentario y devuelve el cuerpo restante. */
export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = LEADING_COMMENT.exec(src);
  const comment = m?.[1];
  if (m === null || comment === undefined) {
    return { meta: {}, body: src };
  }

  const lines = comment.split("\n").map((l) => l.trim());
  const open = lines.indexOf(FENCE);
  const close = open === -1 ? -1 : lines.indexOf(FENCE, open + 1);
  if (open === -1 || close === -1) {
    return { meta: {}, body: src };
  }

  const meta: Record<string, string> = {};
  for (const line of lines.slice(open + 1, close)) {
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key !== "") meta[key] = line.slice(idx + 1).trim();
  }

  return { meta, body: src.slice(m[0].length).trim() };
}

/** Descubre recursivamente los `.st` bajo `dir` (orden estable). Dir inexistente → []. */
export function discoverStFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".st")) out.push(p);
    }
  };
  try {
    walk(dir);
  } catch {
    // Aún no hay corpus `.st` en L0: corpus vacío, no es un error.
  }
  return out.sort();
}

/** Carga un caso `.st`: frontmatter + cuerpo. */
export function loadStCase(file: string): StCase {
  const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
  return { file, meta, body };
}
