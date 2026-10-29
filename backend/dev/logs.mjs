/* global Buffer */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { StringDecoder } from 'node:string_decoder';

export function createLogs({ file, limit = 500, maxBytes = 2 * 1024 * 1024, secrets = [] } = {}) {
  let sequence = 0;
  const entries = [];
  let diskError = null;
  const redact = (input) => {
    let value = stripVTControlCharacters(String(input)).replace(/[\r\0]/g, '');
    for (const secret of secrets) if (secret && secret.length >= 4) value = value.split(secret).join('[REDACTED]');
    return value.replace(/(\w+:\/\/[^\s:/]+:)[^@\s]+@/g, '$1[REDACTED]@')
      .replace(/("?(?:password|passwordHash|authorization|cookie|set-cookie|token|secretAccessKey|accessKeyId)"?\s*[:=]\s*)("(?:\\.|[^"\\])*"|[^\s,;}]+)/gi, '$1"[REDACTED]"')
      .slice(0, 2000);
  };
  function add(service, level, message, kind = 'output') {
    const entry = { id: ++sequence, at: new Date().toISOString(), service, level, kind, message: redact(message) };
    entries.push(entry);
    if (entries.length > limit) entries.shift();
    if (file) try {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && statSync(file).size > maxBytes) {
        rmSync(`${file}.1`, { force: true });
        renameSync(file, `${file}.1`);
      }
      appendFileSync(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    } catch { diskError = 'Không ghi được file chẩn đoán. Kiểm tra dung lượng và quyền thư mục backend/tmp.'; }
    return entry;
  }
  function capture(service, stream, stderr = false) {
    if (!stream) return;
    const decoder = new StringDecoder('utf8');
    let pending = '';
    const line = (text) => {
      if (!text.trim()) return;
      let level = stderr ? 'WARN' : 'INFO';
      if (/^I\d{4}/.test(text)) level = 'INFO';
      else if (/^W\d{4}/.test(text)) level = 'WARN';
      else if (/^[EF]\d{4}/.test(text)) level = 'ERROR';
      try { const json = JSON.parse(text); if (json.level >= 50) level = 'ERROR'; else if (json.level >= 40) level = 'WARN'; else level = 'INFO'; }
      catch { if (!/^[IWEF]\d{4}/.test(text)) { if (/\b(error|fatal|failed|panic|lỗi)\b/i.test(text)) level = 'ERROR'; else if (/\bwarn(?:ing)?\b/i.test(text)) level = 'WARN'; } }
      add(service, level, text);
    };
    stream.on('data', (chunk) => {
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      let index;
      while ((index = pending.indexOf('\n')) >= 0) { line(pending.slice(0, index)); pending = pending.slice(index + 1); }
      if (pending.length > 4000) { line(pending.slice(0, 2000)); pending = ''; }
    });
    stream.on('end', () => { pending += decoder.end(); if (pending) line(pending); pending = ''; });
  }
  return { add, capture, redact, snapshot: () => [...entries], diskError: () => diskError };
}
