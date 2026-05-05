import { useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatDate, calcWeekVolume, calcWeekStress, calcWeekZones,
  ZONE_COLORS, SPORT_ICONS, buildPhaseMap
} from '../utils/helpers';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
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
        <div key={item.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />
          <span className="font-mono">{item.value.toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

export default function PrescriptionView() {
  const { state, dispatch, selected } = useApp();
  const printRef = useRef();

  const prescription = selected.prescription;
  const athlete = state.athletes.find(a => a.id === prescription?.athleteId);
  const cycle = state.cycles.find(c => c.id === prescription?.cycleId);
  const variant = cycle?.variants.find(v => v.id === prescription?.variantId);

  if (!prescription || !athlete) return null;

  const { colors: phaseColors, labels: phaseLabels } = buildPhaseMap(state.phaseConfig);
  const totalVolume = prescription.weeks.reduce((s, w) => s + calcWeekVolume(w.workouts), 0);
  const totalWorkouts = prescription.weeks.reduce((s, w) => s + w.workouts.length, 0);

  // Phase blocks summary
  const phases = [];
  let cur = null;
  prescription.weeks.forEach(w => {
    if (!cur || cur.phase !== w.phase) {
      cur = { phase: w.phase, start: w.weekNumber, end: w.weekNumber };
      phases.push(cur);
    } else cur.end = w.weekNumber;
  });

  // Chart
  const zoneData = prescription.weeks.map(w => {
    const row = { name: `S${w.weekNumber}` };
    ZONES.forEach(z => {
      const wz = calcWeekZones(w.workouts, state.zoneConfig); row[z] = parseFloat((wz[z]||0).toFixed(2));
    });
    return row;
  });

  async function handleExportPDF() {
    const el = printRef.current;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height / canvas.width) * w;
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save(`EON_${athlete.name.replace(/\s/g,'_')}_${formatDate(prescription.raceDate).replace(/\//g,'-')}.pdf`);
  }

  const today = new Date().toISOString().split('T')[0];
  const daysUntilRace = Math.ceil((new Date(prescription.raceDate) - new Date(today)) / (1000*60*60*24));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Action bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => dispatch({ type: 'GO_ATHLETE', athleteId: athlete.id })}
          className="text-sm text-slate-400 hover:text-[#001F3F] transition-colors"
        >
          ← Voltar para {athlete.name.split(' ')[0]}
        </button>
        <button onClick={handleExportPDF} className="btn-primary flex items-center gap-2">
          ↓ Exportar PDF
        </button>
      </div>

      {/* Printable */}
      <div ref={printRef} className="bg-white">
        {/* Hero */}
        <div className="bg-[#001F3F] rounded-2xl p-8 mb-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-[#001F3F] font-black text-xs">EON</span>
                </div>
                <span className="text-blue-300 text-sm font-medium tracking-widest uppercase">Endurance On</span>
              </div>
              <h1 className="text-4xl font-black mb-1">{athlete.name}</h1>
              <p className="text-blue-200 text-lg font-medium">
                {cycle?.name} — {variant?.name}
              </p>
              <div className="flex gap-5 mt-4 text-sm text-blue-200 flex-wrap">
                <span>🏁 Prova: <strong className="text-white">{formatDate(prescription.raceDate)}</strong></span>
                {cycle && <span>{SPORT_ICONS[cycle.sport]} <strong className="text-white capitalize">{cycle.sport}</strong></span>}
                {prescription.goalTime && <span>🎯 Meta: <strong className="text-white">{prescription.goalTime}</strong></span>}
                <span>
                  <strong className="text-white" style={{ color: daysUntilRace < 14 ? '#FCA5A5' : '#fff' }}>
                    {daysUntilRace > 0 ? `${daysUntilRace} dias` : 'Prova passada'}
                  </strong>
                  <span className="ml-1">para a prova</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Semanas', value: prescription.weeks.length },
                { label: 'Sessões', value: totalWorkouts },
                { label: 'Volume', value: `${totalVolume.toFixed(0)} km` },
              ].map(s => (
                <div key={s.label} className="text-center bg-white/10 rounded-xl px-4 py-3">
                  <div className="text-2xl font-black">{s.value}</div>
                  <div className="text-xs text-blue-300 uppercase tracking-wide mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Phase timeline */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">Mapa de Preparação</h2>
          <div className="flex gap-1 mb-3">
            {prescription.weeks.map(w => (
              <div
                key={w.id}
                className="flex-1 h-8 rounded flex items-center justify-center"
                style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}
                title={`S${w.weekNumber} — ${phaseLabels[w.phase] || w.phase} — ${formatDate(w.startDate)}`}
              >
                <span className="text-xs font-bold text-white">{w.weekNumber}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 flex-wrap">
            {phases.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: phaseColors[p.phase] || '#94A3B8' }} />
                <span className="font-semibold" style={{ color: phaseColors[p.phase] || '#94A3B8' }}>{phaseLabels[p.phase] || p.phase}</span>
                <span className="text-slate-400">S{p.start}–S{p.end}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Volume chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">
            Progressão de Volume por Zona
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={zoneData} barSize={prescription.weeks.length > 20 ? 10 : 16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} unit=" km" width={45} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F8FAFC' }} />
              {ZONES.map((z, i) => (
                <Bar key={z} dataKey={z} stackId="a" fill={ZONE_COLORS[z]}
                  radius={i === 6 ? [3,3,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3">
            {ZONES.map(z => {
              const vol = prescription.weeks.reduce((s,w) => {
                const wz = calcWeekZones(w.workouts, state.zoneConfig); return s + (wz[z]||0);
              }, 0);
              if (vol === 0) return null;
              return (
                <div key={z} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: ZONE_COLORS[z] }} />
                  {z.toUpperCase()}: {vol.toFixed(1)} km
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly table */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-xs font-bold text-[#001F3F] uppercase tracking-wide mb-4">Resumo Semanal</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide">Sem</th>
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide">Fase</th>
                  <th className="text-left py-2 text-slate-400 font-semibold uppercase tracking-wide">Data</th>
                  {ZONES.map(z => (
                    <th key={z} className="text-right py-2 font-semibold" style={{ color: ZONE_COLORS[z] }}>
                      {z.toUpperCase()}
                    </th>
                  ))}
                  <th className="text-right py-2 text-[#001F3F] font-bold">Total</th>
                  <th className="text-right py-2 text-slate-400 font-semibold">ESS</th>
                </tr>
              </thead>
              <tbody>
                {prescription.weeks.map(w => {
                  const vol = calcWeekVolume(w.workouts);
                  const stress = calcWeekStress(w.workouts, state.zoneConfig);
                  return (
                    <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 font-bold text-[#001F3F]">{w.weekNumber}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded-full text-white text-xs font-medium"
                          style={{ backgroundColor: phaseColors[w.phase] || '#94A3B8' }}>
                          {phaseLabels[w.phase] || w.phase}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400">{formatDate(w.startDate)}</td>
                      {ZONES.map(z => {
                        const v = calcWeekZones(w.workouts, state.zoneConfig)[z] || 0;
                        return (
                          <td key={z} className="py-2 text-right font-mono"
                            style={{ color: v > 0 ? ZONE_COLORS[z] : '#CBD5E1' }}>
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
                  <td colSpan={3} className="py-3 font-bold text-[#001F3F] text-xs uppercase tracking-wide">Total</td>
                  {ZONES.map(z => {
                    const vol = prescription.weeks.reduce((s,w) => {
                      const wz = calcWeekZones(w.workouts, state.zoneConfig); return s + (wz[z]||0);
                    }, 0);
                    return (
                      <td key={z} className="py-3 text-right font-bold font-mono"
                        style={{ color: ZONE_COLORS[z] }}>
                        {vol > 0 ? vol.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-3 text-right font-black text-[#001F3F]">{totalVolume.toFixed(1)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 py-4 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#001F3F] rounded flex items-center justify-center">
              <span className="text-white font-black" style={{ fontSize: '6px' }}>EON</span>
            </div>
            <span>Endurance On — EON Hub</span>
          </div>
          <span>Coach Guto Fernandes</span>
        </div>
      </div>
    </div>
  );
}
