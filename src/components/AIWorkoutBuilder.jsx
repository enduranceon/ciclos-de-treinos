import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { uuid, blockDistance, blockDurationMin, DEFAULT_RACE_PACE_CONFIG } from '../utils/helpers';

const EDGE_FUNCTION_URL = 'https://tcdoxeduhwyvhkxwrymj.supabase.co/functions/v1/anthropic-proxy';

const SMALL_WORDS = new Set(['a', 'e', 'o', 'as', 'os', 'da', 'de', 'do', 'das', 'dos']);
const PORTUGUESE_DIACRITICS = {
  continuo: 'contínuo',
  especifico: 'específico',
  aerobio: 'aeróbio',
  anaerobio: 'anaeróbio',
  potencia: 'potência',
  variacao: 'variação',
  transicao: 'transição',
  ativacao: 'ativação',
  estimulos: 'estímulos',
};

function applyPortugueseDiacritics(word) {
  const match = word.match(/^([a-zA-ZÀ-ÿ0-9]+)([^a-zA-ZÀ-ÿ0-9]*)$/);
  if (!match) return word;

  const [, core, suffix] = match;
  const mapped = PORTUGUESE_DIACRITICS[core.toLowerCase()];
  return mapped ? `${mapped}${suffix}` : word;
}

