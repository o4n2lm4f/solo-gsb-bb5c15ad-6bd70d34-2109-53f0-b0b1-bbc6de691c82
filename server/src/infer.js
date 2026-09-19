/**
 * 递归 JSON Schema 2020-12 归纳器。
 *
 * 输入任意 JSON 值集合，自底向上合并观察结果：
 * - 字段缺失：属性出现次数低于对象观察次数 => required 中省略，并打 x-presence
 * - null：与单个基础类型合并为 "type": ["string", "null"]；与复杂类型并列走 anyOf
 * - 异构数组：所有元素合并进同一个 items
 * - 类型冲突：无法归一的类型进入 anyOf，打 x-conflict 标记
 *
 * 每个节点附带 provenance（规则对应的样本路径）：
 *   { sample: 样本序号(从1开始), pointer: RFC 6901 JSON Pointer, kind: 观察类型 }
 * 输出时以自定义关键字 x-provenance 挂在 schema 节点上（Ajv strict:false 可容忍）。
 */

const PROV_LIMIT = 200; // 单节点样本路径上限，超出只保留总数

// ---- 状态结构 ---------------------------------------------------------------

function scalarState(kind) {
  return { kind, count: 0, values: new Map(), distinct: 0, overflow: false };
}

function newNode() {
  return {
    kinds: Object.create(null),
    prov: [], // [{sample, pointer, kind}]
    provTotal: 0,
  };
}

function getKindState(node, kind) {
  switch (kind) {
    case 'null':
      return (node.kinds.null ??= { kind: 'null', count: 0 });
    case 'boolean':
      return (node.kinds.boolean ??= { kind: 'boolean', count: 0 });
    case 'integer':
      return (node.kinds.integer ??= scalarState('integer'));
    case 'number':
      return (node.kinds.number ??= scalarState('number'));
    case 'string':
      return (node.kinds.string ??= scalarState('string'));
    case 'array':
      return (node.kinds.array ??= { kind: 'array', count: 0, items: newNode() });
    case 'object':
      return (node.kinds.object ??= {
        kind: 'object',
        count: 0,
        props: new Map(),
      });
    default:
      throw new Error(`未知类型: ${kind}`);
  }
}

// ---- 观察 --------------------------------------------------------------------

function detectStringFormat(s) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    return 'date-time';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return 'uuid';
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email';
  return undefined;
}

function recordScalar(state, value) {
  state.count += 1;
  const entry = state.values.get(value);
  if (entry) {
    entry.count += 1;
  } else if (state.values.size < 20) {
    state.values.set(value, { value, count: 1 });
    state.distinct += 1;
  } else {
    state.overflow = true; // 不同值过多，不再尝试 enum
  }
}

/** 把一个 JSON 值观察进节点。loc 为该值所在的样本位置。 */
function observe(node, value, loc) {
  node.provTotal += 1;

  if (value === null) {
    getKindState(node, 'null').count += 1;
    pushProv(node, loc, 'null');
    return;
  }

  const jsType = typeof value;

  if (jsType === 'boolean') {
    getKindState(node, 'boolean').count += 1;
    pushProv(node, loc, 'boolean');
    return;
  }

  if (jsType === 'number') {
    const kind = Number.isInteger(value) ? 'integer' : 'number';
    recordScalar(getKindState(node, kind), value);
    pushProv(node, loc, kind);
    return;
  }

  if (jsType === 'string') {
    const state = getKindState(node, 'string');
    recordScalar(state, value);
    if (state.count === 1) state.format = detectStringFormat(value);
    else if (state.format && state.format !== detectStringFormat(value)) {
      state.format = undefined; // 格式不一致则不下结论
    }
    pushProv(node, loc, 'string');
    return;
  }

  if (Array.isArray(value)) {
    const state = getKindState(node, 'array');
    state.count += 1;
    pushProv(node, loc, 'array');
    value.forEach((item, i) => {
      observe(state.items, item, {
        sample: loc.sample,
        pointer: `${loc.pointer}/${i}`,
      });
    });
    return;
  }

  if (jsType === 'object') {
    const state = getKindState(node, 'object');
    state.count += 1;
    pushProv(node, loc, 'object');
    for (const [key, child] of Object.entries(value)) {
      let prop = state.props.get(key);
      if (!prop) {
        prop = { key, node: newNode(), seen: 0 };
        state.props.set(key, prop);
      }
      prop.seen += 1;
      observe(prop.node, child, {
        sample: loc.sample,
        pointer: `${loc.pointer}/${escapeToken(key)}`,
      });
    }
    return;
  }

  throw new Error(`不支持的值类型: ${jsType}`);
}

function pushProv(node, loc, kind) {
  if (node.prov.length < PROV_LIMIT) {
    node.prov.push({ sample: loc.sample, pointer: loc.pointer, kind });
  }
}

