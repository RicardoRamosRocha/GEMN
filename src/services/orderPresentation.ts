export type OrderPresentationItem = {
  id: string;
  nomeItem: string;
  quantidade: number;
  criadoEm?: string;
};

export function sortOrderItems<T extends OrderPresentationItem>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftDate = left.criadoEm ?? '';
    const rightDate = right.criadoEm ?? '';
    return leftDate.localeCompare(rightDate) || left.id.localeCompare(right.id);
  });
}

export function orderItemNames(items: OrderPresentationItem[]): string {
  const ordered = sortOrderItems(items);
  if (ordered.length === 0) return 'Pedido sem itens';
  if (ordered.length === 1) return ordered[0].nomeItem;
  if (ordered.length === 2) return `${ordered[0].nomeItem} + ${ordered[1].nomeItem}`;
  return `${ordered[0].nomeItem} + ${ordered.length - 1} outros produtos`;
}

export function totalOrderUnits(items: OrderPresentationItem[]): number {
  return items.reduce((total, item) => total + item.quantidade, 0);
}

export const __orderPresentationTestables = { sortOrderItems, orderItemNames, totalOrderUnits };
