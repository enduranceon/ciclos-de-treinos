import { useState } from 'react';
import AIWorkoutBuilder from './AIWorkoutBuilder';
import LibraryPanel from './LibraryPanel';
import { useApp } from '../context/AppContext';
import { blockDistance, blockDurationMin } from '../utils/helpers';

const SECTION_LABELS = {
  aquecimento: 'Aquecimento',
  ativacao: 'Ativação',
  estimulos: 'Ativação',
  strides: 'Strides',
  transicao: 'Transição',
  serie_principal: 'Série Principal',
  volta_calma: 'Volta à Calma',
};
const SECTION_COLORS = {
  aquecimento: '#FB923C',
  ativacao: '#EF4444',
  estimulos: '#EF4444',
  strides: '#10B981',
  transicao: '#60A5FA',
  serie_principal: '#A78BFA',
  volta_calma: '#94A3B8',
};

function fmtRest(val) {
  const s = String(val || '');
  const parts = s.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0]) || 0;
    const sec = parseInt(parts[1]) || 0;
    if (m === 0) return `${sec}''`;
    if (sec === 0) return `${m}'`;
    return `${m}'${String(sec).padStart(2, '0')}''`;
  }
  const n = parseFloat(s);
  if (!n) return s;
  if (Number.isInteger(n)) return `${n}'`;
  const totalSec = Math.round(n * 60);
  const m2 = Math.floor(totalSec / 60);
  const s2 = totalSec % 60;
  if (m2 === 0) return `${s2}''`;
  if (s2 === 0) return `${m2}'`;
  return `${m2}'${String(s2).padStart(2, '0')}''`;
}

function SubBlockLine({ sb }) {
  let line = '';
  if (sb.type === 'continuous') {
    const zone = sb.targetMode === 'pse'
      ? `PSE ${(sb.pseLevel || '').replace('_', ' ')}`
      : (sb.zone || '').toUpperCase();
    line = `${sb.value}${sb.measureType === 'distance' ? ' km' : ' min'} · ${zone}`;
  } else if (sb.type === 'interval') {
    const wZone = sb.worktargetMode === 'pse'
      ? `PSE ${(sb.workpseLevel || '').replace('_', ' ')}`
      : (sb.workzone || sb.workZone || 'z4').toUpperCase();
    const rest = sb.restType === 'passive'
      ? `i=${fmtRest(sb.restValue)}`
      : `/ ${sb.restValue}${sb.restMeasure === 'distance' ? 'km' : 'min'} ${(sb.restzone || sb.restZone || 'trote').toUpperCase()}`;
    line = `${sb.repeat}× ${sb.workValue}${sb.workMeasure === 'distance' ? 'km' : 'min'} ${wZone} ${rest}`;
  } else if (sb.type === 'variation') {
    const stimStr = (sb.stimuli || []).map(s =>
      `${s.value}${s.measureType === 'distance' ? 'km' : 'min'} ${(s.zone || '').toUpperCase()}`
    ).join(' + ');
    line = `${sb.repeat}× [${stimStr}]`;
  }
  return line ? <p className="text-xs text-slate-700 font-mono mt-1">{line}</p> : null;
}

function LibraryItemDetail({ item, onClose }) {
  const blocks = item.blocks || [];
  const totalDist = blocks.reduce((s, b) => s + blockDistance(b), 0);
  const totalMins = blocks.reduce((s, b) => s + blockDurationMin(b), 0);
  const hh = Math.floor(totalMins / 60);
  const mm = String(Math.round(totalMins % 60)).padStart(2, '0');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-[#001F3F] leading-tight">{item.name}</h3>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {item.sport && (
              <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{item.sport}</span>
            )}
            {totalDist > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded-full">{totalDist.toFixed(1)} km</span>
            )}
            {totalMins > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded-full">{hh}:{mm}h</span>
            )}
            {item.folder && (
              <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">📁 {item.folder}</span>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-slate-500 mt-2 whitespace-pre-line leading-relaxed">{item.description}</p>
          )}
        </div>
        <button onClick={onClose}
          className="ml-3 flex-shrink-0 w-7 h-7 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-sm">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {blocks.length === 0 ? (
          <p className="text-sm text-slate-300 italic text-center pt-8">Sem blocos registrados.</p>
        ) : (
          blocks.map((section, si) => {
            const color = SECTION_COLORS[section.sectionType] || '#94A3B8';
            const label = SECTION_LABELS[section.sectionType] || section.sectionType;
            return (
              <div key={si} className="flex gap-2.5">
                <div className="w-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, minHeight: 16 }} />
                <div className="flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color }}>{label}</p>
                  {(section.subBlocks || []).map((sb, bi) => (
                    <SubBlockLine key={bi} sb={sb} />
                  ))}
                </div>
              </div>
            );
          })
        )}
        {item.notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Notas</p>
            <p className="text-xs text-slate-500 whitespace-pre-line">{item.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LibraryStudioView() {
  const [selectedItem, setSelectedItem] = useState(null);

  function handleSelect(item) {
    setSelectedItem(prev => prev?.id === item.id ? null : item);
  }

  return (
    <div className="flex gap-0 h-[calc(100vh-64px)] -mx-6 -my-6 overflow-hidden">

      {/* Left panel — AI generator */}
      <div className="w-[400px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <AIWorkoutBuilder mode="panel" />
        </div>
      </div>

      {/* Center panel — Library browser */}
      <div className={`flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden flex flex-col transition-all duration-200 ${selectedItem ? 'w-64' : 'flex-1'}`}>
        <LibraryPanel
          selectedId={selectedItem?.id}
          onSelect={handleSelect}
          compact={!!selectedItem}
        />
      </div>

      {/* Right panel — Item detail (shown when an item is selected) */}
      {selectedItem && (
        <div className="flex-1 bg-white overflow-hidden flex flex-col">
          <LibraryItemDetail
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        </div>
      )}

    </div>
  );
}
