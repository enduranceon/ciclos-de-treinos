import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import VariantCompare from './VariantCompare';
import {
  calcWeekVolume, calcWeekZones,
  ZONE_COLORS, SPORT_ICONS, buildPhaseMap, DEFAULT_PHASE_CONFIG,
} from '../utils/helpers';

// ── Cycle structure editor ────────────────────────────────────────────────────
function CycleStructureEditor({ cycle, onClose }) {
  const { state, dispatch } = useApp();
  const { colors: phaseColors, labels: phaseLabels, list: phaseList } = buildPhaseMap(state.phaseConfig);

  // Seed local phases from first variant (if exists) or from cycle.phaseMap or auto
  function seedPhases() {
    const firstVariant = cycle.variants[0];
    if (firstVariant?.weeks?.length) {
      const map = {};
      firstVariant.weeks.forEach(w => { map[w.weekNumber] = w.phase; });
      return map;
    }
    if (cycle.phaseMap) return { ...cycle.phaseMap };
    // Auto-distribute proportionally across configured phases
    return autoDistributeMap(cycle.totalWeeks, phaseList);
  }

  function autoDistributeMap(totalWeeks, list) {
    const map = {};
    const n = list.length;
    if (n === 0) return map;
    for (let i = 1; i <= totalWeeks; i++) {
      const pct = i / totalWeeks;
      // Last phase = last week; distribute rest proportionally
      if (i === totalWeeks) { map[i] = list[n - 1].key; continue; }
      // Simple: divide evenly except last 2 weeks go to last phase
      map[i] = list[Math.min(Math.floor(pct * (n - 0.5)), n - 2)].key;
    }
    // Simpler proportional: bucket each week
    for (let i = 1; i <= totalWeeks; i++) {
      if (i === totalWeeks) { map[i] = list[n - 1].key; continue; }
      const bucket = Math.floor(((i - 1) / (totalWeeks - 1)) * (n - 1));
      map[i] = list[Math.min(bucket, n - 2)].key;
    }
    return map;
  }

  const [phases, setPhases]       = useState(seedPhases);
  const [raceDate, setRaceDate]   = useState(cycle.raceDate || '');
  const [activePh, setActivePh]   = useState(() => (state.phaseConfig || DEFAULT_PHASE_CONFIG)[0]?.key || 'base');
  const [dragging, setDragging]   = useState(false);

  function applyPhase(weekNum) {
    setPhases(p => ({ ...p, [weekNum]: activePh }));
  }

  function autoDistribute() {
    setPhases(autoDistributeMap(cycle.totalWeeks, phaseList));
  }

  function handleSave() {
    dispatch({
      type: 'SET_CYCLE_PHASES',
      payload: { cycleId: cycle.id, phaseMap: phases, raceDate: raceDate || null },
    });
    onClose();
  }

  // Phase distribution summary
  const summary = phaseList.map(p => ({
    ...p,
    value: p.key,
    count: Object.values(phases).filter(v => v === p.key).length,
  })).filter(p => p.count > 0);

  // Compute week date preview (based on raceDate)
  function getWeekDate(weekNum) {
    if (!raceDate) return null;
    const weeksFromEnd = cycle.totalWeeks - weekNum;
    const d = new Date(raceDate + 'T12:00:00');
    d.setDate(d.getDate() - weeksFromEnd * 7);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-[#001F3F]/10 overflow-hidden">
      {/* Header */}
      <div className="bg-[#001F3F]/5 px-6 py-4 flex items-center justify-between border-b border-[#001F3F]/10">
        <div>
          <h3 className="font-black text-[#001F3F] text-base">🗓️ Estrutura do Ciclo</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {cycle.totalWeeks} semanas · selecione uma fase e clique nas semanas para atribuir
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={autoDistribute}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
            ⚡ Auto-distribuir
          </button>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-500 text-sm flex items-center justify-center transition-colors">
            ×
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Race date + phase selector row */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Race date */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
            <span className="text-sm">📅</span>
            <label className="text-xs font-semibold text-slate-500">Data da Prova</label>
            <input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] bg-white" />
            {raceDate && (
              <span className="text-xs text-slate-400">Datas calculadas automaticamente</span>
            )}
          </div>

          {/* Phase buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Pintar com:</span>
            {phaseList.map(p => (
              <button key={p.key} onClick={() => setActivePh(p.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all"
                style={{
                  backgroundColor: activePh === p.key ? p.color : p.color + '20',
                  borderColor: p.color,
                  color: activePh === p.key ? '#fff' : p.color,
                  boxShadow: activePh === p.key ? `0 0 0 3px ${p.color}40` : 'none',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Week grid */}
        <div
          className="select-none"
          onMouseLeave={() => setDragging(false)}
          onMouseUp={() => setDragging(false)}
        >
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: cycle.totalWeeks }, (_, i) => i + 1).map(wn => {
              const phase = phases[wn] || phaseList[0]?.key || 'base';
              const color = phaseColors[phase] || '#94A3B8';
              const dateLabel = getWeekDate(wn);
              return (
                <button
                  key={wn}
                  onMouseDown={() => { setDragging(true); applyPhase(wn); }}
                  onMouseEnter={() => { if (dragging) applyPhase(wn); }}
                  onClick={() => applyPhase(wn)}
                  className="flex flex-col items-center justify-center rounded-xl font-bold text-white transition-all hover:scale-105 hover:shadow-md active:scale-95"
                  style={{
                    backgroundColor: color,
                    width: cycle.totalWeeks > 20 ? '44px' : '52px',
                    height: cycle.totalWeeks > 20 ? '44px' : '56px',
                    fontSize: cycle.totalWeeks > 20 ? '11px' : '12px',
                  }}
                  title={`Semana ${wn} — ${phaseLabels[phase] || phase}`}
                >
                  <span className="font-black leading-none">{wn}</span>
                  {dateLabel && (
                    <span className="text-white/70 leading-none mt-0.5" style={{ fontSize: '8px' }}>{dateLabel}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Drag hint */}
          <p className="text-xs text-slate-300 mt-2">
            💡 Clique e arraste para atribuir a fase a várias semanas de uma vez
          </p>
        </div>

        {/* Phase summary */}
        {summary.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-semibold">Resumo:</span>
            {summary.map(p => (
              <span key={p.value} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: p.color }}>
                {p.label} · {p.count} sem.
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} className="btn-primary">
            ✓ Salvar Estrutura
          </button>
        </div>
      </div>
    </div>
  );
}

// ── VariantForm ───────────────────────────────────────────────────────────────
function VariantForm({ onClose, cycleId, editVariant }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: editVariant?.name || '',
    sessionsPerWeek: editVariant?.sessionsPerWeek || 3,
    hasDobra: editVariant?.hasDobra || false,
    description: editVariant?.description || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    if (editVariant) {
      dispatch({ type: 'UPDATE_VARIANT', payload: { cycleId, variantId: editVariant.id, ...form } });
    } else {
      dispatch({ type: 'CREATE_VARIANT', payload: { cycleId, ...form } });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">{editVariant ? 'Editar Variante' : 'Nova Variante'}</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Nome da Variante *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex: Iniciante, Intermediário, Avançado" className="input" />
          </div>
          <div>
            <label className="label">Sessões por semana</label>
            <div className="flex gap-2 mt-1">
              {[2,3,4,5,6].map(n => (
                <button key={n} type="button" onClick={() => set('sessionsPerWeek', n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all border ${
                    form.sessionsPerWeek === n ? 'bg-[#001F3F] text-white border-[#001F3F]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>{n}×</button>
              ))}
            </div>
          </div>
          <div onClick={() => set('hasDobra', !form.hasDobra)}
            className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${
              form.hasDobra ? 'border-[#001F3F] bg-[#001F3F]/5' : 'border-slate-200 hover:border-slate-300'
            }`}>
            <div>
              <p className="font-semibold text-sm text-[#001F3F]">Contém sessões duplas (dobra)</p>
              <p className="text-xs text-slate-400 mt-0.5">Ex: natação de manhã + corrida à tarde</p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 flex items-center px-0.5 ${form.hasDobra ? 'bg-[#001F3F]' : 'bg-slate-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.hasDobra ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Ex: Para atletas com 1 ano de experiência..." className="input resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">{editVariant ? 'Salvar' : 'Criar Variante'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Phase timeline ─────────────────────────────────────────────────────────────
function PhaseTimeline({ weeks }) {
  const { state } = useApp();
  const { colors: phaseColors, labels: phaseLabels, list: phaseList } = buildPhaseMap(state.phaseConfig);
  if (!weeks || weeks.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Linha do tempo de fases</p>
      <div className="flex h-6 rounded-xl overflow-hidden gap-px">
        {weeks.map(w => (
          <div
            key={w.id}
            className="flex-1 flex items-center justify-center transition-all hover:opacity-80"
            style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}
            title={`Sem ${w.weekNumber} — ${phaseLabels[w.phase] || w.phase}`}
          />
        ))}
      </div>
      {/* Phase legend */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {phaseList.map(p => {
          const count = weeks.filter(w => w.phase === p.key).length;
          if (count === 0) return null;
          return (
            <div key={p.key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
              <span className="text-xs text-slate-500 font-medium">{p.label}</span>
              <span className="text-xs text-slate-400">({count} sem.)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Variant card ──────────────────────────────────────────────────────────────
function VariantCard({ variant, cycleId, onOpen, onEdit, onDelete, zoneConfig }) {
  const totalVolume    = variant.weeks.reduce((s, w) => s + calcWeekVolume(w.workouts), 0);
  const prescribedWeeks = variant.weeks.filter(w => w.workouts.length > 0).length;
  const totalWeeks     = variant.weeks.length;
  const zones          = ['z0','z1','z2','z3','z4','z5','z6'];
  const zoneTotals     = zones.map(z =>
    variant.weeks.reduce((s, w) => s + (calcWeekZones(w.workouts, zoneConfig)[z] || 0), 0)
  );
  const maxZone = Math.max(...zoneTotals, 1);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
      {/* Prescription progress bar */}
      <div className="h-1 bg-slate-100">
        <div className="h-full bg-[#001F3F] transition-all"
          style={{ width: `${(prescribedWeeks / totalWeeks) * 100}%` }} />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-[#001F3F] text-lg">{variant.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400">{variant.sessionsPerWeek}× por semana</p>
              {variant.hasDobra && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">☀️ dobra</span>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(variant)} className="icon-btn" title="Editar">✎</button>
            <button onClick={() => onDelete(cycleId, variant.id)} className="icon-btn hover:text-red-500" title="Excluir">✕</button>
          </div>
        </div>

        {variant.description && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-2">{variant.description}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Semanas',    value: totalWeeks },
            { label: 'Prescritas', value: prescribedWeeks },
            { label: 'Volume',     value: `${totalVolume.toFixed(0)} km` },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg py-2 text-center">
              <div className="text-base font-black text-[#001F3F]">{s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        {maxZone > 0 && (
          <div className="space-y-1 mb-4">
            {zones.map((z, i) => zoneTotals[i] > 0 && (
              <div key={z} className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-300 w-4">{z.toUpperCase()}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${(zoneTotals[i] / maxZone) * 100}%`, backgroundColor: ZONE_COLORS[z] }} />
                </div>
                <span className="text-xs font-mono text-slate-400 w-12 text-right">{zoneTotals[i].toFixed(0)} km</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => onOpen(variant.id)} className="btn-primary w-full text-sm">
          Prescrever Treinos →
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CycleDetail() {
  const { state, dispatch, selected } = useApp();
  const { confirm } = useConfirm();
  const [showForm, setShowForm]         = useState(false);
  const [editVariant, setEditVariant]   = useState(null);
  const [showStructure, setShowStructure] = useState(false);
  const [showCompare, setShowCompare]   = useState(false);

  const cycle = selected.cycle;
  if (!cycle) return null;

  // Aggregate stats across all variants
  const allWorkouts = cycle.variants.flatMap(v => v.weeks.flatMap(w => w.workouts));
  const totalSessions = allWorkouts.length;
  const totalVolume   = cycle.variants.reduce((s, v) =>
    s + v.weeks.reduce((ss, w) => ss + calcWeekVolume(w.workouts), 0), 0);

  // Weeks from first variant for phase timeline
  const timelineWeeks = cycle.variants[0]?.weeks || [];

  function handleDelete(cycleId, variantId) {
    confirm({
      title: 'Excluir variante?',
      message: 'Todos os treinos desta variante serão removidos. Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      onConfirm: () => dispatch({ type: 'DELETE_VARIANT', payload: { cycleId, variantId } }),
    });
  }

  return (
    <div className="space-y-6">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="bg-[#001F3F] rounded-2xl px-7 py-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">{SPORT_ICONS[cycle.sport] || '🏃'}</span>
              <h1 className="text-2xl font-black leading-tight">{cycle.name}</h1>
            </div>
            <div className="flex items-center gap-3 text-blue-300 text-sm flex-wrap">
              {cycle.distance && <span>{cycle.distance} km</span>}
              {cycle.distance && <span className="text-blue-600">·</span>}
              <span>{cycle.totalWeeks} semanas</span>
              <span className="text-blue-600">·</span>
              <span>{cycle.variants.length} variante{cycle.variants.length !== 1 ? 's' : ''}</span>
              {totalSessions > 0 && <>
                <span className="text-blue-600">·</span>
                <span>{totalSessions} sessões prescritas</span>
              </>}
            </div>
            {cycle.description && (
              <p className="text-blue-200 text-sm mt-2 max-w-xl">{cycle.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowStructure(s => !s)}
              className={`flex items-center gap-2 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors ${
                showStructure
                  ? 'bg-blue-200 text-[#001F3F]'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}>
              🗓️ Estrutura do Ciclo
            </button>
            {cycle.variants.length >= 2 && (
              <button onClick={() => setShowCompare(true)}
                className="flex items-center gap-2 bg-white/20 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-white/30 transition-colors">
                ⟷ Comparar
              </button>
            )}
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-white text-[#001F3F] font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
              <span className="text-lg leading-none">+</span> Nova Variante
            </button>
          </div>
        </div>

        {/* Quick stats */}
        {cycle.variants.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Semanas',    value: cycle.totalWeeks,                              unit: '' },
              { label: 'Variantes',  value: cycle.variants.length,                         unit: '' },
              { label: 'Sessões',    value: totalSessions,                                 unit: '' },
              { label: 'Vol. Total', value: totalVolume > 0 ? totalVolume.toFixed(0) : '—', unit: totalVolume > 0 ? 'km' : '' },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-xl px-4 py-3 text-center">
                <div className="text-xl font-black text-white leading-none">{s.value}<span className="text-xs font-normal text-blue-300 ml-1">{s.unit}</span></div>
                <div className="text-xs text-blue-300 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cycle structure editor ───────────────────────────────────────── */}
      {showStructure && (
        <CycleStructureEditor cycle={cycle} onClose={() => setShowStructure(false)} />
      )}

      {/* ── Phase timeline ────────────────────────────────────────────────── */}
      {timelineWeeks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-5">
          <PhaseTimeline weeks={timelineWeeks} />
        </div>
      )}

      {/* ── Variants ─────────────────────────────────────────────────────── */}
      {cycle.variants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100">
          <div className="text-5xl mb-4">📂</div>
          <h2 className="text-lg font-bold text-[#001F3F] mb-2">Nenhuma variante ainda</h2>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">
            Crie variantes como "Iniciante (3×/sem)", "Intermediário (4×/sem)" e "Avançado (5×/sem)"
            com prescrições diferentes para as {cycle.totalWeeks} semanas.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Criar Primeira Variante</button>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3">Variantes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cycle.variants.map(variant => (
              <VariantCard
                key={variant.id}
                variant={variant}
                cycleId={cycle.id}
                zoneConfig={state.zoneConfig}
                onOpen={variantId => dispatch({ type: 'GO_VARIANT', variantId })}
                onEdit={v => setEditVariant(v)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && <VariantForm onClose={() => setShowForm(false)} cycleId={cycle.id} />}
      {editVariant && (
        <VariantForm onClose={() => setEditVariant(null)} cycleId={cycle.id} editVariant={editVariant} />
      )}
      {showCompare && (
        <VariantCompare cycle={cycle} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
}
