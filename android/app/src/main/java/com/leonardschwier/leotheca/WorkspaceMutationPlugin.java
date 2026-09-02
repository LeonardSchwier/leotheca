package com.leonardschwier.leotheca;

import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Native no-replace mutation boundary for brand-new workspace entries.
 *
 * Existing-note saves intentionally stay on FolderAccessPlugin's overwrite
 * methods. This plugin is only for create and rename operations where a
 * collision must fail without modifying the existing target. SAF does not
 * expose a POSIX-style rename-with-flags call, so the provider itself owns
 * the final rename; this boundary checks the destination immediately before
 * that call and verifies the returned document keeps the requested name.
 */
@CapacitorPlugin(name = "WorkspaceMutation")
public class WorkspaceMutationPlugin extends Plugin {
    private static final String ALREADY_EXISTS = "already_exists";
    private static final String INVALID_NAME = "invalid_name";
    private static final String PERMISSION_DENIED = "permission_denied";
    private static final String IO_FAILURE = "io_failure";

    private void reject(PluginCall call, String code, String message) {
        call.reject(code + ": " + message);
    }

    private DocumentFile requireParent(PluginCall call) {
        String parentUri = call.getString("parentUri");
        if (parentUri == null) {
            reject(call, INVALID_NAME, "parentUri is required");
            return null;
        }
        DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUri));
        if (parent == null || !parent.isDirectory()) {
            reject(call, IO_FAILURE, "parentUri does not resolve to a directory");
            return null;
        }
        return parent;
    }

    private String requireName(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.isEmpty() || name.equals(".") || name.equals("..") || name.contains("/")) {
            reject(call, INVALID_NAME, "name must be one non-empty path segment");
            return null;
        }
        return name;
    }

    private DocumentFile createFileNew(PluginCall call) {
        DocumentFile parent = requireParent(call);
        String name = requireName(call);
        if (parent == null || name == null) return null;
        if (parent.findFile(name) != null) {
            reject(call, ALREADY_EXISTS, "target already exists: " + name);
            return null;
        }
        DocumentFile created = parent.createFile("application/octet-stream", name);
        if (created == null) {
            reject(call, IO_FAILURE, "could not create file: " + name);
            return null;
        }
        // Some providers uniquify a colliding display name instead of
        // reporting an error. Treat that as a collision and remove the
        // unwanted alternate file rather than silently returning a path the
        // caller did not request.
        if (!name.equals(created.getName())) {
            created.delete();
            reject(call, ALREADY_EXISTS, "provider could not create the requested name: " + name);
            return null;
        }
        return created;
    }

    @PluginMethod
    public void createTextFileNew(PluginCall call) {
        String contents = call.getString("contents", "");
        DocumentFile created = null;
        try {
            created = createFileNew(call);
            if (created == null) return;
            try (OutputStream out = getContext().getContentResolver().openOutputStream(created.getUri(), "wt")) {
                if (out == null) throw new IllegalStateException("could not open new file for writing");
                out.write(contents.getBytes(StandardCharsets.UTF_8));
            }
            JSObject result = new JSObject();
            result.put("uri", created.getUri().toString());
            call.resolve(result);
        } catch (SecurityException error) {
            if (created != null) created.delete();
            reject(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            if (created != null) created.delete();
            reject(call, IO_FAILURE, error.getMessage() == null ? "file creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void createBinaryFileNew(PluginCall call) {
        String base64Data = call.getString("base64Data");
        if (base64Data == null) {
            reject(call, INVALID_NAME, "base64Data is required");
            return;
        }
        DocumentFile created = null;
        try {
            created = createFileNew(call);
            if (created == null) return;
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(created.getUri(), "wt")) {
                if (out == null) throw new IllegalStateException("could not open new file for writing");
                out.write(bytes);
            }
            JSObject result = new JSObject();
            result.put("uri", created.getUri().toString());
            call.resolve(result);
        } catch (SecurityException error) {
            if (created != null) created.delete();
            reject(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            if (created != null) created.delete();
            reject(call, IO_FAILURE, error.getMessage() == null ? "file creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void createDirNew(PluginCall call) {
        try {
            DocumentFile parent = requireParent(call);
            String name = requireName(call);
            if (parent == null || name == null) return;
            if (parent.findFile(name) != null) {
                reject(call, ALREADY_EXISTS, "target already exists: " + name);
                return;
            }
            DocumentFile created = parent.createDirectory(name);
            if (created == null) {
                reject(call, IO_FAILURE, "could not create directory: " + name);
                return;
            }
            if (!name.equals(created.getName())) {
                created.delete();
                reject(call, ALREADY_EXISTS, "provider could not create the requested name: " + name);
                return;
            }
            JSObject result = new JSObject();
            result.put("uri", created.getUri().toString());
            call.resolve(result);
        } catch (SecurityException error) {
            reject(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            reject(call, IO_FAILURE, error.getMessage() == null ? "directory creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void renamePathNoReplace(PluginCall call) {
        String uri = call.getString("uri");
        String parentUri = call.getString("parentUri");
        String name = call.getString("newName");
        if (uri == null || parentUri == null || name == null || name.isEmpty() || name.contains("/")) {
            reject(call, INVALID_NAME, "uri, parentUri, and one-segment newName are required");
            return;
        }
        try {
            DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUri));
            if (parent == null) {
                reject(call, IO_FAILURE, "parentUri does not resolve to a directory");
                return;
            }
            DocumentFile existing = parent.findFile(name);
            if (existing != null && !existing.getUri().toString().equals(uri)) {
                reject(call, ALREADY_EXISTS, "target already exists: " + name);
                return;
            }
            Uri renamedUri = DocumentsContract.renameDocument(
                getContext().getContentResolver(),
                Uri.parse(uri),
                name
            );
            if (renamedUri == null) {
                reject(call, IO_FAILURE, "rename failed");
                return;
            }
            DocumentFile renamed = DocumentFile.fromSingleUri(getContext(), renamedUri);
            if (renamed == null || !name.equals(renamed.getName())) {
                reject(call, IO_FAILURE, "provider did not preserve the requested target name");
                return;
            }
            JSObject result = new JSObject();
            result.put("uri", renamedUri.toString());
            call.resolve(result);
        } catch (SecurityException error) {
            reject(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            reject(call, IO_FAILURE, error.getMessage() == null ? "rename failed" : error.getMessage());
        }
    }
}
