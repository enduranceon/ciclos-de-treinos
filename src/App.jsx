import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './context/ConfirmContext';
import Layout from './components/Layout';
import HomeView from './components/HomeView';
import CycleDetail from './components/CycleDetail';
import VariantDetail from './components/VariantDetail';
import WeekDetail from './components/WeekDetail';
import AthletesView from './components/AthletesView';
import AthleteDetail from './components/AthleteDetail';
import PrescriptionView from './components/PrescriptionView';
import SettingsView from './components/SettingsView';
import LibraryStudioView from './components/LibraryStudioView';
import LoginView from './components/LoginView';
import LabView from './components/LabView';
import TeamView from './coach/TeamView';
import AthleteApp from './athlete/AthleteApp';
import InvitePage from './invite/InvitePage';
import './index.css';

function CoachContent() {
  const { state } = useApp();
  return (
    <Layout>
      {state.view === 'cycles'       && <HomeView />}
      {state.view === 'cycle'        && <CycleDetail />}
      {state.view === 'variant'      && <VariantDetail />}
      {state.view === 'week'         && <WeekDetail />}
      {state.view === 'team'         && <TeamView />}
      {state.view === 'athletes'     && <AthletesView />}
      {state.view === 'athlete'      && <AthleteDetail />}
      {state.view === 'prescription' && <PrescriptionView />}
      {state.view === 'settings'     && <SettingsView />}
      {state.view === 'studio'       && <LibraryStudioView />}
      {state.view === 'lab'          && <LabView />}
    </Layout>
  );
}

function CoachShell({ userId }) {
  return (
    <AppProvider userId={userId}>
      <ConfirmProvider>
        <CoachContent />
      </ConfirmProvider>
    </AppProvider>
  );
}

function AuthGate() {
  const { session, profile } = useAuth();

  // Loading: session ainda não resolvida OU profile ainda carregando
  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#001F3F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginView />;

  // Sem profile (não deveria acontecer) — trata como atleta por default
  const role = profile?.role || 'athlete';

  if (role === 'coach') return <CoachShell userId={session.user.id} />;
  return <AthleteApp />;
}

// Roteamento mínimo por URL (sem react-router pra não inflar)
function Router() {
  const path = window.location.pathname;
  // /invite/:token — acessível sem login
  const inviteMatch = path.match(/^\/invite\/([a-f0-9]{20,})\/?$/i);
  if (inviteMatch) {
    return <InvitePage token={inviteMatch[1]} />;
  }
  return <AuthGate />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
