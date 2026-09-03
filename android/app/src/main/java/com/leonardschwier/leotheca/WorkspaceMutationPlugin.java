package com.leonardschwier.leotheca;

import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Extends the workspace storage plugin with no-replace mutation methods.
 * Registering the subclass under the existing FolderAccess bridge name keeps
 * every workspace URI and cache operation behind one native capability while
 * adding the stricter create and rename contract required by F-004.
 */
@CapacitorPlugin(name = "FolderAccess")
public class WorkspaceMutationPlugin extends FolderAccessPlugin {
    private static final String ALREADY_EXISTS = "already_exists";
    private static final String INVALID_NAME = "invalid_name";
    private static final String PERMISSION_DENIED = "permission_denied";
    private static final String IO_FAILURE = "io_failure";

    private void rejectMutation(PluginCall call, String code, String message) {
        call.reject(code + ": " + message);
    }

    private DocumentFile requireMutationParent(PluginCall call) {
        String parentUri = call.getString("parentUri");
        if (parentUri == null) {
            rejectMutation(call, INVALID_NAME, "parentUri is required");
            return null;
        }
        DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUri));
        if (parent == null || !parent.isDirectory()) {
            rejectMutation(call, IO_FAILURE, "parentUri does not resolve to a directory");
            return null;
        }
        return parent;
    }

    private String requireMutationName(PluginCall call, String key) {
        String name = call.getString(key);
        if (name == null || name.isEmpty() || name.equals(".") || name.equals("..") || name.contains("/")) {
            rejectMutation(call, INVALID_NAME, key + " must be one non-empty path segment");
            return null;
        }
        return name;
    }

    private DocumentFile createFileNew(PluginCall call) {
        DocumentFile parent = requireMutationParent(call);
        String name = requireMutationName(call, "name");
        if (parent == null || name == null) return null;
        if (parent.findFile(name) != null) {
            rejectMutation(call, ALREADY_EXISTS, "target already exists: " + name);
            return null;
        }
        DocumentFile created = parent.createFile("application/octet-stream", name);
        if (created == null) {
            rejectMutation(call, IO_FAILURE, "could not create file: " + name);
            return null;
        }
        // Providers are allowed to uniquify a colliding display name. Never
        // accept that as success: remove the unwanted alternate and surface a
        // collision so the caller can choose a new name deliberately.
        if (!name.equals(created.getName())) {
            created.delete();
            rejectMutation(call, ALREADY_EXISTS, "provider could not create the requested name: " + name);
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
            rejectMutation(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            if (created != null) created.delete();
            rejectMutation(call, IO_FAILURE, error.getMessage() == null ? "file creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void createBinaryFileNew(PluginCall call) {
        String base64Data = call.getString("base64Data");
        if (base64Data == null) {
            rejectMutation(call, INVALID_NAME, "base64Data is required");
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
            rejectMutation(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            if (created != null) created.delete();
            rejectMutation(call, IO_FAILURE, error.getMessage() == null ? "file creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void createDirNew(PluginCall call) {
        try {
            DocumentFile parent = requireMutationParent(call);
            String name = requireMutationName(call, "name");
            if (parent == null || name == null) return;
            if (parent.findFile(name) != null) {
                rejectMutation(call, ALREADY_EXISTS, "target already exists: " + name);
                return;
            }
            DocumentFile created = parent.createDirectory(name);
            if (created == null) {
                rejectMutation(call, IO_FAILURE, "could not create directory: " + name);
                return;
            }
            if (!name.equals(created.getName())) {
                created.delete();
                rejectMutation(call, ALREADY_EXISTS, "provider could not create the requested name: " + name);
                return;
            }
            JSObject result = new JSObject();
            result.put("uri", created.getUri().toString());
            call.resolve(result);
        } catch (SecurityException error) {
            rejectMutation(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            rejectMutation(call, IO_FAILURE, error.getMessage() == null ? "directory creation failed" : error.getMessage());
        }
    }

    @PluginMethod
    public void renamePathNoReplace(PluginCall call) {
        String uri = call.getString("uri");
        String parentUri = call.getString("parentUri");
        String name = requireMutationName(call, "newName");
        if (uri == null || parentUri == null || name == null) {
            if (name != null) rejectMutation(call, INVALID_NAME, "uri and parentUri are required");
            return;
        }
        try {
            DocumentFile parent = DocumentFile.fromTreeUri(getContext(), Uri.parse(parentUri));
            if (parent == null) {
                rejectMutation(call, IO_FAILURE, "parentUri does not resolve to a directory");
                return;
            }
            DocumentFile existing = parent.findFile(name);
            if (existing != null && !existing.getUri().toString().equals(uri)) {
                rejectMutation(call, ALREADY_EXISTS, "target already exists: " + name);
                return;
            }
            Uri renamedUri = DocumentsContract.renameDocument(
                getContext().getContentResolver(),
                Uri.parse(uri),
                name
            );
            if (renamedUri == null) {
                rejectMutation(call, IO_FAILURE, "rename failed");
                return;
            }
            DocumentFile renamed = DocumentFile.fromSingleUri(getContext(), renamedUri);
            if (renamed == null || !name.equals(renamed.getName())) {
                rejectMutation(call, IO_FAILURE, "provider did not preserve the requested target name");
                return;
            }
            JSObject result = new JSObject();
            result.put("uri", renamedUri.toString());
            call.resolve(result);
        } catch (SecurityException error) {
            rejectMutation(call, PERMISSION_DENIED, error.getMessage() == null ? "permission denied" : error.getMessage());
        } catch (Exception error) {
            rejectMutation(call, IO_FAILURE, error.getMessage() == null ? "rename failed" : error.getMessage());
        }
    }
}
