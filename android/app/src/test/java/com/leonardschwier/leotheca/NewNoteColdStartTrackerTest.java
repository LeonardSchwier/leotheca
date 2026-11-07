package com.leonardschwier.leotheca;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class NewNoteColdStartTrackerTest {
    @Test
    public void recognizesOnlyNewNoteAutomationUrls() {
        assertTrue(NewNoteColdStartTracker.isNewNoteUrl("leotheca://new-note"));
        assertTrue(NewNoteColdStartTracker.isNewNoteUrl("leotheca://new-note?content=hello"));
        assertFalse(NewNoteColdStartTracker.isNewNoteUrl("leotheca://open-favorites"));
        assertFalse(NewNoteColdStartTracker.isNewNoteUrl(null));
    }

    @Test
    public void predictsTheSameRootQuickNoteNameAsTheWebFlow() {
        assertEquals(
            "Untitled.md",
            NewNoteColdStartTracker.expectedQuickNoteName(Collections.emptyList())
        );
        assertEquals(
            "Untitled 2.md",
            NewNoteColdStartTracker.expectedQuickNoteName(Arrays.asList("Untitled.md", "Other.md"))
        );
        assertEquals(
            "Untitled 4.md",
            NewNoteColdStartTracker.expectedQuickNoteName(
                Arrays.asList("Untitled.md", "Untitled 2.md", "Untitled 3.md")
            )
        );
    }
}
