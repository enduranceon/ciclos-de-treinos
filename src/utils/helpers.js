export function uuid() {
  return crypto.randomUUID();
}

export function subtractWeeks(dateStr, weeks) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().split('T')[0];
}

// Returns the Monday of the week containing dateStr
function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Block model (7 types) ────────────────────────────────────────────────────
//
// CONTINUOUS (warmup, transition, cooldown):
//   { type, measureType, value, zone }
//
// INTERVAL:
//   { type:'interval', repeat, workMeasure, workValue, workZone,
//     restType:'active'|'passive', restMeasure, restValue, restZone }
//   passive rest: time only, no distance added
//
// VARIATION (fartlek with N stimuli per rep):
//   { type:'variation', repeat, stimuli: [{id,measureType,value,zone},...] }
//
// STIMULUS (single repeated stimulus + optional passive rest):
//   { type:'stimulus', repeat, measureType, value, zone,
//     hasPassiveRest, restDuration }
//
// RAMP:
//   { type:'ramp', repeat, steps: [{id,measureType,value,zone},...] }
//   repeat=1 → linear sequence; repeat>1 → that set repeats N times

// Parse a numeric string accepting both comma and period as decimal separator
export function pf(val) { return parseFloat(String(val || '').replace(',', '.')) || 0; }

