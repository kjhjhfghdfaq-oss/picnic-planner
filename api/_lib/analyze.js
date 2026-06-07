'use strict';

const S5_BUCKETS = ['groente_fruit', 'granen', 'eiwit', 'zuivel', 'vetten', 'buiten'];

// Volgorde telt: eerste match wint. Trefwoorden zijn lowercase, matchen op substring.
const S5_KEYWORDS = [
  ['groente_fruit', ['groente', 'fruit', 'sla', 'salade', 'aardappel']],
  ['granen', ['brood', 'gebak', 'pasta', 'rijst', 'graan', 'ontbijtgranen', 'meel', 'cracker']],
  ['eiwit', ['vlees', 'vis', 'zeevruchten', 'kip', 'gehakt', 'vega', 'vegetarisch', 'vegan', 'peulvrucht', 'noten', 'tofu']],
  ['zuivel', ['zuivel', 'kaas', 'melk', 'yoghurt', 'ei', 'eieren']],
  ['vetten', ['olie', 'boter', 'margarine', 'azijn', 'vet']],
];

function mapCategoryToS5(category) {
  const c = String(category || '').toLowerCase();
  if (!c) return 'buiten';
  for (const [bucket, keywords] of S5_KEYWORDS) {
    if (keywords.some(k => c.includes(k))) return bucket;
  }
  return 'buiten';
}

module.exports = { S5_BUCKETS, mapCategoryToS5 };
