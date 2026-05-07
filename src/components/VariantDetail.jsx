import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import {
  uuid, calcWeekVolume, calcWeekZones, calcWeekStress, calcWorkoutDistance,
  blockDistance, blockDurationMin, flattenBlocks,
  buildPhaseMap, ZONE_COLORS, SPORT_ICONS
} from '../utils/helpers';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line,
} from 'recharts';
import WorkoutForm from './WorkoutForm';
import LibraryPanel from './LibraryPanel';
import AIWorkoutBuilder from './AIWorkoutBuilder';

const COL_DAYS   = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun
const COL_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const PERIOD_ORDER = { manha: 0, tarde: 1, noite: 2 };
const PERIOD_DOT   = { manha: '#FBBF24', tarde: '#F97316', noite: '#6366F1' };

const SPORT_COLORS = {
  corrida:  '#16A34A',
  bike:     '#2563EB',
  natacao:  '#0EA5E9',
  forca:    '#A855F7',
  descanso: '#94A3B8',
};

const SPORT_LABELS = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação',
  forca: 'Força', descanso: 'Descanso',
};

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

function formatDuration(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  return `${h}:${String(m).padStart(2, '0')}h`;
}

function formatPace(distKm, totalMins) {
  if (distKm <= 0 || totalMins <= 0) return null;
  const p = totalMins / distKm;
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function formatSpeed(distKm, totalMins) {
  if (distKm <= 0 || totalMins <= 0) return null;
  return `${((distKm / totalMins) * 60).toFixed(1)} km/h`;
}

function cloneWithFreshIds(value) {
  if (Array.isArray(value)) return value.map(cloneWithFreshIds);
  if (!value || typeof value !== 'object') return value;

  const cloned = {};
  Object.entries(value).forEach(([key, val]) => {
    if (key === 'id') {
      cloned[key] = uuid();
      return;
    }
    cloned[key] = cloneWithFreshIds(val);
  });
  return cloned;
}

// ── Calendar card (Final Surge style, compact) ────────────────────────────────
function CalendarCard({ workout, weekId, onEdit, onDelete, onDragStart }) {
  const blocks    = workout.blocks || [];
  const totalMins = blocks.reduce((s, b) => s + blockDurationMin(b), 0);
  const totalDist = blocks.reduce((s, b) => s + blockDistance(b), 0);
  const dist      = calcWorkoutDistance(workout);
  const sColor    = SPORT_COLORS[workout.type] || '#94A3B8';

  const pace  = workout.type === 'corrida' ? formatPace(dist, totalMins) : null;
  const speed = workout.type === 'bike'    ? formatSpeed(dist, totalMins) : null;
  const secondary = pace || speed;

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'workout');
        onDragStart({ type: 'workout', workout, fromWeekId: weekId });
      }}
      className="group relative bg-white rounded-lg border border-slate-100 overflow-hidden hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:opacity-60 select-none"
      style={{ borderLeft: `3px solid ${sColor}` }}
      onClick={e => { if (!e.defaultPrevented) onEdit(); }}
    >
      {/* Period dot + sport label */}
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-0">
        {workout.period && (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PERIOD_DOT[workout.period] || '#94A3B8' }} />
        )}
        <span className="font-semibold truncate" style={{ fontSize: '10px', color: sColor }}>
          {SPORT_ICONS[workout.type]} {SPORT_LABELS[workout.type] || workout.type}
        </span>
      </div>

      {/* Title */}
      {workout.title && (
        <div className="px-2 pb-0 leading-none">
          <span className="font-bold text-slate-700 truncate block" style={{ fontSize: '10px' }}>
            {workout.title}
          </span>
        </div>
      )}

      {/* Stats */}
      {(dist > 0 || totalMins > 0) && (
        <div className="px-2 pt-1 pb-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {dist > 0 && (
              <span className="font-black font-mono text-slate-800" style={{ fontSize: '11px' }}>
                {dist.toFixed(1)} km
              </span>
            )}
            {totalMins > 0 && (
              <span className="font-bold font-mono text-slate-500" style={{ fontSize: '10px' }}>
                {formatDuration(totalMins)}
              </span>
            )}
          </div>
          {secondary && (
            <div className="font-mono text-slate-400 leading-none mt-px" style={{ fontSize: '9px' }}>
              {secondary}
            </div>
          )}
        </div>
      )}

      {/* Block bar — flatten sections first */}
      {totalDist > 0 && (
        <div className="flex h-0.5 mx-2 mt-1.5 mb-2 gap-px overflow-hidden rounded-full">
          {flattenBlocks(blocks).map((b, i) => {
            const bd = blockDistance(b);
            if (bd <= 0) return null;
            return (
              <div key={i}
                style={{ width: `${(bd / totalDist) * 100}%`, backgroundColor: BLOCK_COLORS[b.type] || '#94A3B8', minWidth: 2 }}
              />
            );
          })}
        </div>
      )}
      {(blocks.length === 0 || totalDist === 0) && <div className="pb-1.5" />}

      {/* Delete */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white border border-slate-200 text-slate-300 hover:text-red-500 items-center justify-center opacity-0 group-hover:opacity-100 hidden group-hover:flex text-xs shadow-sm"
      >×</button>
    </div>
  );
}

