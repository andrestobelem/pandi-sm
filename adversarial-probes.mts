/**
 * Adversarial verifier probes — runs each claimed fix and asserts correct behavior.
 * Run with: npx tsx adversarial-probes.mts (from project root)
 * Uses .mts to force ESM module resolution.
 */
import { eval as evalSource, evalWith } from "./src/eval/index.js";
import { parse } from "./src/parser/parser.js";
import { tokenize } from "./src/lexer/lexer.js";
import { defineMethod } from "./src/eval/method.js";
import { send } from "./src/eval/send.js";
import { basicNew, bootstrapKernel } from "./src/runtime/index.js";
import { installPrimitives } from "./src/eval/primitives.js";
import { loadKernelSources } from "./src/eval/kernel-loader.js";
import { KERNEL_EXCEPTION_SOURCES } from "./src/eval/kernel-exceptions.js";
import { installExceptionPrimitives } from "./src/eval/exceptions.js";

type Result = { label: string; pass: boolean; got: unknown; expected: unknown; error?: string };
const results: Result[] = [];

function probe(label: string, code: string, expected: unknown): void {
  try {
    const got = evalSource(code);
    const pass = got === expected || (typeof expected === "function" && expected(got));
    results.push({ label, pass, got, expected });
  } catch (e) {
    results.push({ label, pass: false, got: String(e), expected, error: String(e) });
  }
}

// Helper to check STSymbol value
function stSymText(v: unknown): string | null {
  if (typeof v === "object" && v !== null && "text" in v) return (v as { text: string }).text;
  return null;
}

// Helper to check STString chars
function stStrChars(v: unknown): string | null {
  if (typeof v === "object" && v !== null && "chars" in v) return (v as { chars: string }).chars;
  return null;
}

// Helper to check STCharacter value
function stCharVal(v: unknown): number | null {
  if (typeof v === "object" && v !== null && "value" in v) return (v as { value: number }).value;
  return null;
}

// ── S1 #1: perform: with STSymbol ─────────────────────────────────────────────
probe(
  "S1-#1: 3 perform: #printString => STString chars='3'",
  "3 perform: #printString",
  (v: unknown) => stStrChars(v) === "3",
);

// ── S1 #2: respondsTo: with STSymbol ──────────────────────────────────────────
probe("S1-#2: 3 respondsTo: #printString => true", "3 respondsTo: #printString", true);

// ── S1 #3: copy isolation ─────────────────────────────────────────────────────
// Use {1. 2. 3} literal (Array new: is not yet in kernel surface)
probe(
  "S1-#3: copy isolates array - original unmodified",
  "| a b | a := {1. 2. 3}. b := a copy. b at: 1 put: 99. a at: 1",
  1,
);

// ── S2 #4: arrayIndex bigint guard ────────────────────────────────────────────
probe(
  "S2-#4: huge bigint array index signals capturable Error",
  "[ | a | a := Array new: 3. a at: 9999999999999999999] on: Error do: [:e | #caught]",
  (v: unknown) => stSymText(v) === "caught",
);

// ── S2 #5: timesRepeat: bigint guard ─────────────────────────────────────────
probe(
  "S2-#5: huge bigint timesRepeat: signals capturable Error",
  "[9999999999999999999 timesRepeat: []] on: Error do: [:e | #caught]",
  (v: unknown) => stSymText(v) === "caught",
);

// ── S2 #7: stringSize codepoints ─────────────────────────────────────────────
// A string with a multi-code-unit character should count codepoints, not code units
probe("S2-#7: multi-codepoint emoji string size = 1", "'\u{1F600}' size", (v: unknown) => v === 1);

// ── S3 #8: ExceptionSet , ────────────────────────────────────────────────────
probe(
  "S3-#8: ExceptionSet comma works - Error caught by Error,Warning set",
  "[Error signal: 'test'] on: Error , Warning do: [:e | #ok]",
  (v: unknown) => stSymText(v) === "ok",
);

// ── S3 #9: on:do:on:do: handler priority — first listed wins ─────────────────
// Error signal raises Error (a subclass of Exception). First handler is Exception, should win.
probe(
  "S3-#9: on:do:on:do: Exception first wins over Error second",
  "[Error signal: 'test'] on: Exception do: [:e | #first] on: Error do: [:e | #second]",
  (v: unknown) => stSymText(v) === "first",
);

// ── S3 #10: messageText boxing ───────────────────────────────────────────────
probe(
  "S3-#10: messageText returns boxed String",
  "[Error signal: 'hello'] on: Error do: [:e | e messageText]",
  (v: unknown) => stStrChars(v) === "hello",
);

// ── S3 #11: description boxing ───────────────────────────────────────────────
probe(
  "S3-#11: description returns boxed String",
  "[Error signal: 'hello'] on: Error do: [:e | e description]",
  (v: unknown) => stStrChars(v) === "hello",
);

