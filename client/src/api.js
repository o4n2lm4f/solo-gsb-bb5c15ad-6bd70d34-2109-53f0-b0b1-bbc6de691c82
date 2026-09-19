export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `请求失败 (${res.status})`);
  }
  return json;
}

/**
 * 解析批量粘贴的样本：
 * - 整体是 JSON 数组 => 数组元素逐条作为样本
 * - 否则按 NDJSON / 多行处理，每行一个 JSON
 */
export function parseBulk(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('内容为空');

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('JSON 数组形式需以 [ 开始');
    return parsed;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`第 ${i + 1} 行不是合法 JSON: ${err.message}`);
    }
  });
}

/** 格式化的 JSON 文本（失败时返回原文） */
export function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
