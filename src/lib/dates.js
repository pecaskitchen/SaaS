export function formatOrderDate(value) {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 19);
}
