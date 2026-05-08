import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { uuid, calcWorkoutDistance, SPORT_ICONS, buildPhaseMap } from '../utils/helpers';

const DAY_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const SPORT_COLORS = {
  corrida: '#16A34A', bike: '#2563EB', natacao: '#0EA5E9',
  forca: '#A855F7', descanso: '#94A3B8',
};

function formatDuration(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h === 0 ? `${m}min` : `${h}:${String(m).padStart(2,'0')}h`;
}

function CompareCard({ workout, onDragStart, isDragSource }) {
  const dist = calcWorkoutDistance(workout);
  const sportColor = SPORT_COLORS[workout.type] || '#94A3B8';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`rounded-lg border p-1.5 cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragSource ? 'opacity-40' : 'bg-white hover:shadow-md border-slate-100'
      }`}
      style={{ borderLeft: `3px solid ${sportColor}` }}
    >
      <p className="text-[10px] font-bold text-slate-700 truncate leading-tight">
        {SPORT_ICONS[workout.type] || '🏃'} {workout.title || workout.type}
      </p>
      <div className="flex gap-1.5 mt-0.5">
        {dist > 0 && (
          <span className="text-[11px] font-black text-slate-800 font-mono">{dist.toFixed(1)} km</span>
        )}
      </div>
    </div>
  );
}

