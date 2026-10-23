import { client, register, form, pdf, office, hash, check, rows } from './client.mjs';
const call = client(); await register(call, 'upload');
const max = 52_428_800;
const large = Buffer.alloc(max, 0x20); pdf.copy(large);
const cases = [
  ['PDF', pdf, 'a.pdf', 201], ['DOCX', office('docx'), 'a.docx', 201], ['PPTX', office('pptx'), 'a.pptx', 201],
  ['50 MiB boundary', large, 'max.pdf', 201], ['50 MiB + 1', Buffer.concat([large, Buffer.alloc(1)]), 'over.pdf', 413],
  ['fake PDF', Buffer.from('fake'), 'fake.pdf', 415], ['fake DOCX', Buffer.from('fake'), 'fake.docx', 415], ['fake PPTX', Buffer.from('fake'), 'fake.pptx', 415],
  ['empty', Buffer.alloc(0), 'empty.pdf', 400], ['Vietnamese filename', pdf, 'Đề cương Giải tích 1.pdf', 201],
];
for (const [name, bytes, filename, status] of cases) {
  const res = await call('POST', '/api/documents', form(bytes, filename));
  check(name, res.status, status);
  if (status !== 201) {
    check(`${name} error`, res.error.code, status === 413 ? 'FILE_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_FILE_TYPE' : 'VALIDATION_ERROR');
    if (status === 400) check('empty issue', res.error.details[0].issue, 'EMPTY_FILE');
    continue;
  }
  try {
    check(`${name} byte size`, res.data.sizeBytes, bytes.length);
    check(`${name} filename`, res.data.originalFilename, filename);
    const download = await call('GET', `/api/documents/${res.data.id}/download`);
    check(`${name} download`, download.status, 200);
    check(`${name} SHA-256`, hash(download.bytes), hash(bytes));
  } finally { check(`${name} cleanup`, (await call('DELETE', `/api/documents/${res.data.id}`)).status, 204); }
}
console.table(rows); console.log(`PASS ${rows.length} upload/download checks`);
