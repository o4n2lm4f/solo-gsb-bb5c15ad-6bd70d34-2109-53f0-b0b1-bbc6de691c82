import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferSchema } from './infer.js';
import { validateSample } from './validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'json-contract-studio' });
});

// POST /api/infer { samples: [anyJson, ...] }
app.post('/api/infer', (req, res) => {
  const samples = req.body?.samples;
  if (!Array.isArray(samples) || samples.length === 0) {
    return res.status(400).json({
      error: '请求体需要包含非空 samples 数组，例如 { "samples": [{...}, {...}] }',
    });
  }
  try {
    const result = inferSchema(samples);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/validate { schema: {...}, data: anyJson }
app.post('/api/validate', (req, res) => {
  const { schema, data } = req.body ?? {};
  if (!schema || typeof schema !== 'object') {
    return res.status(400).json({ error: '请求体需要包含 schema 对象' });
  }
  if (!('data' in req.body)) {
    return res.status(400).json({ error: '请求体需要包含 data 字段（待校验样本）' });
  }
  try {
    res.json(validateSample(schema, data));
  } catch (err) {
    res.status(400).json({ error: `Schema 无法编译: ${err.message}` });
  }
});

// 生产环境：托管 React 构建产物
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`JSON Contract Studio 已启动: http://localhost:${PORT}`);
});
