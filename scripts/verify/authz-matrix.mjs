import { client, register, upload, form, pdf, marker, check, rows } from './client.mjs';

const guest = client(), a = client(), b = client();
const users = { A: await register(a, 'A'), B: await register(b, 'B') };
const docs = [];
try {
  for (const [owner, call] of [['A', a], ['B', b]]) {
    for (const visibility of ['PUBLIC', 'PRIVATE']) docs.push({ ...(await upload(call, visibility)), owner, call });
  }
  const identities = [['Guest', guest], ['A', a], ['B', b]];
  for (const [role, call] of identities) {
    const search = await call('GET', `/api/documents?q=${marker}`);
    check(`${role} search HTTP`, search.status, 200);
    check(`${role} search excludes every private document (including own)`, search.data.items.map((d) => d.id).sort(), docs.filter((d) => d.visibility === 'PUBLIC').map((d) => d.id).sort());
    const mine = await call('GET', `/api/documents/mine?q=${marker}`);
    check(`${role} mine HTTP`, mine.status, role === 'Guest' ? 401 : 200);
    if (role !== 'Guest') check(`${role} mine ownership`, mine.data.items.map((d) => d.owner.id), [users[role].id, users[role].id]);
    for (const doc of docs) {
      const own = doc.owner === role, pub = doc.visibility === 'PUBLIC';
      const prefix = `${role} → ${doc.owner}/${doc.visibility}`;
      check(`${prefix} metadata`, (await call('GET', `/api/documents/${doc.id}`)).status, own || pub ? 200 : 404);
      check(`${prefix} download`, (await call('GET', `/api/documents/${doc.id}/download`)).status, role === 'Guest' ? 401 : own || pub ? 200 : 404);
      if (!own) {
        const expected = role === 'Guest' ? 401 : pub ? 403 : 404;
        check(`${prefix} metadata edit`, (await call('PATCH', `/api/documents/${doc.id}`, { title: marker })).status, expected);
        const body = new FormData(); body.set('file', new Blob([pdf]), 'new.pdf');
        check(`${prefix} replace`, (await call('PUT', `/api/documents/${doc.id}/file`, body)).status, expected);
        check(`${prefix} delete`, (await call('DELETE', `/api/documents/${doc.id}`)).status, expected);
      }
    }
  }
  check('Guest upload', (await guest('POST', '/api/documents', form())).status, 401);
  for (const doc of docs) {
    for (const visibility of ['PRIVATE', 'PUBLIC']) check(`${doc.owner} owner changes visibility`, (await doc.call('PATCH', `/api/documents/${doc.id}`, { title: marker, visibility })).status, 200);
    const body = new FormData(); body.set('file', new Blob([pdf]), 'owner.pdf');
    check(`${doc.owner} owner replace`, (await doc.call('PUT', `/api/documents/${doc.id}/file`, body)).status, 200);
    check(`${doc.owner} owner delete`, (await doc.call('DELETE', `/api/documents/${doc.id}`)).status, 204);
  }
  console.table(rows); console.log(`PASS ${rows.length} authorization checks; CONTEXT C3.2 Guest/A/B covered`);
} finally {
  for (const doc of docs) await doc.call('DELETE', `/api/documents/${doc.id}`);
}
