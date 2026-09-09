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
        // Get the repository root by going up from the current directory until we find .git
        String currentDir = System.getProperty("user.dir");
        java.nio.file.Path repoRoot = Paths.get(currentDir);
        
        // Find the repository root by looking for the android directory
        while (!Files.exists(repoRoot.resolve("android"))) {
            repoRoot = repoRoot.getParent();
            if (repoRoot == null) {
                throw new IOException("Cannot find repository root");
            }
        }
        
        // Now construct the path to the file
        java.nio.file.Path filePath = repoRoot.resolve("android").resolve("app").resolve("src").resolve("main").resolve(relativePath);
        
        if (!Files.exists(filePath)) {
            throw new IOException("Cannot find file at: " + filePath + " (repo root: " + repoRoot + ")");
        }
        
        return new String(Files.readAllBytes(filePath), StandardCharsets.UTF_8);
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

    // Android home-screen widget listing individual notes by name: a third,
    // separate widget from the two single-button ones above (see
    // ROADMAP.md's entry of the same name and documentation/ARCHITECTURE.md).
    @Test
    public void manifestRegistersTheFavoritesListWidgetProviderAndService() throws IOException {
        String manifest = source("AndroidManifest.xml");

        assertTrue(manifest.contains(".LeothecaFavoritesListWidgetProvider"));
        assertTrue(manifest.contains("@xml/leotheca_widget_favorites_list_info"));
        assertTrue(manifest.contains(".LeothecaFavoritesListWidgetService"));
        assertTrue(manifest.contains("android.permission.BIND_REMOTEVIEWS"));
    }

    @Test
    public void favoritesListWidgetMetadataPointsAtItsOwnLayout() throws IOException {
        String info = source("res/xml/leotheca_widget_favorites_list_info.xml");

        assertTrue(info.contains("@layout/leotheca_widget_favorites_list"));
        assertFalse(info.contains("@layout/leotheca_widget_favorites\""));
    }

    @Test
    public void favoritesListLayoutsDeclareTheIdsTheJavaCodeReferences() throws IOException {
        String container = source("res/layout/leotheca_widget_favorites_list.xml");
        String item = source("res/layout/leotheca_widget_favorites_list_item.xml");

        assertTrue(container.contains("@+id/widget_favorites_list"));
        assertTrue(container.contains("@+id/widget_favorites_list_empty"));
        assertTrue(item.contains("@+id/widget_favorites_list_item_label"));
    }

    @Test
    public void favoritesListProviderWiresTheRemoteAdapterEmptyViewAndClickTemplate() throws IOException {
        String provider = source("java/com/leonardschwier/leotheca/LeothecaFavoritesListWidgetProvider.java");

        assertTrue(provider.contains("setRemoteAdapter"));
        assertTrue(provider.contains("R.id.widget_favorites_list"));
        assertTrue(provider.contains("setEmptyView"));
        assertTrue(provider.contains("R.id.widget_favorites_list_empty"));
        assertTrue(provider.contains("setPendingIntentTemplate"));
        assertTrue(provider.contains("PendingIntent.FLAG_MUTABLE"));
    }

    @Test
    public void favoritesListFactoryReadsTheSameSharedPreferencesKeysThePluginWrites() throws IOException {
        String plugin = source("java/com/leonardschwier/leotheca/FolderAccessPlugin.java");
        String factory = source("java/com/leonardschwier/leotheca/LeothecaFavoritesListWidgetFactory.java");

        assertTrue(plugin.contains("updateFavoritesWidget"));
        assertTrue(plugin.contains("LeothecaFavoritesListWidgetFactory.PREFS_NAME"));
        assertTrue(plugin.contains("LeothecaFavoritesListWidgetFactory.FAVORITES_KEY"));
        assertTrue(factory.contains("PREFS_NAME = \"LeothecaWidgetData\""));
        assertTrue(factory.contains("FAVORITES_KEY = \"favoritesJson\""));
        assertTrue(factory.contains("leotheca://open-note?path="));
    }

    // Android home-screen widget that opens directly into Quick Capture: a fourth,
    // separate single-button widget alongside New note/Favorites/Favorites list,
    // deep-linking to the existing F05 leotheca://capture review flow instead of
    // creating a blank note. See ROADMAP.md's entry of the same name.
    @Test
    public void manifestRegistersTheQuickCaptureWidgetProvider() throws IOException {
        String manifest = source("AndroidManifest.xml");

        assertTrue(manifest.contains(".LeothecaQuickCaptureWidgetProvider"));
        assertTrue(manifest.contains("@xml/leotheca_widget_quick_capture_info"));
    }

    @Test
    public void quickCaptureWidgetMetadataPointsAtItsOwnLayout() throws IOException {
        String info = source("res/xml/leotheca_widget_quick_capture_info.xml");

        assertTrue(info.contains("android:minWidth=\"110dp\""));
        assertTrue(info.contains("android:minHeight=\"48dp\""));
        assertTrue(info.contains("@layout/leotheca_widget_quick_capture"));
        assertFalse(info.contains("@layout/leotheca_widget_new_note"));
    }

    @Test
    public void quickCaptureLayoutDeclaresTheIdTheJavaCodeReferences() throws IOException {
        String layout = source("res/layout/leotheca_widget_quick_capture.xml");

        assertTrue(layout.contains("@+id/widget_quick_capture"));
    }

    @Test
    public void quickCaptureProviderExposesOnlyTheCaptureAction() throws IOException {
        String provider = source("java/com/leonardschwier/leotheca/LeothecaQuickCaptureWidgetProvider.java");

        assertTrue(provider.contains("R.layout.leotheca_widget_quick_capture"));
        assertTrue(provider.contains("R.id.widget_quick_capture"));
        assertTrue(provider.contains("leotheca://capture"));
        assertFalse(provider.contains("leotheca://new-note"));
        assertFalse(provider.contains("open-favorites"));
    }
}
