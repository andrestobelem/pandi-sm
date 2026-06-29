"---
id: unexpected-token-assign
kind: negative
phase: parse
layer: L1
spec: anexoA:error.unexpected-token
origin: spec-ANSI
section: error.unexpected-token
note: `:=` IS the valid assignment operator (a := b es positivo); aquí el TARGET `3` es un literal no asignable (CORR-2/DEV-010)
codes: E_UNEXPECTED_TOKEN
---"
3 := 4