function escapeToken(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

// ---- 序列化 ------------------------------------------------------------------

const KIND_ORDER = ['object', 'array', 'string', 'number', 'boolean', 'null'];

/** 参与合并的有效 kind：integer 与 number 共存时 integer 并入 number */
function effectiveKinds(node) {
  const present = KIND_ORDER.filter((k) => node.kinds[k]);
  if (node.kinds.integer && node.kinds.number) {
    return present.filter((k) => k !== 'integer');
  }
  if (node.kinds.integer && !node.kinds.number) {
    return [...present.filter((k) => k !== 'integer'), 'integer'];
  }
  return present;
}

/** 属于某个有效 kind 的全部观察次数（number 含 integer） */
function kindCount(node, kind) {
  if (kind === 'number') {
    return (node.kinds.number?.count ?? 0) + (node.kinds.integer?.count ?? 0);
  }
  return node.kinds[kind]?.count ?? 0;
}

function provenanceFor(node, kind) {
  if (kind === 'number') {
    return node.prov.filter((p) => p.kind === 'number' || p.kind === 'integer');
  }
  return node.prov.filter((p) => p.kind === kind);
}

function attachProv(schema, node, kind) {
  const list = provenanceFor(node, kind);
  if (list.length) schema['x-provenance'] = list;
  schema['x-prov-total'] = kindCount(node, kind);
  return schema;
}

/** enum/const 归纳；state 可以是 integer 与 number 合并后的视图 */
function enumAnnotations(state) {
  if (state.overflow || state.count < 2 || state.distinct === 0) return {};
  if (state.distinct === 1) {
    return { const: state.values.values().next().value.value };
  }
  // 只有观察到「重复值」才认为是封闭枚举，避免把少量不同样本误判成 enum
  if (state.distinct < state.count && state.count >= 3 && state.distinct <= 5) {
    const entries = [...state.values.values()].sort((a, b) =>
      a.value < b.value ? -1 : a.value > b.value ? 1 : 0,
    );
    return { enum: entries.map((e) => e.value) };
  }
  return {};
}

/** 合并 integer + number 两个状态为一个 number 视图（用于 enum 归纳） */
function mergedNumberState(node) {
  const values = new Map();
  for (const state of [node.kinds.integer, node.kinds.number].filter(Boolean)) {
    for (const [value, entry] of state.values) {
      const existing = values.get(value);
      if (existing) existing.count += entry.count;
      else values.set(value, { value, count: entry.count });
    }
  }
  const intState = node.kinds.integer;
  const numState = node.kinds.number;
  return {
    kind: 'number',
    count: kindCount(node, 'number'),
    values,
    distinct: values.size,
    overflow: (intState?.overflow || numState?.overflow) ?? false,
  };
}

function serializeKind(node, kind) {
  switch (kind) {
    case 'null':
    case 'boolean':
      return attachProv({ type: kind }, node, kind);

    case 'integer':
      return attachProv(
        { type: 'integer', ...enumAnnotations(node.kinds.integer) },
        node,
        kind,
      );

    case 'number': {
      const state = node.kinds.number && node.kinds.integer
        ? mergedNumberState(node)
        : node.kinds.number;
      return attachProv({ type: 'number', ...enumAnnotations(state) }, node, kind);
    }

    case 'string': {
      const state = node.kinds.string;
      const schema = { type: 'string' };
      if (state.format) {
        schema.format = state.format;
        // 已识别为开放格式（邮箱/日期/UUID 等）时不再叠加 enum/const
        return attachProv(schema, node, kind);
      }
      return attachProv({ ...schema, ...enumAnnotations(state) }, node, kind);
    }

    case 'array': {
      const state = node.kinds.array;
      const schema = {
        type: 'array',
        items: state.items.provTotal ? serializeNode(state.items) : {},
      };
      return attachProv(schema, node, kind);
    }

    case 'object': {
      const state = node.kinds.object;
      const schema = {
        type: 'object',
        properties: {},
        additionalProperties: false,
      };
      const required = [];
      const props = [...state.props.values()].sort((a, b) => a.key.localeCompare(b.key));
      for (const prop of props) {
        const child = serializeNode(prop.node);
        if (prop.seen < state.count) {
          child['x-presence'] = {
            seen: prop.seen,
            total: state.count,
            ratio: Number((prop.seen / state.count).toFixed(3)),
          };
        }
        schema.properties[prop.key] = child;
        if (prop.seen === state.count) required.push(prop.key);
      }
      if (required.length) schema.required = required.sort();
      return attachProv(schema, node, kind);
    }

    default:
      throw new Error(`无法序列化 kind: ${kind}`);
  }
}

/** 把节点序列化为 JSON Schema 片段；root 节点补 $schema */
function serializeNode(node, root = false) {
  const kinds = effectiveKinds(node);
  let schema;

  if (kinds.length === 1) {
    schema = serializeKind(node, kinds[0]);
  } else if (kinds.length === 2 && kinds.includes('null')) {
    // null + 任意单个其它类型（含 object/array）：用 type 数组表达可空
    const base = kinds.find((k) => k !== 'null');
    const inner = serializeKind(node, base);
    schema = {
      ...inner,
      type: [base, 'null'],
      'x-nullable': true,
      'x-provenance': [
        ...(inner['x-provenance'] ?? []),
        ...provenanceFor(node, 'null'),
      ],
      'x-prov-total': node.provTotal,
    };
  } else {
    // 真正的类型冲突：多个非空类型（或已有可空类型又混入其它类型）：anyOf
    schema = {
      anyOf: kinds.map((k) => serializeKind(node, k)),
      'x-conflict': true,
    };
  }

  if (node.provTotal > node.prov.length) {
    schema['x-prov-truncated'] = true;
  }
  if (root) {
    schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  }
  return schema;
}

// ---- 入口 --------------------------------------------------------------------

/**
 * 从多份样本归纳 schema。
 * @param {unknown[]} samples 已解析的 JSON 值（非空数组）
 * @returns {{ schema: object, sampleCount: number }}
 */
export function inferSchema(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('至少需要一份样本');
  }
  const root = newNode();
  samples.forEach((value, idx) => {
    observe(root, value, { sample: idx + 1, pointer: '' });
  });
  return { schema: serializeNode(root, true), sampleCount: samples.length };
}
