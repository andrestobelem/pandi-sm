/**
 * Follow-up del audit loop-until-dry · M7 (major): un CRLF dentro de un string o
 * símbolo entre comillas perdía el LF. advance() colapsa el CRLF a un solo salto
 * de posición (correcto) pero scanStringContent sólo agregaba el CR, truncando el
 * contenido (`'a\r\nb'` valía `'a\rb'`, longitud 3 en vez de 4). RED → GREEN.
 *
 * @section L1.followup-lexer-crlf
 * @kind    regression
 * @layer   L1
 */
import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/lexer/index.js";

const firstValue = (src: string): unknown => tokenize(src).tokens[0]?.value;

describe("followup · M7 · CRLF dentro de un literal conserva ambos code points", () => {
  it("un string literal con CRLF mantiene CR y LF", () => {
    expect(firstValue("'a\r\nb'")).toBe("a\r\nb");
  });

  it("un símbolo entre comillas con CRLF mantiene CR y LF", () => {
    expect(firstValue("#'a\r\nb'")).toBe("a\r\nb");
  });

  it("un LF solitario (sin CR) sigue intacto", () => {
    expect(firstValue("'a\nb'")).toBe("a\nb");
  });

  it("un CR solitario (sin LF) sigue intacto", () => {
    expect(firstValue("'a\rb'")).toBe("a\rb");
  });
});