// ── Confirmed before: instVarAt: on integer signals capturable Error ──────────
probe(
  "Confirmed: [42 instVarAt: 1] on: Error do:[:e|#c] catches",
  "[42 instVarAt: 1] on: Error do: [:e | #c]",
  (v: unknown) => stSymText(v) === "c",
);

// ── S1 #6 (perform:withArguments: with boxed array) ──────────────────────────
probe(
  "S1/S6: 3 perform:#between:and: withArguments:{1. 5} => true",
  "3 perform: #between:and: withArguments: {1. 5}",
  true,
);

// ── S4 #14: ByteArray bigint range check ─────────────────────────────────────
{
  const { errors: e14 } = parse("#[256]");
  const hasByteRange = e14.some((e) => e.code === "E_BYTE_RANGE");
  results.push({
    label: "S4-#14: #[256] => E_BYTE_RANGE",
    pass: hasByteRange,
    got: e14.map((e) => e.code),
    expected: "E_BYTE_RANGE",
  });
}

// Also test bigint path: a radix literal like 16rFFFF in a byte array
{
  const { errors: e14b } = parse("#[16rFFFF]");
  const hasByteRange = e14b.some((e) => e.code === "E_BYTE_RANGE");
  results.push({
    label: "S4-#14b: #[16rFFFF] => E_BYTE_RANGE (bigint path)",
    pass: hasByteRange,
    got: e14b.map((e) => e.code),
    expected: "E_BYTE_RANGE",
  });
}

// ── S4 #15: phantom AST node ─────────────────────────────────────────────────
{
  const { ast: a15, errors: e15 } = parse("#( := )");
  const hasError = e15.some((e) => e.code === "E_UNEXPECTED_TOKEN");
  // Check that the array literal has no elements (no phantom node)
  // AST: Literal { type:'Literal', lit:'array', elements:[], ... } at top stmt level
  const stmts = a15?.body?.statements;
  const litNode = stmts?.[0];
  const elemCount =
    litNode && typeof litNode === "object" && "elements" in litNode
      ? (litNode as { elements: unknown[] }).elements.length
      : -1;
  const noPhantom = elemCount === 0;
  results.push({
    label: "S4-#15: #(bad) no phantom node",
    pass: hasError && noPhantom,
    got: { errors: e15.map((e) => e.code), elemCount },
    expected: "E_UNEXPECTED_TOKEN + 0 elements",
  });
}

// ── S4 #18: exponent mantissa emission ───────────────────────────────────────
{
  const { tokens: t18, errors: e18 } = tokenize("1.5e+ 3");
  const hasExpError = e18.some((e) => e.code === "E_EXPONENT_MALFORMED");
  const numToken = t18.find((t) => t.type === "number");
  const hasMantissa = numToken !== undefined;
  results.push({
    label: "S4-#18: 1.5e+ emits mantissa + E_EXPONENT_MALFORMED",
    pass: hasExpError && hasMantissa,
    got: { errors: e18.map((e) => e.code), firstNumToken: numToken ? numToken.lexeme : null },
    expected: "E_EXPONENT_MALFORMED + number token",
  });
}

// ── S4 #19: -.5 asymmetry ────────────────────────────────────────────────────
{
  const { tokens: t19 } = tokenize("-.5");
  const isBin = t19[0]?.type === "binarySelector" && (t19[0] as { lexeme: string }).lexeme === "-";
  const isPer = t19[1]?.type === "period";
  const isInt = t19[2]?.type === "number";
  results.push({
    label: "S4-#19: -.5 => binarySelector(-) + period(.) + number",
    pass: isBin && isPer && isInt,
    got: t19.map((t) => `${t.type}:${(t as { lexeme: string }).lexeme}`),
    expected: "binarySelector(-) + period(.) + number(5)",
  });
}

// ── S5 #13: param/temp collision ─────────────────────────────────────────────
probe("S5-#13: block param not overwritten by temp with same name", "[:x | | x | x] value: 42", 42);

// ── S5 #16: identityHash number/bigint consistency ───────────────────────────
probe("S5-#16: identityHash of same number is consistent", "3 identityHash = 3 identityHash", true);

