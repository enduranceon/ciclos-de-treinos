import { useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  calcWeekVolume, calcWeekStress, calcWeekZones,
  formatDate, ZONE_COLORS, SPORT_ICONS, buildPhaseMap
} from '../utils/helpers';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const ZONES = ['z0','z1','z2','z3','z4','z5','z6'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, item) => sum + (item.value || 0), 0);
  if (total === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-[#001F3F] mb-1">{label} — {total.toFixed(1)} km</p>
      {payload.filter(item => item.value > 0).reverse().map(item => (
        <div key={item.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: item.fill }} />
          <span className="font-mono font-semibold">{item.value.toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

export default function AthleteView() {
  const { state, dispatch } = useApp();
  const printRef = useRef();
  const cycle = state.cycles.find(c => c.id === state.selectedCycleId);

  if (!cycle) return null;

  const { colors: phaseColors, labels: phaseLabels } = buildPhaseMap(state.phaseConfig);
  const totalVolume = cycle.weeks.reduce((s, w) => s + calcWeekVolume(w.workouts), 0);
  const totalWorkouts = cycle.weeks.reduce((s, w) => s + w.workouts.length, 0);

  const zoneData = cycle.weeks.map(w => {
    const row = { name: `S${w.weekNumber}` };
    const wz = calcWeekZones(w.workouts, state.zoneConfig);
    ZONES.forEach(z => { row[z] = parseFloat((wz[z] || 0).toFixed(2)); });
    return row;
  });

  // Phase blocks
  const phases = [];
  let current = null;
  cycle.weeks.forEach(w => {
    if (!current || current.phase !== w.phase) {
      current = { phase: w.phase, start: w.weekNumber, end: w.weekNumber, startDate: w.startDate };
      phases.push(current);
    } else {
      current.end = w.weekNumber;
    }
  });

  async function handleExportPDF() {
    const el = printRef.current;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height / canvas.width) * w;
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save(`EON_${cycle.athleteName.replace(/\s/g,'_')}_${cycle.targetRace.replace(/\s/g,'_')}.pdf`);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Actions bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => dispatch({ type: 'GO_CYCLE', cycleId: cycle.id })}
          className="text-sm text-slate-400 hover:text-[#001F3F] transition-colors flex items-center gap-1"
        >
          ← Voltar ao Planejamento
        </button>
        <button
          onClick={handleExportPDF}
          className="bg-[#001F3F] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#002952] transition-colors flex items-center gap-2"
        >
          ↓ Exportar PDF
        </button>
      </div>

      {/* Printable area */}
      <div ref={printRef} className="bg-white">
        {/* Hero header */}
        <div className="bg-[#001F3F] rounded-2xl p-8 mb-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-[#001F3F] font-black text-xs">EON</span>
                </div>
                <span className="text-blue-300 text-sm font-medium tracking-widest uppercase">Endurance On</span>
              </div>
              <h1 className="text-4xl font-black mt-3 mb-1">{cycle.athleteName}</h1>
              <p className="text-blue-200 text-lg font-medium">{cycle.targetRace}</p>
              <div className="flex gap-6 mt-4 text-sm text-blue-200">
                <span>🏁 Prova: <strong className="text-white">{formatDate(cycle.raceDate)}</strong></span>
                <span>{SPORT_ICONS[cycle.sport]} Modalidade: <strong className="text-white capitalize">{cycle.sport}</strong></span>
                {cycle.goalTime && <span>🎯 Meta: <strong className="text-white">{cycle.goalTime}</strong></span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Semanas', value: cycle.totalWeeks },
                { label: 'Sessões', value: totalWorkouts },
                { label: 'Volume', value: `${totalVolume.toFixed(0)} km` },
              ].map(s => (
                <div key={s.label} className="text-center bg-white/10 rounded-xl p-4">
                  <div className="text-3xl font-black">{s.value}</div>
                  <div className="text-xs text-blue-300 uppercase tracking-wide mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Phase map */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">Mapa de Preparação</h2>

          {/* Phase timeline */}
          <div className="flex gap-1 mb-3">
            {cycle.weeks.map(w => (
              <div
                key={w.id}
                className="flex-1 h-8 rounded flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}
                title={`S${w.weekNumber} — ${phaseLabels[w.phase] || w.phase}`}
                onClick={() => dispatch({ type: 'GO_WEEK', weekId: w.id })}
              >
                <span className="text-xs font-bold text-white">{w.weekNumber}</span>
              </div>
            ))}
          </div>

          {/* Phase labels */}
          <div className="flex gap-3 flex-wrap">
            {phases.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: phaseColors[p.phase] || '#94A3B8' }}
                />
                <span className="font-semibold" style={{ color: phaseColors[p.phase] || '#94A3B8' }}>
                  {phaseLabels[p.phase] || p.phase}
                </span>
                <span className="text-slate-400">
                  S{p.start}–S{p.end} ({p.end - p.start + 1}sem)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Volume chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">
            Progressão de Volume por Zona
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={zoneData} barSize={cycle.totalWeeks > 20 ? 10 : 18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} unit=" km" width={45} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F8FAFC' }} />
              {ZONES.map((z, i) => (
                <Bar key={z} dataKey={z} stackId="a" fill={ZONE_COLORS[z]} radius={i === 6 ? [3,3,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3">
            {ZONES.map(z => {
              const total = cycle.weeks.reduce((s, w) => {
                const wz = calcWeekZones(w.workouts, state.zoneConfig); return s + (wz[z] || 0);
              }, 0);
              if (total === 0) return null;
              return (
                <div key={z} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: ZONE_COLORS[z] }} />
                  {z.toUpperCase()}: {total.toFixed(1)} km
                </div>
              );
            })}
          </div>
        </div>

        {/* Week-by-week table */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">
            Resumo Semanal
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide w-12">Sem</th>
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide">Fase</th>
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide">Data</th>
                  {ZONES.map(z => (
                    <th key={z} className="text-right py-2 font-semibold" style={{ color: ZONE_COLORS[z] }}>
                      {z.toUpperCase()}
                    </th>
                  ))}
                  <th className="text-right py-2 text-[#001F3F] font-bold uppercase tracking-wide">Total</th>
                  <th className="text-right py-2 text-slate-400 font-semibold uppercase tracking-wide">ESS</th>
                </tr>
              </thead>
              <tbody>
                {cycle.weeks.map(w => {
                  const vol = calcWeekVolume(w.workouts);
                  const stress = calcWeekStress(w.workouts, state.zoneConfig);
                  return (
                    <tr
                      key={w.id}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => dispatch({ type: 'GO_WEEK', weekId: w.id })}
                    >
                      <td className="py-2 font-bold text-[#001F3F]">{w.weekNumber}</td>
                      <td className="py-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-white font-semibold"
                          style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}
                        >
                          {phaseLabels[w.phase] || w.phase}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400">{formatDate(w.startDate)}</td>
                      {ZONES.map(z => {
                        const v = (calcWeekZones(w.workouts, state.zoneConfig)[z] || 0);
                        return (
                          <td key={z} className="py-2 text-right font-mono" style={{ color: v > 0 ? ZONE_COLORS[z] : '#CBD5E1' }}>
                            {v > 0 ? v.toFixed(1) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-bold text-[#001F3F]">
                        {vol > 0 ? vol.toFixed(1) : '—'}
                      </td>
                      <td className="py-2 text-right text-sky-600 font-mono font-bold">
                        {stress > 0 ? stress.toFixed(1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="py-3 font-bold text-[#001F3F] uppercase text-xs tracking-wide">Total</td>
                  {ZONES.map(z => {
                    const total = cycle.weeks.reduce((s, w) => {
                      const wz = calcWeekZones(w.workouts, state.zoneConfig); return s + (wz[z] || 0);
                    }, 0);
                    return (
                      <td key={z} className="py-3 text-right font-bold font-mono" style={{ color: ZONE_COLORS[z] }}>
                        {total > 0 ? total.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-3 text-right font-black text-[#001F3F] text-sm">{totalVolume.toFixed(1)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 py-4 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#001F3F] rounded flex items-center justify-center">
              <span className="text-white font-black text-xs" style={{ fontSize: '7px' }}>EON</span>
            </div>
            <span>Endurance On — Sistema de Planejamento EON Hub</span>
          </div>
          <span>Coach Guto Fernandes</span>
        </div>
      </div>
    </div>
  );
}
