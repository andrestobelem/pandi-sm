/**
 * L4 · F6 — Stream en memoria (GATE-F6-STREAM, plan §5.4 línea 791).
 * Jerarquía Stream <- PositionableStream <- ReadStream / WriteStream / ReadWriteStream,
 * sobre una colección secuenciable in-memory (Array o String), con una `position` en un
 * campo dedicado (NO acceso por nombre de ivar — no está cableado; espejo de Interval
 * from/to/by y Array elements). Protocolo: next, nextPut:, atEnd, contents, upToEnd.
 *
 * Creación: `ReadStream on: aCollection` / `WriteStream on: aCollection`. La especie de
 * `contents`/`upToEnd` sigue la colección de respaldo (String => String; Array => Array).
 *
 * GATE-F6: >=6 positivos incl. un round-trip de WriteStream (nextPut: varios -> contents/
 * upToEnd) y atEnd en la frontera (true al final, false antes). Los retornos unspecified
 * (next pasado el final, valor de nextPut:) se documentan como desviación (DEV-042/043).
 *
 * @section L4.f6-stream
 * @kind    positive
 * @layer   L4
 */
import { describe, expect, it } from "vitest";
import { eval as evalSt, printString } from "../../src/eval/index.js";

describe("L4 · F6 · Stream · ReadStream (positivos)", () => {
  it("positivo 1 — ReadStream>>next entrega los elementos en orden", () => {
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2 3). s next"))).toBe("1");
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2 3). s next. s next"))).toBe("2");
  });

  it("positivo 2 — ReadStream>>atEnd en la frontera (false antes, true al final)", () => {
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2). s atEnd"))).toBe("false");
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2). s next. s next. s atEnd"))).toBe(
      "true",
    );
  });

  it("positivo 3 — ReadStream>>upToEnd entrega el resto (Array de respaldo => Array)", () => {
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2 3). s next. s upToEnd"))).toBe(
      "#(2 3)",
    );
  });

  it("positivo 4 — ReadStream sobre String: next entrega Characters, upToEnd un String", () => {
    expect(printString(evalSt("| s | s := ReadStream on: 'abc'. s next"))).toBe("$a");
    expect(printString(evalSt("| s | s := ReadStream on: 'abc'. s next. s upToEnd"))).toBe("bc");
  });

  it("positivo 5 — ReadStream>>contents es la colección completa, independiente de position", () => {
    expect(printString(evalSt("| s | s := ReadStream on: #(1 2 3). s next. s contents"))).toBe(
      "#(1 2 3)",
    );
  });
});

describe("L4 · F6 · Stream · WriteStream round-trip (positivos)", () => {
  it("positivo 6 — WriteStream round-trip: nextPut: varios, luego contents (String)", () => {
    expect(
      printString(
        evalSt("| s | s := WriteStream on: ''. s nextPut: $h. s nextPut: $i. s contents"),
      ),
    ).toBe("hi");
  });

  it("positivo 7 — WriteStream round-trip sobre Array: nextPut: varios, luego contents", () => {
    expect(
      printString(evalSt("| s | s := WriteStream on: #(). s nextPut: 1. s nextPut: 2. s contents")),
    ).toBe("#(1 2)");
  });

  it("positivo 8 — WriteStream contents materializa SOLO lo escrito, no el respaldo inicial", () => {
    expect(printString(evalSt("| s | s := WriteStream on: ''. s contents"))).toBe("");
  });

  it("positivo 9 — ReadWriteStream: escribe, resetea posición y lee de vuelta", () => {
    expect(
      printString(evalSt("| s | s := ReadWriteStream on: ''. s nextPut: $x. s reset. s next")),
    ).toBe("$x");
  });
});

describe("L4 · F6 · Stream · jerarquía (metamodelo)", () => {
  it("ReadStream es kindOf PositionableStream y Stream", () => {
    expect(printString(evalSt("(ReadStream on: #()) isKindOf: PositionableStream"))).toBe("true");
    expect(printString(evalSt("(ReadStream on: #()) isKindOf: Stream"))).toBe("true");
  });

  it("WriteStream y ReadStream son clases distintas pero comparten PositionableStream", () => {
    expect(printString(evalSt("(WriteStream on: '') isKindOf: PositionableStream"))).toBe("true");
    expect(printString(evalSt("(WriteStream on: '') class name"))).toBe("WriteStream");
  });
});
