# Remove two small frictions in hooks and Dependabot

Merged as PR 81, merge commit 306f3f916bafbc80245316915f02b810ffb6a3cc. Regression test fails without the regex change (shown), 5 guard tests pass, 22 required PR checks passed.

Hosted CI pending for the post-merge runs on main: npm_and_yarn in / for @tauri-apps/api, @tauri-apps/plugin-clipboard-manager, @tauri-apps/plugin-deep-link, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs, katex, @tauri-apps/cli, @types/dompurify - Update #1686956652 42414277983,github_actions in / for actions/checkout, actions/setup-python, actions/setup-node, actions/upload-artifact, actions/setup-java, android-actions/setup-android, actions/download-artifact - Update #1686956653 42414277500,github_actions in /. - Update #1686956642 42414275280,cargo in /src-tauri - Update #1686956648 42414275541,npm_and_yarn in /tests/e2e - Update #1686956645 42414275334,npm_and_yarn in /. - Update #1686956643 42414275096,CI 42414270146,Release 42414270171,Rules 42414270066,Secret scan 42414270156.

Reflection: none -> the item was small and the existing guard test file was the right place.
