import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import { SPORT_ICONS, buildPhaseMap } from '../utils/helpers';

function CycleForm({ onClose, editCycle }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: editCycle?.name || '',
    sport: editCycle?.sport || 'corrida',
    distance: editCycle?.distance || '',
    totalWeeks: editCycle?.totalWeeks || 16,
    description: editCycle?.description || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Nome do Ciclo *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex: Maratona 42km"
              className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Modalidade</label>
              <select value={form.sport} onChange={e => set('sport', e.target.value)} className="input">
                <option value="corrida">🏃 Corrida</option>
                <option value="bike">🚴 Ciclismo</option>
                <option value="natacao">🏊 Natação</option>
                <option value="triathlon">🏆 Triathlon</option>
              </select>
            </div>
            <div>
              <label className="label">Distância (km)</label>
              <input type="number" value={form.distance} onChange={e => set('distance', e.target.value)}
                placeholder="42" className="input" />
            </div>
            <div>
              <label className="label">Semanas *</label>
              <input required type="number" min="4" max="52"
                value={form.totalWeeks} onChange={e => set('totalWeeks', e.target.value)}
                disabled={!!editCycle}
                className="input disabled:bg-slate-50 disabled:text-slate-400" />
            </div>
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Objetivo, público-alvo..."
              className="input resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">
              {editCycle ? 'Salvar' : 'Criar Ciclo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CycleCard({ cycle, phaseColors, onOpen, onEdit, onDelete }) {
  const totalWorkouts = cycle.variants.reduce((s, v) =>
    s + v.weeks.reduce((ws, w) => ws + w.workouts.length, 0), 0);

  // Phase rainbow strip from first variant (if any)
  const firstVariant = cycle.variants[0];
  const phaseBar = firstVariant?.weeks.map(w => w.phase) || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
      {phaseBar.length > 0 && (
        <div className="flex h-1.5">
          {phaseBar.map((p, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: phaseColors[p] || '#94A3B8' }} />
          ))}
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{SPORT_ICONS[cycle.sport]}</span>
            <div>
              <h3 className="font-bold text-[#001F3F] text-base leading-tight">{cycle.name}</h3>
              {cycle.distance && (
                <span className="text-xs text-slate-400">{cycle.distance} km</span>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(cycle)} className="icon-btn" title="Editar">✎</button>
            <button onClick={() => onDelete(cycle.id)} className="icon-btn hover:text-red-500" title="Excluir">✕</button>
          </div>
        </div>

        {cycle.description && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-2">{cycle.description}</p>
        )}

        <div className="flex gap-3 text-center mb-4">
          <div className="flex-1 bg-slate-50 rounded-lg py-2">
            <div className="text-lg font-black text-[#001F3F]">{cycle.totalWeeks}</div>
            <div className="text-xs text-slate-400">semanas</div>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg py-2">
            <div className="text-lg font-black text-[#001F3F]">{cycle.variants.length}</div>
            <div className="text-xs text-slate-400">variantes</div>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg py-2">
            <div className="text-lg font-black text-[#001F3F]">{totalWorkouts}</div>
            <div className="text-xs text-slate-400">treinos</div>
          </div>
        </div>

        {/* Variant chips */}
        {cycle.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {cycle.variants.map(v => (
              <span key={v.id}
                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {v.name}
              </span>
            ))}
          </div>
        )}

        <button onClick={() => onOpen(cycle.id)} className="btn-primary w-full text-sm">
          Abrir Ciclo →
        </button>
      </div>
    </div>
  );
}

export default function HomeView() {
  const { state, dispatch } = useApp();
  const { confirm } = useConfirm();
  const { colors: phaseColors } = buildPhaseMap(state.phaseConfig);
  const [showForm, setShowForm] = useState(false);
  const [editCycle, setEditCycle] = useState(null);

  function handleDelete(id) {
    confirm({
      title: 'Excluir ciclo?',
      message: 'Todas as variantes e treinos deste ciclo serão removidos permanentemente.',
      confirmText: 'Excluir',
      onConfirm: () => dispatch({ type: 'DELETE_CYCLE', id }),
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-[#001F3F]">Biblioteca de Ciclos</h1>
          <p className="text-slate-400 text-sm mt-1">Templates de treino reutilizáveis para qualquer atleta</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Novo Ciclo
        </button>
      </div>

      {/* Empty state */}
      {state.cycles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-[#001F3F] mb-2">Nenhum ciclo criado</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm">
            Crie seu primeiro ciclo de treino — como "Maratona 42km" ou "Ironman" —
            e depois adicione variantes como Iniciante, Intermediário e Avançado.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + Criar Primeiro Ciclo
          </button>
        </div>
      )}

      {/* Cycles grid */}
      {state.cycles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {state.cycles.map(cycle => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              phaseColors={phaseColors}
              onOpen={id => dispatch({ type: 'GO_CYCLE', cycleId: id })}
              onEdit={c => setEditCycle(c)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showForm && <CycleForm onClose={() => setShowForm(false)} />}
      {editCycle && <CycleForm onClose={() => setEditCycle(null)} editCycle={editCycle} />}
    </div>
  );
}
