import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aReceber, normalizarVoucher, parseNumero } from '../src/lib/utils.ts';

test('interpreta números brasileiros e decimais do snapshot sem multiplicá-los', () => {
  for (const [entrada, esperado] of [
    ['259.8', 259.8], ['59.80', 59.8], ['1.199,20', 1199.2],
    ['R$ 1.234,56', 1234.56], ['1.234', 1234], [259.8, 259.8], ['', 0], ['inválido', 0],
  ]) assert.equal(parseNumero(entrada), esperado);
});

test('lê valores e calcula saldo para um voucher do snapshot', () => {
  const v = normalizarVoucher({ clientes: ['Cliente'], passeios: [], pessoas: '2', total: '259.8', entrada: '50', desconto: '0', status: 'concluido' });
  assert.equal(v.total, 259.8);
  assert.equal(aReceber(v), 209.8);
});