function normalizeTitleWord(word, { preserveZone = false } = {}) {
  if (!word) return word;

  if (preserveZone && /^z\d(?:\/z\d)?$/i.test(word)) {
    return word.toUpperCase();
  }

  if (/^vo2$/i.test(word)) return 'VO2';

  if (/^\d/.test(word)) {
    return word.toLowerCase();
  }

  const lower = applyPortugueseDiacritics(word.toLowerCase());
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function normalizeTitleSegment(segment, index) {
  const trimmed = segment.trim();
  if (!trimmed) return trimmed;

  if (index === 2) {
    return trimmed
      .split(/\s+/)
      .map(word => normalizeTitleWord(word, { preserveZone: true }))
      .join(' ');
  }

  if (index === 3) {
    const up = trimmed.toUpperCase();
    if (up === 'PACE' || up === 'PSE') return up;
    return trimmed.toLowerCase();
  }

  return trimmed
    .split(/\s+/)
    .map((word, wordIndex) => {
      const lower = word.toLowerCase();
      if (wordIndex > 0 && SMALL_WORDS.has(lower)) return lower;
      return normalizeTitleWord(word);
    })
    .join(' ');
}

function normalizeGeneratedTitle(title) {
  if (!title) return title;

  return title
    .split(' - ')
    .map((segment, index) => normalizeTitleSegment(segment, index))
    .join(' - ');
}

function parseNumber(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatWorkValue(value, measure) {
  const n = parseNumber(value);
  if (n === null || n <= 0) return null;

  if (measure === 'distance') {
    if (n < 1) return `${Math.round(n * 1000)}m`;
    if (Number.isInteger(n)) return `${n}km`;
    return `${n.toFixed(1)}km`;
  }

  if (measure === 'time') {
    if (Number.isInteger(n)) return `${n}min`;
    return `${n.toFixed(1)}min`;
  }

  return null;
}

function signatureForInterval(sb) {
  return JSON.stringify({
    type: sb.type,
    repeat: parseInt(sb.repeat) || 1,
    workMeasure: sb.workMeasure || 'distance',
    workValue: String(sb.workValue ?? ''),
    workzone: sb.workzone || sb.workZone || '',
    restType: sb.restType || 'passive',
    restMeasure: sb.restMeasure || 'time',
    restValue: String(sb.restValue ?? ''),
    restzone: sb.restzone || sb.restZone || '',
  });
}

function signatureForContinuous(sb) {
  return JSON.stringify({
    type: sb.type,
    measureType: sb.measureType || 'distance',
    value: String(sb.value ?? ''),
    zone: sb.zone || '',
  });
}

function buildSetNotationFromBlocks(blocks) {
  const main = (blocks || []).find(section => section.sectionType === 'serie_principal');
  const subBlocks = main?.subBlocks || [];
  if (subBlocks.length < 3) return null;

  const intervalIndexes = subBlocks
    .map((sb, i) => ((sb.type === 'interval' || sb.type === 'intervalado') ? i : -1))
    .filter(i => i >= 0);
  if (intervalIndexes.length < 2) return null;

  // We only rewrite when the structure is [interval, continuous, interval, continuous, ...]
  // which represents repeated sets separated by recoveries between sets.
  for (let i = 1; i < intervalIndexes.length; i += 1) {
    if (intervalIndexes[i] - intervalIndexes[i - 1] !== 2) return null;
  }

  const firstInterval = subBlocks[intervalIndexes[0]];
  const intervalSig = signatureForInterval(firstInterval);
  const separatorSig = signatureForContinuous(subBlocks[intervalIndexes[0] + 1]);

  const allIntervalsSame = intervalIndexes.every(i => signatureForInterval(subBlocks[i]) === intervalSig);
  if (!allIntervalsSame) return null;

  const separatorsSame = intervalIndexes
    .slice(0, -1)
    .every(i => signatureForContinuous(subBlocks[i + 1]) === separatorSig);
  if (!separatorsSame) return null;

  const workMeasure = firstInterval.workMeasure || 'distance';
  const workValue = firstInterval.workValue;
  const eachRep = formatWorkValue(workValue, workMeasure);
  const repeat = parseInt(firstInterval.repeat) || 1;
  const sets = intervalIndexes.length;
  if (!eachRep || repeat < 1 || sets < 2) return null;

  return `${sets}x(${repeat}x${eachRep})`;
}

function applySmartVolumeToTitle(title, blocks) {
  const smartVolume = buildSetNotationFromBlocks(blocks);
  if (!smartVolume || !title) return title;

  const parts = title.split(' - ');
  if (parts.length < 4) return title;
  // New format: last segment is PACE/PSE metric — don't touch it, rewrite segment 2 (série)
  const last = (parts[parts.length - 1] || '').trim().toUpperCase();
  if (last === 'PACE' || last === 'PSE') {
    parts[2] = smartVolume;
  } else {
    parts[3] = smartVolume;
  }
  return normalizeGeneratedTitle(parts.join(' - '));
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const RACE_PACE_KEYWORDS = {
  '5k': ['ritmo 5k', 'ritmo de 5k', 'ritmo 5 km', 'ritmo de 5 km', 'pace 5k', 'pace de 5k', 'ritmo prova 5k'],
  '10k': ['ritmo 10k', 'ritmo de 10k', 'ritmo 10 km', 'ritmo de 10 km', 'pace 10k', 'pace de 10k', 'ritmo prova 10k'],
  '21k': [
    'ritmo 21k', 'ritmo de 21k', 'ritmo 21 km', 'ritmo de 21 km',
    'ritmo meia maratona', 'ritmo de meia maratona', 'pace meia maratona', 'pace de meia maratona',
  ],
  '42k': [
    'ritmo 42k', 'ritmo de 42k', 'ritmo 42 km', 'ritmo de 42 km',
    'ritmo maratona', 'ritmo de maratona', 'marathon pace', 'pace de maratona',
  ],
};

function findRequestedRacePace(promptText, racePaceConfig) {
  const normalized = normalizeSearchText(promptText);
  const cfg = Array.isArray(racePaceConfig) && racePaceConfig.length ? racePaceConfig : DEFAULT_RACE_PACE_CONFIG;
  const rank = ['42k', '21k', '10k', '5k'];

  for (const key of rank) {
    const terms = RACE_PACE_KEYWORDS[key] || [];
    if (terms.some(term => normalized.includes(normalizeSearchText(term)))) {
      return cfg.find(p => p.key === key) || DEFAULT_RACE_PACE_CONFIG.find(p => p.key === key);
    }
  }

  return null;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let idx = 0;
  let count = 0;
  while (idx >= 0) {
    idx = haystack.indexOf(needle, idx);
    if (idx >= 0) {
      count += 1;
      idx += needle.length;
    }
  }
  return count;
}

function countRacePaceMentions(promptText, key) {
  const normalized = normalizeSearchText(promptText);
  const terms = (RACE_PACE_KEYWORDS[key] || [])
    .map(normalizeSearchText)
    .sort((a, b) => b.length - a.length);

  let seen = new Set();
  let count = 0;
  for (const term of terms) {
    if (!term || seen.has(term)) continue;
    seen.add(term);
    count += countOccurrences(normalized, term);
  }
  return Math.max(0, count);
}

function buildRacePaceRuleText(racePaceConfig) {
  const cfg = Array.isArray(racePaceConfig) && racePaceConfig.length ? racePaceConfig : DEFAULT_RACE_PACE_CONFIG;
  const byKey = (key) => cfg.find(c => c.key === key) || DEFAULT_RACE_PACE_CONFIG.find(c => c.key === key);
  const p42 = byKey('42k');
  const p21 = byKey('21k');
  const p10 = byKey('10k');
  const p5 = byKey('5k');

  return [
    'Regra obrigatória para ritmo de prova: NUNCA peça referência de pace (tempo/km) nem sugira "zona padrão".',
    `Use SEMPRE range percentual na série principal: 42k ${p42.low}-${p42.high}%, 21k ${p21.low}-${p21.high}%, 10k ${p10.low}-${p10.high}%, 5k ${p5.low}-${p5.high}%.`,
    'Quando o usuário disser "ritmo de maratona"/"ritmo de 21k"/"ritmo de 10k"/"ritmo de 5k", gere o treino diretamente sem clarificação.',
  ].join('\n');
}

function isRacePaceClarification(item, promptText) {
  const text = normalizeSearchText(`${item?.context || ''} ${item?.question || ''} ${promptText || ''}`);
  const hasRacePace = (
    text.includes('ritmo de maratona') ||
    text.includes('ritmo maratona') ||
    text.includes('ritmo de meia') ||
    text.includes('ritmo de 21') ||
    text.includes('ritmo de 10') ||
    text.includes('ritmo de 5')
  );
  const asksReference = (
    text.includes('tempo/km') ||
    text.includes('pace') ||
    text.includes('referencia') ||
    text.includes('zona padrao')
  );
  return hasRacePace && asksReference;
}

function shouldAutoResolveRacePaceClarifications(clarifications, promptText) {
  if (!Array.isArray(clarifications) || !clarifications.length) return false;
  return clarifications.every(item => isRacePaceClarification(item, promptText));
}

function maxZoneLabelForRange(lowRaw, highRaw, zoneConfig) {
  const low = parseNumber(lowRaw);
  const high = parseNumber(highRaw);
  if (low === null || high === null) return null;

  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const cfg = (Array.isArray(zoneConfig) && zoneConfig.length ? zoneConfig : [])
    .filter(z => /^z\d$/i.test(z.key))
    .map(z => ({ ...z, key: z.key.toUpperCase() }));

  const overlaps = cfg.filter(z => Math.max(0, Math.min(hi, z.high) - Math.max(lo, z.low)) > 0);
  if (!overlaps.length) return null;
  return overlaps[overlaps.length - 1].key;
}

const RACE_PACE_TITLE_SPEC = {
  '42k': 'Ritmo de Maratona',
  '21k': 'Ritmo de Meia',
  '10k': 'Ritmo de 10km',
  '5k': 'Ritmo de 5km',
};

const RACE_PACE_TEXT_SPEC = {
  '42k': 'ritmo de maratona',
  '21k': 'ritmo de meia',
  '10k': 'ritmo de 10km',
  '5k': 'ritmo de 5km',
};

function applyRacePaceDescription(description, requested, low, high, maxMentions = 1) {
  if (!description) return description;

  const label = RACE_PACE_TEXT_SPEC[requested.key] || (requested.label || '').toLowerCase();
  const replacement = `${label} (${low}-${high}%)`;
  let remaining = Math.max(1, maxMentions);

  // Only rewrite "Série Principal" lines; keep warmup/cooldown zones explicit.
  return String(description).replace(
    /(Série Principal:\n)([\s\S]*?)(\n\n(?:Aquecimento|Ativação|Estímulos|Strides|Transição|Volta à calma):|$)/i,
    (full, head, body, tail) => {
      const updatedBody = body
        .split('\n')
        .map((line) => {
          if (!line.trim()) return line;
          if (remaining <= 0) return line;
          const alreadyHasRaceLabel = normalizeSearchText(line).includes(normalizeSearchText(label));
          const lineReplacement = alreadyHasRaceLabel ? `${low}-${high}%` : replacement;
          // Replace the first work-zone token in the line (z2..z6) with race-pace label.
          const updated = line.replace(/\bz[2-6]\b/i, lineReplacement);
          if (updated !== line) remaining -= 1;
          return updated;
        })
        .join('\n');
      return `${head}${updatedBody}${tail || ''}`;
    }
  );
}

function inferSpecificityFromZone(zoneLabel) {
  const z = String(zoneLabel || '').toUpperCase();
  if (z === 'Z6') return 'Anaeróbio';
  if (z === 'Z5') return 'VO2';
  if (z === 'Z4') return 'Limiar';
  if (z === 'Z3') return 'Intensivo';
  if (z === 'Z2') return 'Endurance';
  if (z === 'Z1') return 'Aeróbico Base';
  return null;
}

function workTargetForTitle(sb, zoneConfig) {
  if (sb.type === 'interval' || sb.type === 'intervalado') {
    const mode = sb.worktargetMode || sb.workTargetMode || 'zone';
    if (mode === 'range') {
      return maxZoneLabelForRange(sb.worktargetLow || sb.workTargetLow, sb.worktargetHigh || sb.workTargetHigh, zoneConfig);
    }
    if (mode === 'pct') return null;
    return String(sb.workzone || sb.workZone || '').toUpperCase();
  }

  if (sb.type === 'continuous' || sb.type === 'continuo') {
    const mode = sb.targetMode || sb.targetmode || 'zone';
    if (mode === 'range') {
      return maxZoneLabelForRange(sb.targetLow || sb.targetlow, sb.targetHigh || sb.targethigh, zoneConfig);
    }
    if (mode === 'pct') return null;
    return String(sb.zone || '').toUpperCase();
  }

  return null;
}

function buildMainVolumeLabel(blocks) {
  const main = (blocks || []).find(section => section.sectionType === 'serie_principal');
  const subBlocks = main?.subBlocks || [];
  const parts = subBlocks.map((sb) => {
    if (sb.type === 'interval' || sb.type === 'intervalado') {
      const rep = parseInt(sb.repeat) || 1;
      const each = formatWorkValue(sb.workValue, sb.workMeasure || 'distance');
      return each ? `${rep}x${each}` : null;
    }
    if (sb.type === 'continuous' || sb.type === 'continuo') {
      return formatWorkValue(sb.value, sb.measureType || 'distance');
    }
    return null;
  }).filter(Boolean);

  return parts.length ? parts.join('+') : null;
}

function rebuildTitleWithRacePace(workout, requested, zoneConfig) {
  const original = workout?.title;
  if (!original || !original.includes(' - ')) return original;
  const parts = original.split(' - ');
  if (parts.length < 4) return original;

  const main = (workout.blocks || []).find(section => section.sectionType === 'serie_principal');
  const subBlocks = main?.subBlocks || [];

  const explicitSpecs = [];
  const zoneSet = new Set();
  subBlocks.forEach((sb) => {
    const z = workTargetForTitle(sb, zoneConfig);
    if (!z) return;
    zoneSet.add(z);
    const mode = (sb.worktargetMode || sb.workTargetMode || sb.targetMode || sb.targetmode || 'zone');
    if (mode !== 'range') {
      const spec = inferSpecificityFromZone(z);
      if (spec && !explicitSpecs.includes(spec)) explicitSpecs.push(spec);
    }
  });

  const baseSpec = RACE_PACE_TITLE_SPEC[requested.key] || requested.label || parts[1];
  const fullSpec = [baseSpec, ...explicitSpecs.filter(s => s !== baseSpec)].join(' + ');
  const zonesLabel = Array.from(zoneSet).sort().join('/') || parts[2];
  const volumeLabel = buildMainVolumeLabel(workout.blocks) || parts[3];

  parts[1] = fullSpec;
  parts[2] = zonesLabel;
  parts[3] = volumeLabel;
  return normalizeGeneratedTitle(parts.join(' - '));
}

function applyRacePaceTargets(workout, promptText, racePaceConfig, zoneConfig) {
  if (!workout?.blocks?.length) return workout;

  const requested = findRequestedRacePace(promptText, racePaceConfig);
  if (!requested) return workout;
  const maxMentions = Math.max(1, countRacePaceMentions(promptText, requested.key));
  let remaining = maxMentions;

  const low = String(requested.low ?? '');
  const high = String(requested.high ?? '');
  const isRecoveryZone = (zone) => ['trote', 'z0', 'z1'].includes(String(zone || '').toLowerCase());

  const blocks = (workout.blocks || []).map((section) => {
    if (section.sectionType !== 'serie_principal') return section;
    return {
      ...section,
      subBlocks: (section.subBlocks || []).map((sb) => {
        const type = sb.type;
        if (type === 'continuous' || type === 'continuo') {
          if (isRecoveryZone(sb.zone)) return sb;
          if (remaining <= 0) return sb;
          remaining -= 1;
          return {
            ...sb,
            targetMode: 'range',
            targetLow: low,
            targetHigh: high,
          };
        }
        if (type === 'interval' || type === 'intervalado') {
          const workZone = sb.workzone || sb.workZone;
          if (isRecoveryZone(workZone)) return sb;
          if (remaining <= 0) return sb;
          remaining -= 1;
          return {
            ...sb,
            worktargetMode: 'range',
            worktargetLow: low,
            worktargetHigh: high,
          };
        }
        return sb;
      }),
    };
  });

  const title = rebuildTitleWithRacePace({ ...workout, blocks }, requested, zoneConfig);

  const description = applyRacePaceDescription(workout.description, requested, low, high, maxMentions);

  return { ...workout, blocks, title, description };
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Papel: Tu és o Especialista em Metodologia da EON. A tua função é converter comandos de treinadores em treinos de corrida padronizados, gerando títulos precisos e descrições técnicas estruturadas. O treinador descreve em linguagem natural e você converte para JSON estruturado.

═══════════════════════════════════════════
PRINCÍPIO FUNDAMENTAL — ZERO INVENÇÃO
═══════════════════════════════════════════
Se qualquer informação crítica estiver AUSENTE e não puder ser inferida por texto EXPLÍCITO do usuário, retorne {"clarifications":[...]} ANTES de gerar o treino.
NUNCA invente, assuma ou preencha por conta própria.

Exigem clarificação quando ausentes:
  ▸ Zona de qualquer bloco sem zona explícita E sem palavra de intensidade
  ▸ Descanso de bloco intervalado: tipo, valor e/ou medida ausentes
  ▸ Número de repetições quando há descanso declarado mas sem repeat
  ▸ Zona de aquecimento ou volta à calma sem nenhum descritor

A IA SÓ infere automaticamente quando há base EXPLÍCITA:
  ✓ Zona nomeada: "z1", "z2", "z3", "z4", "z5", "z6", "trote"
  ✓ Palavra de intensidade (ver tabela abaixo)
  ✓ Padrão reconhecível: "fartlek" → descanso ativo
  ✗ Nome de seção NÃO implica zona: "aquecimento" ≠ z1
  ✗ Posição no treino NÃO implica zona

═══════════════════════════════════════════
ESTRUTURA DO JSON DE SAÍDA
═══════════════════════════════════════════
{
  "title": "Tipo de Treino - Intensidade/Objetivo - Série Principal - Métrica",
  "type": "corrida" | "bike" | "natacao" | "forca" | "descanso",
  "description": "texto formatado — ver regras abaixo",
  "blocks": [ { "sectionType": "...", "subBlocks": [...] } ]
}

═══════════════════════════════════════════
1. REGRA DE TÍTULO — IDENTIDADE VISUAL
═══════════════════════════════════════════
Fórmula obrigatória (sempre 4 partes separadas por " - "):
  [TIPO DE TREINO] - [INTENSIDADE/OBJETIVO] - [SÉRIE PRINCIPAL] - [MÉTRICA]

Capitalização obrigatória: todos os termos de Tipo e Intensidade começam com Maiúscula.
  Ex: "Intervalado Passivo", "Endurance Extensivo", "Sub Limiar", "Forte"

Métrica padrão: usa sempre PACE (maiúsculo).
Exceção PSE: usa PSE apenas para Hill Repeats, treinos técnicos ou quando percepção de esforço for explicitamente solicitada.

Regra do Espelhamento: as intensidades no título seguem a mesma ordem e quantidade das distâncias/tempos da série.
  Ex: série com z4 / z1 / z4 / z1 → título usa Z4/Z1/Z4/Z1

═══════════════════════════════════════════
2. TIPOS DE TREINO E DINÂMICA DE RECUPERAÇÃO
═══════════════════════════════════════════
Identifica o tipo pela forma como a recuperação é feita na série principal:

Intervalado Passivo   → descanso fixo de tempo parado (i=X') — ex: "i=2'", "1min passivo"
Intervalado Ativo     → recuperação em movimento — "c/ Xm trote" ou "/ Xm trote"
Fartlek               → alternância de ritmos contínua com / entre intensidades, sem paradas
Contínuo              → bloco único de ritmo constante (inclui Rodagem, Longo, Tempo Run)
Progressivo           → intensidade sempre crescente; usa / entre zonas; aplica Espelhamento
Hill Repeats          → repetições em subida com descida ativa como recuperação
                        restType SEMPRE "active" | notação na descrição: N× Xm↑ ZONA / Xm↓ ZONA
                        Palavras-chave: "hill", "subida", "morro", "ladeira"

Sessão com dois métodos → usa " + ": ex. "Intervalado Passivo + Progressivo"
Strides após a série   → adiciona " + Strides" ao tipo: ex. "Intervalado Passivo + Strides"

═══════════════════════════════════════════
3. ESCALA DE INTENSIDADES — REGRA DE PRIORIDADE
═══════════════════════════════════════════
Usa SEMPRE a nomenclatura mais específica disponível, na seguinte ordem:

🔑 REGRA RAIZ — CÓDIGO DE ZONA EXPLÍCITO CONGELA O TÍTULO
   Se o usuário escrever "z1", "z2", "z3", "z4", "z5" ou "z6" sem qualificador (alto/baixo):
     → o título usa EXATAMENTE "Z1", "Z2", "Z3", "Z4", "Z5" ou "Z6"
     → NÃO adiciona targetMode/range no JSON
     → NÃO mapeia para nenhuma subzona

   ⛔ EXEMPLOS PROIBIDOS:
     "z1" → ❌ título "Aeróbico Base"   ✅ título "Z1"
     "z2" → ❌ título "Endurance Extensivo"  ✅ título "Z2"
     "z4" → ❌ título "Limiar"          ✅ título "Z4"

🟢 PRIORIDADE 1 — Subzonas de Precisão
   Ativadas APENAS quando o usuário usa uma palavra descritiva OU escreve o nome da subzona.
   NUNCA ativadas quando o usuário escreve um código de zona simples (z1, z2, z3, z4, z5, z6).
   targetMode:"range" só vai no JSON quando a subzona for ativada por palavra/nome — NUNCA por código.

   Nome                         Range        Código JSON  Palavras que ativam
   Aeróbico Regenerativo        70–80%       z1/z2        "fácil", "leve", "suave", "tranquilo", "recovery", "aeróbico regenerativo"
   Endurance Leve               75–80%       z2           "endurance leve"
   Endurance                    80–86%       z2           "moderado", "conversação", "rodagem", "endurance"
   Limiar Aeróbico              86–91%       z3           "limiar aeróbico", "sustentado", "maratona"
   Sub Limiar                   92–96%       z3/z4        "sub limiar", "sub-limiar", "abaixo do limiar"
   Limiar Anaeróbico            97–100%      z4           "limiar anaeróbico", "limiar", "threshold", "LT2", "tempo run"
   VO2 Máx / Potência Aeróbica  100–110%     z5           "vo2max", "vo2", "crítico", "vo2 máx"
   Capacidade Anaeróbica        110–130%     z6           "capacidade anaeróbica", "potência", "anaeróbio", "sprint", "neuro"
   Aquecimento / Trote          47–55%       trote        "trote", "regenerativo", "caminhada", "aquecimento leve"

🟡 PRIORIDADE 2 — Ritmos de Prova (usa quando o treino simula ritmo de prova):
  Ritmo de 5km:           105–110%
  Ritmo de 10km:          100–105%
  Ritmo de Meia Maratona: 90–100%
  Ritmo de Maratona:      83–90%

🔴 PRIORIDADE 3 — Zonas Cheias (usa quando o usuário escreve o código z1–z6 explicitamente):
  "z1" → título: Z1  |  "z2" → título: Z2  |  "z3" → título: Z3
  "z4" → título: Z4  |  "z5" → título: Z5  |  "z6" → título: Z6
  "forte" → Z4/Z5  |  "muito forte"/"máximo" → Z6

🎭 PSE — Escala para Hill Repeats e sessões técnicas SOMENTE:
  Caminhada (z0) | Muito Leve (z1) | Leve (z2) | Moderado (z3) | Forte (z4/z5) | Muito Forte (z6)

Qualificadores alto/baixo — ativam subzona mesmo com código de zona:
  "z1 alto"  → Aeróbico Regenerativo       (70–80%)   | JSON zone: z1
  "z2 baixo" → Endurance Leve              (75–80%)   | JSON zone: z2
  "z2 alto"  → Endurance                   (80–86%)   | JSON zone: z2
  "z3 baixo" → Limiar Aeróbico             (86–91%)   | JSON zone: z3
  "z3 alto"  → Sub Limiar                  (92–96%)   | JSON zone: z3
  "z4 baixo" → Sub Limiar                  (92–96%)   | JSON zone: z4  ← MESMO range que "z3 alto"
  "z4 alto"  → Limiar Anaeróbico           (97–100%)  | JSON zone: z4

⚠️ REGRA CRÍTICA DE SINONÍMIA: "z3 alto" e "z4 baixo" são IDÊNTICOS — ambos = Sub Limiar (92–96%).
   Se o usuário escrever "z3 alto z4 baixo" ou "z4 baixo z3 alto" em um mesmo bloco,
   NÃO interprete como duas zonas diferentes. Trate como uma única zona: Sub Limiar.
   NUNCA peça clarificação quando dois qualificadores resolverem para a mesma subzona.

⚠️ NOTAÇÃO zN/zN+1 EM BLOCO CONTÍNUO — cruzamento de zonas adjacentes = subzona:
   Quando o usuário escreve duas zonas adjacentes com "/" num bloco contínuo único,
   está indicando o cruzamento entre elas — resolve diretamente para a subzona correspondente.
   NÃO peça clarificação. NÃO interprete como dois blocos separados.

   z1/z2  ou  z2/z1  → Aeróbico Regenerativo       (70–80%)   | zone: z1 | targetLow:70 targetHigh:80
   z2/z3  ou  z3/z2  → Limiar Aeróbico             (86–91%)   | zone: z3 | targetLow:86 targetHigh:91
   z3/z4  ou  z4/z3  → Sub Limiar                  (92–96%)   | zone: z3 | targetLow:92 targetHigh:96
   z4/z5  ou  z5/z4  → VO2 Máx / Potência Aeróbica (100–110%) | zone: z5 | targetLow:100 targetHigh:110

   Exemplos diretos:
     "8km contínuos z1/z2"  → título: "Aeróbico Regenerativo" | 8km · 70-80%
     "10km z3/z4"           → título: "Sub Limiar"             | 10km · 92-96%
     "15km z1/z2"           → título: "Aeróbico Regenerativo"  | 15km · 70-80%

Exemplos de como a regra raiz funciona:
  "z4"       → JSON zone: z4 → título: "Z4"                              ← código explícito, P3
  "z4 alto"  → JSON zone: z4 → título: "Limiar Anaeróbico"              ← qualificador ativa P1
  "limiar"   → JSON zone: z4 → título: "Limiar Anaeróbico"              ← palavra descritiva, P1
  "z2"       → JSON zone: z2 → título: "Z2"                              ← código explícito, P3
  "z2 alto"  → JSON zone: z2 → título: "Endurance"                      ← qualificador ativa P1
  "moderado" → JSON zone: z2 → título: "Endurance"                      ← palavra descritiva, P1
  "fácil"    → JSON zone: z1 → título: "Aeróbico Regenerativo"          ← palavra descritiva, P1

⚠️ O nome da subzona aparece APENAS no título e na descrição — nunca no JSON de zonas.
   No JSON, use sempre a chave: trote / z0 / z1 / z2 / z3 / z4 / z5 / z6

═══════════════════════════════════════════
4. ESTRUTURA DA DESCRIÇÃO E SEÇÕES
═══════════════════════════════════════════
A descrição é um "workout card" textual. Use \n para quebra de linha. Seções separadas por \n\n.

Blocos de seção disponíveis (sectionType):
  "aquecimento"     → início do treino — zona obrigatória (não assuma z1)
  "ativacao"        → ativações neuromusculares pré-série; use quando o usuário mencionar
                      "ativação", "ativações", "acelerações", "ABC", "exercícios de ativação"
  "strides"         → acelerações curtas controladas com recuperação ativa
                      Use quando mencionar "strides", "passadas", "stride"
                      Estrutura: intervalado, restType "active", work z4/z5, rest z1/trote
  "transicao"       → trote recuperativo entre blocos da série
  "serie_principal" → coração do treino — SEMPRE presente
  "volta_calma"     → encerramento — zona obrigatória (não assuma z1)

⚠️ Não invente seções: crie aquecimento/volta_calma/ativacao SOMENTE se o usuário mencionar.

Notação compacta na descrição:
  Contínuo:          Xkm zN  ou  Xmin zN
  Intervalo passivo: N× Xkm zN i=T   (T: minutos com ' ou segundos com '')
  Intervalo ativo:   N× Xkm zN / Xkm zN
  Fartlek:           N× Xmin zN / Xmin zN
  Variação:          N× [Xkm zN + Xkm zN]
  Hill Repeats:      N× Xm↑ ZONA / Xm↓ ZONA
  Strides:           N× Xm z4 / Xm z1

⚠️ Subzonas na descrição — regra por seção:

  SÉRIE PRINCIPAL: escreve o qualificador + nome da subzona
    Formato: [código qualificado] — [Nome da Subzona]
    18km z2 baixo — Endurance Leve           ← pediu "z2 baixo"
    10km z2 alto — Endurance                ← pediu "z2 alto"
    10× 1km z3 alto — Sub Limiar i=1'       ← pediu "z3 alto"
    8km z1/z2 — Aeróbico Regenerativo       ← pediu "z1/z2"
    5km Aeróbico Regenerativo               ← pediu "fácil" (palavra, sem qualificador)
    8× 800m Limiar Anaeróbico / 400m trote  ← pediu "limiar" (palavra, sem qualificador)

  AQUECIMENTO / VOLTA À CALMA / ATIVAÇÃO / STRIDES: escreve SOMENTE o código da zona (z1, z2, trote...)
    3km z1      ← não escreve "3km Aeróbico Regenerativo" nem "3km z1 alto — Aeróbico Regenerativo"
    2km z2      ← não escreve "2km Endurance Leve"
    1km trote   ← não escreve "1km Regenerativo"

Notação do descanso passivo (i=):
  "0:30" → i=30''  |  "0:45" → i=45''  |  "1" → i=1'  |  "1:30" → i=1'30''

Cálculo de Volume no título: soma a distância/tempo de TODOS os blocos da sessão.

═══════════════════════════════════════════
5. SUB-BLOCOS — FORMATO JSON
═══════════════════════════════════════════

CONTÍNUO (zona cheia):
{"type":"continuo","measureType":"distance"|"time","value":"número","zone":"trote"|"z0"..."z6"}

CONTÍNUO (subzona — adiciona range %):
{"type":"continuo","measureType":"distance"|"time","value":"número","zone":"z1","targetMode":"range","targetLow":70,"targetHigh":80}

INTERVALADO (zona cheia):
{"type":"intervalado","repeat":N,"workMeasure":"distance"|"time","workValue":"número","workZone":"z0"..."z6","restType":"passive"|"active","restMeasure":"distance"|"time","restValue":"minutos ou M:SS","restZone":"trote"|"z0"|"z1"}

INTERVALADO (subzona — adiciona range % no work):
{"type":"intervalado","repeat":N,"workMeasure":"distance","workValue":"número","workZone":"z4","worktargetMode":"range","worktargetLow":97,"worktargetHigh":100,"restType":"passive","restMeasure":"time","restValue":"1","restZone":"z0"}

Tabela de ranges por subzona (para preencher targetLow/targetHigh):
  Aeróbico Regenerativo        → targetLow:70, targetHigh:80  | zone: z1
  Endurance Leve               → targetLow:75, targetHigh:80  | zone: z2
  Endurance                    → targetLow:80, targetHigh:86  | zone: z2
  Limiar Aeróbico              → targetLow:86, targetHigh:91  | zone: z3
  Sub Limiar                   → targetLow:92, targetHigh:96  | zone: z3 ou z4
  Limiar Anaeróbico            → targetLow:97, targetHigh:100 | zone: z4

restValue → SEMPRE minutos ou M:SS (nunca segundos brutos):
  30s="0:30" | 45s="0:45" | 1min="1" | 90s="1:30" | 2min="2" | 3min="3"

restType "passive" = parado entre séries | restType "active" = trote entre séries (inclua restZone)
Hill Repeats: restType SEMPRE "active"

VARIAÇÃO (fartlek com estímulos diferentes repetidos N vezes):
{"type":"variacao","repeat":N,"stimuli":[{"measureType":"distance"|"time","value":"número","zone":"z0"..."z6"},...]}

PSE (apenas Hill Repeats e sessões técnicas):
  Contínuo PSE:   {"type":"continuo","measureType":"distance","value":"X","targetMode":"pse","pseLevel":"moderado"}
  Intervalo PSE:  {"type":"intervalado","repeat":N,...,"worktargetMode":"pse","workpseLevel":"forte",...}
  pseLevel: "muito_leve" | "leve" | "moderado" | "forte" | "muito_forte"

Descanso no input do usuário — reconheça todos os formatos:
  Passivo: "i=1'", "i=30''", "1min passivo", "2' parado", "intervalo 1min"
  Ativo:   "/ 400m trote", "c/ 400m trote", "com 400m trote"
  "i=X" sem tipo → PASSIVO

⚠️ "/" no prompt pode separar blocos distintos (não necessariamente descanso ativo):
  "2x800m / 4x400m z5 / 2x200m z6" = três subBlocks distintos
  "/" como descanso ativo só dentro do mesmo bloco: "6x400m z5 / 200m trote"

⚠️ NUNCA altere o número de repetições que o usuário especificou.

Conversão de distâncias → km:
  100m=0.1 | 200m=0.2 | 400m=0.4 | 500m=0.5 | 800m=0.8 | 1000m=1 | 1500m=1.5

Zonas de referência (% do Limiar Anaeróbio):
  trote 50–60% | z0 60–70% | z1 70–80% | z2 80–88% | z3 88–95% | z4 95–100% | z5 100–108% | z6 108–120%

═══════════════════════════════════════════
5. EXEMPLOS PARA APRENDIZAGEM
═══════════════════════════════════════════

Comando: "2km aq fácil + 10x 1km em z4 i=1' parado + 1km volta fácil"
{"title":"Intervalado Passivo - Z4 - 10x 1km - PACE","type":"corrida","description":"Aquecimento:\n2km Aeróbico Regenerativo\n\nSérie Principal:\n10× 1km Z4 i=1'\n\nVolta à Calma:\n1km Aeróbico Regenerativo","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"2","zone":"z1","targetMode":"range","targetLow":70,"targetHigh":80}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"1","workZone":"z4","restType":"passive","restMeasure":"time","restValue":"1","restZone":"z0"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1","targetMode":"range","targetLow":70,"targetHigh":80}]}]}

Comando: "3km aq fácil + 5x (1km z4 / 1km z1 / 2km z4 / 2km z1) + 2km volta fácil"
{"title":"Fartlek - Z4/Z1/Z4/Z1 - 5x 1km/1km/2km/2km - PACE","type":"corrida","description":"Aquecimento:\n3km z1\n\nSérie Principal:\n5× [1km z4 + 1km z1 + 2km z4 + 2km z1]\n\nVolta à Calma:\n2km z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"3","zone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"variacao","repeat":5,"stimuli":[{"measureType":"distance","value":"1","zone":"z4"},{"measureType":"distance","value":"1","zone":"z1"},{"measureType":"distance","value":"2","zone":"z4"},{"measureType":"distance","value":"2","zone":"z1"}]}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"2","zone":"z1"}]}]}

