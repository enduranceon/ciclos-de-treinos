import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uuid } from '../utils/helpers';

const STATUS_LABEL = { pending: 'Aguardando', done: 'Concluído' };
const STATUS_COLOR = { pending: '#F59E0B', done: '#10B981' };

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');

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
    // Mark as done in lab
    await supabase.from('lab_queue').update({
      status: 'done',
      sent_to_tp_by: session.user.id,
      done_at: new Date().toISOString(),
    }).eq('id', item.id);

    // Save to workout library
    dispatch({
      type: 'SAVE_TO_LIBRARY',
      payload: {
        workout: {
          title: item.title,
          type: item.type,
          description: item.description,
          blocks: item.blocks,
        },
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
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#001F3F]">⚗️ Laboratório</h1>
        <p className="text-sm text-slate-400 mt-1">Treinos revisados aguardando envio ao Training Peaks</p>
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
        <div className="text-center py-12 text-slate-300">
          <p className="text-4xl mb-3">{tab === 'pending' ? '⚗️' : '✅'}</p>
          <p className="text-sm">{tab === 'pending' ? 'Nenhum treino aguardando' : 'Nenhum treino concluído ainda'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(item => (
            <LabCard key={item.id} item={item} onDone={handleDone} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