function _parseMin(val) {
  const s = String(val || '');
  const parts = s.split(':');
  if (parts.length === 2) return (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
  return pf(s);
}

function _stimDist(s) {
  return s.measureType === 'distance' ? pf(s.value) : 0;
}
function _stimTime(s) {
  return s.measureType === 'time' ? pf(s.value) : 0;
}

const ZONE_KEYS_FOR_VOLUME = ['z0', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6'];

function _zoneCfg(cfg) {
  return Array.isArray(cfg) && cfg.length ? cfg : DEFAULT_ZONE_CONFIG;
}

function _fitZoneForPct(pct, zoneConfig) {
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const cfg = _zoneCfg(zoneConfig);
  return cfg.find(z => ZONE_KEYS_FOR_VOLUME.includes(z.key) && pct >= z.low && pct <= z.high)?.key || null;
}

function _rangeShares(lowRaw, highRaw, zoneConfig) {
  const low = pf(lowRaw);
  const high = pf(highRaw);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null;

  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const cfg = _zoneCfg(zoneConfig).filter(z => ZONE_KEYS_FOR_VOLUME.includes(z.key));

  const overlaps = cfg.map(z => {
    const ov = Math.max(0, Math.min(hi, z.high) - Math.max(lo, z.low));
    return { key: z.key, overlap: ov };
  }).filter(o => o.overlap > 0);

  const total = overlaps.reduce((s, o) => s + o.overlap, 0);
  if (total > 0) {
    return overlaps.map(o => ({ key: o.key, share: o.overlap / total }));
  }

  const mid = (lo + hi) / 2;
  const zoneKey = _fitZoneForPct(mid, cfg);
  return zoneKey ? [{ key: zoneKey, share: 1 }] : null;
}

function _addWithTarget({ addZ, km, zone, mode, pct, low, high, zoneConfig }) {
  if (!km || km <= 0) return;
  if (mode === 'range') {
    const shares = _rangeShares(low, high, zoneConfig);
    if (shares?.length) {
      shares.forEach(({ key, share }) => addZ(key, km * share));
      return;
    }
  }
  if (mode === 'pct') {
    const zoneKey = _fitZoneForPct(pf(pct), zoneConfig);
    if (zoneKey) {
      addZ(zoneKey, km);
      return;
    }
  }
  addZ(zone, km);
}

// ─── 2-level block model ──────────────────────────────────────────────────────
//
// NEW FORMAT (sections):
//   { id, sectionType: 'aquecimento'|'ativacao'|'strides'|'transicao'|'serie_principal'|'volta_calma',
//     subBlocks: [ subBlock, ... ] }
//
// LEGACY FORMAT (flat blocks, still supported for existing workouts):
//   { id, type: 'warmup'|'continuous'|'interval'|..., ... }
//
// All calculation functions check `block.sectionType` to dispatch correctly.

export function blockDistance(block) {
  // New: section with subBlocks
  if (block.sectionType !== undefined) {
    return (block.subBlocks || []).reduce((s, sb) => s + blockDistance(sb), 0);
  }
  // Legacy / sub-block
  const reps = parseInt(block.repeat) || 1;
  switch (block.type) {
    case 'warmup': case 'continuous': case 'transition': case 'cooldown':
      return block.measureType === 'distance' ? (pf(block.value) || 0) : 0;
    case 'interval': {
      const work = block.workMeasure === 'distance' ? (pf(block.workValue) || 0) : 0;
      const rest = block.restType === 'active' && block.restMeasure === 'distance'
        ? (pf(block.restValue) || 0) : 0;
      return (work + rest) * reps;
    }
    case 'variation':
    case 'stimulus':
      return ((block.stimuli || []).reduce((s, st) => s + _stimDist(st), 0)) * reps;
    case 'ramp':
      return ((block.steps || []).reduce((s, st) => s + _stimDist(st), 0)) * reps;
    default: return 0;
  }
}

export function blockDurationMin(block) {
  // New: section with subBlocks
  if (block.sectionType !== undefined) {
    return (block.subBlocks || []).reduce((s, sb) => s + blockDurationMin(sb), 0);
  }
  // Legacy / sub-block
  const reps = parseInt(block.repeat) || 1;
  switch (block.type) {
    case 'warmup': case 'continuous': case 'transition': case 'cooldown':
      return block.measureType === 'time' ? (pf(block.value) || 0) : 0;
    case 'interval': {
      const work = block.workMeasure === 'time' ? (pf(block.workValue) || 0) : 0;
      const rest = block.restType === 'passive'
        ? _parseMin(block.restValue)
        : (block.restMeasure === 'time' ? (pf(block.restValue) || 0) : 0);
      return (work + rest) * reps;
    }
    case 'variation':
    case 'stimulus':
      return ((block.stimuli || []).reduce((s, st) => s + _stimTime(st), 0)) * reps;
    case 'ramp':
      return ((block.steps || []).reduce((s, st) => s + _stimTime(st), 0)) * reps;
    default: return 0;
  }
}

// Zone km for intensity calculations (passive rest adds no km)
export function blockZoneKm(block, zoneConfig = DEFAULT_ZONE_CONFIG) {
  // New: section with subBlocks
  if (block.sectionType !== undefined) {
    const result = { z0:0, z1:0, z2:0, z3:0, z4:0, z5:0, z6:0 };
    (block.subBlocks || []).forEach(sb => {
      const bz = blockZoneKm(sb, zoneConfig);
      Object.keys(result).forEach(z => { result[z] += bz[z]; });
    });
    return result;
  }
  // Legacy / sub-block
  const result = { z0:0, z1:0, z2:0, z3:0, z4:0, z5:0, z6:0 };
  const addZ = (zone, km) => { if (zone && result[zone] !== undefined) result[zone] += km; };
  const reps = parseInt(block.repeat) || 1;

  switch (block.type) {
    case 'warmup': case 'continuous': case 'continuo': case 'transition': case 'cooldown':
      if (block.measureType === 'distance') {
        _addWithTarget({
          addZ,
          km: pf(block.value) || 0,
          zone: block.zone,
          mode: block.targetMode || block.targetmode || 'zone',
          pct: block.targetPct || block.targetpct,
          low: block.targetLow || block.targetlow,
          high: block.targetHigh || block.targethigh,
          zoneConfig,
        });
      }
      break;
    case 'interval':
    case 'intervalado': {
      const work = block.workMeasure === 'distance' ? (pf(block.workValue) || 0) : 0;
      _addWithTarget({
        addZ,
        km: work * reps,
        zone: block.workZone || block.workzone,
        mode: block.worktargetMode || block.workTargetMode || 'zone',
        pct: block.worktargetPct || block.workTargetPct,
        low: block.worktargetLow || block.workTargetLow,
        high: block.worktargetHigh || block.workTargetHigh,
        zoneConfig,
      });
      if (block.restType === 'active' && block.restMeasure === 'distance') {
        _addWithTarget({
          addZ,
          km: (pf(block.restValue) || 0) * reps,
          zone: block.restZone || block.restzone,
          mode: block.resttargetMode || block.restTargetMode || 'zone',
          pct: block.resttargetPct || block.restTargetPct,
          low: block.resttargetLow || block.restTargetLow,
          high: block.resttargetHigh || block.restTargetHigh,
          zoneConfig,
        });
      }
      break;
    }
    case 'variation':
    case 'stimulus':
      (block.stimuli || []).forEach(st => {
        if (st.measureType === 'distance') {
          _addWithTarget({
            addZ,
            km: (_stimDist(st)) * reps,
            zone: st.zone,
            mode: st.targetMode || st.targetmode || 'zone',
            pct: st.targetPct || st.targetpct,
            low: st.targetLow || st.targetlow,
            high: st.targetHigh || st.targethigh,
            zoneConfig,
          });
        }
      });
      break;
    case 'ramp':
      (block.steps || []).forEach(st => {
        if (st.measureType === 'distance') {
          _addWithTarget({
            addZ,
            km: (_stimDist(st)) * reps,
            zone: st.zone,
            mode: st.targetMode || st.targetmode || 'zone',
            pct: st.targetPct || st.targetpct,
            low: st.targetLow || st.targetlow,
            high: st.targetHigh || st.targethigh,
            zoneConfig,
          });
        }
      });
      break;
    default: break;
  }
  return result;
}

// Flatten sections → sub-blocks (for chart/visualization), with legacy compat
export function flattenBlocks(blocks) {
  const result = [];
  for (const b of (blocks || [])) {
    if (b.sectionType !== undefined) {
      result.push(...(b.subBlocks || []));
    } else {
      result.push(b); // legacy flat block
    }
  }
  return result;
}

// Migrate legacy flat blocks → new section format
export function migrateBlocks(blocks) {
  if (!blocks || blocks.length === 0) return [];
  if (blocks[0]?.sectionType !== undefined) return blocks; // already new format
  // Group legacy blocks into sections
  return blocks.map(b => {
    const sectionType = {
      warmup:     'aquecimento',
      cooldown:   'volta_calma',
      transition: 'transicao',
      continuous: 'serie_principal',
      interval:   'serie_principal',
      variation:  'ativacao',
      stimulus:   'ativacao',
      ramp:       'serie_principal',
    }[b.type] || 'serie_principal';

    const subBlock = (b.type === 'warmup' || b.type === 'cooldown' || b.type === 'transition')
      ? { id: uuid(), type: 'continuous', measureType: b.measureType || 'distance',
          value: b.value || '1', zone: b.zone || 'z1', targetMode: b.targetMode || 'zone' }
      : { ...b, id: b.id || uuid() };

    return { id: uuid(), sectionType, subBlocks: [subBlock] };
  });
}

export function calcWorkoutDistance(workout) {
  return (workout.blocks || []).reduce((s, b) => s + blockDistance(b), 0);
}

export function calcWorkoutZones(workout, zoneConfig = DEFAULT_ZONE_CONFIG) {
  const totals = { z0:0, z1:0, z2:0, z3:0, z4:0, z5:0, z6:0 };
  (workout.blocks || []).forEach(b => {
    const bz = blockZoneKm(b, zoneConfig);
    Object.keys(totals).forEach(z => { totals[z] += bz[z]; });
  });
  return totals;
}

export function calcWeekVolume(workouts) {
  return workouts.reduce((sum, w) => sum + calcWorkoutDistance(w), 0);
}

export function calcWeekZones(workouts, zoneConfig = DEFAULT_ZONE_CONFIG) {
  const totals = { z0:0, z1:0, z2:0, z3:0, z4:0, z5:0, z6:0 };
  workouts.forEach(w => {
    const wz = calcWorkoutZones(w, zoneConfig);
    Object.keys(totals).forEach(z => { totals[z] += wz[z]; });
  });
  return totals;
}

export function calcWeekIntensity(workouts, zoneConfig = DEFAULT_ZONE_CONFIG) {
  const zones = calcWeekZones(workouts, zoneConfig);
  const total = Object.values(zones).reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const intense = zones.z3 + zones.z4 + zones.z5 + zones.z6;
  return Math.round((intense / total) * 100);
}

export const ZONE_STRESS_WEIGHTS = {
  z0: 15,
  z1: 25,
  z2: 45,
  z3: 70,
  z4: 95,
  z5: 125,
  z6: 160,
};

export function calcWorkoutStress(workout, zoneConfig = DEFAULT_ZONE_CONFIG) {
  const zones = calcWorkoutZones(workout, zoneConfig);
  return Object.entries(ZONE_STRESS_WEIGHTS).reduce(
    (sum, [zone, weight]) => sum + ((zones[zone] || 0) * weight),
    0
  );
}

export function calcWeekStress(workouts, zoneConfig = DEFAULT_ZONE_CONFIG) {
  return (workouts || []).reduce(
    (sum, w) => sum + calcWorkoutStress(w, zoneConfig),
    0
  );
}

// ─── Section constants ────────────────────────────────────────────────────────
export const SECTION_LABELS = {
  aquecimento:      'Aquecimento',
  ativacao:         'Ativação',
  estimulos:        'Ativação',   // legacy alias
  strides:          'Strides',
  transicao:        'Transição',
  serie_principal:  'Série Principal',
  volta_calma:      'Volta à Calma',
};

export const SECTION_COLORS = {
  aquecimento:      '#FB923C',
  ativacao:         '#EF4444',
  estimulos:        '#EF4444',   // legacy alias
  strides:          '#10B981',
  transicao:        '#60A5FA',
  serie_principal:  '#A78BFA',
  volta_calma:      '#94A3B8',
};

export const SECTION_ICONS = {
  aquecimento:      '🔥',
  ativacao:         '⚡',
  estimulos:        '⚡',   // legacy alias
  strides:          '💨',
  transicao:        '〰️',
  serie_principal:  '🎯',
  volta_calma:      '❄️',
};

// Create a new section with sensible default sub-block
export function emptySection(sectionType) {
  const st = (zone, value = '1') => ({ id: uuid(), type: 'continuous', measureType: 'distance', value, zone, targetMode: 'zone' });
  switch (sectionType) {
    case 'aquecimento':
      return { id: uuid(), sectionType, subBlocks: [st('z1', '1')] };
    case 'transicao':
      return { id: uuid(), sectionType, subBlocks: [st('z1', '0,5')] };
    case 'volta_calma':
      return { id: uuid(), sectionType, subBlocks: [st('z0', '1')] };
    case 'ativacao':
    case 'estimulos':   // legacy alias
      return { id: uuid(), sectionType: 'ativacao', subBlocks: [{
        id: uuid(), type: 'variation', repeat: 5,
        stimuli: [
          { id: uuid(), measureType: 'distance', value: '0,2', zone: 'z3', targetMode: 'zone' },
          { id: uuid(), measureType: 'distance', value: '0,2', zone: 'z4', targetMode: 'zone' },
        ],
      }]};
    case 'strides':
      return { id: uuid(), sectionType, subBlocks: [{
        id: uuid(), type: 'interval', repeat: 8,
        workMeasure: 'distance', workValue: '0.2', workzone: 'z4', worktargetMode: 'zone',
        restType: 'active', restMeasure: 'distance', restValue: '0.2', restzone: 'z1', restTargetMode: 'zone',
      }]};
    case 'serie_principal':
    default:
      return { id: uuid(), sectionType: sectionType || 'serie_principal', subBlocks: [{
        id: uuid(), type: 'interval', repeat: 6,
        workMeasure: 'distance', workValue: '0,4', workZone: 'z4', workTargetMode: 'zone',
        restType: 'passive', restMeasure: 'time', restValue: '1:30', restZone: 'z1', restTargetMode: 'zone',
      }]};
  }
}

// Default sections for a brand-new workout
export function defaultWorkoutSections() {
  return [
    emptySection('aquecimento'),
    emptySection('serie_principal'),
    emptySection('volta_calma'),
  ];
}

export function emptyBlock(type = 'warmup') {
  const st = (zone, value = '1') => ({ id: uuid(), measureType: 'distance', value, zone, targetMode: 'zone' });
  switch (type) {
    case 'warmup':
      return { id: uuid(), type, measureType: 'distance', value: '1', zone: 'z1', targetMode: 'zone' };
    case 'continuous':
      return { id: uuid(), type, measureType: 'distance', value: '5', zone: 'z2', targetMode: 'zone' };
    case 'transition':
      return { id: uuid(), type, measureType: 'distance', value: '0,5', zone: 'z1', targetMode: 'zone' };
    case 'cooldown':
      return { id: uuid(), type, measureType: 'distance', value: '1', zone: 'z0', targetMode: 'zone' };
    case 'interval':
      return { id: uuid(), type: 'interval', repeat: 6,
        workMeasure: 'distance', workValue: '0,4', workZone: 'z4', workTargetMode: 'zone',
        restType: 'passive', restMeasure: 'time', restValue: '1:30', restZone: 'z1', restTargetMode: 'zone' };
    case 'variation':
      return { id: uuid(), type: 'variation', repeat: 5,
        stimuli: [ st('z3', '0,2'), st('z4', '0,2') ] };
    case 'stimulus':
      return { id: uuid(), type: 'stimulus', repeat: 5,
        stimuli: [ st('z4', '0,4'), st('z5', '0,4') ] };
    case 'ramp':
      return { id: uuid(), type: 'ramp', repeat: 1,
        steps: [ st('z1', '1'), st('z2', '1'), st('z3', '1') ] };
    default:
      return { id: uuid(), type, measureType: 'distance', value: '1', zone: 'z1', targetMode: 'zone' };
  }
}

export function generateWeeks(totalWeeks, raceDate) {
  const weeks = [];
  const raceMonday = raceDate ? getMondayOf(raceDate) : null;
  for (let i = 0; i < totalWeeks; i++) {
    const weekNumber = i + 1;
    const weeksFromEnd = totalWeeks - weekNumber;
    const startDate = raceMonday ? subtractWeeks(raceMonday, weeksFromEnd) : null;
    const phase = weekNumber <= Math.floor(totalWeeks * 0.5) ? 'base'
      : weekNumber <= Math.floor(totalWeeks * 0.8) ? 'especifico'
      : weekNumber < totalWeeks ? 'polimento'
      : 'prova';
    weeks.push({
      id: uuid(),
      weekNumber,
      startDate,
      phase,
      workouts: [],
    });
  }
  return weeks;
}

// Recalculate week dates when a race date is assigned to a prescription
export function recalcWeekDates(weeks, raceDate) {
  const total = weeks.length;
  const raceMonday = getMondayOf(raceDate);
  return weeks.map((w, i) => {
    const weeksFromEnd = total - (i + 1);
    return { ...w, startDate: subtractWeeks(raceMonday, weeksFromEnd) };
  });
}

export const ZONE_COLORS = {
  trote: '#475569',
  z0: '#94A3B8',
  z1: '#60A5FA',
  z2: '#34D399',
  z3: '#FBBF24',
  z4: '#F97316',
  z5: '#EF4444',
  z6: '#7C3AED',
};

export const ZONE_LABELS = {
  trote: 'Trote (47–55%)',
  z0: 'Z0 – Aquecimento / Trote (55–65%)',
  z1: 'Z1 – Aeróbico Regenerativo (65–75%)',
  z2: 'Z2 – Endurance (75–86%)',
  z3: 'Z3 – Limiar Aeróbico / Maratona (86–93%)',
  z4: 'Z4 – Limiar Anaeróbico / Tempo Run (93–100%)',
  z5: 'Z5 – VO₂ Máx / Potência Aeróbica (100–110%)',
  z6: 'Z6 – Capacidade Anaeróbica (110–130%)',
};

export const DEFAULT_ZONE_CONFIG = [
  { key: 'trote', name: 'Trote',               color: '#475569', low: 47,  high: 55  },
  { key: 'z0',    name: 'Aquecimento / Trote',           color: '#94A3B8', low: 55,  high: 65  },
  { key: 'z1',    name: 'Aeróbico Regenerativo',        color: '#60A5FA', low: 65,  high: 75  },
  { key: 'z2',    name: 'Endurance',                    color: '#34D399', low: 75,  high: 86  },
  { key: 'z3',    name: 'Limiar Aeróbico / Maratona',   color: '#FBBF24', low: 86,  high: 93  },
  { key: 'z4',    name: 'Limiar Anaeróbico / Tempo Run',color: '#F97316', low: 93,  high: 100 },
  { key: 'z5',    name: 'VO2 Máx / Potência Aeróbica', color: '#EF4444', low: 100, high: 110 },
  { key: 'z6',    name: 'Capacidade Anaeróbica',        color: '#7C3AED', low: 110, high: 130 },
];

export const DEFAULT_RACE_PACE_CONFIG = [
  { key: '5k',  label: 'Ritmo de 5km',   low: 105, high: 110 },
  { key: '10k', label: 'Ritmo de 10km',  low: 100, high: 105 },
  { key: '21k', label: 'Ritmo de 21km',  low: 90,  high: 100 },
  { key: '42k', label: 'Ritmo de 42km',  low: 83,  high: 90  },
];

export const DEFAULT_PHASE_CONFIG = [
  { key: 'base',           label: 'Base',                color: '#60A5FA' },
  { key: 'prep_geral',     label: 'Prep. Geral',         color: '#A78BFA' },
  { key: 'especifico',     label: 'Específico',          color: '#FBBF24' },
  { key: 'competitivo',    label: 'Período Competitivo', color: '#F97316' },
  { key: 'polimento',      label: 'Polimento',           color: '#34D399' },
  { key: 'prova',          label: 'Prova',               color: '#EF4444' },
  { key: 'recuperativa',   label: 'Recuperativa',        color: '#94A3B8' },
];

// Build color/label lookup maps from a phaseConfig array (falls back to DEFAULT_PHASE_CONFIG)
export function buildPhaseMap(phaseConfig) {
  const cfg = phaseConfig && phaseConfig.length ? phaseConfig : DEFAULT_PHASE_CONFIG;
  return {
    colors: Object.fromEntries(cfg.map(p => [p.key, p.color])),
    labels: Object.fromEntries(cfg.map(p => [p.key, p.label])),
    list:   cfg,
  };
}

// Legacy static exports (used as fallbacks; prefer buildPhaseMap in components)
export const PHASE_LABELS = Object.fromEntries(DEFAULT_PHASE_CONFIG.map(p => [p.key, p.label]));
export const PHASE_COLORS = Object.fromEntries(DEFAULT_PHASE_CONFIG.map(p => [p.key, p.color]));

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const SPORT_ICONS = {
  corrida: '🏃',
  bike: '🚴',
  natacao: '🏊',
  forca: '💪',
  descanso: '😴',
  triathlon: '🏆',
};

export const SPORT_OPTIONS = [
  { value: 'corrida', label: '🏃 Corrida' },
  { value: 'bike', label: '🚴 Ciclismo' },
  { value: 'natacao', label: '🏊 Natação' },
  { value: 'triathlon', label: '🏆 Triathlon' },
];
