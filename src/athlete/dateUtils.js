// ── Date helpers (sem dependências) ────────────────────────────────────────────

export function toISODate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso) {
  // Construir Date local ao meio-dia evita time-zone off-by-one
  return new Date(iso + 'T12:00:00');
}

export function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

// Retorna segunda-feira como início da semana
export function startOfWeek(d) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=dom .. 6=sab
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dt, diff);
}

export function endOfWeek(d) {
  return addDays(startOfWeek(d), 6);
}

export function isSameDay(a, b) {
  return toISODate(a) === toISODate(b);
}

export function isToday(d) {
  return isSameDay(d, new Date());
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const FULL_WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function weekDayLabel(d, full = false) {
  const day = new Date(d).getDay();
  const idx = day === 0 ? 6 : day - 1;
  return (full ? FULL_WEEK_DAYS : WEEK_DAYS)[idx];
}

export function monthLabel(d) {
  return MONTHS[new Date(d).getMonth()];
}

export function formatLongDate(d) {
  const dt = new Date(d);
  return `${weekDayLabel(dt, true)}, ${dt.getDate()} de ${monthLabel(dt)}`;
}

export function formatShortDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
