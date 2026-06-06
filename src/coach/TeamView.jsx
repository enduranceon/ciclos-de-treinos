import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import AthleteCalendarCoachView from './AthleteCalendarCoachView';

const SUPABASE_URL = 'https://tcdoxeduhwyvhkxwrymj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pIBbWPeeC9rhd1-DrWU0SQ_ef0waSCV';

// ── Modal: adicionar atleta manualmente (cria conta real via Edge Function) ───
function AddAthleteModal({ onClose, onCreated }) {
  const { session } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { athlete, reset_link }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-athlete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_KEY,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar atleta');
      setResult(data);
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (result?.reset_link) navigator.clipboard.writeText(result.reset_link);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Adicionar Atleta</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Nome completo *</label>
              <input required value={form.full_name} onChange={e => set('full_name', e.target.value)}
                placeholder="João Silva"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">E-mail *</label>
              <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="atleta@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Senha inicial <span className="text-slate-400 font-normal">(opcional — gera automático se vazio)</span>
              </label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                placeholder="••••••••" minLength={6}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]" />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Você receberá um link de redefinição de senha para enviar ao atleta.
              </p>
            </div>
            {error && (
              <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">{error}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] disabled:opacity-50">
                {loading ? 'Criando...' : 'Criar Atleta'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
              ✓ <strong>{result.athlete.full_name}</strong> criado com sucesso!
            </div>
            {result.reset_link && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Link de acesso — envie ao atleta para ele definir a senha
                </label>
                <div className="flex gap-2">
                  <input readOnly value={result.reset_link}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono bg-slate-50 truncate" />
                  <button onClick={copyLink}
                    className="bg-[#001F3F] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#002a55] whitespace-nowrap">
                    Copiar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  O atleta clica neste link, define a senha e já acessa a plataforma.
                </p>
              </div>
            )}
            <button onClick={onClose}
              className="w-full bg-slate-100 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TeamView principal ────────────────────────────────────────────────────────
export default function TeamView() {
  const { session } = useAuth();
  const coachId = session?.user?.id;
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);

  async function loadData() {
    if (!coachId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_athlete')
      .select('athlete_id, status, started_at, athlete:profiles!coach_athlete_athlete_id_fkey(id, full_name, avatar_url)')
      .eq('coach_id', coachId)
      .eq('status', 'active');
    if (!error) setAthletes(data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [coachId]);

  // Abrir calendário do atleta
  if (selectedAthleteId) {
    return (
      <AthleteCalendarCoachView
        athleteId={selectedAthleteId}
        athletes={athletes}
        onSelectAthlete={setSelectedAthleteId}
        onBack={() => setSelectedAthleteId(null)}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#001F3F]">Meu Time</h1>
          <p className="text-slate-400 text-sm mt-1">
            {athletes.length > 0
              ? `${athletes.length} atleta${athletes.length > 1 ? 's' : ''} ativo${athletes.length > 1 ? 's' : ''}`
              : 'Adicione atletas para começar a prescrever treinos'}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-[#001F3F] text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-[#002a55] flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Adicionar Atleta
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-slate-400 text-sm">Carregando...</div>
      )}

      {/* Empty state */}
      {!loading && athletes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h2 className="text-xl font-bold text-[#001F3F] mb-2">Nenhum atleta no time</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm">
            Adicione um atleta com nome e e-mail. Ele receberá um link para acessar a plataforma
            e você já pode prescrever treinos no calendário dele.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="bg-[#001F3F] text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#002a55]">
            + Adicionar Primeiro Atleta
          </button>
        </div>
      )}

      {/* Lista de atletas */}
      {!loading && athletes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {athletes.map(({ athlete_id, athlete, started_at }) => (
            <button key={athlete_id}
              onClick={() => setSelectedAthleteId(athlete_id)}
              className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5 group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#001F3F] rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {(athlete?.full_name || '?').trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[#001F3F] text-sm truncate">{athlete?.full_name || 'Sem nome'}</div>
                  <div className="text-[10px] text-slate-400">
                    Desde {new Date(started_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
              <div className="text-xs text-blue-700 font-bold group-hover:text-blue-900">
                Abrir calendário →
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <AddAthleteModal
          onClose={() => setShowAdd(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
