"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../app");

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function post(pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test("GET /api/health", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("POST /api/infer returns schema, paths and count", async () => {
  const { status, data } = await post("/api/infer", {
    samples: [{ id: 1, tag: "x" }, { id: 2 }],
  });
  assert.equal(status, 200);
  assert.equal(data.sampleCount, 2);
  assert.equal(data.schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(data.schema.required, ["id"]);
  assert.equal(typeof data.paths, "object");
});

test("POST /api/infer rejects missing samples", async () => {
  const { status, data } = await post("/api/infer", { samples: [] });
  assert.equal(status, 400);
  assert.match(data.error, /samples/);
});

test("POST /api/validate reports JSON Pointers for errors", async () => {
  const { data: inferred } = await post("/api/infer", {
    samples: [{ id: 1, user: { name: "a" } }],
  });
  const ok = await post("/api/validate", {
    schema: inferred.schema,
    sample: { id: 2, user: { name: "b" } },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.valid, true);
  assert.deepEqual(ok.data.errors, []);

  const bad = await post("/api/validate", {
    schema: inferred.schema,
    sample: { id: "oops", user: {} },
  });
  assert.equal(bad.data.valid, false);
  const paths = bad.data.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ["/id", "/user"]);
  const idErr = bad.data.errors.find((e) => e.path === "/id");
  assert.equal(idErr.keyword, "type");
  assert.equal(idErr.pointer, "/id");
});

test("POST /api/validate rejects an invalid schema", async () => {
  const { status, data } = await post("/api/validate", {
    schema: { type: "not-a-type" },
    sample: 1,
  });
  assert.equal(status, 422);
  assert.match(data.error, /Invalid schema/);
});

test("malformed JSON body gets a JSON 400", async () => {
  const res = await fetch(`${base}/api/infer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test("unknown API route returns JSON 404", async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(data.error);
});
