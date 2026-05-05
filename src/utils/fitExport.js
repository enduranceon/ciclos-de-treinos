// ── FIT Workout File Generator ─────────────────────────────────────────────────
// Generates a Garmin FIT workout file (.fit) from our workout block structure.
// Compatible with Garmin devices, Wahoo, TrainingPeaks import, and others.
//
// FIT protocol reference: https://developer.garmin.com/fit/file-types/workout/

const FIT_EPOCH_MS = 631065600000; // FIT epoch: Dec 31, 1989 00:00:00 UTC

// Parse numeric string accepting comma or period as decimal separator
function pf(val) { return parseFloat(String(val || '').replace(',', '.')) || 0; }

// ── FIT base types ─────────────────────────────────────────────────────────────
const T_UINT8  = 0x02;
const T_UINT16 = 0x84;
const T_UINT32 = 0x86;
const T_STRING = 0x07;

// ── Enums ──────────────────────────────────────────────────────────────────────
const SPORT = { corrida: 1, bike: 2, natacao: 5, forca: 10, descanso: 0 };

const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, interval: 4 };

const BLOCK_INTENSITY = {
  warmup:     INTENSITY.warmup,
  continuous: INTENSITY.active,
  transition: INTENSITY.active,
  cooldown:   INTENSITY.cooldown,
  interval:   INTENSITY.interval,
  variation:  INTENSITY.interval,
  stimulus:   INTENSITY.interval,
  ramp:       INTENSITY.active,
};

// target_type: 2 = open (no target), 4 = power (% × 10 for custom ranges)
const TARGET_OPEN  = 2;
const TARGET_POWER = 4;

// Sports that support % of threshold target via power field
const SPORTS_WITH_PCT_TARGET = new Set(['corrida', 'bike']);

const NAME_LEN = 17; // max 16 visible chars + null terminator

// ── CRC ───────────────────────────────────────────────────────────────────────
const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function calcCRC(bytes, start = 0, end = bytes.length) {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc ^= tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF];     crc = (crc >> 4) & 0x0FFF; crc ^= tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc;
}

// ── Binary writer ─────────────────────────────────────────────────────────────
class FitBuf {
  constructor() { this.bytes = []; }

