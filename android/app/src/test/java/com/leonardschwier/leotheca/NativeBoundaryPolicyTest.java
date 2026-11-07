package com.leonardschwier.leotheca;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class NativeBoundaryPolicyTest {
    @Test
    public void runOrRejectRunsActionAndDoesNotRejectOnSuccess() {
        List<String> rejected = new ArrayList<>();
        int[] runs = {0};
        boolean ran = NativeBoundaryPolicy.runOrReject(() -> runs[0]++, rejected::add, "failed");
        assertTrue(ran);
        assertEquals(1, runs[0]);
        assertTrue(rejected.isEmpty());
    }

    @Test
    public void runOrRejectTurnsALaunchFailureIntoARejectionInsteadOfThrowing() {
        List<String> rejected = new ArrayList<>();
        boolean ran = NativeBoundaryPolicy.runOrReject(
            () -> {
                throw new IllegalStateException("No Activity found to handle Intent content://secret/doc");
            },
            rejected::add,
            "No document picker is available"
        );
        assertFalse(ran);
        assertEquals(1, rejected.size());
        assertEquals("No document picker is available (IllegalStateException)", rejected.get(0));
        // The provider's message can carry a caller-controlled URI; it must not be forwarded.
        assertFalse(rejected.get(0).contains("secret"));
    }

    @Test
    public void shareActionsAreRecognised() {
        assertTrue(NativeBoundaryPolicy.isShareAction("android.intent.action.SEND"));
        assertTrue(NativeBoundaryPolicy.isShareAction("android.intent.action.SEND_MULTIPLE"));
        assertFalse(NativeBoundaryPolicy.isShareAction("android.intent.action.VIEW"));
        assertFalse(NativeBoundaryPolicy.isShareAction(null));
    }

    @Test
    public void shareIsNotReplayedWhenTheActivityIsRestored() {
        assertTrue(NativeBoundaryPolicy.shouldProcessShareAtCreate(false, "android.intent.action.SEND"));
        assertFalse(NativeBoundaryPolicy.shouldProcessShareAtCreate(true, "android.intent.action.SEND"));
        assertFalse(NativeBoundaryPolicy.shouldProcessShareAtCreate(false, "android.intent.action.VIEW"));
    }

    @Test
    public void styledTextIsKeptAsPlainText() {
        assertEquals("hello", NativeBoundaryPolicy.charSequenceToString(new StringBuilder("hello")));
        assertNull(NativeBoundaryPolicy.charSequenceToString(null));
    }

    @Test
    public void shareStreamsMustBeAnotherAppsContentUri() {
        String own = "com.leonardschwier.leotheca";
        assertTrue(NativeBoundaryPolicy.isAcceptableShareUri("content", "com.android.providers.media.documents", own));
        assertTrue(NativeBoundaryPolicy.isAcceptableShareUri("CONTENT", "media", own));
        // Never read the app's own files or providers with the app's identity.
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("file", "", own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("file", null, own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", own + ".fileprovider", own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", own, own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", "COM.LEONARDSCHWIER.LEOTHECA.fileprovider", own));
        // A user id prefix does not hide the provider.
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", "10@" + own + ".fileprovider", own));
        assertTrue(NativeBoundaryPolicy.isAcceptableShareUri("content", "10@media", own));
        // A package that merely starts with the same letters is another app.
        assertTrue(NativeBoundaryPolicy.isAcceptableShareUri("content", own + "x.provider", own));
        // Missing parts are refused.
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri(null, "media", own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", null, own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", "", own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", "10@", own));
        assertFalse(NativeBoundaryPolicy.isAcceptableShareUri("content", "media", null));
    }
}
