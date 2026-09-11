# Speech-to-Text Dictation: Implementation Plan

**Related Task:** rm-c97aa273b63fa72b (Local speech-to-text dictation)
**Agent:** Mistral-Vibe-20260911T072113Z-db2c08df
**Date:** 2026-09-11
**Status:** Implementation plan (research complete)

## Requirement Recap

From roadmap item:
- Must run **entirely on-device** (NO network calls)
- CONSTITUTION.md: "Offline by design" is absolute, permanent prohibition
- Must work on desktop (Tauri) and Android (Capacitor)
- Dictated text inserts at cursor in active note
- Clear recording indicator
- Obvious way to stop

## Recommended Solution: Whisper.cpp

After evaluating options, **Whisper.cpp** is the best fit:

### Why Whisper.cpp?

| Criteria | Whisper.cpp | Web Speech API | Native Platform APIs |
|----------|-------------|----------------|---------------------|
| Offline | ✅ Yes | ❌ No (cloud) | ⚠️ Partial |
| Cross-platform | ✅ Yes (C++) | ✅ Yes (JS) | ❌ No |
| Bundle size | ~50-200MB (model) | ✅ Tiny | ✅ Tiny |
| Quality | ✅ Good | ✅ Good | ⚠️ Varies |
| Integration | ✅ FFI from Rust/Java | ✅ Direct | ⚠️ Platform-specific |

### Whisper.cpp Details

- **Repository:** https://github.com/ggerganov/whisper.cpp
- **License:** MIT (compatible)
- **Language:** C++ with no dependencies
- **Models:** Can use tiny (~39MB), base (~75MB), small (~244MB), medium (~769MB)
- **Performance:** Real-time on modern hardware with small/medium models
- **WASM:** Can compile to WebAssembly for web use
- **Rust FFI:** Can call from Tauri via C FFI
- **Android:** Can call via JNI from Java/Kotlin

### Offline Guarantee

Whisper.cpp:
- ✅ Runs entirely locally
- ✅ No network calls
- ✅ No telemetry
- ✅ No model downloads (models bundled with app)
- ✅ No phone home

**Fully satisfies CONSTITUTION's offline requirement.**

## Implementation Architecture

### Option A: Bundle Whisper.cpp (Recommended)

#### Desktop (Tauri/Rust)

```
src-tauri/src/
  whisper/
    whisper.cpp (submodule or vendored)
    whisper.h
    ggml/ (vendored)
  commands.rs (add whisper_command)
```

Rust FFI binding:
```rust
// Use cc crate for C++ binding
#[allow(non_snake_case)]
mod whisper {
    extern "C" {
        pub fn whisper_init(path: *const c_char) -> *mut whisper_context;
        pub fn whisper_full(params: *mut whisper_params, ctx: *mut whisper_context) -> i32;
        // ... etc
    }
}
```

Tauri command:
```rust
#[tauri::command]
async fn transcribe_audio(path: String) -> Result<String, String> {
    // Call whisper.cpp via FFI
    // Return transcribed text
}
```

#### Android (Capacitor)

Two approaches:

**Approach 1: JNI Binding**
```
android/app/src/main/jni/
  whisper.cpp (vendored)
  whisper-jni.cpp (JNI glue)
  CMakeLists.txt
```

Java interface:
```java
public class WhisperWrapper {
    public static native String transcribe(String audioPath, String modelPath);
    static { System.loadLibrary("whisper"); }
}
```

Capacitor plugin:
```typescript
@NativePlugin()
export class SpeechRecognitionPlugin {
  @PluginMethod()
  public async transcribe(options: { audioPath: string }): Promise<{ text: string }> {
    return WhisperWrapper.transcribe(options.audioPath);
  }
}
```

**Approach 2: Use existing WhisperKotlin**
- https://github.com/argenon/WhisperKotlin
- Already provides Kotlin API for Whisper
- MIT license
- Can integrate as a Gradle dependency

### Option B: Platform-Specific Native APIs (Partial)

