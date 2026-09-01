package com.leonardschwier.leotheca;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

final class NewNoteColdStartTracker {
    private static final String NEW_NOTE_URL = "leotheca://new-note";

    private NewNoteColdStartTracker() {}

    static boolean isNewNoteUrl(String url) {
        return url != null && (url.equals(NEW_NOTE_URL) || url.startsWith(NEW_NOTE_URL + "?"));
    }

    static String expectedQuickNoteName(Collection<String> existingNames) {
        Set<String> names = new HashSet<>(existingNames);
        String name = "Untitled.md";
        int suffix = 2;
        while (names.contains(name)) {
            name = "Untitled " + suffix + ".md";
            suffix++;
        }
        return name;
    }
}
