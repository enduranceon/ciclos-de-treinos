import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { blockDurationMin, calcWorkoutDistance } from '../utils/helpers';

// ── Constantes visuais ─────────────────────────────────────────────────────────
const SPORT = {
  corrida:  { color: '#3B82F6', bg: '#EFF6FF', label: 'Corrida'  },
  bike:     { color: '#F59E0B', bg: '#FFFBEB', label: 'Ciclismo' },
  natacao:  { color: '#06B6D4', bg: '#ECFEFF', label: 'Natação'  },
  forca:    { color: '#8B5CF6', bg: '#F5F3FF', label: 'Força'    },
  descanso: { color: '#94A3B8', bg: '#F8FAFC', label: 'Descanso' },
};
const SPORT_OPTIONS = Object.entries(SPORT).map(([v, s]) => ({ value: v, label: s.label }));

const WEEKDAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Helpers de data ────────────────────────────────────────────────────────────
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseISO(s) { return new Date(s + 'T12:00:00'); }
function isToday(iso) { return iso === toISO(new Date()); }

function getMonthGrid(year, month) {
  const first  = new Date(year, month, 1);
  const last   = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const offset = startDay === 0 ? 6 : startDay - 1;
  const start  = new Date(first);
  start.setDate(start.getDate() - offset);
  const weeks = [];
  let cur = new Date(start);
  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(toISO(new Date(cur))); cur.setDate(cur.getDate()+1); }
    weeks.push(week);
    if (cur.getMonth() !== month && cur > last) break;
    if (weeks.length >= 6) break;
  }
  return weeks;
}

// Calcula duração total de um treino a partir dos blocos
function calcDurationMin(blocks) {
  return Math.round((blocks || []).reduce((s, b) => s + blockDurationMin(b), 0));
}

