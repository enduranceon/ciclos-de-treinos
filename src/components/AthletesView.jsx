import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatDate } from '../utils/helpers';

function AthleteForm({ onClose, editAthlete }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: editAthlete?.name || '',
    email: editAthlete?.email || '',
    phone: editAthlete?.phone || '',
    birthDate: editAthlete?.birthDate || '',
    notes: editAthlete?.notes || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    if (editAthlete) {
      dispatch({ type: 'UPDATE_ATHLETE', payload: { id: editAthlete.id, ...form } });
    } else {
      dispatch({ type: 'CREATE_ATHLETE', payload: form });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">
            {editAthlete ? 'Editar Atleta' : 'Novo Atleta'}
          </h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Nome Completo *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex: João Silva" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="joao@email.com" className="input" />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="(11) 99999-9999" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Data de Nascimento</label>
            <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Histórico, lesões, objetivos..." className="input resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">
              {editAthlete ? 'Salvar' : 'Cadastrar Atleta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AthleteCard({ athlete, prescriptionCount, onOpen, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#001F3F] rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {athlete.name.split(' ').map(n => n[0]).slice(0,2).join('')}
          </div>
          <div>
            <h3 className="font-bold text-[#001F3F]">{athlete.name}</h3>
            {athlete.email && <p className="text-xs text-slate-400">{athlete.email}</p>}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(athlete)} className="icon-btn">✎</button>
          <button onClick={() => onDelete(athlete.id)} className="icon-btn hover:text-red-500">✕</button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        {athlete.phone && (
          <span className="text-xs text-slate-400 flex items-center gap-1">📱 {athlete.phone}</span>
        )}
        {athlete.birthDate && (
          <span className="text-xs text-slate-400">🎂 {formatDate(athlete.birthDate)}</span>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-400">Ciclos prescritos</span>
        <span className="text-lg font-black text-[#001F3F]">{prescriptionCount}</span>
      </div>

      {athlete.notes && (
        <p className="text-xs text-slate-400 mb-4 line-clamp-2 bg-slate-50 rounded-lg p-2">{athlete.notes}</p>
      )}

      <button onClick={() => onOpen(athlete.id)} className="btn-primary w-full text-sm">
        Ver Atleta →
      </button>
    </div>
  );
}

export default function AthletesView() {
  const { state, dispatch } = useApp();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editAthlete, setEditAthlete] = useState(null);
  const [search, setSearch] = useState('');

  function handleDelete(id) {
    confirm({
      title: 'Excluir atleta?',
      message: 'Todas as prescrições deste atleta também serão removidas.',
      confirmText: 'Excluir',
      onConfirm: () => dispatch({ type: 'DELETE_ATHLETE', id }),
    });
  }

  const filtered = state.athletes.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#001F3F]">Base de Atletas</h1>
          <p className="text-slate-400 text-sm mt-1">{state.athletes.length} atleta{state.athletes.length !== 1 ? 's' : ''} cadastrado{state.athletes.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Novo Atleta
        </button>
      </div>

      {/* Search */}
      {state.athletes.length > 0 && (
        <div className="mb-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar atleta..."
            className="w-full max-w-sm input"
          />
        </div>
      )}

      {/* Empty state */}
      {state.athletes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">👤</div>
          <h2 className="text-xl font-bold text-[#001F3F] mb-2">Nenhum atleta cadastrado</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm">
            Cadastre seus atletas e depois conecte cada um a um ciclo de treino com data de prova.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + Cadastrar Primeiro Atleta
          </button>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(athlete => (
            <AthleteCard
              key={athlete.id}
              athlete={athlete}
              prescriptionCount={state.prescriptions.filter(p => p.athleteId === athlete.id).length}
              onOpen={id => dispatch({ type: 'GO_ATHLETE', athleteId: id })}
              onEdit={a => setEditAthlete(a)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {search && filtered.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-12">Nenhum atleta encontrado para "{search}"</p>
      )}

      {showForm && <AthleteForm onClose={() => setShowForm(false)} />}
      {editAthlete && <AthleteForm onClose={() => setEditAthlete(null)} editAthlete={editAthlete} />}
    </div>
  );
}
