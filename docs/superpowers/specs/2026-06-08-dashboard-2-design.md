# Dashboard 2.0 — Design Spec

**Datum:** 2026-06-08
**Status:** Goedgekeurd (gebaseerd op gedetailleerde opdracht van Quinten; autonoom uitgevoerd)

## Doel

Vervang het huidige dashboard door een rijker, interactief dashboard op basis van de **volledige** Picnic-bestelhistorie. Vier blokken: Uitgaven & besparen, Gewoontes & patronen, Gezondheid & voeding (indicatie), Picnic Wrapped. Schijf-van-Vijf vervalt. Nederlandse labels, KPI-kaarten, grafieken (Chart.js), filters waar zinvol.

**Leidend principe (veiligheid/eerlijkheid):** gebruik alleen wat de Picnic API echt teruggeeft. Ontbreekt een veld, dan die sectie weglaten + melden — niet schatten of verzinnen. Afgeleide/heuristische cijfers worden expliciet als zodanig gelabeld.

## Databeschikbaarheid (bevestigd live, 7 juni 2026)

**Echt beschikbaar:**
- Alle leveringen via `POST /deliveries/summary []`: `delivery_id`, `creation_time` (timestamp + tijdzone → dag/uur), `status`, `slot.window_start/end`, `orders[].total_price` (centen).
- Per levering (`GET /deliveries/{id}`, gecachet): regels met productnaam, regelprijs (`display_price`/`price`, centen), aantal (QUANTITY-decorator); `parcels` (aantal pakketten).

**Afgeleid — expliciet gelabeld, niet als Picnic-feit gepresenteerd:**
- **Merk (huismerk vs A-merk):** Picnic geeft geen merklabel. Heuristiek: productnaam die met "Picnic" begint = huismerk, rest = A-merk. Label in de UI: "op basis van productnaam".
- **Categorie (vers / zuivel / dranken / snacks / alcohol / non-food / overig):** geen categorieveld in de API. Via Haiku-classificatie van productnamen, gecachet per product (`product-cat:{id}`). Gepresenteerd als **indicatie**, async geladen, niet-blokkerend.

**Ontbreekt echt → niet tonen:**
- Geen losse productprijs-catalogus/prijsindex. "Worden producten duurder?" leiden we af uit **werkelijk betaalde regelprijzen over tijd** (reëel), niet uit een prijsindex.
- Als Haiku-classificatie faalt: categorie-secties tonen "indeling niet beschikbaar" i.p.v. schatting.

## Architectuur

```
Frontend: Dashboard-tab (4 blokken, KPI-kaarten, Chart.js, filters)
  ├─ GET  /api/dashboard?auth=        → alle deterministische aggregaten (blok 1,2,4 + merk)
  └─ POST /api/classify-cat           → categorie-verdeling + vers-vs-ongezond over tijd (async, Haiku)

Backend
  ├─ _lib/orders.js     → getAllDeliveries(auth): ALLE leveringen, parallel+gecachet, met parcels & merk
  ├─ _lib/analyze.js    → pure aggregatiefuncties (getest met node --test)
  ├─ _lib/classify.js   → resolveCategoryBuckets(items) (Haiku, gecachet per product)
  ├─ dashboard.js       → bouwt het volledige dashboard-object
  └─ classify-cat.js    → categorie-indicatie (async)

KV: delivery:{id} (bestaand), product-cat:{id} (nieuw)
```

De bestaande endpoints (`order-history`, `insights`, `classify-s5`, `predict-restock`) en de prediction-flow blijven bestaan; het dashboard-frontend schakelt over op `/api/dashboard` + `/api/classify-cat`. S5- en insights-blokken verdwijnen uit de UI.

## Datalaag

`getAllDeliveries(auth)` (in `orders.js`): als `getNormalizedDeliveries` maar zonder de cap van 24 — haalt **alle** leveringen op, detail parallel in batches (cache-first; afgeronde leveringen blijven gecachet). Verrijkt elke `Delivery` met:
- `parcels`: aantal pakketten (uit detail `parcels`).
- elke `item` krijgt `brand`: `'huismerk'` als naam met "Picnic" begint, anders `'amerk'`.
- behoudt `date`, `totalCents`, `items[{productId,name,count,priceCents,brand}]`.

Robuustheid: batched parallel (cap ~12 gelijktijdig) tegen timeout; mislukte detail-fetch → levering overslaan, niet crashen.

## Blok 1 — Uitgaven & besparen
- KPI's: totale uitgaven (all-time), gemiddelde per bestelling.
- Lijngrafiek uitgaven per maand; togglebaar per jaar.
- **Trend-duiding:** stijgt de gemiddelde mand? En komt dat door **meer producten per bestelling** of **hogere prijs per product**? (beide reeksen over tijd tonen).
- **Merk-aandeel** huismerk vs A-merk in euro's (gelabeld "op productnaam").
- **Top 10 producten naar totale besteding**.

## Blok 2 — Gewoontes & patronen
- Bestelfrequentie: verdeling per dag-van-de-week en per uur; aantal bestellingen per maand.
- **Vaste kern:** producten die in het grootste deel van je bestellingen voorkomen (frequentie-aandeel).
- Seizoens-/maandpatroon: bestellingen of categorie-aandeel per maand.
- Aantal **unieke producten** (variatie), evt. over tijd.

## Blok 3 — Gezondheid & voeding (indicatie)
- Verdeling uitgaven over categorieën (vers, zuivel, dranken, snacks, alcohol, non-food, overig) — Haiku, async.
- Verhouding **"vers/onbewerkt" vs "snacks/frisdrank/alcohol"** als simpele indicatie, over tijd.
- Duidelijke disclaimer: indicatie op basis van productnamen, geen medisch oordeel.

## Blok 4 — Picnic Wrapped
- Meest gekochte product aller tijden (op aantal).
- Duurste enkele bestelling (hoogste leveringstotaal).
- Totaal aantal bestellingen en pakketten.
- Leuke superlatieven: totaal aantal eenheden van een paar herkenbare staples (bv. koffie, melk) via naam-match — gelabeld als naam-gebaseerd.

## Filters
- **Jaar-filter** bovenaan dat blok 1 & 2 (en waar zinvol 3) beperkt tot een gekozen jaar of "alles".
- Categorie wordt async ingeladen; geen blokkerende filters.

## Wat niet verandert / veiligheid
- Login/2FA/cart/maaltijden/recepten/predict-restock ongemoeid.
- Auth-token blijft via query (bestaande huisstijl); geen secrets in code; foutlogs gesanitiseerd.
- Geen bestelling plaatsen vanuit het dashboard.

## Testen
- Alle nieuwe `analyze.js`-functies als pure functies met `node --test`.
- Endpoints + frontend: handmatige live-check met Quinten's token na deploy (zoals eerder).
