# Ausbildungsvergleich

Web-App zum Vergleichen von Weiterbildungen für Architekt:innen BSc FH in der Schweiz: MAS, DAS, CAS, konsekutive Master, eidg. Fachausweise und Zertifikate, schulübergreifend.

## Funktionen

- **Katalog** mit 71 Angeboten von 23 Anbietern, filterbar nach Abschluss, Thema, Kosten, Dauer, Zeitmodell (Teil-/Vollzeit), Unterrichtsform, Ort, Sprache, Schule, Zulassung und Passung
- **Schnellcheck** auf jeder Karte: Dauer und Kosten als Masslinien, Zeitmodell, Form, Ort, Sprache, Zulassung mit FH-Bachelor und «Für dich»-Einschätzung
- **Details** mit Relevanz für Architekt:innen BSc FH, Lerninhalten, Nutzen, Hinweisen und eigener Notiz
- **Baukasten**: stapelbare CAS → MAS als Baum
- **Vergleich** von bis zu drei Angeboten nebeneinander
- **Merkliste und Notizen**: im claude.ai-Artifact privat im Konto gespeichert (auf allen Geräten), sonst im Browser

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seite und Gestaltung |
| `app.js` | Filter, Ansichten, Speicherung |
| `daten/weiterbildungen.js` | Datenbestand (Feldbeschreibung im Dateikopf) |

Lokal öffnen: `index.html` im Browser öffnen. Es ist kein Build nötig.

## Daten aktualisieren

1. Für jeden Eintrag in `daten/weiterbildungen.js` die `url` prüfen und Kosten, Dauer, Start und Zulassung abgleichen.
2. Neue Angebote nach demselben Schema ergänzen. Stapelbare Bausteine verweisen über `teilVon` auf ihr MAS.
3. `stand` auf das Datum der Prüfung setzen. Die App zeigt nach 6 Monaten einen Hinweis «Aktualisierung fällig».
4. Unsichere Angaben im Feld `hinweis` vermerken.

Alle Angaben sind ohne Gewähr. Massgebend ist die Programmseite der jeweiligen Schule.
