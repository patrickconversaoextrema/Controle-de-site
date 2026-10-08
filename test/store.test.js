import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, pageKey } from '../src/store.js';

const fakeResult = (url, overall) => ({
  main: { url, finalUrl: url, score: { overall, categories: { seo: overall } } },
  competitors: [{ url: 'https://concorrente.com', finalUrl: 'https://concorrente.com', score: { overall: 70 } }],
  comparison: null,
  categories: [],
});

test('salva, lista, monta histórico e exclui relatórios', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiox-'));
  const store = openStore(dir);
  try {
    store.save({ id: 'a', createdAt: '2026-10-01T10:00:00Z', result: fakeResult('https://www.site.com/lp/', 50), images: [{ type: 'image/jpeg', buf: Buffer.from([1, 2, 3]) }] });
    store.save({ id: 'b', createdAt: '2026-10-05T10:00:00Z', result: fakeResult('https://site.com/lp', 64), images: [] });
    store.save({ id: 'c', createdAt: '2026-10-06T10:00:00Z', result: fakeResult('https://outro.com/', 80), images: [] });

    assert.equal(pageKey('https://www.site.com/lp/'), pageKey('https://site.com/lp'));
    assert.deepEqual(store.history(pageKey('https://site.com/lp')).map((h) => h.overall), [50, 64]);
    assert.equal(store.list().length, 3);
    assert.equal(store.list({ q: 'outro' })[0].id, 'c');
    assert.equal(store.get('a').result.main.score.overall, 50);
    assert.deepEqual([...store.image('a', 0).data], [1, 2, 3]);

    assert.equal(store.remove('a'), true);
    assert.equal(store.get('a'), null);
    assert.equal(store.image('a', 0), null);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
