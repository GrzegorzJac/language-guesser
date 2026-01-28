# Language Zones Data

Folder `data/` jest jedynym źródłem prawdy dla stref językowych. Wszystkie pliki `.geojson` z tego folderu (rekurencyjnie) trafiają do `languages.generated.js`.

## Struktura

```
data/
├── countries/        # Ręczne: główne języki narodowe
│   └── poland.geojson
├── regional/         # Ręczne: języki regionalne/mniejszościowe
│   └── kashubian.geojson
└── glottography/     # Auto-generowane z Glottography (Asher & Moseley 2007)
    ├── Atlantic-Congo/
    ├── Austronesian/
    ├── Indo-European/
    ├── Sino-Tibetan/
    └── ...  (pogrupowane wg rodziny językowej)
```

## Format GeoJSON

Każdy plik musi być poprawnym GeoJSON (`Feature` lub `FeatureCollection`):

```json
{
  "type": "Feature",
  "properties": {
    "language": "Polish",
    "nativeName": "Polski",
    "family": "Slavic",
    "macroarea": "Eurasia",
    "glottocode": "poli1260",
    "iso639": "pol"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lng, lat], [lng, lat], ...]]
  }
}
```

**Wymagane:** `language`, `nativeName`
**Opcjonalne:** `family`, `macroarea`, `glottocode`, `iso639`
**Uwaga:** GeoJSON używa `[longitude, latitude]`. Skrypt budujący konwertuje do `[lat, lng]`.

## Workflow

### Pełny pipeline (od zera)

```bash
# 1. Rozpakuj dane z Glottography → data/glottography/
node scripts/extract-glottography.js

# 2. Zbuduj languages.generated.js z data/
node scripts/build-languages.js
```

### Dodanie nowego języka ręcznie

1. Utwórz plik `.geojson` w `data/countries/` lub `data/regional/`
2. Uruchom `node scripts/build-languages.js`

### Aktualizacja danych Glottography

```bash
# Ponowna ekstrakcja (nadpisuje istniejące pliki)
node scripts/extract-glottography.js --clean

# Przebuduj output
node scripts/build-languages.js
```

## Źródła danych

| Źródło | URL | Opis |
|--------|-----|------|
| Natural Earth | https://www.naturalearthdata.com/downloads/ | Granice państw (1:10m, 1:50m, 1:110m) |
| GADM | https://gadm.org/download_country.html | Granice administracyjne per kraj |
| geojson.io | https://geojson.io | Edytor online - rysuj/modyfikuj poligony |
| Overpass Turbo | https://overpass-turbo.eu | Eksport granic z OpenStreetMap |

## Tips

- **MultiPolygon**: Dla krajów z wyspami/ekslawami, każda część staje się osobną strefą
- **Simplifikacja**: Kontrolowana parametrem `--tolerance` przy buildzie (domyślnie 0.03°)
- **Testowanie**: Użyj geojson.io do wizualnego sprawdzenia pliku `.geojson` przed buildem
- **Idempotentność**: Oba skrypty można uruchamiać wielokrotnie — nadpisują wynik
