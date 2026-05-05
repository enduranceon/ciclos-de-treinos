import { useApp } from '../context/AppContext';
import { SPORT_ICONS } from '../utils/helpers';

const NAV_TABS = [
  { view: 'cycles',   label: 'Ciclos',   icon: '📋', action: 'GO_CYCLES'   },
  { view: 'athletes', label: 'Atletas',  icon: '👤', action: 'GO_ATHLETES' },
  { view: 'settings', label: 'Config.',  icon: '⚙️', action: 'GO_SETTINGS' },
];

export default function Layout({ children }) {
  const { state, dispatch, selected } = useApp();

  const inCyclesSection   = ['cycles', 'cycle', 'variant', 'week'].includes(state.view);
  const inAthletesSection = ['athletes', 'athlete', 'prescription'].includes(state.view);
  const inSettings        = state.view === 'settings';

  function isTabActive(tab) {
    if (tab.view === 'cycles')   return inCyclesSection;
    if (tab.view === 'athletes') return inAthletesSection;
    if (tab.view === 'settings') return inSettings;
    return false;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-[#001F3F] text-white shadow-lg">
        <div className="w-full px-6 py-0 flex items-stretch justify-between">
          {/* Logo */}
          <button
            onClick={() => dispatch({ type: 'GO_CYCLES' })}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity py-4"
          >
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#001F3F] font-black text-xs">EON</span>
            </div>
            <div className="text-left">
              <div className="font-bold text-sm leading-tight tracking-wide">ENDURANCE ON</div>
              <div className="text-[9px] text-blue-300 tracking-widest uppercase leading-tight">Training Hub</div>
            </div>
          </button>

          {/* Main nav tabs */}
          <div className="flex items-stretch gap-1 px-4">
            {NAV_TABS.map(tab => (
              <button
                key={tab.view}
                onClick={() => dispatch({ type: tab.action })}
                className={`px-5 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  isTabActive(tab)
                    ? 'border-white text-white'
                    : 'border-transparent text-blue-300 hover:text-white hover:border-blue-400'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-blue-300 py-4 ml-auto">
            {inCyclesSection && (
              <>
                <button onClick={() => dispatch({ type: 'GO_CYCLES' })}
                  className="hover:text-white transition-colors">Ciclos</button>
                {selected.cycle && (
                  <>
                    <span className="text-blue-500">/</span>
                    <button onClick={() => dispatch({ type: 'GO_CYCLE', cycleId: selected.cycle.id })}
                      className="hover:text-white transition-colors max-w-[120px] truncate">
                      {selected.cycle.name}
                    </button>
                  </>
                )}
                {selected.variant && (
                  <>
                    <span className="text-blue-500">/</span>
                    <button onClick={() => dispatch({ type: 'GO_VARIANT', variantId: selected.variant.id })}
                      className="hover:text-white transition-colors max-w-[100px] truncate">
                      {selected.variant.name}
                    </button>
                  </>
                )}
                {selected.week && (
                  <>
                    <span className="text-blue-500">/</span>
                    <span className="text-white font-medium">Semana {selected.week.weekNumber}</span>
                  </>
                )}
              </>
            )}
            {inAthletesSection && (
              <>
                <button onClick={() => dispatch({ type: 'GO_ATHLETES' })}
                  className="hover:text-white transition-colors">Atletas</button>
                {selected.athlete && (
                  <>
                    <span className="text-blue-500">/</span>
                    <button onClick={() => dispatch({ type: 'GO_ATHLETE', athleteId: selected.athlete.id })}
                      className="hover:text-white transition-colors max-w-[120px] truncate">
                      {selected.athlete.name.split(' ')[0]}
                    </button>
                  </>
                )}
                {state.view === 'prescription' && (
                  <>
                    <span className="text-blue-500">/</span>
                    <span className="text-white font-medium">Plano</span>
                  </>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="w-full px-6 py-6">
        {children}
      </main>

    </div>
  );
}
