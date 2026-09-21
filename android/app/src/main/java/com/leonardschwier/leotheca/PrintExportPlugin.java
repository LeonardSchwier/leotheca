package com.leonardschwier.leotheca;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * ROADMAP.md's "Print/export a note on Android": the Desktop/Tauri
 * implementations of both features (`src/export/printNote.ts`,
 * `src/export/exportNoteHtml.ts`) reuse the browser's own iframe/print
 * APIs and a native "Save As" dialog, neither of which exist inside a
 * Capacitor WebView on Android. This plugin provides the same two
 * capabilities through Android's real native surfaces instead:
 * `android.print.PrintManager` (driven by a throwaway, off-screen
 * `WebView` loaded with the already-built standalone document, the same
 * way Chrome's own "Print" menu item works) for printing, and
 * `Intent.ACTION_CREATE_DOCUMENT` (the same Storage Access Framework
 * "Save As" picker every other Android app uses) for exporting to a
 * standalone `.html` file the user picks a location for.
 *
 * The caller (`src/workspace/capacitorBridgeImpl.ts`) is responsible for
 * building the actual HTML document (`buildPrintDocument`/
 * `buildExportDocument` in `src/export/`) before calling either method
 * here; this plugin only drives the native chrome around an
 * already-complete document string. Unlike Desktop's HTML export, no
 * `inlineLocalImages` pass is needed first: Android's own `fileSrc`
 * (`FolderAccessPlugin.readFileAsDataUrl`) already returns `data:` URIs
 * for every image the Preview pane renders, so the pane's live
 * `innerHTML` is already fully self-contained.
 */
@CapacitorPlugin(name = "PrintExport")
public class PrintExportPlugin extends Plugin {

    // Held only long enough for PrintManager to read from it; Android's
    // print spooler keeps pulling pages from the adapter asynchronously
    // after this method returns, so the WebView it wraps must not be
    // garbage-collected (or replaced by a second concurrent print) before
    // that finishes. A single in-flight print at a time is an acceptable
    // limit here, the same as the OS print dialog itself only ever shows
    // one job's UI at a time.
    private WebView activePrintWebView;

    // ACTION_CREATE_DOCUMENT's result callback only gets the chosen URI
    // back, not the data to write there, so the HTML built for this
    // specific export call is stashed here across the activity-result
    // round trip. Only one export can be in flight at a time (Capacitor
    // itself only supports one pending activity result per plugin call
    // anyway), so a single field is sufficient, cleared as soon as it is
    // consumed or the export is cancelled.
    private String pendingExportHtml;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        String title = call.getString("title", "Note");

        getActivity().runOnUiThread(() -> {
            AtomicBoolean settled = new AtomicBoolean(false);
            WebView webView = new WebView(getContext());
            activePrintWebView = webView;
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (!settled.compareAndSet(false, true)) return;
                    try {
                        PrintManager printManager =
                            (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            call.reject("Printing is not available on this device.");
                            return;
                        }
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                        printManager.print(title, adapter, new PrintAttributes.Builder().build());
                        call.resolve();
                    } catch (Exception e) {
                        call.reject(e.getMessage(), e);
                    }
                }

                @Override
                public void onReceivedError(
                    WebView view,
                    int errorCode,
                    String description,
                    String failingUrl
                ) {
                    if (!settled.compareAndSet(false, true)) return;
                    call.reject("Could not prepare the note for printing: " + description);
                }
            });
            // A `data:`/base URL-less load, same as the Desktop iframe's
            // own iframeDoc.write(...) of the identical document string
            // built by the shared printNote.ts/exportNoteHtml.ts module;
            // no remote or workspace-relative resource is ever fetched
            // here (see this class's own doc comment on already-inlined
            // images), so no base URL is needed.
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    @PluginMethod
    public void exportHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        String defaultFileName = call.getString("defaultFileName", "note.html");

        pendingExportHtml = html;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/html");
        intent.putExtra(Intent.EXTRA_TITLE, defaultFileName);
        startActivityForResult(call, intent, "exportHtmlResult");
    }

    @ActivityCallback
    private void exportHtmlResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String html = pendingExportHtml;
        pendingExportHtml = null;

        JSObject ret = new JSObject();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || html == null) {
            // A cancelled "Save As" dialog is a normal outcome, not a
            // caller error: the same "user cancelled" contract this
            // plugin's sibling FolderAccessPlugin.pickFolderResult already
            // uses for a cancelled folder pick.
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        Uri targetUri = result.getData().getData();
        if (targetUri == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(targetUri, "wt")) {
            if (out == null) {
                call.reject("Could not open the selected file for writing.");
                return;
            }
            out.write(html.getBytes(StandardCharsets.UTF_8));
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        activePrintWebView = null;
        pendingExportHtml = null;
        super.handleOnDestroy();
    }
}
