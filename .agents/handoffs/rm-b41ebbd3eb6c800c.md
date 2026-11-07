# Format the whole tree once

PR 79 merge commit aebfbee018ce0d1885202f044a39cedf80d0aea0 formatted 311 files; PR 80 merge commit 2e734506b709a741ff9c7a6c351793dbcdf1cb2a added .git-blame-ignore-revs and the CONTRIBUTING note. Local gate: tsc, eslint, 3326 vitest, build, 124 policy tests, master-spec and roadmap checks; prettier --check . reports a clean tree. 23 required PR checks passed on PR 79.

Hosted CI pending for the post-merge runs. PR 79 merge: Agent policy 42412483050,Rules 42412483052,Secret scan 42412483162,CI 42412483124,Release 42412483234. PR 80 merge: CI 42413353339,Release 42413353409,Rules 42413353337,Secret scan 42413353414.

Learning: the first PR 79 run failed master-spec because every .ts, .tsx and workflow-adjacent file counts as an application path, so a formatting pass needs a master-spec change-log entry. The blame-ignore file needs the squash SHA, so it must be a second PR.

Reflection: a formatting pass changes the added-lines for the em dash rule (13 legacy lines) -> none: fixed the lines; the rule is right.
