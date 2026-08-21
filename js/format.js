/* BuyBye — formatting helpers */
window.App = window.App || {};

App.format = (function () {
  var CURRENCIES = [
    { code: 'USD', symbol: '$'    },
    { code: 'GBP', symbol: '£' },
    { code: 'EUR', symbol: '€' },
    { code: 'CHF', symbol: 'CHF'  },
    { code: 'JPY', symbol: '¥' },
    { code: 'INR', symbol: '₹' },
    { code: 'AUD', symbol: 'A$'   },
    { code: 'CAD', symbol: 'C$'   },
    { code: 'NZD', symbol: 'NZ$'  },
    { code: 'SEK', symbol: 'kr'   },
    { code: 'NOK', symbol: 'kr'   },
    { code: 'DKK', symbol: 'kr'   },
    { code: 'PLN', symbol: 'zł' },
    { code: 'KRW', symbol: '₩' },
    { code: 'BRL', symbol: 'R$'   },
    { code: 'MXN', symbol: 'Mex$' },
    { code: 'ZAR', symbol: 'R'    },
    { code: 'TRY', symbol: '₺' },
    { code: 'CNY', symbol: 'CN¥' },
    { code: 'SGD', symbol: 'S$'   }
  ];

  function symbolFor(code) {
    for (var i = 0; i < CURRENCIES.length; i++) {
      if (CURRENCIES[i].code === code) return CURRENCIES[i].symbol;
    }
    return '$';
  }

  function group(n, decimals) {
    var s = Math.abs(n).toFixed(decimals);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /* Cents are shown only when they exist, matching the screenshots:
     $0, $11, $40 but $562.50 and $4,850.86 */
  function money(value, code) {
    var v = Number(value) || 0;
    var sym = symbolFor(code || (App.store && App.store.currency()) || 'USD');
    var rounded = Math.round(v * 100) / 100;
    var decimals = Math.abs(rounded % 1) < 1e-9 ? 0 : 2;
    var sign = rounded < 0 ? '-' : '';
    return sign + sym + group(rounded, decimals);
  }

  function moneyExact(value, code) {
    var v = Number(value) || 0;
    var sym = symbolFor(code || (App.store && App.store.currency()) || 'USD');
    return (v < 0 ? '-' : '') + sym + group(v, 2);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* "0 hrs", "11.6 hrs" — the compact form used in budget rows */
  function hoursShort(h) {
    var v = Number(h) || 0;
    return round1(v) + ' hrs';
  }

  /* "1 day and 3 hours" — the long form used in the Worth it verdict.
     A working day is 8 hours. */
  function duration(hours) {
    var WORKDAY = App.finance.WORKDAY_HOURS;
    var h = Number(hours) || 0;
    if (h <= 0) return 'no time at all';

    if (h < 1) {
      var mins = Math.max(1, Math.round(h * 60));
      return mins + (mins === 1 ? ' minute' : ' minutes');
    }

    var days = Math.floor(h / WORKDAY);
    var remHours = Math.floor(h - days * WORKDAY);

    if (days === 0) return remHours + (remHours === 1 ? ' hour' : ' hours');

    var dayPart = days + (days === 1 ? ' day' : ' days');
    if (remHours === 0) return dayPart;
    return dayPart + ' and ' + remHours + (remHours === 1 ? ' hour' : ' hours');
  }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function monthKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function dayKey(date) {
    var d = date || new Date();
    return monthKey(d) + '-' + pad2(d.getDate());
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* '2026-08' -> 'Aug 2026' */
  function monthLabel(key) {
    var bits = key.split('-');
    return MONTHS[Number(bits[1]) - 1] + ' ' + bits[0];
  }

  function shiftMonth(key, delta) {
    var bits = key.split('-');
    var d = new Date(Number(bits[0]), Number(bits[1]) - 1 + delta, 1);
    return monthKey(d);
  }

  function daysInMonth(key) {
    var bits = key.split('-');
    return new Date(Number(bits[0]), Number(bits[1]), 0).getDate();
  }

  /* '3 days ago', 'today' */
  function ago(iso) {
    var then = new Date(iso).getTime();
    var days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    var months = Math.floor(days / 30);
    return months === 1 ? 'a month ago' : months + ' months ago';
  }

  function time12(hhmm) {
    var bits = String(hhmm || '09:00').split(':');
    var h = Number(bits[0]);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + bits[1] + ' ' + suffix;
  }

  function escape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    CURRENCIES: CURRENCIES,
    symbolFor: symbolFor,
    money: money,
    moneyExact: moneyExact,
    hoursShort: hoursShort,
    duration: duration,
    round1: round1,
    monthKey: monthKey,
    dayKey: dayKey,
    monthLabel: monthLabel,
    shiftMonth: shiftMonth,
    daysInMonth: daysInMonth,
    ago: ago,
    time12: time12,
    pad2: pad2,
    escape: escape
  };
})();
