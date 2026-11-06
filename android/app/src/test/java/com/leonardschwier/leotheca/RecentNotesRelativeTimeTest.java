package com.leonardschwier.leotheca;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.Test;

/** Behavioural checks for the recent-notes widget's relative-time text. */
public class RecentNotesRelativeTimeTest {
    private static final long NOW = 1_800_000_000_000L;
    private static final long MIN = 60_000L;
    private static final long HOUR = 60 * MIN;
    private static final long DAY = 24 * HOUR;

    private static String fmt(long ago) {
        return LeothecaRecentNotesWidgetFactory.formatRelativeTime(NOW - ago, NOW);
    }

    @Test
    public void missingMtimeRendersNoText() {
        assertEquals("", LeothecaRecentNotesWidgetFactory.formatRelativeTime(0, NOW));
        assertEquals("", LeothecaRecentNotesWidgetFactory.formatRelativeTime(-5, NOW));
    }

    @Test
    public void bucketBoundaries() {
        assertEquals("just now", fmt(0));
        assertEquals("just now", fmt(MIN - 1));
        assertEquals("1 min ago", fmt(MIN));
        assertEquals("59 min ago", fmt(HOUR - 1));
        assertEquals("1 hour ago", fmt(HOUR));
        assertEquals("23 hours ago", fmt(DAY - 1));
        assertEquals("1 day ago", fmt(DAY));
        assertEquals("6 days ago", fmt(7 * DAY - 1));
        assertEquals("1 wk ago", fmt(7 * DAY));
        assertEquals("3 wks ago", fmt(21 * DAY));
    }

    @Test
    public void futureMtimeFromClockSkewIsJustNow() {
        assertEquals("just now", LeothecaRecentNotesWidgetFactory.formatRelativeTime(NOW + HOUR, NOW));
    }

    @Test
    public void emptyTimeLineIsHiddenSoItReservesNoHeight() throws Exception {
        Path root = Paths.get(System.getProperty("user.dir"));
        while (!Files.exists(root.resolve("android"))) root = root.getParent();
        String src = new String(
            Files.readAllBytes(root.resolve(
                "android/app/src/main/java/com/leonardschwier/leotheca/LeothecaRecentNotesWidgetFactory.java")),
            StandardCharsets.UTF_8);
        assertTrue(src.contains("setViewVisibility"));
        assertTrue(src.contains("View.GONE"));
    }
}
