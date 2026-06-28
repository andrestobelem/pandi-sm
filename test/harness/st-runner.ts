// Host-runner · descubrimiento de corpus `.st` + parseo de frontmatter (L0).
//
// Convención de frontmatter (ver `test/README.md`): el primer comentario
// Smalltalk del archivo contiene un bloque `key: value` delimitado por líneas
// `---`. En L0 sólo descubrimos y parseamos; la EJECUCIÓN del corpus se activa
// cuando el RuntimeAdapter real (L1/L3) sustituya al stub.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface StCase {
  file: string;
  meta: Record<string, string>;
  body: string;
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
