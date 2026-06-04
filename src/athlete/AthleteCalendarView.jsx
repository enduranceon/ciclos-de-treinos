import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { startOfWeek, addDays, toISODate, isToday, weekDayLabel, formatShortDate, monthLabel } from './dateUtils';
import AthleteWorkoutDetail from './AthleteWorkoutDetail';

const SPORT_DOT = {
  corrida:  '#3B82F6',
  bike:     '#F59E0B',
  natacao:  '#06B6D4',
  forca:    '#A78BFA',
  descanso: '#94A3B8',
};

const SPORT_LABEL = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação', forca: 'Força', descanso: 'Descanso',
};

export default function AthleteCalendarView() {
  const { session } = useAuth();
  const athleteId = session?.user?.id;
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [prescribed, setPrescribed] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);

  const weekEnd = addDays(weekStart, 6);

  async function load() {
    if (!athleteId) return;
    setLoading(true);
    const startISO = toISODate(weekStart);
    const endISO = toISODate(weekEnd);
    const [presRes, compRes] = await Promise.all([
      supabase
        .from('prescribed_workout')
        .select('id, scheduled_date, sport, title, estimated_duration_min, estimated_distance_km')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', startISO)
        .lte('scheduled_date', endISO)
        .order('scheduled_date'),
      supabase
        .from('completed_workout')
        .select('id, prescribed_workout_id, completed_at, sport, duration_min, distance_km')
        .eq('athlete_id', athleteId)
        .gte('completed_at', startISO + 'T00:00:00')
        .lte('completed_at', endISO + 'T23:59:59'),
    ]);
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

  if (selectedWorkoutId) {
    return (
      <AthleteWorkoutDetail
        workoutId={selectedWorkoutId}
        onBack={() => { setSelectedWorkoutId(null); load(); }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#001F3F]">Calendário</h1>
          <p className="text-slate-400 text-sm mt-1">
            {monthLabel(weekStart)} {weekStart.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            ← Semana anterior
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            Hoje
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="border border-slate-200 bg-white text-slate-600 text-sm font-bold px-3 py-2 rounded-xl hover:bg-slate-50">
            Próxima semana →
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
              className={`bg-white rounded-2xl border ${today ? 'border-[#001F3F] ring-2 ring-[#001F3F]/10' : 'border-slate-100'} p-3 min-h-[160px] flex flex-col`}>
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

              {loading && i === 0 && (
                <div className="text-xs text-slate-400 text-center py-4">Carregando...</div>
              )}

              {!loading && dayWorkouts.length === 0 && (
                <div className="text-[11px] text-slate-300 text-center py-4">Sem treinos</div>
              )}

              <div className="space-y-1.5 flex-1">
                {dayWorkouts.map(w => {
                  const done = isCompleted(w.id);
                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWorkoutId(w.id)}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        done
                          ? 'bg-green-50 border-green-200 hover:bg-green-100'
                          : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                      }`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SPORT_DOT[w.sport] || '#94A3B8' }} />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                          {SPORT_LABEL[w.sport] || w.sport}
                        </span>
                        {done && <span className="ml-auto text-[10px] text-green-600 font-bold">✓</span>}
                      </div>
                      <div className="text-xs font-semibold text-[#001F3F] line-clamp-2">{w.title}</div>
                      {(w.estimated_duration_min || w.estimated_distance_km) && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          {w.estimated_duration_min ? `${w.estimated_duration_min} min` : ''}
                          {w.estimated_duration_min && w.estimated_distance_km ? ' · ' : ''}
                          {w.estimated_distance_km ? `${w.estimated_distance_km} km` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
