import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import {
  calcWeekVolume, calcWeekStress, calcWeekZones, calcWorkoutDistance,
  blockDistance, blockDurationMin, flattenBlocks,
  ZONE_COLORS, SPORT_ICONS, buildPhaseMap
} from '../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WorkoutForm from './WorkoutForm';

const ZONES  = ['z0','z1','z2','z3','z4','z5','z6'];

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

const SPORT_COLORS = {
  corrida:  '#16A34A',
  bike:     '#2563EB',
  natacao:  '#0EA5E9',
  forca:    '#A855F7',
  descanso: '#94A3B8',
};

const SPORT_LABELS = {
  corrida:  'Corrida',
  bike:     'Ciclismo',
  natacao:  'Natação',
  forca:    'Força',
  descanso: 'Descanso',
};

const PERIOD_TIMES  = { manha: '7:00 am', tarde: '3:00 pm', noite: '7:00 pm' };
const DAY_ABBR      = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  return `${m}:${String(s).padStart(2, '0')} min/km`;
}

function formatSpeed(distKm, totalMins) {
  if (distKm <= 0 || totalMins <= 0) return null;
  return `${((distKm / totalMins) * 60).toFixed(1)} km/h`;
}

// ── Mini chart icon ───────────────────────────────────────────────────────────
function ChartIcon({ color }) {
  return (
    <svg viewBox="0 0 14 12" width="14" height="12" fill={color}>
      <rect x="0" y="6"  width="3" height="6" rx="0.5" />
      <rect x="4.5" y="3"  width="3" height="9" rx="0.5" />
      <rect x="9" y="0"  width="3" height="12" rx="0.5" />
    </svg>
  );
}

