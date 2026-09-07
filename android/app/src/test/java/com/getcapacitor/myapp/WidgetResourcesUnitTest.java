package com.getcapacitor.myapp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class WidgetResourcesUnitTest {
    private static String source(String relativePath) throws IOException {
        // The Gradle test task may run from either android/ or repository root
        // Try both paths: first from android/, then from repository root
        String currentDir = System.getProperty("user.dir");
        java.nio.file.Path path1 = Paths.get(currentDir, "app", "src", "main", relativePath);
        java.nio.file.Path path2 = Paths.get(currentDir, "android", "app", "src", "main", relativePath);
        
        // Try path1 first (assuming working directory is android/)
        if (Files.exists(path1)) {
            return new String(Files.readAllBytes(path1), StandardCharsets.UTF_8);
        }
        // Try path2 (assuming working directory is repository root)
        if (Files.exists(path2)) {
            return new String(Files.readAllBytes(path2), StandardCharsets.UTF_8);
        }
        // Neither path exists, throw with both for debugging
        throw new IOException("Cannot find file at: " + path1 + " or " + path2);
    }

    @Test
    public void manifestRegistersTwoIndependentWidgetProviders() throws IOException {
        String manifest = source("AndroidManifest.xml");

        assertTrue(manifest.contains(".LeothecaNewNoteWidgetProvider"));
        assertTrue(manifest.contains("@xml/leotheca_widget_new_note_info"));
        assertTrue(manifest.contains(".LeothecaFavoritesWidgetProvider"));
        assertTrue(manifest.contains("@xml/leotheca_widget_favorites_info"));
        assertFalse(manifest.contains(".LeothecaWidgetProvider"));
    }

    @Test
    public void widgetMetadataPointsAtDedicatedLayouts() throws IOException {
        String newNoteInfo = source("res/xml/leotheca_widget_new_note_info.xml");
        String favoritesInfo = source("res/xml/leotheca_widget_favorites_info.xml");

        assertTrue(newNoteInfo.contains("android:minWidth=\"110dp\""));
        assertTrue(newNoteInfo.contains("android:minHeight=\"48dp\""));
        assertTrue(newNoteInfo.contains("@layout/leotheca_widget_new_note"));
        assertTrue(favoritesInfo.contains("android:minWidth=\"110dp\""));
        assertTrue(favoritesInfo.contains("android:minHeight=\"48dp\""));
        assertTrue(favoritesInfo.contains("@layout/leotheca_widget_favorites"));
    }

    @Test
    public void eachProviderExposesOnlyItsOwnAction() throws IOException {
        String newNoteProvider = source("java/com/leonardschwier/leotheca/LeothecaNewNoteWidgetProvider.java");
        String favoritesProvider = source("java/com/leonardschwier/leotheca/LeothecaFavoritesWidgetProvider.java");

        assertTrue(newNoteProvider.contains("R.layout.leotheca_widget_new_note"));
        assertTrue(newNoteProvider.contains("leotheca://new-note"));
        assertFalse(newNoteProvider.contains("open-favorites"));
        assertTrue(favoritesProvider.contains("R.layout.leotheca_widget_favorites"));
        assertTrue(favoritesProvider.contains("leotheca://open-favorites"));
        assertFalse(favoritesProvider.contains("leotheca://new-note"));
    }
}
