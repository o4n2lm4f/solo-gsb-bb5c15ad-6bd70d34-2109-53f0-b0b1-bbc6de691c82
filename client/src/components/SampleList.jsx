import React, { useState } from 'react';

export default function SampleList({ samples, onUpdate, onRemove, onAdd }) {
  if (samples.length === 0) {
    return (
      <div className="empty-state">
        <p>还没有样本。</p>
        <button className="btn primary" onClick={onAdd}>+ 添加一份空样本</button>
        <p className="muted">或使用顶部「批量导入」「载入示例」。</p>
      </div>
    );
  }

  return (
    <div className="sample-list">
      {samples.map((s, i) => (
        <SampleCard
          key={s.uid}
          sample={s}
          index={i}
          onUpdate={(patch) => onUpdate(s.uid, patch)}
          onRemove={() => onRemove(s.uid)}
        />
      ))}
      <button className="btn dashed" onClick={onAdd}>+ 添加样本</button>
    </div>
  );
}

function SampleCard({ sample, index, onUpdate, onRemove }) {
  const [open, setOpen] = useState(true);
  let valid = true;
  try {
    JSON.parse(sample.raw);
  } catch {
    valid = false;
  }

  return (
    <div className={`sample-card ${valid ? '' : 'invalid'}`}>
      <div className="sample-card-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <input
          className="sample-name"
          value={sample.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
        <span className={`dot ${valid ? 'ok' : 'bad'}`} title={valid ? '合法 JSON' : '非法 JSON'} />
        <span className="sample-index">#{index + 1}</span>
        <button
          className="icon-btn"
          title="删除该样本"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <textarea
          className={`sample-editor ${valid ? '' : 'has-error'}`}
          rows={8}
          spellCheck={false}
          value={sample.raw}
          onChange={(e) => onUpdate({ raw: e.target.value })}
          placeholder='{"key": "value"}'
        />
      )}
    </div>
  );
}
