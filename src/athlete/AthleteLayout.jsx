import { useAuth } from '../context/AuthContext';

const ATHLETE_TABS = [
  { view: 'calendar',  label: 'Calendário' },
  { view: 'today',     label: 'Hoje' },
  { view: 'history',   label: 'Histórico' },
  { view: 'profile',   label: 'Perfil' },
];

export default function AthleteLayout({ view, onChangeView, children }) {
  const { signOut, session, profile } = useAuth();
  const displayName = profile?.full_name || session?.user?.email || 'Atleta';

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] overflow-hidden">
      <header className="bg-[#001F3F] text-white shadow-lg flex-shrink-0">
        <div className="w-full px-6 flex items-stretch justify-between">
          {/* Logo */}
          <button
            onClick={() => onChangeView('today')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity py-4">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#001F3F] font-black text-xs">EON</span>
            </div>
            <div className="text-left">
              <div className="font-bold text-sm leading-tight tracking-wide">ENDURANCE ON</div>
              <div className="text-[9px] text-blue-300 tracking-widest uppercase leading-tight">Atleta</div>
            </div>
          </button>

          {/* Tabs */}
          <div className="flex items-stretch gap-1 px-4">
            {ATHLETE_TABS.map(tab => (
              <button
                key={tab.view}
                onClick={() => onChangeView(tab.view)}
                className={`px-5 text-sm font-medium transition-colors border-b-2 flex items-center ${
                  view === tab.view
                    ? 'border-white text-white'
                    : 'border-transparent text-blue-300 hover:text-white hover:border-blue-400'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* User */}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-blue-800">
            <span className="text-[11px] text-blue-300 hidden md:block max-w-[160px] truncate">
              {displayName}
            </span>
            <button
              onClick={signOut}
              title="Sair"
              className="text-xs text-blue-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-blue-900">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto w-full px-6 py-6">
        {children}
      </main>
    </div>
  );
}
