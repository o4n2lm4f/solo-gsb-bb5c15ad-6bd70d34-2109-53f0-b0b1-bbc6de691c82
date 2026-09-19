import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferSchema } from '../src/infer.js';
import { validateSample } from '../src/validator.js';

test('基础对象：字段缺失 => required 省略 + x-presence', () => {
  const { schema } = inferSchema([
    { id: 1, name: 'a', email: 'a@x.com' },
    { id: 2, name: 'b' },
  ]);
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['id', 'name']);
  assert.deepEqual(schema.properties.email['x-presence'], {
    seen: 1,
    total: 2,
    ratio: 0.5,
  });
  assert.equal(schema.properties.id.type, 'integer');
  assert.equal(schema.properties.email.format, 'email');
  assert.equal(schema['$schema'], 'https://json-schema.org/draft/2020-12/schema');
});

test('null + 基础类型 => type 数组 + x-nullable', () => {
  const { schema } = inferSchema([{ v: 'x' }, { v: null }]);
  assert.deepEqual(schema.properties.v.type, ['string', 'null']);
  assert.equal(schema.properties.v['x-nullable'], true);
});

test('null + 对象/数组 => 同样合并为可空 type 数组', () => {
  const obj = inferSchema([{ v: { a: 1 } }, { v: null }]).schema;
  assert.deepEqual(obj.properties.v.type, ['object', 'null']);
  assert.equal(obj.properties.v['x-nullable'], true);
  assert.equal(obj.properties.v.properties.a.type, 'integer');

  const arr = inferSchema([{ v: [1] }, { v: null }]).schema;
  assert.deepEqual(arr.properties.v.type, ['array', 'null']);
  assert.equal(arr.properties.v.items.type, 'integer');
});

test('三种类型并存（含 null）=> anyOf 冲突', () => {
  const { schema } = inferSchema([{ v: 'x' }, { v: 1 }, { v: null }]);
  assert.ok(schema.properties.v.anyOf);
  assert.equal(schema.properties.v['x-conflict'], true);
});

test('integer 与 number 合并为 number', () => {
  const { schema } = inferSchema([{ v: 1 }, { v: 2.5 }]);
  assert.equal(schema.properties.v.type, 'number');
});

test('异构数组：元素类型合并', () => {
  const { schema } = inferSchema([{ list: [1, 'two', null, 3.5, true] }]);
  const items = schema.properties.list.items;
  assert.ok(items.anyOf, '冲突类型应进入 anyOf');
  assert.equal(items['x-conflict'], true);
  const types = items.anyOf.map((b) => b.type).flat();
  assert.ok(types.includes('number'));
  assert.ok(types.includes('string'));
  assert.ok(types.includes('boolean'));
  assert.ok(types.includes('null'));
});

test('异构数组：对象元素合并字段', () => {
  const { schema } = inferSchema([
    { list: [{ a: 1 }, { a: 2, b: 'x' }] },
  ]);
  const items = schema.properties.list.items;
  assert.equal(items.type, 'object');
  assert.deepEqual(items.required, ['a']);
  assert.ok(items.properties.b['x-presence']);
});

test('类型冲突：string vs object => anyOf', () => {
  const { schema } = inferSchema([{ v: 'x' }, { v: { nested: true } }]);
  assert.ok(schema.properties.v.anyOf);
  assert.equal(schema.properties.v['x-conflict'], true);
});

test('enum/const 归纳', () => {
  const enumSchema = inferSchema([
    { s: 'GET' }, { s: 'POST' }, { s: 'GET' },
  ]).schema;
  assert.deepEqual(enumSchema.properties.s.enum.sort(), ['GET', 'POST']);

  const constSchema = inferSchema([{ s: 'HTTP' }, { s: 'HTTP' }]).schema;
  assert.equal(constSchema.properties.s.const, 'HTTP');
});

test('少量且全部不同的值不推断为 enum（避免误判开放域）', () => {
  const { schema } = inferSchema([{ ts: '2026-01-01' }, { ts: '2026-02-02' }]);
  assert.equal(schema.properties.ts.enum, undefined);

  const ints = inferSchema([{ n: 1 }, { n: 2 }, { n: 3 }]).schema;
  assert.equal(ints.properties.n.enum, undefined);
});

test('provenance 标出样本路径（RFC 6901 转义）', () => {
  const { schema } = inferSchema([
    { 'a/b': [{ 'c~d': 1 }] },
    { 'a/b': [{ 'c~d': 2 }] },
  ]);
  const item = schema.properties['a/b'].items;
  assert.deepEqual(
    item.properties['c~d']['x-provenance'],
    [
      { sample: 1, pointer: '/a~1b/0/c~0d', kind: 'integer' },
      { sample: 2, pointer: '/a~1b/0/c~0d', kind: 'integer' },
    ],
  );
});

test('空数组 => items 为空 schema', () => {
  const { schema } = inferSchema([{ list: [] }, { list: [1] }]);
  assert.equal(schema.properties.list.type, 'array');
  assert.equal(schema.properties.list.items.type, 'integer');
  const onlyEmpty = inferSchema([{ list: [] }]).schema;
  assert.deepEqual(onlyEmpty.properties.list.items, {});
});

test('Ajv 按归纳出的 schema 校验，错误含 JSON Pointer', () => {
  const { schema } = inferSchema([{ name: 'a', age: 1 }]);
  const bad = validateSample(schema, { age: 'not-a-number' });
  assert.equal(bad.valid, false);
  const ageErr = bad.errors.find((e) => e.instancePath === '/age');
  assert.ok(ageErr, '应定位到 /age');
  const missing = validateSample(schema, {});
  assert.ok(missing.errors.some((e) => e.instancePath === '' && e.keyword === 'required'));
  const good = validateSample(schema, { name: 'b', age: 2 });
  assert.equal(good.valid, true);
});
