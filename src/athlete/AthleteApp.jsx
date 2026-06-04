import { useState } from 'react';
import AthleteLayout from './AthleteLayout';
import AthleteCalendarView from './AthleteCalendarView';
import AthleteTodayView from './AthleteTodayView';
import AthleteHistoryView from './AthleteHistoryView';
import AthleteProfileView from './AthleteProfileView';

export default function AthleteApp() {
  const [view, setView] = useState('today');

  return (
    <AthleteLayout view={view} onChangeView={setView}>
      {view === 'today'    && <AthleteTodayView />}
      {view === 'calendar' && <AthleteCalendarView />}
      {view === 'history'  && <AthleteHistoryView />}
      {view === 'profile'  && <AthleteProfileView />}
    </AthleteLayout>
  );
}
