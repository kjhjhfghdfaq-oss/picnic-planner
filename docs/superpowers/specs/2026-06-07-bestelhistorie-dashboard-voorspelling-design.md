# Bestelhistorie, Dashboard & Voorspelling — Design Spec

**Datum:** 2026-06-07
**Status:** Goedgekeurd

## Doel

Drie samenhangende features bovenop één gedeeld fundament: de **bestelhistorie** ontsluiten uit de Picnic API, daarmee een **dashboard** tonen (uitgaven, gezondheid/Schijf van Vijf, top-producten, bestelritme) en **terugkerende producten voorspellen** die met één klik in de winkelmand worden gezet.

Volgorde van bouwen: datalaag (fundament) → dashboard → voorspelling.

## Achtergrond — wat de Picnic API geeft

Bevestigd via de onofficiële community-libraries (mcp-picnic, MRVDH/picnic-api, MikeBrink/python-picnic-api):

- `POST /deliveries/summary` — lijst van leveringen (IDs, datums, totaalbedrag)
- `GET /deliveries/{id}` — regels per levering (producten, aantallen, prijzen)
- `GET /articles/{id}/category` — categorie van een product (voor S5-indeling)
- `GET /cart` + `POST /cart/add_product` — bestaande cart-flow (hergebruikt voor auto-toevoegen)

Alle endpoints vereisen de al ontdekte verplichte headers (`x-picnic-agent`, `x-picnic-did`, `x-picnic-auth`, etc.).

**Kerninzicht:** afgeronde leveringen veranderen nooit meer. Daarom cachen we ze veilig en halen we alleen nieuwe leveringen bij (aanpak C).

## Architectuur

```
Frontend (public/index.html)
  ├─ Tab "Dashboard"  ──→ GET /api/order-history  (historie + kant-en-klare aggregaten)
  │                   ──→ GET /api/insights        (Haiku-commentaar, async, niet-blokkerend)
  └─ Tab "Winkelwagen" + Dashboard
                      ──→ POST /api/predict-restock (auto-toevoegen van due-producten)

Backend (/api)
  ├─ order-history.js   — haalt + cachet leveringen, verrijkt met S5, geeft aggregaten
  ├─ insights.js        — stuurt compacte aggregaten naar Haiku, cachet resultaat
  ├─ predict-restock.js — bepaalt due-producten, voegt toe aan mand, geeft samenvatting
  └─ _lib/analyze.js    — PURE functies: aggregaties, S5-mapping, cadans-berekening

KV (Vercel)
  ├─ delivery:{id}        — onveranderlijke leveringsregels (cache)
  ├─ deliveries:index     — bekende leverings-IDs + datums
  ├─ product-s5:{id}      — product → S5-vak (cache)
  ├─ insights:{periode}   — gecachte Haiku-inzichten
  └─ autoadded:{session}  — product-IDs die wij auto-toevoegden (voor badge + undo)
```

`_lib/analyze.js` bevat alle logica die fout kán gaan en wordt los getest met `node --test`.

---

## Sectie 1 — Datalaag (fundament)

### `api/order-history.js`

Bij aanroep:
1. `POST /deliveries/summary` → lijst van leveringen (IDs, datums, totaal).
2. Voor elke levering die **nog niet** als `delivery:{id}` in KV staat: `GET /deliveries/{id}` ophalen, regels opslaan als `delivery:{id}` (onveranderlijk). Index `deliveries:index` bijwerken.
3. Volledige set normaliseren en de **kant-en-klare aggregaten** (via `analyze.js`) teruggeven, zodat de frontend alleen hoeft te renderen.

### Product → Schijf van Vijf

- Per uniek product de Picnic-categorie bepalen (uit de regel-data, of eenmalig via `GET /articles/{id}/category`), gecachet als `product-s5:{id}`.
- Een **statische mappingtabel in code** vertaalt Picnic-categorie → S5-vak: groente/fruit, granen/volkoren, eiwit (vlees/vis/vega), zuivel, smeer-/bereidingsvetten, buiten-de-schijf. Makkelijk door ons bij te stellen; geen UI-configuratie.

### Foutafhandeling

- Ongeldig/verlopen token → `401`, frontend vraagt opnieuw inloggen (bestaand patroon).
- Levering ophalen mislukt → overslaan, cachen wat wél lukte, gesanitiseerd loggen (zoals `generate-meal-plan.js`).
- Lege historie (nieuwe gebruiker) → nette lege staat, geen crash.

### Wat niet verandert

Login/2FA/cart-flow blijven intact. Deze laag is puur additief.

---

## Sectie 2 — Dashboard

Nieuwe tab **"Dashboard"** naast Maaltijden / Recepten / Winkelwagen. Grafieken via **Chart.js (CDN)** — geen build-stap.

