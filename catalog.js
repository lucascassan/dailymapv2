'use strict';
function refreshCatalog(saved, catalog, revision) {
  if (saved.catalogRevision === revision || saved.source !== 'assuntos-folha-pagamento.csv') return saved;
  const used = new Set();
  const areas = catalog.map(area => {
    // Matching topics also preserves allocations when an area's title is renamed.
    const previous = saved.areas.find(old => !used.has(old.id) && old.name === area.name)
      || saved.areas.find(old => !used.has(old.id) && JSON.stringify(old.topics) === JSON.stringify(area.topics));
    const id = previous ? previous.id : 'csv-' + encodeURIComponent(area.name);
    used.add(id);
    return { id, name: area.name, topics: [...area.topics] };
  });
  const assignments = Object.fromEntries(Object.entries(saved.assignments).map(([id, ids]) => [id, ids.filter(areaId => used.has(areaId))]));
  return { ...saved, areas, assignments, catalogRevision: revision };
}
if (typeof module !== 'undefined') module.exports = { refreshCatalog };
