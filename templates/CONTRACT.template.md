# CONTRACT — round <X> (<date>): <one-line goal>

Evidence: <result files and case folders this round answers to>. Base: <branch @ sha>.
Binding with: <earlier contracts>. Non-negotiables: <the rules no slice may trade away, e.g. never invent a value, every write
reversible and logged, units at the boundary, no secrets>.

## Rulings R<n>-R<m>
- R<n> <Name>: <what must be true afterwards, precisely>. <What is refused, by name>. Test: <the test that must fail on the base>.
- R<n+1> ...

## Correction (<date>) — appended, never rewritten
- <which earlier expectation was wrong, what replaces it, why>.

## Shared wire (every side implements exactly this)
- Field / code / grammar names, types and where the ONE shared fixture lives (e.g. `fixtures/<name>.json`), and which slice
  pushes it first.

## Slices (disjoint owned paths)
- <SLICE-A> (<builder agent>; reviewer <reviewer agent>): owns <paths>. Rulings <list>.
- <SLICE-B> ...
- Integrator: wires <shared registration files>; runs <suites>; the regression gate; an offline projection of <metric>.

## Acceptance
- Offline: <numbers the integrator must show>.
- Real environment: <cases, pass bars, evidence (screenshots, read-backs)>.
