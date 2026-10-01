# Snap packaging

Status: **Draft** — snapcraft.yaml is a technical starting point. Snap builds
require a full Rust + Node.js toolchain in the snap build environment, which
is heavy. Recommended approach: build the Tauri app on a CI runner (Linux
x86_64/ARM64) and package the pre-built binary into the snap.

## What's needed before this is submittable

1. **CI build job** for Linux x86_64 + ARM64 producing a release binary
2. **Desktop file** (`leotheca.desktop`) — reuse from `flatpak/` directory
3. **Icon** in `assets/icons/` — already present
4. **Snap Store account** + app registration (external step)
5. **`snapcraft.yaml`** in this directory with the pre-built binary URL + SHA256

## Build approach (recommended)

```sh
# On CI:
cargo build --release --target x86_64-unknown-linux-gnu
# Package into snap:
snapcraft
# Push to Snap Store:
snapcraft publish
```

## Files

- `snapcraft.yaml` — manifest (draft, needs pre-built binary URL)
- `leotheca.desktop` — symlink to `flatpak/com.leonardschwier.leotheca.desktop`