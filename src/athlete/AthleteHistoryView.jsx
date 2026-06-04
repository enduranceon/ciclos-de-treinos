import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const SPORT_LABEL = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação', forca: 'Força', descanso: 'Descanso',
};

export default function AthleteHistoryView() {
  const { session } = useAuth();
  const athleteId = session?.user?.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!athleteId) return;
      const { data } = await supabase
        .from('completed_workout')
        .select('id, completed_at, sport, duration_min, distance_km, avg_hr, rpe, notes, source')
        .eq('athlete_id', athleteId)
        .order('completed_at', { ascending: false })
        .limit(50);
      setItems(data || []);
      setLoading(false);
    })();
  }, [athleteId]);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-black text-[#001F3F] mb-6">Histórico</h1>

      {loading && <p className="text-slate-400 text-sm">Carregando...</p>}
      {!loading && items.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <p className="text-slate-400 text-sm">Ainda nenhum treino concluído.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {items.map((it, idx) => (
          <div key={it.id}
            className={`px-5 py-4 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {SPORT_LABEL[it.sport] || it.sport}
                  </span>
                  <span className="text-[10px] text-slate-300">
                    {new Date(it.completed_at).toLocaleString('pt-BR')}
                  </span>
                  {it.source !== 'manual' && (
                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">
                      {it.source}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-slate-600 font-mono">
                  {it.duration_min != null && <span>{it.duration_min} min</span>}
                  {it.distance_km != null && <span>{it.distance_km} km</span>}
                  {it.avg_hr != null && <span>{it.avg_hr} bpm</span>}
                  {it.rpe != null && <span>RPE {it.rpe}/10</span>}
                </div>
                {it.notes && <p className="text-xs text-slate-500 italic mt-1">"{it.notes}"</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
