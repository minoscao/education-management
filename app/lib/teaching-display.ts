type TeachingRow = Record<string, unknown>;

export const teachingPalette = {
  chinese: '#2563EB',
  malay: '#DC4C59',
  english: '#7C3AED',
  mixed: '#D97706',
  unknown: '#64748B',
};

export function teachingDisplay(row: TeachingRow) {
  const id = String(row.language_id || '');
  const name = String(row.language_name || '');
  const medium = ['lang-me', 'lang-ms'].includes(id) ? 'malay'
    : ['lang-ce', 'lang-zh'].includes(id) ? 'chinese'
    : /bahasa|malay|马来/i.test(name) ? 'malay'
    : /mandarin|chinese|华语|华文|中文/i.test(name) ? 'chinese'
    : ['lang-en', 'lang-english'].includes(id) || /english|英文|英语/i.test(name) ? 'english' : 'unknown';
  const level = String(row.course_level || row.level || '');
  const title = String(row.course_title || row.title || '');
  const system = String(row.curriculum || '').toLowerCase();
  // L/H are the existing plan's independent-school grades, not subject names.
  const grade = title.match(/\b([GF][1-6]|[LH][1-3])\b/i)?.[1]
    || level.match(/^\s*(?:DuZhong\s*[·:-]\s*)?([GF][1-6]|[LH][1-3])\s*$/i)?.[1];
  const independent = system ? ['independent', 'uec', 'duzhong'].includes(system)
    : Boolean(grade && /^[LH]/i.test(grade)) || /duzhong|uec|独中/i.test(level);
  const group = String(row.cohort_group || '');
  const colour = group in teachingPalette ? teachingPalette[group as keyof typeof teachingPalette] : teachingPalette[medium];
  return { medium, colour, independent, group,
    label: name || 'Teaching language not set' };
}

export function teachingSubject(row: TeachingRow) {
  const subject = String(row.subject || row.course_title || row.title || '');
  if (/math|数学|數學/i.test(subject)) return 'math';
  if (/communication|沟通|溝通/i.test(subject)) return 'communication';
  if (/science|科学|科學/i.test(subject)) return 'science';
  if (/chinese|mandarin|华文|中文|華文/i.test(subject)) return 'chinese';
  if (/bahasa|malay|马来|馬來/i.test(subject)) return 'malay';
  if (/english|英文|英语/i.test(subject)) return 'english';
  if (/music|violin|音乐|音樂/i.test(subject)) return 'music';
  return 'general';
}
