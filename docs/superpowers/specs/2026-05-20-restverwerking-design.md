# Restverwerking — Design Spec

**Datum:** 2026-05-20
**Status:** Goedgekeurd

## Doel

Maaltijdplannen zo genereren dat gedeeltelijk gebruikte ingrediënten terugkomen in latere maaltijden van dezelfde week. De gebruiker ziet per maaltijd een annotatie als er een ingredient-continuïteit is met een eerdere dag.

## Aanpak

Geen nieuwe API-endpoint. Geen extra API-call. Eén prompt-uitbreiding, één nieuw JSON-veld, één UI-update.

## Wijzigingen

### 1. `api/generate-meal-plan.js` — Prompt

**Schijf van Vijf sectie uitbreiden** met planningsinstructie:

> "Probeer de week zo te plannen dat gedeeltelijk gebruikte ingrediënten terugkomen in een latere maaltijd (bijv. halve courgette op maandag → volledig verbruikt op woensdag). Dit hoeft niet voor elk ingrediënt, maar doe het waar het logisch past."

**JSON-schema uitbreiden** met optioneel veld per maaltijd:

```json
{
  "day": "Woensdag",
  "name": "Courgette-pasta",
  "ingredients": ["courgette 1 stuks", "pasta 300g"],
  "searchTerms": ["courgette", "pasta"],
  "leftoverNote": "♻ Gebruikt restjes courgette van maandag",
  "preparation": "...",
  "estimatedCost": 7.50,
  "nutritionNote": "..."
}
```

**Instructie voor `leftoverNote`:**
- Alleen invullen als er een echte ingredient-connectie is met een eerdere maaltijd in het plan
- Weglaten (`null` of veld weglaten) als er geen connectie is
- Formulering: altijd Nederlands, altijd beginnen met "♻ Gebruikt..."
- Nooit verzinnen: alleen opnemen als het ingrediënt ook daadwerkelijk in een eerdere dag staat

### 2. `public/index.html` — Frontend

**`doPlan()` — mealPlan mapping:** `leftoverNote` opslaan naast de bestaande velden:

```javascript
mealPlan = data.meals.map(m => ({
  ...
  leftoverNote: m.leftoverNote || '',
  ...
}));
```

**`renderMealPlan()` — meal card display:** `leftoverNote` tonen direct boven `nutritionNote`, zelfde stijl maar met groene kleur en ♻-icoon (die al in de tekst zit):

```html
${m.leftoverNote ? `<div class="meal-cost" style="color:#2e7d32;">${esc(m.leftoverNote)}</div>` : ''}
```

**`loadRecepten()` — Recepten tab:** zelfde aanpassing in de `<details>` inhoud per maaltijd.

## Wat er niet verandert

- Geen nieuwe serverless functions
- Geen KV-schema wijziging (leftoverNote wordt meegestuurd met `save-meal-plan` als onderdeel van het meals-array)
- Geen wijziging aan de cart-flow

## Randgevallen

- Als de AI geen logische restverbinding ziet: `leftoverNote` wordt weggelaten, gedrag onveranderd
- Als de AI een verzonnen connectie maakt: de promptinstructie "alleen opnemen als het ingrediënt daadwerkelijk in een eerdere dag staat" mitigeert dit; niet 100% gegarandeerd maar acceptabel voor deze use case
- Fallback RECEPTEN-array (bij API-fout): heeft geen `leftoverNote`, veld is optioneel dus geen effect op rendering

## Toekomstige uitbreiding

Staat los van de geplande free-text prompt feature (eigen brainstorm). De `leftoverNote` wordt automatisch meegenomen zodra die feature de meal plan output hergebruikt.
