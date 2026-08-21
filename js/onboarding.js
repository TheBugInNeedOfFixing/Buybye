/* BuyBye — onboarding: 8 steps, progress bar, back arrow, Continue. */
window.App = window.App || {};

App.onboarding = (function () {
  var f = App.format, ui = App.ui, store = App.store;
  var STEPS = 8;
  var step = 0;
  var draft = null;
  var mounted = false;

  function el() { return document.getElementById('screen-onboarding'); }

  function freshDraft() {
    var s = store.get().settings;
    return {
      currency: s.currency || 'USD',
      salaryType: s.salaryType || 'yearly',
      salary: s.salary || '',
      hourlyRate: s.hourlyRate || '',
      picks: { home: {}, debt: {}, spending: {}, goals: {} },
      custom: { home: [], debt: [], spending: [], goals: [] },
      monthlyIncome: null,
      birthday: s.birthday || '',
      retirementAge: s.retirementAge || 65,
      returnRate: s.returnRate == null ? 10 : s.returnRate,
      taxRate: s.taxRate == null ? 25 : s.taxRate
    };
  }

  function start() {
    draft = freshDraft();
    step = 0;
    render();
  }

  function itemsFor(key) {
    return store.CATALOG[key].concat(draft.custom[key]);
  }

  function settingsFromDraft() {
    return {
      currency: draft.currency,
      salaryType: draft.salaryType,
      salary: Number(draft.salary) || 0,
      hourlyRate: Number(draft.hourlyRate) || 0,
      taxRate: Number(draft.taxRate),
      returnRate: Number(draft.returnRate),
      retirementAge: Number(draft.retirementAge),
      birthday: draft.birthday
    };
  }

  function estimatedIncome() {
    return App.finance.monthlyTakeHome(settingsFromDraft());
  }

  /* ---------- step renderers ---------- */

  function stepIncome() {
    var chips = f.CURRENCIES.map(function (c) {
      return '<button class="chip" aria-pressed="' + (c.code === draft.currency) +
        '" data-cur="' + c.code + '">' + f.escape(c.symbol) + '</button>';
    }).join('');

    var hourly = draft.salaryType === 'hourly';
    return '<div class="scroll">' +
      '<h1 class="title">What do you earn?</h1>' +
      '<p class="subtitle">This drives every number in the app</p>' +
      '<p class="tiny muted" style="margin:0 0 8px">Scroll for more currencies →</p>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="segmented" style="margin-top:18px">' +
        '<button aria-pressed="' + (!hourly) + '" data-type="yearly">Yearly Salary</button>' +
        '<button aria-pressed="' + hourly + '" data-type="hourly">Hourly Rate</button>' +
      '</div>' +
      '<label class="field-label">' + (hourly ? 'Hourly rate' : 'Yearly salary') + '</label>' +
      '<input class="field field-lg" inputmode="decimal" data-amount ' +
        'placeholder="0" value="' + f.escape(hourly ? draft.hourlyRate : draft.salary) + '">' +
    '</div>';
  }

  function pickerStep(key, title, sub) {
    var picks = draft.picks[key];
    var rows = itemsFor(key).map(function (item, i) {
      return ui.optionRow(item, !!picks[i], i);
    }).join('');

    return '<div class="scroll">' +
      '<h1 class="title">' + title + '</h1>' +
      '<p class="subtitle">' + sub + '</p>' +
      '<div data-options>' + rows + '</div>' +
      '<div data-addbox class="hidden">' +
        '<div class="inline-add">' +
          '<input class="field emoji" data-new-emoji maxlength="4" placeholder="🙂">' +
          '<input class="field" data-new-name placeholder="Name it">' +
        '</div>' +
        '<button class="btn btn-soft btn-sm" data-add-save>Add</button>' +
      '</div>' +
      '<button class="add-own" data-add-own>+ Add my own</button>' +
    '</div>';
  }

  function stepMonthlyIncome() {
    var value = draft.monthlyIncome == null ? estimatedIncome() : draft.monthlyIncome;
    return '<div class="scroll">' +
      '<h1 class="title">How much do you bring in every month?</h1>' +
      '<p class="subtitle">(after taxes)</p>' +
      '<p class="center muted" style="margin-bottom:10px">Tap below to edit income</p>' +
      '<input class="field field-lg" inputmode="decimal" data-income ' +
        'style="font-size:30px;padding:22px 16px" value="' + f.escape(value.toFixed(2)) + '">' +
      '<p class="center muted tiny" style="margin-top:14px">(Estimated from your income,<br>minus ' +
        Math.round(draft.taxRate) + '% for taxes)</p>' +
    '</div>';
  }

  function stepHorizon() {
    return '<div class="scroll">' +
      '<h1 class="title">When do you want to stop working?</h1>' +
      '<p class="subtitle">Used to show what a purchase could grow into</p>' +
      '<label class="field-label">Birthday</label>' +
      '<input class="field" type="date" data-birthday value="' + f.escape(draft.birthday) + '">' +
      '<label class="field-label">Retirement age</label>' +
      '<input class="field field-lg" inputmode="numeric" data-retire value="' + draft.retirementAge + '">' +
      '<label class="field-label">Investment return rate %</label>' +
      '<input class="field field-lg" inputmode="decimal" data-return value="' + draft.returnRate + '">' +
      '<p class="center muted tiny" style="margin-top:12px">' +
        'The long-run average for a broad stock index is around 10% before inflation.</p>' +
    '</div>';
  }

  function stepNotifications() {
    return '<div class="scroll">' +
      '<h1 class="title">Stay on top of your budget?</h1>' +
      App.push.panelHTML() +
    '</div>';
  }

  /* ---------- shell ---------- */

  function bodyFor(i) {
    switch (i) {
      case 0: return stepIncome();
      case 1: return pickerStep('home', 'Do you have any home expenses?', 'Select as many as apply');
      case 2: return pickerStep('debt', 'Do you have any debt right now?', 'Select as many as apply');
      case 3: return pickerStep('spending', 'Which of these do you regularly spend money on?', 'Select as many as apply');
      case 4: return pickerStep('goals', 'What are you saving for?', 'Select as many as apply');
      case 5: return stepMonthlyIncome();
      case 6: return stepHorizon();
      default: return stepNotifications();
    }
  }

  function render() {
    var host = el();
    host.innerHTML =
      ui.obHead((step + 1) / STEPS) +
      bodyFor(step) +
      '<div class="footer-action"><button class="btn" data-continue>' +
        (step === STEPS - 1 ? 'Finish' : 'Continue') + '</button></div>';
  }

  var PICKER_KEYS = { 1: 'home', 2: 'debt', 3: 'spending', 4: 'goals' };

  function commitCurrentStep() {
    var host = el();
    if (step === 0) {
      var amount = ui.readNumber(host.querySelector('[data-amount]'));
      if (draft.salaryType === 'hourly') draft.hourlyRate = amount; else draft.salary = amount;
    } else if (step === 5) {
      draft.monthlyIncome = ui.readNumber(host.querySelector('[data-income]'));
    } else if (step === 6) {
      draft.birthday = host.querySelector('[data-birthday]').value;
      draft.retirementAge = ui.readNumber(host.querySelector('[data-retire]')) || 65;
      draft.returnRate = ui.readNumber(host.querySelector('[data-return]'));
    }
  }

  function bind(host) {
    /* Currency + salary type */
    ui.on(host, '[data-cur]', 'click', function (ev, t) {
      draft.currency = t.getAttribute('data-cur');
      render();
    });
    ui.on(host, '[data-type]', 'click', function (ev, t) {
      commitCurrentStep();
      draft.salaryType = t.getAttribute('data-type');
      render();
    });

    /* Multi-select toggles */
    ui.on(host, '.option', 'click', function (ev, t) {
      var key = PICKER_KEYS[step];
      if (!key) return;
      var i = Number(t.getAttribute('data-index'));
      if (draft.picks[key][i]) delete draft.picks[key][i];
      else draft.picks[key][i] = true;
      t.setAttribute('aria-pressed', draft.picks[key][i] ? 'true' : 'false');
    });

    /* Add my own */
    ui.on(host, '[data-add-own]', 'click', function () {
      var box = host.querySelector('[data-addbox]');
      box.classList.remove('hidden');
      var nameEl = box.querySelector('[data-new-name]');
      if (nameEl) nameEl.focus();
    });
    ui.on(host, '[data-add-save]', 'click', function () {
      var key = PICKER_KEYS[step];
      if (!key) return;
      var nameEl = host.querySelector('[data-new-name]');
      var emojiEl = host.querySelector('[data-new-emoji]');
      var name = String(nameEl.value || '').trim();
      if (!name) { nameEl.focus(); return; }
      var group = key === 'goals' ? 'goals' : (key === 'spending' ? 'wants' : 'needs');
      draft.custom[key].push({ name: name, emoji: String(emojiEl.value || '').trim() || '•', group: group });
      draft.picks[key][itemsFor(key).length - 1] = true;
      render();
      host.querySelector('[data-add-own]').scrollIntoView({ block: 'nearest' });
    });

    /* Notifications panel */
    App.push.bindPanel(host, function (next) {
      store.update(function (s) { s.notifications = next; }, { skipRender: true });
    });

    /* Navigation */
    ui.on(host, '[data-ob-back]', 'click', function () {
      commitCurrentStep();
      if (step === 0) return;
      step--;
      render();
    });
    ui.on(host, '[data-continue]', 'click', function () {
      commitCurrentStep();
      if (step === 0) {
        var has = draft.salaryType === 'hourly' ? draft.hourlyRate : draft.salary;
        if (!has || has <= 0) {
          ui.toast('Enter what you earn to continue');
          return;
        }
        draft.monthlyIncome = null; // re-estimate from the new figure
      }
      if (step === STEPS - 1) { finish(); return; }
      step++;
      render();
    });
  }

  /* ---------- finish ---------- */

  function finish() {
    var settings = settingsFromDraft();
    settings.monthlyIncome = draft.monthlyIncome == null ? estimatedIncome() : draft.monthlyIncome;

    store.update(function (s) {
      Object.keys(settings).forEach(function (k) { s.settings[k] = settings[k]; });

      /* Seed categories from every picked item, keeping the Income row. */
      s.categories = s.categories.filter(function (c) { return c.group === 'income'; });
      Object.keys(PICKER_KEYS).forEach(function (stepIndex) {
        var key = PICKER_KEYS[stepIndex];
        var all = store.CATALOG[key].concat(draft.custom[key]);
        Object.keys(draft.picks[key]).forEach(function (idx) {
          var item = all[Number(idx)];
          if (!item) return;
          s.categories.push({
            id: store.uid('cat'),
            name: item.name,
            emoji: item.emoji,
            group: item.group,
            custom: !!item.custom
          });
        });
      });

      s.onboarding.complete = true;
      s.onboarding.step = STEPS;
    });

    App.app.showMain('budget');
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    bind(el());          // delegated once; the container outlives each render
    start();
  }

  return { mount: mount, start: start };
})();