// ── Phase overview bar ────────────────────────────────────────────────────────
function PhaseOverviewBar({ weeks }) {
  const { state } = useApp();
  const { colors: phaseColors, list: phaseList } = buildPhaseMap(state.phaseConfig);
  if (!weeks || weeks.length === 0) return null;
  const counts = phaseList.map(p => ({
    ...p,
    count: weeks.filter(w => w.phase === p.key).length,
  })).filter(p => p.count > 0);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Colored bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px flex-1 min-w-[120px]">
        {weeks.map(w => (
          <div
            key={w.id}
            className="flex-1"
            style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}
            title={`Sem ${w.weekNumber} — ${phaseList.find(p => p.key === w.phase)?.label || w.phase}`}
          />
        ))}
      </div>
      {/* Legend pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {counts.map(p => (
          <div key={p.key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-[10px] font-semibold text-slate-500">{p.label}</span>
            <span className="text-[10px] text-slate-400">{p.count}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phase picker popover ──────────────────────────────────────────────────────
function PhasePicker({ week, cycleId, variantId, onClose }) {
  const { state, dispatch } = useApp();
  const { list: phaseList } = buildPhaseMap(state.phaseConfig);

  function pick(phase) {
    dispatch({
      type: 'UPDATE_WEEK',
      payload: { cycleId, variantId, weekId: week.id, phase },
    });
    onClose();
  }

  return (
    <div
      className="absolute left-0 bottom-full mb-1 z-30 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 w-40"
      onMouseLeave={onClose}
    >
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1">
        Período — Sem {week.weekNumber}
      </p>
      {phaseList.map(p => (
        <button
          key={p.key}
          onClick={() => pick(p.key)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
        >
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-xs font-semibold text-slate-700">{p.label}</span>
          {week.phase === p.key && (
            <span className="ml-auto text-xs text-slate-300">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Progression charts ────────────────────────────────────────────────────────
function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-[#001F3F] mb-1">{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-mono font-bold">{Number(p.value).toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

function StressTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-[#001F3F] mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-mono font-bold">{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressionPanel({ weeks }) {
  const { state } = useApp();
  const chartData = weeks.map(w => {
    const zones = calcWeekZones(w.workouts || [], state.zoneConfig);
    return {
      name: `S${w.weekNumber}`,
      phase: w.phase,
      volume: parseFloat(calcWeekVolume(w.workouts || []).toFixed(1)),
      stress: parseFloat(calcWeekStress(w.workouts || [], state.zoneConfig).toFixed(1)),
      z0: parseFloat((zones.z0 || 0).toFixed(1)),
      z1: parseFloat((zones.z1 || 0).toFixed(1)),
      z2: parseFloat((zones.z2 || 0).toFixed(1)),
      z3: parseFloat((zones.z3 || 0).toFixed(1)),
      z4: parseFloat((zones.z4 || 0).toFixed(1)),
      z5: parseFloat((zones.z5 || 0).toFixed(1)),
      z6: parseFloat((zones.z6 || 0).toFixed(1)),
    };
  });

  const hasData = chartData.some(d => d.volume > 0);
  if (!hasData) return (
    <div className="flex items-center justify-center h-24 text-xs text-slate-300">
      Prescreva treinos para ver a progressão aqui.
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Volume by zone */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Volume por Zona (km)</p>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={chartData} barSize={Math.max(6, Math.min(14, 200 / weeks.length))} margin={{ top: 0, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#CBD5E1' }} axisLine={false} tickLine={false} interval={weeks.length > 12 ? 1 : 0} />
            <YAxis tick={{ fontSize: 8, fill: '#CBD5E1' }} axisLine={false} tickLine={false} width={24} />
            <Tooltip content={<VolumeTooltip />} cursor={{ fill: '#F8FAFC' }} />
            {['z0','z1','z2','z3','z4','z5','z6'].map((z, i, arr) => (
              <Bar key={z} dataKey={z} stackId="vol" fill={ZONE_COLORS[z]}
                radius={i === arr.length - 1 ? [2,2,0,0] : [0,0,0,0]} name={z.toUpperCase()} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stress */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stress (ESS) por Semana</p>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#CBD5E1' }} axisLine={false} tickLine={false} interval={weeks.length > 12 ? 1 : 0} />
            <YAxis tick={{ fontSize: 8, fill: '#CBD5E1' }} axisLine={false} tickLine={false} width={24} domain={[0, 'auto']} />
            <Tooltip content={<StressTooltip />} />
            <Line type="monotone" dataKey="stress" stroke="#0EA5E9" strokeWidth={2}
              dot={{ r: 2, fill: '#0EA5E9' }} name="ESS" />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function VariantDetail() {
  const { state, dispatch, selected } = useApp();
  const { confirm } = useConfirm();
  const [workoutModal, setWorkoutModal]   = useState(null);
  const [pending, setPending]             = useState(null);
  const [dragOver, setDragOver]           = useState(null);
  const [phasePickerWeekId, setPhasePickerWeekId] = useState(null);
  const [showCharts, setShowCharts]       = useState(false);
  const [aiContext, setAiContext]         = useState(null); // { weekId, dayOfWeek } | null
  const [weekClipboard, setWeekClipboard] = useState(null); // { sourceWeekNumber, phase, workouts }
  const [dayClipboard, setDayClipboard]   = useState(null); // { sourceWeekNumber, sourceDow, workouts }
  const dragPayload                       = useRef(null);

  const cycle   = selected.variantCycle;
  const variant = selected.variant;
  if (!cycle || !variant) return null;

  const { colors: phaseColors, labels: phaseLabels } = buildPhaseMap(state.phaseConfig);
  const allWeeks      = variant.weeks || [];
  const totalSessions = allWeeks.reduce((s, w) => s + (w.workouts || []).length, 0);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(payload) {
    dragPayload.current = payload;
    setPending(null);
  }

  function handleDragOver(e, cellKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragPayload.current?.type === 'library' ? 'copy' : 'move';
    setDragOver(cellKey);
  }

  function handleDragLeave(e, cellKey) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(v => v === cellKey ? null : v);
    }
  }

  function handleDrop(e, week, dow) {
    e.preventDefault();
    setDragOver(null);
    const payload = dragPayload.current;
    if (!payload) return;
    dragPayload.current = null;

    if (payload.type === 'library') {
      const item = payload.item;
      dispatch({
        type: 'UPSERT_WORKOUT',
        payload: {
          cycleId: cycle.id, variantId: variant.id, weekId: week.id,
          workout: {
            id: uuid(), dayOfWeek: dow, period: 'manha',
            title: item.name, type: item.sport || 'corrida',
            description: item.description || '',
            notes: item.notes || '',
            blocks: (item.blocks || []).map(b => ({ ...b, id: uuid() })),
          },
        },
      });
    } else if (payload.type === 'workout') {
      const { workout, fromWeekId } = payload;
      if (fromWeekId === week.id && workout.dayOfWeek === dow) return;
      dispatch({ type: 'DELETE_WORKOUT', payload: { cycleId: cycle.id, variantId: variant.id, weekId: fromWeekId, workoutId: workout.id } });
      dispatch({ type: 'UPSERT_WORKOUT', payload: { cycleId: cycle.id, variantId: variant.id, weekId: week.id, workout: { ...workout, dayOfWeek: dow } } });
    }
  }

  function openNew(week, dayOfWeek) {
    if (pending) {
      setWorkoutModal({ weekId: week.id, defaultDay: dayOfWeek, libraryTemplate: pending });
      setPending(null);
    } else {
      setWorkoutModal({ weekId: week.id, defaultDay: dayOfWeek });
    }
  }

  function handleDropCalendarToLibrary(folderName) {
    const payload = dragPayload.current;
    if (!payload || payload.type !== 'workout') return;
    dragPayload.current = null;
    dispatch({ type: 'SAVE_TO_LIBRARY', payload: { workout: payload.workout, folder: folderName || null } });
  }

  function handleDelete(weekId, workoutId) {
    confirm({
      title: 'Excluir sessão?',
      message: 'Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      onConfirm: () => dispatch({ type: 'DELETE_WORKOUT', payload: { cycleId: cycle.id, variantId: variant.id, weekId, workoutId } }),
    });
  }

  function copyWeek(week) {
    setWeekClipboard({
      sourceWeekNumber: week.weekNumber,
      phase: week.phase,
      workouts: [...(week.workouts || [])],
    });
  }

  function pasteWeek(targetWeek) {
    if (!weekClipboard) return;
    const targetWorkouts = targetWeek.workouts || [];
    if (targetWorkouts.length > 0) {
      const ok = confirm(`A Semana ${targetWeek.weekNumber} ja possui ${targetWorkouts.length} sessao(oes). Deseja substituir ao colar?`);
      if (!ok) return;
    }

    targetWorkouts.forEach(workout => {
      dispatch({
        type: 'DELETE_WORKOUT',
        payload: { cycleId: cycle.id, variantId: variant.id, weekId: targetWeek.id, workoutId: workout.id },
      });
    });

    (weekClipboard.workouts || []).forEach(workout => {
      const clonedWorkout = cloneWithFreshIds(workout);
      dispatch({
        type: 'UPSERT_WORKOUT',
        payload: { cycleId: cycle.id, variantId: variant.id, weekId: targetWeek.id, workout: clonedWorkout },
      });
    });

    if (weekClipboard.phase) {
      dispatch({
        type: 'UPDATE_WEEK',
        payload: { cycleId: cycle.id, variantId: variant.id, weekId: targetWeek.id, phase: weekClipboard.phase },
      });
    }
  }

  function copyDay(week, dow) {
    const dayWorkouts = (week.workouts || [])
      .filter(w => w.dayOfWeek === dow)
      .sort((a, b) => (PERIOD_ORDER[a.period] ?? 0) - (PERIOD_ORDER[b.period] ?? 0));

    setDayClipboard({
      sourceWeekNumber: week.weekNumber,
      sourceDow: dow,
      workouts: dayWorkouts,
    });
  }

  function pasteDay(targetWeek, targetDow) {
    if (!dayClipboard) return;

    const existing = (targetWeek.workouts || []).filter(w => w.dayOfWeek === targetDow);
    if (existing.length > 0) {
      const ok = confirm(`Este dia ja possui ${existing.length} sessao(oes). Deseja adicionar ao colar?`);
      if (!ok) return;
    }

    (dayClipboard.workouts || []).forEach(workout => {
      const clonedWorkout = { ...cloneWithFreshIds(workout), dayOfWeek: targetDow };
      dispatch({
        type: 'UPSERT_WORKOUT',
        payload: { cycleId: cycle.id, variantId: variant.id, weekId: targetWeek.id, workout: clonedWorkout },
      });
    });
  }

  function getDayDate(week, colIndex) {
    if (!week.startDate) {
      const weekIdx = allWeeks.findIndex(w => w.id === week.id);
      return weekIdx * 7 + colIndex + 1;
    }
    const d = new Date(week.startDate + 'T12:00:00');
    d.setDate(d.getDate() + colIndex);
    return d.getDate();
  }

  function getDayMonth(week, colIndex) {
    if (!week.startDate) return null;
    const d = new Date(week.startDate + 'T12:00:00');
    d.setDate(d.getDate() + colIndex);
    return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  }

  return (
    <div className="flex flex-col gap-0 h-full">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-t-2xl px-5 py-3 flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => dispatch({ type: 'GO_CYCLE', cycleId: cycle.id })}
            className="text-xs font-semibold text-slate-400 hover:text-[#001F3F] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >← Ciclo</button>
          <div className="w-px h-5 bg-slate-200" />
          <div>
            <p className="text-xs text-slate-400 leading-none">{cycle.name}</p>
            <h1 className="text-lg font-black text-[#001F3F] leading-tight">{variant.name}</h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="font-semibold">{allWeeks.length} semanas</span>
              <span>·</span>
              <span className="font-semibold">{totalSessions} sessões</span>
            </div>
            <button
              onClick={() => setShowCharts(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                showCharts
                  ? 'bg-[#001F3F] text-white border-[#001F3F]'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              📊 Progressão
            </button>
          </div>
          {(weekClipboard || dayClipboard) && (
            <div className="flex items-center gap-2 text-[10px] flex-wrap justify-end">
              {weekClipboard && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-semibold">
                  Sem. {weekClipboard.sourceWeekNumber} copiada
                  <button
                    onClick={() => setWeekClipboard(null)}
                    className="text-blue-400 hover:text-blue-700 leading-none"
                    title="Limpar semana copiada"
                  >✕</button>
                </span>
              )}
              {dayClipboard && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold">
                  Dia copiado (Sem. {dayClipboard.sourceWeekNumber})
                  <button
                    onClick={() => setDayClipboard(null)}
                    className="text-emerald-400 hover:text-emerald-700 leading-none"
                    title="Limpar dia copiado"
                  >✕</button>
                </span>
              )}
            </div>
          )}
          <div className="w-full max-w-xs">
            <PhaseOverviewBar weeks={allWeeks} />
          </div>
        </div>
      </div>

      {/* ── Progression charts panel ──────────────────────────────────────── */}
      {showCharts && (
        <div className="bg-white border border-slate-200 px-5 py-4 flex-shrink-0 border-t-0">
          <ProgressionPanel weeks={allWeeks} />
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 border-x border-b border-slate-200 rounded-b-2xl overflow-hidden min-h-0">

        {/* ── Library sidebar ───────────────────────────────────────────────── */}
        <div
          className="hidden lg:flex flex-col w-64 flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden"
          onDragOver={e => { if (dragPayload.current?.type === 'workout') e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); handleDropCalendarToLibrary(null); }}
        >
          {pending && (
            <div className="mx-2 mt-2 px-2.5 py-2 bg-[#001F3F]/5 border border-[#001F3F]/20 rounded-lg flex-shrink-0">
              <p className="text-xs font-semibold text-[#001F3F] truncate">{pending.name}</p>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-slate-500">Clique num dia ↗</p>
                <button onClick={() => setPending(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold ml-2">✕</button>
              </div>
            </div>
          )}
          <LibraryPanel
            selectedId={pending?.id}
            onSelect={item => setPending(pending?.id === item.id ? null : item)}
            onDragStart={handleDragStart}
            onExternalDrop={handleDropCalendarToLibrary}
          />
        </div>

        {/* ── Calendar grid ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-[#F8FAFC]">

          {/* Sticky day header row */}
          <div className="sticky top-0 z-20 flex bg-white border-b-2 border-slate-200 shadow-sm">
            {/* Week label column */}
            <div className="w-20 flex-shrink-0 border-r border-slate-200 px-3 py-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SEM.</span>
            </div>
            {/* Day columns */}
            {COL_LABELS.map((lbl, i) => (
              <div key={i}
                className={`flex-1 min-w-[110px] px-3 py-3 border-r border-slate-100 ${i >= 5 ? 'bg-slate-50' : ''}`}>
                <span className={`text-xs font-black tracking-widest uppercase ${i >= 5 ? 'text-slate-300' : 'text-slate-600'}`}>
                  {lbl}
                </span>
              </div>
            ))}
            {/* Summary column */}
            <div className="w-32 flex-shrink-0 border-l border-slate-200 px-3 py-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RESUMO</span>
            </div>
          </div>

          {/* Week rows */}
          {allWeeks.map(week => {
            const wVol  = calcWeekVolume(week.workouts || []);
            const wStress  = calcWeekStress(week.workouts || [], state.zoneConfig);
            const wMins = (week.workouts || []).flatMap(w => w.blocks || []).reduce((s, b) => s + blockDurationMin(b), 0);
            const phaseColor = phaseColors[week.phase] || '#94A3B8';

            return (
              <div
                key={week.id}
                className="flex border-b border-slate-200 group/row"
                style={{ minHeight: '110px' }}
              >
                {/* Week label cell */}
                <div className="w-20 flex-shrink-0 border-r border-slate-200 bg-white px-3 py-3 flex flex-col justify-between">
                  <button
                    onClick={() => dispatch({ type: 'GO_WEEK', weekId: week.id })}
                    className="text-left group/wbtn"
                  >
                    <span className="text-sm font-black text-[#001F3F] group-hover/wbtn:text-blue-600 transition-colors block leading-none">
                      Sem {week.weekNumber}
                    </span>
                    {week.startDate && (
                      <span className="text-[10px] text-slate-400 font-mono leading-none mt-0.5 block">
                        {new Date(week.startDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </button>
                  {/* Phase badge — click to change */}
                  <div className="relative mt-auto space-y-1">
                    <button
                      onClick={e => { e.stopPropagation(); setPhasePickerWeekId(v => v === week.id ? null : week.id); }}
                      className="w-full inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full hover:brightness-95 transition-all min-w-0"
                      style={{ backgroundColor: phaseColor + '25' }}
                      title="Clique para mudar o período"
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: phaseColor }} />
                      <span
                        className="font-bold leading-none truncate block min-w-0"
                        style={{ color: phaseColor, fontSize: '9px' }}
                      >
                        {phaseLabels[week.phase] || '—'}
                      </span>
                      <span style={{ color: phaseColor, fontSize: '7px', opacity: 0.7 }}>▾</span>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); copyWeek(week); }}
                        className="flex-1 px-1.5 py-0.5 rounded-md border border-slate-200 text-[9px] font-bold text-slate-500 hover:text-[#001F3F] hover:border-slate-300"
                        title="Copiar semana"
                      >
                        Cop.
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); pasteWeek(week); }}
                        disabled={!weekClipboard}
                        className="flex-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-slate-200 text-slate-500 hover:text-[#001F3F] hover:border-slate-300"
                        title={weekClipboard ? 'Colar semana copiada' : 'Copie uma semana primeiro'}
                      >
                        Col.
                      </button>
                    </div>
                    {phasePickerWeekId === week.id && (
                      <PhasePicker
                        week={week}
                        cycleId={cycle.id}
                        variantId={variant.id}
                        onClose={() => setPhasePickerWeekId(null)}
                      />
                    )}
                  </div>
                </div>

                {/* Day cells */}
                {COL_DAYS.map((dow, colIdx) => {
                  const dayWorkouts = (week.workouts || [])
                    .filter(w => w.dayOfWeek === dow)
                    .sort((a, b) => (PERIOD_ORDER[a.period] ?? 0) - (PERIOD_ORDER[b.period] ?? 0));
                  const isWeekend = colIdx >= 5;
                  const cellKey   = `${week.id}-${dow}`;
                  const isOver    = dragOver === cellKey;
                  const isPending = !!pending;

                  const dayNum   = getDayDate(week, colIdx);
                  const dayMonth = getDayMonth(week, colIdx);

                  return (
                    <div
                      key={dow}
                      className={`flex-1 min-w-[110px] border-r border-slate-100 flex flex-col transition-colors
                        ${isWeekend ? 'bg-slate-50/70' : 'bg-white'}
                        ${isPending ? 'cursor-copy' : ''}
                        ${isOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''}
                      `}
                      onClick={() => isPending && openNew(week, dow)}
                      onDragOver={e => handleDragOver(e, cellKey)}
                      onDragEnter={e => { e.preventDefault(); setDragOver(cellKey); }}
                      onDragLeave={e => handleDragLeave(e, cellKey)}
                      onDrop={e => handleDrop(e, week, dow)}
                    >
                      {/* Day date label */}
                      <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                        <div className="flex items-baseline gap-1">
                          <span className="font-black text-slate-400 leading-none" style={{ fontSize: '13px' }}>
                            {dayNum}
                          </span>
                          {dayMonth && (
                            <span className="text-slate-300 leading-none font-medium" style={{ fontSize: '9px' }}>
                              {dayMonth}
                            </span>
                          )}
                        </div>
                        {!isPending && (
                          <div className="opacity-0 group-hover/row:opacity-100 flex items-center gap-0.5 transition-all">
                            <button
                              onClick={e => { e.stopPropagation(); copyDay(week, dow); }}
                              className="w-5 h-5 rounded-full hover:bg-slate-200 text-slate-300 hover:text-slate-600 text-[9px] font-bold flex items-center justify-center leading-none"
                              title="Copiar dia"
                            >C</button>
                            <button
                              onClick={e => { e.stopPropagation(); pasteDay(week, dow); }}
                              disabled={!dayClipboard}
                              className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center leading-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-slate-600 hover:bg-slate-200"
                              title={dayClipboard ? 'Colar dia copiado' : 'Copie um dia primeiro'}
                            >V</button>
                            <button
                              onClick={e => { e.stopPropagation(); openNew(week, dow); }}
                              className="w-5 h-5 rounded-full hover:bg-[#001F3F] text-slate-300 hover:text-white text-sm font-bold flex items-center justify-center leading-none"
                              title="Novo treino"
                            >+</button>
                            <button
                              onClick={e => { e.stopPropagation(); setAiContext({ weekId: week.id, dayOfWeek: dow }); }}
                              className="w-5 h-5 rounded-full text-slate-300 hover:text-white text-[9px] flex items-center justify-center leading-none transition-colors"
                              style={{ background: 'none' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg,#001F3F,#0a3a6e)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              title="Gerar com IA"
                            >✨</button>
                          </div>
                        )}
                      </div>

                      {/* Workout cards */}
                      <div className="flex-1 px-1.5 pb-1.5 flex flex-col gap-1">
                        {dayWorkouts.map(w => (
                          <CalendarCard
                            key={w.id}
                            workout={w}
                            weekId={week.id}
                            onEdit={() => !isPending && setWorkoutModal({ weekId: week.id, workout: w })}
                            onDelete={() => handleDelete(week.id, w.id)}
                            onDragStart={handleDragStart}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Summary column */}
                <div className="w-32 flex-shrink-0 border-l border-slate-200 bg-white px-3 py-3 flex flex-col justify-center gap-1">
                  {wVol > 0 && (
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Distância</span>
                      <span className="text-sm font-black font-mono text-[#001F3F]">{wVol.toFixed(1)} km</span>
                    </div>
                  )}
                  {wStress > 0 && (
                    <span className="text-xs font-bold text-sky-600 font-mono">
                      {wStress.toFixed(1)} ESS
                    </span>
                  )}
                  {(week.workouts || []).length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {(week.workouts || []).length} sessão{(week.workouts || []).length !== 1 ? 'ões' : ''}
                    </span>
                  )}
                  {wVol === 0 && wMins === 0 && (
                    <span className="text-xs text-slate-200">—</span>
                  )}
                </div>
              </div>
            );
          })}

          {allWeeks.length === 0 && (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-slate-300">Nenhuma semana neste plano.</p>
            </div>
          )}
        </div>
      </div>

      {workoutModal !== null && (
        <WorkoutForm
          onClose={() => setWorkoutModal(null)}
          workout={workoutModal.workout}
          defaultDay={workoutModal.defaultDay ?? workoutModal.workout?.dayOfWeek}
          libraryTemplate={workoutModal.libraryTemplate}
          cycleId={cycle.id}
          variantId={variant.id}
          weekId={workoutModal.weekId}
        />
      )}

      {aiContext && (
        <AIWorkoutBuilder
          context={{ cycleId: cycle.id, variantId: variant.id, ...aiContext }}
          onClose={() => setAiContext(null)}
          onOpenEditor={generated => {
            setWorkoutModal({
              weekId: aiContext.weekId,
              defaultDay: aiContext.dayOfWeek,
              libraryTemplate: {
                name: generated.title,
                sport: generated.type,
                description: generated.description,
                blocks: generated.blocks,
              },
            });
            setAiContext(null);
          }}
        />
      )}
    </div>
  );
}
