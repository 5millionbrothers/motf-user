(function (root) {
  'use strict';
  const seoul = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'});
  const iso = date => date.toISOString().slice(0, 10);
  function today(asOf = new Date()) {
    const parts = Object.fromEntries(seoul.formatToParts(asOf).map(({type, value}) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shiftDay(key, days) {
    const date = new Date(`${key}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return iso(date);
  }
  function shiftMonth(key, months) {
    const date = new Date(`${key.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return iso(date);
  }
  function limits(asOf) {
    const first = today(asOf);
    const lastCheckout = shiftMonth(first, 4);
    return {today: first, lastNight: shiftDay(lastCheckout, -1), lastCheckout};
  }
  function valid(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const value = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(+value) && iso(value) === date;
  }
  function range(checkIn, checkOut, asOf) {
    const window = limits(asOf);
    if (!valid(checkIn) || !valid(checkOut) || checkIn < window.today || checkIn >= checkOut) return {ok: false};
    if (checkOut > window.lastCheckout) return {ok: false, opens: shiftMonth(shiftDay(checkOut, -1), -3)};
    return {ok: true};
  }
  const api = {limits, range, shiftDay, shiftMonth, valid};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotfStayBookingWindow = api;
})(typeof window === 'object' ? window : globalThis);
