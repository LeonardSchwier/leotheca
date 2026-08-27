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

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String contents = call.getString("contents", "");
        try {
            Uri targetUri;
            String uriStr = call.getString("uri");
            if (uriStr != null) {
                targetUri = Uri.parse(uriStr);
            } else {
                String parentUriStr = call.getString("parentUri");
                String name = call.getString("name");
                if (parentUriStr == null || name == null) {
                    call.reject("uri, or parentUri and name, is required");
                    return;
                }
                DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUriStr));
                if (parent == null) {
                    call.reject("Invalid parentUri: " + parentUriStr);
                    return;
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
                    call.reject("Could not create file: " + name);
                    return;
                }
                targetUri = file.getUri();
            }
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
