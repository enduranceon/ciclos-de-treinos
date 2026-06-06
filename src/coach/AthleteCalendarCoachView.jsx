import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import WorkoutForm from '../components/WorkoutForm';
import {
  blockDurationMin, calcWorkoutDistance, calcWorkoutZones,
  ZONE_COLORS, DEFAULT_ZONE_CONFIG,
} from '../utils/helpers';

// ── Ponte de dados D&D (nível de módulo — independente do ciclo de render React)
// dataTransfer.getData() pode ser esvaziado em alguns browsers antes do drop.
// Uma variável de módulo é 100% confiável.
let _activeDrag = null;

// ── Visuais ────────────────────────────────────────────────────────────────────
const SPORT = {
  corrida:  { color: '#3B82F6', bg: '#EFF6FF', label: 'Corrida',  icon: '🏃' },
  bike:     { color: '#F59E0B', bg: '#FFFBEB', label: 'Ciclismo', icon: '🚴' },
  natacao:  { color: '#06B6D4', bg: '#ECFEFF', label: 'Natação',  icon: '🏊' },
  forca:    { color: '#8B5CF6', bg: '#F5F3FF', label: 'Força',    icon: '🏋️' },
  descanso: { color: '#94A3B8', bg: '#F8FAFC', label: 'Descanso', icon: '😴' },
};
const SPORT_OPTIONS = Object.entries(SPORT).map(([v, s]) => ({ value: v, label: s.label }));
const WEEKDAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const ZONE_ORDER = ['z1','z2','z3','z4','z5','z6'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseISO(s) { return new Date(s+'T12:00:00'); }
function isToday(iso) { return iso === toISO(new Date()); }

function calcDuration(blocks) {
  return Math.round((blocks||[]).reduce((s,b) => s+blockDurationMin(b), 0));
}
function fmtDuration(min) {
  if (!min) return '';
  const h = Math.floor(min/60), m = min%60;
  return h ? `${h}h${m ? String(m).padStart(2,'0') : ''}` : `${m}min`;
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const offset = (first.getDay()||7) - 1;
  const start  = new Date(first); start.setDate(start.getDate()-offset);
  const weeks  = [];
  let cur = new Date(start);
  while (true) {
    const week = [];
    for (let i=0;i<7;i++) { week.push(toISO(new Date(cur))); cur.setDate(cur.getDate()+1); }
    weeks.push(week);
    if (cur.getMonth()!==month && cur>last) break;
    if (weeks.length>=6) break;
  }
  return weeks;
}

// Barra de zonas compacta
function ZoneBar({ blocks, zoneConfig }) {
  const cfg = zoneConfig || DEFAULT_ZONE_CONFIG;
  const zones = calcWorkoutZones({ blocks: blocks||[] }, cfg);
  const total = ZONE_ORDER.reduce((s,z) => s+(zones[z]||0), 0);
  if (total < 0.01) return null;
  return (
    <div className="flex h-1 rounded-full overflow-hidden mt-1 gap-px">
      {ZONE_ORDER.map(z => {
        const pct = total > 0 ? ((zones[z]||0)/total)*100 : 0;
        if (pct < 1) return null;
        return <div key={z} style={{ width:`${pct}%`, backgroundColor: ZONE_COLORS[z]||'#94A3B8' }} />;
      })}
    </div>
  );
}

// ── Painel de Atletas ──────────────────────────────────────────────────────────
function AthletesPanel({ athletes, currentAthleteId, onSelect }) {
  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-slate-100 overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex-shrink-0">
        <h3 className="text-xs font-black text-[#001F3F] uppercase tracking-widest">
          Meu Time
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Clique para trocar de atleta</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {athletes.map(({ athlete_id, athlete }) => {
          const isActive = athlete_id === currentAthleteId;
          const initials = (athlete?.full_name || '?').trim().split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
          return (
            <button key={athlete_id}
              onClick={() => onSelect(athlete_id)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                isActive
                  ? 'bg-[#001F3F] text-white'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${
                isActive ? 'bg-white/20 text-white' : 'bg-[#001F3F]/10 text-[#001F3F]'
              }`}>
                {initials}
              </div>
              <span className="text-sm font-bold truncate">
                {athlete?.full_name || 'Sem nome'}
              </span>
              {isActive && <span className="ml-auto text-blue-300 text-xs">●</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Painel Biblioteca ──────────────────────────────────────────────────────────
function LibraryPanel({ zoneConfig, onDragStart, selectedWorkout, onSelect }) {
  const { state } = useApp();
  const library = state.workoutLibrary || [];
  const [search, setSearch]       = useState('');
  const [sportFilter, setSportFilter] = useState('');

  const filtered = library.filter(w => {
    const sp = w.type || w.sport || '';
    return (!sportFilter || sp === sportFilter)
      && (!search || (w.title||'').toLowerCase().includes(search.toLowerCase()));
  });

  return (
    <>
      {/* Filtros */}
      <div className="px-3 pt-2 pb-2 border-b border-slate-100 flex-shrink-0">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001F3F] mb-1.5"
        />
        <select value={sportFilter} onChange={e => setSportFilter(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#001F3F]">
          <option value="">Todos os esportes</option>
          {SPORT_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {library.length > 0 && (
          <p className="text-[9px] text-slate-400 mt-1.5 text-center">
            Arraste até o dia — ou clique para selecionar
          </p>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-1">
        {filtered.length === 0 && (
          <div className="text-center py-8 px-2">
            <p className="text-xs text-slate-400">
              {library.length === 0
                ? 'Nenhum treino na biblioteca. Crie novos treinos e marque "Salvar na biblioteca".'
                : 'Nenhum treino encontrado.'}
            </p>
          </div>
        )}
        {filtered.map(w => {
          const sp  = SPORT[w.type||w.sport] || SPORT.corrida;
          const dur  = w.estimated_duration_min ?? calcDuration(w.blocks);
          const dist = w.estimated_distance_km  ?? parseFloat(calcWorkoutDistance(w).toFixed(1));
          const isSelected = selectedWorkout?.id === w.id;

          return (
            <div key={w.id}
              draggable
              onDragStart={e => {
                _activeDrag = w;          // ponte confiável entre componentes
                onDragStart(e, w);        // notifica o pai (para visuais)
              }}
              // onDragEnd intencionalmente omitido:
              // re-renders do React durante o arrastar (setDragOver)
              // podem disparar dragend prematuramente.
              // _activeDrag é limpo pelo handleDrop ou sobrescrito no próximo drag.
              onClick={() => onSelect(isSelected ? null : w)}
              className={`
                p-2 rounded-lg cursor-grab active:cursor-grabbing border transition-all select-none
                ${isSelected
                  ? 'border-[#001F3F] bg-blue-50 ring-1 ring-[#001F3F]/20'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/60'
                }
              `}>
              {/* Sport + title */}
              <div className="flex items-start gap-1.5">
                <div className="w-1 flex-shrink-0 rounded-full mt-0.5"
                  style={{ backgroundColor: sp.color, minHeight: '28px' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[#001F3F] leading-tight line-clamp-2">
                    {w.title || w.name || '(sem título)'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: sp.color }}>
                      {sp.label}
                    </span>
                    {dur  > 0 && <span className="text-[9px] text-slate-400 font-mono">{fmtDuration(dur)}</span>}
                    {dist > 0 && <span className="text-[9px] text-slate-400 font-mono">{dist}km</span>}
                  </div>
                  <ZoneBar blocks={w.blocks} zoneConfig={state.zoneConfig} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// PrescribeModal removido — usa WorkoutForm completo (ver abaixo)

// ── Card de treino no calendário ───────────────────────────────────────────────
function CalWorkoutCard({ w, completed, onClick }) {
  const s = SPORT[w.sport] || SPORT.corrida;
  return (
    <button onClick={e=>{ e.stopPropagation(); onClick(w); }}
      draggable={false}
      // pointer-events-none nos filhos evita que interceptem eventos de drag do pai
      className="w-full text-left rounded mb-0.5 hover:brightness-95 transition-all overflow-hidden pointer-events-auto"
      style={{ backgroundColor: completed ? '#F0FDF4' : s.bg, borderLeft: `3px solid ${s.color}` }}>
      <div className="px-1.5 py-1 pointer-events-none">
        <div className="text-[10px] font-black truncate" style={{ color: s.color }}>{w.title}</div>
        <div className="flex items-center gap-1 mt-0.5">
          {w.estimated_duration_min && (
            <span className="text-[9px] text-slate-500 font-mono">{fmtDuration(w.estimated_duration_min)}</span>
          )}
          {w.estimated_duration_min && w.estimated_distance_km && <span className="text-[8px] text-slate-300">·</span>}
          {w.estimated_distance_km && (
            <span className="text-[9px] text-slate-500 font-mono">{w.estimated_distance_km}km</span>
          )}
          {completed && <span className="ml-auto text-green-500 text-[9px] font-black">✓</span>}
        </div>
      </div>
    </button>
  );
}

// ── Calendário mensal ──────────────────────────────────────────────────────────
export default function AthleteCalendarCoachView({ athleteId, athletes = [], onSelectAthlete, onBack }) {
  const { session }  = useAuth();
  const { state }    = useApp();
  const coachId      = session?.user?.id;
  const today        = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [athlete,    setAthlete]    = useState(null);
  const [prescribed, setPrescribed] = useState([]);
  const [completed,  setCompleted]  = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null);
  const [selectedLib, setSelectedLib] = useState(null);
  const [showLib, setShowLib]         = useState(true);
  const [sidebarTab, setSidebarTab]   = useState('library'); // 'library' | 'athletes'
  const [dropError, setDropError]     = useState('');

  const grid      = getMonthGrid(year, month);
  const gridStart = grid[0][0];
  const gridEnd   = grid[grid.length-1][6];

  const load = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    const [aRes, presRes, compRes] = await Promise.all([
      supabase.from('profiles').select('id,full_name').eq('id',athleteId).maybeSingle(),
      supabase.from('prescribed_workout')
        .select('id,scheduled_date,sport,title,estimated_duration_min,estimated_distance_km,description,blocks')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', gridStart)
        .lte('scheduled_date', gridEnd)
        .order('scheduled_date'),
      supabase.from('completed_workout')
        .select('id,prescribed_workout_id')
        .eq('athlete_id', athleteId)
        .gte('completed_at', gridStart+'T00:00:00')
        .lte('completed_at', gridEnd+'T23:59:59'),
    ]);
    if (!aRes.error)   setAthlete(aRes.data);
    if (!presRes.error) setPrescribed(presRes.data||[]);
    if (!compRes.error) setCompleted(compRes.data||[]);
    setLoading(false);
  }, [athleteId, year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { month===0 ? (setYear(y=>y-1),setMonth(11)) : setMonth(m=>m-1); }
  function nextMonth() { month===11? (setYear(y=>y+1),setMonth(0))  : setMonth(m=>m+1); }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  const workoutsForDay  = iso => prescribed.filter(p => p.scheduled_date===iso);
  const isCompleted     = id  => completed.some(c  => c.prescribed_workout_id===id);

  function weekTotals(week) {
    const ws   = week.flatMap(workoutsForDay);
    const mins = ws.reduce((s,w)=>s+(w.estimated_duration_min||0),0);
    const km   = ws.reduce((s,w)=>s+(w.estimated_distance_km||0),0);
    return {
      n:    ws.length,
      time: mins ? fmtDuration(mins) : '',
      km:   km   ? `${Number(km.toFixed(1))}km` : '',
    };
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  // Usa dataTransfer JSON como fonte de verdade (mais confiável que useRef entre componentes)
  function handleDragStart(e, workout) {
    e.dataTransfer.effectAllowed = 'copy';
    // Serializa o treino completo no dataTransfer
    e.dataTransfer.setData('application/json', JSON.stringify(workout));
    e.dataTransfer.setData('text/plain', workout.id); // fallback
  }

  function handleDragOver(e, iso) {
    e.preventDefault();
    // NÃO chamar setDragOver aqui para evitar re-renders durante o arrastar
    // que disparam onDragEnd prematuramente na fonte.
    // O highlight visual é feito via CSS :hover ao invés de state.
  }

  function handleDragLeave(e) {
    // Visual via CSS :hover — sem state
  }

  async function handleDrop(e, iso) {
    e.preventDefault();
    e.stopPropagation();
    setDropError('');

    // Lê da variável de módulo (_activeDrag) — 100% confiável entre componentes
    const w = _activeDrag;
    _activeDrag = null;

    if (!w) {
      setDropError('Nenhum treino detectado no drop. Tente novamente.');
      return;
    }

    // Compatível com `name` (formato antigo da biblioteca) e `title` (novo)
    const workoutTitle = w.title || w.name || 'Treino';
    const dur  = w.estimated_duration_min != null ? w.estimated_duration_min : calcDuration(w.blocks);
    const dist = w.estimated_distance_km  != null ? w.estimated_distance_km  : parseFloat(calcWorkoutDistance(w).toFixed(2));

    const { error } = await supabase.from('prescribed_workout').insert({
      athlete_id:             athleteId,
      coach_id:               coachId,
      scheduled_date:         iso,
      sport:                  w.type || w.sport || 'corrida',
      title:                  workoutTitle,
      description:            w.description || null,
      estimated_duration_min: dur  || null,
      estimated_distance_km:  dist || null,
      blocks:                 w.blocks || [],
    });

    if (error) {
      setDropError(`Erro ao salvar: ${error.message}`);
    } else {
      load();
    }
  }

  // Clique num dia → abre WorkoutForm (com biblioteca pré-carregada ou em branco)
  function handleDayClick(iso) {
    setModal({
      date: iso,
      libraryTemplate: selectedLib || null, // pré-preenche se tem selecionado
      editWorkout: null,
    });
  }

  // Salvar prescrição via WorkoutForm
  async function handlePrescribeSave(iso, editId, workoutData) {
    const payload = {
      athlete_id:             athleteId,
      coach_id:               coachId,
      scheduled_date:         iso,
      sport:                  workoutData.type || workoutData.sport || 'corrida',
      title:                  workoutData.title,
      description:            workoutData.description || null,
      estimated_duration_min: workoutData.blocks?.length
        ? Math.round(workoutData.blocks.reduce((s, b) => s + blockDurationMin(b), 0)) || null
        : null,
      estimated_distance_km:  workoutData.blocks?.length
        ? parseFloat(calcWorkoutDistance(workoutData).toFixed(2)) || null
        : null,
      blocks: workoutData.blocks || [],
    };
    const { error } = editId
      ? await supabase.from('prescribed_workout').update(payload).eq('id', editId)
      : await supabase.from('prescribed_workout').insert(payload);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    setModal(null);
    load();
  }

  // Remover treino prescrito
  async function handlePrescribeDelete(editId) {
    if (!confirm('Remover este treino do calendário?')) return;
    await supabase.from('prescribed_workout').delete().eq('id', editId);
    setModal(null);
    load();
  }

  // Adapta prescribed_workout → formato que WorkoutForm espera
  function adaptToWorkoutForm(pw) {
    if (!pw) return null;
    return {
      id:          pw.id,
      title:       pw.title || '',
      type:        pw.sport || 'corrida',
      description: pw.description || '',
      notes:       '',
      blocks:      pw.blocks || [],
      dayOfWeek:   1,
      period:      'manha',
    };
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Voltar + Header */}
      <div className="flex-shrink-0 mb-3">
        <button onClick={onBack}
          className="text-sm text-slate-500 hover:text-[#001F3F] mb-3 inline-flex items-center gap-1">
          ← Voltar ao time
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Toggle biblioteca */}
            <button onClick={() => setShowLib(v=>!v)}
              title={showLib ? 'Ocultar biblioteca' : 'Mostrar biblioteca'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                showLib ? 'bg-[#001F3F] border-[#001F3F] text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>
              📚
            </button>
            <h1 className="text-xl font-black text-[#001F3F]">{athlete?.full_name || '…'}</h1>
            {selectedLib && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-lg font-bold">
                ✓ {selectedLib.title} — clique num dia para prescrever
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold">
              ‹
            </button>
            <span className="text-base font-black text-[#001F3F] w-44 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold">
              ›
            </button>
            <button onClick={goToday}
              className="text-xs font-bold text-slate-500 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50">
              Hoje
            </button>
          </div>
        </div>
      </div>

      {/* Corpo: biblioteca + calendário */}
      <div className="flex flex-1 min-h-0 gap-3">

        {/* Sidebar: Biblioteca + Atletas */}
        {showLib && (
          <div className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-slate-100 overflow-hidden">
            {/* Toggle tabs */}
            <div className="flex border-b border-slate-100 flex-shrink-0">
              <button
                onClick={() => setSidebarTab('library')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  sidebarTab === 'library'
                    ? 'text-[#001F3F] border-b-2 border-[#001F3F]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}>
                📚 Biblioteca
              </button>
              <button
                onClick={() => setSidebarTab('athletes')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  sidebarTab === 'athletes'
                    ? 'text-[#001F3F] border-b-2 border-[#001F3F]'
                    : 'text-slate-400 hover:text-slate-600'
                }`}>
                👥 Atletas {athletes.length > 0 ? `(${athletes.length})` : ''}
              </button>
            </div>

            {/* Conteúdo da aba */}
            {sidebarTab === 'library' ? (
              <LibraryPanel
                zoneConfig={state.zoneConfig}
                onDragStart={handleDragStart}
                selectedWorkout={selectedLib}
                onSelect={setSelectedLib}
                embedded
              />
            ) : (
              <AthletesPanel
                athletes={athletes}
                currentAthleteId={athleteId}
                onSelect={id => {
                  if (onSelectAthlete) onSelectAthlete(id);
                  setSidebarTab('library'); // volta pra biblioteca ao trocar
                }}
              />
            )}
          </div>
        )}

        {/* Calendário */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          {/* Header dias da semana */}
          <div className="grid flex-shrink-0 border-b border-slate-100"
            style={{ gridTemplateColumns:'44px repeat(7,1fr)' }}>
            <div className="border-r border-slate-100 bg-slate-50" />
            {WEEKDAYS.map(d => (
              <div key={d}
                className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          {/* Erro de drop */}
          {dropError && (
            <div className="mx-3 mt-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 flex items-center justify-between">
              <span>{dropError}</span>
              <button onClick={() => setDropError('')} className="ml-2 font-bold">×</button>
            </div>
          )}

        {/* Semanas */}
          <div className="flex-1 overflow-y-auto"
            onDragOver={e => e.preventDefault()}>
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : (
              grid.map((week, wi) => {
                const tots = weekTotals(week);
                return (
                  <div key={wi}
                    className="grid border-b border-slate-100 last:border-b-0"
                    style={{ gridTemplateColumns:'44px repeat(7,1fr)', minHeight:'100px' }}>

                    {/* Totais */}
                    <div className="border-r border-slate-100 bg-slate-50/60 flex flex-col items-center justify-center px-1 py-1.5 gap-0.5">
                      <span className="text-[8px] font-black text-slate-300 uppercase">S{wi+1}</span>
                      {tots.km   && <span className="text-[10px] font-black text-[#001F3F]">{tots.km}</span>}
                      {tots.time && <span className="text-[9px] text-slate-400">{tots.time}</span>}
                    </div>

                    {/* Dias */}
                    {week.map(iso => {
                      const dayWorkouts = workoutsForDay(iso);
                      const d           = parseISO(iso);
                      const inMonth     = d.getMonth() === month;
                      const todayFlag   = isToday(iso);
                      const hasSelection = !!selectedLib;

                      return (
                        <div key={iso}
                          onClick={() => handleDayClick(iso)}
                          onDragOver={e => handleDragOver(e, iso)}
                          onDragLeave={handleDragLeave}
                          onDrop={e => handleDrop(e, iso)}
                          className={`
                            border-r border-slate-100 last:border-r-0 p-1.5 relative group
                            transition-colors cursor-pointer
                            drop-target
                            ${hasSelection ? 'hover:bg-blue-50/50' :
                              todayFlag    ? 'bg-blue-50/50 hover:bg-blue-50' :
                              inMonth      ? 'bg-white hover:bg-slate-50/60' :
                                             'bg-slate-50/30 hover:bg-slate-50/50'}
                          `}>

                          {/* Número dia */}
                          <div className="flex items-center justify-between mb-1">
                            <span className={`
                              text-[11px] font-black leading-none px-1 py-0.5 rounded inline-block
                              ${todayFlag  ? 'bg-[#001F3F] text-white' :
                                inMonth    ? 'text-slate-600' : 'text-slate-300'}
                            `}>{d.getDate()}</span>

                            {/* Botão + (hover, sem biblioteca selecionada) */}
                            {!hasSelection && (
                              <button
                                onClick={e=>{e.stopPropagation(); setModal({date:iso})}}
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded bg-[#001F3F]/10 hover:bg-[#001F3F]/20 text-[#001F3F] text-xs font-black">
                                +
                              </button>
                            )}
                          </div>

                          {/* Treinos prescritos */}
                          {dayWorkouts.map(w => (
                            <CalWorkoutCard key={w.id} w={w}
                              completed={isCompleted(w.id)}
                              onClick={wk => { setSelectedLib(null); setModal({date:iso,workout:wk}); }} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* WorkoutForm completo — mesmo editor dos Ciclos */}
      {modal && (
        <WorkoutForm
          onClose={() => setModal(null)}
          workout={adaptToWorkoutForm(modal.editWorkout)}
          libraryTemplate={modal.libraryTemplate || null}
          prescriptionDate={modal.date}
          onSave={(workoutData) =>
            handlePrescribeSave(modal.date, modal.editWorkout?.id || null, workoutData)
          }
          // Quando editar, mostrar botão de remover via onDelete
          {...(modal.editWorkout ? {
            onDelete: () => handlePrescribeDelete(modal.editWorkout.id)
          } : {})}
        />
      )}
    </div>
  );
}
