"---
id: literal-integer-bigint
kind: positive
phase: parse
layer: L1
spec: anexoA:literal.integer
origin: spec-ANSI
section: literal.integer
note: bigint > 2^53-1 promotes to bigint; astToJSON serializes as {$bigint:...} (R4/R12)
---"
99999999999999999999999
