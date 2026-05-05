import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_PHASE_CONFIG, DEFAULT_RACE_PACE_CONFIG, DEFAULT_ZONE_CONFIG, pf } from '../utils/helpers';

// ── Tiny uuid for new phases ──────────────────────────────────────────────────
function sid() { return Math.random().toString(36).slice(2, 9); }

// ── Periods (phases) tab ──────────────────────────────────────────────────────
function PeriodsTab() {
  const { state, dispatch } = useApp();
  const [phases, setPhases] = useState(
    (state.phaseConfig && state.phaseConfig.length ? state.phaseConfig : DEFAULT_PHASE_CONFIG)
      .map(p => ({ ...p }))
  );
  const [saved, setSaved] = useState(false);

  function update(key, field, val) {
    setPhases(prev => prev.map(p => p.key === key ? { ...p, [field]: val } : p));
    setSaved(false);
  }

  function addPhase() {
    const key = `fase_${sid()}`;
    setPhases(prev => [...prev, { key, label: 'Nova Fase', color: '#94A3B8' }]);
    setSaved(false);
  }

  function removePhase(key) {
    setPhases(prev => prev.filter(p => p.key !== key));
    setSaved(false);
  }

  function moveUp(idx) {
    if (idx === 0) return;
    setPhases(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
    setSaved(false);
  }

  function moveDown(idx) {
    setPhases(prev => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
    setSaved(false);
  }

  function handleSave() {
    dispatch({ type: 'UPDATE_PHASE_CONFIG', payload: phases });
    setSaved(true);
  }

  function handleReset() {
    setPhases(DEFAULT_PHASE_CONFIG.map(p => ({ ...p })));
    setSaved(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-black text-[#001F3F]">Períodos de Treino</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Defina as fases do ciclo — Base, Prep. Geral, Específico etc. A ordem aqui define a ordem nos seletores.
        </p>
      </div>

      {/* Preview bar */}
      <div className="flex h-4 rounded-xl overflow-hidden gap-px">
        {phases.map(p => (
          <div key={p.key} className="flex-1 transition-colors" style={{ backgroundColor: p.color }}
            title={p.label} />
        ))}
      </div>

      {/* Phase list */}
      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[32px_40px_1fr_100px_60px] gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
          <span></span>
          <span>Cor</span>
          <span>Nome</span>
          <span className="text-center">Chave interna</span>
          <span></span>
        </div>

        {phases.map((p, idx) => (
          <div key={p.key} className="grid grid-cols-[32px_40px_1fr_100px_60px] gap-3 items-center bg-white rounded-xl border border-slate-100 px-3 py-2.5">
            {/* Reorder */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(idx)}
                className="text-slate-300 hover:text-slate-600 text-xs leading-none transition-colors"
                disabled={idx === 0}>▲</button>
              <button onClick={() => moveDown(idx)}
                className="text-slate-300 hover:text-slate-600 text-xs leading-none transition-colors"
                disabled={idx === phases.length - 1}>▼</button>
            </div>

            {/* Color picker */}
            <div className="relative flex items-center justify-center">
              <input
                type="color"
                value={p.color}
                onChange={e => update(p.key, 'color', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5 bg-transparent"
                title="Clique para trocar a cor"
              />
            </div>

            {/* Name */}
            <input
              type="text"
              value={p.label}
              onChange={e => update(p.key, 'label', e.target.value)}
              placeholder="Nome da fase"
              className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40 text-[#001F3F]"
            />

            {/* Key (read-only) */}
            <div className="text-center">
              <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">{p.key}</span>
            </div>

            {/* Delete */}
            <div className="flex justify-end">
              <button
                onClick={() => removePhase(p.key)}
                disabled={phases.length <= 1}
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors disabled:opacity-20"
                title="Remover fase"
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add phase */}
      <button
        onClick={addPhase}
        className="flex items-center gap-2 text-sm font-semibold text-[#001F3F] border-2 border-dashed border-slate-200 hover:border-[#001F3F]/30 hover:bg-[#001F3F]/5 w-full py-2.5 rounded-xl justify-center transition-all"
      >
        <span className="text-lg leading-none">+</span> Adicionar Período
      </button>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Restaurar padrões
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-500 font-semibold">✓ Salvo!</span>}
          <button onClick={handleSave} className="btn-primary text-sm px-5">
            Salvar Períodos
          </button>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-slate-300 italic">
        Nota: alterar a chave interna de uma fase existente pode afetar ciclos já criados que usam esse período.
        Renomear apenas o nome ou a cor é seguro.
      </p>
    </div>
  );
}

// ── Zones tab ─────────────────────────────────────────────────────────────────
function ZonesTab() {
  const { state, dispatch } = useApp();
  const [zones, setZones] = useState(
    (state.zoneConfig || DEFAULT_ZONE_CONFIG).map(z => ({ ...z }))
  );
  const [saved, setSaved] = useState(false);

  function update(key, field, raw) {
    setZones(prev => prev.map(z => {
      if (z.key !== key) return z;
      if (field === 'low' || field === 'high') return { ...z, [field]: pf(raw) };
      return { ...z, [field]: raw };
    }));
    setSaved(false);
  }

  function handleSave() {
    dispatch({ type: 'UPDATE_ZONE_CONFIG', payload: zones });
    setSaved(true);
  }

  function handleReset() {
    setZones(DEFAULT_ZONE_CONFIG.map(z => ({ ...z })));
    setSaved(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-black text-[#001F3F]">Zonas de Intensidade</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          % do limiar anaeróbio — usadas nos gráficos de volume, análise de intensidade e exportação .fit para Garmin.
        </p>
      </div>

      {/* Zone list */}
      <div className="space-y-2">
        <div className="grid grid-cols-[32px_1fr_90px_90px] gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
          <span></span>
          <span>Nome</span>
          <span className="text-center">Mín %</span>
          <span className="text-center">Máx %</span>
        </div>

        {zones.map(z => (
          <div key={z.key} className="grid grid-cols-[32px_1fr_90px_90px] gap-3 items-center bg-white rounded-xl border border-slate-100 px-3 py-2.5">
            {/* Color badge */}
            <div className="flex items-center justify-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black text-white"
                style={{ backgroundColor: z.color }}>
                {z.key === 'trote' ? 'TR' : z.key.toUpperCase()}
              </div>
            </div>

            {/* Name */}
            <input type="text" value={z.name} onChange={e => update(z.key, 'name', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40" />

            {/* Low */}
            <input type="text" inputMode="decimal" value={z.low} onChange={e => update(z.key, 'low', e.target.value)}
              className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40" />

            {/* High */}
            <input type="text" inputMode="decimal" value={z.high} onChange={e => update(z.key, 'high', e.target.value)}
              className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Restaurar padrões
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-500 font-semibold">✓ Salvo!</span>}
          <button onClick={handleSave} className="btn-primary text-sm px-5">
            Salvar Zonas
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Race pace tab ─────────────────────────────────────────────────────────────
function RacePacesTab() {
  const { state, dispatch } = useApp();
  const [paces, setPaces] = useState(
    (state.racePaceConfig && state.racePaceConfig.length
      ? state.racePaceConfig
      : DEFAULT_RACE_PACE_CONFIG
    ).map(p => ({ ...p }))
  );
  const [saved, setSaved] = useState(false);

  function update(key, field, raw) {
    setPaces(prev => prev.map(p => {
      if (p.key !== key) return p;
      if (field === 'low' || field === 'high') return { ...p, [field]: pf(raw) };
      return { ...p, [field]: raw };
    }));
    setSaved(false);
  }

  function handleSave() {
    dispatch({ type: 'UPDATE_RACE_PACE_CONFIG', payload: paces });
    setSaved(true);
  }

  function handleReset() {
    setPaces(DEFAULT_RACE_PACE_CONFIG.map(p => ({ ...p })));
    setSaved(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-black text-[#001F3F]">🏁 Zonas de Prova</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Ranges de ritmo de prova (5k, 10k, 21k, 42k) usados pelo Construtor IA quando você escreve "ritmo de maratona", "ritmo de 10k" etc.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[70px_1fr_90px_90px] gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
          <span>Prova</span>
          <span>Nome</span>
          <span className="text-center">Mín %</span>
          <span className="text-center">Máx %</span>
        </div>

        {paces.map(p => (
          <div key={p.key} className="grid grid-cols-[70px_1fr_90px_90px] gap-3 items-center bg-white rounded-xl border border-slate-100 px-3 py-2.5">
            <div className="text-center">
              <span className="inline-flex items-center justify-center min-w-12 px-2.5 py-1 rounded-lg bg-[#001F3F]/6 text-[#001F3F] text-xs font-black">
                {p.key.toUpperCase()}
              </span>
            </div>

            <input
              type="text"
              value={p.label}
              onChange={e => update(p.key, 'label', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40"
            />

            <input
              type="text"
              inputMode="decimal"
              value={p.low}
              onChange={e => update(p.key, 'low', e.target.value)}
              className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40"
            />

            <input
              type="text"
              inputMode="decimal"
              value={p.high}
              onChange={e => update(p.key, 'high', e.target.value)}
              className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-[#001F3F]/40"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Restaurar padrões
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-green-500 font-semibold">✓ Salvo!</span>}
          <button onClick={handleSave} className="btn-primary text-sm px-5">
            Salvar Zonas de Prova
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────
function AITab() {
  const { state, dispatch } = useApp();
  const [key, setKey] = useState(state.anthropicApiKey || '');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    dispatch({ type: 'SET_API_KEY', payload: key.trim() });
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-black text-[#001F3F]">🤖 Construtor com IA</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Use o Claude para gerar treinos em linguagem natural. Sua chave fica salva só no seu navegador.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
        <p className="text-xs font-bold text-blue-700">Como funciona</p>
        <ul className="space-y-1 text-xs text-blue-600">
          <li>1. Cadastre sua chave da API Anthropic abaixo</li>
          <li>2. Dentro de uma variante, clique em <strong>✨ Gerar com IA</strong> ao criar um treino</li>
          <li>3. Descreva o treino em português — ex: <em>"aquecimento 3km z1, 10×800m z4 com 400m trote de descanso, volta à calma 1km z1"</em></li>
          <li>4. O assistente monta a estrutura completa — você revisa e salva</li>
        </ul>
      </div>

      {/* API key input */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-[#001F3F]">Chave da API Anthropic</label>
        <p className="text-xs text-slate-400">
          Obtenha em{' '}
          <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer"
            className="text-blue-500 hover:underline">console.anthropic.com/keys</a>
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => { setKey(e.target.value); setSaved(false); }}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#001F3F]/40 font-mono pr-20"
            />
            <button
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              {show ? 'ocultar' : 'mostrar'}
            </button>
          </div>
        </div>
        {key && (
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${key.startsWith('sk-ant-') ? 'bg-green-400' : 'bg-amber-400'}`} />
            <span className="text-xs text-slate-500">
              {key.startsWith('sk-ant-') ? 'Formato válido' : 'Formato esperado: sk-ant-...'}
            </span>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-300">Armazenado somente no seu navegador (localStorage)</span>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-green-500 font-semibold">✓ Salvo!</span>}
            <button onClick={handleSave} className="btn-primary text-sm px-5">
              Salvar Chave
            </button>
          </div>
        </div>
        <p className="text-xs text-amber-600">
          Fora do ambiente local, o deploy tambem precisa expor um proxy <span className="font-mono">/anthropic</span> ou definir <span className="font-mono">VITE_ANTHROPIC_API_BASE_URL</span>.
        </p>
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────
const TABS = [
  { id: 'periods', label: '🗓️ Períodos de Treino' },
  { id: 'zones',   label: '⚡ Zonas de Intensidade' },
  { id: 'race',    label: '🏁 Zonas de Prova' },
  { id: 'ai',      label: '🤖 Construtor IA' },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('periods');

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#001F3F]">⚙️ Configurações</h1>
        <p className="text-slate-400 text-sm mt-1">Personalize períodos de treino e zonas de intensidade</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-white text-[#001F3F] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
        {activeTab === 'periods' && <PeriodsTab />}
        {activeTab === 'zones'   && <ZonesTab />}
        {activeTab === 'race'    && <RacePacesTab />}
        {activeTab === 'ai'      && <AITab />}
      </div>
    </div>
  );
}
