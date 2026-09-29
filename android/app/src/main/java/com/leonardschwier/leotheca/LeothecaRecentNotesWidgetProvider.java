package com.leonardschwier.leotheca;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home-screen widget listing the most recently edited notes by name (see
 * ROADMAP.md's "Android Home-Screen Widgets" item), distinct from
 * LeothecaFavoritesListWidgetProvider above, which lists user-pinned
 * bookmarks. This widget shows notes by mtime order, computed on the
 * TypeScript side via findAllFiles and synced through
 * FolderAccessPlugin.updateRecentNotesWidget. The actual note list lives
 * in a RemoteViewsService (LeothecaRecentNotesWidgetService/-Factory),
 * reading a JSON blob the TypeScript side already resolved; this provider
 * only wires the ListView's adapter and its shared per-row click template.
 */
public class LeothecaRecentNotesWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            updateOne(context, manager, id);
        }
    }

    private void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_recent_notes);

        Intent serviceIntent = new Intent(context, LeothecaRecentNotesWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_recent_notes_list, serviceIntent);
        views.setEmptyView(R.id.widget_recent_notes_list, R.id.widget_recent_notes_empty);

        Intent templateIntent = new Intent(Intent.ACTION_VIEW);
        templateIntent.setPackage(context.getPackageName());
        PendingIntent template = PendingIntent.getActivity(
            context,
            0,
            templateIntent,
            PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.widget_recent_notes_list, template);

        manager.updateAppWidget(appWidgetId, views);
    }
}
