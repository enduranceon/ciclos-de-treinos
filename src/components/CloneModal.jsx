import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function CloneModal({ onClose, sourceCycleId }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({ athleteName: '', raceDate: '' });

  function handleSubmit(e) {
    e.preventDefault();
    dispatch({
      type: 'CLONE_CYCLE',
      payload: { sourceCycleId, ...form },
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Clonar Ciclo</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            A estrutura de treinos será duplicada. Informe os dados do novo atleta.
          </p>
          <div>
            <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
              Nome do Novo Atleta *
            </label>
            <input
              required
              value={form.athleteName}
              onChange={e => setForm(f => ({ ...f, athleteName: e.target.value }))}
              placeholder="Ex: Maria Costa"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#001F3F] uppercase tracking-wide mb-1">
              Nova Data da Prova *
            </label>
            <input
              required
              type="date"
              value={form.raceDate}
              onChange={e => setForm(f => ({ ...f, raceDate: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 focus:border-[#001F3F]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 bg-[#001F3F] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#002952]">
              Clonar Ciclo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
