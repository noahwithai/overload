# Overload

Gym-Tracker als Web-App fürs iPhone. Sagt dir anhand des letzten Trainings, welches Gewicht und wie viele Wiederholungen pro Satz als Nächstes dran sind.

- Pläne, Trainingstage und Übungen selbst anlegen
- 2 Arbeitssätze pro Übung, Satz 1 zählt für die Steigerung
- Satz 2 wird automatisch leichter, wenn Satz 1 nicht geklappt hat
- Aufwärmsätze werden berechnet (nicht gespeichert)
- Nach jeder Übung: Wie schwer war Satz 1? (Leicht / Gut / Schwer / Am Limit)
- Läuft offline, Daten bleiben nur auf dem Gerät, Backup als Datei

## Installieren (iPhone)

1. Die Seite in **Safari** öffnen.
2. Unten auf **Teilen** tippen → **Zum Home-Bildschirm**.
3. Overload vom Home-Bildschirm starten.

Regelmäßig unter *Einstellungen → Backup exportieren* sichern.

## Entwicklung

Keine Build-Schritte, reines HTML/CSS/JavaScript.

```sh
python3 -m http.server 8000   # http://localhost:8000
node --test tests/            # Tests der Progressionslogik
```

Nach Änderungen `VERSION` in `sw.js` hochzählen, damit installierte Apps das Update laden.
