import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function AthleteProfileView() {
  const { session, profile, refreshProfile } = useAuth();
  const athleteId = session?.user?.id;
  const [coach, setCoach] = useState(null);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({
    full_name: '',
    birth_date: '',
    height_cm: '',
    weight_kg: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        birth_date: profile.birth_date || '',
        height_cm: profile.height_cm || '',
        weight_kg: profile.weight_kg || '',
      });
    }
  }, [profile?.id]);

  useEffect(() => {
    (async () => {
      if (!athleteId) return;
      const { data: ca } = await supabase
        .from('coach_athlete')
        .select('coach_id, started_at, coach:profiles!coach_athlete_coach_id_fkey(full_name)')
        .eq('athlete_id', athleteId)
        .eq('status', 'active')
        .maybeSingle();
      setCoach(ca || null);
      const { data: zs } = await supabase
        .from('athlete_zones')
        .select('*')
        .eq('athlete_id', athleteId);
      setZones(zs || []);
    })();
  }, [athleteId]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    const payload = {
      full_name: form.full_name || null,
      birth_date: form.birth_date || null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', athleteId);
    setSaving(false);
    if (error) { setSavedMsg('Erro: ' + error.message); return; }
    setSavedMsg('Salvo ✓');
    await refreshProfile();
    setTimeout(() => setSavedMsg(''), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black text-[#001F3F] mb-6">Perfil</h1>

      {/* Coach card */}
      {coach && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Coach</p>
          <p className="text-lg font-black text-[#001F3F]">{coach.coach?.full_name || 'Sem nome'}</p>
          <p className="text-xs text-slate-400">Vinculado em {new Date(coach.started_at).toLocaleDateString('pt-BR')}</p>
        </div>
      )}

      {/* Dados pessoais */}
      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-slate-100 p-5 mb-4 space-y-3">
        <h3 className="font-black text-[#001F3F] mb-2">Dados pessoais</h3>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Nome completo</label>
          <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Nascimento</label>
            <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Altura (cm)</label>
            <input type="number" value={form.height_cm} onChange={e => setForm(f => ({ ...f, height_cm: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Peso (kg)</label>
            <input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="bg-[#001F3F] text-white font-bold text-sm px-5 py-2 rounded-xl hover:bg-[#002a55] disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {savedMsg && <span className="text-xs text-green-700 font-bold">{savedMsg}</span>}
        </div>
      </form>

      {/* Zonas (placeholder por ora) */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4">
        <h3 className="font-black text-[#001F3F] mb-2">Zonas de treino</h3>
        {zones.length === 0 ? (
          <p className="text-xs text-slate-400">
            Seu coach ainda não configurou suas zonas. Em breve você poderá ver FTP, threshold pace e FC máxima aqui.
          </p>
        ) : (
          <div className="space-y-2">
            {zones.map(z => (
              <div key={z.id} className="text-xs flex justify-between border-b border-slate-100 py-2 last:border-0">
                <span className="font-bold text-slate-700 uppercase">{z.sport}</span>
                <span className="text-slate-500 font-mono">
                  {z.ftp_watts && `FTP ${z.ftp_watts}W · `}
                  {z.threshold_hr && `Limiar FC ${z.threshold_hr} · `}
                  {z.max_hr && `Max FC ${z.max_hr}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strava placeholder */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="font-black text-[#001F3F] mb-2">Conexões</h3>
        <p className="text-xs text-slate-400 mb-3">
          Conecte sua conta Strava para que seus treinos sincronizem automaticamente.
        </p>
        <button disabled
          className="bg-slate-100 text-slate-400 font-bold text-sm px-5 py-2 rounded-xl cursor-not-allowed">
          Conectar Strava (em breve)
        </button>
      </div>
    </div>
  );
}
