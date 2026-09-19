import { useMemo, useState } from "react";
import SampleEditor from "./components/SampleEditor.jsx";
import SchemaTree from "./components/SchemaTree.jsx";
import ValidatePanel from "./components/ValidatePanel.jsx";
import { inferSchema } from "./api.js";
import { DEFAULT_SAMPLES } from "./defaultSamples.js";

function parseSample(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default function App() {
  const [sampleTexts, setSampleTexts] = useState(DEFAULT_SAMPLES);
  const [result, setResult] = useState(null);
  const [inferError, setInferError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("schema");
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const parsed = useMemo(() => sampleTexts.map(parseSample), [sampleTexts]);
  const allValid = parsed.every((p) => p.ok);
  const validCount = parsed.filter((p) => p.ok).length;

  function updateSample(index, text) {
    setSampleTexts((prev) => prev.map((t, i) => (i === index ? text : t)));
  }

  function addSample() {
    setSampleTexts((prev) => [...prev, ""]);
  }

  function removeSample(index) {
    setSampleTexts((prev) => prev.filter((_, i) => i !== index));
  }

  async function runInfer() {
    if (!allValid || parsed.length === 0) return;
    setBusy(true);
    setInferError(null);
    try {
      const data = await inferSchema(parsed.map((p) => p.value));
      setResult(data);
      setTab("schema");
    } catch (e) {
      setInferError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copySchema() {
    if (!result) return;
    const text = JSON.stringify(result.schema, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>JSON 契约工坊</h1>
        <p>
          粘贴多份 JSON 样本，递归归纳出 JSON Schema 2020-12 接口契约；自动处理字段缺失、null、
          异构数组与类型冲突，并可校验新样本。
        </p>
      </header>

      <main className="app__main">
        <section className="panel">
          <div className="panel__head">
            <h2>① 样本输入</h2>
            <span className="panel__meta">
              {validCount}/{sampleTexts.length} 份有效
            </span>
          </div>

          <div className="sample-list">
            {sampleTexts.map((text, i) => (
              <SampleEditor
                key={i}
                index={i}
                value={text}
                parseError={parsed[i].ok ? null : parsed[i].error}
                canRemove={sampleTexts.length > 1}
                onChange={(t) => updateSample(i, t)}
                onRemove={() => removeSample(i)}
              />
            ))}
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={addSample}>
              + 添加样本
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={runInfer}
              disabled={busy || !allValid || sampleTexts.length === 0}
              title={allValid ? "" : "请先修正无效的 JSON 样本"}
            >
              {busy ? "归纳中…" : "归纳 Schema →"}
            </button>
          </div>
          {inferError && <div className="alert alert--err">{inferError}</div>}
        </section>

        <section className="panel">
          <div className="panel__head">
            <div className="tabs">
              <button
                type="button"
                className={`tab ${tab === "schema" ? "tab--active" : ""}`}
                onClick={() => setTab("schema")}
              >
                ② 契约 Schema
              </button>
              <button
                type="button"
                className={`tab ${tab === "validate" ? "tab--active" : ""}`}
                onClick={() => setTab("validate")}
              >
                ③ 校验新样本
              </button>
            </div>
            {result && tab === "schema" && (
              <div className="panel__tools">
                <button type="button" className="btn btn--sm" onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? "树形视图" : "原始 JSON"}
                </button>
                <button type="button" className="btn btn--sm btn--primary" onClick={copySchema}>
                  {copied ? "✓ 已复制" : "复制 Schema"}
                </button>
              </div>
            )}
          </div>

          {tab === "schema" &&
            (result ? (
              <>
                <div className="panel__meta panel__meta--block">
                  基于 {result.sampleCount} 份样本归纳 · 点击节点上的「n 处样本」查看规则对应的样本路径
                </div>
                {showRaw ? (
                  <pre className="schema-raw">{JSON.stringify(result.schema, null, 2)}</pre>
                ) : (
                  <SchemaTree schema={result.schema} paths={result.paths} />
                )}
              </>
            ) : (
              <div className="empty-hint">归纳结果将显示在这里：树形视图 + 样本路径标注。</div>
            ))}

          {tab === "validate" && <ValidatePanel schema={result?.schema} />}
        </section>
      </main>
    </div>
  );
}
