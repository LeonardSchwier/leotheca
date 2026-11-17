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
};
