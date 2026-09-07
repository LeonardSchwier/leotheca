package com.leonardschwier.leotheca;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import android.widget.Toast;

import androidx.documentfile.provider.DocumentFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * F05: Universal Quick Capture - Android Intent Handler
 * Handles Android share intents with proper URI staging before permissions expire
 */
public class CaptureIntentHandler {
    
    private static final String TAG = "LeothecaF05";
    
    // F05 limits
    private static final int MAX_ATTACHMENTS = 10;
    private static final long MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MiB
    private static final long MAX_TOTAL_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100 MiB
    private static final long MAX_PENDING_QUEUE_SIZE = 250 * 1024 * 1024; // 250 MiB
    
    private final Context context;
    private final ExecutorService executorService;
    
    public CaptureIntentHandler(Context context) {
        this.context = context;
        this.executorService = Executors.newSingleThreadExecutor();
    }
    
    /**
     * Process an incoming share intent and stage any URIs before permissions expire
     * F05-FR-04: Android shall accept supported text, URL, single-image, and multi-image share intents
     * F05-FR-05: Android shared URIs shall be staged before transient permission can expire
     */
    public void processShareIntent(Intent intent) {
        String action = intent.getAction();
        String type = intent.getType();
        
        Log.i(TAG, "F05: Processing share intent - action: " + action + ", type: " + type);
        
        // Validate action
        if (!(Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action))) {
            Log.w(TAG, "F05: Unsupported share action: " + action);
            return;
        }
        
        // Validate MIME type
        if (!isSupportedMimeType(type)) {
            Log.w(TAG, "F05: Unsupported MIME type: " + type);
            return;
        }
        
        // Extract text content
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        
        // Extract URIs based on action type
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (streamUri != null) {
                uris.add(streamUri);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            uris = extractMultipleUris(intent);
        }
        
        // Validate URI count
        if (uris.size() > MAX_ATTACHMENTS) {
            Log.w(TAG, "F05: Too many attachments (" + uris.size() + "), maximum is " + MAX_ATTACHMENTS);
            // Show user error about limit
            Toast.makeText(context, "Too many attachments. Maximum is " + MAX_ATTACHMENTS + " files.", Toast.LENGTH_LONG).show();
            return;
        }
        