Comando: "15km progressivos: 5km z1, 5km endurance leve, 5km endurance extensivo"
{"title":"Progressivo - Z1/Endurance Leve/Endurance - 5km/5km/5km - PACE","type":"corrida","description":"Série Principal:\n5km z1\n5km z2\n5km z2","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"continuo","measureType":"distance","value":"5","zone":"z1"},{"type":"continuo","measureType":"distance","value":"5","zone":"z2"},{"type":"continuo","measureType":"distance","value":"5","zone":"z2"}]}]}

Comando: "10x 400m subida moderada / 200m descida trote"
{"title":"Hill Repeats - Moderado - 10x 400m/200m - PSE","type":"corrida","description":"Série Principal:\n10× 400m↑ z3 / 200m↓ trote","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"0.4","workZone":"z3","worktargetMode":"pse","workpseLevel":"moderado","restType":"active","restMeasure":"distance","restValue":"0.2","restZone":"trote"}]}]}

Comando: "aquecimento 3km fácil, ativação 3x300m rápido c/ 200m trote, série 8x800m no limiar c/ 400m trote, volta 1km fácil"
{"title":"Intervalado Ativo - Limiar Anaeróbico - 8x 800m - PACE","type":"corrida","description":"Aquecimento:\n3km Aeróbico Regenerativo\n\nAtivação:\n3× 300m z5 / 200m trote\n\nSérie Principal:\n8× 800m Limiar Anaeróbico / 400m trote\n\nVolta à Calma:\n1km Aeróbico Regenerativo","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"3","zone":"z1","targetMode":"range","targetLow":70,"targetHigh":80}]},{"sectionType":"ativacao","subBlocks":[{"type":"intervalado","repeat":3,"workMeasure":"distance","workValue":"0.3","workZone":"z5","restType":"active","restMeasure":"distance","restValue":"0.2","restZone":"trote"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":8,"workMeasure":"distance","workValue":"0.8","workZone":"z4","worktargetMode":"range","worktargetLow":97,"worktargetHigh":100,"restType":"active","restMeasure":"distance","restValue":"0.4","restZone":"trote"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1","targetMode":"range","targetLow":70,"targetHigh":80}]}]}

Comando: "aq 20min fácil, 10x400m vo2max i=1min passivo, volta 10min fácil"
{"title":"Intervalado Passivo - VO2 Máx / Potência Aeróbica - 10x 400m - PACE","type":"corrida","description":"Aquecimento:\n20min z1\n\nSérie Principal:\n10× 400m z5 i=1'\n\nVolta à Calma:\n10min z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"time","value":"20","zone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"0.4","workZone":"z5","restType":"passive","restMeasure":"time","restValue":"1","restZone":"z0"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"time","value":"10","zone":"z1"}]}]}

