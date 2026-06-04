import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { startOfWeek, addDays, toISODate, isToday, weekDayLabel, formatShortDate, monthLabel } from '../athlete/dateUtils';

const SPORT_OPTIONS = [
  { value: 'corrida',  label: 'Corrida' },
  { value: 'bike',     label: 'Ciclismo' },
  { value: 'natacao',  label: 'Natação' },
  { value: 'forca',    label: 'Força' },
  { value: 'descanso', label: 'Descanso' },
];

const SPORT_DOT = {
  corrida: '#3B82F6', bike: '#F59E0B', natacao: '#06B6D4', forca: '#A78BFA', descanso: '#94A3B8',
};

function PrescribeModal({ athleteId, coachId, date, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    sport: 'corrida',
    description: '',
    estimated_duration_min: '',
    estimated_distance_km: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      athlete_id: athleteId,
      coach_id: coachId,
      scheduled_date: date,
      sport: form.sport,
      title: form.title,
      description: form.description || null,
      estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
      estimated_distance_km: form.estimated_distance_km ? Number(form.estimated_distance_km) : null,
      blocks: [],
    };
    const { error: err } = await supabase.from('prescribed_workout').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Prescrever Treino</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long', day: '2-digit', month: 'long',
            })}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Título *</label>
            <input required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Long run Z2"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Esporte</label>
              <select value={form.sport}
                onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]">
                {SPORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Duração (min)</label>
              <input type="number" value={form.estimated_duration_min}
                onChange={e => setForm(f => ({ ...f, estimated_duration_min: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Distância (km)</label>
              <input type="number" step="0.1" value={form.estimated_distance_km}
                onChange={e => setForm(f => ({ ...f, estimated_distance_km: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Descrição</label>
            <textarea rows="3" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detalhes do treino (estrutura, alvos, observações)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>
          {error && (
            <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Prescrever'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AthleteCalendarCoachView({ athleteId, onBack }) {
  const { session } = useAuth();
  const coachId = session?.user?.id;
  const [athlete, setAthlete] = useState(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [prescribed, setPrescribed] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prescribingDate, setPrescribingDate] = useState(null);

  const weekEnd = addDays(weekStart, 6);

  async function load() {
    if (!athleteId) return;
    setLoading(true);
    const [aRes, presRes, compRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', athleteId).maybeSingle(),
      supabase
        .from('prescribed_workout')
        .select('id, scheduled_date, sport, title, estimated_duration_min, estimated_distance_km')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', toISODate(weekStart))
        .lte('scheduled_date', toISODate(weekEnd))
        .order('scheduled_date'),
      supabase
        .from('completed_workout')
        .select('id, prescribed_workout_id, completed_at, sport, duration_min, distance_km')
        .eq('athlete_id', athleteId)
        .gte('completed_at', toISODate(weekStart) + 'T00:00:00')
        .lte('completed_at', toISODate(weekEnd) + 'T23:59:59'),
    ]);
    if (!aRes.error) setAthlete(aRes.data);
    if (!presRes.error) setPrescribed(presRes.data || []);
    if (!compRes.error) setCompleted(compRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [athleteId, toISODate(weekStart)]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function workoutsForDay(d) {
    const iso = toISODate(d);
    return prescribed.filter(p => p.scheduled_date === iso);
  }

  function isCompleted(prescId) {
    return completed.some(c => c.prescribed_workout_id === prescId);
  }

  return (
    <div>
      {/* Header */}
      <button onClick={onBack}
        className="text-sm text-slate-500 hover:text-[#001F3F] mb-4 inline-flex items-center gap-1">
        ← Voltar ao time
      </button>

      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Calendário do atleta</p>
          <h1 className="text-3xl font-black text-[#001F3F]">{athlete?.full_name || 'Atleta'}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {monthLabel(weekStart)} {weekStart.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            ←
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            Hoje
          </button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            →
          </button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d, i) => {
          const dayWorkouts = workoutsForDay(d);
          const today = isToday(d);
          return (
            <div key={i}
              className={`bg-white rounded-2xl border ${today ? 'border-[#001F3F] ring-2 ring-[#001F3F]/10' : 'border-slate-100'} p-3 min-h-[180px] flex flex-col`}>
              <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-slate-100">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-widest ${today ? 'text-[#001F3F]' : 'text-slate-400'}`}>
                    {weekDayLabel(d)}
                  </div>
                  <div className={`text-2xl font-black ${today ? 'text-[#001F3F]' : 'text-slate-600'}`}>
                    {d.getDate()}
                  </div>
                </div>
                <div className="text-[10px] text-slate-300 font-mono">{formatShortDate(d)}</div>
              </div>

              <div className="space-y-1.5 flex-1">
                {dayWorkouts.map(w => {
                  const done = isCompleted(w.id);
                  return (
                    <div key={w.id}
                      className={`p-2 rounded-lg border ${done ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SPORT_DOT[w.sport] || '#94A3B8' }} />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 truncate">
                          {w.sport}
                        </span>
                        {done && <span className="ml-auto text-[10px] text-green-600 font-bold">✓</span>}
                      </div>
                      <div className="text-xs font-semibold text-[#001F3F] line-clamp-2">{w.title}</div>
                    </div>
                  );
                })}
              </div>

              <button onClick={() => setPrescribingDate(toISODate(d))}
                className="mt-2 text-[10px] text-blue-700 font-bold uppercase tracking-widest hover:text-blue-900 border-t border-slate-100 pt-2">
                + Prescrever
              </button>
            </div>
          );
        })}
      </div>

      {loading && <p className="text-slate-400 text-sm mt-4">Carregando...</p>}

      {prescribingDate && coachId && (
        <PrescribeModal
          athleteId={athleteId}
          coachId={coachId}
          date={prescribingDate}
          onClose={() => setPrescribingDate(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
