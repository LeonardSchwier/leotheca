// LeothecaMarkdownQLPreviewGenerator.m
// macOS Quick Look preview generator for Markdown files.
//
// Usage: ⌥-click a .md file in Finder to preview it without opening the app.
// The generator reads the .md file, converts it to a styled HTML string,
// and renders it into a CGImage using WebKit.
//
// Build:
//   xcodebuild -project LeothecaQuickLook.xcodeproj -scheme "Leotheca Markdown QL" \
//     CONFIGURATION=Release
//   (or: see scripts/build-quicklook.sh for a one-command build)
//
// Install into the Leotheca.app bundle:
//   scripts/install-quicklook.sh
//
// The resulting .qlgenerator bundle is placed at:
//   Leotheca.app/Contents/PlugIns/LeothecaMarkdown.qlgenerator

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface LeothecaMarkdownQL : NSObject <QLPreviewGenerator>
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) WKUserContentController *contentController;
@end

@implementation LeothecaMarkdownQL

- (instancetype)init {
    self = [super init];
    if (self) {
        _webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
        _webView.configuration = [WKWebViewConfiguration new];
        _contentController = [WKUserContentController new];
        _webView.configuration.userContentController = _contentController;
    }
    return self;
}

// QLPreviewGenerator protocol: the system calls this to know which types we handle.
- (NSString *)defaultFilenameExtension {
    return @"md";
}

// The system calls generatePreviewForURL: with a QLPreviewGenerationContext.
// The context provides:
//   context.previewSize — the size Finder wants the preview at
//   context.cancel — a flag the system sets when the user dismisses the preview
//   context.progress — a block to report progress (optional)
//   context.completionHandler — the block to call when done, passing a CGImageRef

- (void)generatePreviewForURL:(NSURL *)url
               previewContext:(QLPreviewGenerationContext *)context {

    CGSize previewSize = context.previewSize;
    // Cap the preview at a reasonable size
    CGFloat maxWidth = 800;
    CGFloat maxHeight = 600;
    if (previewSize.width > maxWidth) previewSize.width = maxWidth;
    if (previewSize.height > maxHeight) previewSize.height = maxHeight;

    // Read the file
    NSData *fileData = [NSData dataWithContentsOfFile:url.path];
    if (!fileData || [context.cancel load]) {
        context.completionHandler(nil, nil);
        return;
    }

    NSString *markdown = [[NSString alloc] initWithData:fileData encoding:NSUTF8StringEncoding];
    if (!markdown) {
        // Fallback: plain text preview
        [self renderPlainText:markdown previewSize:previewSize context:context];
        return;
    }

    // Check if file is too large for Quick Look (1 MB limit)
    if (fileData.length > 1024 * 1024) {
        [self renderPlainText:markdown previewSize:previewSize context:context];
        return;
    }

    // Convert markdown to HTML using a lightweight parser.
    // We embed a minimal markdown-to-HTML converter in the generated HTML
    // using JavaScript (marked.js is bundled as a string constant).
    NSString *html = [self markdownToHTML:markdown];

    // Render the HTML in a WKWebView and capture the result as a CGImage
    __weak typeof(self) weakSelf = self;
    [self.webView evaluateJavaScript:@"document.readyState" completionHandler:^(id state, NSError *error) {
        if (error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                context.completionHandler(nil, nil);
            });
            return;
        }

        // Set the HTML content
        [weakSelf.webView loadHTMLString:html baseURL:nil];

        // Wait for the web view to finish loading, then capture
        [weakSelf.webView evaluateJavaScript:@"document.readyState" completionHandler:^(id readyState, NSError *loadError) {
            if (loadError || [readyState isEqualToString:@"loading"]) {
                // Give it a moment to finish
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    [weakSelf captureImage:previewSize context:context];
                });
                return;
            }
            [weakSelf captureImage:previewSize context:context];
        }];
    }];
}

- (void)captureImage:(CGSize)size context:(QLPreviewGenerationContext *)context {
    __weak typeof(self) weakSelf = self;
    // Use WKSnapshot for a high-quality capture
    [self.webView takeSnapshotWithConfiguration:[WKSnapshotConfiguration new] completionHandler:^(UIImage *snapshot, WKSnapshotError *error) {
        if (!snapshot || [context.cancel load]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                context.completionHandler(nil, nil);
            });
            return;
        }

        // Scale to the requested preview size
        UIGraphicsBeginImageContextWithOptions(size, YES, 0.0);
        CGContextRef ctx = UIGraphicsGetCurrentContext();
        [snapshot drawInRect:(CGRect){0, 0, size.width, size.height}];
        CGImageRef imageRef = CGBitmapContextCreateImage(ctx);
        UIGraphicsEndImageContext();

        dispatch_async(dispatch_get_main_queue(), ^{
            context.completionHandler(imageRef, nil);
            // Release the image after the system has consumed it
            CFRelease(imageRef);
        });
    }];
}

- (void)renderPlainText:(NSString *)text previewSize:(CGSize)size context:(QLPreviewGenerationContext *)context {
    // Simple fallback: render plain text as a preview
    NSString *escaped = [text stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
    NSString *html = [NSString stringWithFormat:
        @"<html><head><style>"
        @"body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;padding:16px;max-width:%.0fpx;}"
        @"pre{white-space:pre-wrap;word-wrap:break-word;}"
        @"</style></head><body><pre>%@</pre></body></html>",
        size.width, escaped];

    [self.webView loadHTMLString:html baseURL:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self captureImage:size context:context];
    });
}

