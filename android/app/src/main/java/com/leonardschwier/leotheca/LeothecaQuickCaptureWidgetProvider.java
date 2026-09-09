package com.leonardschwier.leotheca;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** A fourth home-screen widget, distinct from {@link LeothecaNewNoteWidgetProvider}: it
 * deep-links to the existing F05 quick-capture review flow ({@code leotheca://capture})
 * instead of creating a blank untitled note directly. See ROADMAP.md's entry of the same
 * name and documentation/ARCHITECTURE.md. */
public class LeothecaQuickCaptureWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_quick_capture);
            views.setOnClickPendingIntent(R.id.widget_quick_capture, action(context, "leotheca://capture"));
            manager.updateAppWidget(id, views);
        }
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
