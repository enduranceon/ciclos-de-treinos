import { useState } from 'react';
import { useApp } from '../context/AppContext';

const SPORTS = [
  { value: 'corrida', label: '🏃 Corrida' },
  { value: 'bike', label: '🚴 Ciclismo' },
  { value: 'natacao', label: '🏊 Natação' },
  { value: 'triathlon', label: '🏆 Triathlon' },
];

export default function CycleForm({ onClose, editCycle }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    athleteName: editCycle?.athleteName || '',
    targetRace: editCycle?.targetRace || '',
    raceDate: editCycle?.raceDate || '',
    goalTime: editCycle?.goalTime || '',
    sport: editCycle?.sport || 'corrida',
    totalWeeks: editCycle?.totalWeeks || 16,
  });

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (editCycle) {
      dispatch({ type: 'UPDATE_CYCLE', payload: { id: editCycle.id, ...form } });
    } else {
      dispatch({ type: 'CREATE_CYCLE', payload: form });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">
            {editCycle ? 'Editar Ciclo' : 'Novo Ciclo de Treino'}
          </h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Nome do Atleta *
              </label>
              <input
                required
                value={form.athleteName}
                onChange={e => set('athleteName', e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Prova Alvo *
              </label>
              <input
                required
                value={form.targetRace}
                onChange={e => set('targetRace', e.target.value)}
                placeholder="Ex: Ironman Florianópolis 2026"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Data da Prova *
              </label>
              <input
                required
                type="date"
                value={form.raceDate}
                onChange={e => set('raceDate', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Meta de Tempo
              </label>
              <input
                value={form.goalTime}
                onChange={e => set('goalTime', e.target.value)}
                placeholder="Ex: 10:30:00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Modalidade
              </label>
              <select
                value={form.sport}
                onChange={e => set('sport', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
              >
                {SPORTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
                Semanas Totais *
              </label>
              <input
                required
                type="number"
                min="4"
                max="52"
                value={form.totalWeeks}
                onChange={e => set('totalWeeks', e.target.value)}
                disabled={!!editCycle}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F] disabled:bg-slate-50 disabled:text-slate-400"
              />
              {editCycle && <p className="text-xs text-slate-400 mt-1">Não editável após criação.</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#001F3F] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#002952] transition-colors"
            >
              {editCycle ? 'Salvar Alterações' : 'Criar Ciclo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
