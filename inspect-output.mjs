const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
(async () => {
  const files = fs.readdirSync('output').filter(f=>f.endsWith('.xlsx')).sort().reverse();
  const file = path.join('output', files[0]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Leads');
  console.log('sheet', ws.title, 'rows', ws.rowCount, 'cols', ws.columnCount);
  const headers = ws.getRow(1).values.slice(1).map(v => String(v || '').trim()).filter(Boolean);
  console.log('headers', headers.join(', '));
  for (let i = 2; i <= Math.min(4, ws.rowCount); i++) {
    const row = ws.getRow(i).values.slice(1).map(v => typeof v === 'string' ? v.slice(0,45) : v);
    console.log('row', i-1, row.join(' | '));
  }
})();
