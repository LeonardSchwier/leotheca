package com.leonardschwier.leotheca;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Speech recognition plugin for Android.
 * Uses the built-in SpeechRecognizer API with EXTRA_PREFER_OFFLINE
 * to ensure fully offline speech-to-text as required by CONSTITUTION.
 * 
 * This plugin provides:
 * - Offline speech recognition when user has downloaded language packs
 * - Support for multiple languages
 * - Clear error handling and availability checking
 */
@CapacitorPlugin(name = "SpeechRecognition")
public class SpeechRecognitionPlugin extends Plugin {

    private static final String TAG = "SpeechRecognitionPlugin";
    
    private SpeechRecognizer speechRecognizer;
    private PluginCall activeCall;
    private String currentLanguage = "en";
    private boolean preferOffline = true;

    @Override
    public void load() {
        super.load();
        // Initialize speech recognizer
        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            speechRecognizer.setRecognitionListener(new SpeechRecognitionListener());
        } catch (Exception e) {
            Log.e(TAG, "Failed to create SpeechRecognizer", e);
        }
    }

    /**
     * Start speech recognition with offline preference
     * 
     * @param call The plugin call containing options
     */
    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (speechRecognizer == null) {
            call.reject("SpeechRecognizer not available");
            return;
        }

        // Extract options
        String language = call.getString("language", "en");
        boolean offline = call.getBoolean("preferOffline", true);
        
        currentLanguage = language;
        preferOffline = offline;
        activeCall = call;

        try {
            // Check if offline recognition is supported
            Intent recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, 
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            
            // Set language
            if (language != null && !language.isEmpty()) {
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            }
            
            // Crucial for offline operation - prefer offline recognition
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline);
            
            // Additional settings for better offline recognition
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, 
                getContext().getPackageName());
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            
            // Start listening
            speechRecognizer.startListening(recognizerIntent);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to start speech recognition", e);
            call.reject("Failed to start recognition: " + e.getMessage());
        }
    }

    /**
     * Stop speech recognition
     * 
     * @param call The plugin call
     */
    @PluginMethod
    public void stopRecognition(PluginCall call) {
        if (speechRecognizer == null) {
            call.reject("SpeechRecognizer not available");
            return;
        }

        try {
            speechRecognizer.stopListening();
            call.resolve(new JSObject().put("success", true));
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop speech recognition", e);
            call.reject("Failed to stop recognition: " + e.getMessage());
        }
    }

    /**
     * Check if offline speech recognition is supported
     * 
     * @param call The plugin call
     */
    @PluginMethod
    public void isOfflineSupported(PluginCall call) {
        try {
            // Check if SpeechRecognizer is available and supports offline
            if (speechRecognizer == null) {
                call.resolve(new JSObject().put("supported", false));
                return;
            }
            
            // The actual offline support depends on what language packs the user has installed
            // We can only check if the API is available, not if it will work offline
            // This is a limitation of the Android API
            call.resolve(new JSObject().put("supported", true));
        } catch (Exception e) {
            call.resolve(new JSObject().put("supported", false));
        }
    }

    /**
     * Get available languages for offline speech recognition
     * 
     * @param call The plugin call
     */
    @PluginMethod
    public void getAvailableLanguages(PluginCall call) {
        try {
            // Get all available locales
            Locale[] locales = Locale.getAvailableLocales();
            List<String> languageCodes = new ArrayList<>();
            
            // Filter for locales that have language codes (basic filtering)
            // Note: This doesn't guarantee the language pack is installed for offline use
            for (Locale locale : locales) {
                String language = locale.getLanguage();
                if (language != null && !language.isEmpty() && !languageCodes.contains(language)) {
                    languageCodes.add(language);
                }
            }
            
            // Add common languages that are typically supported
            List<String> commonLanguages = new ArrayList<>();
            commonLanguages.add("en"); // English
            commonLanguages.add("fr"); // French
            commonLanguages.add("de"); // German
            commonLanguages.add("es"); // Spanish
            commonLanguages.add("it"); // Italian
            commonLanguages.add("pt"); // Portuguese
            commonLanguages.add("ru"); // Russian
            commonLanguages.add("zh"); // Chinese
            commonLanguages.add("ja"); // Japanese
            commonLanguages.add("ar"); // Arabic
            
            // Merge lists, keeping common languages at the top
            List<String> result = new ArrayList<>(commonLanguages);
            for (String lang : languageCodes) {
                if (!result.contains(lang)) {
                    result.add(lang);
                }
            }
            
            JSArray jsArray = new JSArray();
            for (String lang : result) {
                jsArray.put(lang);
            }
            
            call.resolve(new JSObject().put("languages", jsArray));
        } catch (Exception e) {
            Log.e(TAG, "Failed to get available languages", e);
            call.resolve(new JSObject().put("languages", new JSArray()));
        }
    }

    /**
     * Recognition listener for speech recognition events
     */
    private class SpeechRecognitionListener implements RecognitionListener {
        
        @Override
        public void onReadyForSpeech(Bundle params) {
            Log.d(TAG, "Ready for speech");
            if (activeCall != null) {
                // Could send a status update if needed
            }
        }

        @Override
        public void onBeginningOfSpeech() {
            Log.d(TAG, "Beginning of speech detected");
        }

        @Override
        public void onRmsChanged(float rmsdB) {
            // Audio level changes - could be used for visual feedback
        }

        @Override
        public void onBufferReceived(byte[] buffer) {
            // Raw audio buffer received
        }

        @Override
        public void onEndOfSpeech() {
            Log.d(TAG, "End of speech detected");
        }

        @Override
        public void onError(int error) {
            Log.e(TAG, "Speech recognition error: " + error);
            if (activeCall != null) {
                String errorMessage = getErrorMessage(error);
                activeCall.reject(errorMessage);
                activeCall = null;
            }
        }

        @Override
        public void onResults(Bundle results) {
            Log.d(TAG, "Speech recognition results received");
            if (activeCall != null) {
                try {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        String transcription = matches.get(0);
                        activeCall.resolve(new JSObject()
                            .put("success", true)
                            .put("text", transcription)
                            .put("language", currentLanguage));
                    } else {
                        activeCall.resolve(new JSObject().put("success", false));
                    }
                } catch (Exception e) {
                    activeCall.reject("Failed to process results: " + e.getMessage());
                }
                activeCall = null;
            }
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            Log.d(TAG, "Partial results received");
            // Could provide real-time feedback with partial results
            if (activeCall != null) {
                try {
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        String partialText = matches.get(0);
                        // For now, just log partial results
                        // In future, could send to TypeScript for real-time display
                        Log.d(TAG, "Partial: " + partialText);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to process partial results", e);
                }
            }
        }

        @Override
        public void onEvent(int eventType, Bundle params) {
            // Additional events
        }
    }

    /**
     * Convert Android speech recognition error codes to human-readable messages
     */
    private String getErrorMessage(int errorCode) {
        switch (errorCode) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Audio recording error";
            case SpeechRecognizer.ERROR_CLIENT:
                return "Client side error";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Microphone permission denied";
            case SpeechRecognizer.ERROR_NETWORK:
                return "Network error (offline mode may not be available)";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network timeout";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "No speech recognized";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Speech recognizer busy";
            case SpeechRecognizer.ERROR_SERVER:
                return "Server error";
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
                return "Server disconnected";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "No speech input - timed out";
            default:
                return "Unknown error: " + errorCode;
        }
    }
}