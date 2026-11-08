# Remove the snap network plug and pin the nvm installer

## Item

rm-e70ed13419a2d0e4, "Remove the snap network plug and pin the nvm installer". Outcome: `snap/snapcraft.yaml` grants no network plug and installs Node.js from a hash-verified archive instead of piping an unhashed script into bash.

## Acceptance

- No `network` plug in the app.
- No `| bash` or `| sh` in the file.
- Node.js comes from `nodejs.org` release v22.23.2 with a SHA-256 check per architecture (amd64, arm64); other architectures stop the build.
- `scripts/test_snapcraft.py` enforces the three points and the YAML still parses.

## Context

The app has no HTTP client crate in `src-tauri/Cargo.toml` and the Flatpak manifest shares no network, so the plug is unneeded at runtime (Finding L3). Build-time network is the build host's, not a plug. The archive and hashes are those of `packaging/f-droid/com.leonardschwier.leotheca.yml` (x64), plus the arm64 hash read from the release's `SHASUMS256.txt`. The Node 20 in the old script is replaced by 22, the version the repository already pins elsewhere.

## Plan

1. `scripts/test_snapcraft.py` first (3 failures on the old file).
2. Edit `snap/snapcraft.yaml`.
3. `master-spec.md` change-log and `CHANGELOG.md` entry.

## Out of scope

Building the snap (no snapcraft here; the file is a draft and no CI job builds it); the Rust toolchain install, which still uses rustup unverified (noted as a follow-up).

## Rulings

- Drop the plug rather than keep it: nothing reads the network at runtime. Cost if wrong: one line to restore.
- Archive over a pinned installer hash: the f-droid recipe already does this, and it avoids a second moving piece (nvm downloads Node itself without a hash).

## Glossary

Glossary: none

## Design system

No UI surface.

## Evidence

| Claim            | Evidence                                                     | Result                        |
| ---------------- | ------------------------------------------------------------ | ----------------------------- |
| tests fail first | `python3 -m unittest scripts.test_snapcraft` on the old file | 3 failures                    |
| pass after       | same command                                                 | 3 OK; `yaml.safe_load` parses |
| snap build       | not run, no snapcraft                                        | UNVERIFIED                    |

Reflection: the Rust toolchain in the same snap build is still fetched without verification -> none: the snap is an unbuilt draft and the gap is stated under Out of scope.
