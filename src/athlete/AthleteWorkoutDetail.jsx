import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatLongDate } from './dateUtils';

const SPORT_LABEL = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação', forca: 'Força', descanso: 'Descanso',
};

export default function AthleteWorkoutDetail({ workoutId, onBack }) {
  const { session, profile } = useAuth();
  const athleteId = session?.user?.id;
  const [workout, setWorkout] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [newComment, setNewComment] = useState('');

  // Form de marcar como concluído
  const [form, setForm] = useState({
    duration_min: '',
    distance_km: '',
    avg_hr: '',
    avg_pace_sec: '',
    rpe: 5,
    notes: '',
  });

  async function load() {
    setLoading(true);
    const [wRes, cRes, comRes] = await Promise.all([
      supabase.from('prescribed_workout').select('*').eq('id', workoutId).maybeSingle(),
      supabase.from('completed_workout').select('*').eq('prescribed_workout_id', workoutId).maybeSingle(),
      supabase
        .from('workout_comments')
        .select('id, body, created_at, author_id, author:profiles!workout_comments_author_id_fkey(full_name, role)')
        .eq('prescribed_workout_id', workoutId)
        .order('created_at'),
    ]);
    if (!wRes.error) setWorkout(wRes.data);
    if (!cRes.error) setCompleted(cRes.data);
    if (!comRes.error) setComments(comRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [workoutId]);

  async function handleComplete(e) {
    e.preventDefault();
    if (!workout) return;
    const payload = {
      athlete_id: athleteId,
      prescribed_workout_id: workout.id,
      completed_at: new Date().toISOString(),
      sport: workout.sport,
      duration_min: form.duration_min ? Number(form.duration_min) : null,
      distance_km: form.distance_km ? Number(form.distance_km) : null,
      avg_hr: form.avg_hr ? Number(form.avg_hr) : null,
      avg_pace_sec: form.avg_pace_sec ? Number(form.avg_pace_sec) : null,
      rpe: form.rpe ? Number(form.rpe) : null,
      notes: form.notes || null,
      source: 'manual',
    };
    const { error } = await supabase.from('completed_workout').insert(payload);
    if (error) { alert('Erro: ' + error.message); return; }
    setShowCompleteForm(false);
    load();
  }

  async function handlePostComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    const { error } = await supabase.from('workout_comments').insert({
      prescribed_workout_id: workout.id,
      author_id: athleteId,
      body: newComment.trim(),
    });
    if (error) { alert('Erro: ' + error.message); return; }
    setNewComment('');
    setShowCommentForm(false);
    load();
  }

  if (loading) {
    return <div className="text-slate-400 text-sm text-center py-12">Carregando...</div>;
  }

  if (!workout) {
    return (
      <div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-[#001F3F] mb-4">← Voltar</button>
        <p className="text-slate-500 text-sm">Treino não encontrado.</p>
      </div>
    );
  }

  const blocks = Array.isArray(workout.blocks) ? workout.blocks : [];

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack}
        className="text-sm text-slate-500 hover:text-[#001F3F] mb-4 inline-flex items-center gap-1">
        ← Voltar ao calendário
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
          {formatLongDate(workout.scheduled_date)}
        </div>
        <h1 className="text-2xl font-black text-[#001F3F] mb-2">{workout.title}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-bold uppercase tracking-widest">
            {SPORT_LABEL[workout.sport] || workout.sport}
          </span>
          {workout.estimated_duration_min && (
            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-mono">
              {workout.estimated_duration_min} min
            </span>
          )}
          {workout.estimated_distance_km && (
            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-mono">
              {workout.estimated_distance_km} km
            </span>
          )}
        </div>

        {workout.description && (
          <p className="text-sm text-slate-600 mt-4 whitespace-pre-line">{workout.description}</p>
        )}

        {/* Blocos do treino */}
        {blocks.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Estrutura</h3>
            <div className="space-y-2">
              {blocks.map((b, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-3 text-xs">
                  <div className="font-bold text-slate-700 mb-1">{b.sectionType || 'Bloco'}</div>
                  {(b.subBlocks || []).map((sb, j) => (
                    <div key={j} className="text-slate-600 font-mono">
                      {sb.type === 'continuo' && `${sb.value}${sb.measureType === 'distance' ? 'km' : 'min'} ${sb.zone || ''}`}
                      {sb.type === 'intervalado' && `${sb.repeat}× ${sb.workValue}${sb.workMeasure === 'distance' ? 'km' : 'min'} ${sb.workZone || ''}`}
                      {sb.type === 'variacao' && `${sb.repeat}× variação`}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status: completed ou pendente */}
      {completed ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
            <h3 className="font-black text-green-900">Treino concluído</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {completed.duration_min != null && (
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-slate-400 uppercase tracking-widest font-bold">Duração</div>
                <div className="text-base font-black text-[#001F3F]">{completed.duration_min} min</div>
              </div>
            )}
            {completed.distance_km != null && (
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-slate-400 uppercase tracking-widest font-bold">Distância</div>
                <div className="text-base font-black text-[#001F3F]">{completed.distance_km} km</div>
              </div>
            )}
            {completed.avg_hr != null && (
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-slate-400 uppercase tracking-widest font-bold">FC média</div>
                <div className="text-base font-black text-[#001F3F]">{completed.avg_hr} bpm</div>
              </div>
            )}
            {completed.rpe != null && (
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-slate-400 uppercase tracking-widest font-bold">RPE</div>
                <div className="text-base font-black text-[#001F3F]">{completed.rpe}/10</div>
              </div>
            )}
          </div>
          {completed.notes && (
            <div className="mt-3 text-xs text-slate-700 italic">"{completed.notes}"</div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
          {!showCompleteForm ? (
            <button
              onClick={() => setShowCompleteForm(true)}
              className="w-full bg-[#001F3F] text-white font-bold text-sm py-3 rounded-xl hover:bg-[#002a55]">
              Marcar como concluído
            </button>
          ) : (
            <form onSubmit={handleComplete} className="space-y-3">
              <h3 className="font-black text-[#001F3F] mb-2">Como foi o treino?</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Duração (min)</label>
                  <input type="number" step="0.1" value={form.duration_min}
                    onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Distância (km)</label>
                  <input type="number" step="0.01" value={form.distance_km}
                    onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">FC média (bpm)</label>
                  <input type="number" value={form.avg_hr}
                    onChange={e => setForm(f => ({ ...f, avg_hr: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Pace médio (s/km)</label>
                  <input type="number" value={form.avg_pace_sec}
                    onChange={e => setForm(f => ({ ...f, avg_pace_sec: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">RPE (1-10): {form.rpe}</label>
                <input type="range" min="1" max="10" value={form.rpe}
                  onChange={e => setForm(f => ({ ...f, rpe: e.target.value }))}
                  className="w-full" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Notas</label>
                <textarea rows="2" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Como você se sentiu? Algo a destacar?"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCompleteForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit"
                  className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55]">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Comentários */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="font-black text-[#001F3F] mb-3">Conversa com o coach</h3>
        {comments.length === 0 && (
          <p className="text-xs text-slate-400 mb-3">Nenhum comentário ainda.</p>
        )}
        <div className="space-y-2 mb-3">
          {comments.map(c => {
            const isMe = c.author_id === athleteId;
            return (
              <div key={c.id} className={`p-3 rounded-xl ${isMe ? 'bg-blue-50 ml-8' : 'bg-slate-50 mr-8'}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {isMe ? 'Você' : (c.author?.full_name || 'Coach')}
                  </span>
                  <span className="text-[10px] text-slate-300">
                    {new Date(c.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-line">{c.body}</p>
              </div>
            );
          })}
        </div>
        {!showCommentForm ? (
          <button onClick={() => setShowCommentForm(true)}
            className="text-xs text-blue-700 font-bold hover:text-blue-900">
            + Adicionar comentário
          </button>
        ) : (
          <form onSubmit={handlePostComment} className="space-y-2">
            <textarea rows="2" value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Escreva..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowCommentForm(false); setNewComment(''); }}
                className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit"
                className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2 rounded-xl hover:bg-[#002a55]">
                Enviar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
