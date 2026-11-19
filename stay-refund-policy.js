(function (root) {
  function normalize(value) {
    if (!Array.isArray(value) || !value.length) return null;
    const rules = value.map(row => ({ days: row?.days_before, percent: row?.refund_percent }));
    if (rules.some(({ days, percent }) => !Number.isInteger(days) || days < 0 || !Number.isInteger(percent) || percent < 0 || percent > 100)
      || new Set(rules.map(rule => rule.days)).size !== rules.length) return null;
    return rules.sort((a, b) => b.days - a.days);
  }
  function describe(value) {
    const rules = normalize(value);
    if (!rules) return [];
    return rules.map(({ days, percent }, index) => {
      const when = !index ? (days ? `체크인 ${days}일 전까지` : '체크인 당일까지')
        : days === 0 ? (index && rules[index - 1].days > 1 ? `체크인 ${rules[index - 1].days - 1}일 전부터 당일까지` : '체크인 당일')
        : rules[index - 1].days - 1 === days ? `체크인 ${days}일 전` : `체크인 ${rules[index - 1].days - 1}~${days}일 전`;
      return `${when}: ${percent ? percent + '% 환불' : '환불 불가'}`;
    });
  }
  const api = { normalize, describe };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotfStayRefundPolicy = api;
})(globalThis);
