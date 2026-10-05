export function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;
  for (let index = 0; index < String(line || '').length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

export function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(columns, rows) {
  return [
    columns.join(','),
    ...(rows || []).map((row) => columns.map((column) => csvEscape(row[column] ?? '')).join(',')),
  ].join('\n');
}

export function downloadTextFile(filename, text, type = 'text/csv;charset=utf-8;') {
  const needsBom = String(type).includes('text/csv');
  const blob = new Blob([needsBom ? '\uFEFF' : '', text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseGenericCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = headers.reduce((result, header, index) => {
      result[header] = values[index] ?? '';
      return result;
    }, {});
    row.__line = rowIndex + 2;
    return row;
  });
}
