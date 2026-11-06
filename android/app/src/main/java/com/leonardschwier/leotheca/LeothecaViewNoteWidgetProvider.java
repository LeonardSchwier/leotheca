package com.leonardschwier.leotheca;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Home-screen "View note" widget (see ROADMAP.md's "Android home-screen
 * 'View note' widget (shows note content)"), the one widget in the family
 * that DISPLAYS a note's content on the home screen rather than opening a
 * list or creating a note. The TypeScript side resolves the user's chosen
 * note into a plain {@code {title, path}} pair and pushes it through
 * FolderAccessPlugin.setViewNote, which persists it to SharedPreferences
 * (PREFS_NAME/VIEW_NOTE_KEY below); this provider re-reads that blob on
 * every update, pulls the note's content from the SAF folder, and renders
 * title + a markdown-stripped content preview as a RemoteViews snapshot.
 *
 * Unlike the favorites/recent list widgets this is a single-note snapshot
 * (no RemoteViewsService/ListView): a home-screen widget's visible text is a
 * fixed RemoteViews snapshot, and one chosen note is exactly what the feature
 * asks for. It is self-contained and never touches the workspace folder or
 * any network path, only the already-granted SAF document.
 */
public class LeothecaViewNoteWidgetProvider extends AppWidgetProvider {
    static final String PREFS_NAME = "LeothecaWidgetData";
    static final String VIEW_NOTE_KEY = "viewNote";

    /**
     * The widget only shows a preview of the chosen note, not the whole file:
     * a multi-hundred-KB note rendered as RemoteViews text would be useless
     * on a home screen and heavy on the widget host's memory, so the preview
     * is truncated to a small, widget-appropriate character budget (well
     * within a single text node, far below FolderAccessPlugin's 8 MiB
     * read cap) and the full note is still one tap away via the deep link.
     */
    static final int MAX_PREVIEW_CHARS = 500;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            updateOne(context, manager, id);
        }
    }

    private void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_view_note);

        String title = "Leotheca";
        String preview = "Tap to choose a note to show here.";
        try {
            JSONObject note = readStoredNote(context);
            if (note != null) {
                String storedTitle = note.optString("title", "").trim();
                title = storedTitle.isEmpty() ? "Note" : storedTitle;
                preview = stripMarkdownForWidget(loadPreview(context, note.optString("path", "")));
            }
        } catch (Exception e) {
            // A missing/unreadable note (folder revoked, note deleted, or a
            // first run with nothing chosen yet) must degrade to a helpful
            // prompt, not a blank or broken widget.
            preview = "Tap to choose a note to show here.";
        }

        views.setTextViewText(R.id.widget_view_note_title, title);
        views.setTextViewText(R.id.widget_view_note_content, preview);
        views.setTextViewText(R.id.widget_view_note_change_hint, "Tap to open / change note");

        // One whole-widget tap: open the in-app flow to view (and, if desired,
        // change) the note. The leotheca:// URL scheme is the same one the
        // other widgets and the favorites/recent list rows use to deep-link
        // back into the app (MainActivity's registered VIEW intent-filter).
        views.setOnClickPendingIntent(
            R.id.widget_view_note,
            action(context, "leotheca://select-widget-note")
        );

        manager.updateAppWidget(appWidgetId, views);
    }

    private JSONObject readStoredNote(Context context) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(VIEW_NOTE_KEY, null);
        if (json == null) {
            return null;
        }
        JSONObject note = new JSONObject(json);
        // The only field a tap or a render needs is path; without it there is
        // nothing to show, so treat a path-less blob as "nothing chosen yet".
        if (note.optString("path", "").isEmpty()) {
            return null;
        }
        return note;
    }

    private String loadPreview(Context context, String uriStr) {
        if (uriStr.isEmpty()) {
            return "";
        }
        try (java.io.InputStream input = context.getContentResolver().openInputStream(Uri.parse(uriStr))) {
            if (input == null) {
                return "";
            }
            StringBuilder builder = new StringBuilder();
            byte[] chunk = new byte[8192];
            int read;
            // Bound the read to a small preview: stop once we have enough for
            // the widget's preview budget plus headroom, so a huge note cannot
            // be slurped fully into the widget host's memory.
            int budget = MAX_PREVIEW_CHARS * 2;
            while ((read = input.read(chunk)) != -1) {
                builder.append(new String(chunk, 0, read, java.nio.charset.StandardCharsets.UTF_8));
                if (builder.length() >= budget) {
                    break;
                }
            }
            return builder.toString();
        } catch (Exception e) {
            // SAF permission revoked or note removed: return empty so the
            // provider falls back to the friendly prompt above.
            return "";
        }
    }

    /**
     * Reduces raw markdown to plain, home-screen-legible text: headings and
     * emphasis markers, inline code backticks, and code fences are dropped,
     * links collapse to their visible text, and runs of blank lines collapse
     * to a single newline. This is a deliberately light, dependency-free
     * transform (RemoteViews text supports no markdown), not a full markdown
     * parser, and it never executes anything from the note (the content is
     * user data, not instructions).
     */
    static String stripMarkdownForWidget(String markdown) {
        if (markdown == null || markdown.isEmpty()) {
            return "";
        }
        String text = markdown.replace("```", "");
        // Drop ATX heading markers while keeping the heading text.
        text = text.replaceAll("(?m)^\\s{0,3}#{1,6}\\s+", "");
        // Collapse links [label](target) to just the label.
        text = text.replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1");
        // Drop remaining emphasis markers.
        text = text.replace("**", "").replace("__", "").replace("*", "").replace("_", "");
        // Drop inline code backticks.
        text = text.replace("`", "");
        // Collapse 2+ newlines to a single newline and trim line whitespace.
        text = text.replaceAll("[ \\t]+\\n", "\n");
        text = text.replaceAll("\\n{3,}", "\n\n");
        text = text.trim();
        if (text.length() > MAX_PREVIEW_CHARS) {
            text = text.substring(0, MAX_PREVIEW_CHARS).trim() + "\u2026";
        }
        return text;
    }

    private PendingIntent action(Context context, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(context.getPackageName());
        return PendingIntent.getActivity(
            context,
            url.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
