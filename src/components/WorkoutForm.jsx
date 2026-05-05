import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import AIWorkoutBuilder from './AIWorkoutBuilder';
import { downloadFIT } from '../utils/fitExport';
import {
  uuid, emptyBlock, emptySection, defaultWorkoutSections, migrateBlocks, flattenBlocks,
  blockDistance, blockDurationMin, calcWorkoutDistance,
  ZONE_COLORS, DAY_NAMES, DEFAULT_ZONE_CONFIG, pf,
  SECTION_LABELS, SECTION_COLORS, SECTION_ICONS,
} from '../utils/helpers';

// ── Constants ────────────────────────────────────────────────────────────────

const SPORT_TYPES = [
  { value: 'corrida',  label: '🏃 Corrida' },
  { value: 'bike',     label: '🚴 Ciclismo' },
  { value: 'natacao',  label: '🏊 Natação' },
  { value: 'forca',    label: '💪 Força' },
  { value: 'descanso', label: '😴 Descanso' },
];

// Level-1: sections
const SECTION_TYPES = [
  { value: 'aquecimento',     label: SECTION_LABELS.aquecimento,     color: SECTION_COLORS.aquecimento,     icon: SECTION_ICONS.aquecimento },
  { value: 'estimulos',       label: SECTION_LABELS.estimulos,       color: SECTION_COLORS.estimulos,       icon: SECTION_ICONS.estimulos },
  { value: 'transicao',       label: SECTION_LABELS.transicao,       color: SECTION_COLORS.transicao,       icon: SECTION_ICONS.transicao },
  { value: 'serie_principal', label: SECTION_LABELS.serie_principal, color: SECTION_COLORS.serie_principal, icon: SECTION_ICONS.serie_principal },
  { value: 'volta_calma',     label: SECTION_LABELS.volta_calma,     color: SECTION_COLORS.volta_calma,     icon: SECTION_ICONS.volta_calma },
];
const SECTION_META = Object.fromEntries(SECTION_TYPES.map(s => [s.value, s]));

// Level-2: sub-block types (no warmup/cooldown/transition — those are now sections)
const SUB_BLOCK_TYPES = [
  { value: 'continuous', label: 'Contínuo',                color: '#2563EB' },
  { value: 'interval',   label: 'Intervalado',             color: '#EF4444' },
  { value: 'variation',  label: 'Variação de Intensidade', color: '#A78BFA' },
  { value: 'stimulus',   label: 'Estímulo',                color: '#F59E0B' },
  { value: 'ramp',       label: 'Rampa',                   color: '#34D399' },
];
const SUB_BLOCK_META = Object.fromEntries(SUB_BLOCK_TYPES.map(b => [b.value, b]));

// Legacy block colors (for chart backward compat)
const BLOCK_COLORS = {
  warmup:     '#FB923C',
  continuous: '#2563EB',
  interval:   '#EF4444',
  transition: '#60A5FA',
  variation:  '#A78BFA',
  stimulus:   '#F59E0B',
  cooldown:   '#94A3B8',
  ramp:       '#34D399',
};

const ZONES = ['trote','z0','z1','z2','z3','z4','z5','z6'];

