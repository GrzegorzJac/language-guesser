# Language Guesser

Interaktywna mapa świata pokazująca strefy językowe. Kliknij w dowolne miejsce na mapie, aby zobaczyć jakie języki są tam używane.

## Szybki start

```bash
# 1. Rozpakuj dane Glottography do data/glottography/
node scripts/extract-glottography.js

# 2. Zbuduj languages.generated.js
node scripts/build-languages.js

# 3. Otwórz index.html w przeglądarce
```

## Architektura

```
                  glottography_asher_data/
                  (Asher & Moseley 2007, ~4189 języków)
                           │
                  extract-glottography.js    ← Krok 1
                           │
                           ▼
     data/                                   ← Źródło prawdy
     ├── countries/*.geojson       (ręczne)
     ├── regional/*.geojson        (ręczne)
     └── glottography/{Family}/*.geojson (auto)
                           │
                    build-languages.js       ← Krok 2
                           │
                           ▼
                  languages.generated.js     ← Output (gitignored)
                           │
                     index.html + app.js     ← Frontend (Leaflet.js)
```

## Skrypty

### `scripts/extract-glottography.js` — Krok 1: Ekstrakcja

Czyta dane z `glottography_asher_data/` i tworzy indywidualne pliki `.geojson` w `data/glottography/`, pogrupowane wg macroarea. Wielokrotne polygony tego samego języka łączy w MultiPolygon.

```bash
node scripts/extract-glottography.js                    # domyślnie: contemporary, wszystkie macroareas
node scripts/extract-glottography.js --dataset=traditional
node scripts/extract-glottography.js --macroarea=Eurasia
node scripts/extract-glottography.js --clean            # wyczyść data/glottography/ przed ekstrakcją
```

### `scripts/build-languages.js` — Krok 2: Budowanie

Rekurencyjnie czyta wszystkie `data/**/*.geojson`, simplifikuje polygony (Douglas-Peucker) i generuje `languages.generated.js`.

```bash
node scripts/build-languages.js                     # domyślnie: tolerance=0.03
node scripts/build-languages.js --tolerance=0.05    # grubsza simplifikacja (mniejszy plik)
node scripts/build-languages.js --tolerance=0.01    # dokładniejsza (większy plik)
node scripts/build-languages.js --min-points=4      # min punktów na polygon
```

## Typowe zadania

### Dodanie nowego języka ręcznie

1. Utwórz plik `data/countries/nazwa.geojson` lub `data/regional/nazwa.geojson`
2. Uruchom `node scripts/build-languages.js`

Format pliku — patrz [data/README.md](data/README.md).

### Aktualizacja danych Glottography

```bash
node scripts/extract-glottography.js --clean
node scripts/build-languages.js
```

### Przebudowanie po zmianach w data/

```bash
node scripts/build-languages.js
```

## Struktura projektu

| Plik | Opis |
|------|------|
| `index.html` | Strona główna z mapą Leaflet.js |
| `app.js` | Logika frontendu (kliknięcie → wykrywanie języka) |
| `style.css` | Style UI (ciemny motyw) |
| `languages.generated.js` | Wygenerowane strefy językowe (gitignored) |
| `languages.js` | Starsze dane demo (27 krajów EU) |
| `scripts/extract-glottography.js` | Krok 1: glottography → data/ |
| `scripts/build-languages.js` | Krok 2: data/ → languages.generated.js |
| `data/` | Pliki źródłowe GeoJSON |
| `glottography_asher_data/` | Surowe dane Glottography (Asher & Moseley 2007) |

## Dane źródłowe

- **Glottography**: [Asher & Moseley 2007 Atlas of the World's Languages](https://github.com/Glottography/asher2007world) — 4189 języków, licencja CC-BY-4.0
- **Frontend**: [Leaflet.js](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/)

## Wymagania

- Node.js (bez zewnętrznych zależności — czyste JS)
- Przeglądarka z obsługą ES6
