import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'public', 'index.html');

export default function handler(req, res) {
  try {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  return res.status(200).send(html);
  } catch (err) {
    console.error('[api/index] Error:', err.message);
    return res.status(500).send('<h1>Artum 8 Labs — Audit Widget</h1><p>Service ready.</p>');
  }
}
