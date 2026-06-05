import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// ── Cores e labels por esporte ─────────────────────────────────────────────────
const SPORT = {
  corrida:  { color: '#3B82F6', bg: '#EFF6FF', label: 'Corrida',   short: 'COR' },
  bike:     { color: '#F59E0B', bg: '#FFFBEB', label: 'Ciclismo',  short: 'BIK' },
  natacao:  { color: '#06B6D4', bg: '#ECFEFF', label: 'Natação',   short: 'NAT' },
  forca:    { color: '#8B5CF6', bg: '#F5F3FF', label: 'Força',     short: 'FOR' },
  descanso: { color: '#94A3B8', bg: '#F8FAFC', label: 'Descanso',  short: 'DSC' },
};

const SPORT_OPTIONS = Object.entries(SPORT).map(([value, s]) => ({ value, label: s.label }));

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Helpers de data ────────────────────────────────────────────────────────────
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseISO(s) { return new Date(s + 'T12:00:00'); }
function isToday(iso) { return iso === toISO(new Date()); }

function getMonthGrid(year, month) {
  // Retorna array de 5-6 semanas, cada semana com 7 dias (ISO strings)
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Começa na segunda-feira antes do dia 1
  const startDay = first.getDay(); // 0=Dom
  const offset = startDay === 0 ? 6 : startDay - 1;
  const start  = new Date(first);
  start.setDate(start.getDate() - offset);

  const weeks = [];
  let cur = new Date(start);
  while (cur <= last || weeks.length < 4) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(toISO(new Date(cur)));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur.getMonth() !== month && cur > last) break;
    if (weeks.length >= 6) break;
  }
  return weeks;
}

