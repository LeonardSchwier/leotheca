package com.leonardschwier.leotheca;

import android.content.Intent;
import android.widget.RemoteViewsService;

/** Thin RemoteViewsService entry point; see LeothecaFavoritesListWidgetFactory
 * for the actual data-reading and row-rendering logic. */
public class LeothecaFavoritesListWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new LeothecaFavoritesListWidgetFactory(getApplicationContext());
    }
}