#### Android
```java
// Use android.speech.SpeechRecognizer with EXTRA_PREFER_OFFLINE
Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
```
- ✅ Works offline IF user has downloaded language pack
- ❌ Not guaranteed to work on all devices
- ❌ Language limited to user's installed packs
- ❌ Cannot control model quality

#### Desktop Windows
```rust
use windows::Media::SpeechRecognition::*;
```
- ✅ Works offline IF offline language pack installed
- ❌ Windows only
- ❌ macOS/Linux: No native offline API

**Not recommended:** Inconsistent cross-platform behavior

## Recommended Implementation Phases

### Phase 1: Desktop Only (Tauri + Whisper.cpp)

**Scope:**
- Bundle whisper.cpp with tiny model (~39MB)
- Implement Rust FFI binding
- Add Tauri command for speech recognition
- Add UI: microphone button, recording indicator, stop button
- Insert text at cursor in active editor

**Files to create/modify:**
- `src-tauri/src/whisper.rs` - FFI bindings
- `src-tauri/src/commands.rs` - Add `transcribe_audio` command
- `src-tauri/Cargo.toml` - Add cc dependency
- `src/editor/SpeechRecognitionButton.tsx` - New component
- `src/editor/MarkdownEditor.tsx` - Wire up button
- `src/workspace/tauriBridge.ts` - Add `transcribeAudio` bridge function

**Estimated size impact:** +~40MB (tiny model)

### Phase 2: Android (Capacitor + Whisper.cpp JNI)

**Scope:**
- Add JNI binding for whisper.cpp
- Create Capacitor plugin for speech recognition
- Wire into Android share intent handling

**Files to create/modify:**
- `android/app/src/main/jni/whisper-jni.cpp`
- `android/app/src/main/java/.../WhisperWrapper.java`
- `android/app/src/main/java/.../SpeechRecognitionPlugin.java`
- `src/capture/androidShareBridge.ts` - Wire transcription for share intents

**Estimated size impact:** +~40MB (tiny model, Android)

### Phase 3: Model Selection & Optimization

- Add settings for model size selection (tiny/base/small)
- Implement model download (from trusted source, user-initiated)
- Add model verification (checksums)

## Technical Considerations

### Model Size vs Quality Tradeoff

| Model | Size | RAM | VRAM | Quality | Use Case |
|-------|------|-----|------|---------|----------|
| tiny | 39MB | 200MB | 1GB | ⭐⭐ | Quick notes, simple dictation |
| base | 75MB | 400MB | 1.4GB | ⭐⭐⭐ | General use |
| small | 244MB | 1.5GB | 2GB | ⭐⭐⭐⭐ | High accuracy |
| medium | 769MB | 5GB | 5GB | ⭐⭐⭐⭐⭐ | Professional transcription |

**Recommendation:** Start with tiny model for both platforms. Allow user to optionally download larger models.

### Performance

- **Tiny model on desktop:** ~1-2x real-time on modern CPU
- **Tiny model on mobile:** ~2-3x real-time on modern phone
- **Memory:** Needs ~200MB RAM for tiny model

**Acceptable for dictation use case** (user speaks, brief pause, text appears).

### Audio Capture

**Desktop (Tauri):**
- Use Web Audio API via Tauri webview
- Or native audio capture (more complex)

**Android:**
- Use `MediaRecorder` API
- Or `AudioRecord` for lower-level access

### User Experience

```
[Microphone Button]
  ↓ (click to start)
[Recording Indicator] - Pulsing red dot + "Recording..."
  ↓ (user speaks)
[Transcribing Indicator] - Spinner + "Transcribing..."
  ↓ (text appears)
[Text inserted at cursor]
  ↓ (click to stop)
[Stop recording]
```

### Error Handling

- Microphone permission denied → Show error, guide to settings
- No microphone detected → Show error
- Model not loaded → Show error, offer to download
- Transcription error → Show error, keep recording

## Security & Privacy

