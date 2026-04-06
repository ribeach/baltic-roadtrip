# Baltikum Roadtrip 2026

**https://ribeach.github.io/baltic-roadtrip/**

Statische Website zur Planung eines 17-tägigen Roadtrips durch das Baltikum mit dem VW ID.4.

**Route:** Aalen - Berlin - Danzig - Masuren - Vilnius - Klaipeda - Riga - Tallinn - Helsinki - Turku - Stockholm - Halmstad - Aalen

**Zeitraum:** 30. April - 16. Mai 2026 | **Strecke:** ~4.500 km | **Laender:** 8

## Schnellstart

```bash
# Repository klonen
git clone https://github.com/ribeach/baltic-roadtrip.git
cd baltic-roadtrip

# Dependencies installieren
npm install

# Google Maps API Key setzen (optional - Seite funktioniert auch ohne)
cp .env.example .env
# .env bearbeiten und eigenen API Key eintragen

# Entwicklungsserver starten
npm run dev
```

Die Seite ist dann unter `http://localhost:4321/baltic-roadtrip/` erreichbar.

## Tech Stack

| Technologie | Zweck |
|---|---|
| [Astro 5](https://astro.build) | Static Site Generator (SSG) |
| TypeScript | Typsicherheit |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling |
| React | Google Maps Island-Komponente |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) | Interaktive Karten |
| GitHub Actions | Automatisches Deployment |

## Projektstruktur

```
src/
+-- content/                    # <-- HIER die Reisedaten bearbeiten
|   +-- content.config.ts       # Zod-Schemas (Validierung)
|   +-- days/                   # Ein JSON pro Reisetag
|   |   +-- day-01.json         # Tag 1: Aalen -> Berlin
|   |   +-- day-02.json         # Tag 2: Berlin (1. Mai)
|   |   +-- ...                 # Tag 3-17
|   +-- locations/              # Ein JSON pro Ort
|   |   +-- berlin.json
|   |   +-- gdansk.json
|   |   +-- vilnius.json
|   |   +-- ...                 # 17 Orte insgesamt
|   +-- countries/              # Ein JSON pro Land
|       +-- germany.json
|       +-- poland.json
|       +-- ...                 # 7 Laender insgesamt
+-- components/                 # UI-Komponenten
+-- layouts/                    # Seitenlayout
+-- pages/                      # Seitenrouten
|   +-- index.astro             # Startseite mit Karte + Timeline
|   +-- tag/[dayNumber].astro   # Tagesdetail-Seiten
|   +-- ort/[locationId].astro  # Ortsdetail-Seiten
|   +-- kulinarik.astro         # Kulinarischer Guide
|   +-- praktisches.astro       # Praktische Infos (EV, Maut, etc.)
|   +-- budget.astro            # Budgetplanung
+-- styles/
    +-- global.css              # Tailwind + Custom Styles
```

## Datenstruktur

### Tage (`src/content/days/day-XX.json`)

Jeder Tag hat folgende Felder:

```json
{
  "dayNumber": 1,
  "date": "2026-04-30",
  "title": "Aalen -> Berlin",
  "subtitle": "Der Startschuss faellt",
  "locationId": "berlin",
  "previousLocationId": null,
  "overnightLocationId": "berlin",
  "driving": {
    "distance": "560 km",
    "duration": "5:30",
    "mode": "drive",
    "routeDescription": "Via A7 und A9 nach Berlin"
  },
  "evCharging": {
    "stopsNeeded": 2,
    "notes": "1-2 DC-Stopps entlang der A9",
    "criticalLevel": "green"
  },
  "activities": ["Fruehe Abfahrt aus Aalen", "Ankunft Berlin abends"]
}
```

- **`mode`**: `"drive"`, `"ferry"` oder `"none"` (Aufenthaltstag)
- **`criticalLevel`**: `"green"` (unkritisch), `"yellow"` (vorausplanen), `"red"` (kritisch)

### Orte (`src/content/locations/[id].json`)

Jeder Ort enthaelt Sehenswuerdigkeiten, Restaurants, Hotels, Tipps und Nachtleben mit Google Maps Links.

### Laender (`src/content/countries/[id].json`)

EV-Ladeinfos, Geschwindigkeiten, Maut, Waehrung und kulinarische Highlights pro Land.

## Daten bearbeiten

### Neuen Tag hinzufuegen
1. Kopiere eine bestehende `day-XX.json` Datei
2. Passe `dayNumber`, `date`, `title`, etc. an
3. Stelle sicher, dass die `locationId` auf einen existierenden Ort in `locations/` verweist

### Neuen Ort hinzufuegen
1. Erstelle eine neue JSON-Datei in `src/content/locations/`
2. Folge dem Schema (siehe bestehende Dateien als Vorlage)
3. Die `id` muss eindeutig sein und wird in der URL verwendet (`/ort/[id]`)
4. Jede Sehenswuerdigkeit, Restaurant und Hotel braucht eine `googleMapsUrl`

### Schema-Validierung
Alle Daten werden beim Build automatisch gegen Zod-Schemas validiert. Bei ungueltigen Daten bricht der Build mit einer hilfreichen Fehlermeldung ab.

## Google Maps API Key

Die Karte funktioniert nur mit einem gueltigen Google Maps API Key. Ohne Key wird ein Fallback-Link zu Google Maps angezeigt.

### API Key erstellen
1. Gehe zu [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Erstelle ein neues Projekt oder waehle ein bestehendes
3. Aktiviere die **Maps JavaScript API**
4. Erstelle einen API Key unter "Anmeldedaten"
5. **Wichtig - Key einschraenken:**
   - Anwendungseinschraenkung: **HTTP-Verweis-URLs**
   - Erlaubte URLs: `https://ribeach.github.io/*`
   - API-Einschraenkungen: **Maps JavaScript API** (nur diese)
   - Budget-Warnung einrichten!

### Lokal verwenden
```bash
cp .env.example .env
# .env bearbeiten: PUBLIC_GOOGLE_MAPS_API_KEY=dein-key-hier
```

### Fuer GitHub Pages (Deployment)
1. Gehe zu Repository -> Settings -> Secrets and variables -> Actions
2. Erstelle ein neues Secret: `PUBLIC_GOOGLE_MAPS_API_KEY`
3. Wert: Dein Google Maps API Key

## Deployment

### Automatisch via GitHub Actions

Bei jedem Push auf `main` wird die Seite automatisch gebaut und auf GitHub Pages deployed.

**Voraussetzungen:**
1. Repository -> Settings -> Pages -> Source: **GitHub Actions**
2. Secret `PUBLIC_GOOGLE_MAPS_API_KEY` ist gesetzt (siehe oben)

### Manuell bauen

```bash
npm run build    # Baut die Seite nach ./dist/
npm run preview  # Lokale Vorschau der gebauten Seite
```

## Verfuegbare Seiten

| URL | Inhalt |
|---|---|
| `/` | Startseite mit Routenkarte und Tag-fuer-Tag-Timeline |
| `/tag/1` bis `/tag/17` | Tagesdetail mit Fahrinfo, Aktivitaeten, EV-Ladestrategie |
| `/ort/berlin`, `/ort/tallinn`, etc. | Ortsdetail mit Highlights, Restaurants, Hotels, Tipps |
| `/kulinarik` | Kulinarischer Guide: Must-Try-Gerichte pro Land |
| `/praktisches` | EV-Laden, Faehren, Maut, Geschwindigkeiten, Waehrungen, Wetter |
| `/budget` | Kostenschaetzung pro Person nach Kategorie und Land |
