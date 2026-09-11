# Manual Verification Guide - 2026-09-11

**Date:** 2026-09-11  
**Session:** 20260911T120000Z-cdba27dc  
**Device:** 54161FDAP0022K (Physical Android Device)  
**Status:** Ready for manual verification

## Overview

This document provides step-by-step manual verification procedures for features that require physical device testing. The following implementations are code-complete and installed on device 54161FDAP0022K:

1. **F20 Phase 2b-iv**: Android safe-display-name for workspace picker
2. **Speech-to-Text**: Offline speech recognition

## Prerequisites

### Device Setup
- ✅ Device 54161FDAP0022K connected via USB
- ✅ USB debugging enabled (`adb devices` shows device)
- ✅ Latest APK installed (commit d77f95e + whisper.cpp integration)
- ✅ App launches without crashes (confirmed via `adb logcat`)

### Build Verification
```bash
# Confirm latest build
cd /home/leonard/Documents/GitHub/leotheca
adb shell pm list packages | grep leotheca
# Should show: package:com.leonardschwier.leotheca

# Check app version
adb shell dumpsys package com.leonardschwier.leotheca | grep versionName
# Should show: versionName=0.1.0
```

---

## Feature 1: F20 Phase 2b-iv Android Safe-Display-Name

### Implementation Summary
- **Java**: `FolderAccessPlugin.pickFolderResult` now calls `DocumentFile.fromTreeUri(...).getName()`
- **Bridge**: `capacitorBridgeImpl.ts` threads `name` field through: `name: result.name ?? undefined`
- **Store**: `addWorkspaceFromPicker` passes `folder.name` as `suggestedName` to `defaultProfileName`
- **Profiles**: `defaultProfileName` prefers `suggestedName` if provided and valid

### Verification Steps

#### Test Case 1: Workspace Picker with Real Folder Name
1. **Launch the app** on device 54161FDAP0022K
2. **Navigate to Settings** → **Workspace Management** → **Add Workspace**
3. **Tap "Select Folder"** to open Android folder picker
4. **Choose a folder with a descriptive name** (e.g., "MyNotes", "Documents/LeoTheca", "Notes/Test")
5. **Verify the workspace name** in the app matches the actual folder name
   - ✅ Expected: Workspace name = "MyNotes" (or whatever folder was selected)
   - ❌ Old behavior: Workspace name = "Workspace" (fallback default)

#### Test Case 2: Fallback to "Workspace" When No Name Available
1. **Launch the app** on device 54161FDAP0022K
2. **Navigate to Settings** → **Workspace Management** → **Add Workspace**
3. **Tap "Select Folder"** to open Android folder picker
4. **Choose a storage provider root** that doesn't expose a name (e.g., some external SD card roots)
5. **Verify the workspace name** falls back to "Workspace"
   - ✅ Expected: Workspace name = "Workspace" (fallback)
   - ❌ Behavior: App crashes or shows empty name

#### Test Case 3: Multiple Workspaces with Different Names
1. **Create 3 workspaces** using folders with distinct names:
   - Folder: "PersonalNotes" → Expected workspace name: "PersonalNotes"
   - Folder: "WorkDocuments" → Expected workspace name: "WorkDocuments"  
   - Folder: "Archive" → Expected workspace name: "Archive"
2. **Verify all workspace names** appear correctly in workspace switcher
3. **Switch between workspaces** and confirm names remain stable

### Debugging Commands

If verification fails, use these commands to gather diagnostic information:

```bash
# Check if FolderAccessPlugin is registered
adb logcat -d | grep -i "FolderAccess\|Capacitor" | tail -20

# Check for any Java errors
adb logcat -d | grep -i "Error\|Exception" | grep leotheca | tail -20

# Check plugin initialization
adb logcat -d | grep -i "pickFolder\|DocumentFile" | tail -20
```

### Expected Log Output
```
# Successful folder pick with name
I/Capacitor/Plugin/FolderAccessPlugin: pickFolderResult: name=MyNotes, uri=content://...

# Fallback to NULL when no name
I/Capacitor/Plugin/FolderAccessPlugin: pickFolderResult: name=null, uri=content://...
```

---

## Feature 2: Speech-to-Text Recognition

### Implementation Summary
- **Android**: `SpeechRecognitionPlugin.java` uses `android.speech.SpeechRecognizer` with `EXTRA_PREFER_OFFLINE`
- **Desktop**: `speech_commands.rs` provides Tauri commands with whisper.cpp FFI (stub implementation)
- **UI**: `SpeechRecognitionButton.tsx` with microphone button, state indicators
- **Bridge**: Unified platform abstraction via `speechBridgeImpl.ts`
- **Text Insertion**: Text inserts at cursor via `outlineInsertRequest` mechanism

### Verification Steps

