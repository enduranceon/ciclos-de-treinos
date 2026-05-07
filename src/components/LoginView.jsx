import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginView() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setInfo('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
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
          <p className="text-slate-400 text-sm mt-3">
            {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta de treinador'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 focus:border-[#001F3F]"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 border border-red-100">
                {error}
              </div>
            )}

            {info && (
              <div className="bg-green-50 text-green-700 text-xs rounded-xl px-3 py-2.5 border border-green-100">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#001F3F] text-white font-bold text-sm py-2.5 rounded-xl hover:bg-[#002a55] transition-colors disabled:opacity-50"
            >
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
              className="text-xs text-slate-400 hover:text-[#001F3F] transition-colors"
            >
              {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entre'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
