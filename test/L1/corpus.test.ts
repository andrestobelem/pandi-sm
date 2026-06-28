/**
 * L1 · Corpus runner — ejecuta el corpus `.st` de L1 contra el parser real.
 *
 * Por cada fixture descubierto bajo `test/corpus/L1/`:
 *  - positive: parse(body) sin errores, ast no-nulo y astToJSON DETERMINISTA
 *    (parsear dos veces produce el mismo JSON canónico).
 *  - negative: la lista de `error.code` (en orden) iguala el frontmatter `codes`.
 * Además un meta-test asegura una cobertura mínima del corpus.
 *
 * @section toolchain.L1.corpus
 * @kind    positive
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { astToJSON } from "../../src/ast/index.js";
import { parse } from "../../src/parser/index.js";
import { discoverStFiles, loadStCase } from "../harness/st-runner.js";

const CORPUS_DIR = new URL("../corpus/L1/", import.meta.url).pathname;

const files = discoverStFiles(CORPUS_DIR);
const cases = files.map(loadStCase);
const positives = cases.filter((c) => c.meta.kind === "positive");
const negatives = cases.filter((c) => c.meta.kind === "negative");

describe("L1 corpus · positive fixtures parse cleanly and deterministically", () => {
  it.each(positives.map((c) => [c.file, c] as const))("%s", (_file, c) => {
    const first = parse(c.body);
    expect(first.errors).toEqual([]);
    expect(first.ast).not.toBeNull();

    // Determinismo: re-parsear y comparar el JSON canónico (R12).
    const second = parse(c.body);
    expect(astToJSON(first.ast as NonNullable<typeof first.ast>)).toEqual(
      astToJSON(second.ast as NonNullable<typeof second.ast>),
    );
  });
});

describe("L1 corpus · negative fixtures emit the declared error codes in order", () => {
  it.each(negatives.map((c) => [c.file, c] as const))("%s", (_file, c) => {
    const expected = (c.meta.codes ?? "").trim().split(/\s+/).filter(Boolean);
    const actual = parse(c.body).errors.map((e) => e.code);
    expect(actual).toEqual(expected);
  });
});

describe("L1 corpus · coverage", () => {
  it("has at least 40 positive and 18 negative fixtures", () => {
    expect(positives.length).toBeGreaterThanOrEqual(40);
    expect(negatives.length).toBeGreaterThanOrEqual(18);
  });
});
