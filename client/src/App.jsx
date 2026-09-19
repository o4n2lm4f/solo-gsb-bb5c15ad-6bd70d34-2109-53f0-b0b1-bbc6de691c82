import React, { useState } from 'react';
import { postJSON, parseBulk, pretty } from './api.js';
import { DEMO_SAMPLES } from './demo.js';
import SampleList from './components/SampleList.jsx';
import SchemaTree from './components/SchemaTree.jsx';
import ValidatePanel from './components/ValidatePanel.jsx';

let nextId = 1;
const makeSample = (value, name) => ({
  uid: nextId++,
  name: name ?? `样本 ${nextId - 1}`,
  raw: pretty(value),
});

export default function App() {
  const [samples, setSamples] = useState([]);
  const [schema, setSchema] = useState(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [inferring, setInferring] = useState(false);
  const [error, setError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  async function handleInfer() {
    setError('');
    if (samples.length === 0) {
      setError('请先粘贴至少一份 JSON 样本');
      return;
    }
    const parsed = [];
    for (const s of samples) {
      try {
        parsed.push(JSON.parse(s.raw));
      } catch (err) {
        setError(`「${s.name}」不是合法 JSON：${err.message}`);
        return;
      }
    }
    setInferring(true);
    try {
      const result = await postJSON('/api/infer', { samples: parsed });
      setSchema(result.schema);
      setSampleCount(result.sampleCount);
    } catch (err) {
      setError(err.message);
    } finally {
      setInferring(false);
    }
  }

  function loadDemo() {
    setSamples(DEMO_SAMPLES.map((v, i) => makeSample(v, `样本 ${i + 1}`)));
    setSchema(null);
    setError('');
  }

  function addSamples(values) {
    setSamples((prev) => [
      ...prev,
      ...values.map((v, i) => makeSample(v, `样本 ${prev.length + i + 1}`)),
    ]);
    setSchema(null);
  }

  function updateSample(uid, patch) {
    setSamples((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
    setSchema(null);
  }

  function removeSample(uid) {
    setSamples((prev) => prev.filter((s) => s.uid !== uid));
    setSchema(null);
  }

  function clearAll() {
    setSamples([]);
    setSchema(null);
    setError('');
  }

  function handleBulk(text) {
    const values = parseBulk(text);
    addSamples(values);
    setBulkOpen(false);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{'{ }'}</span>
          <div>
            <h1>JSON Contract Studio</h1>
            <p>把零散 JSON 样本归纳成 JSON Schema 2020-12 接口契约</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={loadDemo}>载入示例</button>
          <button
            className="btn ghost"
            onClick={() => setBulkOpen((v) => !v)}
          >
            批量导入
          </button>
          <button className="btn ghost" onClick={clearAll} disabled={!samples.length}>
            清空
          </button>
          <button className="btn primary" onClick={handleInfer} disabled={inferring}>
            {inferring ? '归纳中…' : `归纳 Schema${samples.length ? `（${samples.length} 份）` : ''}`}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {bulkOpen && <BulkPanel onImport={handleBulk} onCancel={() => setBulkOpen(false)} />}

      <main className="layout">
        <section className="pane pane-left">
          <SampleList
            samples={samples}
            onUpdate={updateSample}
            onRemove={removeSample}
            onAdd={() => addSamples([{}])}
          />
        </section>

        <section className="pane pane-right">
          {schema ? (
            <SchemaResult schema={schema} sampleCount={sampleCount} />
          ) : (
            <div className="empty-state">
              <p>在左侧粘贴一份或多份 JSON 样本，点击「归纳 Schema」。</p>
              <p className="muted">
                支持：字段缺失统计、null 合并、异构数组、类型冲突 anyOf、enum/const、
                常见格式识别，并在每个规则上标注来源样本路径。
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function BulkPanel({ onImport, onCancel }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="bulk-panel">
      <div className="bulk-head">
        <strong>批量粘贴样本</strong>
        <span className="muted">
          支持 JSON 数组（<code>{'[{...},{...}]'}</code>）或 NDJSON（每行一个 JSON）
        </span>
      </div>
      <textarea
        className="bulk-input"
        rows={6}
        placeholder={'[\n  {"id": 1, "name": "a"},\n  {"id": 2, "name": "b"}\n]'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <div className="banner error">{err}</div>}
      <div className="bulk-actions">
        <button
          className="btn primary"
          onClick={() => {
            try {
              onImport(text);
              setErr('');
            } catch (e) {
              setErr(e.message);
            }
          }}
        >
          添加为样本
        </button>
        <button className="btn ghost" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function SchemaResult({ schema, sampleCount }) {
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <>
      <div className="result-scroll">
        <div className="result-head">
          <h2>
            归纳结果
            <span className="badge neutral">{sampleCount} 份样本</span>
          </h2>
          <button className="btn ghost small" onClick={() => setRawOpen((v) => !v)}>
            {rawOpen ? '收起原始 JSON' : '查看原始 JSON'}
          </button>
        </div>
        {rawOpen && <pre className="raw-schema">{pretty(schema)}</pre>}
        <SchemaTree schema={schema} />
      </div>
      <ValidatePanel schema={schema} />
    </>
  );
}
