package com.leonardschwier.leotheca;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home-screen widget listing individual favorited notes by name (see
 * ROADMAP.md's "Android home-screen widget listing individual notes by
 * name"), distinct from LeothecaFavoritesWidgetProvider above, which is a
 * single button that only opens the in-app Bookmarks panel and renders no
 * note names at all. The actual note list lives in a RemoteViewsService
 * (LeothecaFavoritesListWidgetService/-Factory), reading a JSON blob
 * FolderAccessPlugin.updateFavoritesWidget already resolved on the
 * TypeScript side; this provider only wires the ListView's adapter and its
 * shared per-row click template.
 */
public class LeothecaFavoritesListWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            updateOne(context, manager, id);
        }
    }

    private void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.leotheca_widget_favorites_list);

        Intent serviceIntent = new Intent(context, LeothecaFavoritesListWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // The widget host caches a RemoteViewsFactory by Intent identity;
        // without a per-widget-id-unique data Uri here, adding a second
        // instance of this widget can reuse the first instance's factory
        // instead of getting its own. The same idiom Android's own
        // StackWidget sample uses for collection-view widgets.
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_favorites_list, serviceIntent);
        views.setEmptyView(R.id.widget_favorites_list, R.id.widget_favorites_list_empty);

        // One shared click template: each row supplies the specific note
        // via its own fill-in intent (LeothecaFavoritesListWidgetFactory's
        // setOnClickFillInIntent), which the widget host merges onto a
        // copy of this template at tap time. FLAG_MUTABLE is required for
        // that merge to actually apply on Android 12+; compileSdk is 35,
        // so the flag is always available at build time, and pre-31
        // devices simply ignore it (every PendingIntent was implicitly
        // mutable there).
        Intent templateIntent = new Intent(Intent.ACTION_VIEW);
        templateIntent.setPackage(context.getPackageName());
        PendingIntent template = PendingIntent.getActivity(
            context,
            0,
            templateIntent,
            PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.widget_favorites_list, template);

        manager.updateAppWidget(appWidgetId, views);
    }
}
