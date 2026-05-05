import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_ZONE_CONFIG, pf } from '../utils/helpers';

export default function ZoneSettingsModal({ onClose }) {
  const { state, dispatch } = useApp();
  const [zones, setZones] = useState(
    (state.zoneConfig || DEFAULT_ZONE_CONFIG).map(z => ({ ...z }))
  );
  const [saved, setSaved] = useState(false);

  function update(key, field, raw) {
    setZones(prev => prev.map(z => {
      if (z.key !== key) return z;
      if (field === 'low' || field === 'high') {
        return { ...z, [field]: pf(raw) };
      }
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Configuração de Zonas</h2>
            <p className="text-xs text-slate-400 mt-0.5">% do limiar — usadas na exportação .fit</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Table */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-[32px_1fr_80px_80px] gap-x-3 gap-y-2 text-xs text-slate-400 font-medium mb-2 px-1">
            <span></span>
            <span>Nome</span>
            <span className="text-center">Mín %</span>
            <span className="text-center">Máx %</span>
          </div>

          <div className="space-y-1">
            {zones.map(z => (
              <div key={z.key} className="grid grid-cols-[32px_1fr_80px_80px] gap-x-3 items-center">
                {/* Color swatch + key label */}
                <div className="flex items-center justify-center">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black text-white"
                    style={{ backgroundColor: z.color }}
                  >
                    {z.key === 'trote' ? 'TR' : z.key.toUpperCase()}
                  </div>
                </div>

                {/* Name */}
                <input
                  type="text"
                  value={z.name}
                  onChange={e => update(z.key, 'name', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                />

                {/* Low % */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={z.low}
                  onChange={e => update(z.key, 'low', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                />

                {/* High % */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={z.high}
                  onChange={e => update(z.key, 'high', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Restaurar padrões
          </button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-500 font-medium">Salvo!</span>}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm bg-[#001F3F] text-white rounded-xl hover:bg-[#002a55] font-medium transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
