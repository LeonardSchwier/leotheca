import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Product rule (documentation/PROJECT_RULES.md): no camera, no microphone.
// This guard fails when audio or video capture creeps back into the shipped
// sources, the Android manifest or the desktop command set.

const SKIP_DIRS = new Set(["node_modules", "target", "gen", "build"]);

function walk(dir, extensions, found = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, extensions, found);
    else if (extensions.some((ext) => name.endsWith(ext))) found.push(full);
  }
  return found;
}

const CAPTURE_APIS = [
  /getUserMedia/,
  /MediaRecorder/,
  /\b(?:webkit)?SpeechRecognition\b/,
  /\bSpeechRecognizer\b/,
  /\bAudioRecord\b/,
  /whisper/i,
];

describe("no camera, no microphone", () => {
  it("Android manifest requests no audio or camera permission", () => {
    const manifest = readFileSync(
      "android/app/src/main/AndroidManifest.xml",
      "utf8",
    );
    for (const permission of [
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "CAMERA",
    ]) {
      expect(manifest).not.toContain(`android.permission.${permission}`);
    }
  });

  it("no frontend, desktop or Android source touches a capture API", () => {
    const files = [
      ...walk("src", [".ts", ".tsx"]).filter(
        (file) => !/\.test\.tsx?$/.test(file),
      ),
      ...walk("src-tauri/src", [".rs"]),
      ...walk("android/app/src/main", [".java", ".kt"]),
    ];
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return CAPTURE_APIS.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it("the desktop crate does not depend on a speech engine", () => {
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    expect(cargo).not.toMatch(/whisper/i);
  });
});
