"---
id: cascade-in-sequence
kind: positive
phase: parse
layer: L1
spec: anexoA:sequence.cascade
origin: spec-ANSI
section: sequence.cascade
note: cascade message send inside a statement sequence
---"
| s |
s := OrderedCollection new.
s add: 1; add: 2; add: 3
