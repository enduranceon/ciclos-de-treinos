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
import './index.css';

function AppContent() {
  const { state } = useApp();
  return (
    <Layout>
      {state.view === 'cycles'       && <HomeView />}
      {state.view === 'cycle'        && <CycleDetail />}
      {state.view === 'variant'      && <VariantDetail />}
      {state.view === 'week'         && <WeekDetail />}
      {state.view === 'athletes'     && <AthletesView />}
      {state.view === 'athlete'      && <AthleteDetail />}
      {state.view === 'prescription' && <PrescriptionView />}
      {state.view === 'settings'     && <SettingsView />}
      {state.view === 'studio'       && <LibraryStudioView />}
      {state.view === 'lab'          && <LabView />}
    </Layout>
  );
}

function AuthGate() {
  const { session } = useAuth();

  // Loading
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#001F3F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginView />;

  return (
    <AppProvider userId={session.user.id}>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
