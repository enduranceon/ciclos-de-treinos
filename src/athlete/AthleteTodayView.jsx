import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toISODate, formatLongDate } from './dateUtils';
import AthleteWorkoutDetail from './AthleteWorkoutDetail';

const SPORT_LABEL = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação', forca: 'Força', descanso: 'Descanso',
};

export default function AthleteTodayView() {
  const { session, profile } = useAuth();
  const athleteId = session?.user?.id;
  const today = new Date();
  const todayISO = toISODate(today);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  async function load() {
    if (!athleteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('prescribed_workout')
      .select('id, scheduled_date, sport, title, description, estimated_duration_min, estimated_distance_km')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', todayISO);
    if (!error) setWorkouts(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [athleteId, todayISO]);

  if (selectedId) {
    return <AthleteWorkoutDetail workoutId={selectedId} onBack={() => { setSelectedId(null); load(); }} />;
  }

  const greeting = profile?.full_name ? `Olá, ${profile.full_name.split(' ')[0]}` : 'Olá';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
          {formatLongDate(today)}
        </p>
        <h1 className="text-3xl font-black text-[#001F3F]">{greeting}</h1>
      </div>

      {loading && <p className="text-slate-400 text-sm">Carregando...</p>}

      {!loading && workouts.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <div className="text-5xl mb-3">🛌</div>
          <h2 className="text-lg font-black text-[#001F3F] mb-1">Sem treinos hoje</h2>
          <p className="text-slate-400 text-sm">Dia de descanso ou treino livre.</p>
        </div>
      )}

      {!loading && workouts.length > 0 && (
        <div className="space-y-3">
          {workouts.map(w => (
            <button key={w.id} onClick={() => setSelectedId(w.id)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {SPORT_LABEL[w.sport] || w.sport}
                </span>
                {w.estimated_duration_min && (
                  <span className="text-[10px] text-slate-400 font-mono">· {w.estimated_duration_min} min</span>
                )}
                {w.estimated_distance_km && (
                  <span className="text-[10px] text-slate-400 font-mono">· {w.estimated_distance_km} km</span>
                )}
              </div>
              <h3 className="text-lg font-black text-[#001F3F] mb-1">{w.title}</h3>
              {w.description && (
                <p className="text-sm text-slate-500 line-clamp-2">{w.description}</p>
              )}
              <div className="mt-3 text-xs font-bold text-blue-700">Abrir →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
