import { createContext, useContext, useReducer, useState, useEffect, useRef, useCallback } from 'react';
import {
  uuid,
  generateWeeks,
  recalcWeekDates,
  DEFAULT_ZONE_CONFIG,
  DEFAULT_PHASE_CONFIG,
  DEFAULT_RACE_PACE_CONFIG,
} from '../utils/helpers';
import { supabase } from '../lib/supabase';

const AppContext = createContext(null);
const STORAGE_KEY = 'eon_hub_v3';

// ─── Navigation state ────────────────────────────────────────────────────────
// view: 'cycles' | 'cycle' | 'variant' | 'week' | 'athletes' | 'athlete' | 'prescription' | 'settings' | 'studio'
const initialState = {
  cycles: [],         // training plan templates
  athletes: [],       // athlete database
  prescriptions: [],  // athlete ↔ variant connections
  workoutLibrary: [], // saved workout templates
  libraryFolders: [], // explicit folder list (allows empty folders)
  zoneConfig: DEFAULT_ZONE_CONFIG,   // zone % ranges
  racePaceConfig: DEFAULT_RACE_PACE_CONFIG, // race-pace % ranges used by AI
  phaseConfig: DEFAULT_PHASE_CONFIG, // training period definitions
  view: 'cycles',
  selectedCycleId: null,
  selectedVariantId: null,
  selectedWeekId: null,
  selectedAthleteId: null,
  selectedPrescriptionId: null,
};

