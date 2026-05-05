import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatDate, calcWeekVolume, SPORT_ICONS, buildPhaseMap } from '../utils/helpers';

function PrescriptionForm({ onClose, athleteId }) {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState({
    cycleId: '',
    variantId: '',
    raceDate: '',
    goalTime: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedCycle = state.cycles.find(c => c.id === form.cycleId);

  function handleSubmit(e) {
    e.preventDefault();
    dispatch({
      type: 'CREATE_PRESCRIPTION',
      payload: { athleteId, ...form },
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Prescrever Ciclo</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {state.cycles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm">Nenhum ciclo criado ainda.</p>
              <p className="text-slate-400 text-sm mt-1">Crie um ciclo na aba <strong>Ciclos</strong> primeiro.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Ciclo *</label>
                <select required value={form.cycleId}
                  onChange={e => { set('cycleId', e.target.value); set('variantId', ''); }}
                  className="input">
                  <option value="">Selecionar ciclo...</option>
                  {state.cycles.map(c => (
                    <option key={c.id} value={c.id}>
                      {SPORT_ICONS[c.sport]} {c.name} — {c.totalWeeks} semanas
                    </option>
                  ))}
                </select>
              </div>

              {selectedCycle && (
                <div>
                  <label className="label">Variante *</label>
                  {selectedCycle.variants.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      Este ciclo não tem variantes. Crie ao menos uma variante primeiro.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCycle.variants.map(v => (
                        <label key={v.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            form.variantId === v.id
                              ? 'border-[#001F3F] bg-[#001F3F]/5'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}>
                          <input
                            type="radio" name="variant" value={v.id}
                            checked={form.variantId === v.id}
                            onChange={() => set('variantId', v.id)}
                            className="accent-[#001F3F]"
                          />
                          <div>
                            <p className="font-semibold text-[#001F3F] text-sm">{v.name}</p>
                            <p className="text-xs text-slate-400">{v.sessionsPerWeek}× por semana</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data da Prova *</label>
                  <input required type="date" value={form.raceDate}
                    onChange={e => set('raceDate', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Meta de Tempo</label>
                  <input value={form.goalTime} onChange={e => set('goalTime', e.target.value)}
                    placeholder="3:30:00" className="input" />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button
                  type="submit"
                  disabled={!form.cycleId || !form.variantId || !form.raceDate}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  Prescrever
                </button>
              </div>
            </>
          )}
          {state.cycles.length === 0 && (
            <button type="button" onClick={onClose} className="btn-secondary w-full">Fechar</button>
          )}
        </form>
      </div>
    </div>
  );
}

function PrescriptionCard({ prescription, onOpen, onDelete }) {
  const { state } = useApp();
  const { colors: phaseColors } = buildPhaseMap(state.phaseConfig);
  const cycle = state.cycles.find(c => c.id === prescription.cycleId);
  const variant = cycle?.variants.find(v => v.id === prescription.variantId);
  const totalVolume = prescription.weeks.reduce((s, w) => s + calcWeekVolume(w.workouts), 0);
  const phaseBar = prescription.weeks.map(w => w.phase);

  const today = new Date().toISOString().split('T')[0];
  const daysUntilRace = Math.ceil((new Date(prescription.raceDate) - new Date(today)) / (1000*60*60*24));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
      <div className="flex h-1.5">
        {phaseBar.map((p, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: phaseColors[p] || '#94A3B8' }} />
        ))}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-lg">{SPORT_ICONS[cycle?.sport]}</span>
              <h3 className="font-bold text-[#001F3F]">{cycle?.name || 'Ciclo removido'}</h3>
            </div>
            <p className="text-xs text-blue-600 font-medium">{variant?.name}</p>
          </div>
          <button
            onClick={() => onDelete(prescription.id)}
            className="icon-btn opacity-0 group-hover:opacity-100 hover:text-red-500">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="font-bold text-[#001F3F]">{formatDate(prescription.raceDate)}</div>
            <div className="text-xs text-slate-400">data da prova</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="font-bold" style={{ color: daysUntilRace < 14 ? '#EF4444' : daysUntilRace < 60 ? '#F97316' : '#001F3F' }}>
              {daysUntilRace > 0 ? `${daysUntilRace}d` : 'Passou'}
            </div>
            <div className="text-xs text-slate-400">para a prova</div>
          </div>
        </div>

        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{prescription.weeks.length} semanas · {totalVolume.toFixed(0)} km</span>
          {prescription.goalTime && <span>🎯 {prescription.goalTime}</span>}
        </div>

        <button onClick={() => onOpen(prescription.id)} className="btn-primary w-full text-sm mt-3">
          Ver Plano →
        </button>
      </div>
    </div>
  );
}

export default function AthleteDetail() {
  const { state, dispatch, selected } = useApp();
  const { confirm } = useConfirm();
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);

  const athlete = selected.athlete;
  if (!athlete) return null;

  const prescriptions = state.prescriptions.filter(p => p.athleteId === athlete.id);

  function handleDeletePrescription(id) {
    confirm({
      title: 'Remover prescrição?',
      message: 'O histórico de treinos deste atleta para esta variante será removido.',
      confirmText: 'Remover',
      onConfirm: () => dispatch({ type: 'DELETE_PRESCRIPTION', id }),
    });
  }

  return (
    <div>
      {/* Athlete header */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#001F3F] rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {athlete.name.split(' ').map(n => n[0]).slice(0,2).join('')}
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#001F3F]">{athlete.name}</h1>
            <div className="flex gap-3 mt-1 text-sm text-slate-400 flex-wrap">
              {athlete.email && <span>✉ {athlete.email}</span>}
              {athlete.phone && <span>📱 {athlete.phone}</span>}
              {athlete.birthDate && <span>🎂 {formatDate(athlete.birthDate)}</span>}
            </div>
            {athlete.notes && (
              <p className="text-xs text-slate-400 mt-2 max-w-lg bg-slate-50 rounded-lg px-3 py-1.5">{athlete.notes}</p>
            )}
          </div>
        </div>
        <button onClick={() => setShowPrescriptionForm(true)} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Prescrever Ciclo
        </button>
      </div>

      {/* Prescriptions */}
      <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">
        Ciclos Prescritos ({prescriptions.length})
      </h2>

      {prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-bold text-[#001F3F] mb-2">Nenhum ciclo prescrito</h3>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">
            Conecte {athlete.name.split(' ')[0]} a um ciclo de treino escolhendo a variante e a data da prova.
          </p>
          <button onClick={() => setShowPrescriptionForm(true)} className="btn-primary">
            + Prescrever Ciclo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {prescriptions.map(p => (
            <PrescriptionCard
              key={p.id}
              prescription={p}
              onOpen={id => dispatch({ type: 'GO_PRESCRIPTION', prescriptionId: id })}
              onDelete={handleDeletePrescription}
            />
          ))}
        </div>
      )}

      {showPrescriptionForm && (
        <PrescriptionForm onClose={() => setShowPrescriptionForm(false)} athleteId={athlete.id} />
      )}
    </div>
  );
}
