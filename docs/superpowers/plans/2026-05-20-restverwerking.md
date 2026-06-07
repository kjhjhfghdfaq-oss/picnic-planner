# Restverwerking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat de AI maaltijden plannen met ingredient-continuïteit over de week en toon een ♻-annotatie op maaltijden die restjes van een eerdere dag verwerken.

**Architecture:** Eén prompt-uitbreiding in `generate-meal-plan.js` voegt `leftoverNote` toe aan het JSON-schema en geeft de AI instructies voor slimme weekplanning. De frontend slaat het veld op in `mealPlan` en toont het in zowel het planscherm als de Recepten-tab.

**Tech Stack:** Node.js serverless (Vercel), vanilla JS, @anthropic-ai/sdk, claude-haiku-4-5-20251001

---

### Task 1: Prompt uitbreiden met `leftoverNote` schema en planningsinstructie

**Files:**
- Modify: `api/generate-meal-plan.js` (regels 12–26 en 28–40)

- [ ] **Stap 1: Voeg `leftoverNote` toe aan het JSON-schema in de prompt**

In `api/generate-meal-plan.js`, vervang het huidige schema-blok (regels 12–26):

```javascript
const SYSTEM_PROMPT = `Je bent een Nederlandse maaltijdplanner die gezonde maaltijden suggereert op basis van de Schijf van Vijf.

SCHIJF VAN VIJF RICHTLIJNEN (Voedingscentrum):
- Groenten en fruit: 250g groenten en 2 stuks fruit per dag
- Volkorenproducten als basis: volkorenbrood, volkoren pasta, zilvervliesrijst
- Zuivel dagelijks: yoghurt, kaas, melk of alternatief
- Maximaal 500g (rood) vlees per week; 1-2x per week vis aanbevolen
- Weinig verzadigd vet, suiker en zout
- Varieer wekelijks voor een breed voedingspatroon
- Probeer de week zo te plannen dat gedeeltelijk gebruikte ingrediënten terugkomen in een latere maaltijd (bijv. halve courgette op maandag → volledig verbruikt op woensdag). Dit hoeft niet voor elk ingrediënt, maar doe het waar het logisch past.

OUTPUT FORMAAT - geef ALLEEN geldige JSON terug, geen uitleg, geen markdown, geen code blocks:
{
  "meals": [
    {
      "day": "Maandag",
      "name": "Receptnaam",
      "ingredients": ["zalm 300g", "zoete aardappel 400g"],
      "searchTerms": ["zalm", "zoete aardappel"],
      "leftoverNote": null,
      "preparation": "Bereidingsinstructie in 2-3 stappen",
      "estimatedCost": 8.50,
      "nutritionNote": "Korte Schijf-van-Vijf opmerking"
    }
  ],
  "totalEstimatedCost": 45.00
}
```

- [ ] **Stap 2: Voeg `REGELS VOOR leftoverNote` toe na de bestaande REGELS-blokken**

Direct na het bestaande blok `REGELS VOOR searchTerms` (na regel ~40), voeg toe:

```
REGELS VOOR leftoverNote:
- Vul alleen in als deze maaltijd een ingrediënt gebruikt dat al deels verschijnt in een eerdere maaltijd van dit plan
- Gebruik de formulering: "♻ Gebruikt restjes [ingrediënt] van [dag]"
- Laat het veld null als er geen echte connectie is — verzin geen connecties
- Maximaal één zin, altijd in het Nederlands
```

- [ ] **Stap 3: Verifieer de volledige SYSTEM_PROMPT lokaal**

Open `api/generate-meal-plan.js` en check visueel:
- `leftoverNote: null` staat in het schema-voorbeeld
- Planningsinstructie staat in de Schijf van Vijf sectie
- REGELS VOOR leftoverNote staat na REGELS VOOR searchTerms
- Geen dubbele regels of kapotte template literals

- [ ] **Stap 4: Commit**

```bash
git add api/generate-meal-plan.js
git commit -m "feat(prompt): add leftoverNote schema and ingredient-continuity planning rule"
```

---

### Task 2: Frontend — `leftoverNote` opslaan en tonen

**Files:**
- Modify: `public/index.html` (regels 385–393, 348–352, 494–498)

- [ ] **Stap 1: Voeg `leftoverNote` toe aan de `mealPlan` mapping in `doPlan()`**

In `public/index.html`, pas de mapping aan (huidige regels 385–393):

```javascript
mealPlan = data.meals.map(m => ({
  day: m.day,
  name: m.name,
  ingredients: m.ingredients,
  searchTerms: m.searchTerms || [],
  leftoverNote: m.leftoverNote || '',
  preparation: m.preparation || '',
  nutritionNote: m.nutritionNote || '',
  estimatedCost: m.estimatedCost || 0
}));
```

- [ ] **Stap 2: Toon `leftoverNote` in `renderMealPlan()`**

In `renderMealPlan()`, voeg de annotatie toe direct boven `nutritionNote` (huidige regel ~350):

```javascript
      ${m.leftoverNote ? `<div class="meal-cost" style="color:#2e7d32;">${esc(m.leftoverNote)}</div>` : ''}
      ${m.nutritionNote ? `<div class="meal-cost" style="color:#5a7a5a;">✓ ${esc(m.nutritionNote)}</div>` : ''}
```

- [ ] **Stap 3: Toon `leftoverNote` in `loadRecepten()`**

In `loadRecepten()`, voeg dezelfde annotatie toe in het `<details>` blok, direct boven de `nutritionNote` regel (huidige regel ~497):

```javascript
            ${m.leftoverNote ? `<div class="meal-cost" style="color:#2e7d32;">${esc(m.leftoverNote)}</div>` : ''}
            ${m.nutritionNote ? `<div class="meal-cost" style="color:#5a7a5a;margin-top:4px;">✓ ${esc(m.nutritionNote)}</div>` : ''}
```

- [ ] **Stap 4: Verifieer in de browser**

Start een lokale test door de productie-URL te openen (https://picnic-planner.vercel.app) na deploy, of test de logica lokaal:
- Genereer een nieuw maaltijdplan
- Controleer dat maaltijden zonder connectie geen ♻-regel tonen
- Controleer dat een maaltijd met connectie de groene ♻-annotatie toont
- Open de Recepten-tab en klap een recept open — annotatie moet ook daar zichtbaar zijn

- [ ] **Stap 5: Commit en push**

```bash
git add public/index.html
git commit -m "feat(frontend): display leftoverNote annotation on meal cards"
git push origin main
```
