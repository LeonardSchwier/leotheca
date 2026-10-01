# Leotheca — Packaging Status

**Stand: 1. Oktober 2026**

## Status Übersicht

| Paket | Status | Verzeichnis | Externer Request |
|-------|--------|-------------|-------------------|
| **Flatpak** | ✅ Manifest + Desktop + Metainfo + Cargo/Node Sources | `flatpak/` | ❌ Noch kein Flathub PR |
| **Homebrew** | ✅ Cask Draft (TODOs für SHA256 + Release) | `packaging/homebrew/` | ❌ Noch kein PR |
| **Snap** | ✅ Draft Manifest | `snap/` | ❌ Noch kein Snap Store |
| **F-Droid** | ✅ Metadata + Build Script | `packaging/f-droid/` | ❌ Noch kein F-Droid PR |
| **CI** | ✅ Flathub + F-Droid + Release + Packaging Verify | `.github/workflows/` | — |

## Was fehlt vor externem Request

1. **Echter Release-Tag** — `v0.1.0` oder höher (aktuell `VERSION` = `0.1.0`, kein Tag)
2. **SHA256 Checksums** — nach Release aus den Artefakten
3. **Code Signing** (optional, für macOS Homebrew)
4. **Snap: Pre-built Binary** — CI-Build statt Snapcraft-Build

## Nächste Schritte (wenn du bereit bist)

1. Release-Tag `v0.1.0` schneiden
2. SHA256 in alle Manifests eintragen
3. Flathub PR an `flathub/com.leonardschwier.leotheca`
4. Homebrew Tap `leonardschwier/homebrew-leotheca` anlegen
5. Snap Store Registrierung + Push
6. F-Droid PR an `f-droid/f-droid-data`

## Regeln

- **NUR lokale Vorbereitung** bis explizit freigegeben
- **Keine externen Requests** ohne explizites Go
- Alle Manifests müssen vor Push lokal validiert werden (CI-Workflow vorhanden)