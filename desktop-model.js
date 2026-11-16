(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotfDesktopModel = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function budget({ budget = 0, people = 1, extraCosts = [] }) {
    budget = Math.max(0, Number(budget) || 0);
    people = Math.max(1, Number(people) || 1);
    const other = extraCosts.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
    const perBudget = budget / people;
    const tier = perBudget < 40000 ? '알뜰하게' : perBudget < 80000 ? '여유롭게' : '풍성하게';
    const shares = perBudget < 40000 ? [.60, .27, .08, .05] : perBudget < 80000 ? [.54, .26, .12, .08] : [.50, .25, .15, .10];
    const reserve = Math.floor(budget * .08 / 1000) * 1000;
    const available = Math.max(0, budget - other - reserve);
    const [lodging, groceries, travel, play] = shares.map(share => Math.floor(available * share / 1000) * 1000);
    const used = lodging + groceries + travel + play + other;
    return { lodging, groceries, travel, play, other, used, remaining: budget - used, perPerson: Math.ceil(used / people), example: true, tier };
  }
  function authorPolicy({ owned, deleted, replyCount = 0 }) {
    return { edit: Boolean(owned && !deleted && replyCount === 0), remove: Boolean(owned && !deleted) };
  }
  function productSummary(product, variants = [product]) {
    const capacity = item => {
      const unit = String(item?.unit || '').trim();
      const sizes = unit.match(/\d+(?:[.,]\d+)?\s*(?:ml|kg|g|l|리터)(?:\s*[×x*]\s*\d+\s*(?:입|개|병|캔|팩)?)?/gi);
      return sizes ? sizes.map(size => size.replace(/\s+/g, '')).join(' / ') : unit;
    };
    const sizes = [...new Set(variants.map(capacity).filter(Boolean))].join(' / ');
    const maker = String(product?.manufacturer || '').trim();
    return maker && sizes && sizes.length + maker.length <= 22 ? `${sizes} · ${maker}` : sizes;
  }
  const categoryOrder = ['전체', '정육', '주류', '음료', '과자·안주', '채소·농산물', '즉석밥', '라면', '김치·반찬', '통조림·가공식품', '조미료·소스', '숙취해소', '일회용품', '생활용품'];
  const search = (value, query) => String(value || '').normalize('NFKC').toLocaleLowerCase('ko').includes(String(query || '').normalize('NFKC').trim().toLocaleLowerCase('ko'));
  return { budget, authorPolicy, productSummary, categoryOrder, search };
});
