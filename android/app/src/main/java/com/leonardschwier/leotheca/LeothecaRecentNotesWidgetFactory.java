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
 * Backs the recent-notes home-screen widget's ListView. Reads the JSON
 * blob FolderAccessPlugin.updateRecentNotesWidget last wrote to
 * SharedPreferences (PREFS_NAME/RECENT_KEY below): the resolved list of
 * most-recently-edited notes' labels and workspace-absolute paths, already
 * computed on the TypeScript side (fileTreeStore.ts's own reactive sync to
 * updateRecentNotesWidget). This factory never touches SAF or the
 * workspace folder itself, so it renders correctly even while this app's
 * WebView process isn't running at all, which a RemoteViewsService must
 * support: the widget host can bind it independent of app process lifecycle.
 */
public class LeothecaRecentNotesWidgetFactory implements RemoteViewsService.RemoteViewsFactory {
    static final String PREFS_NAME = "LeothecaWidgetData";
    static final String RECENT_KEY = "recentNotesJson";

    private final Context context;
    private List<RecentEntry> entries = new ArrayList<>();

    static final class RecentEntry {
        final String label;
        final String path;

        RecentEntry(String label, String path) {
            this.label = label;
            this.path = path;
        }
    }

    LeothecaRecentNotesWidgetFactory(Context context) {
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
        List<RecentEntry> next = new ArrayList<>();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(RECENT_KEY, null);
        if (json != null) {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    String path = obj.optString("path", "");
                    if (path.isEmpty()) continue;
                    String label = obj.optString("label", "");
                    next.add(new RecentEntry(label.isEmpty() ? path : label, path));
                }
            } catch (Exception ignored) {
            }
        }
        entries = next;
    }

    @Override
    public int getCount() {
        return entries.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= entries.size()) return null;
        RecentEntry entry = entries.get(position);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_recent_notes_item);
        views.setTextViewText(R.id.widget_recent_notes_item_label, entry.label);

        Intent fill = new Intent(Intent.ACTION_VIEW, Uri.parse("leotheca://open-note?path=" + Uri.encode(entry.path)));
        fill.setPackage(context.getPackageName());
        int requestCode = position;
        PendingIntent pending = PendingIntent.getActivity(
            context,
            requestCode,
            fill,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickFillInIntent(R.id.widget_recent_notes_item_label, pending);
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
        return true;
    }
}
