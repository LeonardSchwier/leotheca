package com.leonardschwier.leotheca;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class LeothecaWidgetProvider extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget);
            views.setOnClickPendingIntent(R.id.widget_new_note, action(context, "leotheca://new-note"));
            views.setOnClickPendingIntent(R.id.widget_favorites, action(context, "leotheca://open-favorites"));
            manager.updateAppWidget(id, views);
        }
    }
    private PendingIntent action(Context context, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(context.getPackageName());
        return PendingIntent.getActivity(context, url.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
