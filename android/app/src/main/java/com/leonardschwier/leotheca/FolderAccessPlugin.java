package com.leonardschwier.leotheca;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Storage Access Framework bridge for the Android workspace folder. There is
 * no mature, current Capacitor plugin for persistable SAF folder access as
 * of this writing (Capacitor's own Filesystem plugin explicitly does not
 * support it since Android 11), so this is a small purpose-built plugin
 * rather than a third-party dependency. Every method operates on
 * content:// URIs (opaque strings from the caller's point of view); the
 * TypeScript side, src/workspace/capacitorBridgeImpl.ts, is responsible for
 * mapping those onto the plain path strings the rest of the app uses.
 */
@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            ret.put("uri", JSObject.NULL);
            call.resolve(ret);
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            ret.put("uri", JSObject.NULL);
            call.resolve(ret);
            return;
        }
        try {
            // Unlike every other method here, this wasn't wrapped in a
            // try/catch: a handful of storage providers return a tree URI
            // that doesn't support persistable permissions, and this call
            // throws a SecurityException for those. Uncaught, that crashed
            // the app outright on folder selection instead of surfacing a
            // clear "couldn't use that folder" error back to the caller.
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            ret.put("uri", treeUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listDir(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null || !dir.isDirectory()) {
                dir = DocumentFile.fromSingleUri(getContext(), Uri.parse(uriStr));
            }
            if (dir == null || !dir.isDirectory()) {
                call.reject("Not a directory: " + uriStr);
                return;
            }
            JSArray entries = new JSArray();
            for (DocumentFile child : dir.listFiles()) {
                String name = child.getName();
                if (name == null) continue;
                JSObject entry = new JSObject();
                entry.put("name", name);
                entry.put("uri", child.getUri().toString());
                boolean isDir = child.isDirectory();
                entry.put("isDir", isDir);
                if (!isDir) {
                    // 0 means "not supported by this provider" per
                    // DocumentFile's own contract, not a real timestamp;
                    // only include a value the mtime-cache logic in
                    // linking/store.ts can actually trust.
                    long mtime = child.lastModified();
                    if (mtime > 0) {
                        entry.put("mtime", mtime);
                    }
                }
                entries.put(entry);
            }
            JSObject ret = new JSObject();
            ret.put("entries", entries);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * A shared depth cap for the recursive walk below, matching
     * MAX_WALK_DEPTH in src/workspace/types.ts and commands.rs (a constant
     * can't cross the Capacitor bridge any more than it can cross Tauri's
     * IPC boundary, hence three separate copies). Guards against a symlink
     * inside a workspace pointing back at one of its own ancestors; SAF
     * exposes no canonical-path/cycle-detection primitive to do better than
     * a plain depth cap here either.
     */
    private static final int MAX_WALK_DEPTH = 40;

    private static boolean isImageName(String name) {
        String lower = name.toLowerCase();
        return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            || lower.endsWith(".gif") || lower.endsWith(".webp") || lower.endsWith(".svg")
            || lower.endsWith(".bmp") || lower.endsWith(".ico");
    }

    private void walkForMarkdownFiles(
        DocumentFile dir,
        String relativePrefix,
        int depth,
        JSArray markdownFiles,
        int[] folderCount,
        int[] imageCount
    ) {
        for (DocumentFile child : dir.listFiles()) {
            String name = child.getName();
            if (name == null || name.startsWith(".")) continue;

            if (child.isDirectory()) {
                folderCount[0]++;
                if (depth < MAX_WALK_DEPTH) {
                    walkForMarkdownFiles(
                        child,
                        relativePrefix.isEmpty() ? name : relativePrefix + "/" + name,
                        depth + 1,
                        markdownFiles,
                        folderCount,
                        imageCount
                    );
                }
            } else if (name.toLowerCase().endsWith(".md")) {
                JSObject entry = new JSObject();
                entry.put("relativePath", relativePrefix.isEmpty() ? name : relativePrefix + "/" + name);
                entry.put("uri", child.getUri().toString());
                long mtime = child.lastModified();
                if (mtime > 0) {
                    entry.put("mtime", mtime);
                }
                markdownFiles.put(entry);
            } else if (isImageName(name)) {
                imageCount[0]++;
            }
        }
    }

    /**
     * Recursively finds every markdown file under `uri`, plus the folder
     * and image counts along the way, in a single plugin call, instead of
     * one `listDir` bridge round trip per directory. The JS/native
     * Capacitor bridge call itself is the dominant cost of a naive
     * recursive walk (confirmed on a real ~580-note SAF-backed vault,
     * session 53: 90+ seconds for the old per-directory approach), not the
     * underlying SAF queries, so batching the whole recursion into one
     * native call removes that overhead. Backs both
     * capacitorBridgeImpl.ts's findMarkdownFiles (used by
     * linking/store.ts's rebuildLinkIndex) and its getWorkspaceStats.
     */
    @PluginMethod
    public void findMarkdownFiles(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null || !dir.isDirectory()) {
                dir = DocumentFile.fromSingleUri(getContext(), Uri.parse(uriStr));
            }
            if (dir == null || !dir.isDirectory()) {
                call.reject("Not a directory: " + uriStr);
                return;
            }
            JSArray markdownFiles = new JSArray();
            int[] folderCount = { 0 };
            int[] imageCount = { 0 };
            walkForMarkdownFiles(dir, "", 0, markdownFiles, folderCount, imageCount);

            JSObject ret = new JSObject();
            ret.put("markdownFiles", markdownFiles);
            ret.put("folderCount", folderCount[0]);
            ret.put("imageCount", imageCount[0]);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    private void walkForAllFiles(
        DocumentFile dir,
        String relativePrefix,
        int depth,
        JSArray files
    ) {
        for (DocumentFile child : dir.listFiles()) {
            String name = child.getName();
            if (name == null || name.startsWith(".")) continue;

            if (child.isDirectory()) {
                if (depth < MAX_WALK_DEPTH) {
                    walkForAllFiles(
                        child,
                        relativePrefix.isEmpty() ? name : relativePrefix + "/" + name,
                        depth + 1,
                        files
                    );
                }
            } else {
                JSObject entry = new JSObject();
                entry.put("relativePath", relativePrefix.isEmpty() ? name : relativePrefix + "/" + name);
                entry.put("uri", child.getUri().toString());
                long mtime = child.lastModified();
                if (mtime > 0) {
                    entry.put("mtime", mtime);
                }
                // For runSearch's content-read batching (see
                // fileTreeStore.ts's SEARCH_BATCH_MAX_BYTES): a batch bounded
                // only by file count still let a handful of unusually large
                // files produce one native call's JSON response too large to
                // allocate, confirmed by a real on-device OutOfMemoryError,
                // 2026-08-28. child.length() is already a cheap DocumentFile
                // field, not an extra query.
                entry.put("size", child.length());
                files.put(entry);
            }
        }
    }

    /**
     * Same one-native-call recursive walk as findMarkdownFiles above, but
     * with no ".md" filter: every non-hidden file of any extension, for
     * full-text search (fileTreeStore.ts's runSearch), which needs to match
     * images and other attachments by name too, not just notes. Before this
     * existed, runSearch did its own recursive walk via repeated listDir
     * plugin calls, one per directory: on a real ~500-note SAF-backed
     * vault this didn't just run slowly (the same per-directory IPC cost
     * findMarkdownFiles's doc comment above measured), it actually crashed
     * the app with an OutOfMemoryError partway through (confirmed
     * on-device, 2026-08-28), which a single-call native walk avoids the
     * same way findMarkdownFiles already does for the link index.
     */
    @PluginMethod
    public void findAllFiles(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null || !dir.isDirectory()) {
                dir = DocumentFile.fromSingleUri(getContext(), Uri.parse(uriStr));
            }
            if (dir == null || !dir.isDirectory()) {
                call.reject("Not a directory: " + uriStr);
                return;
            }
            JSArray files = new JSArray();
            walkForAllFiles(dir, "", 0, files);

            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readTextFile(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(uriStr))) {
            if (input == null) {
                call.reject("Could not open " + uriStr);
                return;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            JSObject ret = new JSObject();
            ret.put("content", buffer.toString("UTF-8"));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** Reads one file's content, or returns null instead of throwing on any
     * failure (unreadable, deleted mid-batch, not valid UTF-8): shared by
     * readTextFilesBatch below, where one bad file in a batch of many can't
     * reasonably fail the whole batch, the same tolerance readTextFile's own
     * callers already apply per-file one call at a time. */
    private String readOneFileOrNull(String uriStr) {
        try (InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(uriStr))) {
            if (input == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Reads multiple files' contents in one native call, for full-text
     * search's content-fallback (fileTreeStore.ts's runSearch), which
     * otherwise needs one native call per file whose name doesn't match
     * the query. On a real ~500-note vault this call-per-file pattern
     * exhausted the app's Java heap with an OutOfMemoryError after
     * roughly 1700 sequential Capacitor plugin calls, confirmed
     * on-device 2026-08-28, even after the separate directory-walk crash
     * (findAllFiles, added the same day) was fixed: fewer, larger native
     * calls bound the total call count regardless of vault size, the
     * same reasoning as findAllFiles itself, just applied to content
     * reads instead of the walk.
     */
    @PluginMethod
    public void readTextFilesBatch(PluginCall call) {
        JSArray uris = call.getArray("uris");
        if (uris == null) {
            call.reject("uris is required");
            return;
        }
        try {
            JSArray contents = new JSArray();
            for (int i = 0; i < uris.length(); i++) {
                String content = readOneFileOrNull(uris.getString(i));
                contents.put(content == null ? JSONObject.NULL : content);
            }
            JSObject ret = new JSObject();
            ret.put("contents", contents);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * Resolves the target URI for a write call: either the `uri` param
     * directly (an existing file already known to the caller), or, given
     * `parentUri` and `name`, an existing child with that name or a newly
     * created one. Shared by writeTextFile and writeBinaryFile, which
     * only differ in what bytes they write once they have this target.
     */
    private Uri resolveOrCreateTargetUri(PluginCall call) throws Exception {
        String uriStr = call.getString("uri");
        if (uriStr != null) {
            return Uri.parse(uriStr);
        }
        String parentUriStr = call.getString("parentUri");
        String name = call.getString("name");
        if (parentUriStr == null || name == null) {
            throw new IllegalArgumentException("uri, or parentUri and name, is required");
        }
        DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUriStr));
        if (parent == null) {
            throw new IllegalArgumentException("Invalid parentUri: " + parentUriStr);
        }
        DocumentFile existing = parent.findFile(name);
        // "application/octet-stream" is deliberate, not a placeholder: SAF
        // providers resolve a canonical extension from the given mime type
        // and silently append it to the display name if missing. That was
        // "text/markdown" here, harmless for note names (already end in
        // .md) but silently turned this app's own "settings.json" and
        // "bookmarks.json" into "settings.json.md" on disk, and since a
        // later write's findFile("settings.json") then never matched that,
        // every save created a fresh duplicate instead of overwriting.
        // octet-stream has no canonical extension, so the name we pass is
        // created verbatim.
        DocumentFile file = existing != null ? existing : parent.createFile("application/octet-stream", name);
        if (file == null) {
            throw new IllegalArgumentException("Could not create file: " + name);
        }
        return file.getUri();
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String contents = call.getString("contents", "");
        try {
            Uri targetUri = resolveOrCreateTargetUri(call);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(targetUri, "wt")) {
                if (out == null) {
                    call.reject("Could not open " + targetUri + " for writing");
                    return;
                }
                out.write(contents.getBytes(StandardCharsets.UTF_8));
            }
            JSObject ret = new JSObject();
            ret.put("uri", targetUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * Same as writeTextFile, but for binary content (a pasted or dropped
     * image attachment): the frontend base64-encodes the bytes to cross
     * the Capacitor plugin call boundary (see
     * src/workspace/capacitorBridgeImpl.ts's writeBinaryFile), and this
     * decodes them back before writing, the same convention
     * readFileAsDataUrl already uses in the opposite direction below.
     */
    @PluginMethod
    public void writeBinaryFile(PluginCall call) {
        String base64Data = call.getString("base64Data");
        if (base64Data == null) {
            call.reject("base64Data is required");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            Uri targetUri = resolveOrCreateTargetUri(call);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(targetUri, "wt")) {
                if (out == null) {
                    call.reject("Could not open " + targetUri + " for writing");
                    return;
                }
                out.write(bytes);
            }
            JSObject ret = new JSObject();
            ret.put("uri", targetUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void createDir(PluginCall call) {
        String parentUriStr = call.getString("parentUri");
        String name = call.getString("name");
        if (parentUriStr == null || name == null) {
            call.reject("parentUri and name are required");
            return;
        }
        try {
            DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUriStr));
            if (parent == null) {
                call.reject("Invalid parentUri: " + parentUriStr);
                return;
            }
            DocumentFile existing = parent.findFile(name);
            DocumentFile dir = existing != null ? existing : parent.createDirectory(name);
            if (dir == null) {
                call.reject("Could not create directory: " + name);
                return;
            }
            JSObject ret = new JSObject();
            ret.put("uri", dir.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void renamePath(PluginCall call) {
        String uriStr = call.getString("uri");
        String newName = call.getString("newName");
        if (uriStr == null || newName == null) {
            call.reject("uri and newName are required");
            return;
        }
        try {
            Uri newUri = DocumentsContract.renameDocument(getContext().getContentResolver(), Uri.parse(uriStr), newName);
            if (newUri == null) {
                call.reject("Rename failed for " + uriStr);
                return;
            }
            JSObject ret = new JSObject();
            ret.put("uri", newUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void movePath(PluginCall call) {
        String uriStr = call.getString("uri");
        String fromParentUriStr = call.getString("fromParentUri");
        String toParentUriStr = call.getString("toParentUri");
        if (uriStr == null || fromParentUriStr == null || toParentUriStr == null) {
            call.reject("uri, fromParentUri, and toParentUri are required");
            return;
        }
        try {
            Uri newUri = DocumentsContract.moveDocument(
                getContext().getContentResolver(),
                Uri.parse(uriStr),
                Uri.parse(fromParentUriStr),
                Uri.parse(toParentUriStr)
            );
            if (newUri == null) {
                call.reject("Move failed for " + uriStr);
                return;
            }
            JSObject ret = new JSObject();
            ret.put("uri", newUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deletePath(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            boolean deleted = DocumentsContract.deleteDocument(getContext().getContentResolver(), Uri.parse(uriStr));
            if (!deleted) {
                call.reject("Delete failed for " + uriStr);
                return;
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readFileAsDataUrl(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null) mime = "application/octet-stream";
            try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) {
                    call.reject("Could not open " + uriStr);
                    return;
                }
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int read;
                while ((read = input.read(chunk)) != -1) {
                    buffer.write(chunk, 0, read);
                }
                String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
                JSObject ret = new JSObject();
                ret.put("dataUrl", "data:" + mime + ";base64," + base64);
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }
}
