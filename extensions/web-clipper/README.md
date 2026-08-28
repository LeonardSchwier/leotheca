# Web Clipper

This standalone WebExtension saves the current page selection as an ordinary Markdown file. It does not communicate with the Leotheca application, a server, or any remote service.

## Use

1. Load this directory as an unpacked extension in a compatible browser.
2. Select readable content on an `http` or `https` page.
3. Open the extension, optionally edit the note title and source-link choice, then choose **Save Markdown file**.
4. Choose the folder that Leotheca uses as its workspace in the browser's save dialog.

The extension always uses the browser's save dialog. It never receives unrestricted filesystem access and cannot silently write into a workspace. The optional source link is retained only for `http` and `https` URLs. Page content is converted to Markdown text, never injected as executable page HTML.

The shortcut command is Ctrl+Shift+L where the browser permits that binding.
