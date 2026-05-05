import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { uuid, blockDistance, blockDurationMin, DEFAULT_RACE_PACE_CONFIG } from '../utils/helpers';

const ANTHROPIC_API_BASE_URL = (import.meta.env.VITE_ANTHROPIC_API_BASE_URL || '/anthropic').replace(/\/$/, '');

const SMALL_WORDS = new Set(['a', 'e', 'o', 'as', 'os', 'da', 'de', 'do', 'das', 'dos']);
const PORTUGUESE_DIACRITICS = {
  continuo: 'contínuo',
  especifico: 'específico',
  aerobio: 'aeróbio',
  anaerobio: 'anaeróbio',
  potencia: 'potência',
  variacao: 'variação',
  transicao: 'transição',
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
  parts[3] = smartVolume;
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
    /(Série Principal:\n)([\s\S]*?)(\n\n(?:Aquecimento|Estímulos|Transição|Volta à calma):|$)/i,
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
  if (z === 'Z6') return 'Potência Anaeróbia';
  if (z === 'Z5') return 'VO2 Max';
  if (z === 'Z4') return 'Limiar';
  if (z === 'Z3') return 'Endurance Intensivo';
  if (z === 'Z2') return 'Endurance Extensivo';
  if (z === 'Z1') return 'Endurance Leve';
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
const SYSTEM_PROMPT = `Você é um assistente especialista em prescrição de treinos de endurance para atletas brasileiros (corrida, ciclismo, natação, triathlon).
O treinador descreve o treino em linguagem natural e você converte para JSON estruturado com precisão técnica.

═══════════════════════════════════════════
PRINCÍPIO FUNDAMENTAL — ZERO INVENÇÃO
═══════════════════════════════════════════
Se qualquer informação crítica estiver AUSENTE e não puder ser inferida por texto EXPLÍCITO
do usuário, você DEVE retornar {"clarifications":[...]} antes de gerar o treino.
NUNCA invente, assuma, preencha por conta própria ou use "bom senso de treinador".

Informações que EXIGEM clarificação quando ausentes (sem base explícita no texto):
  ▸ Zona de QUALQUER bloco sem zona explícita ("z1","z2"…"z6","trote") E sem palavra de intensidade
  ▸ Descanso de bloco intervalado: tipo (passivo/ativo), valor e/ou medida ausentes
  ▸ Número de repetições de bloco com descanso declarado
  ▸ Zona de aquecimento, volta à calma ou qualquer seção sem nenhum descriptor

A IA SÓ pode preencher automaticamente quando há base EXPLÍCITA no texto do usuário:
  ✓ Zona nomeada: "z1", "z2", "z3", "z4", "z5", "z6", "trote"
  ✓ Sinônimo claro de intensidade: "fácil"→z1 / "moderado"→z2 / "limiar"→z4 / "vo2max"→z5
  ✓ Padrão estrutural reconhecível: "fartlek"→descanso ativo / "suja roupa"→contínuo Z0
  ✗ Nome da seção: "aquecimento" NÃO implica z1 — só o texto do usuário define
  ✗ Posição no treino: "primeiro bloco" NÃO implica zona mais fácil
  ✗ Tamanho ou distância: "curto" ou "5km" NÃO implica zona

═══════════════════════════════════════════
ESTRUTURA DO JSON DE SAÍDA
═══════════════════════════════════════════
{
  "title": "TIPO - ESPECIFICIDADE - ZONAS - VOLUME",
  "type": "corrida" | "bike" | "natacao" | "forca" | "descanso",
  "description": "— ver formato abaixo —",
  "blocks": [ ...seções... ]
}

═══════════════════════════════════════════
FORMATO DA DESCRIÇÃO (obrigatório)
═══════════════════════════════════════════
A descrição é um "workout card" textual com cada seção listada. Use \n para quebra de linha.
Notação compacta por tipo de sub-bloco:

  Contínuo:           Xkm zN   ou   Xmin zN
  Intervalo passivo:  N× Xkm zN i=T    (T em minutos com ' ou segundos com '')
  Intervalo ativo:    N× Xkm zN / Xkm zN   (barra = descanso ativo)
  Fartlek ativo:      N× Xmin zN / Xmin zN
  Variação:           N× [Xkm zN + Xkm zN + ...]

Notação do descanso passivo (i=):
  restValue "0:30" → i=30''    restValue "0:45" → i=45''
  restValue "1"    → i=1'      restValue "1:30" → i=1'30''
  restValue "2"    → i=2'      restValue "3"    → i=3'

Exemplo de description para um treino com 4 seções:
  "Aquecimento:\n2km z1\n\nEstímulos:\n5× 200m z5 / 200m trote\n\nSérie Principal:\n8× 400m z6 i=1'30''\n3× 1km z4 i=3'\n\nVolta à calma:\n1km z1"

Regras:
- Nome da seção seguido de dois pontos e \n
- Seções separadas por \n\n
- Múltiplos sub-blocos na mesma seção: separados por \n
- Sempre use a zona (zN ou "trote") após cada distância/tempo

═══════════════════════════════════════════
PADRÃO DE NOMENCLATURA (OBRIGATÓRIO)
═══════════════════════════════════════════
Formato obrigatório de 4 colunas, com capitalização padronizada:
TIPO - ESPECIFICIDADE - ZONAS - VOLUME

  TIPO         → arquitetura/método do treino
  ESPECIFICIDADE → objetivo metabólico da série principal
  ZONAS        → zona(s) alvo da série principal (Z1, Z4, Z5/Z6, Z3 a Z5)
  VOLUME       → carga da série principal (nunca o total com aquecimento/volta)

Exemplos corretos:
  Contínuo - Endurance Leve - Z1 - 10km
  Contínuo Prog. - Limiar - Z1 a Z4 - 18km
  Fartlek - Limiar - Z4 - 6×5min
  Int. Ativo - Limiar - Z4 - 8×800m
  Int. Passivo - VO2 Máx - Z5 - 10×400m
  Int. Passivo - Potência Anaeróbia - Z6 - 12×400m
  Int. Prog. Ativo - Endurance Intensivo a VO2 - Z3 a Z5 - 3×10×200m
  Suja Roupa - Regenerativo - Z0/Z1 - 8km
  Int. Ativo e Passivo - Endurance Intensivo e Anaeróbio - Z3/Z5 - 3×800m+10×500m

═══════════════════════════════════════════
DICIONÁRIO DE TIPOS (COLUNA 1)
═══════════════════════════════════════════
CONTINUO         → zona única constante, sem descanso
CONTINUO PROG.   → aumento gradual de intensidade ao longo do treino, sem descanso
FARTLEK          → variação on/off sem interrupção total, descanso em Z1 ou Z2 em movimento
INT. ATIVO       → intervalado clássico para remoção de lactato, descanso em trote (Z0 ou Trote)
INT. PASSIVO     → intervalado para máxima qualidade e potência, descanso parado
INT. PROG. ATIVO → blocos de intensidade crescente com trote entre blocos
INT. PROG. PASSIVO → blocos de intensidade crescente com pausa total entre blocos
SUJA ROUPA       → soltura regenerativa pura, sem descanso, Z0-Z1, volume leve

Sessões com 2 métodos distintos → conectivo "e" na ordem de execução:
  INT. ATIVO e PASSIVO - ...
  INT. PASSIVO e PROG. ATIVO - ...

═══════════════════════════════════════════
ESPECIFICIDADES E ZONAS (COLUNA 2 e 3)
═══════════════════════════════════════════
Atribua a especificidade baseado na zona E no volume do estímulo principal:

  Zona Trote (47–55%)   → Especificidade: Trote / Regenerativo
  Z0 Regenerativo (55–65%) → Especificidade: Regenerativo
  Z1 Endurance Leve (65–75%) → Especificidade: Endurance Leve
  Z2 Endurance Extensivo (75–86%) → Especificidade: Endurance Extensivo
  Z3 Endurance Intensivo (86–93%) → Especificidade: Endurance Intensivo
  Z4 Limiar (93–102%)   → Especificidade: Limiar  (distância ≥800m ou tempo ≥4min)
  Z5 VO2 MAX (102–110%) → Especificidade: VO2 MAX  (distância 600m–1,6km ou tempo 2–5min)
  Z5/Z6 (100–115%)      → Especificidade: Anaeróbio (distância 300m–800m ou tempo 45s–2min)
  Z6 Potência Anaeróbia (110–130%) → Especificidade: Potência Anaeróbia (dist. 100–400m ou <45s)

Progressivo (múltiplas zonas):
  Z1 a Z4 → Especificidade: "Endurance Leve a Limiar"  — ZONAS: "Z1 a Z4"
  Z3 a Z5 → Especificidade: "Endurance Intensivo a VO2 MAX" — ZONAS: "Z3 a Z5"

Sessão mista (2 blocos distintos):
  Especificidade: "Endurance Intensivo e Anaeróbio" — ZONAS: "Z3/Z5"

Regras da coluna ZONAS:
  Zona única     → Z4
  Duas zonas     → Z3/Z5  ou  Z3 e Z5
  Progressão     → Z1 a Z4  ou  Z3 a Z5

═══════════════════════════════════════════
SEÇÕES (blocks) — sectionType obrigatório
═══════════════════════════════════════════
Cada bloco: { "sectionType": "...", "subBlocks": [...] }

  "aquecimento"     → início do treino — zona DEVE ser especificada pelo usuário (não assuma z1)
  "estimulos"       → ativações neuromusculares, strides, acelerações pré-série
  "transicao"       → trote recuperativo entre blocos da série
  "serie_principal" → coração do treino (intervalos, progressivos, tempo run)
  "volta_calma"     → encerramento do treino — zona DEVE ser especificada pelo usuário (não assuma z1)

⚠️ NOTAÇÃO DE DESCANSO NO INPUT DO USUÁRIO:
O usuário pode escrever o descanso em vários formatos — reconheça todos:
  Passivo (parado):  "i=1'", "i=2'", "i=30''", "i=1'30''", "1min passivo", "2' passivo", "intervalo 1min"
  Ativo (movimento): "/ 400m trote", "/ 2min z1", "c/ 400m trote", "com 400m trote"
  Se o usuário usar "i=X" sem especificar tipo → é PASSIVO por definição

⚠️ BLOCO COM DESCANSO SEM REPEAT COUNT:
Se o usuário descreve um bloco com descanso mas SEM número de repetições:
  Ex: "3km z4 i=2'" → quantas repetições? PERGUNTE.
  Ex: "800m z5 / 400m trote" → quantas repetições? PERGUNTE.
  Exceção: se estiver claramente dentro de uma série com repeat implícito pelo contexto.

⚠️ REGRA CRÍTICA — preserve os números exatos do usuário:
- NUNCA altere o número de repetições (repeat) que o usuário especificou
- Se o usuário escreveu "2x 200m", o repeat é 2 — não some, não multiplique
- "/" no prompt do usuário pode ser separador de blocos, NÃO necessariamente descanso ativo
  Ex: "2x 800m / 4x 400m z5 / 2x 200m z6" = três subBlocks distintos na série, não descanso ativo
  "/" como descanso ativo só se aplicar DENTRO do mesmo bloco: "6x 400m z5 / 200m trote"

⚠️ REGRA FUNDAMENTAL — não invente seções:
- Só crie "aquecimento" se o usuário mencionar explicitamente aquecimento, warmup ou similar
- Só crie "volta_calma" se o usuário mencionar explicitamente volta à calma, cooldown ou similar
- Só crie "estimulos" se o usuário mencionar ativações, strides ou estímulos pré-série
- Se o usuário pedir apenas um bloco simples ("8km z1", "30min aeróbico"), use SOMENTE "serie_principal"
- "serie_principal" é sempre obrigatória e deve conter o treino principal

═══════════════════════════════════════════
SUB-BLOCOS — tipos disponíveis
═══════════════════════════════════════════

1. CONTÍNUO (esforço uniforme em uma zona):
{
  "type": "continuo",
  "measureType": "distance" | "time",
  "value": "número",
  "zone": "trote"|"z0"|"z1"|"z2"|"z3"|"z4"|"z5"|"z6"
}

2. INTERVALADO (séries com esforço + descanso repetidos):
{
  "type": "intervalado",
  "repeat": número,
  "workMeasure": "distance" | "time",
  "workValue": "número",
  "workZone": "z0"..."z6",
  "restType": "passive" | "active",
  "restMeasure": "distance" | "time",
  "restValue": "MINUTOS ou M:SS — nunca segundos brutos",
  "restZone": "trote" | "z0" | "z1"
}

⚠️ CRÍTICO — restValue é SEMPRE em MINUTOS (ou formato M:SS):
  30 segundos → "0:30"   |   45s → "0:45"
  1 minuto    → "1"      |   1'  → "1"
  90 segundos → "1:30"   |   2min → "2"
  3 minutos   → "3"      |   5min → "5"
  NÃO use 60 para "1 minuto" — use "1". NÃO use 90 para "1min30s" — use "1:30".

  restType "passive" = parado/estático entre séries (sem correr)
  restType "active"  = trote ou caminhada entre séries (inclua restZone="trote" ou "z0")

3. VARIAÇÃO (conjunto de estímulos diferentes repetido N vezes — fartlek estruturado):
{
  "type": "variacao",
  "repeat": número,
  "stimuli": [
    { "measureType": "distance"|"time", "value": "número", "zone": "z0"..."z6" },
    { "measureType": "distance"|"time", "value": "número", "zone": "z0"..."z6" }
  ]
}

═══════════════════════════════════════════
ZONAS DE INTENSIDADE (% do Limiar Anaeróbio)
═══════════════════════════════════════════
trote  47–55%    → Trote, recuperação ativa, descanso ativo entre séries, soltura
z0     55–65%    → Regenerativo, aquecimento muito leve, volta à calma suave
z1     65–75%    → Endurance Leve, fácil, aeróbico base, aquecimento/volta à calma
z2     75–86%    → Endurance Extensivo, moderado, rodagem, conversação
z3     86–93%    → Endurance Intensivo, limiar inferior, ritmo longo progressivo
z4     93–102%   → Limiar, threshold, MLSS — ≥800m ou ≥4min
z5    102–110%   → VO2 MAX, intervalado pesado, crítico — 600m–1,6km ou 2–5min
z6    110–130%   → Potência Anaeróbia, neuro, sprints — <400m ou <45s

Sinônimos → mapeie corretamente:
  "fácil"/"recovery"/"recup"/"tranquilo"/"suave"       → z1
  "moderado"/"aeróbico"/"conversação"/"base"           → z2
  "endurance"/"sustentado"/"base forte"                → z3
  "limiar"/"threshold"/"LT2"/"tempo run"/"ritmo prova" → z4
  "vo2"/"vo2max"/"crítico"/"intervalado"               → z5
  "potência"/"anaeróbio"/"velocidade"/"sprint"/"neuro" → z6
  "trote"/"jogger"/"regenerativo"/"leve"/"descanso ativo" → trote

Ritmo de prova específico:
  "ritmo de 42km"/"ritmo de maratona" → use referência de maratona
  "ritmo de 21km"/"ritmo de meia"     → use referência de meia
  "ritmo de 10km"                     → use referência de 10km
  "ritmo de 5km"                      → use referência de 5km

═══════════════════════════════════════════
CONVERSÃO DE UNIDADES (OBRIGATÓRIO)
═══════════════════════════════════════════
Distâncias → km (value como string numérica):
  100m=0.1 | 200m=0.2 | 400m=0.4 | 500m=0.5 | 800m=0.8
  1000m=1  | 1200m=1.2| 1500m=1.5| 2000m=2  | 5000m=5

Tempo em "value" (contínuo/variação) → minutos:
  30s=0.5 | 45s=0.75 | 1min=1 | 90s=1.5 | 5min=5 | 10min=10 | 1h=60

restValue (descanso passivo) → MINUTOS ou M:SS:
  30s="0:30" | 45s="0:45" | 1min="1" | 90s="1:30" | 2min="2" | 3min="3"

═══════════════════════════════════════════
EXEMPLOS COMPLETOS
═══════════════════════════════════════════

ENTRADA: "8km z1"
SAÍDA:
{"title":"Continuo - Endurance Leve - Z1 - 8km","type":"corrida","description":"Série Principal:\n8km z1","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"continuo","measureType":"distance","value":"8","zone":"z1"}]}]}

ENTRADA: "30min aeróbico moderado"
SAÍDA:
{"title":"Continuo - Endurance Extensivo - Z2 - 30min","type":"corrida","description":"Série Principal:\n30min z2","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"continuo","measureType":"time","value":"30","zone":"z2"}]}]}

ENTRADA: "aquecimento 3km fácil, ativações 3x300m rápido com 200m trote, série 8x800m no limiar com 400m trote, volta 1km tranquilo"
SAÍDA:
{"title":"Int. Ativo - Limiar - Z4 - 8×800m","type":"corrida","description":"Aquecimento:\n3km z1\n\nEstímulos:\n3× 300m z5 / 200m trote\n\nSérie Principal:\n8× 800m z4 / 400m trote\n\nVolta à calma:\n1km z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"3","zone":"z1"}]},{"sectionType":"estimulos","subBlocks":[{"type":"intervalado","repeat":3,"workMeasure":"distance","workValue":"0.3","workZone":"z5","restType":"active","restMeasure":"distance","restValue":"0.2","restZone":"trote"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":8,"workMeasure":"distance","workValue":"0.8","workZone":"z4","restType":"active","restMeasure":"distance","restValue":"0.4","restZone":"trote"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1"}]}]}

ENTRADA: "aquecimento 20min fácil, 10x400m vo2max com 1 minuto de descanso passivo, volta 10min z1"
SAÍDA:
{"title":"Int. Passivo - VO2 Max - Z5 - 10×400m","type":"corrida","description":"Aquecimento:\n20min z1\n\nSérie Principal:\n10× 400m z5 i=1'\n\nVolta à calma:\n10min z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"time","value":"20","zone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"0.4","workZone":"z5","restType":"passive","restMeasure":"time","restValue":"1","restZone":"z0"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"time","value":"10","zone":"z1"}]}]}

ENTRADA: "long run 20km progressivo: 8km moderado, 8km endurance, 4km no limiar"
SAÍDA:
{"title":"Continuo Prog. - Endurance Extensivo a Limiar - Z2 a Z4 - 20km","type":"corrida","description":"Série Principal:\n8km z2\n8km z3\n4km z4","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"continuo","measureType":"distance","value":"8","zone":"z2"},{"type":"continuo","measureType":"distance","value":"8","zone":"z3"},{"type":"continuo","measureType":"distance","value":"4","zone":"z4"}]}]}

ENTRADA: "aquecimento 2km fácil, fartlek 6x(3min limiar + 2min trote), volta 1km fácil"
SAÍDA:
{"title":"Fartlek - Limiar - Z4 - 6×3min","type":"corrida","description":"Aquecimento:\n2km z1\n\nSérie Principal:\n6× 3min z4 / 2min trote\n\nVolta à calma:\n1km z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"2","zone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":6,"workMeasure":"time","workValue":"3","workZone":"z4","restType":"active","restMeasure":"time","restValue":"2","restZone":"trote"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1"}]}]}

ENTRADA: "suja roupa 8km z0"
SAÍDA:
{"title":"Suja Roupa - Regenerativo - Z0 - 8km","type":"corrida","description":"Série Principal:\n8km z0","blocks":[{"sectionType":"serie_principal","subBlocks":[{"type":"continuo","measureType":"distance","value":"8","zone":"z0"}]}]}

ENTRADA: "aquecimento 2km fácil, série 10x400m potência com 1min30 passivo e depois 2x2km limiar com 3min passivo, volta 1km fácil"
SAÍDA:
{"title":"Int. Passivo - Potência Anaeróbia e Limiar - Z6/Z4 - 10×400m+2×2km","type":"corrida","description":"Aquecimento:\n2km z1\n\nSérie Principal:\n10× 400m z6 i=1'30''\n2× 2km z4 i=3'\n\nVolta à calma:\n1km z1","blocks":[{"sectionType":"aquecimento","subBlocks":[{"type":"continuo","measureType":"distance","value":"2","zone":"z1"}]},{"sectionType":"serie_principal","subBlocks":[{"type":"intervalado","repeat":10,"workMeasure":"distance","workValue":"0.4","workZone":"z6","restType":"passive","restMeasure":"time","restValue":"1:30","restZone":"z0"},{"type":"intervalado","repeat":2,"workMeasure":"distance","workValue":"2","workZone":"z4","restType":"passive","restMeasure":"time","restValue":"3","restZone":"z0"}]},{"sectionType":"volta_calma","subBlocks":[{"type":"continuo","measureType":"distance","value":"1","zone":"z1"}]}]}

═══════════════════════════════════════════
QUANDO PEDIR ESCLARECIMENTOS
═══════════════════════════════════════════
Se informações CRÍTICAS estiverem ausentes para gerar o treino corretamente, retorne:
{
  "clarifications": [
    {
      "id": "q1",
      "context": "Para os 6×400m z6",
      "question": "Qual o descanso entre as repetições?",
      "suggestions": ["1min passivo", "1:30min passivo", "2min passivo", "200m trote", "400m trote"]
    }
  ]
}

Exemplo — zona ausente em aquecimento/volta à calma:
ENTRADA: "aquecimento 3km, 10x400m z5 i=1', volta 1km"
CLARIFICAÇÃO:
{"clarifications": [
  {
    "id": "q1",
    "context": "Aquecimento (3km)",
    "question": "Qual a intensidade do aquecimento?",
    "suggestions": ["z1 — fácil", "z2 — moderado", "trote — muito leve"]
  },
  {
    "id": "q2",
    "context": "Volta à calma (1km)",
    "question": "Qual a intensidade da volta à calma?",
    "suggestions": ["z1 — fácil", "z0 — regenerativo", "trote — muito leve"]
  }
]}

Exemplo — zona ausente num bloco da série:
ENTRADA: "aquecimento 3km fácil, série 1x1,6km + 2x800m z4 + 4x400m z5 i=1', volta 1km fácil"
CLARIFICAÇÃO:
{"clarifications": [
  {
    "id": "q1",
    "context": "Série Principal — 1×1,6km",
    "question": "Qual a zona do 1,6km?",
    "suggestions": ["z3 — endurance", "z4 — limiar", "z5 — VO2max"]
  },
  {
    "id": "q2",
    "context": "Série Principal — descanso entre os blocos",
    "question": "Qual o descanso entre os blocos da série?",
    "suggestions": ["1min passivo", "2min passivo", "3min passivo", "400m trote"]
  }
]}

⛔ ANTI-PADRÃO — PROIBIDO assumir zona por nome de seção:
  "aquecimento Xkm" sem zona ou descritor → NUNCA coloque z1. SEMPRE pergunte.
  "volta à calma Xkm" sem zona ou descritor → NUNCA coloque z1. SEMPRE pergunte.
  "aquecimento" e "volta_calma" são NOMES DE SEÇÃO, não zonas de intensidade.
  A IA NÃO sabe se o aquecimento é z1, z0, trote ou z2 — só o treinador sabe.

  ERRADO (nunca faça):
    Entrada: "aquecimento 3km, série 10×400m z5 i=1', volta 2km z1"
    ❌ Gerar: aquecimento com "zone":"z1" sem o usuário ter dito z1

  CORRETO:
    → Retornar {"clarifications":[{"id":"q1","context":"Aquecimento (3km)","question":"Qual a intensidade do aquecimento?","suggestions":["z1 — fácil","z0 — regenerativo","trote — muito leve"]}]}

PEÇA clarificação quando:
1. Bloco com descanso (i= ou /) mas SEM número de repetições explícito
   → "3km z4 i=2'" → pergunte: "Quantas repetições do 3km z4?"
2. Zona ausente num bloco contínuo SEM nenhuma palavra de intensidade
   → "aquecimento 3km" sem zona e sem "fácil/leve/moderado/tranquilo" = PERGUNTE a zona — obrigatório
   → "volta à calma 2km" sem zona e sem descriptor = PERGUNTE a zona — obrigatório
   → O nome da seção (aquecimento, volta_calma) NÃO implica zona — só o texto do usuário define
3. Descanso de intervalos completamente ausente
4. Zona ausente num bloco intervalado quando outros blocos da mesma série têm zonas distintas

NÃO peça clarificação se a zona puder ser inferida por:
   a) Zona explícita no texto: "z1", "z2", "z3", "z4", "z5", "z6", "trote"
   b) Palavra de intensidade presente:
      "fácil"/"leve"/"tranquilo"/"recovery"/"suave"    → z1  (não pergunte)
      "moderado"/"aeróbico"/"conversação"              → z2  (não pergunte)
      "endurance"/"sustentado"/"base forte"            → z3  (não pergunte)
      "limiar"/"threshold"/"LT2"/"tempo run"           → z4  (não pergunte)
      "vo2max"/"vo2"/"crítico"                         → z5  (não pergunte)
      "potência"/"anaeróbio"/"sprint"/"neuro"          → z6  (não pergunte)
      "trote"/"regenerativo"/"jogger"                  → trote (não pergunte)
   c) Estilo do treino infere o descanso: "fartlek" → ativo, "suja roupa" → Z0
   d) Blocos intervalados da MESMA seção com a mesma zona e um sem zona → assuma igual

ATENÇÃO: perguntar sobre zona de aquecimento/volta à calma sem descriptor é obrigatório.
Exemplo: "aquecimento 3km, 10x400m z5 i=1', volta 1km"
→ DEVE perguntar: zona do aquecimento (3km) e zona da volta à calma (1km)

Responda APENAS com JSON válido, sem texto extra, sem \`\`\`json, sem comentários.`;

const EXAMPLES = [
  'Aquecimento 3km fácil, ativações 3x300m rápido com 200m trote, série 10x800m no limiar com 400m trote, volta à calma 1km tranquilo',
  'Aquecimento 20min fácil, fartlek 6x(5min limiar + 3min trote), volta 10min regenerativo',
  'Long run 18km progressivo: 8km moderado, 6km endurance, 4km limiar',
  'Suja roupa: aquecimento 2km, 5x1km vo2max com 90 segundos descanso passivo, volta 1km',
  'Aquecimento 2km, série mista: 10x400m potência com 1min30 passivo e depois 2x2km limiar com 3min passivo, volta 1km',
];

const SECTION_LABELS = { aquecimento:'Aquecimento', estimulos:'Estímulos', transicao:'Transição', serie_principal:'Série Principal', volta_calma:'Volta à Calma' };
const SECTION_COLORS = { aquecimento:'#FB923C', estimulos:'#A78BFA', transicao:'#60A5FA', serie_principal:'#EF4444', volta_calma:'#94A3B8' };

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
    // zone field is already 'zone' — just ensure value is a string
    out.value = String(out.value ?? '');
    out.measureType = out.measureType || 'distance';
  }

  if (type === 'interval') {
    // WorkoutForm reads obj['workzone'] and obj['restzone'] (lowercase, no camel)
    if (out.workZone)  { out.workzone  = out.workZone;  delete out.workZone; }
    if (out.restZone)  { out.restzone  = out.restZone;  delete out.restZone; }
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
export default function AIWorkoutBuilder({ context, onClose, onOpenEditor }) {
  const { state, dispatch } = useApp();
  const [prompt, setPrompt]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [generated, setGenerated]       = useState(null);
  const [saved, setSaved]               = useState(null);
  // Clarification flow
  const [clarifications, setClarifications] = useState(null); // [{id,context,question,suggestions}]
  const [answers, setAnswers]               = useState({});   // {q1: '...'}
  const textareaRef = useRef(null);

  const apiKey = state.anthropicApiKey;
  const hasKey = apiKey && apiKey.trim().length > 10;

  // ── Call API ──────────────────────────────────────────────────────────────
  async function callAPI(userMessage) {
    const racePaceRuleText = buildRacePaceRuleText(state.racePaceConfig);
    const res = await fetch(`${ANTHROPIC_API_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: `${SYSTEM_PROMPT}\n\n${racePaceRuleText}`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404 && ANTHROPIC_API_BASE_URL === '/anthropic') {
        throw new Error('Endpoint da Anthropic indisponivel neste ambiente. Configure VITE_ANTHROPIC_API_BASE_URL ou um proxy /anthropic no deploy.');
      }
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
    if (!prompt.trim() || !hasKey) return;
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
  }

  function openEditor() {
    if (!generated || !onOpenEditor) return;
    onOpenEditor(generated);
    onClose();
  }

  // ── Clarification step UI ─────────────────────────────────────────────────
  const showInput         = !saved && !clarifications && !generated;
  const showClarification = !saved && !!clarifications && !generated;
  const showPreview       = !saved && !!generated;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#001F3F] to-[#0a3a6e] rounded-t-2xl px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-lg">✨ Construtor com IA</h2>
            <p className="text-blue-300 text-xs mt-0.5">
              {showClarification
                ? 'Preciso de mais alguns detalhes para montar o treino'
                : context
                  ? 'Gerando treino para este dia do calendário'
                  : 'Treino gerado vai para a Biblioteca'}
            </p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* No API key */}
          {!hasKey && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-700">🔑 Chave da API não configurada</p>
              <p className="text-xs text-amber-600 mt-1">Acesse <strong>⚙️ Config. → 🤖 Construtor IA</strong> e cadastre sua chave Anthropic.</p>
            </div>
          )}

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
                <p className="text-[10px] text-slate-300">
                  Em producao, este recurso precisa de um endpoint Anthropic em <span className="font-mono">/anthropic</span> ou da env <span className="font-mono">VITE_ANTHROPIC_API_BASE_URL</span>.
                </p>
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
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">{saved === 'day' ? '📅' : '📚'}</div>
              <p className="font-black text-green-700 text-base">
                {saved === 'day' ? 'Treino adicionado ao calendário!' : 'Treino salvo na Biblioteca!'}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {saved === 'day' ? 'Aparece no dia que você selecionou.' : 'Disponível em Biblioteca → Sem pasta.'}
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
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || !hasKey || loading}
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
                {context && (
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
          {saved && (
            <div className="flex justify-between gap-3">
              <button onClick={() => { setSaved(null); setGenerated(null); setPrompt(''); setClarifications(null); setAnswers({}); }}
                className="btn-secondary">Gerar outro</button>
              <button onClick={onClose} className="btn-primary">Fechar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
