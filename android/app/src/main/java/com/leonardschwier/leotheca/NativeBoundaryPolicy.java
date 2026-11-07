package com.leonardschwier.leotheca;

/**
 * Pure (no android.* imports) decisions made at the native boundary, kept in
 * one class so JVM unit tests can exercise them without Robolectric.
 *
 * Capacitor rethrows any exception that escapes a plugin method as a
 * RuntimeException on the bridge thread (Bridge.callPluginMethod: "Serious
 * error executing plugin"), which terminates the app. Every call that can
 * throw for reasons outside our control has to be turned into a rejected call.
 */
final class NativeBoundaryPolicy {
    private NativeBoundaryPolicy() {}

    /**
     * Whether a shared stream URI may be opened with the app's own ContentResolver.
     *
     * MainActivity is exported, so any app can send any URI. Only a content URI that
     * belongs to another app is acceptable: a file URI would read app-private files
     * and a URI of one of the app's own providers would read the app's own data with
     * the app's identity. A leading user id ("10@authority") is not part of the
     * authority that selects a provider, so it is stripped before the comparison.
     */
    static boolean isAcceptableShareUri(String scheme, String authority, String ownPackage) {
        if (scheme == null || !"content".equalsIgnoreCase(scheme)) {
            return false;
        }
        if (authority == null || ownPackage == null) {
            return false;
        }
        String provider = authority.substring(authority.lastIndexOf('@') + 1).toLowerCase(java.util.Locale.ROOT);
        String own = ownPackage.toLowerCase(java.util.Locale.ROOT);
        if (provider.isEmpty() || provider.equals(own) || provider.startsWith(own + ".")) {
            return false;
        }
        return true;
    }

    /** An action that may throw, such as launching an activity. */
    interface Action {
        void run() throws Exception;
    }

    /** Receives the message of a rejected call. */
    interface Rejector {
        void reject(String message);
    }

    /**
     * Runs {@code action}; if it throws (for example ActivityNotFoundException
     * when the device has no document picker), rejects instead of letting the
     * exception reach the bridge. Returns whether the action ran.
     */
    static boolean runOrReject(Action action, Rejector rejector, String failureMessage) {
        try {
            action.run();
            return true;
        } catch (Exception e) {
            // Only the type is passed on: provider exception messages can embed
            // caller-controlled URIs (F05-FR-25).
            rejector.reject(failureMessage + " (" + e.getClass().getSimpleName() + ")");
            return false;
        }
    }

    static boolean isShareAction(String action) {
        return "android.intent.action.SEND".equals(action) || "android.intent.action.SEND_MULTIPLE".equals(action);
    }

    /**
     * A share intent that is still attached to the activity after the system
     * recreated it (process-death restore) was already consumed, so replaying
     * it would capture the same content a second time.
     */
    static boolean shouldProcessShareAtCreate(boolean hasSavedInstanceState, String action) {
        return !hasSavedInstanceState && isShareAction(action);
    }

    /**
     * EXTRA_TEXT and EXTRA_SUBJECT are CharSequence extras: browsers and mail
     * apps send styled text, for which getStringExtra silently returns null.
     */
    static String charSequenceToString(CharSequence value) {
        return value == null ? null : value.toString();
    }
}
