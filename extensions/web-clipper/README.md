# Web Clipper

A small, standalone WebExtension (Manifest V3) that saves the text you have selected on a web page as an ordinary Markdown file. It has no connection to the Leotheca application: the only thing it produces is a `.md` file that you save into your workspace folder yourself.

## What it does and does not do

- Converts the selection (headings, paragraphs, bold, italic, inline code, lists, `http`/`https` links) to Markdown text. Scripts, styles, images and non-web links are dropped, never copied as HTML.
- Writes the file through the browser's own **Save as** dialog (`downloads` API with `saveAs: true`). You choose the folder, so to add a clip to a workspace, pick that workspace folder. The extension cannot write into a folder silently and has no filesystem access of its own.
- Optionally ends the file with `Source: <page address>`; untick **Include source link** to leave it out.
- Makes no network requests of its own, has no analytics or accounts, and does not talk to Leotheca. Permissions are `activeTab` and `downloads`; a content script is registered for `http` and `https` pages so it can read your current selection when you ask for a clip. Nothing is read or sent until you press the button or shortcut.
- Does not work on browser-internal pages (`about:`, `chrome://`, extension stores) or on a selection that contains no readable text; the popup shows a message instead.

## Install

Requires Chrome or Chromium (tested in Chromium; other Chromium browsers should behave the same), or Firefox 142 or newer.

**Chrome / Chromium**

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Choose **Load unpacked** and select the `extensions/web-clipper` folder of this repository.
3. Pin the extension from the puzzle-piece menu if you want its button on the toolbar.

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on...** and select `extensions/web-clipper/manifest.json`.
3. A temporary add-on is removed when Firefox quits; load it again next session. There is no signed build yet.

## Use

1. Select text on a page.
2. Click the extension button, optionally edit the note title, and choose **Save Markdown file**; or press **Ctrl+Shift+L** (the shortcut uses the page title and always includes the source link; you can rebind it in `chrome://extensions/shortcuts` or Firefox's add-on manager).
3. In the save dialog choose your workspace folder. The file is named after the title, for example `My clip.md`.

## How it was tested

- `npx vitest run extensions/web-clipper` covers the Markdown conversion (`clipperCore.test.js`) and the message protocol between popup, content script and background script (`messaging.test.js`).
- Loaded unpacked into Playwright Chromium: selecting text on a local page, running the popup flow and receiving the downloaded file produced `# My clip`, the converted heading, bold text, list and `Source:` line, dropped a `javascript:` link, and issued no request to any host other than the page itself.
- Loaded as a temporary add-on in Firefox 156 (`web-ext run`): installed without a manifest error. The clip itself was not driven in Firefox.
