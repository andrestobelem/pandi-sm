"---
id: method-body-snippet
kind: positive
phase: parse
layer: L1
spec: anexoA:sequence.method-body
origin: spec-ANSI
section: sequence.method-body
note: realistic snippet with temps, loop, and return
---"
| sum |
sum := 0.
1 to: 10 do: [:i | sum := sum + i].
^sum
