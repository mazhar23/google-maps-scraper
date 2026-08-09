import fs from 'fs';
import path from 'path';

const WIDGET_PATH = path.join(process.cwd(), 'public', 'audit-widget.js');

export default function handler(req, res) {
  try {
    const script = fs.readFileSync(WIDGET_PATH, 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  return res.status(200).send(script);
  } catch (err) {
    console.error('[api/widget] Error:', err.message);
    return res.status(500).send('console.error("Widget file not found")');
  }
}
