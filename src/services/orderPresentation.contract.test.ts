import { __orderPresentationTestables } from './orderPresentation';

const items = [
  { id: 'b', nomeItem: 'Colar', quantidade: 2, criadoEm: '2026-01-02T00:00:00.000Z' },
  { id: 'a', nomeItem: 'Brinco', quantidade: 1, criadoEm: '2026-01-01T00:00:00.000Z' },
  { id: 'c', nomeItem: 'Pulseira', quantidade: 3, criadoEm: '2026-01-03T00:00:00.000Z' },
];

if (__orderPresentationTestables.orderItemNames([items[1]]) !== 'Brinco') throw new Error('single-item name changed');
if (__orderPresentationTestables.orderItemNames([items[1], items[0]]) !== 'Brinco + Colar') throw new Error('two-item name is not natural or deterministic');
if (__orderPresentationTestables.orderItemNames(items) !== 'Brinco + 2 outros produtos') throw new Error('multi-item name is not deterministic');
if (__orderPresentationTestables.totalOrderUnits(items) !== 6) throw new Error('total order units are incorrect');
if (__orderPresentationTestables.sortOrderItems([items[2], items[0], items[1]]).map((item) => item.id).join(',') !== 'a,b,c') throw new Error('order items depend on database response order');