### Offline Guarantee

- ✅ Models bundled or downloaded from trusted source (user-initiated)
- ✅ No network calls during transcription
- ✅ No telemetry
- ✅ No audio data leaves device
- ✅ Audio processed in-memory, not written to disk (optional: user can save)

### Model Distribution

**Option 1: Bundle with app**
- ✅ Guaranteed offline
- ✅ No download needed
- ❌ Larger app size

**Option 2: User downloads models**
- ✅ Smaller initial download
- ✅ User chooses model size
- ⚠️ Need checksum verification
- ⚠️ Need trusted source (e.g., GitHub releases)

**Recommendation:** Bundle tiny model; allow optional download of larger models from official Whisper.cpp releases.

## Blockers & Risks

### Blockers

1. **App Size:** Adding ~40-800MB to app bundle
   - **Mitigation:** Start with tiny model, allow user to opt-in to larger models

2. **Memory Requirements:** Whisper needs significant RAM
   - **Mitigation:** Check available memory before starting; warn user if insufficient

3. **Performance on Low-End Devices:** May be slow on older phones
   - **Mitigation:** Use tiny model; show estimated transcription time

4. **Microphone Access:** Requires user permission
   - **Mitigation:** Standard platform permission flow

### Risks

1. **Model Accuracy:** Tiny model may have errors
   - **Mitigation:** Clear communication about quality tradeoffs; allow user to edit

2. **Language Support:** Whisper supports many languages but quality varies
   - **Mitigation:** Document supported languages; allow language selection

3. **Platform Compatibility:** JNI/FFI can be tricky
   - **Mitigation:** Test on multiple devices; provide fallback to typing

## Implementation Checklist

### Phase 1 (Desktop)

- [ ] Vendor whisper.cpp into src-tauri
- [ ] Add Rust FFI bindings
- [ ] Add Tauri command for transcription
- [ ] Add bridge function to TypeScript
- [ ] Create SpeechRecognitionButton component
- [ ] Wire into MarkdownEditor
- [ ] Add recording/transcribing UI states
- [ ] Handle microphone permission
- [ ] Handle errors gracefully
- [ ] Add tests
- [ ] Document model size/quality options

### Phase 2 (Android)

- [ ] Set up JNI for whisper.cpp
- [ ] Create WhisperWrapper Java class
- [ ] Create Capacitor plugin
- [ ] Add bridge function to TypeScript
- [ ] Wire into Android share intent
- [ ] Add recording/transcribing UI
- [ ] Handle microphone permission
- [ ] Handle errors gracefully
- [ ] Add tests

### Phase 3 (Model Management)

- [ ] Add model download functionality
- [ ] Add checksum verification
- [ ] Add model selection UI
- [ ] Add model size display
- [ ] Implement model updates

## Alternative: Platform-Specific with Fallback

If bundling Whisper.cpp is too large:

1. **Desktop:** Use Web Audio API + Whisper WASM
   - Smaller size (~10-20MB WASM)
   - Slightly slower

2. **Android:** Use WhisperKotlin (JitPack dependency)
   - Already provides Kotlin API
   - Handles model downloads

3. **Fallback:** If no offline option available, show "Speech-to-text requires offline model" message

## Decision

**Recommended path:**
1. Start with **Phase 1 (Desktop + Whisper.cpp + tiny model)**
2. Verify offline behavior and performance
3. Proceed to **Phase 2 (Android)**
4. Add **Phase 3 (Model management)** as optional enhancement

**Estimated effort:**
- Phase 1: 2-3 days
- Phase 2: 2-3 days
- Phase 3: 1-2 days

**Binary size impact:** +~40MB (tiny model on both platforms)

## Next Action

To implement Phase 1:
1. Clone whisper.cpp into src-tauri
2. Set up CMake or direct compilation
3. Create Rust FFI bindings
4. Build and test on desktop

This provides a fully offline, cross-platform (eventually) speech-to-text solution that satisfies all CONSTITUTION requirements.
