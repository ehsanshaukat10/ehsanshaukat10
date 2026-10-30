// Business measures use explicit, validated financial roles. Arbitrary numeric
// spreadsheet columns are never promoted into KPIs.
export function businessOverview(tables, currency = "USD", selection) {
  const financial = tables
    .map((table, index) => ({
      ...table,
      key: `${table.sourceId || "legacy"}:${table.tabId ?? index}`,
    }))
    .filter((t) => t.financial?.points?.length);
  const fingerprints = new Map();
  for (const table of financial) {
    const key = JSON.stringify([
      table.currency || currency,
      table.financial.points,
    ]);
    fingerprints.set(key, [...(fingerprints.get(key) || []), table.key]);
  }
  const conflicts = [...fingerprints.values()]
    .filter((keys) => keys.length > 1)
    .flat();
  const selected =
    selection ??
    financial
      .filter((table) => !conflicts.includes(table.key))
      .map((table) => table.key);
  const groups = new Map();
  for (const table of financial.filter((t) => selected.includes(t.key))) {
    const unit = table.currency || currency;
    const group = groups.get(unit) || {
      currency: unit,
      revenue: 0,
      costs: 0,
      absoluteCents: 0,
      pages: 0,
      points: new Map(),
    };
    group.pages++;
    for (const point of table.financial.points) {
      const entry = group.points.get(point.date) || {
        date: point.date,
        revenue: 0,
        costs: 0,
      };
      entry.revenue += Math.round(point.revenue * 100);
      entry.costs += Math.round(point.costs * 100);
      group.absoluteCents +=
        Math.abs(Math.round(point.revenue * 100)) +
        Math.abs(Math.round(point.costs * 100));
      group.revenue += Math.round(point.revenue * 100);
      group.costs += Math.round(point.costs * 100);
      group.points.set(point.date, entry);
    }
    groups.set(unit, group);
  }
  return {
    financial,
    selected,
    conflicts,
    groups: [...groups.values()].map((group) => {
      const safe =
        Number.isSafeInteger(group.absoluteCents) &&
        Number.isSafeInteger(group.revenue) &&
        Number.isSafeInteger(group.costs) &&
        Number.isSafeInteger(group.revenue - group.costs);
      return {
        currency: group.currency,
        pages: group.pages,
        safe,
        revenue: safe ? group.revenue / 100 : null,
        costs: safe ? group.costs / 100 : null,
        profit: safe ? (group.revenue - group.costs) / 100 : null,
        margin:
          safe && group.revenue !== 0
            ? ((group.revenue - group.costs) / group.revenue) * 100
            : null,
        points: safe
          ? [...group.points.values()]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((p) => ({
                date: p.date,
                revenue: p.revenue / 100,
                costs: p.costs / 100,
              }))
          : [],
      };
    }),
  };
}