function reducer(state, action) {
  switch (action.type) {

    // ── Navigation ──────────────────────────────────────────────────────────
    case 'GO_CYCLES':
      return { ...state, view: 'cycles', selectedCycleId: null, selectedVariantId: null, selectedWeekId: null };
    case 'GO_CYCLE':
      return { ...state, view: 'cycle', selectedCycleId: action.cycleId, selectedVariantId: null, selectedWeekId: null };
    case 'GO_VARIANT':
      return { ...state, view: 'variant', selectedVariantId: action.variantId };
    case 'GO_WEEK':
      return { ...state, view: 'week', selectedWeekId: action.weekId };
    case 'GO_ATHLETES':
      return { ...state, view: 'athletes', selectedAthleteId: null, selectedPrescriptionId: null };
    case 'GO_ATHLETE':
      return { ...state, view: 'athlete', selectedAthleteId: action.athleteId, selectedPrescriptionId: null };
    case 'GO_PRESCRIPTION':
      return { ...state, view: 'prescription', selectedPrescriptionId: action.prescriptionId };
    case 'GO_SETTINGS':
      return { ...state, view: 'settings' };
    case 'GO_STUDIO':
      return { ...state, view: 'studio' };
    case 'GO_LAB':
      return { ...state, view: 'lab' };

    // ── Cycles ───────────────────────────────────────────────────────────────
    case 'CREATE_CYCLE': {
      const cycle = {
        id: uuid(),
        name: action.payload.name,
        sport: action.payload.sport,
        distance: action.payload.distance,
        totalWeeks: parseInt(action.payload.totalWeeks),
        description: action.payload.description || '',
        createdAt: new Date().toISOString().split('T')[0],
        variants: [],
      };
      return { ...state, cycles: [...state.cycles, cycle] };
    }

    case 'UPDATE_CYCLE': {
      const { id, ...fields } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c => c.id === id ? { ...c, ...fields } : c),
      };
    }

    case 'DELETE_CYCLE': {
      // Also remove variants' prescriptions
      const cycle = state.cycles.find(c => c.id === action.id);
      const variantIds = new Set(cycle?.variants.map(v => v.id) || []);
      return {
        ...state,
        cycles: state.cycles.filter(c => c.id !== action.id),
        prescriptions: state.prescriptions.filter(p => !variantIds.has(p.variantId)),
        view: 'cycles',
        selectedCycleId: null,
      };
    }

    // ── Variants ─────────────────────────────────────────────────────────────
    case 'CREATE_VARIANT': {
      const { cycleId, name, sessionsPerWeek, description } = action.payload;
      const cycle = state.cycles.find(c => c.id === cycleId);
      // Use cycle's saved phaseMap + raceDate if available
      let weeks = generateWeeks(cycle.totalWeeks, cycle.raceDate || null);
      if (cycle.phaseMap) {
        weeks = weeks.map(w => ({
          ...w,
          phase: cycle.phaseMap[w.weekNumber] || w.phase,
        }));
      }
      const variant = {
        id: uuid(),
        name,
        sessionsPerWeek: parseInt(sessionsPerWeek),
        description: description || '',
        weeks,
      };
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id === cycleId ? { ...c, variants: [...c.variants, variant] } : c
        ),
      };
    }

    case 'UPDATE_VARIANT': {
      const { cycleId, variantId, ...fields } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id === cycleId
            ? { ...c, variants: c.variants.map(v => v.id === variantId ? { ...v, ...fields } : v) }
            : c
        ),
      };
    }

    case 'DELETE_VARIANT': {
      const { cycleId, variantId } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id === cycleId
            ? { ...c, variants: c.variants.filter(v => v.id !== variantId) }
            : c
        ),
        prescriptions: state.prescriptions.filter(p => p.variantId !== variantId),
        view: 'cycle',
        selectedVariantId: null,
      };
    }

    // ── Cycle structure (phases + race date, applied to all variants) ──────────
    case 'SET_CYCLE_PHASES': {
      const { cycleId, phaseMap, raceDate } = action.payload;
      // phaseMap: { weekNumber(1-based): phase }
      return {
        ...state,
        cycles: state.cycles.map(c => {
          if (c.id !== cycleId) return c;
          return {
            ...c,
            phaseMap: phaseMap,       // store on cycle for future variants
            raceDate: raceDate || c.raceDate || null,
            variants: c.variants.map(v => ({
              ...v,
              weeks: v.weeks.map(w => {
                const newPhase = phaseMap[w.weekNumber];
                let updated = { ...w };
                if (newPhase) updated.phase = newPhase;
                if (raceDate) {
                  // Count weeks from end to set start date
                  const weeksFromEnd = c.totalWeeks - w.weekNumber;
                  const d = new Date(raceDate + 'T12:00:00');
                  d.setDate(d.getDate() - weeksFromEnd * 7);
                  updated.startDate = d.toISOString().split('T')[0];
                }
                return updated;
              }),
            })),
          };
        }),
      };
    }

    // ── Weeks (inside variant) ────────────────────────────────────────────────
    case 'UPDATE_WEEK': {
      const { cycleId, variantId, weekId, ...fields } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id !== cycleId ? c : {
            ...c,
            variants: c.variants.map(v =>
              v.id !== variantId ? v : {
                ...v,
                weeks: v.weeks.map(w => w.id === weekId ? { ...w, ...fields } : w),
              }
            ),
          }
        ),
      };
    }

    // ── Workouts (inside variant week) ───────────────────────────────────────
    case 'UPSERT_WORKOUT': {
      const { cycleId, variantId, weekId, workout } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id !== cycleId ? c : {
            ...c,
            variants: c.variants.map(v =>
              v.id !== variantId ? v : {
                ...v,
                weeks: v.weeks.map(w => {
                  if (w.id !== weekId) return w;
                  const exists = w.workouts.find(t => t.id === workout.id);
                  const workouts = exists
                    ? w.workouts.map(t => t.id === workout.id ? workout : t)
                    : [...w.workouts, workout];
                  return { ...w, workouts };
                }),
              }
            ),
          }
        ),
      };
    }

    case 'DELETE_WORKOUT': {
      const { cycleId, variantId, weekId, workoutId } = action.payload;
      return {
        ...state,
        cycles: state.cycles.map(c =>
          c.id !== cycleId ? c : {
            ...c,
            variants: c.variants.map(v =>
              v.id !== variantId ? v : {
                ...v,
                weeks: v.weeks.map(w =>
                  w.id !== weekId ? w : { ...w, workouts: w.workouts.filter(t => t.id !== workoutId) }
                ),
              }
            ),
          }
        ),
      };
    }

    // ── Workout Library ──────────────────────────────────────────────────────
    case 'SAVE_TO_LIBRARY': {
      const { workout, folder } = action.payload;
      const template = {
        id: uuid(),
        name: workout.title,
        sport: workout.type,
        blocks: workout.blocks || [],
        description: workout.description || '',
        notes: workout.notes || '',
        folder: folder || null,
        savedAt: new Date().toISOString().split('T')[0],
      };
      return { ...state, workoutLibrary: [...state.workoutLibrary, template] };
    }

    case 'DELETE_FROM_LIBRARY': {
      return { ...state, workoutLibrary: state.workoutLibrary.filter(w => w.id !== action.id) };
    }

    case 'UPDATE_LIBRARY_ITEM': {
      const { id, ...fields } = action.payload;
      return { ...state, workoutLibrary: state.workoutLibrary.map(w => w.id === id ? { ...w, ...fields } : w) };
    }

    case 'CREATE_LIBRARY_FOLDER': {
      const { name } = action.payload;
      const existing = state.libraryFolders || [];
      if (existing.includes(name)) return state;
      return { ...state, libraryFolders: [...existing, name].sort() };
    }

    case 'RENAME_FOLDER': {
      const { oldName, newName } = action.payload;
      const lf = state.libraryFolders || [];
      return {
        ...state,
        workoutLibrary: state.workoutLibrary.map(w => w.folder === oldName ? { ...w, folder: newName } : w),
        libraryFolders: lf.map(f => f === oldName ? newName : f).sort(),
      };
    }

    case 'DELETE_FOLDER': {
      const lf = state.libraryFolders || [];
      return {
        ...state,
        workoutLibrary: state.workoutLibrary.map(w => w.folder === action.name ? { ...w, folder: null } : w),
        libraryFolders: lf.filter(f => f !== action.name),
      };
    }

    // ── Athletes ─────────────────────────────────────────────────────────────
    case 'CREATE_ATHLETE': {
      const athlete = {
        id: uuid(),
        name: action.payload.name,
        email: action.payload.email || '',
        phone: action.payload.phone || '',
        birthDate: action.payload.birthDate || '',
        notes: action.payload.notes || '',
        createdAt: new Date().toISOString().split('T')[0],
      };
      return { ...state, athletes: [...state.athletes, athlete] };
    }

    case 'UPDATE_ATHLETE': {
      const { id, ...fields } = action.payload;
      return {
        ...state,
        athletes: state.athletes.map(a => a.id === id ? { ...a, ...fields } : a),
      };
    }

    case 'DELETE_ATHLETE': {
      return {
        ...state,
        athletes: state.athletes.filter(a => a.id !== action.id),
        prescriptions: state.prescriptions.filter(p => p.athleteId !== action.id),
        view: 'athletes',
        selectedAthleteId: null,
      };
    }

    // ── Prescriptions ────────────────────────────────────────────────────────
    case 'CREATE_PRESCRIPTION': {
      const { athleteId, cycleId, variantId, raceDate, goalTime } = action.payload;

      // Find the variant to copy its weeks
      const cycle = state.cycles.find(c => c.id === cycleId);
      const variant = cycle?.variants.find(v => v.id === variantId);
      if (!variant) return state;

      // Deep copy weeks and recalculate dates
      const weeks = recalcWeekDates(
        variant.weeks.map(w => ({
          ...w,
          id: uuid(),
          workouts: w.workouts.map(t => ({ ...t, id: uuid() })),
        })),
        raceDate
      );

      const prescription = {
        id: uuid(),
        athleteId,
        cycleId,
        variantId,
        raceDate,
        goalTime: goalTime || '',
        createdAt: new Date().toISOString().split('T')[0],
        weeks, // snapshot of variant weeks with real dates
      };
      return { ...state, prescriptions: [...state.prescriptions, prescription] };
    }

    case 'DELETE_PRESCRIPTION': {
      return {
        ...state,
        prescriptions: state.prescriptions.filter(p => p.id !== action.id),
        view: 'athlete',
      };
    }

    // Prescription week update (coach can adjust per-athlete)
    case 'UPDATE_PRESCRIPTION_WEEK': {
      const { prescriptionId, weekId, ...fields } = action.payload;
      return {
        ...state,
        prescriptions: state.prescriptions.map(p =>
          p.id !== prescriptionId ? p : {
            ...p,
            weeks: p.weeks.map(w => w.id === weekId ? { ...w, ...fields } : w),
          }
        ),
      };
    }

    case 'UPDATE_ZONE_CONFIG': {
      return { ...state, zoneConfig: action.payload };
    }

    case 'UPDATE_RACE_PACE_CONFIG': {
      return { ...state, racePaceConfig: action.payload };
    }

    case 'UPDATE_PHASE_CONFIG': {
      return { ...state, phaseConfig: action.payload };
    }

    case 'LOAD_REMOTE':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

