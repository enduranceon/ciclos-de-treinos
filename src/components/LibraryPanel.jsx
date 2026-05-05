import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/ConfirmContext';
import { blockDistance, blockDurationMin, SPORT_ICONS } from '../utils/helpers';

const SPORT_COLORS = {
  corrida:  '#3B82F6',
  bike:     '#22C55E',
  natacao:  '#0EA5E9',
  forca:    '#A855F7',
  descanso: '#94A3B8',
};

// ── Individual library card ───────────────────────────────────────────────────
function LibraryCard({ item, isSelected, folders, onSelect, onDragStart, onDelete, onMoveToFolder }) {
  const [showMenu, setShowMenu] = useState(false);
  const dist   = (item.blocks || []).reduce((s, b) => s + blockDistance(b), 0);
  const mins   = (item.blocks || []).reduce((s, b) => s + blockDurationMin(b), 0);
  const sColor = SPORT_COLORS[item.sport] || '#3B82F6';

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', 'library');
        onDragStart?.({ type: 'library', item });
      }}
      onClick={() => { setShowMenu(false); onSelect?.(); }}
      className={`group relative cursor-grab active:cursor-grabbing px-3 py-2.5 border-l-2 transition-all select-none ${
        isSelected
          ? 'bg-[#001F3F]/5 border-[#001F3F]'
          : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
      }`}
    >
      {/* Name */}
      <div className="flex items-start gap-1.5 mb-0.5 pr-5">
        <span className="text-xs flex-shrink-0 mt-px" style={{ color: sColor }}>{SPORT_ICONS[item.sport] || '🏃'}</span>
        <span className="text-xs font-semibold text-[#001F3F] leading-tight line-clamp-2">{item.name}</span>
      </div>

      {/* Stats */}
      <div className="flex gap-2 pl-4" style={{ fontSize: '10px' }}>
        {mins > 0 && <span className="font-mono font-bold text-slate-500">{Math.floor(mins / 60)}:{String(Math.round(mins % 60)).padStart(2, '0')}h</span>}
        {dist > 0 && <span className="font-mono text-slate-400">{dist.toFixed(1)} km</span>}
      </div>

      {/* ⋯ menu button */}
      <button
        onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
        className="absolute top-2 right-2 w-5 h-5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 items-center justify-center opacity-0 group-hover:opacity-100 flex transition-opacity"
        style={{ fontSize: '12px' }}
      >⋯</button>

      {/* Dropdown menu */}
      {showMenu && (
        <div
          className="absolute right-1 top-7 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs text-slate-400 px-3 pt-1 pb-1.5 font-semibold uppercase tracking-wide">Mover para pasta</p>
          {folders.length === 0 ? (
            <p className="text-xs text-slate-300 px-3 pb-2">Nenhuma pasta criada</p>
          ) : (
            folders.map(f => (
              <button key={f}
                onClick={() => { onMoveToFolder(f === item.folder ? null : f); setShowMenu(false); }}
                className={`w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 transition-colors flex items-center gap-2 ${f === item.folder ? 'text-[#001F3F] font-semibold' : 'text-slate-600'}`}
              >
                <span>📁</span>
                <span className="truncate">{f}</span>
                {f === item.folder && <span className="ml-auto text-slate-400">✓</span>}
              </button>
            ))
          )}
          {item.folder && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => { onMoveToFolder(null); setShowMenu(false); }}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-slate-50 text-slate-500 transition-colors"
              >Remover da pasta</button>
            </>
          )}
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={() => { onDelete(); setShowMenu(false); }}
            className="w-full text-left text-xs px-3 py-1.5 hover:bg-red-50 text-red-500 transition-colors"
          >Excluir treino</button>
        </div>
      )}
    </div>
  );
}