#### Test Case 1: Microphone Permission Handling
1. **Launch the app** on device 54161FDAP0022K
2. **Open any note** for editing
3. **Tap the microphone button** in the toolbar
4. **Verify microphone permission dialog appears**
   - ✅ Expected: Android permission dialog with "Allow microphone access?"
   - ❌ Behavior: No dialog appears or app crashes
5. **Grant permission** and verify the app responds appropriately

#### Test Case 2: Speech Recognition Start/Stop
1. **Launch the app** on device 54161FDAP0022K  
2. **Open a note** for editing
3. **Tap the microphone button**
4. **Verify the button state changes** to indicate recording:
   - ✅ Expected: Button shows "Recording..." state with red indicator
   - ❌ Behavior: Button state doesn't change
5. **Speak a test phrase** (e.g., "Hello LeoTheca")
6. **Tap the microphone button again** to stop
7. **Verify the button state changes** back to idle
   - ✅ Expected: Button returns to normal microphone icon

#### Test Case 3: Text Insertion
1. **Launch the app** on device 54161FDAP0022K
2. **Open a note** for editing
3. **Place cursor at a specific position** in the note
4. **Tap microphone button**, speak a phrase (e.g., "Test speech to text")
5. **Stop recognition**
6. **Verify the transcribed text** appears at the cursor position
   - ✅ Expected: "Test speech to text" inserted at cursor
   - ❌ Behavior: Text not inserted or inserted at wrong position

#### Test Case 4: Error Handling
1. **Deny microphone permission** when prompted
2. **Verify error message** appears to user
   - ✅ Expected: Toast/notification with "Microphone access denied"
   - ❌ Behavior: No feedback to user
3. **Try starting recognition again** after denying
4. **Verify permission is requested again** (Android behavior)

#### Test Case 5: Read-Only Mode
1. **Launch the app** on device 54161FDAP0022K
2. **Open a note in read-only/preview mode**
3. **Tap the microphone button**
4. **Verify behavior**:
   - ✅ Expected: Microphone button disabled or shows "Read-only mode" message
   - ❌ Behavior: Microphone starts in read-only mode

### Debugging Commands

```bash
# Check if SpeechRecognitionPlugin is registered
adb logcat -d | grep -i "SpeechRecognition\|SpeechRecognizer" | tail -20

# Check for recognition errors
adb logcat -d | grep -i "ERROR\|Exception" | grep -i speech | tail -20

# Check permission status
adb shell dumpsys package com.leonardschwier.leotheca | grep -A 5 "permission/android.permission.RECORD_AUDIO"

# Check if microphone is being accessed
adb logcat -d | grep -i "AudioRecord\|MediaRecorder" | tail -20
```

### Expected Log Output
```
# Plugin registered
I/Capacitor/Plugin/SpeechRecognitionPlugin: Initialized with offline preference

# Recognition started
I/SpeechRecognizer: Starting recognition with language: en, offline: true

# Recognition results
I/SpeechRecognizer: Partial result: "Hello"
I/SpeechRecognizer: Final result: "Hello LeoTheca"

# Permission denied
E/SpeechRecognizer: Permission denied for microphone access
```

---

## Verification Checklist

### F20 Phase 2b-iv: Android Safe-Display-Name
- [ ] Workspace picker returns real folder name
- [ ] Workspace picker falls back to "Workspace" when no name available
- [ ] Multiple workspaces show correct names
- [ ] Names persist after app restart

### Speech-to-Text
- [ ] Microphone permission dialog appears
- [ ] Recording state changes are visible
- [ ] Text inserts at cursor position
- [ ] Error handling works correctly
- [ ] Read-only mode prevents recording
- [ ] Offline recognition works (no network calls)

---

## Success Criteria

### F20 Phase 2b-iv
✅ **Complete** when:
- All workspace picker tests pass
- Folder names are correctly displayed in workspace management
- Fallback to "Workspace" works when provider has no name

### Speech-to-Text  
✅ **Complete** when:
- Microphone permission flow works
- Recording state changes are visible
- Text is correctly inserted at cursor
- Error cases are handled gracefully

---

## Next Steps After Verification

1. **If all tests pass**:
   - Update ROADMAP.md to mark F20 Phase 2b-iv as ✅
   - Update ROADMAP.md to mark Speech-to-Text as ✅
   - Commit verification documents with results

2. **If any tests fail**:
   - Document specific failures with logs
   - Create issue for each failure
   - Investigate and fix root causes

---

## Contact and Support

**Maintainer:** Leonard Schwier (github@leonardschwier.de)  
**Session:** 20260911T120000Z-cdba27dc  
**Last Updated:** 2026-09-11

For questions or issues during verification, refer to:
- `docs/f20-phase2b-iv-android-verification-2026-09-11.md` - Detailed implementation notes
- `docs/test-report-2026-09-11.md` - Automated test results
- `docs/security-audit-gitguardian-2026-09-08.md` - Security verification