// ── Workout card (Final Surge style) ──────────────────────────────────────────
function WorkoutCard({ workout, onEdit, onDelete }) {
  const blocks    = workout.blocks || [];
  const totalMins = blocks.reduce((s, b) => s + blockDurationMin(b), 0);
  const totalDist = blocks.reduce((s, b) => s + blockDistance(b), 0);
  const dist      = calcWorkoutDistance(workout);
  const sportColor = SPORT_COLORS[workout.type] || '#94A3B8';

  const pace  = workout.type === 'corrida' ? formatPace(dist, totalMins)  : null;
  const speed = workout.type === 'bike'    ? formatSpeed(dist, totalMins)  : null;
  const yds   = workout.type === 'natacao' && totalDist > 0
    ? `${Math.round(totalDist * 1000)} m` : null;

  const secondaryStat = pace || speed || yds;

  return (
    <div
      className="group relative bg-white rounded-xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all cursor-pointer select-none"
      style={{ borderLeft: `3px solid ${sportColor}` }}
      onClick={onEdit}
    >
      {/* Period time */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0">
        <span className="text-[11px] font-semibold" style={{ color: sportColor }}>
          {PERIOD_TIMES[workout.period] || '—'}
        </span>
        <span className="text-slate-300 flex-shrink-0">
          <ChartIcon color={sportColor + '80'} />
        </span>
      </div>

      {/* Sport + title */}
      <div className="px-3 pt-1 pb-0 flex items-start gap-1.5 min-w-0">
        <span className="text-base leading-none flex-shrink-0 mt-px">{SPORT_ICONS[workout.type] || '🏃'}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight text-slate-700 truncate">
            <span style={{ color: sportColor }}>{SPORT_LABELS[workout.type] || workout.type}</span>
            {workout.title ? ` – ${workout.title}` : ''}
          </p>
        </div>
      </div>

      {/* Stats row */}
      {(dist > 0 || totalMins > 0) && (
        <div className="px-3 pt-1.5 pb-1">
          <div className="flex items-baseline gap-3">
            {dist > 0 && (
              <span className="text-sm font-black text-slate-800 font-mono leading-none">
                {dist.toFixed(2)} km
              </span>
            )}
            {totalMins > 0 && (
              <span className="text-sm font-black text-slate-800 font-mono leading-none">
                {formatDuration(totalMins)}
              </span>
            )}
          </div>
          {secondaryStat && (
            <div className="text-[11px] text-slate-400 font-mono mt-0.5 leading-none">
              {secondaryStat}
            </div>
          )}
        </div>
      )}

      {/* Block bar — flatten sections first */}
      {totalDist > 0 && (
        <div className="flex h-1 mx-3 mb-2.5 mt-1 gap-px overflow-hidden rounded-full">
          {flattenBlocks(blocks).map((b, i) => {
            const bDist = blockDistance(b);
            if (bDist <= 0) return null;
            return (
              <div key={i}
                style={{ width: `${(bDist / totalDist) * 100}%`, backgroundColor: BLOCK_COLORS[b.type] || '#94A3B8', minWidth: 3 }}
                title={b.type}
              />
            );
          })}
        </div>
      )}

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-300 hover:text-red-500 text-xs items-center justify-center opacity-0 group-hover:opacity-100 hidden group-hover:flex transition-opacity shadow-sm"
      >×</button>
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  if (total === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-[#001F3F] mb-1">{label} — {total.toFixed(1)} km</p>
      {payload.filter(p => p.value > 0).reverse().map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.fill }} />
          <span className="font-mono">{p.value.toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

// ── Phase dot ─────────────────────────────────────────────────────────────────
function PhaseDot({ phase }) {
  const { state } = useApp();
  const { colors: phaseColors } = buildPhaseMap(state.phaseConfig);

  return (
    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: phaseColors[phase] || '#94A3B8' }} />
  );
}

// ── Weekly totals row (Final Surge style bottom summary) ──────────────────────
function WeekSummaryBar({ workouts, volume, stress }) {
  const byType = {};
  workouts.forEach(w => {
    const d = calcWorkoutDistance(w);
    const m = (w.blocks || []).reduce((s, b) => s + blockDurationMin(b), 0);
    if (!byType[w.type]) byType[w.type] = { dist: 0, mins: 0 };
    byType[w.type].dist += d;
    byType[w.type].mins += m;
  });

  const entries = Object.entries(byType).filter(([, v]) => v.dist > 0 || v.mins > 0);

  return (
    <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-6 flex-wrap">
      <div className="flex items-baseline gap-1">
        <span className="text-base font-black text-[#001F3F] font-mono">{volume.toFixed(1)}</span>
        <span className="text-xs text-slate-400">km total</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-black font-mono text-sky-600">{stress.toFixed(1)}</span>
        <span className="text-xs text-slate-400">ESS</span>
      </div>
      <div className="w-px h-4 bg-slate-200" />
      {entries.map(([type, v]) => (
        <div key={type} className="flex items-center gap-1.5">
          <span>{SPORT_ICONS[type]}</span>
          <span className="text-xs font-bold text-slate-600 font-mono">
            {v.dist > 0 ? `${v.dist.toFixed(1)} km` : ''}
            {v.dist > 0 && v.mins > 0 ? ' · ' : ''}
            {v.mins > 0 ? formatDuration(v.mins) : ''}
          </span>
        </div>
      ))}
      <div className="w-px h-4 bg-slate-200" />
      <div className="flex items-baseline gap-1">
        <span className="text-base font-black text-[#001F3F]">{workouts.length}</span>
        <span className="text-xs text-slate-400">{workouts.length === 1 ? 'sessão' : 'sessões'}</span>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function WeekDetail() {
  const { state, dispatch, selected } = useApp();
  const { confirm } = useConfirm();
  const [workoutModal, setWorkoutModal] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('weeks');

  const cycle   = selected.weekCycle;
  const variant = selected.weekVariant;
  const week    = selected.week;

  if (!cycle || !variant || !week) return null;

  const { colors: phaseColors, labels: phaseLabels, list: phaseList } = buildPhaseMap(state.phaseConfig);
  const allWeeks  = variant.weeks || [];
  const volume    = calcWeekVolume(week.workouts);
  const stress = calcWeekStress(week.workouts, state.zoneConfig);
  const weekZones = calcWeekZones(week.workouts, state.zoneConfig);

  const chartData = [0,1,2,3,4,5,6].map(day => {
    const dw  = week.workouts.filter(w => w.dayOfWeek === day);
    const row = { name: DAY_ABBR[day].slice(0,3) };
    const wz  = calcWeekZones(dw, state.zoneConfig);
    ZONES.forEach(z => { row[z] = parseFloat((wz[z] || 0).toFixed(2)); });
    return row;
  });

  const startDate = week.startDate ? new Date(week.startDate + 'T12:00:00') : null;

  function getDayDate(dayOfWeek) {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayOfWeek);
    return d.getDate();
  }

  function handleDeleteWorkout(id) {
    confirm({
      title: 'Excluir sessão?',
      message: 'Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      onConfirm: () => dispatch({ type: 'DELETE_WORKOUT', payload: {
        cycleId: cycle.id, variantId: variant.id, weekId: week.id, workoutId: id,
      }}),
    });
  }

  const periodOrder = { manha: 0, tarde: 1, noite: 2 };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 64px)' }}>

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-t-2xl px-5 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-4 justify-between">

          {/* Back + title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => dispatch({ type: 'GO_VARIANT', variantId: variant.id })}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#001F3F] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
            >
              ← Semanas
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <div>
              <p className="text-xs text-slate-400 leading-none">{cycle.name} · {variant.name}</p>
              <h1 className="text-lg font-black text-[#001F3F] leading-tight">Semana {week.weekNumber}</h1>
            </div>
          </div>

          {/* Phase pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-semibold">Fase:</span>
            {phaseList.map(phase => (
              <button key={phase.key}
                onClick={() => dispatch({ type: 'UPDATE_WEEK', payload: {
                  cycleId: cycle.id, variantId: variant.id, weekId: week.id, phase: phase.key,
                }})}
                className="text-xs px-2.5 py-0.5 rounded-full font-semibold transition-all border"
                style={{
                  backgroundColor: week.phase === phase.key ? phaseColors[phase.key] : 'transparent',
                  color:           week.phase === phase.key ? '#fff' : '#94A3B8',
                  borderColor:     week.phase === phase.key ? phaseColors[phase.key] : '#E2E8F0',
                }}>
                {phase.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 border-x border-slate-200 overflow-hidden min-h-0">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-52 flex-shrink-0 border-r border-slate-200 bg-white">

          <div className="flex border-b border-slate-100">
            {[{ id: 'weeks', label: 'Semanas' }, { id: 'stats', label: 'Zonas' }].map(tab => (
              <button key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={`flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2 ${
                  sidebarTab === tab.id
                    ? 'text-[#001F3F] border-[#001F3F]'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {sidebarTab === 'weeks' && (
            <div className="flex-1 overflow-y-auto py-2">
              {allWeeks.map(w => {
                const wVol = calcWeekVolume(w.workouts || []);
                const isCurrent = w.id === week.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => dispatch({ type: 'GO_WEEK', weekId: w.id })}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors group ${
                      isCurrent
                        ? 'bg-[#001F3F]/5 border-l-2 border-[#001F3F]'
                        : 'hover:bg-slate-50 border-l-2 border-transparent'
                    }`}
                  >
                    <PhaseDot phase={w.phase} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-bold truncate ${isCurrent ? 'text-[#001F3F]' : 'text-slate-600 group-hover:text-[#001F3F]'}`}>
                        Sem {w.weekNumber}
                        {w.startDate && (
                          <span className="font-normal text-slate-400 ml-1">
                            {new Date(w.startDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400 font-mono">{wVol > 0 ? `${wVol.toFixed(0)} km` : '—'}</span>
                        {w.phase && (
                          <span className="text-xs px-1.5 py-px rounded-full font-medium"
                            style={{
                              backgroundColor: `${phaseColors[w.phase] || '#94A3B8'}20`,
                              color: phaseColors[w.phase] || '#94A3B8',
                            }}>
                            {phaseLabels[w.phase] || w.phase}
                          </span>
                        )}
                      </div>
                    </div>
                    {(w.workouts || []).length > 0 && (
                      <span className="text-xs text-slate-300 flex-shrink-0">{(w.workouts || []).length}×</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {sidebarTab === 'stats' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Volume / Dia</h4>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#CBD5E1' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#CBD5E1' }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F8FAFC' }} />
                    {ZONES.map((z, i) => (
                      <Bar key={z} dataKey={z} stackId="a" fill={ZONE_COLORS[z]}
                        radius={i === ZONES.length - 1 ? [2,2,0,0] : [0,0,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Zonas da semana</h4>
                <div className="space-y-2">
                  {ZONES.map(z => {
                    const val = weekZones[z] || 0;
                    const pct = volume > 0 ? (val / volume) * 100 : 0;
                    if (val === 0) return null;
                    return (
                      <div key={z} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: ZONE_COLORS[z] }} />
                        <span className="text-slate-400 w-5">{z.toUpperCase()}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[z] }} />
                        </div>
                        <span className="text-slate-400 font-mono w-9 text-right">{val.toFixed(1)}</span>
                      </div>
                    );
                  })}
                  {volume === 0 && <p className="text-xs text-slate-300 text-center py-2">Sem sessões</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 7-column calendar ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-[#F8FAFC]">
          <div className="grid grid-cols-7 divide-x divide-slate-200 min-w-[600px] h-full">
            {[0,1,2,3,4,5,6].map(day => {
              const dayWorkouts = week.workouts
                .filter(w => w.dayOfWeek === day)
                .sort((a, b) => (periodOrder[a.period] ?? 0) - (periodOrder[b.period] ?? 0));
              const dayVol   = dayWorkouts.reduce((s, w) => s + calcWorkoutDistance(w), 0);
              const dayNum   = getDayDate(day);
              const isWeekend = day === 0 || day === 6;

              return (
                <div key={day} className={`flex flex-col ${isWeekend ? 'bg-slate-50/60' : 'bg-white'}`}>

                  {/* ── Day header (Final Surge style) ── */}
                  <div className="border-b border-slate-200 px-3 py-2.5 bg-inherit">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                          {DAY_ABBR[day]}
                        </div>
                        {dayNum ? (
                          <div className="text-3xl font-black text-slate-700 leading-none mt-0.5">
                            {dayNum}
                          </div>
                        ) : (
                          <div className="text-3xl font-black text-slate-200 leading-none mt-0.5">
                            {day + 1}
                          </div>
                        )}
                      </div>

                      {/* Right side: volume + add button */}
                      <div className="flex flex-col items-end gap-1.5 pt-0.5">
                        <button
                          onClick={() => setWorkoutModal({ defaultDay: day })}
                          title={`+ sessão`}
                          className="w-6 h-6 rounded-full bg-slate-100 hover:bg-[#001F3F] text-slate-400 hover:text-white text-sm font-bold flex items-center justify-center transition-all flex-shrink-0"
                        >+</button>
                        {dayVol > 0 && (
                          <div className="text-right">
                            <div className="text-xs font-black text-slate-500 font-mono leading-none">{dayVol.toFixed(1)}</div>
                            <div className="text-[9px] text-slate-400 leading-none">km</div>
                          </div>
                        )}
                        {dayWorkouts.length >= 2 && (
                          <div className="text-[9px] text-amber-500 font-bold leading-none">dupla</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Workout cards ── */}
                  <div className="flex-1 p-2 space-y-2 min-h-[220px]">
                    {dayWorkouts.length === 0 ? (
                      <div
                        onClick={() => setWorkoutModal({ defaultDay: day })}
                        className="h-full min-h-[100px] flex items-center justify-center rounded-xl border border-dashed border-slate-200 cursor-pointer hover:border-slate-300 hover:bg-slate-50/80 transition-colors group"
                      >
                        <span className="text-xs text-slate-200 group-hover:text-slate-400 transition-colors">+ treino</span>
                      </div>
                    ) : (
                      dayWorkouts.map(w => (
                        <WorkoutCard
                          key={w.id}
                          workout={w}
                          onEdit={() => setWorkoutModal({ workout: w })}
                          onDelete={() => handleDeleteWorkout(w.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom summary bar (Final Surge "Planned vs Completed" style) ──── */}
      <div className="border-x border-b border-slate-200 rounded-b-2xl overflow-hidden flex-shrink-0">
        <WeekSummaryBar workouts={week.workouts} volume={volume} stress={stress} />
      </div>

      {workoutModal !== null && (
        <WorkoutForm
          onClose={() => setWorkoutModal(null)}
          workout={workoutModal.workout}
          defaultDay={workoutModal.defaultDay}
          cycleId={cycle.id}
          variantId={variant.id}
          weekId={week.id}
        />
      )}
    </div>
  );
}
