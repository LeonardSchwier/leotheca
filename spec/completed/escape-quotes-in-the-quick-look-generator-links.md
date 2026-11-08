# Escape quotes in the Quick Look generator links

## Item

rm-e7c4baad3a8d6f10, "Escape quotes in the Quick Look generator links". Outcome: a double quote in a Markdown link target or label can no longer end the `href` attribute in the macOS Quick Look generator's HTML.

## Acceptance

- `[x](https://a.test/" onmouseover="alert(1))` yields an `href` with `&quot;` and no raw `" onmouseover="` sequence.
- A quote in a link label is written as `&quot;`.
- The Objective-C generator carries the same escaping step as the reference converter in `scripts/test_ql_converter.py`.

## Context

`packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m` `markdownToHTML:` escapes `&`, `<` and `>` and then builds `<a href="$2">$1</a>` by regex, so `"` in `$2` ended the attribute (Finding L2, second Tier 2 audit). `scripts/test_ql_converter.py` is a Python reference of the same rules, run by `agent-policy.yml` (`unittest discover`). The generator is source only: no workflow builds, signs or ships it, and no macOS machine was available, so the Objective-C edit is UNBUILT and untested; only the Python mirror is exercised.

## Plan

1. Tests `test_quote_in_href_cannot_break_out_of_attribute` and `test_quote_in_link_label_is_escaped` first (seen failing).
2. Add the `"` to `&quot;` step in the reference converter and in the generator.
3. `master-spec.md` change-log and `CHANGELOG.md` entry.

## Out of scope

Link scheme filtering (a `javascript:` target); building the generator.

## Rulings

- Escape only `"`, not `'`: the attribute is double-quoted, and the existing test keeps single quotes verbatim in code. Cost if wrong: a single-quoted attribute would need it, none exists.
- Escape globally in the first pass, not inside the link regex: one rule, and quotes in text and code render identically as entities. Cost if wrong: none visible.

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

| Claim                 | Evidence                                                       | Result      |
| --------------------- | -------------------------------------------------------------- | ----------- |
| both tests fail first | `python3 -m unittest scripts.test_ql_converter` before the fix | 2 failures  |
| both pass after       | same command after the fix                                     | 40 tests OK |
| Objective-C generator | not built                                                      | UNVERIFIED  |

Reflection: a Python mirror is the only executable check of an unbuilt Objective-C file, so the two can drift -> none: the roadmap already treats the generator as dormant, and the spec states the gap.