**Blok 1 — Uitgaven over tijd**
- KPI-kaartjes: totaal deze maand, gemiddelde mandprijs, trend t.o.v. vorige maand (▲▼ %).
- Grafiek: uitgaven per maand, met week/maand-schakelaar.

**Blok 2 — Gezondheid / Schijf van Vijf**
- Verdeling over S5-vakken als gestapelde balk of donut.
- Eén leesbaar signaal, bv. "groente & fruit: 22% van je mand", met kleurindicatie.

**Blok 3 — Top-producten**
- Twee lijstjes: meest besteld (op aantal) en grootste uitgaven (op €).

**Blok 4 — Bestelritme & volume**
- KPI's: gemiddeld aantal dagen tussen bestellingen, gemiddeld aantal producten per bestelling, aantal bestellingen in periode.

**Blok 5 — Inzichten (Haiku)** — zie hieronder; laadt async, niet-blokkerend.

**Dataflow:** tab opent → `api/order-history` geeft historie + aggregaten → frontend rendert direct → aparte call naar `api/insights`. Lege historie → vriendelijke "nog geen bestellingen"-staat.

### Haiku-inzichtenlaag — `api/insights.js`

- Krijgt alleen de **al-berekende, compacte aggregaten** (geen ruwe regels) → weinig tokens, snel, goedkoop.
- Model `claude-haiku-4-5-20251001`, korte observaties in het Nederlands (bv. "Je groente-aandeel zakt 3 weken op rij", "Deze maand 15% meer uitgegeven, vooral aan tussendoor").
- Resultaat gecachet als `insights:{periode}` in KV; niet bij elke pageload opnieuw.
- **Niet-blokkerend en niet-kritisch:** de harde cijfers werken altijd, ook als Haiku traag is of faalt. Frontend toont een spinner; komt er niets → blokje verdwijnt, dashboard blijft staan.

---

## Sectie 3 — Voorspelling (automatisch in de mand)

### Cadans-berekening (`analyze.js`, pure functie)

Per product uit de historie: besteldatums, gemiddeld interval, laatste besteldatum, gebruikelijke hoeveelheid.

Een product is **"due"** als:
- ≥3 keer besteld, én
- het interval **regelmatig** is (lage spreiding — eenmalige aankopen vallen af), én
- sinds de laatste keer ≈ het gemiddelde interval verstreken is.

### `api/predict-restock.js`

- Getriggerd door een **expliciete knop** "Vul mijn vaste boodschappen aan" (op Dashboard én Winkelwagen). Niet stilzwijgend bij pageload.
- Eén klik voegt **álle** due-producten in één keer toe via de bestaande `/api/cart`-flow ("automatisch" = je kiest niet per item).
- Vóór toevoegen de huidige mand checken → **niets dubbel** toevoegen.
- Hoeveelheid = gebruikelijke aantal voor dat product.
- Geeft een **samenvatting** terug: "Toegevoegd: bruiswater ×6, melk ×2, …".

### Markeren & ongedaan maken

- De mand is van Picnic; daar kunnen we geen labels in zetten. We onthouden lokaal welke product-IDs wíj toevoegden (`autoadded:{session}` in KV/localStorage).
- Winkelwagen-weergave geeft die items een badge: "♻ automatisch toegevoegd op basis van je patroon".
- **"Ongedaan maken"**-knop verwijdert precies die items weer (via bestaande cart-remove).

### Veiligheid

- Alleen toevoegen aan de mand; **nooit een bestelling plaatsen**. De gebruiker houdt de laatste controle in Picnic zelf.
- Niets gebeurt stilzwijgend op de achtergrond; alles start met een klik.

### Randgevallen

- Product niet meer leverbaar → overslaan, melden in de samenvatting.
- Te weinig of te onregelmatige historie → product verschijnt niet.

---

## Testen

- `_lib/analyze.js` bevat alle risicovolle logica als pure functies en wordt getest met `node --test`: aggregaties (uitgaven, top-producten, S5-verdeling, ritme) en de cadans-/due-berekening (inclusief randgevallen: te weinig historie, onregelmatig interval, net wel/niet due).
- De endpoints zelf (live Picnic-calls) testen we handmatig tegen de productie-URL na deploy, zoals bij eerdere features.

## Aannames te verifiëren bij het bouwen

- Of `GET /deliveries/{id}` de regels met product-IDs, aantallen én prijzen bevat (anders aanvullende call nodig). Live verifiëren met token.
- Of categorie-info al in de regel-data zit, of dat `GET /articles/{id}/category` nodig is.

## Wat er niet verandert

- Geen wijziging aan login/2FA/maaltijdplanning/recepten-flow.
- Geen nieuwe permanente voorraadlijst (dat is een aparte backlog-feature).
- Geen bestelling plaatsen vanuit de app.

## Buiten scope (bewust)

- Frontend-redesign (idee 4) — apart traject.
- Picnic-recepten ophalen (idee 1) — volgende design, na deze.
- Bezorgslots tonen (idee 5) — later, los.
