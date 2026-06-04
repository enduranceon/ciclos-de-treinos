import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Página acessada via /invite/:token
 * Fluxo:
 *   1. Busca info do convite (nome do coach) — RPC pública get_invite_info
 *   2. Atleta cria conta (signUp) OU loga (signIn)
 *   3. Após autenticar, chama RPC accept_athlete_invite — vincula ao coach
 *   4. Redireciona pra raiz, AuthContext detecta role=athlete
 */
export default function InvitePage({ token }) {
  const [info, setInfo] = useState(undefined); // undefined=loading, null=invalid
  const [mode, setMode] = useState('signup'); // signup | login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.rpc('get_invite_info', { invite_token: token });
      if (err) { setInfo(null); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
        setInfo(null);
        return;
      }
      setInfo(row);
      if (row.email) setEmail(row.email);
    })();
  }, [token]);

  async function processInvite() {
    const { error: rpcErr } = await supabase.rpc('accept_athlete_invite', { invite_token: token });
    if (rpcErr) throw rpcErr;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: sErr } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } },
        });
        if (sErr) throw sErr;
        // Se confirmação por email estiver desativada, já tem session
        if (data.session) {
          await processInvite();
          setSuccess('Conta criada e vinculada ao seu coach! Redirecionando...');
          setTimeout(() => { window.location.href = '/'; }, 1200);
        } else {
          setSuccess('Conta criada! Verifique seu e-mail para confirmar e depois volte a este link para finalizar.');
        }
      } else {
        const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sErr) throw sErr;
        await processInvite();
        setSuccess('Vínculo criado com sucesso! Redirecionando...');
        setTimeout(() => { window.location.href = '/'; }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Erro ao processar convite.');
    } finally {
      setLoading(false);
    }
  }

  if (info === undefined) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#001F3F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (info === null) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm text-center">
          <div className="text-5xl mb-3">⚠️</div>
          <h2 className="font-black text-[#001F3F] text-lg mb-2">Convite inválido</h2>
          <p className="text-slate-500 text-sm">
            Este convite expirou ou não existe. Peça um novo link para seu coach.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#001F3F] rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-sm">EON</span>
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Endurance On</p>
              <p className="text-sm font-black text-[#001F3F] leading-none">Training Hub</p>
            </div>
          </div>
        </div>

        {/* Convite info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
          <div className="text-center mb-5">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Convite de Coach</p>
            <p className="text-lg font-black text-[#001F3F]">{info.coach_name || 'Seu treinador'}</p>
            <p className="text-xs text-slate-400 mt-1">te convidou para a plataforma</p>
          </div>

          {/* Tabs signup / login */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors ${
                mode === 'signup' ? 'bg-white text-[#001F3F] shadow-sm' : 'text-slate-500'
              }`}>
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors ${
                mode === 'login' ? 'bg-white text-[#001F3F] shadow-sm' : 'text-slate-500'
              }`}>
              Já tenho conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Nome completo</label>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  placeholder="Seu nome"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 text-green-700 text-xs rounded-xl px-3 py-2.5 border border-green-100">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] transition-colors disabled:opacity-50">
              {loading ? 'Aguarde...' : mode === 'signup' ? 'Criar conta e vincular' : 'Entrar e vincular'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400">
          Ao continuar, você aceita compartilhar seus dados de treino com {info.coach_name || 'seu coach'}.
        </p>
      </div>
    </div>
  );
}