        // Stage URIs before permissions expire
        if (!uris.isEmpty()) {
            stageUrisForCapture(uris, text, subject);
        } else {
            // No attachments, just text/URL
            queueTextCapture(text, subject);
        }
    }
    
    /**
     * Check if the MIME type is supported for capture
     */
    private boolean isSupportedMimeType(String type) {
        if (type == null) return false;
        
        // Supported text types
        if ("text/plain".equals(type) || type.startsWith("text/")) {
            return true;
        }
        
        // Supported URI list
        if ("text/uri-list".equals(type)) {
            return true;
        }
        
        // Supported image types
        if (type.startsWith("image/")) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Extract URIs from ACTION_SEND_MULTIPLE intent
     */
    private List<Uri> extractMultipleUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        
        try {
            android.content.ClipData clipData = intent.getClipData();
            if (clipData != null) {
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    Uri uri = clipData.getItemAt(i).getUri();
                    if (uri != null) {
                        uris.add(uri);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "F05: Failed to extract multiple URIs");
        }
        
        return uris;
    }
    
    /**
     * Stage URIs to app-private storage before permissions expire
     * F05-FR-05: Native code receives the intent and validates count and declared MIME
     * before data reaches JavaScript. Each URI is streamed into an app-private file.
     */
    private void stageUrisForCapture(List<Uri> uris, String text, String title) {
        Log.i(TAG, "F05: Starting URI staging for " + uris.size() + " URIs");
        
        executorService.execute(() -> {
            List<StagedAttachment> stagedAttachments = new ArrayList<>();
            long totalSize = 0;
            boolean success = true;
            
            try {
                // Create staging directory
                File stagingDir = getStagingDirectory();
                if (!stagingDir.exists()) {
                    stagingDir.mkdirs();
                }
                
                // Stage each URI
                for (Uri uri : uris) {
                    try {
                        StagedAttachment staged = stageSingleUri(uri, stagingDir);
                        if (staged != null) {
                            totalSize += staged.fileSize;
                            
                            // Check total size limit
                            if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
                                Log.w(TAG, "F05: Total attachment size limit exceeded");
                                success = false;
                                break;
                            }
                            
                            stagedAttachments.add(staged);
                        } else {
                            Log.w(TAG, "F05: Failed to stage URI");
                        }
                    } catch (Exception e) {
                        // F05-FR-25/AC-25: never log the exception itself. A ContentResolver
                        // exception for a content:// URI can embed the URI or other
                        // caller-controlled data in its message.
                        Log.e(TAG, "F05: Error staging URI (" + e.getClass().getSimpleName() + ")");
                    }
                }
                
                // Queue the capture with staged data
                if (success && !stagedAttachments.isEmpty()) {
                    queueCaptureWithAttachments(text, title, stagedAttachments);
                } else if (!stagedAttachments.isEmpty()) {
                    // Partial success - queue what we could stage
                    queueCaptureWithAttachments(text, title, stagedAttachments);
                } else {
                    // No attachments could be staged, just queue text if available
                    queueTextCapture(text, title);
                }
                
            } catch (Exception e) {
                Log.e(TAG, "F05: Error during URI staging");
                // Fallback to text-only capture if we have text
                if (text != null && !text.isEmpty()) {
                    queueTextCapture(text, title);
                }
            }
        });
    }
    
    /**
     * Stage a single URI into app-private storage
     * F05-FR-14: Maximum 25 MiB per image, content must be readable through the provided URI
     */
    private StagedAttachment stageSingleUri(Uri uri, File stagingDir) {
        try {
            // Validate MIME type for the URI
            String mimeType = context.getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) {
                Log.w(TAG, "F05: URI has unsupported MIME type: " + mimeType);
                return null;
            }
            
            // Get content stream
            InputStream inputStream = context.getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                Log.w(TAG, "F05: Cannot open input stream for URI");
                return null;
            }
            
            // Check file size first if possible
            long fileSize = getUriSize(uri);
            if (fileSize > MAX_ATTACHMENT_SIZE) {
                Log.w(TAG, "F05: URI exceeds individual attachment size limit");
                inputStream.close();
                return null;
            }
            
            // Generate safe filename
            String originalName = getFileNameFromUri(uri);
            String safeName = sanitizeFileName(originalName);
            String extension = getFileExtension(safeName);
            String baseName = safeName.replace("." + extension, "");
            
            // Generate unique filename with timestamp and random component
            String timestamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            String randomId = java.util.UUID.randomUUID().toString().substring(0, 8);
            String stagedName = "capture-" + timestamp + "-" + randomId + "-" + baseName + "." + extension;
            
            File outputFile = new File(stagingDir, stagedName);
            
            // Stream content to file (bounded)
            FileOutputStream outputStream = new FileOutputStream(outputFile);
            byte[] buffer = new byte[8192]; // 8KB buffer
            int bytesRead;
            long bytesCopied = 0;
            
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
                bytesCopied += bytesRead;
                
                // Check size limit during streaming
                if (bytesCopied > MAX_ATTACHMENT_SIZE) {
                    outputStream.close();
                    inputStream.close();
                    outputFile.delete(); // Clean up partial file
                    Log.w(TAG, "F05: Attachment exceeded size limit during streaming");
                    return null;
                }
            }
            
            outputStream.close();
            inputStream.close();
            
            // Record basic image signature (file size and first few bytes for fingerprinting)
            String fingerprint = generateFileFingerprint(outputFile);
            
            Log.i(TAG, "F05: Successfully staged URI (" + bytesCopied + " bytes)");
            
            return new StagedAttachment(
                outputFile.getAbsolutePath(),
                bytesCopied,
                fingerprint,
                safeName + "." + extension,
                mimeType
            );
            
        } catch (Exception e) {
            // F05-FR-25/AC-25: never log the exception itself, only its type. Provider
            // exceptions for a content:// URI can embed the URI in their message.
            Log.e(TAG, "F05: Failed to stage URI (" + e.getClass().getSimpleName() + ")");
            return null;
        }
    }
    
    /**
     * Get file size from URI if possible
     */
    private long getUriSize(Uri uri) {
        try {
            ParcelFileDescriptor pfd = context.getContentResolver().openFileDescriptor(uri, "r");
            if (pfd != null) {
                long size = pfd.getStatSize();
                pfd.close();
                return size;
            }
        } catch (Exception e) {
            Log.w(TAG, "F05: Cannot get size for URI");
        }
        return 0; // Unknown size
    }
    
    /**
     * Get filename from URI
     */
    private String getFileNameFromUri(Uri uri) {
        try {
            // Try DocumentFile first
            DocumentFile docFile = DocumentFile.fromSingleUri(context, uri);
            if (docFile != null && docFile.getName() != null) {
                return docFile.getName();
            }
            
            // Fallback to last path segment
            String path = uri.getLastPathSegment();
            if (path != null && !path.isEmpty()) {
                return path;
            }
            
            return "unknown-file";
        } catch (Exception e) {
            Log.w(TAG, "F05: Cannot get filename from URI");
            return "unknown-file";
        }
    }
    
    /**
     * Get file extension from filename
     */
    private String getFileExtension(String filename) {
        if (filename == null) return "jpg"; // Default
        int lastDot = filename.lastIndexOf('.');
        if (lastDot > 0 && lastDot < filename.length() - 1) {
            return filename.substring(lastDot + 1).toLowerCase();
        }
        return "jpg"; // Default for images
    }
    
    /**
     * Sanitize filename to be safe for filesystem
     * F05-FR-15: Attachment filenames shall be sanitized
     */
    private String sanitizeFileName(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "capture";
        }
        
        // Remove path separators and control characters
        String sanitized = filename
            .replaceAll("[/\\\\:" + java.util.regex.Pattern.quote("*") + "?\"<>|]", "_")
            .replaceAll("\\p{Cntrl}", ""); // Remove control characters
        
        // Remove bidirectional control characters
        sanitized = sanitized.replaceAll("[\\u202A-\\u202E\\u2066-\\u2069]", "");
        
        // Remove reserved names on Windows
        String[] reservedNames = {"CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"};
        for (String reserved : reservedNames) {
            if (sanitized.equalsIgnoreCase(reserved)) {
                sanitized = "_" + sanitized;
            }
        }
        
        // Remove leading/trailing dots and spaces
        sanitized = sanitized.replaceAll("^[.\\s]+", "").replaceAll("[.\\s]+$", "");
        
        // If empty after sanitization, use default
        if (sanitized.isEmpty()) {
            sanitized = "capture";
        }
        
        // Truncate to reasonable length (max 128 chars)
        if (sanitized.length() > 128) {
            sanitized = sanitized.substring(0, 128);
        }
        
        return sanitized;
    }
    
    /**
     * Generate a simple file fingerprint for retry matching
     * F05-FR-17: Attachment retry shall reuse an existing planned file only when its fingerprint matches
     */
    private String generateFileFingerprint(File file) {
        try {
            // Simple fingerprint based on file size and first few bytes
            long size = file.length();
            byte[] header = new byte[16]; // Read first 16 bytes
            
            try (FileInputStream fis = new FileInputStream(file)) {
                int bytesRead = fis.read(header);
                if (bytesRead < header.length) {
                    // File is smaller than 16 bytes, pad with zeros
                    for (int i = bytesRead; i < header.length; i++) {
                        header[i] = 0;
                    }
                }
            }
            
            // Create hex representation
            StringBuilder fingerprint = new StringBuilder();
            fingerprint.append(size).append("-");
            for (byte b : header) {
                fingerprint.append(String.format("%02x", b));
            }
            
            return fingerprint.toString();
            
        } catch (Exception e) {
            // F05-FR-25/AC-25: log only the exception type, never the exception itself.
            Log.w(TAG, "F05: Failed to generate fingerprint (" + e.getClass().getSimpleName() + ")");
            return "unknown-" + System.currentTimeMillis();
        }
    }
    
    /**
     * Get or create the staging directory for captures
     */
    private File getStagingDirectory() {
        File appFilesDir = context.getFilesDir();
        File captureDir = new File(appFilesDir, "capture-staging");
        return captureDir;
    }
    
    /**
     * Queue a text-only capture
     */
    private void queueTextCapture(String text, String title) {
        Log.i(TAG, "F05: Queueing text capture");
        // Store for TypeScript layer to pick up
        storePendingShareData(text, title, null, null);
    }
    
    /**
     * Queue a capture with staged attachments
     * F05: Now passes attachment metadata to TypeScript layer
     */
    private void queueCaptureWithAttachments(String text, String title, List<StagedAttachment> attachments) {
        Log.i(TAG, "F05: Queueing capture with " + attachments.size() + " attachments");
        
        // Store the text, title, and attachment metadata for TypeScript layer
        storePendingShareData(text, title, attachments);
        
        // Log attachment info for debugging (count only, no filenames for privacy)
        if (attachments != null) {
            Log.i(TAG, "F05: Staged " + attachments.size() + " attachments");
        }
    }
    
    /**
     * Store share data in app preferences so TypeScript layer can access it
     */
    private void storePendingShareData(String text, String title, Uri singleUri, ArrayList<Uri> multipleUris) {
        storePendingShareData(text, title, null);
    }

    /**
     * Store share data with attachments in app preferences so TypeScript layer can access it
     * F05: Handle staged attachments for Android share intent
     */
    private void storePendingShareData(String text, String title, List<StagedAttachment> attachments) {
        try {
            org.json.JSONObject data = new org.json.JSONObject()
                .put("text", text != null ? text : "")
                .put("title", title != null ? title : "");
            
            // Add staged attachment info if we have it
            if (attachments != null && !attachments.isEmpty()) {
                org.json.JSONArray attachmentsArray = new org.json.JSONArray();
                for (StagedAttachment attachment : attachments) {
                    org.json.JSONObject attachmentObj = new org.json.JSONObject()
                        .put("filePath", attachment.filePath)
                        .put("fileName", attachment.fileName)
                        .put("fileSize", attachment.fileSize)
                        .put("fingerprint", attachment.fingerprint)
                        .put("mimeType", attachment.mimeType);
                    attachmentsArray.put(attachmentObj);
                }
                data.put("attachments", attachmentsArray);
            }
            
            android.content.SharedPreferences prefs = context.getSharedPreferences("LeothecaShareData", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("pendingShare", data.toString())
                .putLong("shareTimestamp", System.currentTimeMillis())
                .apply();
            
            Log.i(TAG, "F05: Stored pending share data with " + (attachments != null ? attachments.size() : 0) + " attachments");
        } catch (Exception e) {
            Log.e(TAG, "F05: Failed to store share data");
        }
    }
    
    /**
     * Cleanup method to shut down executor service
     */
    public void shutdown() {
        if (executorService != null) {
            executorService.shutdownNow();
        }
    }
    
    /**
     * Represents a staged attachment file
     */
    private static class StagedAttachment {
        final String filePath;
        final long fileSize;
        final String fingerprint;
        final String fileName;
        final String mimeType;
        
        StagedAttachment(String filePath, long fileSize, String fingerprint, String fileName, String mimeType) {
            this.filePath = filePath;
            this.fileSize = fileSize;
            this.fingerprint = fingerprint;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }
}