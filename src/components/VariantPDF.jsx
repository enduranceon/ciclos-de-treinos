import { Document, Page, View, Text, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import { calcWeekVolume, calcWeekStress, calcWorkoutDistance, blockDurationMin, buildPhaseMap } from '../utils/helpers';

const SPORT_LABELS = {
  corrida: 'Corrida', bike: 'Ciclismo', natacao: 'Natação',
  forca: 'Força', descanso: 'Descanso',
};

const SPORT_COLORS = {
  corrida: '#16A34A', bike: '#2563EB', natacao: '#0EA5E9',
  forca: '#A855F7', descanso: '#94A3B8',
};

const COL_DAYS   = [1, 2, 3, 4, 5, 6, 0];
const COL_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const PERIOD_ORDER = { manha: 0, tarde: 1, noite: 2 };

function fmt(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h === 0 ? `${m}min` : `${h}h${m > 0 ? String(m).padStart(2,'0') : ''}`;
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#F8FAFC', padding: 36 },
  // Cover
  coverHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  coverBadge: { backgroundColor: '#001F3F', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 12 },
  coverBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  coverCycleName: { fontSize: 9, color: '#64748B', marginBottom: 3 },
  coverVariantName: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#001F3F' },
  coverMeta: { flexDirection: 'row', gap: 20, marginTop: 20, marginBottom: 32 },
  coverMetaBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  coverMetaValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#001F3F', marginBottom: 2 },
  coverMetaLabel: { fontSize: 8, color: '#94A3B8', letterSpacing: 1 },
  phaseBarRow: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  phaseSeg: { height: 8 },
  phaseLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  phaseLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phaseDot: { width: 6, height: 6, borderRadius: 2 },
  phaseLegendText: { fontSize: 7, color: '#64748B' },
  // Divider
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
  // Week section
  weekHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  weekNum: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#001F3F', marginRight: 8 },
  weekDate: { fontSize: 8, color: '#94A3B8', marginRight: 8 },
  phasePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  phasePillText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  weekSummaryRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 6, padding: 8, marginTop: 8, gap: 16 },
  weekSummaryItem: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  weekSummaryValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#001F3F' },
  weekSummaryLabel: { fontSize: 7, color: '#94A3B8' },
  // Day columns
  daysGrid: { flexDirection: 'row', gap: 4 },
  dayCol: { flex: 1 },
  dayLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4, textAlign: 'center' },
  // Workout card
  workoutCard: { borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4, overflow: 'hidden' },
  workoutLeft: { width: 3, position: 'absolute', top: 0, left: 0, bottom: 0 },
  workoutBody: { paddingLeft: 7, paddingRight: 5, paddingVertical: 5 },
  workoutSport: { fontSize: 6, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  workoutTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#1E293B', marginBottom: 2 },
  workoutDesc: { fontSize: 6, color: '#64748B', lineHeight: 1.4 },
  workoutStats: { flexDirection: 'row', gap: 6, marginTop: 3, alignItems: 'baseline' },
  workoutDist: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#001F3F' },
  workoutDur: { fontSize: 6, color: '#94A3B8' },
  emptyDay: { flex: 1, minHeight: 20 },
});

