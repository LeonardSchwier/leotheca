package com.leonardschwier.leotheca;

import android.content.Intent;
import android.widget.RemoteViewsService;

/** Thin RemoteViewsService entry point; see LeothecaRecentNotesWidgetFactory
 * for the actual data-reading and row-rendering logic. */
public class LeothecaRecentNotesWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new LeothecaRecentNotesWidgetFactory(getApplicationContext());
    }
}
