package com.leonardschwier.leotheca;

import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final long NEW_NOTE_POLL_INTERVAL_MS = 200;
    private static final long NEW_NOTE_TIMEOUT_MS = 12_000;
    private static final long NEW_NOTE_SETTLE_DELAY_MS = 150;

    private ExecutorService newNoteTrackerExecutor;
    private View newNoteProgressOverlay;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // WorkspaceMutationPlugin extends FolderAccessPlugin and is registered
        // under the same bridge name, so callers get the established storage
        // methods plus F-004's no-replace mutations from one capability.
        registerPlugin(WorkspaceMutationPlugin.class);

        NewNoteTarget newNoteTarget = null;
        if (
            savedInstanceState == null
                && getIntent() != null
                && NewNoteColdStartTracker.isNewNoteUrl(getIntent().getDataString())
        ) {
            newNoteTarget = resolveNewNoteTarget();
        }

        super.onCreate(savedInstanceState);

        if (newNoteTarget != null) {
            showNewNoteProgress();
            trackNewNoteCreation(newNoteTarget);
        }
    }

    @Override
    public void onDestroy() {
        if (newNoteTrackerExecutor != null) {
            newNoteTrackerExecutor.shutdownNow();
            newNoteTrackerExecutor = null;
        }
        super.onDestroy();
    }

    private NewNoteTarget resolveNewNoteTarget() {
        String workspaceToken = readWorkspaceToken();
        if (workspaceToken == null) return null;

        try {
            DocumentFile root = DocumentFile.fromTreeUri(this, Uri.parse(workspaceToken));
            if (root == null || !root.isDirectory()) return null;

            List<String> existingNames = new ArrayList<>();
            for (DocumentFile child : root.listFiles()) {
                String name = child.getName();
                if (name != null) existingNames.add(name);
            }
            return new NewNoteTarget(root, NewNoteColdStartTracker.expectedQuickNoteName(existingNames));
        } catch (Exception ignored) {
            return null;
        }
    }

    private String readWorkspaceToken() {
        File configFile = new File(getFilesDir(), "config.json");
        if (!configFile.isFile()) return null;

        try (FileInputStream input = new FileInputStream(configFile); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer, 0, buffer.length)) != -1) {
                output.write(buffer, 0, count);
            }
            JSONObject config = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            if (!"/workspace".equals(config.optString("lastWorkspacePath", null))) return null;
            String token = config.optString("workspaceToken", null);
            return token == null || token.isEmpty() ? null : token;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void showNewNoteProgress() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setClickable(true);
        overlay.setFocusable(true);
        overlay.setBackgroundColor(resolveThemeColor(android.R.attr.colorBackground));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);

        ProgressBar progress = new ProgressBar(this);
        content.addView(progress, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView label = new TextView(this);
        label.setText(R.string.creating_note);
        label.setTextColor(resolveThemeColor(android.R.attr.textColorPrimary));
        label.setTextSize(16);
        int spacing = Math.round(12 * getResources().getDisplayMetrics().density);
        label.setPadding(0, spacing, 0, 0);
        content.addView(label, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        overlay.addView(content, contentParams);

        addContentView(overlay, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        newNoteProgressOverlay = overlay;
    }

    private int resolveThemeColor(int attribute) {
        TypedValue value = new TypedValue();
        if (!getTheme().resolveAttribute(attribute, value, true)) return 0;
        if (value.resourceId != 0) return getColor(value.resourceId);
        return value.data;
    }

    private void trackNewNoteCreation(NewNoteTarget target) {
        newNoteTrackerExecutor = Executors.newSingleThreadExecutor();
        newNoteTrackerExecutor.execute(() -> {
            long deadline = SystemClock.elapsedRealtime() + NEW_NOTE_TIMEOUT_MS;
            boolean created = false;
            while (!Thread.currentThread().isInterrupted() && SystemClock.elapsedRealtime() < deadline) {
                try {
                    DocumentFile file = target.root.findFile(target.expectedName);
                    if (file != null && file.isFile()) {
                        created = true;
                        break;
                    }
                    Thread.sleep(NEW_NOTE_POLL_INTERVAL_MS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                } catch (Exception ignored) {
                    break;
                }
            }

            if (isFinishing() || isDestroyed()) return;
            long delay = created ? NEW_NOTE_SETTLE_DELAY_MS : 0;
            runOnUiThread(() -> {
                View overlay = newNoteProgressOverlay;
                if (overlay != null) overlay.postDelayed(this::hideNewNoteProgress, delay);
            });
        });
    }

    private void hideNewNoteProgress() {
        View overlay = newNoteProgressOverlay;
        if (overlay == null) return;
        ViewGroup parent = (ViewGroup) overlay.getParent();
        if (parent != null) parent.removeView(overlay);
        newNoteProgressOverlay = null;
    }

    private static final class NewNoteTarget {
        final DocumentFile root;
        final String expectedName;

        NewNoteTarget(DocumentFile root, String expectedName) {
            this.root = root;
            this.expectedName = expectedName;
        }
    }
}
