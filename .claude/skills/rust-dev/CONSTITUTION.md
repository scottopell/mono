# Constitution

These are the development values that drive all guidance in this skill.
They are language-general in principle, Rust-specific in application.

## 1. Data shapes first

Begin with the types. Struct definitions and type signatures ARE the design
document. Let the data shape guide the implementation, not the other way
around. If you don't know what the structs look like, you don't understand
the problem yet.

## 2. Push invariants into the type system

Every invariant that CAN be a type constraint SHOULD be. Newtypes over
primitives. Enums over stringly-typed flags. Non-optional fields where None
is impossible. If the compiler rejects invalid states, you don't need tests
for them and you won't ship them by accident.

The ideal test suite is small because the types did the hard work.

## 3. Tests are the spec

Property tests define what the system does. The implementation is just one
way to satisfy them. A property like "for any valid input,
`filter(data, prefix)` returns exactly the same entries as
`scan_all(data).filter(starts_with(prefix))`" is a stronger spec than any
design document.

Prefer properties over examples. A single `proptest!` with generated inputs
is stronger and more maintainable than five hand-picked test cases. Reach
for example-based tests only when the expected output is a specific known
value, or when the setup is too complex for generation.

## 4. Structured data generation

Random bytes miss real bugs. Structure the generators to mirror the domain:

- **For parsers:** generate data that resembles production (prefix groups,
  realistic distributions, domain-specific formats)
- **For data structures:** hit the structural corners (boundary sizes,
  shared prefixes, bimodal distributions, multi-block spanning)
- **For onboarding:** the generator documents the data model better than
  comments. `arb_sstable_test_case()` teaches a reader what SSTables look
  like.

Weight these concerns by what you're building. All three matter; emphasis
shifts.

## 5. Correctness enables performance

Property tests are the safety net for aggressive optimization. Without
them, you're afraid to change things. With them, you can restructure
ownership, swap algorithms, and rewrite hot paths knowing the properties
will catch regressions.

The workflow is: prove correctness with properties, then optimize with
confidence, then re-run properties to verify. Correctness is not a phase
you finish -- it's infrastructure you maintain.

## 6. Measure, don't guess

"This is probably the bottleneck" is not analysis. Profile first.
Benchmark after. A hypothesis without measurement is speculation dressed
up as engineering. This applies to both performance work AND correctness
claims -- if you can't demonstrate it, you don't know it.

## 7. Rejected hypotheses have value

When an optimization doesn't work: revert the code, keep the benchmark.
Measurement infrastructure is reusable. The record of what you tried and
why it failed is more valuable than the reverted code. Failed experiments
inform the next hypothesis.

## 8. Ship value

Done means: it solves the problem, the properties hold, and it doesn't
regress. Don't test what the type system prevents. Don't optimize cold
paths. Don't write tests that don't justify their maintenance cost.
Perfection is the enemy of shipping.

## 9. Fix causes, not symptoms

Adding a cache doesn't fix an O(n^2) algorithm. Wrapping an error doesn't
prevent the condition that produced it. Clone-to-satisfy-the-borrow-checker
doesn't fix an ownership design problem. Go deeper. The root cause is
harder to fix and more valuable to find.

## 10. Minimize round-trips

When presenting work: show the analysis, the recommendation, and the
fallback in one shot. Batch decisions. Don't ask one question at a time.
The reader will course-correct if needed. Confidence with transparency
beats tentative incrementalism.
