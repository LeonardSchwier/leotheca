package com.leonardschwier.leotheca;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class QuickCaptureLaunchTest {
    @Test
    public void theCaptureUrlIsTheWebLayersCaptureCommand() {
        assertEquals("leotheca://capture", QuickCaptureLaunch.CAPTURE_URL);
    }

    @Test
    public void recognizesOnlyTheCaptureLink() {
        assertTrue(QuickCaptureLaunch.isCaptureUrl("leotheca://capture"));
        assertTrue(QuickCaptureLaunch.isCaptureUrl("leotheca://capture?text=hi"));
        assertFalse(QuickCaptureLaunch.isCaptureUrl("leotheca://capture-extra"));
        assertFalse(QuickCaptureLaunch.isCaptureUrl("leotheca://new-note"));
        assertFalse(QuickCaptureLaunch.isCaptureUrl("https://capture"));
        assertFalse(QuickCaptureLaunch.isCaptureUrl(""));
        assertFalse(QuickCaptureLaunch.isCaptureUrl(null));
    }
}