Comando: "aq 3km fácil, strides 10x 200m z4 c/ 200m z1, série 8x800m limiar i=2min, volta 1km fácil"
{"title":"Intervalado Passivo + Strides - Limiar - 8x 800m - PACE","type":"corrida","description":"Aquecimento:\n3km z1\n\nStrides:\n10× 200m z4 / 200m z1\n\nSérie Principal:\n8× 800m z4 i=2'\n\nVolta à Calma:\n1km z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"3","zone":"z1"}]},{"sectionType":"strides","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"0.2","workZone":"z4","restType":"active","restMeasure":"distance","restValue":"0.2","restZone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":8,"workMeasure":"distance","workValue":"0.8","workZone":"z4","restType":"passive","restMeasure":"time","restValue":"2","restZone":"z0"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1"}]}]}

═══════════════════════════════════════════
QUANDO PEDIR ESCLARECIMENTOS
═══════════════════════════════════════════
Se informações críticas estiverem ausentes, retorne:
{"clarifications":[{"id":"q1","context":"Para os 10×400m z5","question":"Qual o descanso entre as repetições?","suggestions":["1min passivo","1:30min passivo","2min passivo","200m trote"]}]}

PEÇA clarificação quando:
1. Bloco com descanso (i= ou /) mas SEM número de repetições explícito
2. Zona ausente num bloco contínuo SEM palavra de intensidade
   → "aquecimento 3km" sem zona = PERGUNTE — obrigatório
   → "volta à calma 2km" sem zona = PERGUNTE — obrigatório
3. Descanso de intervalado completamente ausente
4. Zona ausente num bloco quando outros blocos da mesma série têm zonas distintas

NÃO peça clarificação quando a zona puder ser inferida por:
  a) Zona explícita: "z1"–"z6", "trote"
  b) Palavra de intensidade: "fácil"→z1 | "moderado"→z2 | "endurance"→z3 | "limiar"→z4 | "vo2"→z5 | "potência"→z6 | "trote"→trote | "sub limiar"→z3 | "forte"→z4/z5
  c) Padrão do treino: "fartlek"→descanso ativo
  d) Contexto claro implica zona igual a outros blocos da mesma seção

