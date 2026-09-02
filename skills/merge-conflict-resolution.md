# Skill: resolving conflicts against a moving `main`

`ROADMAP.md` and `CHANGELOG.md` are edited by nearly every claim and every
landing, from potentially several parallel sessions. A conflict there is
routine, not a sign something went wrong, and it has one safe resolution
rule.

## The rule: never discard another entry

When `git merge origin/main` (or `git fetch && git merge origin/main`)
produces a conflict in `ROADMAP.md` or `CHANGELOG.md`, both sides almost
always added a *different, unrelated bullet* to the same list. The
correct resolution is to keep both sides' distinct entries, never to pick
one side and drop the other. Concretely:

1. Open the conflicted file and find the `<<<<<<<` / `=======` / `>>>>>>>` markers.
2. Read both sides. If they are genuinely two different bullets (the overwhelmingly common case), remove the conflict markers and keep both bullets, choosing whatever relative order reads sensibly (newest-first is this file's convention for `## Implemented` and for `CHANGELOG.md`'s `## Unreleased`).
3. If one side's entry references or supersedes the other (e.g. your own entry's text says "see the follow-up entry below" and the other side just added that exact follow-up entry with different wording), reconcile the cross-reference so it still reads correctly after both land, rather than leaving a stale pointer.
4. If the same bullet was edited in a genuinely incompatible way by both sides (rare: this usually only happens if two sessions worked the same roadmap item, which the claim protocol is supposed to prevent), stop and treat it as a real integration decision, not a mechanical merge: read both diffs in full and produce one entry that honestly reflects everything both sides actually verified, rather than silently picking one.
5. For a merge conflict spanning many bullets or very long entries, a short script is more reliable than manual `Edit` calls that might not match exact text: read the file's conflict markers with a small Python script that walks the file linearly, extracts the `HEAD` and incoming lists between markers, and re-emits both in order. Manually re-typing a multi-thousand-character bullet risks introducing a typo the automated verification suite won't catch.

## After resolving

1. Check the resolved file for leftover conflict markers: `grep -n "^<<<<<<<\|^=======\|^>>>>>>>" ROADMAP.md CHANGELOG.md` should print nothing.
2. Re-run the full verification suite (`skills/verification-suite.md`) on the merged result, not just on your own branch's pre-merge state. A clean merge of two individually-correct diffs can still produce a broken whole (duplicate test names, a stale cross-reference, a roadmap entry now describing a file that no longer exists in that shape).
3. Check for stray null bytes in every file touched by the merge, same as any other commit.
4. Commit the merge (`git commit --no-edit` is fine for a mechanical resolution; write a real message if you made a judgment call in step 4 above) and push.

## Source files, not just docs

An implementation file (not `ROADMAP.md`/`CHANGELOG.md`) can conflict too,
usually when two claims' touch sets turned out to overlap more than
expected. The same "keep both sides' real work" principle applies, but
here you cannot just concatenate: read both hunks, understand what each
was trying to accomplish, and write the merged version by hand so both
pieces of behavior survive. Never resolve a source conflict by blindly
taking "ours" or "theirs" for a whole file. Regenerate any generated file
(a lockfile, a build artifact) with its own tooling after resolving,
rather than hand-editing the generated output.
