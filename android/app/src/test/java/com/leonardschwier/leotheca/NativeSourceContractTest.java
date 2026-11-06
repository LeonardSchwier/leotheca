package com.leonardschwier.leotheca;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.Test;

/**
 * Source-level wiring guards for crash fixes in classes that cannot run on the
 * JVM without the Android framework. The decisions themselves are tested
 * behaviourally in NativeBoundaryPolicyTest; these tests only pin that the
 * entrypoints still route through them.
 */
public class NativeSourceContractTest {
    private static String main(String name) throws Exception {
        Path root = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
        while (!Files.exists(root.resolve("android/app/src/main/java"))) root = root.getParent();
        return new String(
            Files.readAllBytes(root.resolve("android/app/src/main/java/com/leonardschwier/leotheca/" + name)),
            StandardCharsets.UTF_8
        );
    }

    private static String methodBody(String src, String signature) {
        int start = src.indexOf(signature);
        assertTrue(signature + " not found", start >= 0);
        int brace = src.indexOf('{', start);
        int depth = 0;
        for (int i = brace; i < src.length(); i++) {
            if (src.charAt(i) == '{') depth++;
            if (src.charAt(i) == '}' && --depth == 0) return src.substring(brace, i + 1);
        }
        throw new AssertionError("unbalanced braces for " + signature);
    }

    @Test
    public void activityLaunchesInPluginMethodsCannotEscapeToTheBridge() throws Exception {
        String pick = methodBody(main("FolderAccessPlugin.java"), "public void pickFolder(PluginCall call)");
        assertTrue(pick.contains("NativeBoundaryPolicy.runOrReject"));
        String export = methodBody(main("PrintExportPlugin.java"), "public void exportHtml(PluginCall call)");
        assertTrue(export.contains("NativeBoundaryPolicy.runOrReject"));
    }

    @Test
    public void shareIntentExtrasAreReadDefensively() throws Exception {
        String handler = methodBody(main("CaptureIntentHandler.java"), "public void processShareIntent(Intent intent)");
        assertFalse("getStringExtra returns null for styled text", handler.contains("getStringExtra(Intent.EXTRA_TEXT)"));
        assertTrue(handler.contains("getCharSequenceExtra(Intent.EXTRA_TEXT)"));
        // The exported activity's extras are sender-controlled: a malformed one
        // must drop the share, not crash MainActivity.onCreate.
        assertTrue(handler.contains("catch (RuntimeException"));
    }

    @Test
    public void shareIntentIsNotReplayedOnRestoreAndNewIntentIsNullSafe() throws Exception {
        String activity = main("MainActivity.java");
        assertTrue(activity.contains("shouldProcessShareAtCreate(savedInstanceState != null"));
        String onNew = methodBody(activity, "protected void onNewIntent(Intent intent)");
        assertTrue(onNew.contains("captureIntentHandler != null"));
        assertTrue(onNew.contains("NativeBoundaryPolicy.isShareAction"));
    }
}