// ── Modal de Prescrição (Biblioteca + Novo) ───────────────────────────────────
function PrescribeModal({ date, athleteId, coachId, onClose, onSaved, editWorkout }) {
  const { state, dispatch } = useApp();
  const isEdit = !!editWorkout;
  const library = state.workoutLibrary || [];

  // Tabs: 'library' | 'new'
  const [tab, setTab] = useState(isEdit ? 'new' : 'library');

  // Filtros da biblioteca
  const [search, setSearch]         = useState('');
  const [filterSport, setFilterSport] = useState('');

  // Formulário de novo treino
  const [form, setForm] = useState({
    title:                  editWorkout?.title                  || '',
    sport:                  editWorkout?.sport                  || 'corrida',
    description:            editWorkout?.description            || '',
    estimated_duration_min: editWorkout?.estimated_duration_min || '',
    estimated_distance_km:  editWorkout?.estimated_distance_km  || '',
    blocks:                 editWorkout?.blocks                 || [],
  });
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Quando seleciona um treino da biblioteca, preenche o formulário
  function selectFromLibrary(w) {
    const dur = w.estimated_duration_min ?? calcDurationMin(w.blocks);
    const dist = w.estimated_distance_km  ?? parseFloat(calcWorkoutDistance(w).toFixed(2));
    setForm({
      title:                  w.title || '',
      sport:                  w.type  || w.sport || 'corrida',
      description:            w.description || '',
      estimated_duration_min: dur  || '',
      estimated_distance_km:  dist || '',
      blocks:                 w.blocks || [],
    });
    setTab('new'); // vai pra aba de form pra confirmar antes de prescrever
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const payload = {
        athlete_id:             athleteId,
        coach_id:               coachId,
        scheduled_date:         date,
        sport:                  form.sport,
        title:                  form.title,
        description:            form.description || null,
        estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
        estimated_distance_km:  form.estimated_distance_km  ? Number(form.estimated_distance_km)  : null,
        blocks:                 form.blocks || [],
      };

      const { error: err } = isEdit
        ? await supabase.from('prescribed_workout').update(payload).eq('id', editWorkout.id)
        : await supabase.from('prescribed_workout').insert(payload);
      if (err) throw err;

      // Salvar na biblioteca (apenas treinos novos)
      if (saveToLibrary && !isEdit) {
        dispatch({
          type: 'ADD_LIBRARY_WORKOUT',
          payload: {
            type:        form.sport,
            title:       form.title,
            description: form.description || '',
            blocks:      form.blocks || [],
          },
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editWorkout?.id) return;
    if (!confirm('Remover este treino do calendário?')) return;
    await supabase.from('prescribed_workout').delete().eq('id', editWorkout.id);
    onSaved(); onClose();
  }

  const d = parseISO(date);
  const dateLabel = `${WEEKDAYS[(d.getDay()+6)%7]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;

  // Biblioteca filtrada
  const filteredLibrary = library.filter(w => {
    const matchSport = !filterSport || (w.type || w.sport) === filterSport;
    const matchText  = !search || (w.title || '').toLowerCase().includes(search.toLowerCase());
    return matchSport && matchText;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-blue-300 text-xs uppercase tracking-widest font-bold">{dateLabel}</p>
            <h2 className="text-white font-bold text-base mt-0.5">
              {isEdit ? 'Editar Treino' : 'Prescrever Treino'}
            </h2>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        {!isEdit && (
          <div className="flex border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => setTab('library')}
              className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${
                tab === 'library'
                  ? 'border-[#001F3F] text-[#001F3F]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              📚 Biblioteca de Treinos
            </button>
            <button
              onClick={() => setTab('new')}
              className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${
                tab === 'new'
                  ? 'border-[#001F3F] text-[#001F3F]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              ✏️ Criar Novo
            </button>
          </div>
        )}

        {/* ── ABA: BIBLIOTECA ── */}
        {tab === 'library' && !isEdit && (
          <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
            {/* Filtros */}
            <div className="flex gap-2 flex-shrink-0">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar treino…"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
              <select
                value={filterSport}
                onChange={e => setFilterSport(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]">
                <option value="">Todos os esportes</option>
                {SPORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredLibrary.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-slate-400 text-sm mb-1">
                    {library.length === 0
                      ? 'Nenhum treino na biblioteca ainda.'
                      : 'Nenhum treino encontrado com esses filtros.'}
                  </p>
                  <button onClick={() => setTab('new')}
                    className="text-xs text-blue-700 font-bold hover:underline">
                    Criar novo treino →
                  </button>
                </div>
              )}

              {filteredLibrary.map(w => {
                const sp = SPORT[w.type || w.sport] || SPORT.corrida;
                const dur  = w.estimated_duration_min ?? calcDurationMin(w.blocks);
                const dist = w.estimated_distance_km  ?? parseFloat(calcWorkoutDistance(w).toFixed(2));
                const folder = w.folder ? `📁 ${w.folder}` : null;
                return (
                  <button key={w.id}
                    onClick={() => selectFromLibrary(w)}
                    className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-[#001F3F]/30 hover:bg-blue-50/30 transition-colors flex items-start gap-3 group">
                    <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: sp.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#001F3F] text-sm truncate">{w.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sp.color }}>
                          {sp.label}
                        </span>
                        {dur  > 0 && <span className="text-[10px] text-slate-400 font-mono">{dur}min</span>}
                        {dist > 0 && <span className="text-[10px] text-slate-400 font-mono">{dist}km</span>}
                        {folder && <span className="text-[10px] text-slate-400">{folder}</span>}
                      </div>
                      {w.description && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{w.description}</p>
                      )}
                    </div>
                    <span className="text-blue-700 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                      Usar →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ABA: NOVO / EDITAR ── */}
        {(tab === 'new' || isEdit) && (
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Titulo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Título *</label>
                <input required value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Ex: Long Run Z2, Intervalado 4×1km…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
              </div>

              {/* Esporte + Duração + Distância */}
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
                    onChange={e => set('estimated_duration_min', e.target.value)} placeholder="60"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Distância (km)</label>
                  <input type="number" step="0.1" min="0" value={form.estimated_distance_km}
                    onChange={e => set('estimated_distance_km', e.target.value)} placeholder="12"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Descrição / Estrutura do Treino
                </label>
                <textarea rows={5} value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder={`10min aquecimento Z1\n3× (5min Z3 / 2min Z1)\n20min Z2 contínuo\n10min volta à calma`}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F] font-mono" />
              </div>

              {/* Salvar na biblioteca */}
              {!isEdit && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={saveToLibrary} onChange={e => setSaveToLibrary(e.target.checked)}
                    className="w-4 h-4 accent-[#001F3F] rounded" />
                  <span className="text-sm text-slate-600">
                    Salvar também na <strong>Biblioteca de Treinos</strong>
                  </span>
                </label>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">
                  {error}
                </div>
              )}
            </div>

            {/* Footer com botões */}
            <div className="flex gap-3 p-4 border-t border-slate-100 flex-shrink-0">
              {isEdit && (
                <button type="button" onClick={handleDelete}
                  className="border border-red-200 text-red-500 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors">
                  Remover
                </button>
              )}
              {!isEdit && tab === 'new' && library.length > 0 && (
                <button type="button" onClick={() => setTab('library')}
                  className="border border-slate-200 text-slate-500 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  ← Biblioteca
                </button>
              )}
              <button type="button" onClick={onClose}
                className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] disabled:opacity-50 transition-colors">
                {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Prescrever'}
              </button>
            </div>
          </form>
        )}
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
      className="w-full text-left rounded-md px-1.5 py-1 mb-0.5 hover:opacity-75 transition-opacity"
      style={{ backgroundColor: completed ? '#F0FDF4' : s.bg, borderLeft: `3px solid ${s.color}` }}>
      <div className="text-[10px] font-black truncate leading-tight" style={{ color: s.color }}>
        {w.title}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        {w.estimated_duration_min && (
          <span className="text-[9px] text-slate-400 font-mono">{w.estimated_duration_min}min</span>
        )}
        {w.estimated_duration_min && w.estimated_distance_km && (
          <span className="text-[9px] text-slate-300">·</span>
        )}
        {w.estimated_distance_km && (
          <span className="text-[9px] text-slate-400 font-mono">{w.estimated_distance_km}km</span>
        )}
        {completed && <span className="ml-auto text-green-500 text-[9px] font-black">✓</span>}
      </div>
    </button>
  );
}

// ── Calendário mensal principal ────────────────────────────────────────────────
export default function AthleteCalendarCoachView({ athleteId, onBack }) {
  const { session } = useAuth();
  const coachId = session?.user?.id;

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [athlete,    setAthlete]    = useState(null);
  const [prescribed, setPrescribed] = useState([]);
  const [completed,  setCompleted]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { date, workout? }

  const grid    = getMonthGrid(year, month);
  const gridStart = grid[0][0];
  const gridEnd   = grid[grid.length-1][6];

  const load = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    const [aRes, presRes, compRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', athleteId).maybeSingle(),
      supabase.from('prescribed_workout')
        .select('id, scheduled_date, sport, title, estimated_duration_min, estimated_distance_km, description, blocks')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', gridStart)
        .lte('scheduled_date', gridEnd)
        .order('scheduled_date'),
      supabase.from('completed_workout')
        .select('id, prescribed_workout_id')
        .eq('athlete_id', athleteId)
        .gte('completed_at', gridStart + 'T00:00:00')
        .lte('completed_at', gridEnd + 'T23:59:59'),
    ]);
    if (!aRes.error)   setAthlete(aRes.data);
    if (!presRes.error) setPrescribed(presRes.data || []);
    if (!compRes.error) setCompleted(compRes.data  || []);
    setLoading(false);
  }, [athleteId, year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { month === 0 ? (setYear(y=>y-1), setMonth(11)) : setMonth(m=>m-1); }
  function nextMonth() { month===11 ? (setYear(y=>y+1), setMonth(0))  : setMonth(m=>m+1); }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  const workoutsForDay  = iso => prescribed.filter(p => p.scheduled_date === iso);
  const isCompleted     = id  => completed.some(c => c.prescribed_workout_id === id);

  function weekTotals(week) {
    const ws   = week.flatMap(workoutsForDay);
    const mins = ws.reduce((s,w) => s+(w.estimated_duration_min||0), 0);
    const km   = ws.reduce((s,w) => s+(w.estimated_distance_km ||0), 0);
    const h = Math.floor(mins/60), m = mins%60;
    return {
      n:    ws.length,
      time: mins ? (h ? `${h}h${m?String(m).padStart(2,'0'):''}` : `${m}min`) : '',
      km:   km   ? `${Number(km.toFixed(1))}km` : '',
    };
  }

  return (
    <div className="flex flex-col h-full">
      {/* Voltar */}
      <button onClick={onBack}
        className="text-sm text-slate-500 hover:text-[#001F3F] mb-4 inline-flex items-center gap-1 self-start transition-colors">
        ← Voltar ao time
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black text-[#001F3F]">{athlete?.full_name || '…'}</h1>
            <span className="text-slate-400 text-sm">Calendário</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold">
              ‹
            </button>
            <span className="text-lg font-black text-[#001F3F] w-48 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold">
              ›
            </button>
            <button onClick={goToday}
              className="text-xs font-bold text-slate-500 hover:text-[#001F3F] border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              Hoje
            </button>
          </div>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(SPORT).filter(([k])=>k!=='descanso').map(([k,s])=>(
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Header dias da semana */}
        <div className="grid border-b border-slate-100" style={{ gridTemplateColumns:'48px repeat(7,1fr)' }}>
          <div className="border-r border-slate-100 bg-slate-50" />
          {WEEKDAYS.map(d=>(
            <div key={d}
              className="py-2.5 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Carregando…</div>
        ) : (
          grid.map((week, wi) => {
            const tots = weekTotals(week);
            return (
              <div key={wi} className="grid border-b border-slate-100 last:border-b-0"
                style={{ gridTemplateColumns:'48px repeat(7,1fr)', minHeight:'120px' }}>

                {/* Totais semana */}
                <div className="border-r border-slate-100 bg-slate-50/70 flex flex-col items-center justify-center px-1 py-2 gap-0.5">
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">S{wi+1}</span>
                  {tots.n > 0 && (
                    <>
                      {tots.km   && <span className="text-[11px] font-black text-[#001F3F]">{tots.km}</span>}
                      {tots.time && <span className="text-[9px] text-slate-400">{tots.time}</span>}
                    </>
                  )}
                </div>

                {/* Dias */}
                {week.map(iso => {
                  const dayWorkouts     = workoutsForDay(iso);
                  const d               = parseISO(iso);
                  const isCurrentMonth  = d.getMonth() === month;
                  const todayFlag       = isToday(iso);

                  return (
                    <div key={iso}
                      onClick={() => setModal({ date: iso })}
                      className={`
                        border-r border-slate-100 last:border-r-0 p-1.5 cursor-pointer group
                        transition-colors relative
                        ${todayFlag        ? 'bg-blue-50/60 hover:bg-blue-50' :
                          isCurrentMonth   ? 'bg-white hover:bg-slate-50/60' :
                                             'bg-slate-50/30 hover:bg-slate-50/50'}
                      `}>

                      {/* Número do dia */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`
                          text-xs font-black leading-none px-1.5 py-0.5 rounded-md inline-block
                          ${todayFlag       ? 'bg-[#001F3F] text-white' :
                            isCurrentMonth  ? 'text-slate-600' : 'text-slate-300'}
                        `}>
                          {d.getDate()}
                        </span>
                        {/* Botão + no hover */}
                        <button
                          onClick={e => { e.stopPropagation(); setModal({ date: iso }); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-[#001F3F]/10 hover:bg-[#001F3F]/20 text-[#001F3F] text-xs font-black"
                          title="Prescrever">
                          +
                        </button>
                      </div>

                      {/* Treinos */}
                      {dayWorkouts.map(w => (
                        <WorkoutCard key={w.id} w={w}
                          completed={isCompleted(w.id)}
                          onClick={wk => setModal({ date: iso, workout: wk })} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
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
