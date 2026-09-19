import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// 关闭 strict：归纳产物带 x-* 自定义关键字（provenance / presence 等）
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// 简单 LRU：避免为每次校验重新编译 schema
const cache = new Map();
const CACHE_MAX = 50;

function getValidator(schema) {
  const key = JSON.stringify(schema);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const validate = ajv.compile(schema);
  cache.set(key, validate);
  if (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  return validate;
}

/**
 * 用 schema 校验单个样本。
 * @returns {{ valid: boolean, errors: Array<{instancePath:string, schemaPath:string, message:string, keyword:string, params:object}> }}
 */
export function validateSample(schema, data) {
  const validate = getValidator(schema);
  const valid = validate(data);
  if (valid) return { valid: true, errors: [] };

  // anyOf/oneOf 失败时 Ajv 会列出每个分支内部的全部错误，噪声很大；
  // 对同一 instancePath，只保留 anyOf/oneOf 本身的摘要错误，过滤其分支子错误。
  const raw = validate.errors ?? [];
  const compositePaths = new Set(
    raw
      .filter((e) => e.keyword === 'anyOf' || e.keyword === 'oneOf')
      .map((e) => e.instancePath || ''),
  );
  const filtered = raw.filter((e) => {
    const inCompositeBranch =
      (e.keyword !== 'anyOf' && e.keyword !== 'oneOf') &&
      compositePaths.has(e.instancePath || '');
    return !inCompositeBranch;
  });

  return {
    valid: false,
    errors: filtered.map((e) => ({
      instancePath: e.instancePath || '', // 已是 JSON Pointer 形式（如 /items/0/name）
      schemaPath: e.schemaPath,
      keyword: e.keyword,
      message: e.message ?? '校验失败',
      params: e.params ?? {},
    })),
  };
}