⛔ PROIBIDO assumir zona pelo nome da seção:
  "aquecimento Xkm" sem descritor → NUNCA coloque z1. SEMPRE pergunte.
  "volta à calma Xkm" sem descritor → NUNCA coloque z1. SEMPRE pergunte.

Exemplo obrigatório de clarificação:
ENTRADA: "aquecimento 3km, 10x400m z5 i=1', volta 1km"
→ {"clarifications":[{"id":"q1","context":"Aquecimento (3km)","question":"Qual a intensidade do aquecimento?","suggestions":["Aeróbico Regenerativo — z1","Endurance — z2","Aquecimento / Trote — z0"]},{"id":"q2","context":"Volta à Calma (1km)","question":"Qual a intensidade da volta à calma?","suggestions":["Aeróbico Regenerativo — z1","Aquecimento / Trote — z0","Trote"]}]}

Responda APENAS com JSON válido, sem texto extra, sem \`\`\`json, sem comentários.`;

const EXAMPLES = [
  'Aquecimento 3km fácil, ativação 3x300m rápido c/ 200m trote, série 10x800m no limiar c/ 400m trote, volta à calma 1km tranquilo',
  'Aquecimento 20min fácil, fartlek 6x(5min limiar / 3min trote), volta 10min regenerativo',
  'Long run 18km progressivo: 8km moderado, 6km endurance extensivo, 4km sub limiar',
  'Aquecimento 2km fácil, 5x1km vo2max i=90 segundos passivo, volta 1km tranquilo',
  'Aquecimento 2km fácil, ativação 4x strides 150m rápido c/ 100m trote, série 10x400m potência i=1min30 passivo, volta 1km tranquilo',
];

