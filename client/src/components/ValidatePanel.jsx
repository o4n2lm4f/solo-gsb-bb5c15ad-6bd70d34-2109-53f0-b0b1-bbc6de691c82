import React, { useState } from 'react';
import { postJSON, copyText } from '../api.js';

export default function ValidatePanel({ schema }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function validate() {
    setError('');
    setResult(null);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      setError(`待校验内容不是合法 JSON：${err.message}`);
      return;
    }
    setRunning(true);
    try {
      const r = await postJSON('/api/validate', { schema, data });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="validate-panel">
      <div className="validate-head">
        <h3>校验新样本</h3>
        <button className="btn primary small" onClick={validate} disabled={running || !text.trim()}>
          {running ? '校验中…' : '运行校验'}
        </button>
      </div>
      <textarea
        className="validate-input"
        rows={5}
        spellCheck={false}
        placeholder='粘贴一份新的 JSON，按归纳出的契约校验'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <div className="banner error">{error}</div>}
      {result && <ValidationResult result={result} />}
    </div>
  );
}

function ValidationResult({ result }) {
  if (result.valid) {
    return (
      <div className="banner success">
        ✓ 校验通过，样本符合契约（{result.errors.length === 0 ? '无错误' : ''}）
      </div>
    );
  }
  return (
    <div className="banner error-block">
      <div className="error-summary">✗ 校验未通过，共 {result.errors.length} 处问题：</div>
      <ul className="error-list">
        {result.errors.map((e, i) => (
          <ErrorRow key={i} err={e} />
        ))}
      </ul>
    </div>
  );
}

function ErrorRow({ err }) {
  const [copied, setCopied] = useState(false);
  const pointer = err.instancePath || '';
  return (
    <li className="error-row">
      <button
        className="pointer-chip"
        title="点击复制 JSON Pointer"
        onClick={async () => {
          await copyText(pointer);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? '已复制' : pointer === '' ? '（根 /）' : pointer}
      </button>
      <span className="error-keyword">{err.keyword}</span>
      <span className="error-message">{err.message}</span>
      <span className="muted small error-params">{summarizeParams(err)}</span>
    </li>
  );
}

function summarizeParams(err) {
  const p = err.params || {};
  if (p.missingProperty) return `缺失属性: ${p.missingProperty}`;
  if (p.allowedValues) return `允许值: ${p.allowedValues.join(', ')}`;
  if (p.allowedTypes) return `期望类型: ${p.allowedTypes}`;
  if (p.passingSchemas) return '';
  return '';
}