// ── Modal de prescrição ────────────────────────────────────────────────────────
function PrescribeModal({ date, athleteId, coachId, onClose, onSaved, editWorkout }) {
  const isEdit = !!editWorkout;
  const [form, setForm] = useState({
    title:                  editWorkout?.title                  || '',
    sport:                  editWorkout?.sport                  || 'corrida',
    description:            editWorkout?.description            || '',
    estimated_duration_min: editWorkout?.estimated_duration_min || '',
    estimated_distance_km:  editWorkout?.estimated_distance_km  || '',
  });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSaving(true);
    const payload = {
      athlete_id:             athleteId,
      coach_id:               coachId,
      scheduled_date:         date,
      sport:                  form.sport,
      title:                  form.title,
      description:            form.description || null,
      estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
      estimated_distance_km:  form.estimated_distance_km  ? Number(form.estimated_distance_km)  : null,
      blocks: editWorkout?.blocks || [],
    };
    const { error: err } = isEdit
      ? await supabase.from('prescribed_workout').update(payload).eq('id', editWorkout.id)
      : await supabase.from('prescribed_workout').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!editWorkout?.id) return;
    if (!confirm('Remover este treino?')) return;
    await supabase.from('prescribed_workout').delete().eq('id', editWorkout.id);
    onSaved();
    onClose();
  }

  const d = parseISO(date);
  const dateLabel = `${WEEKDAYS[(d.getDay()+6)%7]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-300 text-xs uppercase tracking-widest font-bold">{dateLabel}</p>
            <h2 className="text-white font-bold text-base mt-0.5">
              {isEdit ? 'Editar Treino' : 'Prescrever Treino'}
            </h2>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Título *</label>
            <input required value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex: Long Run Z2, Intervalado 4×1km, Fartlek 40min…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>

          {/* Esporte + duração + distância */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Esporte</label>
              <select value={form.sport} onChange={e => set('sport', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]">
                {SPORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Duração (min)</label>
              <input type="number" min="1" value={form.estimated_duration_min}
                onChange={e => set('estimated_duration_min', e.target.value)}
                placeholder="60"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Distância (km)</label>
              <input type="number" min="0" step="0.1" value={form.estimated_distance_km}
                onChange={e => set('estimated_distance_km', e.target.value)}
                placeholder="12"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Descrição / Estrutura</label>
            <textarea rows={4} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="10min aquecimento Z1&#10;30min Z2 pace controlado&#10;5×2min Z4 c/ 90s recuperação&#10;10min volta à calma"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            {isEdit && (
              <button type="button" onClick={handleDelete}
                className="border border-red-200 text-red-600 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50">
                Remover
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] disabled:opacity-50">
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Prescrever'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card de treino no calendário ───────────────────────────────────────────────
function WorkoutCard({ w, completed, onClick }) {
  const s = SPORT[w.sport] || SPORT.corrida;
  return (
    <button onClick={e => { e.stopPropagation(); onClick(w); }}
      title={w.title}
      className="w-full text-left rounded-md px-1.5 py-1 mb-0.5 flex items-start gap-1.5 group/card hover:opacity-80 transition-opacity"
      style={{ backgroundColor: completed ? '#F0FDF4' : s.bg, borderLeft: `3px solid ${s.color}` }}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black truncate leading-tight" style={{ color: s.color }}>
          {w.title}
        </div>
        <div className="text-[9px] text-slate-500 leading-tight font-mono mt-0.5">
          {w.estimated_duration_min ? `${w.estimated_duration_min}min` : ''}
          {w.estimated_duration_min && w.estimated_distance_km ? ' · ' : ''}
          {w.estimated_distance_km ? `${w.estimated_distance_km}km` : ''}
        </div>
      </div>
      {completed && <span className="text-green-500 text-[10px] font-black flex-shrink-0 mt-0.5">✓</span>}
    </button>
  );
}

// ── Vista principal: calendário mensal ─────────────────────────────────────────
export default function AthleteCalendarCoachView({ athleteId, onBack }) {
  const { session } = useAuth();
  const coachId = session?.user?.id;

  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [athlete, setAthlete]   = useState(null);
  const [prescribed, setPrescribed] = useState([]);
  const [completed,  setCompleted]  = useState([]);
  const [loading, setLoading]   = useState(true);

  // Modal state
  const [modal, setModal] = useState(null); // { date, workout? }

  // Grade do mês
  const grid = getMonthGrid(year, month);
  const firstDay = `${year}-${String(month+1).padStart(2,'0')}-01`;
  const lastWeek = grid[grid.length-1];
  const lastDay  = lastWeek[6];

  const load = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    const [aRes, presRes, compRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', athleteId).maybeSingle(),
      supabase.from('prescribed_workout')
        .select('id, scheduled_date, sport, title, description, estimated_duration_min, estimated_distance_km, blocks')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', grid[0][0])
        .lte('scheduled_date', lastDay)
        .order('scheduled_date'),
      supabase.from('completed_workout')
        .select('id, prescribed_workout_id, completed_at')
        .eq('athlete_id', athleteId)
        .gte('completed_at', grid[0][0] + 'T00:00:00')
        .lte('completed_at', lastDay + 'T23:59:59'),
    ]);
    if (!aRes.error) setAthlete(aRes.data);
    if (!presRes.error) setPrescribed(presRes.data || []);
    if (!compRes.error) setCompleted(compRes.data || []);
    setLoading(false);
  }, [athleteId, year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 0) { setYear(y => y-1); setMonth(11); }
    else setMonth(m => m-1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y+1); setMonth(0); }
    else setMonth(m => m+1);
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  function workoutsForDay(iso) {
    return prescribed.filter(p => p.scheduled_date === iso);
  }
  function isCompleted(prescId) {
    return completed.some(c => c.prescribed_workout_id === prescId);
  }

  // Totais por semana
  function weekTotals(week) {
    const ws = week.flatMap(d => workoutsForDay(d));
    const mins = ws.reduce((s, w) => s + (w.estimated_duration_min || 0), 0);
    const km   = ws.reduce((s, w) => s + (w.estimated_distance_km  || 0), 0);
    const h = Math.floor(mins/60), m = mins%60;
    return {
      workouts: ws.length,
      time: mins ? (h ? `${h}h${m ? String(m).padStart(2,'0') : ''}` : `${m}min`) : '',
      km:   km   ? `${Number(km.toFixed(1))}km` : '',
    };
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb back */}
      <button onClick={onBack}
        className="text-sm text-slate-500 hover:text-[#001F3F] mb-4 inline-flex items-center gap-1 self-start">
        ← Voltar ao time
      </button>

      {/* Header do calendário */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black text-[#001F3F]">{athlete?.full_name || '…'}</h1>
            <span className="text-slate-400 text-sm font-medium">— Calendário de Treinos</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm">
              ‹
            </button>
            <span className="text-lg font-black text-[#001F3F] w-44 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm">
              ›
            </button>
            <button onClick={goToday}
              className="ml-1 text-xs font-bold text-slate-500 hover:text-[#001F3F] border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50">
              Hoje
            </button>
          </div>
        </div>

        {/* Legenda de esportes */}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {Object.entries(SPORT).filter(([k]) => k !== 'descanso').map(([k, s]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid do calendário */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Header dos dias da semana */}
        <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
          <div className="border-r border-slate-100" /> {/* coluna de totais */}
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Semanas */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Carregando…</div>
        ) : (
          grid.map((week, wi) => {
            const tots = weekTotals(week);
            return (
              <div key={wi} className="grid border-b border-slate-100 last:border-b-0"
                style={{ gridTemplateColumns: '44px repeat(7, 1fr)', minHeight: '110px' }}>

                {/* Totais da semana */}
                <div className="border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center px-1 py-2 gap-1">
                  {tots.workouts > 0 ? (
                    <>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">S{wi+1}</span>
                      {tots.km   && <span className="text-[10px] font-bold text-[#001F3F] leading-tight">{tots.km}</span>}
                      {tots.time && <span className="text-[9px] text-slate-500 leading-tight">{tots.time}</span>}
                    </>
                  ) : (
                    <span className="text-[9px] text-slate-300 font-bold">S{wi+1}</span>
                  )}
                </div>

                {/* Dias */}
                {week.map((iso, di) => {
                  const dayWorkouts  = workoutsForDay(iso);
                  const d = parseISO(iso);
                  const isCurrentMonth = d.getMonth() === month;
                  const today = isToday(iso);

                  return (
                    <div key={iso}
                      onClick={() => setModal({ date: iso })}
                      className={`
                        border-r border-slate-100 last:border-r-0 p-1.5 cursor-pointer
                        group transition-colors relative
                        ${today ? 'bg-blue-50/60' : isCurrentMonth ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/30 hover:bg-slate-50/60'}
                      `}>
                      {/* Número do dia */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`
                          text-xs font-black leading-none px-1.5 py-0.5 rounded-md
                          ${today
                            ? 'bg-[#001F3F] text-white'
                            : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                          }
                        `}>
                          {d.getDate()}
                        </span>
                        {/* Botão + aparece no hover */}
                        <button
                          onClick={e => { e.stopPropagation(); setModal({ date: iso }); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-md bg-[#001F3F]/10 hover:bg-[#001F3F]/20 text-[#001F3F] text-xs font-black"
                          title="Prescrever treino">
                          +
                        </button>
                      </div>

                      {/* Treinos do dia */}
                      <div className="space-y-0.5">
                        {dayWorkouts.map(w => (
                          <WorkoutCard key={w.id} w={w}
                            completed={isCompleted(w.id)}
                            onClick={wk => setModal({ date: iso, workout: wk })} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de prescrição/edição */}
      {modal && (
        <PrescribeModal
          date={modal.date}
          athleteId={athleteId}
          coachId={coachId}
          editWorkout={modal.workout || null}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