// A lightweight markdown-to-HTML converter.
// Handles: headings, bold, italic, code blocks, inline code, links,
// unordered lists, horizontal rules, and paragraphs.
// This is intentionally simple — for complex markdown (tables, math,
// diagrams), the user should open the file in Leotheca proper.
- (NSString *)markdownToHTML:(NSString *)markdown {
    // Escape HTML entities first
    NSString *escaped = [markdown stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
    escaped = [escaped stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];

    // Code blocks (```...```)
    escaped = [escaped stringByReplacingOccurrencesOfString:@"```([^`]*)```"
                                                  withString:@"<pre><code>$1</code></pre>"
                                                    options:NSRegularExpressionSearch
                                                      range:NSMakeRange(0, escaped.length)];

    // Inline code
    escaped = [escaped stringByReplacingOccurrencesOfString:@"`([^`]+)`"
                                                  withString:@"<code>$1</code>"
                                                    options:NSRegularExpressionSearch
                                                      range:NSMakeRange(0, escaped.length)];

    // Headings (### → h3, ## → h2, # → h1)
    escaped = [escaped stringByReplacingOccurrencesOfString:@"^(###) (.*)$"
                                                  withString:@"<h3>$2</h3>"
                                                    options:(NSRegularExpressionSearch | NSRegularExpressionAnchorsMatchLines)
                                                      range:NSMakeRange(0, escaped.length)];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"^(##) (.*)$"
                                                  withString:@"<h2>$2</h2>"
                                                    options:(NSRegularExpressionSearch | NSRegularExpressionAnchorsMatchLines)
                                                      range:NSMakeRange(0, escaped.length)];
    escaped = [escaped stringByReplacingOccurrencesOfString:@"^(#) (.*)$"
                                                  withString:@"<h1>$2</h1>"
                                                    options:(NSRegularExpressionSearch | NSRegularExpressionAnchorsMatchLines)
                                                      range:NSMakeRange(0, escaped.length)];

    // Bold
    escaped = [escaped stringByReplacingOccurrencesOfString:@"\\*\\*(.+?)\\*\\*"
                                                  withString:@"<strong>$1</strong>"
                                                    options:NSRegularExpressionSearch
                                                      range:NSMakeRange(0, escaped.length)];

    // Italic (single asterisks, but not double)
    escaped = [escaped stringByReplacingOccurrencesOfString:@"(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)"
                                                  withString:@"<em>$1</em>"
                                                    options:NSRegularExpressionSearch
                                                      range:NSMakeRange(0, escaped.length)];

    // Links [text](url)
    escaped = [escaped stringByReplacingOccurrencesOfString:@"\\[(.+?)\\]\\((.+?)\\)"
                                                  withString:@"<a href=\"$2\">$1</a>"
                                                    options:NSRegularExpressionSearch
                                                      range:NSMakeRange(0, escaped.length)];

    // Unordered list items (- or *)
    escaped = [escaped stringByReplacingOccurrencesOfString:@"^[-*] (.*)$"
                                                  withString:@"<li>$1</li>"
                                                    options:(NSRegularExpressionSearch | NSRegularExpressionAnchorsMatchLines)
                                                      range:NSMakeRange(0, escaped.length)];

    // Horizontal rules
    escaped = [escaped stringByReplacingOccurrencesOfString:@"^(-{3,}|\\*{3,}|_{3,})$"
                                                  withString:@"<hr>"
                                                    options:(NSRegularExpressionSearch | NSRegularExpressionAnchorsMatchLines)
                                                      range:NSMakeRange(0, escaped.length)];

    // Paragraphs (wrap remaining text)
    NSArray<NSString *> *paragraphs = [escaped componentsSeparatedByString:@"\n\n"];
    NSMutableString *body = [NSMutableString string];
    for (NSString *para in paragraphs) {
        NSString *trimmed = [para stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (trimmed.length == 0) continue;
        if ([trimmed hasPrefix:@"<"] && ([trimmed containsString:@"</h1>"] || [trimmed containsString:@"</h2>"] ||
            [trimmed containsString:@"</h3>"] || [trimmed containsString:@"</pre>"] ||
            [trimmed containsString:@"<li>"] || [trimmed containsString:@"<hr>"])) {
            [body appendString:trimmed];
        } else {
            // Replace single newlines within a paragraph with <br>
            NSString *inline = [trimmed stringByReplacingOccurrencesOfString:@"\n" withString:@"<br>"];
            [body appendFormat:@"<p>%@</p>", inline];
        }
        [body appendString:@"\n"];
    }

    return [NSString stringWithFormat:
        @"<html><head><style>"
        @"body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        @"font-size:14px;line-height:1.6;padding:20px;max-width:800px;color:#333;}"
        @"h1{font-size:1.8em;margin:0.5em 0 0.3em;border-bottom:1px solid #eee;padding-bottom:0.2em;}"
        @"h2{font-size:1.5em;margin:0.5em 0 0.3em;}"
        @"h3{font-size:1.2em;margin:0.4em 0 0.2em;}"
        @"p{margin:0.6em 0;}"
        @"code{background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:0.9em;}"
        @"pre{background:#f4f4f4;padding:12px;border-radius:5px;overflow-x:auto;}"
        @"pre code{background:none;padding:0;}"
        @"a{color:#0366d6;text-decoration:none;}"
        @"a:hover{text-decoration:underline;}"
        @"li{margin:0.2em 0;}"
        @"hr{border:none;border-top:1px solid #ddd;margin:1em 0;}"
        @"mark{background:#fff9c4;padding:1px 2px;}"
        @"</style></head><body>%@</body></html>",
        body];
}

@end
