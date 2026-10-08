import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrastRatio, harmonyOf, clusterPalette } from '../src/utils/color.js';

test('parseColor entende hex, rgb e hsl', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseColor('rgba(0, 0, 0, 0.5)').a, 0.5);
  const red = parseColor('hsl(0, 100%, 50%)');
  assert.equal(Math.round(red.r), 255);
  assert.equal(parseColor('transparent'), null);
});

test('contraste preto/branco é 21:1', () => {
  assert.equal(Math.round(contrastRatio(parseColor('#000'), parseColor('#fff'))), 21);
});

test('harmonia identifica paletas', () => {
  assert.equal(harmonyOf([]).type, 'neutra');
  assert.equal(harmonyOf([210]).type, 'monocromatica');
  assert.equal(harmonyOf([200, 20]).type, 'complementar');
  assert.equal(harmonyOf([200, 220]).type, 'analoga');
});

test('clusterPalette agrupa tons quase iguais', () => {
  const p = clusterPalette([
    { color: parseColor('#ffffff'), weight: 10 },
    { color: parseColor('#fefefe'), weight: 5 },
    { color: parseColor('#ff0000'), weight: 5 },
  ]);
  assert.equal(p.length, 2);
  assert.equal(p[0].hex, '#ffffff');
});
