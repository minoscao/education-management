export function whatsappNumber(value: unknown, countryCode = '60'): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || /[^\d\s()+.-]/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!raw.startsWith('+') && digits.startsWith('0')) digits = countryCode + digits.slice(1);
  else if (!raw.startsWith('+') && !digits.startsWith(countryCode)) return null;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function whatsappLink(phone: unknown, message = ''): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}${message.trim() ? '?text=' + encodeURIComponent(message.trim()) : ''}` : null;
}