const SECTION_LABELS = { aquecimento:'Aquecimento', ativacao:'Ativação', estimulos:'Ativação', strides:'Strides', transicao:'Transição', serie_principal:'Série Principal', volta_calma:'Volta à Calma' };
const SECTION_COLORS = { aquecimento:'#FB923C', ativacao:'#EF4444', estimulos:'#EF4444', strides:'#10B981', transicao:'#60A5FA', serie_principal:'#A78BFA', volta_calma:'#94A3B8' };

// Map Portuguese AI type names → English WorkoutForm type names
const TYPE_MAP = {
  continuo:    'continuous',
  intervalado: 'interval',
  variacao:    'variation',
  estimulo:    'stimulus',
  rampa:       'ramp',
};

// Normalize a sub-block from AI output → WorkoutForm format
function normalizeSubBlock(sb) {
  const type = TYPE_MAP[sb.type] || sb.type;
  const out = { ...sb, type, id: uuid() };

  if (type === 'continuous') {
    out.value = String(out.value ?? '');
    out.measureType = out.measureType || 'distance';
    // PSE mode: normalize targetMode field
    if (out.targetMode === 'pse' && !out.pseLevel) out.pseLevel = 'moderado';
  }

  if (type === 'interval') {
    // WorkoutForm reads obj['workzone'] and obj['restzone'] (lowercase, no camel)
    if (out.workZone)  { out.workzone  = out.workZone;  delete out.workZone; }
    if (out.restZone)  { out.restzone  = out.restZone;  delete out.restZone; }
    // PSE mode: normalize worktargetMode
    if (out.worktargetMode === 'pse' && !out.workpseLevel) out.workpseLevel = 'moderado';
    // Ensure strings
    out.workValue = String(out.workValue ?? '');
    out.restValue = String(out.restValue ?? '');
    out.workMeasure = out.workMeasure || 'distance';
    out.restType    = out.restType    || 'passive';
    out.restMeasure = out.restMeasure || 'time';
    out.repeat      = parseInt(out.repeat) || 1;
  }

  if (type === 'variation' || type === 'stimulus') {
    out.repeat = parseInt(out.repeat) || 1;
    out.stimuli = (out.stimuli || []).map(st => ({
      ...st,
      id: uuid(),
      value: String(st.value ?? ''),
      measureType: st.measureType || 'distance',
    }));
  }

  if (type === 'ramp') {
    out.repeat = parseInt(out.repeat) || 1;
    out.steps = (out.steps || []).map(st => ({
      ...st,
      id: uuid(),
      value: String(st.value ?? ''),
      measureType: st.measureType || 'distance',
    }));
  }

  return out;
}

function injectIds(blocks) {
  return (blocks || []).map(s => ({
    ...s,
    id: uuid(),
    subBlocks: (s.subBlocks || []).map(normalizeSubBlock),
  }));
}

// Format restValue (stored as minutes or M:SS) → display notation i=T' / i=T''
function fmtRest(val) {
  const s = String(val || '');
  const parts = s.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0]) || 0;
    const sec = parseInt(parts[1]) || 0;
    if (m === 0) return `${sec}''`;
    if (sec === 0) return `${m}'`;
    return `${m}'${String(sec).padStart(2, '0')}''`;
  }
  const n = parseFloat(s);
  if (!n) return s;
  if (Number.isInteger(n)) return `${n}'`;
  // decimal minutes → seconds
  const totalSec = Math.round(n * 60);
  const m2 = Math.floor(totalSec / 60);
  const s2 = totalSec % 60;
  if (m2 === 0) return `${s2}''`;
  if (s2 === 0) return `${m2}'`;
  return `${m2}'${String(s2).padStart(2, '0')}''`;
}