function mergeWithDefaults(saved) {
  if (saved.phaseConfig) {
    const existingKeys = new Set(saved.phaseConfig.map(p => p.key));
    const missing = DEFAULT_PHASE_CONFIG.filter(p => !existingKeys.has(p.key));
    if (missing.length > 0) saved.phaseConfig = [...saved.phaseConfig, ...missing];
  }
  return { ...initialState, ...saved };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeWithDefaults(JSON.parse(raw));
  } catch (_) {}
  return initialState;
}

const SUPABASE_URL = 'https://tcdoxeduhwyvhkxwrymj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pIBbWPeeC9rhd1-DrWU0SQ_ef0waSCV';

export function AppProvider({ children, userId }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const saveTimer      = useRef(null);
  const stateRef       = useRef(state);
  const remoteLoaded   = useRef(false); // guard: only allow unload-save after remote data is confirmed
  const localUpdatedAt = useRef(0);    // timestamp of last local save — used to detect newer local data
  const [remoteConflict, setRemoteConflict] = useState(false); // another device saved newer data

  // Keep ref in sync so beforeunload always sees latest state
  useEffect(() => { stateRef.current = state; });

  // Seed localUpdatedAt from localStorage on mount (once)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        localUpdatedAt.current = parsed.updatedAt || 0;
      }
    } catch (_) {}
  }, []);

  // Flush to Supabase on page unload — only after remote data has loaded
  useEffect(() => {
    if (!userId) return;
    function onBeforeUnload() {
      if (!remoteLoaded.current) return; // never overwrite with pre-load state
      const s = stateRef.current;
      const payload = JSON.stringify({
        coach_id:         userId,
        cycles:           s.cycles,
        athletes:         s.athletes,
        prescriptions:    s.prescriptions,
        workout_library:  s.workoutLibrary,
        library_folders:  s.libraryFolders,
        zone_config:      s.zoneConfig,
        race_pace_config: s.racePaceConfig,
        phase_config:     s.phaseConfig,
        updated_at:       new Date().toISOString(),
      });
      fetch(`${SUPABASE_URL}/rest/v1/coach_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: payload,
        keepalive: true,
      });
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [userId]);

  // Sync data from other tabs via localStorage storage event
  useEffect(() => {
    function onStorageChange(e) {
      if (e.key !== STORAGE_KEY || !e.newValue || !remoteLoaded.current) return;
      try {
        const saved = JSON.parse(e.newValue);
        const otherTs = saved.updatedAt || 0;
        if (otherTs > localUpdatedAt.current) {
          localUpdatedAt.current = otherTs;
          // Sync only data fields — keep this tab's own navigation intact
          dispatch({ type: 'LOAD_REMOTE', payload: mergeWithDefaults({
            cycles:        saved.cycles        ?? [],
            athletes:      saved.athletes      ?? [],
            prescriptions: saved.prescriptions ?? [],
            workoutLibrary: saved.workoutLibrary ?? [],
            libraryFolders: saved.libraryFolders ?? [],
            zoneConfig:    saved.zoneConfig    ?? DEFAULT_ZONE_CONFIG,
            racePaceConfig: saved.racePaceConfig ?? DEFAULT_RACE_PACE_CONFIG,
            phaseConfig:   saved.phaseConfig   ?? DEFAULT_PHASE_CONFIG,
          }) });
        }
      } catch (_) {}
    }
    window.addEventListener('storage', onStorageChange);
    return () => window.removeEventListener('storage', onStorageChange);
  }, []);

  // Load from Supabase when userId is available
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('coach_data')
      .select('*')
      .eq('coach_id', userId)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          // Network/server error — local state is fine, allow beforeunload to save
          remoteLoaded.current = true;
          return;
        }
        if (data) {
          const remoteTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          // Only apply remote data if it is strictly newer than what we have locally.
          // This prevents a slow Supabase response from overwriting changes the user
          // already made since the page loaded.
          if (remoteTs > localUpdatedAt.current) {
            localUpdatedAt.current = remoteTs;
            dispatch({ type: 'LOAD_REMOTE', payload: mergeWithDefaults({
              cycles:          data.cycles          ?? [],
              athletes:        data.athletes        ?? [],
              prescriptions:   data.prescriptions   ?? [],
              workoutLibrary:  data.workout_library  ?? [],
              libraryFolders:  data.library_folders  ?? [],
              zoneConfig:      data.zone_config      ?? DEFAULT_ZONE_CONFIG,
              racePaceConfig:  data.race_pace_config ?? DEFAULT_RACE_PACE_CONFIG,
              phaseConfig:     data.phase_config     ?? DEFAULT_PHASE_CONFIG,
            }) });
          }
        }
        remoteLoaded.current = true;
      });
  }, [userId]);

  // Realtime — detect when another device saves newer data
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`coach_data:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'coach_data', filter: `coach_id=eq.${userId}` },
        (payload) => {
          if (!remoteLoaded.current) return;
          const remoteTs = payload.new?.updated_at
            ? new Date(payload.new.updated_at).getTime()
            : 0;
          // Only warn if the remote save is strictly newer than our last local save
          // (meaning another device — not us — wrote it)
          if (remoteTs > localUpdatedAt.current + 2000) {
            setRemoteConflict(true);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Debounced save to Supabase + localStorage
  const saveData = useCallback((s) => {
    const now = Date.now();
    localUpdatedAt.current = now;

    const supabasePayload = {
      cycles:           s.cycles,
      athletes:         s.athletes,
      prescriptions:    s.prescriptions,
      workout_library:  s.workoutLibrary,
      library_folders:  s.libraryFolders,
      zone_config:      s.zoneConfig,
      race_pace_config: s.racePaceConfig,
      phase_config:     s.phaseConfig,
      updated_at:       new Date(now).toISOString(),
    };

    // Always persist locally as backup — timestamp included so LOAD_REMOTE can compare
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cycles: s.cycles, athletes: s.athletes, prescriptions: s.prescriptions,
        workoutLibrary: s.workoutLibrary, libraryFolders: s.libraryFolders,
        zoneConfig: s.zoneConfig, racePaceConfig: s.racePaceConfig,
        phaseConfig: s.phaseConfig,
        updatedAt: now,
        view: s.view,
        selectedCycleId: s.selectedCycleId,
        selectedVariantId: s.selectedVariantId,
        selectedWeekId: s.selectedWeekId,
        selectedAthleteId: s.selectedAthleteId,
        selectedPrescriptionId: s.selectedPrescriptionId,
      }));
    } catch (e) {
      // localStorage quota exceeded — force immediate Supabase save as fallback
      console.warn('[EON] localStorage cheio, salvando direto no Supabase', e);
      if (userId) {
        supabase
          .from('coach_data')
          .upsert({ coach_id: userId, ...supabasePayload }, { onConflict: 'coach_id' })
          .then(({ error }) => { if (error) console.warn('[EON] Supabase fallback error', error); });
      }
      return;
    }

    // Debounce Supabase write (1.5s)
    if (!userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from('coach_data')
        .upsert({ coach_id: userId, ...supabasePayload }, { onConflict: 'coach_id' })
        .then(({ error }) => { if (error) console.warn('[EON] Supabase save error', error); });
    }, 1500);
  }, [userId]);

  useEffect(() => {
    saveData(state);
  }, [state.cycles, state.athletes, state.prescriptions, state.workoutLibrary, state.libraryFolders, state.zoneConfig, state.racePaceConfig, state.phaseConfig, state.view, state.selectedCycleId, state.selectedVariantId, state.selectedWeekId, state.selectedAthleteId, state.selectedPrescriptionId]);

  // Helper selectors
  const selected = {
    cycle: state.cycles.find(c => c.id === state.selectedCycleId),
    variant: state.cycles
      .flatMap(c => c.variants)
      .find(v => v.id === state.selectedVariantId),
    week: state.cycles
      .flatMap(c => c.variants)
      .flatMap(v => v.weeks)
      .find(w => w.id === state.selectedWeekId),
    athlete: state.athletes.find(a => a.id === state.selectedAthleteId),
    prescription: state.prescriptions.find(p => p.id === state.selectedPrescriptionId),
  };

  // Find the cycle that owns the selected variant
  selected.variantCycle = state.cycles.find(c =>
    c.variants.some(v => v.id === state.selectedVariantId)
  );

  // Find cycle+variant that owns the selected week
  state.cycles.forEach(c => {
    c.variants.forEach(v => {
      if (v.weeks.some(w => w.id === state.selectedWeekId)) {
        selected.weekVariant = v;
        selected.weekCycle = c;
      }
    });
  });

  function handleReloadRemote() {
    setRemoteConflict(false);
    supabase
      .from('coach_data')
      .select('*')
      .eq('coach_id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        localUpdatedAt.current = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        dispatch({ type: 'LOAD_REMOTE', payload: mergeWithDefaults({
          cycles:          data.cycles          ?? [],
          athletes:        data.athletes        ?? [],
          prescriptions:   data.prescriptions   ?? [],
          workoutLibrary:  data.workout_library  ?? [],
          libraryFolders:  data.library_folders  ?? [],
          zoneConfig:      data.zone_config      ?? DEFAULT_ZONE_CONFIG,
          racePaceConfig:  data.race_pace_config ?? DEFAULT_RACE_PACE_CONFIG,
          phaseConfig:     data.phase_config     ?? DEFAULT_PHASE_CONFIG,
        }) });
      });
  }

  return (
    <AppContext.Provider value={{ state, dispatch, selected }}>
      {remoteConflict && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-[#001F3F] text-white text-sm px-4 py-3 rounded-xl shadow-2xl border border-white/10 max-w-sm w-full mx-4">
          <span className="text-lg">⚠️</span>
          <p className="flex-1 leading-snug">
            <span className="font-bold">Outro dispositivo salvou dados mais recentes.</span><br />
            <span className="text-white/70 text-xs">Recarregar para não perder essas alterações?</span>
          </p>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleReloadRemote}
              className="text-xs font-bold bg-white text-[#001F3F] px-3 py-1 rounded-lg hover:bg-white/90 transition-colors whitespace-nowrap"
            >
              Recarregar
            </button>
            <button
              onClick={() => setRemoteConflict(false)}
              className="text-xs text-white/50 hover:text-white/80 transition-colors text-center"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
