import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import AIWorkoutBuilder from './AIWorkoutBuilder';

const STATUS_LABEL = { pending: 'Aguardando', done: 'Concluído' };
const STATUS_COLOR = { pending: '#F59E0B', done: '#10B981' };

const SPORT_OPTIONS = [
  { value: 'corrida',  label: '🏃 Corrida' },
  { value: 'bike',     label: '🚴 Ciclismo' },
  { value: 'natacao',  label: '🏊 Natação' },
  { value: 'forca',    label: '🏋️ Força' },
  { value: 'descanso', label: '😴 Descanso' },
];

function WorkoutPreview({ blocks = [] }) {
  if (!blocks.length) return <p className="text-xs text-slate-300 italic">Sem blocos</p>;
  const SECTION_LABELS = {
    aquecimento: 'Aquecimento', ativacao: 'Ativação', strides: 'Strides',
    transicao: 'Transição', serie_principal: 'Série Principal', volta_calma: 'Volta à Calma',
  };
  const SECTION_COLORS = {
    aquecimento: '#FB923C', ativacao: '#EF4444', strides: '#10B981',
    transicao: '#60A5FA', serie_principal: '#A78BFA', volta_calma: '#94A3B8',
  };
  return (
    <div className="space-y-1.5 mt-2">
      {blocks.map((b, i) => {
        const color = SECTION_COLORS[b.sectionType] || '#94A3B8';
        const label = SECTION_LABELS[b.sectionType] || b.sectionType;
        return (
          <div key={i} className="flex gap-2">
            <div className="w-0.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: color, minHeight: 12 }} />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
              {(b.subBlocks || []).map((sb, j) => {
                let line = '';
                if (sb.type === 'continuo') {
                  line = `${sb.value}${sb.measureType === 'distance' ? 'km' : 'min'} ${sb.zone || ''}`;
                } else if (sb.type === 'intervalado') {
                  line = `${sb.repeat}× ${sb.workValue}${sb.workMeasure === 'distance' ? 'km' : 'min'} ${sb.workZone || ''}`;
                } else if (sb.type === 'variacao') {
                  line = `${sb.repeat}× variação`;
                }
                return line ? <p key={j} className="text-xs text-slate-600 font-mono">{line}</p> : null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManualCreateModal({ onClose, onSaved, userId }) {
  const [type, setType]         = useState('corrida');
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [saving, setSaving]     = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await supabase.from('lab_queue').insert({
      created_by: userId,
      title: title.trim(),
      type,
      description: description.trim(),
      blocks: [],
      status: 'pending',
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-[#001F3F] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-black text-base">✏️ Novo Treino</h2>
          <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Modalidade</label>
            <div className="flex flex-wrap gap-2">
              {SPORT_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setType(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    type === s.value
                      ? 'bg-[#001F3F] text-white border-[#001F3F]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Longão Z2 progressivo"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#001F3F]/50 text-slate-700 font-semibold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descrição do treino</label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              rows={5}
              placeholder="Descreva o treino: aquecimento, blocos principais, volume, zonas, observações..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#001F3F]/50 text-slate-600 font-mono resize-none leading-relaxed"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-400 text-sm font-bold py-2.5 rounded-xl hover:border-slate-300 transition-colors">
              Cancelar
            </button>
            <button onClick={save} disabled={!title.trim() || saving}
              className="flex-1 bg-[#001F3F] text-white text-sm font-bold py-2.5 rounded-xl hover:bg-[#002a55] transition-colors disabled:opacity-40">
              {saving ? 'Salvando…' : '⚗️ Enviar pro Lab'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabCard({ item, onDone, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = item.status === 'pending';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${isPending ? 'border-slate-200' : 'border-green-100'}`}>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${STATUS_COLOR[item.status]}20`, color: STATUS_COLOR[item.status] }}>
                {STATUS_LABEL[item.status]}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <h3 className="text-sm font-black text-[#001F3F] mt-1 leading-tight">{item.title}</h3>
            {item.description && (
              <p className="text-xs text-slate-400 font-mono mt-1 whitespace-pre-line leading-relaxed line-clamp-2">{item.description}</p>
            )}
          </div>

          <button onClick={() => setExpanded(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 flex-shrink-0 mt-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {expanded && <WorkoutPreview blocks={item.blocks} />}

        {isPending && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onDone(item)}
              className="flex-1 bg-[#001F3F] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#002a55] transition-colors"
            >
              ✓ Enviado ao Training Peaks — mover para Biblioteca
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="px-3 py-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LabView() {
  const { session } = useAuth();
  const { dispatch } = useApp();
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('pending');
  const [showManual, setShowManual] = useState(false);
  const [showAI, setShowAI]     = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('lab_queue')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDone(item) {
    await supabase.from('lab_queue').update({
      status: 'done',
      sent_to_tp_by: session.user.id,
      done_at: new Date().toISOString(),
    }).eq('id', item.id);

    dispatch({
      type: 'SAVE_TO_LIBRARY',
      payload: {
        workout: { title: item.title, type: item.type, description: item.description, blocks: item.blocks },
        folder: null,
      },
    });

    load();
  }

  async function handleDelete(id) {
    await supabase.from('lab_queue').delete().eq('id', id);
    load();
  }

  const pending = items.filter(i => i.status === 'pending');
  const done    = items.filter(i => i.status === 'done');
  const shown   = tab === 'pending' ? pending : done;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#001F3F]">⚗️ Laboratório</h1>
          <p className="text-sm text-slate-400 mt-1">Treinos em criação e revisão antes de ir ao Training Peaks</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#001F3F,#0a3a6e)' }}
          >
            ✨ Criar com IA
          </button>
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-slate-400 transition-all"
          >
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        {[
          { id: 'pending', label: `Aguardando${pending.length ? ` · ${pending.length}` : ''}` },
          { id: 'done',    label: `Concluídos${done.length   ? ` · ${done.length}`    : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
              tab === t.id ? 'bg-white text-[#001F3F] shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-[#001F3F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-slate-300">
          <p className="text-4xl mb-3">{tab === 'pending' ? '⚗️' : '✅'}</p>
          <p className="text-sm mb-4">{tab === 'pending' ? 'Nenhum treino aguardando aprovação' : 'Nenhum treino concluído ainda'}</p>
          {tab === 'pending' && (
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowAI(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#001F3F,#0a3a6e)' }}>
                ✨ Criar com IA
              </button>
              <button onClick={() => setShowManual(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:border-slate-400">
                ✏️ Manual
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(item => (
            <LabCard key={item.id} item={item} onDone={handleDone} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showManual && (
        <ManualCreateModal
          userId={session?.user?.id}
          onClose={() => setShowManual(false)}
          onSaved={() => { setShowManual(false); load(); }}
        />
      )}

      {showAI && (
        <AIWorkoutBuilder
          context={{}}
          onClose={() => setShowAI(false)}
          onOpenEditor={generated => {
            // In Lab context, "Usar Treino" saves directly to lab_queue
            supabase.from('lab_queue').insert({
              created_by: session?.user?.id,
              title: generated.title || 'Treino IA',
              type: generated.type || 'corrida',
              description: generated.description || '',
              blocks: generated.blocks || [],
              status: 'pending',
            }).then(() => { load(); });
            setShowAI(false);
          }}
        />
      )}
    </div>
  );
}