function WorkoutCard({ workout }) {
  const dist = calcWorkoutDistance(workout);
  const totalMins = (workout.blocks || []).reduce((s, b) => s + blockDurationMin(b), 0);
  const color = SPORT_COLORS[workout.type] || '#94A3B8';
  const sport = SPORT_LABELS[workout.type] || workout.type;
  return (
    <View style={s.workoutCard}>
      <View style={[s.workoutLeft, { backgroundColor: color }]} />
      <View style={s.workoutBody}>
        <Text style={[s.workoutSport, { color }]}>{sport.toUpperCase()}</Text>
        {workout.title ? <Text style={s.workoutTitle}>{workout.title}</Text> : null}
        {workout.description ? <Text style={s.workoutDesc} numberOfLines={3}>{workout.description}</Text> : null}
        {(dist > 0 || totalMins > 0) && (
          <View style={s.workoutStats}>
            {dist > 0 && <Text style={s.workoutDist}>{dist.toFixed(1)} km</Text>}
            {totalMins > 0 && <Text style={s.workoutDur}>{fmt(totalMins)}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

function WeekSection({ week, phaseColors, phaseLabels, zoneConfig, isFirst }) {
  const workouts = week.workouts || [];
  const vol = calcWeekVolume(workouts);
  const stress = calcWeekStress(workouts, zoneConfig);
  const phaseColor = phaseColors[week.phase] || '#94A3B8';
  const phaseLabel = phaseLabels[week.phase] || week.phase || '';

  let dateStr = '';
  if (week.startDate) {
    const d = new Date(week.startDate + 'T12:00:00');
    const end = new Date(d); end.setDate(d.getDate() + 6);
    dateStr = `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  }

  return (
    <View wrap={false} style={{ marginBottom: 20 }}>
      {!isFirst && <View style={s.divider} />}
      <View style={s.weekHeader}>
        <Text style={s.weekNum}>Semana {week.weekNumber}</Text>
        {dateStr ? <Text style={s.weekDate}>{dateStr}</Text> : null}
        {phaseLabel ? (
          <View style={[s.phasePill, { backgroundColor: phaseColor }]}>
            <Text style={s.phasePillText}>{phaseLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.daysGrid}>
        {COL_DAYS.map((dow, i) => {
          const dayWorkouts = workouts
            .filter(w => w.dayOfWeek === dow)
            .sort((a, b) => (PERIOD_ORDER[a.period] ?? 0) - (PERIOD_ORDER[b.period] ?? 0));
          return (
            <View key={dow} style={s.dayCol}>
              <Text style={[s.dayLabel, i >= 5 ? { color: '#CBD5E1' } : {}]}>{COL_LABELS[i]}</Text>
              {dayWorkouts.length > 0
                ? dayWorkouts.map(w => <WorkoutCard key={w.id} workout={w} />)
                : <View style={s.emptyDay} />}
            </View>
          );
        })}
      </View>

      <View style={s.weekSummaryRow}>
        <View style={s.weekSummaryItem}>
          <Text style={s.weekSummaryValue}>{vol.toFixed(1)}</Text>
          <Text style={s.weekSummaryLabel}>km</Text>
        </View>
        {stress > 0 && (
          <View style={s.weekSummaryItem}>
            <Text style={s.weekSummaryValue}>{stress.toFixed(0)}</Text>
            <Text style={s.weekSummaryLabel}>ESS</Text>
          </View>
        )}
        <View style={s.weekSummaryItem}>
          <Text style={s.weekSummaryValue}>{workouts.length}</Text>
          <Text style={s.weekSummaryLabel}>sessões</Text>
        </View>
      </View>
    </View>
  );
}

function VariantDocument({ cycle, variant, phaseConfig, zoneConfig }) {
  const { colors: phaseColors, labels: phaseLabels, list: phaseList } = buildPhaseMap(phaseConfig);
  const weeks = variant.weeks || [];
  const totalVol = weeks.reduce((s, w) => s + calcWeekVolume(w.workouts || []), 0);
  const totalSessions = weeks.reduce((s, w) => s + (w.workouts || []).length, 0);

  return (
    <Document title={`${cycle.name} — ${variant.name}`} author="EON Hub">
      <Page size="A4" orientation="landscape" style={s.page}>
        {/* Cover header */}
        <View style={s.coverHeader}>
          <View style={s.coverBadge}>
            <Text style={s.coverBadgeText}>EON</Text>
          </View>
          <View>
            <Text style={s.coverCycleName}>{cycle.name}</Text>
            <Text style={s.coverVariantName}>{variant.name}</Text>
          </View>
        </View>

        {/* Metrics */}
        <View style={s.coverMeta}>
          <View style={s.coverMetaBox}>
            <Text style={s.coverMetaValue}>{weeks.length}</Text>
            <Text style={s.coverMetaLabel}>SEMANAS</Text>
          </View>
          <View style={s.coverMetaBox}>
            <Text style={s.coverMetaValue}>{totalSessions}</Text>
            <Text style={s.coverMetaLabel}>SESSÕES</Text>
          </View>
          <View style={s.coverMetaBox}>
            <Text style={s.coverMetaValue}>{totalVol.toFixed(0)} km</Text>
            <Text style={s.coverMetaLabel}>VOLUME TOTAL</Text>
          </View>
          <View style={s.coverMetaBox}>
            <Text style={s.coverMetaValue}>{variant.sessionsPerWeek}×</Text>
            <Text style={s.coverMetaLabel}>POR SEMANA</Text>
          </View>
        </View>

        {/* Phase bar */}
        {weeks.length > 0 && (
          <>
            <View style={s.phaseBarRow}>
              {weeks.map(w => (
                <View key={w.id} style={[s.phaseSeg, { flex: 1, backgroundColor: phaseColors[w.phase] || '#94A3B8' }]} />
              ))}
            </View>
            <View style={s.phaseLegendRow}>
              {phaseList
                .filter(p => weeks.some(w => w.phase === p.key))
                .map(p => (
                  <View key={p.key} style={s.phaseLegendItem}>
                    <View style={[s.phaseDot, { backgroundColor: p.color }]} />
                    <Text style={s.phaseLegendText}>{p.label} ({weeks.filter(w => w.phase === p.key).length}s)</Text>
                  </View>
                ))}
            </View>
          </>
        )}

        <View style={[s.divider, { marginTop: 24 }]} />

        {/* Weeks */}
        {weeks.map((week, i) => (
          <WeekSection
            key={week.id}
            week={week}
            phaseColors={phaseColors}
            phaseLabels={phaseLabels}
            zoneConfig={zoneConfig}
            isFirst={i === 0}
          />
        ))}
      </Page>
    </Document>
  );
}

export default function VariantPDFButton({ cycle, variant, phaseConfig, zoneConfig }) {
  const fileName = `${cycle.name} - ${variant.name}.pdf`
    .replace(/[^a-zA-Z0-9À-ÿ\s\-_.]/g, '')
    .trim();

  return (
    <PDFDownloadLink
      document={<VariantDocument cycle={cycle} variant={variant} phaseConfig={phaseConfig} zoneConfig={zoneConfig} />}
      fileName={fileName}
    >
      {({ loading }) => (
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-[#001F3F] disabled:opacity-40"
          disabled={loading}
        >
          {loading ? '⏳' : '⬇'} PDF
        </button>
      )}
    </PDFDownloadLink>
  );
}