// ── Folder section ────────────────────────────────────────────────────────────
function FolderSection({ name, items, folders, isOpen, onToggle, onRename, onDeleteFolder, onDeleteItem, selectedId, onSelect, onDragStart, onMoveToFolder, onDropFolder }) {
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);
  const [dragOverFolder, setDragOverFolder] = useState(false);

  function commitRename() {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== name) onRename(name, trimmed);
    setEditing(false);
  }

  const isUncategorized = name === '__none__';

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverFolder(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverFolder(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragOverFolder(false);
        onDropFolder(isUncategorized ? null : name);
      }}
    >
      {/* Folder header */}
      <div
        className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors ${dragOverFolder ? 'bg-blue-50 ring-1 ring-blue-300 ring-inset' : 'hover:bg-slate-50'}`}
        onClick={onToggle}
      >
        <span className="text-xs transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
        {isUncategorized ? (
          <span className="text-xs font-semibold text-slate-400 flex-1">Sem pasta</span>
        ) : editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
            onClick={e => e.stopPropagation()}
            className="flex-1 text-xs font-semibold text-[#001F3F] bg-transparent border-b border-[#001F3F] outline-none"
          />
        ) : (
          <span className="text-xs font-semibold text-[#001F3F] flex-1 truncate">📁 {name}</span>
        )}
        <span className="text-xs text-slate-400 font-mono ml-auto mr-1 flex-shrink-0">{items.length}</span>

        {!isUncategorized && !editing && (
          <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100"
            onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setEditVal(name); setEditing(true); }}
              className="w-5 h-5 rounded text-slate-400 hover:text-[#001F3F] hover:bg-slate-100 flex items-center justify-center transition-colors"
              title="Renomear pasta"
              style={{ fontSize: '10px' }}
            >✎</button>
            <button
              onClick={() => confirm({ title: `Excluir pasta "${name}"?`, message: 'Os treinos ficarão sem pasta e poderão ser reorganizados depois.', confirmText: 'Excluir pasta', onConfirm: () => onDeleteFolder(name) })}
              className="w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
              title="Excluir pasta"
              style={{ fontSize: '10px' }}
            >✕</button>
          </div>
        )}
      </div>

      {/* Items */}
      {isOpen && (
        <div className="border-l border-slate-100 ml-3">
          {items.length === 0 ? (
            <p className="text-xs text-slate-300 px-3 py-2">Pasta vazia</p>
          ) : (
            items.map(item => (
              <LibraryCard
                key={item.id}
                item={item}
                folders={folders.filter(f => f !== '__none__')}
                isSelected={selectedId === item.id}
                onSelect={() => onSelect(item)}
                onDragStart={onDragStart}
                onDelete={() => onDeleteItem(item.id)}
                onMoveToFolder={folder => onMoveToFolder(item.id, folder)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Library Panel ────────────────────────────────────────────────────────
export default function LibraryPanel({ selectedId, onSelect, onDragStart, onExternalDrop, compact = false }) {
  const { state, dispatch } = useApp();
  const { confirm } = useConfirm();
  const [search, setSearch]       = useState('');
  const [openFolders, setOpenFolders] = useState({});  // folderName → bool
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderRef = useRef(null);
  const dragFolderItem = useRef(null); // library item being dragged between folders

  const library = state.workoutLibrary || [];

  const filtered = library.filter(t =>
    !search ||
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.sport?.toLowerCase().includes(search.toLowerCase()) ||
    (t.folder || '').toLowerCase().includes(search.toLowerCase())
  );

  // Merge explicit folder list with item-derived folders
  const itemFolders = library.map(w => w.folder).filter(Boolean);
  const folders = [...new Set([...(state.libraryFolders || []), ...itemFolders])].sort();

  // Group filtered items by folder
  const groups = {};
  folders.forEach(f => { groups[f] = []; });
  groups['__none__'] = [];
  filtered.forEach(item => {
    const key = item.folder || '__none__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  // Named folders always shown; __none__ shown when it has items OR when there are folders (as a drop zone)
  const groupKeys = [...folders, '__none__'].filter(k =>
    k === '__none__' ? (groups[k]?.length > 0 || folders.length > 0) : true
  );

  function toggleFolder(name) {
    setOpenFolders(prev => ({ ...prev, [name]: prev[name] === undefined ? false : !prev[name] }));
  }
  function isFolderOpen(name) {
    return openFolders[name] !== false; // default open
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    dispatch({ type: 'CREATE_LIBRARY_FOLDER', payload: { name } });
    setNewFolderMode(false);
    setNewFolderName('');
  }

  function handleRenameFolder(oldName, newName) {
    dispatch({ type: 'RENAME_FOLDER', payload: { oldName, newName } });
    setOpenFolders(prev => {
      const next = { ...prev };
      if (oldName in next) { next[newName] = next[oldName]; delete next[oldName]; }
      return next;
    });
  }

  function handleDeleteFolder(name) {
    dispatch({ type: 'DELETE_FOLDER', name });
  }

  function handleDeleteItem(id) {
    confirm({
      title: 'Remover da biblioteca?',
      message: 'O treino será excluído permanentemente.',
      confirmText: 'Remover',
      onConfirm: () => dispatch({ type: 'DELETE_FROM_LIBRARY', id }),
    });
  }

  function handleMoveToFolder(id, folder) {
    dispatch({ type: 'UPDATE_LIBRARY_ITEM', payload: { id, folder } });
  }

  function handleDropOnFolder(folderName) {
    const payload = dragFolderItem.current;
    if (payload) {
      dragFolderItem.current = null;
      if (payload.type === 'library') {
        // folderName=null means "Sem pasta" → removes from folder
        if (payload.item.folder === folderName) return; // no change
        dispatch({ type: 'UPDATE_LIBRARY_ITEM', payload: { id: payload.item.id, folder: folderName } });
      }
    } else {
      // External drag (calendar workout dropped onto a folder/area)
      onExternalDrop?.(folderName);
    }
  }

  function handleDragStart(payload) {
    dragFolderItem.current = payload;
    onDragStart?.(payload);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-black text-[#001F3F]">Biblioteca</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-full">{library.length}</span>
            <button
              onClick={() => { setNewFolderMode(true); setTimeout(() => newFolderRef.current?.focus(), 50); }}
              className="text-xs text-slate-400 hover:text-[#001F3F] hover:bg-slate-100 w-6 h-6 rounded-lg flex items-center justify-center transition-colors font-bold"
              title="Nova pasta"
            >📁</button>
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar treino..."
          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#001F3F]/20 focus:border-[#001F3F] placeholder:text-slate-300"
        />

        {/* New folder input */}
        {newFolderMode && (
          <div className="flex gap-1.5 mt-2">
            <input
              ref={newFolderRef}
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName(''); } }}
              placeholder="Nome da pasta..."
              className="flex-1 text-xs border border-[#001F3F]/30 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#001F3F]/20"
            />
            <button onClick={createFolder} className="text-xs bg-[#001F3F] text-white px-2 rounded-lg hover:bg-[#001F3F]/80">OK</button>
            <button onClick={() => { setNewFolderMode(false); setNewFolderName(''); }} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
          </div>
        )}
      </div>

      {/* Hint */}
      {!compact && (
        <div className="px-3 py-1.5 border-b border-slate-50 flex-shrink-0">
          <p className="text-slate-300 leading-tight" style={{ fontSize: '10px' }}>
            Arraste para o calendário · ⋯ para mover de pasta
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {groupKeys.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-xs text-slate-400 font-semibold">Biblioteca vazia</p>
            <p className="text-xs text-slate-300 mt-1 leading-tight">Monte sessões e salve para reutilizar aqui.</p>
          </div>
        ) : filtered.length === 0 && search ? (
          <p className="text-xs text-slate-300 text-center py-6">Sem resultados para "{search}"</p>
        ) : (
          <div className="group">
            {groupKeys.map(key => (
              <FolderSection
                key={key}
                name={key}
                items={groups[key] || []}
                folders={folders}
                isOpen={isFolderOpen(key)}
                onToggle={() => toggleFolder(key)}
                onRename={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onDeleteItem={handleDeleteItem}
                selectedId={selectedId}
                onSelect={onSelect}
                onDragStart={handleDragStart}
                onMoveToFolder={handleMoveToFolder}
                onDropFolder={handleDropOnFolder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
