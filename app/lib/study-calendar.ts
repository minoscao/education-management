type Row = Record<string, unknown>;
export function studySlots(room: Row) {
  try {
    const slots = JSON.parse(String(room.resources)).studySlots;
    if (!Array.isArray(slots)) return [];
    return slots.filter((slot: { label: string; from: string; until: string }) =>
      typeof slot.label === 'string' && /^\d{2}:\d{2}$/.test(slot.from) && /^\d{2}:\d{2}$/.test(slot.until) && slot.from < slot.until,
    ) as { label: string; from: string; until: string }[];
  } catch { return []; }
}

export function studySeats(room: Row, bookings: Row[], start: string, end: string) {
  const active = bookings.filter(booking => booking.classroom_id === room.id && ['booked', 'present'].includes(String(booking.status)) && String(booking.starts_at) < end && String(booking.ends_at) > start);
  return Math.max(0, Number(room.capacity) - active.length);
}
