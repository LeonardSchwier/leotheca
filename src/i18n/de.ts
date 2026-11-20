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
};
