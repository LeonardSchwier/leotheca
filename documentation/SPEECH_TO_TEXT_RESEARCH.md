# Speech-to-Text Dictation Research

**Task:** rm-c97aa273b63fa72b  
**Agent:** Mistral-Vibe-20260911T072113Z-db2c08df  
**Date:** 2026-09-11

## Requirements

Per roadmap entry:
- Must run entirely on-device (NO network calls)
- Must work on desktop (Tauri) and Android (Capacitor)
- Dictated text should insert at cursor in active note
- Clear recording indicator
- Obvious way to stop
- Needs research into available on-device speech recognition

## Platform Analysis

### Desktop (Tauri / Webview)

#### Option 1: Web Speech API
- **API:** `webkitSpeechRecognition` or `SpeechRecognition`
- **Status:** Available in Chrome/Edge browsers
- **Offline capability:** ❌ NO - Uses Google cloud by default
- **Verdict:** NOT ACCEPTABLE - violates offline requirement

#### Option 2: Tauri Native API + Platform SDKs
- **Windows:** `Windows.Media.SpeechRecognition`
  - Supports on-device recognition
  - Requires Windows 10+ 
  - Offline language packs must be installed
  - API: Native Windows Runtime
- **macOS:** Limited options
  - `AVSpeechSynthesizer` is for TEXT-TO-SPEECH only
  - `NSSpeechRecognizer` is deprecated
  - No built-in offline speech-to-text in macOS
  - Third-party: Would need to bundle model
- **Linux:** No standard offline API

**Verdict:** Desktop would require platform-specific native code via Tauri commands, with Windows being feasible but macOS/Linux problematic.

#### Option 3: Bundle On-Device Model
- **Whisper.cpp:** Open-source, can run on-device
- **Size:** ~100-300MB for models
- **Quality:** Good for English, varies for other languages
- **Performance:** Requires significant CPU/GPU
- **License:** MIT (acceptable)

**Verdict:** Feasible but adds significant binary size. Would need to bundle different model sizes for different platforms.

### Android (Capacitor)

#### Option 1: Android SpeechRecognizer API
- **API:** `android.speech.SpeechRecognizer`
- **Offline capability:** ✅ YES - with `RECOGNIZER_INTENT_ACTION_RECOGNIZE_SPEECH` and `EXTRA_PREFER_OFFLINE`
- **Requirements:** 
  - Device must have offline speech data downloaded
  - Android 6.0+ (API 23+)
  - User must have installed offline language pack
- **Limitations:**
  - Accuracy varies by device/manufacturer
  - Language support limited to what user has installed
  - Some OEMs may not support offline recognition

**Verdict:** FEASIBLE - but requires device support verification

#### Option 2: Capacitor Plugin
- **Existing plugins:** 
  - `@capacitor-community/speech-recognition` - uses Android SpeechRecognizer
  - No verified offline capability in existing plugins
- **Action needed:** Create or modify plugin to force offline mode

**Verdict:** Would need custom plugin development

#### Option 3: Bundle On-Device Model
- Same as desktop (Whisper.cpp via JNI)
- Or TensorFlow Lite Speech-to-Text

**Verdict:** Feasible but complex

## Recommended Approach

### Phase 1: Platform-Specific Native Implementation

#### Android
Use `android.speech.SpeechRecognizer` with offline mode:
```java
Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());
```

**Pros:**
- Uses built-in Android API
- No additional binary size
- Works if user has offline data

**Cons:**
- Not all devices support offline
- Accuracy varies
- Language dependent on user's installed packs

#### Desktop Windows
Use Windows Runtime API via Tauri command:
```rust
use windows::Media::SpeechRecognition::*;
```

**Pros:**
- Native on-device capability
- Good accuracy

**Cons:**
- Windows only
- macOS/Linux would need different approaches

### Phase 2: Cross-Platform Bundle (Future)
Bundle Whisper.cpp or similar with:
- Small model for mobile
- Medium model for desktop
- Language pack selection

## Decision

Given the "offline by design" absolute requirement, the only viable near-term approach is:

1. **Android:** Use `SpeechRecognizer` with offline preference
2. **Desktop:** Bundle Whisper.cpp with a small on-device model

However, bundling Whisper.cpp adds ~100-300MB to the binary, which may be unacceptable for mobile.

**Alternative recommendation:** Start with Android only (using SpeechRecognizer offline mode), document desktop as requiring Whisper.cpp integration, and mark desktop speech-to-text as a separate future phase.

## Implementation Complexity

| Platform | Complexity | Offline Feasible | Notes |
|----------|------------|------------------|-------|
| Android | Medium | ✅ Yes | Use SpeechRecognizer with EXTRA_PREFER_OFFLINE |
| Windows | Medium | ✅ Yes | Windows.Media.SpeechRecognition |
| macOS | High | ❌ No | No native offline API |
| Linux | High | ❌ No | No standard API |
| Web | Low | ❌ No | Web Speech API uses cloud |

## Blockers

1. **No native offline API on macOS/Linux** - Would require bundled model
2. **Device dependency** - Android offline recognition requires user to have downloaded language packs
3. **Model size** - Bundled models add significant binary size
4. **Testing** - Requires real devices to verify offline behavior

## Conclusion

**Cannot fully implement in this environment** due to:
- No real Android device for testing SpeechRecognizer offline mode
- No macOS signing for native APIs
- No way to verify actual offline behavior

**Recommended next steps:**
1. Create UI skeleton (button, recording indicator)
2. Implement Android SpeechRecognizer integration with offline flag
3. Document desktop requirements for future implementation
4. Create platform-specific feature flags

**Estimated effort:** 3-5 days for full cross-platform implementation with testing
