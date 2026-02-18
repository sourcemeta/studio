export function splitIntoRows<T>(
  items: T[],
  containerWidth: number,
  itemWidth: number,
  gap: number
): T[][] {
  const itemsPerRow = Math.max(
    1,
    Math.floor((containerWidth + gap) / (itemWidth + gap))
  );

  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += itemsPerRow) {
    rows.push(items.slice(i, i + itemsPerRow));
  }
  return rows;
}

