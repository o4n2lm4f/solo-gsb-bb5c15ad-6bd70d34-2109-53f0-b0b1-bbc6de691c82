import React, { useState } from 'react';
import { copyText } from '../api.js';

export default function SchemaTree({ schema }) {
  return (
    <div className="schema-tree">
      <NodeView name="(root)" schema={schema} depth={0} root />
    </div>
  );
}

const KIND_LABEL = {
  object: 'object',
  array: 'array',
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  null: 'null',
};

function typeBadges(schema) {
  const t = schema.type;
  if (Array.isArray(t)) return t.map((x) => KIND_LABEL[x] ?? x);
  if (typeof t === 'string') return [KIND_LABEL[t] ?? t];
  return [];
}

function NodeView({ name, schema, depth, root, required }) {
  const [open, setOpen] = useState(true);
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  const isObject = types.includes('object');
  const isArray = types.includes('array');
  const isConflict = !!schema.anyOf;
  const expandable = isObject || isArray || isConflict;

  const presence = schema['x-presence'];
  const nullable = schema['x-nullable'];

  return (
    <div className="node" style={{ marginLeft: depth ? 16 : 0 }}>
      <div className={`node-row ${isConflict ? 'conflict' : ''}`}>
        {expandable ? (
          <button className="chev-btn" onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="chev-spacer" />
        )}

        <span className={`node-name ${root ? 'root-name' : ''}`}>
          {required && <span className="required-mark" title="必填字段">*</span>}
          {name}
        </span>

        {typeBadges(schema).map((t) => (
          <span key={t} className={`badge type-${t}`}>{t}</span>
        ))}

        {isConflict && <span className="badge warn" title="类型无法归一，使用 anyOf">类型冲突 anyOf</span>}
        {nullable && <span className="badge nullable" title="允许为 null">nullable</span>}
        {schema.format && <span className="badge fmt" title="format">format: {schema.format}</span>}
        {'const' in schema && <span className="badge enum">const {JSON.stringify(schema.const)}</span>}
        {schema.enum && (
          <span className="badge enum" title="枚举值">
            enum {schema.enum.map((v) => JSON.stringify(v)).join(' | ')}
          </span>
        )}
        {isObject && (
          <span className="muted small">
            {Object.keys(schema.properties ?? {}).length} 字段
            {Array.isArray(schema.required) && schema.required.length > 0
              ? ` · ${schema.required.length} 必填`
              : ''}
          </span>
        )}
        {isArray && <span className="muted small">items</span>}
        {presence && (
          <span
            className="badge presence"
            title={`在 ${presence.total} 个同类对象中出现 ${presence.seen} 次`}
          >
            出现 {presence.seen}/{presence.total}
          </span>
        )}
      </div>

      <Provenance prov={schema['x-provenance']} total={schema['x-prov-total']} truncated={schema['x-prov-truncated']} />

      {open && expandable && (
        <div className="node-children">
          {isObject && <ObjectChildren schema={schema} />}
          {isArray && <ArrayItems schema={schema} />}
          {isConflict && (
            <>
              {schema.anyOf.map((branch, i) => (
                <NodeView
                  key={i}
                  name={`anyOf[${i}]`}
                  schema={branch}
                  depth={depth + 1}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ObjectChildren({ schema }) {
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties ?? {});
  entries.sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return <div className="muted small hint">无已观察到的字段</div>;
  }
  return entries.map(([key, child]) => (
    <NodeView
      key={key}
      name={key}
      schema={child}
      depth={0}
      required={required.has(key)}
    />
  ));
}

function ArrayItems({ schema }) {
  if (!schema.items || Object.keys(schema.items).length === 0) {
    return <div className="muted small hint">所有样本中均为空数组，items 未约束</div>;
  }
  return <NodeView name="[*]" schema={schema.items} depth={0} />;
}

const KIND_COLORS = {
  object: '#d2a8ff',
  array: '#79c0ff',
  string: '#a5d6ff',
  number: '#f2cc60',
  integer: '#e3b341',
  boolean: '#7ee787',
  null: '#8b949e',
};

function Provenance({ prov, total, truncated }) {
  const [copied, setCopied] = useState('');
  if (!prov || prov.length === 0) return null;

  // 按 kind 分组
  const groups = new Map();
  for (const p of prov) {
    const list = groups.get(p.kind) ?? [];
    list.push(p);
    groups.set(p.kind, list);
  }

  const shown = prov.slice(0, 24);

  async function handleCopy(pointer) {
    await copyText(pointer || '');
    setCopied(pointer);
    setTimeout(() => setCopied(''), 1200);
  }

  return (
    <div className="prov">
      <span className="prov-label">
        样本路径
        {typeof total === 'number' && <span className="muted"> · {total} 条观察</span>}
        {truncated && <span className="muted"> · 已截断</span>}：
      </span>
      <div className="prov-groups">
        {[...groups.entries()].map(([kind, list]) => (
          <span
            key={kind}
            className="prov-kind"
            style={{ borderColor: KIND_COLORS[kind] ?? '#888' }}
            title={`类型: ${kind}`}
          >
            <i style={{ background: KIND_COLORS[kind] ?? '#888' }} />
            {kind} ×{list.length}
          </span>
        ))}
      </div>
      <div className="prov-chips">
        {shown.map((p, i) => (
          <button
            key={`${p.sample}-${p.pointer}-${i}`}
            className="prov-chip"
            title={`样本 #${p.pointer === '' ? p.sample : p.sample}：点击复制 JSON Pointer`}
            onClick={() => handleCopy(p.pointer)}
          >
            <span className="chip-sample">#{p.sample}</span>
            <span className="chip-pointer">{p.pointer === '' ? '（根）' : p.pointer}</span>
            {copied === p.pointer && <span className="chip-copied">已复制</span>}
          </button>
        ))}
        {prov.length > shown.length && <span className="muted small">…还有 {prov.length - shown.length} 条</span>}
      </div>
    </div>
  );
}
