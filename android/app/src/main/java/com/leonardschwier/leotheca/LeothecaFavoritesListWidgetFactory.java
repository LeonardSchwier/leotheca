package com.leonardschwier.leotheca;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Backs the favorites-list home-screen widget's ListView. Reads the JSON
 * blob FolderAccessPlugin.updateFavoritesWidget last wrote to
 * SharedPreferences (PREFS_NAME/FAVORITES_KEY below): the resolved list of
 * favorited notes' labels and workspace-absolute paths, already computed
 * on the TypeScript side (bookmarks/store.ts's own reactive sync to
 * updateFavoritesWidget). This factory never touches SAF or the workspace
 * folder itself, so it renders correctly even while this app's WebView
 * process isn't running at all, which a RemoteViewsService must support:
 * the widget host can bind it independent of app process lifecycle.
 */
public class LeothecaFavoritesListWidgetFactory implements RemoteViewsService.RemoteViewsFactory {
    static final String PREFS_NAME = "LeothecaWidgetData";
    static final String FAVORITES_KEY = "favoritesJson";

    private final Context context;
    private List<FavoriteEntry> entries = new ArrayList<>();

    static final class FavoriteEntry {
        final String label;
        final String path;

        FavoriteEntry(String label, String path) {
            this.label = label;
            this.path = path;
        }
    }

    LeothecaFavoritesListWidgetFactory(Context context) {
        this.context = context;
    }

    @Override
    public void onCreate() {
        loadEntries();
    }

    @Override
    public void onDataSetChanged() {
        loadEntries();
    }

    private void loadEntries() {
        List<FavoriteEntry> next = new ArrayList<>();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(FAVORITES_KEY, null);
        if (json != null) {
            try {
                JSONArray array = new JSONArray(json);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject entry = array.getJSONObject(i);
                    String path = entry.optString("path", "");
                    // A malformed individual entry (missing its own path,
                    // the only field a tap needs to open the right note)
                    // is dropped rather than discarding the rest of an
                    // otherwise-good list, the same per-entry tolerance
                    // bookmarks/store.ts's own decodeBookmarks already
                    // applies on the TypeScript side that produced this
                    // JSON in the first place.
                    if (!path.isEmpty()) {
                        String label = entry.optString("label", "");
                        next.add(new FavoriteEntry(label.isEmpty() ? path : label, path));
                    }
                }
            } catch (Exception e) {
                // Corrupt/unexpected JSON: show an empty list (the widget's
                // own empty view) rather than crashing the widget host
                // process over stale or malformed native data.
                next = new ArrayList<>();
            }
        }
        entries = next;
    }

    @Override
    public void onDestroy() {
        entries = new ArrayList<>();
    }

    @Override
    public int getCount() {
        return entries.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_favorites_list_item);
        FavoriteEntry entry = entries.get(position);
        views.setTextViewText(R.id.widget_favorites_list_item_label, entry.label);

        // Merged onto LeothecaFavoritesListWidgetProvider's shared
        // ACTION_VIEW template at tap time (RemoteViews.setOnClickFillInIntent
        // + setPendingIntentTemplate); the resulting Intent lands on
        // MainActivity's already-registered leotheca:// VIEW intent-filter,
        // the same URL scheme automationCommands.ts parses for every other
        // local automation command.
        Intent fillInIntent = new Intent();
        fillInIntent.setData(Uri.parse("leotheca://open-note?path=" + Uri.encode(entry.path)));
        views.setOnClickFillInIntent(R.id.widget_favorites_list_item_label, fillInIntent);

        return views;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        // The favorites list is a live, user-editable, reorderable list
        // (add/remove/reorder bookmarks), so a row's position is not a
        // stable identity across data set changes; false is the correct,
        // conservative answer here, not a corner cut.
        return false;
    }
}