// ── Zone / intensity selector ─────────────────────────────────────────────────
function ZoneSelect({ target, onChange, label }) {
  const { state } = useApp();
  const zoneConfig = state.zoneConfig || DEFAULT_ZONE_CONFIG;
  const zoneMap = Object.fromEntries(zoneConfig.map(z => [z.key, z]));

  const zone       = target.zone       || 'z1';
  const mode       = target.mode       || 'zone';
  const pct        = target.pct        || '';
  const targetLow  = target.targetLow  || '';
  const targetHigh = target.targetHigh || '';
  const selected   = zoneMap[zone];

  function upd(partial) { onChange({ zone, mode, pct, targetLow, targetHigh, ...partial }); }

  function zoneForPct(raw) {
    const p = pf(raw);
    return p > 0 ? (zoneConfig.find(z => p >= z.low && p <= z.high)?.name || '') : '';
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-slate-400">{label}</p>}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {[{ key: 'zone', label: 'Zona' }, { key: 'pct', label: '% Alvo' }, { key: 'range', label: 'Range' }].map(m => (
            <button key={m.key} type="button" onClick={() => upd({ mode: m.key })}
              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                mode === m.key ? 'bg-[#001F3F] text-white' : 'bg-white text-slate-400 hover:bg-slate-50'
              }`}>{m.label}</button>
          ))}
        </div>
      </div>

      {mode === 'zone' && (
        <div>
          <div className="flex gap-0.5">
            {ZONES.map(z => {
              const zInfo = zoneMap[z] || {};
              const color = zInfo.color || ZONE_COLORS[z];
              const isSel = zone === z;
              return (
                <button key={z} type="button" onClick={() => upd({ zone: z })}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all leading-none"
                  style={{
                    backgroundColor: isSel ? color : '#F1F5F9',
                    color: isSel ? '#fff' : '#94A3B8',
                    outline: isSel ? `2px solid ${color}` : 'none',
                    outlineOffset: '2px',
                  }}
                  title={`${zInfo.name || z}: ${zInfo.low}–${zInfo.high}%`}>
                  {z === 'trote' ? 'TR' : z.toUpperCase()}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selected.color }} />
              <span className="text-xs font-semibold" style={{ color: selected.color }}>{selected.name}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs font-mono text-slate-400">{selected.low}–{selected.high}% do limiar</span>
            </div>
          )}
        </div>
      )}

      {mode === 'pct' && (
        <div className="flex items-center gap-2">
          <input type="text" inputMode="decimal" value={pct} onChange={e => upd({ pct: e.target.value })}
            placeholder="90"
            className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          <span className="text-xs text-slate-500 font-medium">% do limiar</span>
          {pct !== '' && pf(pct) > 0 && <span className="text-xs text-slate-400 italic">{zoneForPct(pct)}</span>}
        </div>
      )}

      {mode === 'range' && (
        <div className="flex items-center gap-2">
          <input type="text" inputMode="decimal" value={targetLow} onChange={e => upd({ targetLow: e.target.value })}
            placeholder="85"
            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          <span className="text-xs text-slate-400 font-mono">–</span>
          <input type="text" inputMode="decimal" value={targetHigh} onChange={e => upd({ targetHigh: e.target.value })}
            placeholder="95"
            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          <span className="text-xs text-slate-500 font-medium">% do limiar</span>
        </div>
      )}
    </div>
  );
}

// Helper: extract target from object with optional prefix
function getTarget(obj, prefix = '') {
  return {
    zone:       obj[`${prefix}zone`]       || 'z1',
    mode:       obj[`${prefix}targetMode`] || 'zone',
    pct:        obj[`${prefix}targetPct`]  || '',
    targetLow:  obj[`${prefix}targetLow`]  || '',
    targetHigh: obj[`${prefix}targetHigh`] || '',
  };
}
function mergeTarget(obj, t, prefix = '') {
  return {
    ...obj,
    [`${prefix}zone`]:       t.zone,
    [`${prefix}targetMode`]: t.mode,
    [`${prefix}targetPct`]:  t.pct,
    [`${prefix}targetLow`]:  t.targetLow,
    [`${prefix}targetHigh`]: t.targetHigh,
  };
}

// ── Measure input ──────────────────────────────────────────────────────────────
function MeasureInput({ measureType, onMeasureType, value, onValue }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg overflow-hidden border border-slate-200">
        <button type="button" onClick={() => onMeasureType('distance')}
          className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            measureType === 'distance' ? 'bg-[#001F3F] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}>km</button>
        <button type="button" onClick={() => onMeasureType('time')}
          className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            measureType === 'time' ? 'bg-[#001F3F] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}>min</button>
      </div>
      <input type="text" inputMode="decimal" value={value ?? ''}
        onChange={e => onValue(e.target.value)}
        placeholder={measureType === 'distance' ? '0,0' : '0'}
        className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
      <span className="text-xs text-slate-400">{measureType === 'distance' ? 'km' : 'min'}</span>
    </div>
  );
}

// ── RepeatCounter ──────────────────────────────────────────────────────────────
function RepeatCounter({ value, onChange, label = 'Repetições', suffix = '×' }) {
  const n = parseInt(value) || 1;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 font-medium w-28">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(1, n - 1))}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center justify-center">−</button>
      <span className="w-8 text-center font-black text-[#001F3F] text-lg">{n}</span>
      <button type="button" onClick={() => onChange(n + 1)}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center justify-center">+</button>
      <span className="text-xs text-slate-400">{suffix}</span>
    </div>
  );
}

// ── StimulusRow (for Variation / Ramp) ────────────────────────────────────────
function StimulusRow({ stimulus, onChange, onRemove, canRemove, index }) {
  const set = (k, v) => onChange({ ...stimulus, [k]: v });
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-slate-300 font-mono w-4 pt-2.5">{index + 1}</span>
      <div className="flex-1 space-y-2">
        <MeasureInput measureType={stimulus.measureType} onMeasureType={v => set('measureType', v)}
          value={stimulus.value} onValue={v => set('value', v)} />
        <ZoneSelect target={getTarget(stimulus)} onChange={t => onChange(mergeTarget(stimulus, t))} />
      </div>
      {canRemove && (
        <button type="button" onClick={onRemove} className="mt-2 p-1 text-slate-300 hover:text-red-500 text-xs">✕</button>
      )}
    </div>
  );
}

// IMPORTANT: StimuliList must be at module level (never inside another component)
// — otherwise React remounts on every parent render, destroying focus mid-typing.
function StimuliList({ items, fieldName, addLabel, onSet }) {
  return (
    <div className="space-y-1">
      {items.map((st, i) => (
        <StimulusRow key={st.id} index={i} stimulus={st} canRemove={items.length > 1}
          onChange={updated => onSet(fieldName, items.map((s, j) => j === i ? updated : s))}
          onRemove={() => onSet(fieldName, items.filter((_, j) => j !== i))} />
      ))}
      <button type="button"
        onClick={() => onSet(fieldName, [...items, { id: uuid(), measureType: 'distance', value: '', zone: 'z1', targetMode: 'zone' }])}
        className="text-xs text-slate-400 hover:text-[#001F3F] flex items-center gap-1 mt-1 transition-colors">
        + {addLabel}
      </button>
    </div>
  );
}

// ── Sub-block editor (level 2) ────────────────────────────────────────────────
// Handles: continuous, interval, variation, stimulus, ramp
function SubBlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const set = (k, v) => onChange({ ...block, [k]: v });
  const meta = SUB_BLOCK_META[block.type] || { color: '#94A3B8', label: block.type };
  const dist = blockDistance(block);
  const mins = blockDurationMin(block);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Sub-block header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          {/* Type selector */}
          <select
            value={block.type}
            onChange={e => onChange({ ...block, type: e.target.value })}
            className="text-xs font-bold border-0 bg-transparent focus:outline-none cursor-pointer pr-1"
            style={{ color: meta.color }}
          >
            {SUB_BLOCK_TYPES.map(bt => (
              <option key={bt.value} value={bt.value}>{bt.label}</option>
            ))}
          </select>
          {dist > 0 && <span className="text-xs font-mono text-slate-400">{dist.toFixed(2)} km</span>}
          {mins > 0 && <span className="text-xs font-mono text-slate-400">{mins.toFixed(0)} min</span>}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={!canMoveUp}
            className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-20 text-xs">▲</button>
          <button type="button" onClick={onMoveDown} disabled={!canMoveDown}
            className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-20 text-xs">▼</button>
          <button type="button" onClick={onRemove}
            className="p-1 text-slate-300 hover:text-red-500 text-xs ml-1">✕</button>
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Continuous ──────────────────────────────────────────────────── */}
        {block.type === 'continuous' && (
          <>
            <MeasureInput measureType={block.measureType} onMeasureType={v => set('measureType', v)}
              value={block.value} onValue={v => set('value', v)} />
            <ZoneSelect target={getTarget(block)} onChange={t => onChange(mergeTarget(block, t))} label="Zona / Intensidade" />
          </>
        )}

        {/* ── Interval ────────────────────────────────────────────────────── */}
        {block.type === 'interval' && (
          <>
            <RepeatCounter value={block.repeat} onChange={v => set('repeat', v)} suffix="× (esforço + descanso)" />
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50 rounded-xl p-3 space-y-2 border border-red-100">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide">⚡ Esforço</p>
                <MeasureInput measureType={block.workMeasure} onMeasureType={v => set('workMeasure', v)}
                  value={block.workValue} onValue={v => set('workValue', v)} />
                <ZoneSelect target={getTarget(block, 'work')} onChange={t => onChange(mergeTarget(block, t, 'work'))} />
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {block.restType === 'passive' ? '⏸ Descanso' : '🔄 Descanso'}
                  </p>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200">
                    {[{ v: 'passive', label: '⏸' }, { v: 'active', label: '🔄' }].map(opt => (
                      <button key={opt.v} type="button" onClick={() => set('restType', opt.v)}
                        title={opt.v === 'passive' ? 'Passivo (tempo)' : 'Ativo (distância + zona)'}
                        className={`px-2 py-1 text-xs transition-colors ${block.restType === opt.v ? 'bg-[#001F3F] text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {block.restType === 'passive' ? (
                  <div className="flex items-center gap-2">
                    <input type="text" value={block.restValue} onChange={e => set('restValue', e.target.value)}
                      placeholder="3:30"
                      className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] bg-white" />
                    <span className="text-xs text-slate-400">min / M:SS</span>
                  </div>
                ) : (
                  <>
                    <MeasureInput measureType={block.restMeasure} onMeasureType={v => set('restMeasure', v)}
                      value={block.restValue} onValue={v => set('restValue', v)} />
                    <ZoneSelect target={getTarget(block, 'rest')} onChange={t => onChange(mergeTarget(block, t, 'rest'))} />
                  </>
                )}
              </div>
            </div>
            {(dist > 0 || mins > 0) && (
              <p className="text-xs text-slate-400 text-center">
                Total {parseInt(block.repeat)||1}×:{dist > 0 ? ` ${dist.toFixed(2)} km` : ''}{mins > 0 ? ` ${mins.toFixed(0)} min` : ''}
              </p>
            )}
          </>
        )}

        {/* ── Variation ───────────────────────────────────────────────────── */}
        {block.type === 'variation' && (
          <>
            <RepeatCounter value={block.repeat} onChange={v => set('repeat', v)} suffix="× o conjunto abaixo" />
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2">Estímulos por repetição</p>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <StimuliList items={block.stimuli || []} fieldName="stimuli" addLabel="Adicionar estímulo" onSet={set} />
              </div>
            </div>
            {(dist > 0 || mins > 0) && (
              <p className="text-xs text-slate-400 text-center">
                Total {parseInt(block.repeat)||1}×:{dist > 0 ? ` ${dist.toFixed(2)} km` : ''}{mins > 0 ? ` ${mins.toFixed(0)} min` : ''}
              </p>
            )}
          </>
        )}

        {/* ── Stimulus ────────────────────────────────────────────────────── */}
        {block.type === 'stimulus' && (
          <>
            <RepeatCounter value={block.repeat} onChange={v => set('repeat', v)} suffix="× o conjunto abaixo" />
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2">Estímulos por repetição</p>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <StimuliList items={block.stimuli || []} fieldName="stimuli" addLabel="Adicionar estímulo" onSet={set} />
              </div>
            </div>
            {(dist > 0 || mins > 0) && (
              <p className="text-xs text-slate-400 text-center">
                Total {parseInt(block.repeat)||1}×:{dist > 0 ? ` ${dist.toFixed(2)} km` : ''}{mins > 0 ? ` ${mins.toFixed(0)} min` : ''}
              </p>
            )}
          </>
        )}

        {/* ── Ramp ────────────────────────────────────────────────────────── */}
        {block.type === 'ramp' && (
          <>
            <RepeatCounter value={block.repeat} onChange={v => set('repeat', v)}
              suffix={parseInt(block.repeat) === 1 ? '× (sequência linear)' : '× (repete o conjunto)'} />
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2">Degraus da rampa</p>
              <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                <StimuliList items={block.steps || []} fieldName="steps" addLabel="Adicionar degrau" onSet={set} />
              </div>
            </div>
            {(dist > 0 || mins > 0) && (
              <p className="text-xs text-slate-400 text-center">
                Total {parseInt(block.repeat)||1}×:{dist > 0 ? ` ${dist.toFixed(2)} km` : ''}{mins > 0 ? ` ${mins.toFixed(0)} min` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Section editor (level 1) ──────────────────────────────────────────────────
function SectionEditor({ section, sectionIndex, totalSections, onChange, onRemove, onMove }) {
  const meta = SECTION_META[section.sectionType] || { label: section.sectionType, color: '#94A3B8', icon: '📦' };
  const subBlocks = section.subBlocks || [];
  const sectionDist = subBlocks.reduce((s, b) => s + blockDistance(b), 0);
  const sectionMins = subBlocks.reduce((s, b) => s + blockDurationMin(b), 0);

  function setSubBlock(idx, updated) {
    onChange({ ...section, subBlocks: subBlocks.map((b, i) => i === idx ? updated : b) });
  }
  function removeSubBlock(idx) {
    onChange({ ...section, subBlocks: subBlocks.filter((_, i) => i !== idx) });
  }
  function addSubBlock(type) {
    onChange({ ...section, subBlocks: [...subBlocks, emptyBlock(type)] });
  }
  function moveSubBlock(dir, idx) {
    const arr = [...subBlocks];
    if (dir === 'up'   && idx > 0)             [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
    if (dir === 'down' && idx < arr.length - 1) [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
    onChange({ ...section, subBlocks: arr });
  }

  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: meta.color + '50' }}>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: meta.color + '18' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-base leading-none">{meta.icon}</span>
          <span className="font-black text-sm tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
          {sectionDist > 0 && <span className="text-xs font-mono text-slate-400">· {sectionDist.toFixed(2)} km</span>}
          {sectionMins > 0 && <span className="text-xs font-mono text-slate-400">{sectionDist > 0 ? '' : '· '}{sectionMins.toFixed(0)} min</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => onMove('up', sectionIndex)} disabled={sectionIndex === 0}
            className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-20 text-xs">▲</button>
          <button type="button" onClick={() => onMove('down', sectionIndex)} disabled={sectionIndex === totalSections - 1}
            className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-20 text-xs">▼</button>
          <button type="button" onClick={onRemove}
            className="p-1 text-slate-300 hover:text-red-500 text-xs ml-1">✕</button>
        </div>
      </div>

      {/* Sub-blocks */}
      <div className="p-3 space-y-2 bg-white">
        {subBlocks.length === 0 && (
          <p className="text-xs text-slate-300 text-center py-2">Nenhum bloco — adicione abaixo</p>
        )}
        {subBlocks.map((b, i) => (
          <SubBlockEditor
            key={b.id}
            block={b}
            onChange={updated => setSubBlock(i, updated)}
            onRemove={() => removeSubBlock(i)}
            onMoveUp={() => moveSubBlock('up', i)}
            onMoveDown={() => moveSubBlock('down', i)}
            canMoveUp={i > 0}
            canMoveDown={i < subBlocks.length - 1}
          />
        ))}

        {/* Add sub-block */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-50">
          {SUB_BLOCK_TYPES.map(bt => (
            <button key={bt.value} type="button" onClick={() => addSubBlock(bt.value)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all hover:shadow-sm"
              style={{ borderColor: bt.color + '44', color: bt.color, backgroundColor: bt.color + '10' }}>
              + {bt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zone distribution ──────────────────────────────────────────────────────────
function ZoneDistribution({ blocks, zoneConfig }) {
  const cfg = zoneConfig || DEFAULT_ZONE_CONFIG;
  const flat = flattenBlocks(blocks); // works with both old and new format

  function resolveZoneKey(obj, prefix = '') {
    const mode = obj[`${prefix}targetMode`] || 'zone';
    if (mode === 'zone') return obj[`${prefix}zone`] || 'z1';
    const mid = mode === 'pct'
      ? pf(obj[`${prefix}targetPct`])
      : (pf(obj[`${prefix}targetLow`]) + pf(obj[`${prefix}targetHigh`])) / 2;
    return cfg.find(z => mid >= z.low && mid <= z.high)?.key || obj[`${prefix}zone`] || 'z1';
  }

  const totals = {};
  function add(zoneKey, mins) {
    if (!zoneKey || mins <= 0) return;
    totals[zoneKey] = (totals[zoneKey] || 0) + mins;
  }

  for (const b of flat) {
    if (['warmup','continuous','transition','cooldown'].includes(b.type)) {
      if (b.measureType === 'time') add(resolveZoneKey(b), pf(b.value));
    } else if (b.type === 'interval') {
      const rep = parseInt(b.repeat) || 1;
      if (b.workMeasure === 'time') add(resolveZoneKey(b, 'work'), pf(b.workValue) * rep);
      if (b.restType !== 'passive' && b.restMeasure === 'time') add(resolveZoneKey(b, 'rest'), pf(b.restValue) * rep);
    } else if (['variation','stimulus'].includes(b.type)) {
      const rep = parseInt(b.repeat) || 1;
      for (const st of (b.stimuli || [])) if (st.measureType === 'time') add(resolveZoneKey(st), pf(st.value) * rep);
    } else if (b.type === 'ramp') {
      const rep = parseInt(b.repeat) || 1;
      for (const st of (b.steps || [])) if (st.measureType === 'time') add(resolveZoneKey(st), pf(st.value) * rep);
    }
  }

  const entries = cfg.map(z => ({ ...z, mins: totals[z.key] || 0 })).filter(z => z.mins > 0);
  if (entries.length === 0) return null;
  const totalMins = entries.reduce((s, z) => s + z.mins, 0);

  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Distribuição por Zona</p>
      <div className="flex h-3 rounded-full overflow-hidden mb-3 gap-px">
        {entries.map(z => (
          <div key={z.key} style={{ width: `${(z.mins / totalMins) * 100}%`, backgroundColor: z.color }}
            title={`${z.name}: ${z.mins.toFixed(0)} min`} />
        ))}
      </div>
      <div className="space-y-1">
        {entries.map(z => (
          <div key={z.key} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: z.color }} />
            <span className="font-medium text-slate-600 w-28 truncate">{z.name}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(z.mins / totalMins) * 100}%`, backgroundColor: z.color }} />
            </div>
            <span className="font-mono text-slate-400 w-14 text-right">{z.mins.toFixed(0)} min</span>
            <span className="text-slate-300 w-10 text-right">{((z.mins / totalMins) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Workout chart ─────────────────────────────────────────────────────────────
function WorkoutChart({ blocks, zoneConfig }) {
  const flat = flattenBlocks(blocks);
  if (flat.length === 0) return null;

  const cfg = zoneConfig || DEFAULT_ZONE_CONFIG;
  const zoneMap = Object.fromEntries(cfg.map(z => [z.key, z]));
  const maxPct = Math.max(...cfg.map(z => z.high), 130);

  function targetHeight(obj, prefix = '') {
    const mode = obj[`${prefix}targetMode`] || 'zone';
    if (mode === 'pct') {
      const p = pf(obj[`${prefix}targetPct`]);
      return p > 0 ? p / maxPct : 0.35;
    }
    if (mode === 'range') {
      const lo = pf(obj[`${prefix}targetLow`]);
      const hi = pf(obj[`${prefix}targetHigh`]);
      return (lo + hi) > 0 ? ((lo + hi) / 2) / maxPct : 0.35;
    }
    const key = obj[`${prefix}zone`] || 'z1';
    const z = zoneMap[key];
    return z ? ((z.low + z.high) / 2) / maxPct : 0.35;
  }

  function targetLabel(obj, prefix = '') {
    const mode = obj[`${prefix}targetMode`] || 'zone';
    if (mode === 'pct') return `${obj[`${prefix}targetPct`] || '?'}% do limiar`;
    if (mode === 'range') return `${obj[`${prefix}targetLow`] || '?'}–${obj[`${prefix}targetHigh`] || '?'}% do limiar`;
    const key = obj[`${prefix}zone`] || 'z1';
    const z = zoneMap[key];
    return z ? `${z.name}: ${z.low}–${z.high}%` : key;
  }

  const CHART_H = 80;
  const thresholdPos = 1 - (100 / maxPct);
  const segments = [];

  function push(size, height, color, tooltip) {
    if (size <= 0) return;
    segments.push({ size, height, color, tooltip });
  }

  function parseVal(v, measure) {
    const n = pf(v);
    return measure === 'distance' ? n : n * 0.08;
  }

  for (const b of flat) {
    const color = BLOCK_COLORS[b.type] || '#94A3B8';
    if (['warmup','continuous','transition','cooldown'].includes(b.type)) {
      push(parseVal(b.value, b.measureType) || 0.5, targetHeight(b), color, targetLabel(b));
    } else if (b.type === 'interval') {
      const rep = Math.min(parseInt(b.repeat) || 1, 14);
      const wSize = parseVal(b.workValue, b.workMeasure) || 0.4;
      const rSize = b.restType === 'active'
        ? parseVal(b.restValue, b.restMeasure) || 0.15
        : Math.max((parseFloat(String(b.restValue).split(':')[0] || b.restValue) || 2) * 0.04, 0.08);
      for (let i = 0; i < rep; i++) {
        push(wSize, targetHeight(b, 'work'), color, targetLabel(b, 'work'));
        const restH = b.restType === 'active' ? targetHeight(b, 'rest') : (zoneMap['z0'] ? ((zoneMap['z0'].low + zoneMap['z0'].high) / 2) / maxPct : 0.2);
        push(rSize, restH, '#CBD5E1', 'Descanso');
      }
    } else if (['variation','stimulus'].includes(b.type)) {
      const rep = Math.min(parseInt(b.repeat) || 1, 10);
      for (let i = 0; i < rep; i++)
        for (const st of (b.stimuli || []))
          push(parseVal(st.value, st.measureType) || 0.25, targetHeight(st), color, targetLabel(st));
    } else if (b.type === 'ramp') {
      const rep = Math.min(parseInt(b.repeat) || 1, 6);
      for (let i = 0; i < rep; i++)
        for (const st of (b.steps || []))
          push(parseVal(st.value, st.measureType) || 0.25, targetHeight(st), color, targetLabel(st));
    }
  }

  if (segments.length === 0) return null;

  return (
    <div className="px-6 pb-3 flex-shrink-0">
      <div className="flex gap-0">
        <div className="flex flex-col justify-between pb-5 pr-2 text-right" style={{ height: `${CHART_H + 20}px`, minWidth: '30px' }}>
          <span className="text-[9px] text-blue-400 font-mono">{maxPct}%</span>
          <span className="text-[9px] text-blue-300/60 font-mono">100%</span>
          <span className="text-[9px] text-blue-400/50 font-mono">0</span>
        </div>
        <div className="flex-1 bg-[#0D1B2A] rounded-xl px-4 pt-3 pb-0 overflow-hidden relative" style={{ height: `${CHART_H + 20}px` }}>
          <div className="absolute left-4 right-4 h-px border-t border-dashed border-blue-400/40 z-10"
            style={{ top: `${thresholdPos * CHART_H + 12}px` }} />
          <span className="absolute right-4 text-[8px] text-blue-400/50 font-mono z-10"
            style={{ top: `${thresholdPos * CHART_H + 4}px` }}>limiar</span>
          <div className="flex items-end gap-px w-full" style={{ height: `${CHART_H}px` }}>
            {segments.map((seg, i) => (
              <div key={i} className="rounded-t-sm transition-opacity hover:opacity-80"
                style={{
                  flexGrow: seg.size, flexShrink: 1, flexBasis: 0, minWidth: 0,
                  height: `${seg.height * 100}%`,
                  backgroundColor: seg.color,
                  opacity: seg.color === '#CBD5E1' ? 0.4 : 1,
                }}
                title={seg.tooltip} />
            ))}
          </div>
          <div className="h-px bg-blue-700/50" />
          <div className="flex justify-between mt-1 pb-1">
            <span className="text-blue-500/60 font-mono" style={{ fontSize: '8px' }}>início</span>
            <span className="text-blue-500/60 font-mono" style={{ fontSize: '8px' }}>fim</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function WorkoutForm({ onClose, workout, cycleId, variantId, weekId, defaultDay, libraryTemplate }) {
  const { state, dispatch } = useApp();
  const isEditing = !!workout;

  // Migrate old flat blocks → new section format if needed
  function resolveBlocks() {
    if (workout?.blocks) return migrateBlocks(workout.blocks);
    if (libraryTemplate?.blocks?.length) return migrateBlocks(libraryTemplate.blocks);
    return defaultWorkoutSections();
  }

  const [form, setForm] = useState({
    id:          workout?.id || uuid(),
    dayOfWeek:   workout?.dayOfWeek ?? defaultDay ?? 1,
    period:      workout?.period || 'manha',
    title:       workout?.title || libraryTemplate?.name || '',
    type:        workout?.type || libraryTemplate?.sport || 'corrida',
    description: workout?.description || libraryTemplate?.description || '',
    notes:       workout?.notes || libraryTemplate?.notes || '',
    blocks:      resolveBlocks(),
  });

  const [tab, setTab] = useState('structure');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleMove(dir, idx) {
    const arr = [...form.blocks];
    if (dir === 'up'   && idx > 0)             [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
    if (dir === 'down' && idx < arr.length - 1) [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
    set('blocks', arr);
  }

  function addSection(sectionType) {
    set('blocks', [...form.blocks, emptySection(sectionType)]);
  }

  function loadFromLibrary(template) {
    setForm(f => ({
      ...f,
      title:  f.title || template.name,
      type:   template.sport || f.type,
      blocks: migrateBlocks(template.blocks || []),
      notes:  template.notes || f.notes,
    }));
    setShowLibrary(false);
  }

  function loadFromAI(generated) {
    setForm(f => ({
      ...f,
      title:       generated.title || f.title,
      type:        generated.type  || f.type,
      description: generated.description || f.description,
      blocks:      generated.blocks || f.blocks,
    }));
    setShowAI(false);
    setTab('structure');
  }

  function saveToLibrary() {
    if (!form.title) return alert('Dê um título ao treino antes de salvar na biblioteca.');
    dispatch({ type: 'SAVE_TO_LIBRARY', payload: { workout: { ...form, title: form.title } } });
    alert(`"${form.title}" salvo na biblioteca!`);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const workoutToSave = form.type === 'descanso'
      ? { ...form, blocks: [] }
      : form;
    dispatch({ type: 'UPSERT_WORKOUT', payload: { cycleId, variantId, weekId, workout: workoutToSave } });
    onClose();
  }

  const effectiveBlocks = form.type === 'descanso' ? [] : form.blocks;
  const totalDist = calcWorkoutDistance({ ...form, blocks: effectiveBlocks });
  const totalMins = effectiveBlocks.reduce((s, b) => s + blockDurationMin(b), 0);
  const hh = Math.floor(totalMins / 60);
  const mm = String(Math.round(totalMins % 60)).padStart(2, '0');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100">
            <div className="flex items-start gap-3 mb-3">
              <input required value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Nome do treino..."
                className="flex-1 text-xl font-bold text-[#001F3F] border-0 border-b-2 border-slate-200 pb-1 focus:outline-none focus:border-[#001F3F] bg-transparent placeholder:text-slate-300 transition-colors" />
              <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                <button type="button" onClick={() => setShowAI(true)}
                  className="text-xs font-bold text-white px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'linear-gradient(135deg, #001F3F, #0a3a6e)' }}
                  title="Gerar treino com IA">
                  ✨ IA
                </button>
                <button type="button" onClick={() => setShowLibrary(true)}
                  className="text-xs text-slate-400 hover:text-[#001F3F] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">
                  📚 Biblioteca
                </button>
                <button type="button" onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 text-lg flex items-center justify-center transition-colors">
                  ×
                </button>
              </div>
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{form.type === 'corrida' ? '🏃' : form.type === 'bike' ? '🚴' : form.type === 'natacao' ? '🏊' : form.type === 'forca' ? '💪' : '😴'}</span>
                <select value={form.type} onChange={e => set('type', e.target.value)}
                  className="text-xs text-slate-500 border-0 bg-transparent focus:outline-none cursor-pointer font-medium">
                  {SPORT_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {totalMins > 0 && (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-[#001F3F] font-mono">{hh}:{mm}</span>
                  <span className="text-xs text-slate-400">h</span>
                </div>
              )}
              {totalDist > 0 && (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-[#001F3F] font-mono">{totalDist.toFixed(2)}</span>
                  <span className="text-xs text-slate-400">km</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <select value={form.dayOfWeek} onChange={e => set('dayOfWeek', parseInt(e.target.value))}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#001F3F]/20 bg-white">
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {[{ value: 'manha', label: '🌅' }, { value: 'tarde', label: '☀️' }, { value: 'noite', label: '🌙' }].map(p => (
                    <button key={p.value} type="button" onClick={() => set('period', p.value)}
                      className={`px-2.5 py-1.5 text-sm transition-colors ${form.period === p.value ? 'bg-[#001F3F]' : 'bg-white hover:bg-slate-50'}`}
                      title={p.value}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart ────────────────────────────────────────────────────── */}
          <WorkoutChart blocks={effectiveBlocks} zoneConfig={state.zoneConfig} />

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
            {[{ id: 'structure', label: 'Estrutura' }, { id: 'overview', label: 'Visão Geral' }].map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                  tab === t.id ? 'border-[#001F3F] text-[#001F3F]' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>{t.label}</button>
            ))}
            {form.title && (
              <button type="button" onClick={saveToLibrary}
                className="ml-auto text-xs text-blue-500 hover:text-blue-700 py-2.5 flex items-center gap-1">
                💾 Salvar na Biblioteca
              </button>
            )}
          </div>

          {/* ── Tab content ──────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Estrutura tab ──────────────────────────────────────────── */}
            {tab === 'structure' && (
              <div className="p-6 space-y-4">
                {form.type === 'descanso' ? (
                  <div className="text-center py-10">
                    <p className="text-3xl mb-2">😴</p>
                    <p className="text-slate-400 text-sm font-medium">Dia de descanso — nenhum bloco necessário.</p>
                  </div>
                ) : (
                  <>
                    {/* Sections */}
                    {form.blocks.map((section, idx) => (
                      <SectionEditor
                        key={section.id}
                        section={section}
                        sectionIndex={idx}
                        totalSections={form.blocks.length}
                        onChange={updated => set('blocks', form.blocks.map((b, i) => i === idx ? updated : b))}
                        onRemove={() => set('blocks', form.blocks.filter((_, i) => i !== idx))}
                        onMove={handleMove}
                      />
                    ))}

                    {form.blocks.length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                        <p className="text-slate-400 text-sm">Adicione uma seção para começar</p>
                        <p className="text-slate-300 text-xs mt-1">Aquecimento → Série Principal → Volta à Calma</p>
                      </div>
                    )}

                    {/* Add section */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide font-semibold">+ Adicionar seção</p>
                      <div className="flex flex-wrap gap-2">
                        {SECTION_TYPES.map(st => (
                          <button key={st.value} type="button" onClick={() => addSection(st.value)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:shadow-sm"
                            style={{ borderColor: st.color + '44', color: st.color, backgroundColor: st.color + '12' }}>
                            {st.icon} {st.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Visão Geral tab ────────────────────────────────────────── */}
            {tab === 'overview' && (
              <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100 min-h-full">
                <div className="p-6 space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Planejado</p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-50">
                      {[
                        { label: 'Duração',   value: totalMins > 0 ? `${hh}:${mm}:00` : '—', unit: 'h:m:s' },
                        { label: 'Distância', value: totalDist > 0 ? totalDist.toFixed(2) : '—', unit: 'km' },
                        { label: 'Seções',    value: effectiveBlocks.length, unit: '' },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="py-2 text-blue-600 font-semibold text-xs w-28">{row.label}</td>
                          <td className="py-2 font-mono font-bold text-[#001F3F]">{row.value}</td>
                          <td className="py-2 text-slate-400 text-xs">{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-semibold">Modalidade</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {SPORT_TYPES.map(s => (
                        <button key={s.value} type="button" onClick={() => set('type', s.value)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            form.type === s.value ? 'bg-[#001F3F] text-white border-[#001F3F]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}>{s.label}</button>
                      ))}
                    </div>
                  </div>

                  <ZoneDistribution blocks={effectiveBlocks} zoneConfig={state.zoneConfig} />
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Descrição</p>
                    <textarea value={form.description} onChange={e => set('description', e.target.value)}
                      rows={5} placeholder="Objetivo do treino, contexto da semana..."
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] resize-none placeholder:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Orientações Privadas</p>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                      rows={5} placeholder="RPE alvo, pontos de atenção, estratégia..."
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] resize-none placeholder:text-slate-300" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            {effectiveBlocks.length > 0 && form.title && (
              <button type="button" onClick={() => downloadFIT(form, state.zoneConfig)}
                className="text-xs text-slate-400 hover:text-[#001F3F] px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 flex items-center gap-1.5"
                title="Exportar arquivo .fit para Garmin">
                ⌚ Exportar .fit
              </button>
            )}
            <button type="submit" className="btn-primary flex-1">
              {isEditing ? 'Salvar Sessão' : totalDist > 0 ? `+ Adicionar — ${totalDist.toFixed(2)} km` : '+ Adicionar Sessão'}
            </button>
          </div>
        </form>
      </div>

      {showLibrary && (
        <WorkoutLibraryModal onClose={() => setShowLibrary(false)} onSelect={loadFromLibrary} />
      )}
      {showAI && (
        <AIWorkoutBuilder
          onClose={() => setShowAI(false)}
          onOpenEditor={generated => { loadFromAI(generated); setShowAI(false); }}
        />
      )}
    </div>
  );
}

// ── Library modal ─────────────────────────────────────────────────────────────
const LIB_SPORT_COLORS = {
  corrida: '#3B82F6', bike: '#22C55E', natacao: '#0EA5E9', forca: '#A855F7', descanso: '#94A3B8',
};

function WorkoutLibraryModal({ onClose, onSelect }) {
  const { state, dispatch } = useApp();
  const { confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const lib = state.workoutLibrary || [];
  const filtered = lib.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.sport?.toLowerCase().includes(search.toLowerCase())
  );

  function handleDelete(id) {
    confirm({
      title: 'Remover da biblioteca?',
      message: 'O treino será excluído permanentemente.',
      confirmText: 'Remover',
      onConfirm: () => dispatch({ type: 'DELETE_FROM_LIBRARY', id }),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-[#001F3F]">Biblioteca de Treinos</h2>
            <p className="text-xs text-slate-400 mt-0.5">{lib.length} treino{lib.length !== 1 ? 's' : ''} salvo{lib.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 text-lg flex items-center justify-center">×</button>
        </div>

        {lib.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-50 flex-shrink-0">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar treino..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] placeholder:text-slate-300" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {lib.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-4">📭</p>
              <p className="text-slate-500 font-semibold text-sm">Nenhum treino salvo ainda</p>
              <p className="text-slate-400 text-xs mt-1">Monte uma sessão e clique em "Salvar na Biblioteca".</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">Nenhum resultado para "{search}"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(t => {
                const flatBlocks = flattenBlocks(t.blocks || []);
                const totalDist = flatBlocks.reduce((s, b) => s + blockDistance(b), 0);
                const totalMins = flatBlocks.reduce((s, b) => s + blockDurationMin(b), 0);
                const sportColor = LIB_SPORT_COLORS[t.sport] || '#94A3B8';
                const sections = (t.blocks || []).filter(b => b.sectionType);
                return (
                  <div key={t.id}
                    className="group relative flex items-center gap-0 border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => onSelect(t)}>
                    <div className="w-1 self-stretch flex-shrink-0" style={{ backgroundColor: sportColor }} />
                    <div className="flex-1 min-w-0 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-[#001F3F] truncate">{t.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                              style={{ backgroundColor: sportColor + '18', color: sportColor }}>
                              {t.sport || 'geral'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            {totalDist > 0 && <span className="font-mono font-bold text-[#001F3F]">{totalDist.toFixed(2)} km</span>}
                            {totalMins > 0 && <span className="font-mono">{totalMins.toFixed(0)} min</span>}
                            {sections.length > 0 && (
                              <span className="flex items-center gap-1">
                                {sections.map(s => (
                                  <span key={s.id} title={SECTION_LABELS[s.sectionType] || s.sectionType}>
                                    {SECTION_ICONS[s.sectionType] || '📦'}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">✕</button>
                          <button onClick={e => { e.stopPropagation(); onSelect(t); }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#001F3F] text-white hover:bg-[#001F3F]/80 transition-colors">Usar</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
