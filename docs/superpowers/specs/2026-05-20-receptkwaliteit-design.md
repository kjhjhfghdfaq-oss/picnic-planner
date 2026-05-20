# Receptkwaliteit Verbeteringen — Design Spec

**Datum:** 2026-05-20
**Status:** Goedgekeurd

## Doel

Drie gerichte verbeteringen aan de receptweergave en -generatie:
1. Kooktijd tonen per maaltijd
2. Bereidingsstappen als genummerde lijst (i.p.v. één lap tekst)
3. Herhaling van recepten voorkomen op basis van de laatste 20 gegenereerde recepten

## Scope

Twee bestanden: `api/generate-meal-plan.js` en `public/index.html`. Geen nieuwe API-endpoints.

---

## 1. Kooktijd

### Backend (`api/generate-meal-plan.js`)

Nieuw veld `cookingTime` toevoegen aan het JSON-schema in `SYSTEM_PROMPT`:

```json
"cookingTime": "35 minuten"
```

Instructie in `REGELS VOOR receptkwaliteit`:
- `cookingTime` is de totale bereidingstijd inclusief voor- en nagerecht (bijv. "20 minuten", "45 minuten")

### Frontend (`public/index.html`)

- `mealPlan` mapping: `cookingTime: m.cookingTime || ''`
- `renderMealPlan()`: tonen als kleine badge op de kaart, direct onder de receptnaam:
  ```html
  <div style="font-size:12px;color:#888;margin-top:2px;">⏱ 35 minuten</div>
  ```
- `loadRecepten()`: zelfde in het `<details>` blok

---

## 2. Bereidingsstappen als genummerde lijst

### Backend (`api/generate-meal-plan.js`)

`preparation` (string) vervangen door `preparationSteps` (array van strings) in het JSON-schema:

```json
"preparationSteps": [
  "Verwarm de oven op 200°C. Snijd de zoete aardappel in blokjes.",
  "Rooster de aardappel 20 minuten met olijfolie en knoflook.",
  "Gril de zalm 12-15 minuten. Stoom de broccoli 5 minuten.",
  "Serveer samen met een schijfje citroen."
]
```

Instructie: array van 3–5 stappen, elke stap één concrete actie met tijd/temperatuur waar van toepassing.

### Frontend (`public/index.html`)

- `mealPlan` mapping: `preparationSteps: m.preparationSteps || []`, en ook `preparation: m.preparation || ''` bewaren voor achterwaartse compatibiliteit met eerder opgeslagen plannen in KV
- `renderMealPlan()`: render als `<ol>` als `preparationSteps.length > 0`, anders val terug op `preparation` string:
  ```html
  <ol style="margin:6px 0 0 16px;padding:0;font-size:13px;color:#444;">
    <li>Stap 1...</li>
  </ol>
  ```
- `loadRecepten()`: zelfde logica in `<details>` blok

---

## 3. Herhaling voorkomen

### Backend (`api/generate-meal-plan.js`)

Vóór de AI-call: lees de laatste 20 receptnamen uit Vercel KV en geef ze mee in de user message.

**Implementatie:**
```javascript
const { kv } = require('@vercel/kv');

// In de handler, vóór client.messages.create():
let recentNames = [];
try {
  const ids = await kv.lrange('meal-plans', 0, 19);
  if (ids && ids.length > 0) {
    const plans = await Promise.all(ids.map(id => kv.get(`plan:${id}`)));
    recentNames = plans
      .filter(Boolean)
      .flatMap(p => (p.meals || []).map(m => m.name))
      .filter(Boolean)
      .slice(0, 20);
  }
} catch (_) {
  // KV niet beschikbaar — silently doorgaan zonder geschiedenis
}
```

De namen worden toegevoegd aan de `userMessage`:
```
Vermijd herhaling van deze recepten (gebruik andere namen en hoofdingrediënten):
Gegrilde zalm met zoete aardappel, Stamppot boerenkool met rookworst, ...
```

**Foutafhandeling:** try/catch zodat een KV-fout nooit de meal plan generatie blokkeert.

---

## Wat er niet verandert

- Geen nieuwe serverless functions
- `save-meal-plan.js` en `get-meal-plans.js` ongewijzigd
- KV-schema ongewijzigd (het `meals` array in opgeslagen plannen bevat nu ook `cookingTime` en `preparationSteps`, maar dat is additief)
- Fallback RECEPTEN-array in de frontend: heeft geen `cookingTime` of `preparationSteps`, beide velden zijn optioneel en renderen niets als ze ontbreken

---

## Randgevallen

- **Oud opgeslagen plan in KV** (heeft `preparation` string, geen `preparationSteps` array): frontend toont de string als fallback
- **KV niet bereikbaar bij generate**: herhaling-check overgeslagen, plan wordt normaal gegenereerd
- **AI geeft `cookingTime` niet terug**: `|| ''` in mapping, geen weergave op de kaart
- **AI geeft `preparationSteps` niet als array**: `|| []` in mapping, geen `<ol>` getoond
