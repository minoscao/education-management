type Row = Record<string, unknown>;

export function findResourceConflicts(source: Row[], idKey: string, nameKey: string, kind: string) {
  const groups = new Map<unknown, { row: Row; start: number; end: number }[]>();
  for (const row of source) {
    if (!row[idKey] || row.status === 'cancelled') continue;
    const start = Date.parse(String(row.starts_at).replace(' ', 'T'));
    const end = Date.parse(String(row.ends_at).replace(' ', 'T'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
    const group = groups.get(row[idKey]) ?? [];
    group.push({ row, start, end });
    groups.set(row[idKey], group);
  }
  const conflicts: Row[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.start - b.start);
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      for (let j = i + 1; j < group.length && group[j].start < a.end; j++) {
        const b = group[j];
        if (a.row.class_session_id && a.row.class_session_id === b.row.class_session_id) continue;
        conflicts.push({ kind, resource: a.row[nameKey], first: a.row.course_title, second: b.row.course_title, starts_at: a.row.starts_at });
      }
    }
  }
  return conflicts;
}
