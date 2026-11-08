package com.leonardschwier.leotheca;

/**
 * Pure (no android.* imports) description of the one deep link every Android OS entry
 * point for Quick Capture uses: the home-screen widget and the static launcher shortcut
 * (res/xml/shortcuts.xml). The web layer opens the capture sheet for review; nothing here
 * reads or writes notes, and no permission is involved.
 */
final class QuickCaptureLaunch {
    static final String CAPTURE_URL = "leotheca://capture";

    private QuickCaptureLaunch() {}

    /** True for the bare capture link, with or without a query; any other host or scheme is false. */
    static boolean isCaptureUrl(String url) {
        return url != null && (url.equals(CAPTURE_URL) || url.startsWith(CAPTURE_URL + "?"));
    }
}