// ── S5 #20: activate arity mismatch signals capturable Error ─────────────────
// Finding #20 = METHOD arity mismatch in activate(). Must test via TypeScript API directly.
// Uses defineMethod + send to install a unary method, then calls it with 1 arg (mismatch).
// This should signal a capturable Smalltalk Error (not a raw JS throw).
// The fix is in method.ts activate() using signalError() instead of plain throw new Error().
{
  let s20Pass = false;
  let s20Got: unknown = "not-run";
  try {
    // Set up a fresh universe with the exception kernel (same as freshUniverse + KERNEL_EXCEPTION_SOURCES)
    const u = bootstrapKernel();
    installPrimitives(u);
    loadKernelSources(u, KERNEL_EXCEPTION_SOURCES);
    installExceptionPrimitives(u);
    // Create a subclass "Greet20" with a unary method "greet"
    const Greet20 = send(u.Object, "subclass:", [u.symbols.intern("Greet20")], u) as Parameters<
      typeof defineMethod
    >[0];
    defineMethod(Greet20, "greet [ ^ 'hello' ]", u);
    const obj = basicNew(Greet20, u);
    // Now call greet with 1 EXTRA arg — activate() expects 0 args, gets 1 → arity error
    // The error should be a capturable Smalltalk Error (signalError), not a raw JS throw
    // We invoke this via evalWith so Smalltalk on:do: can catch it
    // But we need to wrap in on:do: at Smalltalk level — let's do it differently:
    // We call send() directly and check if it throws a JS error whose message contains "aridad"
    // (signalError sends Error signal: which triggers send(error, "signal:", ...) which throws
    //  a JS Error with "sin handler" suffix since there's no on:do: around it)
    try {
      send(obj, "greet", [99 as unknown as import("./src/runtime/index.js").STValue], u);
      s20Got = "no-error (BUG: arity not checked)";
      s20Pass = false;
    } catch (innerErr) {
      const msg = String(innerErr);
      s20Pass = /aridad/i.test(msg);
      s20Got = msg;
    }
  } catch (outerErr) {
    s20Got = `outer-error: ${String(outerErr)}`;
    s20Pass = false;
  }
  results.push({
    label: "S5-#20: method activate arity mismatch signals Error (contains 'aridad')",
    pass: s20Pass,
    got: s20Got,
    expected: "Error message containing 'aridad'",
  });
}
// Confirm block arity is still a host-crash (NOT in finding #20 scope — evalBlock unchanged)
{
  let blockArityIsCapturable = false;
  try {
    const result = evalSource("[[:x :y | x + y] value: 1] on: Error do: [:e | #arityErr]");
    blockArityIsCapturable = stSymText(result) === "arityErr";
  } catch (_e) {
    // host throw: not capturable
  }
  results.push({
    label:
      "INFO-block-arity: block arity host-crash not in #20 scope (expected host throw, not fixed)",
    pass: !blockArityIsCapturable,
    got: blockArityIsCapturable ? "capturable (UNEXPECTED)" : "host-throw (expected)",
    expected: "host-throw (not fixed by S5 #20)",
  });
}

// ── S5 #21: bracket char literal ─────────────────────────────────────────────
probe("S5-#21: $[ char literal is Character with value 91", "$[ value", 91);

probe("S5-#21b: $] char literal is Character with value 93", "$] value", 93);

// ── S5 #22: duplicate subclass signals capturable Error ───────────────────────
probe(
  "S5-#22: duplicate subclass signals capturable Error",
  "[ Object subclass: #MyUniqFoo instanceVariableNames: '' classVariableNames: '' poolDictionaries: '' category: ''. Object subclass: #MyUniqFoo instanceVariableNames: '' classVariableNames: '' poolDictionaries: '' category: '' ] on: Error do: [:e | #dup]",
  (v: unknown) => stSymText(v) === "dup",
);

// ── REGRESSION checks ────────────────────────────────────────────────────────
probe("REGRESSION: respondsTo: returns false for unknown", "3 respondsTo: #fooBarBaz", false);

probe(
  "REGRESSION: instVarAt on true is capturable",
  "[true instVarAt: 1] on: Error do: [:e | #cap]",
  (v: unknown) => stSymText(v) === "cap",
);

probe("REGRESSION: perform:with: works", "3 perform: #+ with: 4", 7);

probe("REGRESSION: perform:with:with: works", "2 perform: #between:and: with: 1 with: 5", true);

probe("REGRESSION: basic arithmetic", "2 + 3", 5);

probe("REGRESSION: block value", "[42] value", 42);

probe("REGRESSION: on:do: basic catch", "[Error signal: 'x'] on: Error do: [:e | 99]", 99);

// ── Print results ─────────────────────────────────────────────────────────────
console.log("\n=== ADVERSARIAL PROBE RESULTS ===\n");
let passed = 0;
let failed = 0;
for (const r of results) {
  const status = r.pass ? "PASS" : "FAIL";
  if (r.pass) passed++;
  else failed++;
  console.log(`[${status}] ${r.label}`);
  if (!r.pass) {
    console.log(`       got:      ${JSON.stringify(r.got)}`);
    console.log(
      `       expected: ${typeof r.expected === "function" ? "(predicate)" : JSON.stringify(r.expected)}`,
    );
    if (r.error) console.log(`       error:    ${r.error}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
