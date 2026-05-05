import { AppProvider, useApp } from './context/AppContext';
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
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </AppProvider>
  );
}