  u8(v)  { this.bytes.push(v & 0xFF); }
  u16(v) { this.bytes.push(v & 0xFF, (v >> 8) & 0xFF); }
  u32(v) { this.bytes.push((v >>> 0) & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

  str(s, len) {
    const enc = new TextEncoder().encode((s || '').slice(0, len - 1));
    for (let i = 0; i < len; i++) this.bytes.push(i < enc.length ? enc[i] : 0x00);
  }

  // Definition message: local_num, global_mesg_num, fields [{num, size, type}]
  def(local, global, fields) {
    this.u8(0x40 | (local & 0x0F));
    this.u8(0); this.u8(0); // reserved, little-endian
    this.u16(global);
    this.u8(fields.length);
    for (const f of fields) { this.u8(f.num); this.u8(f.size); this.u8(f.type); }
  }

  // Data message header
  rec(local) { this.u8(local & 0x0F); }
}

// ── Duration helpers ──────────────────────────────────────────────────────────
function parseMins(val) {
  const s = String(val || '');
  const parts = s.split(':');
  if (parts.length === 2) return (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
  return parseFloat(s.replace(',', '.')) || 0;
}

function fitDuration(measureType, value) {
  if (measureType === 'distance') {
    const km = parseFloat(String(value).replace(',', '.')) || 0;
    return { type: 1, value: Math.max(Math.round(km * 100000), 100) }; // centimeters
  }
  const mins = parseMins(value);
  return { type: 0, value: Math.max(Math.round(mins * 60000), 1000) }; // milliseconds
}

// Build FIT target from block target info + zone config.
// Uses custom_target_value_low/high with % × 10 encoding (Garmin power % format).
// target_value must be 0 when using custom range.
// obj: a block or stimulus; prefix: '' | 'work' | 'rest'
function fitTarget(obj, prefix, zoneConfig, sport) {
  if (!SPORTS_WITH_PCT_TARGET.has(sport)) {
    return { type: TARGET_OPEN, value: 0, low: 0, high: 0 };
  }

  const mode = obj[`${prefix}targetMode`] || 'zone';

  if (mode === 'pct') {
    const p = pf(obj[`${prefix}targetPct`]);
    if (!p) return { type: TARGET_OPEN, value: 0, low: 0, high: 0 };
    return { type: TARGET_POWER, value: 0, low: Math.round(p * 10), high: Math.round(p * 10) };
  }

  if (mode === 'range') {
    const lo = pf(obj[`${prefix}targetLow`]);
    const hi = pf(obj[`${prefix}targetHigh`]);
    if (!lo && !hi) return { type: TARGET_OPEN, value: 0, low: 0, high: 0 };
    return { type: TARGET_POWER, value: 0, low: Math.round(lo * 10), high: Math.round(hi * 10) };
  }

  // zone mode
  const zoneKey = obj[`${prefix}zone`] || obj.zone;
  const zone = (zoneConfig || []).find(z => z.key === zoneKey);
  if (!zone || !zone.low || !zone.high) {
    return { type: TARGET_OPEN, value: 0, low: 0, high: 0 };
  }
  return { type: TARGET_POWER, value: 0, low: Math.round(zone.low * 10), high: Math.round(zone.high * 10) };
}

// ── Flatten sections → sub-blocks (new 2-level format compat) ────────────────
function flattenBlocks(blocks) {
  const result = [];
  for (const b of (blocks || [])) {
    if (b.sectionType !== undefined) result.push(...(b.subBlocks || []));
    else result.push(b);
  }
  return result;
}

// ── Block → FIT steps ─────────────────────────────────────────────────────────
function blocksToSteps(blocks, zoneConfig, sport) {
  const steps = [];
  const flat = flattenBlocks(blocks); // handles both old flat and new nested format

  for (const b of flat) {
    if (['warmup', 'continuous', 'transition', 'cooldown'].includes(b.type)) {
      const dur = fitDuration(b.measureType, b.value);
      const tgt = fitTarget(b, '', zoneConfig, sport);
      steps.push({
        name: b.type.slice(0, 16),
        durType: dur.type, durVal: dur.value,
        tgtType: tgt.type, tgtVal: tgt.value,
        tgtLow: tgt.low,  tgtHigh: tgt.high,
        intensity: BLOCK_INTENSITY[b.type],
      });

    } else if (b.type === 'interval') {
      const rep = Math.min(parseInt(b.repeat) || 1, 50);
      const workDur = fitDuration(b.workMeasure, b.workValue);
      const workTgt = fitTarget(b, 'work', zoneConfig, sport);

      let restDur, restTgt;
      if (b.restType === 'passive') {
        restDur = fitDuration('time', b.restValue);
        restTgt = { type: TARGET_OPEN, value: 0, low: 0, high: 0 };
      } else {
        restDur = fitDuration(b.restMeasure, b.restValue);
        restTgt = fitTarget(b, 'rest', zoneConfig, sport);
      }

      for (let i = 0; i < rep; i++) {
        steps.push({ name: `Esforo ${i + 1}`, durType: workDur.type, durVal: workDur.value, tgtType: workTgt.type, tgtVal: workTgt.value, tgtLow: workTgt.low, tgtHigh: workTgt.high, intensity: INTENSITY.interval });
        steps.push({ name: `Desc ${i + 1}`,   durType: restDur.type, durVal: restDur.value, tgtType: restTgt.type, tgtVal: restTgt.value, tgtLow: restTgt.low, tgtHigh: restTgt.high, intensity: INTENSITY.rest });
      }

    } else if (['variation', 'stimulus'].includes(b.type)) {
      const rep = Math.min(parseInt(b.repeat) || 1, 20);
      const stimuli = b.stimuli || [];
      for (let i = 0; i < rep; i++) {
        stimuli.forEach((st, si) => {
          const dur = fitDuration(st.measureType, st.value);
          const tgt = fitTarget(st, '', zoneConfig, sport);
          steps.push({ name: `Est ${i + 1}.${si + 1}`, durType: dur.type, durVal: dur.value, tgtType: tgt.type, tgtVal: tgt.value, tgtLow: tgt.low, tgtHigh: tgt.high, intensity: INTENSITY.interval });
        });
      }

    } else if (b.type === 'ramp') {
      const rep = Math.min(parseInt(b.repeat) || 1, 10);
      const rampSteps = b.steps || [];
      for (let i = 0; i < rep; i++) {
        rampSteps.forEach((st, si) => {
          const dur = fitDuration(st.measureType, st.value);
          const tgt = fitTarget(st, '', zoneConfig, sport);
          steps.push({ name: `Ramp ${i + 1}.${si + 1}`, durType: dur.type, durVal: dur.value, tgtType: tgt.type, tgtVal: tgt.value, tgtLow: tgt.low, tgtHigh: tgt.high, intensity: INTENSITY.active });
        });
      }
    }
  }

  return steps;
}

// ── Main export ────────────────────────────────────────────────────────────────
export function generateFIT(workout, zoneConfig) {
  const sport = workout.type || 'corrida';
  const steps = blocksToSteps(workout.blocks || [], zoneConfig, sport);
  const buf   = new FitBuf();
  const ts    = Math.floor((Date.now() - FIT_EPOCH_MS) / 1000);

  // Local 0: file_id (global=0)
  buf.def(0, 0, [
    { num: 0, size: 1, type: T_UINT8  }, // type
    { num: 1, size: 2, type: T_UINT16 }, // manufacturer
    { num: 4, size: 4, type: T_UINT32 }, // time_created
  ]);
  buf.rec(0); buf.u8(5); buf.u16(255); buf.u32(ts); // type=workout, manufacturer=development

  // Local 1: workout (global=26)
  buf.def(1, 26, [
    { num: 4, size: 1,        type: T_UINT8  }, // sport
    { num: 6, size: 2,        type: T_UINT16 }, // num_valid_steps
    { num: 8, size: NAME_LEN, type: T_STRING }, // wkt_name
  ]);
  buf.rec(1);
  buf.u8(SPORT[sport] ?? 0);
  buf.u16(steps.length);
  buf.str(workout.title || 'Treino', NAME_LEN);

  // Local 2: workout_step (global=27)
  // Fields: 254=message_index, 0=name, 1=duration_type, 2=duration_value,
  //         3=target_type, 4=target_value, 5=custom_target_low, 6=custom_target_high, 7=intensity
  buf.def(2, 27, [
    { num: 254, size: 2,        type: T_UINT16 },
    { num: 0,   size: NAME_LEN, type: T_STRING },
    { num: 1,   size: 1,        type: T_UINT8  },
    { num: 2,   size: 4,        type: T_UINT32 },
    { num: 3,   size: 1,        type: T_UINT8  },
    { num: 4,   size: 4,        type: T_UINT32 },
    { num: 5,   size: 4,        type: T_UINT32 },
    { num: 6,   size: 4,        type: T_UINT32 },
    { num: 7,   size: 1,        type: T_UINT8  },
  ]);

  steps.forEach((s, i) => {
    buf.rec(2);
    buf.u16(i);
    buf.str(s.name, NAME_LEN);
    buf.u8(s.durType);  buf.u32(s.durVal);
    buf.u8(s.tgtType);  buf.u32(s.tgtVal);
    buf.u32(s.tgtLow);  buf.u32(s.tgtHigh);
    buf.u8(s.intensity);
  });

  const data = buf.bytes;

  // ── FIT file header (14 bytes) ────────────────────────────────────────────
  const header = [
    14,         // header_size
    0x20,       // protocol_version 2.0
    0x4B, 0x08, // profile_version 2123
    data.length & 0xFF, (data.length >> 8) & 0xFF,
    (data.length >> 16) & 0xFF, (data.length >> 24) & 0xFF,
    0x2E, 0x46, 0x49, 0x54, // ".FIT"
    0, 0, // header CRC placeholder
  ];
  const hCRC = calcCRC(header, 0, 12);
  header[12] = hCRC & 0xFF; header[13] = (hCRC >> 8) & 0xFF;

  const fileCRC = calcCRC(data);

  return new Uint8Array([
    ...header,
    ...data,
    fileCRC & 0xFF, (fileCRC >> 8) & 0xFF,
  ]);
}

export function downloadFIT(workout, zoneConfig) {
  const bytes = generateFIT(workout, zoneConfig);
  const blob  = new Blob([bytes], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href     = url;
  a.download = `${(workout.title || 'treino').replace(/\s+/g, '_')}.fit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
