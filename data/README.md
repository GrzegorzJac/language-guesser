# Language Zones Data

## Struktura

```
data/
├── countries/     # Główne języki narodowe (type: "native")
│   ├── poland.geojson
│   ├── germany.geojson
│   └── ...
└── regional/      # Języki regionalne/mniejszościowe (type: "regional")
    ├── kashubian.geojson
    ├── sorbian.geojson
    └── ...
```

## Format GeoJSON

Każdy plik musi zawierać:

```json
{
  "type": "Feature",
  "properties": {
    "language": "Polish",
    "nativeName": "Polski",
    "type": "native"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lng, lat], [lng, lat], ...]]
  }
}
```

**Uwaga:** GeoJSON używa `[longitude, latitude]`, skrypt automatycznie konwertuje do `[lat, lng]`.

## Źródła danych wysokiej jakości

| Źródło | URL | Opis |
|--------|-----|------|
| Natural Earth | https://www.naturalearthdata.com/downloads/ | Granice państw (1:10m, 1:50m, 1:110m) |
| GADM | https://gadm.org/download_country.html | Granice administracyjne per kraj |
| geojson.io | https://geojson.io | Edytor online - rysuj/modyfikuj poligony |
| Overpass Turbo | https://overpass-turbo.eu | Eksport granic z OpenStreetMap |

## Workflow

### 1. Pobierz bazowy GeoJSON

Z Natural Earth (kraje):
```bash
# Pobierz Admin 0 Countries (granice państw)
wget https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
```

Z GADM (regiony wewnętrzne):
```bash
# Pobierz dla konkretnego kraju (np. Poland)
wget https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_POL_1.json
```

### 2. Edytuj w geojson.io

1. Otwórz https://geojson.io
2. Przeciągnij plik .geojson
3. Dostosuj granice (np. dla języków regionalnych)
4. Dodaj properties: `language`, `nativeName`, `type`
5. Zapisz → Save → GeoJSON

### 3. Zbuduj languages.js

```bash
node scripts/build-languages.js

# Z mniejszą tolerancją (więcej szczegółów, większy plik):
node scripts/build-languages.js --tolerance=0.01

# Z większą tolerancją (mniej szczegółów, mniejszy plik):
node scripts/build-languages.js --tolerance=0.05
```

### 4. Podgląd na mapie

Po wygenerowaniu `languages.generated.js`:
1. Zamień zawartość `languages.js` na wygenerowaną
2. Otwórz aplikację w przeglądarce
3. Klikaj na mapie i sprawdzaj czy strefy są poprawne

## Języki regionalne - źródła

| Język | Region | Źródło mapy |
|-------|--------|-------------|
| Kaszubski | PL | Wikipedia: Kashubian language |
| Śląski | PL | Wikipedia: Silesian language |
| Sorbski | DE | Wikipedia: Sorbian languages |
| Fryzyjski | NL/DE | Wikipedia: Frisian languages |
| Bretoński | FR | Wikipedia: Breton language |
| Okcytański | FR | Wikipedia: Occitan language |
| Baskijski | ES/FR | Wikipedia: Basque Country |
| Kataloński | ES/FR | Wikipedia: Catalan Countries |
| Sámi | SE/FI/NO | Wikipedia: Sápmi |

## Tips

- **MultiPolygon**: Dla krajów z wyspami/ekslawami, każda część zostanie osobną strefą
- **Simplifikacja**: Domyślna tolerancja 0.02° (~2km) - dobra równowaga
- **Testowanie**: Użyj geojson.io do wizualnego sprawdzenia przed buildem
