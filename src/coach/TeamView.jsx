import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateInviteToken } from '../utils/token';
import AthleteCalendarCoachView from './AthleteCalendarCoachView';

function InviteModal({ onClose, onCreated, coachId }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = generateInviteToken();
      const { error: insErr } = await supabase
        .from('athlete_invites')
        .insert({ coach_id: coachId, email: email || null, token });
      if (insErr) throw insErr;
      const url = `${window.location.origin}/invite/${token}`;
      setCreatedLink(url);
      onCreated?.();
    } catch (err) {
      setError(err.message || 'Erro ao criar convite');
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(createdLink);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Convidar Atleta</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>

        {!createdLink ? (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                E-mail do atleta (opcional)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="atleta@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                O atleta receberá um link para criar a conta. O e-mail é só uma anotação.
              </p>
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
              <button type="submit" disabled={loading}
                className="flex-1 bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] disabled:opacity-50">
                {loading ? 'Gerando...' : 'Gerar Link'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl px-3 py-2.5">
              ✓ Convite criado. Envie o link abaixo ao atleta. Válido por 14 dias.
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Link do convite</label>
              <div className="flex gap-2">
                <input readOnly value={createdLink}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono bg-slate-50" />
                <button onClick={copyLink}
                  className="bg-[#001F3F] text-white text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-[#002a55]">
                  Copiar
                </button>
              </div>
            </div>
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

export default function TeamView() {
  const { session } = useAuth();
  const coachId = session?.user?.id;
  const [athletes, setAthletes] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);

  async function loadData() {
    if (!coachId) return;
    setLoading(true);
    const [athletesRes, invitesRes] = await Promise.all([
      supabase
        .from('coach_athlete')
        .select('athlete_id, status, started_at, athlete:profiles!coach_athlete_athlete_id_fkey(id, full_name, avatar_url)')
        .eq('coach_id', coachId)
        .eq('status', 'active'),
      supabase
        .from('athlete_invites')
        .select('id, email, token, status, created_at, expires_at')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false }),
    ]);
    if (!athletesRes.error) setAthletes(athletesRes.data || []);
    if (!invitesRes.error) setInvites(invitesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [coachId]);

  function copyLink(token) {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
  }

  async function revokeInvite(id) {
    await supabase.from('athlete_invites').update({ status: 'expired' }).eq('id', id);
    loadData();
  }

  // Detail view do atleta
  if (selectedAthleteId) {
    return (
      <AthleteCalendarCoachView
        athleteId={selectedAthleteId}
        onBack={() => setSelectedAthleteId(null)}
      />
    );
  }

  const pendingInvites = invites.filter(i => i.status === 'pending');

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#001F3F]">Meu Time</h1>
          <p className="text-slate-400 text-sm mt-1">Atletas com conta vinculada — prescreva treinos no calendário</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="bg-[#001F3F] text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-[#002a55] flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Convidar Atleta
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400 text-sm">Carregando...</div>
      )}

      {!loading && athletes.length === 0 && pendingInvites.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h2 className="text-xl font-bold text-[#001F3F] mb-2">Nenhum atleta vinculado</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm">
            Convide um atleta para criar uma conta e começar a prescrever treinos no calendário dele.
          </p>
          <button onClick={() => setShowInvite(true)}
            className="bg-[#001F3F] text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#002a55]">
            + Convidar Primeiro Atleta
          </button>
        </div>
      )}

      {/* Atletas conectados */}
      {!loading && athletes.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Atletas Ativos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {athletes.map(({ athlete_id, athlete, started_at }) => (
              <button key={athlete_id}
                onClick={() => setSelectedAthleteId(athlete_id)}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#001F3F] rounded-xl flex items-center justify-center text-white font-bold text-sm">
                    {(athlete?.full_name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-[#001F3F] text-sm">{athlete?.full_name || 'Sem nome'}</div>
                    <div className="text-[10px] text-slate-400">
                      Desde {new Date(started_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-blue-700 font-medium">Abrir calendário →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Convites pendentes */}
      {!loading && pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Convites Pendentes</h3>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {pendingInvites.map((inv, idx) => (
              <div key={inv.id}
                className={`px-5 py-3 flex items-center gap-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700">{inv.email || '(sem e-mail)'}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    Expira em {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button onClick={() => copyLink(inv.token)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50">
                  Copiar link
                </button>
                <button onClick={() => revokeInvite(inv.id)}
                  className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1.5 rounded-lg hover:bg-red-50">
                  Revogar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && coachId && (
        <InviteModal
          coachId={coachId}
          onClose={() => setShowInvite(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
