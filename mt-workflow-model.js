(function (root) {
  const model = {
    activeProject(projects, preferredId) {
      const active = projects.filter(project => project.is_owner !== false && !['completed', 'cancelled'].includes(project.status));
      return active.find(project => String(project.id) === String(preferredId)) || (active.length === 1 ? active[0] : null);
    },
    quantity(value, minimum = 1, step = 1) {
      const min = Math.max(1, Number(minimum) || 1), increment = Math.max(1, Number(step) || 1);
      const number = Number(value);
      if (!Number.isFinite(number)) return min;
      if (number <= 0) return 0;
      return Math.min(min + Math.floor((1000 - min) / increment) * increment, min + Math.round((Math.max(min, number) - min) / increment) * increment);
    },
    roomCount(snapshot, businessId, roomId) {
      return (snapshot?.candidates || []).filter(item => roomId ? String(item.offering_id) === String(roomId) : String(item.business_id) === String(businessId)).length;
    },
    shoppingItem(snapshot, productId) {
      return (snapshot?.items || []).find(item => item.item_kind === 'shopping' && item.status !== 'cancelled' && String(item.reference_id) === String(productId));
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.motfMtWorkflow = model;
})(typeof window === 'undefined' ? globalThis : window);
