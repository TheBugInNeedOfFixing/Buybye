/* BuyBye — all financial math lives here, as pure functions.
   The constants and formulas below are reverse-engineered from the
   original app and are pinned by App.finance.selfTest(). */
window.App = window.App || {};

App.finance = (function () {
  var HOURS_PER_YEAR = 2080;   // 40h x 52w
  var WORKDAY_HOURS  = 8;

  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  /* What one hour of this person's time is worth, after nothing. */
  function hourlyRate(settings) {
    var s = settings || {};
    if (s.salaryType === 'hourly') return num(s.hourlyRate);
    return num(s.salary) / HOURS_PER_YEAR;
  }

  function grossMonthly(settings) {
    var s = settings || {};
    if (s.salaryType === 'hourly') return num(s.hourlyRate) * HOURS_PER_YEAR / 12;
    return num(s.salary) / 12;
  }

  /* Monthly income after tax. Default tax rate is 25%, which is what the
     onboarding screen means by "minus 25% for taxes". */
  function monthlyTakeHome(settings) {
    var s = settings || {};
    var tax = num(s.taxRate, 25) / 100;
    return grossMonthly(s) * (1 - tax);
  }

  /* Whole-number age, the way a person states it. This matters: the
     investment projection uses whole years to retirement, not fractional. */
  function ageAt(birthday, at) {
    if (!birthday) return 0;
    var b = new Date(birthday);
    if (isNaN(b.getTime())) return 0;
    var d = at || new Date();
    var age = d.getFullYear() - b.getFullYear();
    var m = d.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
    return Math.max(0, age);
  }

  function yearsToRetirement(settings, at) {
    var s = settings || {};
    var retireAt = num(s.retirementAge, 65);
    return Math.max(0, retireAt - ageAt(s.birthday, at));
  }

  /* What this money would be worth at retirement if invested instead.
     Compound growth: amount x (1 + r)^years */
  function futureValue(amount, settings, at) {
    var s = settings || {};
    var rate = num(s.returnRate, 10) / 100;
    var years = yearsToRetirement(s, at);
    return num(amount) * Math.pow(1 + rate, years);
  }

  /* How long you worked to afford this. */
  function timeCostHours(amount, settings) {
    var rate = hourlyRate(settings);
    if (rate <= 0) return 0;
    return num(amount) / rate;
  }

  function moneyToDays(hours) {
    return hours / WORKDAY_HOURS;
  }

  /* ---- Daily challenge ----
     A random allowance drawn from what is actually left in the Wants
     budget, spread over the days remaining in the month. */
  function dailyBudgetRange(wantsRemaining, daysLeft) {
    var base = daysLeft > 0 ? wantsRemaining / daysLeft : wantsRemaining;
    if (!isFinite(base) || base <= 0) base = 20;
    return { low: Math.max(1, base * 0.4), high: Math.max(3, base * 1.8), base: base };
  }

  function rollDailyBudget(wantsRemaining, daysLeft) {
    var r = dailyBudgetRange(wantsRemaining, daysLeft);
    var draw = r.low + Math.random() * (r.high - r.low);
    var amount = Math.max(1, Math.round(draw));
    var message = amount < r.base ? 'spend carefully' : 'you can splurge today';
    return { amount: amount, message: message };
  }

  /* ---- Self test ----
     Guards the four numbers that are visible in the original screenshots.
     Run App.finance.selfTest() in the console; returns {pass, results}. */
  function selfTest() {
    var settings = {
      salaryType: 'yearly',
      salary: 9000,
      taxRate: 25,
      returnRate: 10,
      retirementAge: 65,
      birthday: '2009-04-09',
      currency: 'USD'
    };
    var at = new Date(2026, 7, 20); // Aug 2026, when the screenshots were taken
    var results = [];

    function check(name, actual, expected, tolerance) {
      var ok = typeof expected === 'string'
        ? actual === expected
        : Math.abs(actual - expected) <= (tolerance || 0.005);
      results.push({ name: name, actual: actual, expected: expected, pass: ok });
      return ok;
    }

    var hours = timeCostHours(50, settings);
    check('hourly rate', hourlyRate(settings), 4.326923, 0.000001);
    check('monthly take-home', monthlyTakeHome(settings), 562.50);
    check('years to retirement', yearsToRetirement(settings, at), 48);
    check('time cost of $50', App.format.duration(hours), '1 day and 3 hours');
    check('invested instead', futureValue(50, settings, at), 4850.86, 0.01);

    var pass = results.every(function (r) { return r.pass; });
    if (typeof console !== 'undefined') {
      console[pass ? 'log' : 'error']('BuyBye finance selfTest: ' + (pass ? 'PASS' : 'FAIL'));
      if (console.table) console.table(results);
    }
    return { pass: pass, results: results };
  }

  return {
    HOURS_PER_YEAR: HOURS_PER_YEAR,
    WORKDAY_HOURS: WORKDAY_HOURS,
    hourlyRate: hourlyRate,
    grossMonthly: grossMonthly,
    monthlyTakeHome: monthlyTakeHome,
    ageAt: ageAt,
    yearsToRetirement: yearsToRetirement,
    futureValue: futureValue,
    timeCostHours: timeCostHours,
    moneyToDays: moneyToDays,
    dailyBudgetRange: dailyBudgetRange,
    rollDailyBudget: rollDailyBudget,
    selfTest: selfTest
  };
})();