function formatDuration(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function formatPreviewTarget(obj, prefix = '', fallbackZone = 'z1') {
  const mode = obj[`${prefix}targetMode`] || obj[`${prefix}targetmode`] || 'zone';
  if (mode === 'range') {
    const low = obj[`${prefix}targetLow`] ?? obj[`${prefix}targetlow`];
    const high = obj[`${prefix}targetHigh`] ?? obj[`${prefix}targethigh`];
    if (low !== '' && low != null && high !== '' && high != null) return `${low}-${high}%`;
  }
  if (mode === 'pct') {
    const pct = obj[`${prefix}targetPct`] ?? obj[`${prefix}targetpct`];
    if (pct !== '' && pct != null) return `${pct}%`;
  }
  return String(fallbackZone || 'z1').toUpperCase();
}

// ── Preview of generated workout ──────────────────────────────────────────────
function WorkoutPreview({ workout }) {
  if (!workout) return null;
  const totalDistance = (workout.blocks || []).reduce((sum, block) => sum + blockDistance(block), 0);
  const totalMinutes = (workout.blocks || []).reduce((sum, block) => sum + blockDurationMin(block), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{workout.type === 'corrida' ? '🏃' : workout.type === 'bike' ? '🚴' : workout.type === 'natacao' ? '🏊' : '💪'}</span>
        <div>
          <p className="font-black text-[#001F3F]">{workout.title}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">
              Distância total:
              <span className="font-black text-[#001F3F] font-mono">{totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : '—'}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">
              Tempo total:
              <span className="font-black text-[#001F3F] font-mono">{formatDuration(totalMinutes)}</span>
            </span>
          </div>
          {workout.description && (
            <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed mt-1 font-mono">
              {workout.description}
            </p>
          )}
        </div>
      </div>
      {(workout.blocks || []).map((section, si) => (
        <div key={si} className="flex gap-2 items-start">
          <div className="w-1 rounded-full self-stretch flex-shrink-0 mt-1"
            style={{ backgroundColor: SECTION_COLORS[section.sectionType] || '#94A3B8', minHeight: 14 }} />
          <div className="flex-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {SECTION_LABELS[section.sectionType] || section.sectionType}
            </p>
            {(section.subBlocks || []).map((sb, bi) => {
              let line = '';
              if (sb.type === 'continuous' || sb.type === 'continuo') {
                const target = formatPreviewTarget(sb, '', sb.zone || 'z1');
                line = `${sb.value}${sb.measureType === 'distance' ? 'km' : 'min'} · ${target}`;
              } else if (sb.type === 'interval' || sb.type === 'intervalado') {
                const wTarget = formatPreviewTarget(sb, 'work', sb.workzone || sb.workZone || 'z4');
                const wVal  = `${sb.workValue}${sb.workMeasure === 'distance' ? 'km' : 'min'}`;
                const rest  = sb.restType === 'passive'
                  ? `i=${fmtRest(sb.restValue)}`
                  : `/ ${sb.restValue}${sb.restMeasure === 'distance' ? 'km' : 'min'} ${formatPreviewTarget(sb, 'rest', sb.restzone || sb.restZone || 'trote')}`;
                line = `${sb.repeat}× ${wVal} ${wTarget} ${rest}`;
              } else if (sb.type === 'variation' || sb.type === 'variacao') {
                const stimStr = (sb.stimuli || []).map(s => `${s.value}${s.measureType === 'distance' ? 'km' : 'min'} ${(s.zone || 'z1').toUpperCase()}`).join(' + ');
                line = `${sb.repeat}× [${stimStr}]`;
              }
              return line ? <p key={bi} className="text-xs text-slate-700 mt-0.5 font-mono">{line}</p> : null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// context: { cycleId, variantId, weekId, dayOfWeek } — optional
// mode: 'modal' (default) | 'panel' — panel renders inline, no overlay
export default function AIWorkoutBuilder({ context, onClose, onOpenEditor, mode = 'modal' }) {
  const isPanel = mode === 'panel';
  const { state, dispatch } = useApp();
  const { session } = useAuth();
  const [prompt, setPrompt]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [generated, setGenerated]       = useState(null);
  const [saved, setSaved]               = useState(null);
  // Clarification flow
  const [clarifications, setClarifications] = useState(null); // [{id,context,question,suggestions}]
  const [answers, setAnswers]               = useState({});   // {q1: '...'}
  const textareaRef = useRef(null);

  // ── Call API ──────────────────────────────────────────────────────────────
  async function callAPI(userMessage) {
    const racePaceRuleText = buildRacePaceRuleText(state.racePaceConfig);
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: `${SYSTEM_PROMPT}\n\n${racePaceRuleText}`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ${res.status}`);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inválida do assistente');
    let jsonStr = jsonMatch[0];
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // AI sometimes returns literal newlines inside string values instead of \n
      jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/gs, (_, content) =>
        '"' + content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
      );
      parsed = JSON.parse(jsonStr);
    }
    if (parsed.title) {
      parsed.title = normalizeGeneratedTitle(parsed.title);
    }
    return parsed;
  }

  // ── First generate: may return clarifications or workout ─────────────────
  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setGenerated(null);
    setSaved(null);
    setClarifications(null);
    setAnswers({});

    try {
      const parsed = await callAPI(prompt.trim());
      if (parsed.clarifications) {
        if (shouldAutoResolveRacePaceClarifications(parsed.clarifications, prompt.trim())) {
          const retryPrompt = `${prompt.trim()}\n\n${buildRacePaceRuleText(state.racePaceConfig)}`;
          const retried = await callAPI(retryPrompt);
          if (retried.clarifications) {
            setClarifications(retried.clarifications);
          } else {
            const prepared = {
              ...retried,
              blocks: injectIds(retried.blocks),
            };
            prepared.title = applySmartVolumeToTitle(prepared.title, prepared.blocks);
            const finalWorkout = applyRacePaceTargets(prepared, prompt.trim(), state.racePaceConfig, state.zoneConfig);
            setGenerated(finalWorkout);
          }
        } else {
          setClarifications(parsed.clarifications);
        }
      } else {
        const prepared = {
          ...parsed,
          blocks: injectIds(parsed.blocks),
        };
        prepared.title = applySmartVolumeToTitle(prepared.title, prepared.blocks);
        const finalWorkout = applyRacePaceTargets(prepared, prompt.trim(), state.racePaceConfig, state.zoneConfig);
        setGenerated(finalWorkout);
      }
    } catch (e) {
      setError(e.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  // ── Second generate: with answers appended ────────────────────────────────
  async function handleGenerateWithAnswers() {
    if (!clarifications) return;
    setLoading(true);
    setError(null);

    const answersText = clarifications
      .map(q => `${q.context} — ${q.question}: ${answers[q.id] || '(não respondido)'}`)
      .join('\n');
    const fullPrompt = `${prompt.trim()}\n\nEsclarecimentos:\n${answersText}`;

    try {
      const parsed = await callAPI(fullPrompt);
      if (parsed.clarifications) {
        // Shouldn't happen, but handle gracefully
        setClarifications(parsed.clarifications);
        setAnswers({});
      } else {
        const prepared = {
          ...parsed,
          blocks: injectIds(parsed.blocks),
        };
        prepared.title = applySmartVolumeToTitle(prepared.title, prepared.blocks);
        const finalWorkout = applyRacePaceTargets(prepared, prompt.trim(), state.racePaceConfig, state.zoneConfig);
        setGenerated(finalWorkout);
        setClarifications(null);
      }
    } catch (e) {
      setError(e.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  function saveToDay() {
    if (!generated || !context) return;
    dispatch({
      type: 'UPSERT_WORKOUT',
      payload: {
        cycleId: context.cycleId,
        variantId: context.variantId,
        weekId: context.weekId,
        workout: {
          id: uuid(),
          dayOfWeek: context.dayOfWeek,
          period: 'manha',
          title: generated.title || 'Treino IA',
          type: generated.type || 'corrida',
          description: generated.description || '',
          notes: '',
          blocks: generated.blocks || [],
        },
      },
    });
    setSaved('day');
  }

  function saveToLibrary() {
    if (!generated) return;
    dispatch({
      type: 'SAVE_TO_LIBRARY',
      payload: { workout: { ...generated, title: generated.title || 'Treino IA' }, folder: null },
    });
    setSaved('library');
    if (isPanel) {
      setTimeout(() => {
        setSaved(null);
        setGenerated(null);
        setPrompt('');
        setClarifications(null);
        setAnswers({});
      }, 2500);
    }
  }

  async function sendToLab() {
    if (!generated) return;
    await supabase.from('lab_queue').insert({
      created_by: session?.user?.id,
      title: generated.title || 'Treino IA',
      type: generated.type || 'corrida',
      description: generated.description || '',
      blocks: generated.blocks || [],
      status: 'pending',
    });
    setSaved('lab');
  }

  function openEditor() {
    if (!generated || !onOpenEditor) return;
    onOpenEditor(generated);
    onClose?.();
  }

  // ── Clarification step UI ─────────────────────────────────────────────────
  const showInput         = !saved && !clarifications && !generated;
  const showClarification = !saved && !!clarifications && !generated;
  const showPreview       = !saved && !!generated;

  const inner = (
    <div className={isPanel ? 'flex flex-col h-full' : 'bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]'}>

      {/* Header */}
      <div className={`bg-gradient-to-r from-[#001F3F] to-[#0a3a6e] px-6 py-4 flex items-center justify-between flex-shrink-0 ${isPanel ? 'rounded-xl' : 'rounded-t-2xl'}`}>
        <div>
          <h2 className="text-white font-black text-lg">✨ Gerador com IA</h2>
          <p className="text-blue-300 text-xs mt-0.5">
            {showClarification
              ? 'Preciso de mais alguns detalhes para montar o treino'
              : isPanel
                ? 'Treino gerado vai direto para a Biblioteca'
                : context
                  ? 'Gerando treino para este dia do calendário'
                  : 'Treino gerado vai para a Biblioteca'}
          </p>
        </div>
        {!isPanel && <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>}
      </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">


          {/* ── INPUT PHASE ── */}
          {showInput && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#001F3F]">Descreva o treino</label>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => { setPrompt(e.target.value); setError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  rows={4}
                  placeholder={`Ex: "Aquecimento 3km, 10×800m no limiar com 400m trote, volta à calma 1km"`}
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#001F3F]/40 resize-none text-slate-700 leading-relaxed"
                  disabled={loading}
                />
                <p className="text-[10px] text-slate-300">⌘+Enter para gerar</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Exemplos</p>
                <div className="flex flex-col gap-1.5">
                  {EXAMPLES.map((ex, i) => (
                    <button key={i} onClick={() => { setPrompt(ex); setError(null); textareaRef.current?.focus(); }}
                      className="text-left text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors line-clamp-2">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── CLARIFICATION PHASE ── */}
          {showClarification && (
            <div className="space-y-5">
              {/* Original prompt recap */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Treino descrito</p>
                <p className="text-sm text-slate-600 italic">"{prompt}"</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-black text-[#001F3F]">🤔 Faltaram alguns detalhes</p>
                <p className="text-xs text-slate-400">Responda abaixo para o treino ficar certinho:</p>
              </div>

              {clarifications.map((q, i) => (
                <div key={q.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#001F3F] text-white text-[10px] font-black flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{q.context}</p>
                        <p className="text-sm font-semibold text-[#001F3F]">{q.question}</p>
                      </div>
                      {/* Suggestion chips */}
                      {q.suggestions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.suggestions.map(s => (
                            <button key={s} type="button"
                              onClick={() => setAnswers(a => ({ ...a, [q.id]: s }))}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                answers[q.id] === s
                                  ? 'bg-[#001F3F] text-white border-[#001F3F]'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#001F3F]/40 hover:bg-[#001F3F]/5'
                              }`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Free text */}
                      <input
                        type="text"
                        value={answers[q.id] || ''}
                        onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                        placeholder="Ou escreva aqui..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-700">⚠️ Erro ao gerar</p>
              <p className="text-xs text-red-600 mt-1 font-mono">{error}</p>
            </div>
          )}

          {/* ── PREVIEW PHASE ── */}
          {showPreview && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">✓ Treino gerado — escolha o destino</p>
              <WorkoutPreview workout={generated} />
            </div>
          )}

          {/* ── SAVED ── */}
          {saved && (
            <div className={`border rounded-xl p-6 text-center ${saved === 'lab' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-4xl mb-3">{saved === 'day' ? '📅' : saved === 'lab' ? '⚗️' : '📚'}</div>
              <p className={`font-black text-base ${saved === 'lab' ? 'text-amber-700' : 'text-green-700'}`}>
                {saved === 'day' ? 'Treino adicionado ao calendário!' : saved === 'lab' ? 'Treino enviado pro Laboratório!' : 'Treino salvo na Biblioteca!'}
              </p>
              <p className={`text-xs mt-1 ${saved === 'lab' ? 'text-amber-600' : 'text-green-600'}`}>
                {saved === 'day' ? 'Aparece no dia que você selecionou.' : saved === 'lab' ? 'Aguardando envio ao Training Peaks.' : 'Disponível em Biblioteca → Sem pasta.'}
              </p>
              <div className="mt-4"><WorkoutPreview workout={generated} /></div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">

          {/* Input phase footer */}
          {showInput && (
            <div className="flex items-center justify-between gap-3">
              {!isPanel && <button onClick={onClose} className="btn-secondary">Cancelar</button>}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#001F3F,#0a3a6e)' }}
              >
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Analisando...</>
                  : '✨ Gerar Treino'}
              </button>
            </div>
          )}

          {/* Clarification phase footer */}
          {showClarification && (
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setClarifications(null); setAnswers({}); }}
                className="btn-secondary">← Voltar</button>
              <button
                onClick={handleGenerateWithAnswers}
                disabled={loading || clarifications.some(q => !answers[q.id]?.trim())}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#001F3F,#0a3a6e)' }}
              >
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Gerando...</>
                  : '✨ Gerar Treino'}
              </button>
            </div>
          )}

          {/* Preview phase footer */}
          {showPreview && (
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => { setGenerated(null); setClarifications(null); }}
                className="btn-secondary">← Refazer</button>
              <div className="flex items-center gap-2">
                <button onClick={saveToLibrary}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600">
                  📚 Biblioteca
                </button>
                <button onClick={sendToLab}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors">
                  ⚗️ Enviar pro Lab
                </button>
                {!isPanel && context && (
                  <button onClick={saveToDay}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-[#001F3F] text-[#001F3F] hover:bg-[#001F3F]/5 transition-colors">
                    📅 Salvar no dia
                  </button>
                )}
                {onOpenEditor && (
                  <button onClick={openEditor}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
                    style={{ background: 'linear-gradient(135deg,#001F3F,#0a3a6e)' }}>
                    ✎ Editar detalhes
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Saved footer */}
          {saved && !isPanel && (
            <div className="flex justify-between gap-3">
              <button onClick={() => { setSaved(null); setGenerated(null); setPrompt(''); setClarifications(null); setAnswers({}); }}
                className="btn-secondary">Gerar outro</button>
              <button onClick={onClose} className="btn-primary">Fechar</button>
            </div>
          )}
        </div>
      </div>
  );

  if (isPanel) return inner;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      {inner}
    </div>
  );
}