function VariantSide({ variant, cycle, weekNumber, dragState, dragging, onDrop }) {
  const { state } = useApp();
  const { colors: phaseColors, labels: phaseLabels } = buildPhaseMap(state.phaseConfig);
  const week = variant?.weeks?.find(w => w.weekNumber === weekNumber);
  const phaseColor = phaseColors[week?.phase] || '#94A3B8';
  const phaseLabel = phaseLabels[week?.phase] || week?.phase || '';

  const periodOrder = { manha: 0, tarde: 1, noite: 2 };

  return (
    <div className="flex-1 min-w-0 border border-slate-200 rounded-2xl overflow-hidden flex flex-col">

      {/* Variant header */}
      <div className="bg-white px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-black text-[#001F3F] text-sm">{variant?.name || '—'}</h3>
          <p className="text-[10px] text-slate-400">{variant?.sessionsPerWeek}× por semana</p>
        </div>
        {week && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: phaseColor }}>
            {phaseLabel}
          </span>
        )}
      </div>

      {!week ? (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
          Semana {weekNumber} não encontrada
        </div>
      ) : (
        /* 7-column calendar */
        <div className="flex-1 grid grid-cols-7 divide-x divide-slate-100 overflow-y-auto">
          {[0,1,2,3,4,5,6].map(day => {
            const dayWorkouts = (week.workouts || [])
              .filter(w => w.dayOfWeek === day)
              .sort((a, b) => (periodOrder[a.period] ?? 0) - (periodOrder[b.period] ?? 0));
            const isWeekend = day === 0 || day === 6;

            return (
              <div
                key={day}
                className={`flex flex-col transition-colors ${
                  isWeekend ? 'bg-slate-50/60' : 'bg-white'
                } ${dragging ? 'hover:bg-blue-50/60' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  onDrop({ targetVariantId: variant.id, targetWeekId: week.id, targetDay: day });
                }}
              >
                {/* Day label */}
                <div className="px-1 py-1.5 border-b border-slate-100 text-center flex-shrink-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{DAY_ABBR[day]}</p>
                  {dayWorkouts.length > 0 && (
                    <p className="text-[9px] text-slate-300 font-mono mt-0.5">
                      {dayWorkouts.reduce((s, w) => s + calcWorkoutDistance(w), 0).toFixed(1)} km
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 p-1 space-y-1 min-h-[80px]">
                  {dayWorkouts.map(w => (
                    <CompareCard
                      key={w.id}
                      workout={w}
                      isDragSource={
                        dragging?.workoutId === w.id && dragging?.variantId === variant.id
                      }
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'copy';
                        dragState.current = {
                          workout: w,
                          sourceVariantId: variant.id,
                          sourceWeekId: week.id,
                        };
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function VariantCompare({ cycle, onClose }) {
  const { dispatch } = useApp();
  const dragState = useRef(null);
  const [dragging, setDragging] = useState(null);

  const variants = cycle.variants;
  const [leftId, setLeftId]   = useState(variants[0]?.id || '');
  const [rightId, setRightId] = useState(variants[1]?.id || variants[0]?.id || '');
  const [weekNumber, setWeekNumber] = useState(1);

  const leftVariant  = variants.find(v => v.id === leftId);
  const rightVariant = variants.find(v => v.id === rightId);

  function handleDrop({ targetVariantId, targetWeekId, targetDay }) {
    if (!dragState.current) return;
    const { workout, sourceVariantId } = dragState.current;
    if (sourceVariantId === targetVariantId) { setDragging(null); return; }

    dispatch({
      type: 'UPSERT_WORKOUT',
      payload: {
        cycleId: cycle.id,
        variantId: targetVariantId,
        weekId: targetWeekId,
        workout: { ...workout, id: uuid(), dayOfWeek: targetDay },
      },
    });
    dragState.current = null;
    setDragging(null);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col p-4">
      <div className="bg-[#F8FAFC] rounded-2xl flex flex-col flex-1 overflow-hidden shadow-2xl"
        onDragEnd={() => { dragState.current = null; setDragging(null); }}>

        {/* Header */}
        <div className="bg-[#001F3F] px-6 py-4 flex items-center gap-4 flex-shrink-0 rounded-t-2xl">
          <h2 className="text-white font-black text-lg flex-1">⟷ Comparar Variantes</h2>

          {/* Week navigator */}
          <div className="flex items-center gap-1 bg-white/10 rounded-xl px-3 py-1.5">
            <button
              onClick={() => setWeekNumber(n => Math.max(1, n - 1))}
              disabled={weekNumber <= 1}
              className="text-white disabled:opacity-30 hover:text-blue-200 w-7 h-7 flex items-center justify-center font-bold text-lg"
            >‹</button>
            <span className="text-white text-sm font-bold w-24 text-center">Semana {weekNumber} / {cycle.totalWeeks}</span>
            <button
              onClick={() => setWeekNumber(n => Math.min(cycle.totalWeeks, n + 1))}
              disabled={weekNumber >= cycle.totalWeeks}
              className="text-white disabled:opacity-30 hover:text-blue-200 w-7 h-7 flex items-center justify-center font-bold text-lg"
            >›</button>
          </div>

          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none ml-2">×</button>
        </div>

        {/* Variant selectors */}
        <div className="flex gap-6 px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 items-center">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Esquerda</span>
            <select value={leftId} onChange={e => setLeftId(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#001F3F]/40 bg-white font-semibold text-[#001F3F]">
              {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <span className="text-slate-300 text-xl flex-shrink-0">⟷</span>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Direita</span>
            <select value={rightId} onChange={e => setRightId(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#001F3F]/40 bg-white font-semibold text-[#001F3F]">
              {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>

        {/* Drag hint */}
        <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0">
          <p className="text-xs text-amber-700">
            💡 Arraste um treino de uma variante e solte em um dia da outra para copiar.
          </p>
        </div>

        {/* Main — two calendars side by side */}
        <div className="flex-1 overflow-auto p-4"
          onDragStart={e => {
            if (dragState.current) {
              setDragging({
                workoutId: dragState.current.workout.id,
                variantId: dragState.current.sourceVariantId,
              });
            }
          }}>
          <div className="flex gap-3 h-full min-w-[800px]">
            <VariantSide
              variant={leftVariant}
              cycle={cycle}
              weekNumber={weekNumber}
              dragState={dragState}
              dragging={dragging}
              onDrop={handleDrop}
            />
            <VariantSide
              variant={rightVariant}
              cycle={cycle}
              weekNumber={weekNumber}
              dragState={dragState}
              dragging={dragging}
              onDrop={handleDrop}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
