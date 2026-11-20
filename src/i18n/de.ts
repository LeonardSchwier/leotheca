import type { MessageKey } from "./en";

/** German catalog. Written for this app, informal "du" form. Every key of the
 * English catalog must be present; the compiler enforces it. */
export const de: Record<MessageKey, string> = {
  "welcome.title": "Willkommen bei Leotheca",
  "welcome.chooseFolderHint":
    "Wähle einen Ordner auf deinem Gerät als Hauptarbeitsbereich. Du kannst ihn später in den Einstellungen ändern.",
  "welcome.chooseFolder": "Ordner auswählen",
  "welcome.addWorkspace": "Arbeitsbereich hinzufügen",
  "welcome.openingPicker": "Ordnerauswahl wird geöffnet…",
  "welcome.couldNotOpenFolder":
    "Dieser Ordner konnte nicht geöffnet werden. Versuche es erneut oder wähle einen anderen Ordner.",
  "welcome.relinkFailed":
    "Der Arbeitsbereich konnte nicht neu verknüpft werden. Versuche es erneut.",
  "welcome.relinkConflict":
    "Dieser Ordner wird bereits vom Arbeitsbereich „{name}“ verwendet.",
  "welcome.failedTitle": "„{name}“ konnte nicht geöffnet werden",
  "welcome.failedBody":
    "Der Ordner dieses Arbeitsbereichs wurde möglicherweise verschoben, oder der Zugriff wurde entzogen.",
  "welcome.retry": "Erneut versuchen",
  "welcome.retrying": "Neuer Versuch…",
  "welcome.relink": "Ordner neu verknüpfen",
  "welcome.relinking": "Verknüpfe neu…",
  "welcome.openWorkspace": "Arbeitsbereich öffnen",
  "welcome.orOpenDifferent": "Oder einen anderen Arbeitsbereich öffnen",
  "welcome.recentWorkspaces": "Zuletzt verwendete Arbeitsbereiche",
  "settings.language.label": "Sprache",
  "settings.language.followSystem": "System folgen",
  "sidebar.newNote": "Neue Notiz",
  "sidebar.newFolder": "Neuer Ordner",
  "sidebar.toggleSortOrder": "Sortierung umschalten",
  "sidebar.sortNameAsc": "Sortierung: Name A→Z (Klick für Z→A)",
  "sidebar.sortNameDesc": "Sortierung: Name Z→A (Klick für neueste zuerst)",
  "sidebar.sortNewest": "Sortierung: neueste zuerst (Klick für A→Z)",
  "sidebar.expandAll": "Alle aufklappen",
  "sidebar.expandingAll": "Alle Ordner werden aufgeklappt…",
  "sidebar.searchPlaceholder": "Notizen durchsuchen…",
  "sidebar.searchHelp":
    "tag:name und path:name filtern, ein vorangestelltes - verneint einen Begriff",
  "sidebar.clearSearch": "Suche leeren",
  "sidebar.toggleSearchSort": "Suchsortierung umschalten",
  "sidebar.searchSortRelevance": "Sortierung: Relevanz (Klick für Name)",
  "sidebar.searchSortName": "Sortierung: Name A→Z (Klick für zuletzt geändert)",
  "sidebar.searchSortNewest": "Sortierung: neueste zuerst (Klick für Relevanz)",
  "sidebar.searching": "Notizen werden durchsucht…",
  "sidebar.noMatches": "Keine Treffer.",
  "sidebar.openFailed":
    "„{name}“ konnte nicht geöffnet werden: Möglicherweise wurde die Notiz verschoben, umbenannt oder gelöscht.",
  "sidebar.deletePermanentlyTitle": "Endgültig löschen",
  "sidebar.deletePermanentlyMessage":
    "„{name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.",
  "sidebar.delete": "Löschen",
  "sidebar.create": "Erstellen",
  "sidebar.rename": "Umbenennen",
  "sidebar.noteNamePlaceholder": "notizname",
  "sidebar.folderNamePlaceholder": "ordnername",
  "tabs.pinned": "Angeheftet",
  "tabs.pinnedLabel": "{name} ist angeheftet",
  "tabs.close": "{name} schließen",
  "tabs.rename": "Umbenennen",
  "tabs.moveLeft": "Nach links verschieben",
  "tabs.moveRight": "Nach rechts verschieben",
  "tabs.pin": "Anheften",
  "tabs.unpin": "Anheften aufheben",
  "tabs.unpinAndClose": "Anheften aufheben und schließen",
  "tabs.closeTab": "Schließen",
  "tabs.closeOthers": "Andere schließen",
  "tabs.closeAllUnpinned": "Alle nicht angehefteten schließen",
  "settings.title": "Einstellungen",
  "settings.saving": "Wird gespeichert…",
  "settings.close": "Einstellungen schließen",
  "settings.search.label": "Einstellungen durchsuchen",
  "settings.search.placeholder": "Einstellungen durchsuchen…",
  "settings.search.noMatches": "Keine Einstellung passt zu „{query}“.",
  "settings.nav.label": "Einstellungskategorien",
  "settings.back": "← Zurück",
  "settings.category.general": "Allgemein",
  "settings.category.profiles": "Arbeitsbereichsprofile",
  "settings.category.features": "Funktionen",
  "settings.category.appearance": "Darstellung",
  "settings.category.shortcuts": "Tastenkürzel",
  "settings.category.health": "Zustand",
  "settings.category.about": "Über",
  "settings.section.features": "Funktionsauswahl",
  "settings.section.shortcuts": "Tastenkürzel",
  "settings.option.on": "An",
  "settings.option.off": "Aus",
  "settings.export.failed":
    "Einstellungen konnten nicht exportiert werden: {error}",
  "settings.rootFolder.label": "Stammordner",
  "settings.rootFolder.notSet": "Nicht festgelegt",
  "settings.rootFolder.opening": "Ordnerauswahl wird geöffnet…",
  "settings.rootFolder.change": "Ordner wechseln",
  "settings.externalFileOpen.label":
    "Markdown-Dateien von außerhalb deines Arbeitsbereichs öffnen",
  "settings.externalFileOpen.hint":
    "Leotheca im Dateimanager als „Öffnen mit“-Option für .md-Dateien registrieren",
  "settings.externalFileOpen.search":
    "Leotheca im Dateimanager als „Öffnen mit“-Option für .md-Dateien registrieren",
  "settings.defaultHandler.label":
    "Leotheca zur Standard-App für .md-Dateien machen",
  "settings.defaultHandler.settable":
    "Leotheca ist auf diesem System bereits als „Öffnen mit“-Editor für .md-Dateien registriert. Lege es mit den Schritten für deine Plattform als Standard fest.",
  "settings.defaultHandler.notSettable":
    "Dieses System kennt keine Standard-App pro Dateityp: Wähle Leotheca jedes Mal, wenn du eine .md-Datei öffnest.",
  "settings.saveError.retry": "Erneut versuchen",
  "settings.corrupted.label": "Die Einstellungsdatei enthielt ungültige Daten",
  "settings.corrupted.hint":
    "Einige Werte in der settings.json dieses Arbeitsbereichs konnten nicht gelesen werden, deshalb gelten für sie Standardwerte. Die Originaldatei bleibt unverändert, bis du sie hier neu schreibst.",
  "settings.corrupted.rewrite": "Einstellungsdatei neu schreiben",
  "settings.globalCorrupted.label":
    "Die App-Konfiguration enthielt ungültige Daten",
  "settings.globalCorrupted.hint":
    "Einige gespeicherte App-Einstellungen oder Arbeitsbereichsprofile konnten nicht gelesen werden. Die Originalkonfiguration bleibt unverändert, bis du sie hier neu schreibst.",
  "settings.globalCorrupted.rewrite": "App-Konfiguration neu schreiben",
  "settings.accentColor.label": "Akzentfarbe",
  "settings.accentColor.hint":
    "Ändert Hervorhebungen, ohne die helle oder dunkle Palette zu ersetzen",
  "settings.accentColor.warm": "Nebel",
  "settings.accentColor.ocean": "Ozean",
  "settings.accentColor.forest": "Wald",
  "settings.accentColor.plum": "Pflaume",
  "settings.snippetDefinitions.label": "Textbaustein-Definitionen",
  "settings.snippetDefinitions.hint":
    "Einer pro Zeile: Kürzel, ein Tabulator, dann der Ersatztext",
  "settings.deleteBehavior.label": "Löschverhalten",
  "settings.deleteBehavior.hint":
    "Wohin gelöschte Notizen und Ordner verschoben werden",
  "settings.deleteBehavior.projectTrash": "Papierkorb im Arbeitsbereich",
  "settings.deleteBehavior.permanent": "Endgültig",
  "settings.frontmatterAliases.label": "Frontmatter-Aliasse",
  "settings.frontmatterAliases.hint":
    "Löst [[wikilinks]], Autovervollständigung und Rückverweise auch über das Frontmatter-Feld aliases: einer Notiz auf, nicht nur über ihren Dateinamen",
  "settings.headingLinks.label": "Überschriften-Links",
  "settings.headingLinks.hint":
    "Löst [[Note#Heading]]- und [[#Heading]]-Links zu einer bestimmten Überschrift auf, mit Sprung per Klick in der Vorschau. Ausgeschaltet werden [[wikilinks]] genau wie vor dieser Funktion gelesen",
  "settings.markdownImport.label": "Markdown-Vault-Import",
  "settings.markdownImport.hint":
    "Bietet den Befehl „Import Markdown vault“ an, der einen gewählten Notizordner in diesen Arbeitsbereich kopiert, ohne die Quelle zu ändern. Nur auf dem Desktop",
  "settings.markdownImport.search":
    "Bietet den Befehl „Import Markdown vault“ an, der einen gewählten Notizordner in diesen Arbeitsbereich kopiert, ohne die Quelle zu ändern",
  "settings.mathRendering.label": "Formeldarstellung",
  "settings.mathRendering.hint":
    "Stellt $inline$- und $$block$$-LaTeX-Formeln in der Vorschau mit KaTeX dar",
  "settings.mermaid.label": "Mermaid-Diagramme",
  "settings.mermaid.hint":
    "Stellt ```mermaid```-Codeblöcke in der Vorschau als Diagramme dar",
  "settings.pasteImages.label": "Bilder als Anhänge einfügen",
  "settings.pasteImages.hint":
    "Ein in eine Notiz eingefügtes oder gezogenes Bild wird als Datei gespeichert und verlinkt",
  "settings.attachmentsFolder.label": "Anhangsordner",
  "settings.attachmentsFolder.hint":
    "Wo ein eingefügtes oder gezogenes Bild gespeichert wird; leer heißt neben der Notiz, die es einbettet",
  "settings.attachmentsFolder.placeholder": "neben der Notiz",
  "settings.captureInboxFolder.label": "Eingangsordner der Schnellerfassung",
  "settings.captureInboxFolder.hint":
    "Wo Notizen der Schnellerfassung gespeichert werden, relativ zum Stammordner des Arbeitsbereichs",
  "settings.captureInboxFolder.placeholder": "Eingangsordner",
  "settings.captureInboxNote.label": "Eingangsnotiz der Schnellerfassung",
  "settings.captureInboxNote.hint":
    "Pfad zur Eingangsnotiz für den Anhängemodus, relativ zum Stammordner des Arbeitsbereichs",
  "settings.captureInboxNote.placeholder": "Pfad der Eingangsnotiz",
  "settings.captureDatePattern.label": "Datumsmuster der Schnellerfassung",
  "settings.captureDatePattern.hint":
    "Ziel mit Datumsmuster für neue Erfassungen (z. B. Daily/YYYY-MM-DD.md)",
  "settings.captureDatePattern.search":
    "Ziel mit Datumsmuster für neue Erfassungen (z. B. „Daily/{{date:YYYY-MM-DD}}.md“)",
  "settings.captureDatePattern.placeholder": "z. B. Daily/YYYY-MM-DD.md",
  "settings.customCss.label": "Eigenes CSS",
  "settings.customCss.hint":
    "Schalte es ein und gib eine CSS-Datei im Arbeitsbereich an, um die Stile der App zu überschreiben (z. B. .leotheca/custom.css)",
  "settings.customCss.enabled": "Aktiviert",
  "settings.customCss.disabled": "Deaktiviert",
  "settings.customCssPath.label": "Pfad der CSS-Datei",
  "settings.customCssPath.hint":
    "Pfad zur CSS-Datei, relativ zum Stammordner des Arbeitsbereichs",
  "settings.frontmatterProperties.label":
    "Bereich für Frontmatter-Eigenschaften",
  "settings.frontmatterProperties.hint":
    "Zeigt die Frontmatter-Felder einer Notiz über dem Editor als bearbeitbare Zeilen",
  "settings.spellcheck.label": "Rechtschreibprüfung",
  "settings.spellcheck.hint":
    "Markiert falsch geschriebene Wörter im Editor mit einem lokalen Hunspell-Wörterbuch ({files}); standardmäßig aus, nie mit Netzwerkzugriff",
  "settings.spellcheck.search":
    "Markiert falsch geschriebene Wörter im Editor mit einem lokalen Wörterbuch; standardmäßig aus",
  "settings.templatesFolder.label": "Vorlagenordner",
  "settings.templatesFolder.hint":
    "Wo Vorlagen liegen, relativ zum Stammordner des Arbeitsbereichs",
  "settings.templatesFolder.placeholder": "Vorlagen",
  "settings.accentThemes.label": "Akzentdesigns",
  "settings.accentThemes.hint":
    "Die dezente Akzentfarbe dieses Arbeitsbereichs verwenden",
  "settings.snippets.label": "Textbausteine im Editor",
  "settings.snippets.hint":
    "Tippe ;kürzel und dann Tab, um einen lokalen Textbaustein einzusetzen",
  "settings.canvas.label": "Canvas",
  "settings.canvas.hint": "Lokale Canvas-Dateien erstellen und anzeigen",
  "settings.tags.label": "Tags",
  "settings.tags.hint":
    "Erkennt die #tag-Syntax und das Frontmatter-Feld tags: einer Notiz im Tags-Bereich",
  "settings.templates.label": "Vorlagen",
  "settings.templates.hint":
    "Bietet den Befehl „New note from template“ an, der eine Notiz aus einer Datei im Vorlagenordner beginnt",
  "settings.collections.label": "Sammlungen",
  "settings.collections.hint":
    "Gruppiert Notizen nach einer gespeicherten Suche oder einer eigenen Liste in einem eigenen Bereich. Standardmäßig aus",
  "settings.collections.search":
    "Gruppiert Notizen nach einer gespeicherten Suche oder einer eigenen Liste, standardmäßig aus",
  "settings.profiles.search":
    "Bekannte Arbeitsbereiche umbenennen, kennzeichnen, hinzufügen und vergessen, ohne ihre Dateien zu löschen",
  "settings.theme.label": "Design",
  "settings.theme.followSystem": "System folgen",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.fontSize.label": "Schriftgröße",
  "settings.readingFont.label": "Leseschrift",
  "settings.readingFont.hint":
    "Gilt nur für den Text der Markdown-Vorschau; Quelltext und Code bleiben immer in Festbreitenschrift",
  "settings.readingFont.search": "Schrift für den Text der Markdown-Vorschau",
  "settings.readingFont.sans": "Serifenlos",
  "settings.readingFont.serif": "Mit Serifen",
  "settings.readingFont.mono": "Festbreite",
  "settings.zoom.label": "Zoom",
  "settings.zoom.hint":
    "Skaliert die ganze App; nutze Ctrl+Plus, Ctrl+Minus oder Ctrl+0",
  "settings.viewMode.label": "Standardansicht",
  "settings.viewMode.hint": "Gilt beim Öffnen dieses Arbeitsbereichs",
  "settings.viewMode.source": "Quelltext",
  "settings.viewMode.split": "Geteilt",
  "settings.viewMode.preview": "Vorschau",
  "settings.rtl.label": "RTL-Layout des Arbeitsbereichs",
  "settings.rtl.hint":
    "Spiegelt Seitenleiste, Werkzeugleiste und Tab-Reihenfolge für Schrift von rechts nach links",
  "settings.rtl.search":
    "Spiegelt Seitenleiste, Werkzeugleiste und Tab-Reihenfolge",
  "settings.health.searchDiagnostics": "Linkdiagnose",
  "settings.health.searchBrokenLinks": "defekte oder mehrdeutige Links",
  "settings.version.label": "Version",
  "settings.license.label": "Lizenz",
  "settings.license.view": "Lizenz anzeigen",
  "settings.license.close": "Lizenzansicht schließen",
  "settings.export.label": "Einstellungen exportieren",
  "settings.export.asJson": "Als JSON exportieren",
  "profiles.title": "Arbeitsbereichsprofile",
  "profiles.hint":
    "Benenne bekannte Arbeitsbereiche um und kennzeichne sie. Wenn du ein Profil vergisst, bleiben seine Dateien erhalten.",
  "profiles.current": "{name} (aktuell)",
  "profiles.rename": "Umbenennen",
  "profiles.relink": "Neu verknüpfen",
  "profiles.iconFor": "Symbol für {name}",
  "profiles.forget": "Vergessen",
  "profiles.add": "Arbeitsbereich hinzufügen",
  "profiles.namePrompt": "Name des Arbeitsbereichsprofils",
  "profiles.invalidName":
    "Verwende einen Namen mit 1 bis 80 Zeichen ohne Zeilenumbrüche.",
  "profiles.renameFailed":
    "Das Arbeitsbereichsprofil konnte nicht umbenannt werden. Versuche es erneut.",
  "profiles.updateFailed":
    "Das Arbeitsbereichsprofil konnte nicht aktualisiert werden. Versuche es erneut.",
  "profiles.relinkFailed":
    "Der Arbeitsbereich konnte nicht neu verknüpft werden. Versuche es erneut.",
  "profiles.addFailed":
    "Der Arbeitsbereich konnte nicht hinzugefügt werden. Versuche es erneut.",
  "vault.title": "Arbeitsbereichsstatistik",
  "vault.loading": "Arbeitsbereichsstatistik wird geladen…",
  "vault.loadFailed":
    "Arbeitsbereichsstatistik konnte nicht geladen werden: {error}",
  "vault.folders": "Ordner",
  "vault.notes": "Notizen",
  "vault.images": "Bilder",
  "vault.averageLines": "Durchschnittliche Zeilen pro Notiz",
  "vault.oldest": "Älteste Notiz",
  "vault.newest": "Neueste Notiz",
  "vault.noNotes": "Noch keine Notizen",
  "vault.notAvailable": "Auf dieser Plattform nicht verfügbar",
};
