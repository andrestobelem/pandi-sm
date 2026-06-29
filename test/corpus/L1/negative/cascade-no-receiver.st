"---
id: cascade-no-receiver
kind: negative
phase: parse
layer: L1
spec: anexoA:error.cascade-no-receiver
origin: spec-ANSI
section: error.cascade-no-receiver
note: cascade `;` whose head `3` is not a message send (R9); single error, the orphan `;` is drained in recovery
codes: E_CASCADE_NO_RECEIVER
---"
3 ; foo
