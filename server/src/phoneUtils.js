/** +79991234567 / 89991234567 → 79991234567 */
function normalizePhone(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    digits = `7${digits}`;
  }
  if (digits.length === 11 && !digits.startsWith('7')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

function isValidRuPhone(phone) {
  const normalized = normalizePhone(phone);
  return normalized.length === 11 && normalized.startsWith('7');
}

function staffPlaceholderEmail(phone) {
  return `${normalizePhone(phone)}@users.pvzpersonal.ru`;
}

module.exports = { normalizePhone, isValidRuPhone, staffPlaceholderEmail };
