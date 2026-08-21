/* BuyBye — shared UI helpers: overlays, delegation, small markup builders. */
window.App = window.App || {};

App.ui = (function () {
  var f = App.format;

  function root() { return document.getElementById('app'); }

  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function qsa(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  /* Event delegation — handlers survive re-renders. */
  function on(scope, selector, type, handler) {
    scope.addEventListener(type, function (ev) {
      var target = ev.target.closest ? ev.target.closest(selector) : null;
      if (target && scope.contains(target)) handler(ev, target);
    });
  }

  /* ---------- Overlays ---------- */

  function overlay(cls, inner, opts) {
    var o = opts || {};
    var back = document.createElement('div');
    back.className = 'backdrop' + (cls ? ' ' + cls : '');
    back.innerHTML = inner;
    root().appendChild(back);

    function close() {
      if (!back.parentNode) return;
      back.parentNode.removeChild(back);
      if (o.onClose) o.onClose();
    }

    back.addEventListener('mousedown', function (ev) {
      if (ev.target === back && !o.persistent) close();
    });
    back.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-close]')) close();
    });

    return { el: back, close: close };
  }

  /* Bottom sheet. `body` is HTML; returns { el, close }. */
  function sheet(title, body, opts) {
    var html =
      '<div class="sheet">' +
        '<div class="grabber"></div>' +
        (title ? '<h3>' + f.escape(title) + '</h3>' : '') +
        body +
      '</div>';
    return overlay('', html, opts);
  }

  /* Centered modal. */
  function modal(body, opts) {
    return overlay('center', '<div class="modal">' + body + '</div>', opts);
  }

  var toastTimer = null;
  function toast(message) {
    var existing = qs('.toast', root());
    if (existing) existing.parentNode.removeChild(existing);
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    root().appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2400);
  }

  function confirm(message, confirmLabel, onYes) {
    var m = modal(
      '<p class="center" style="font-size:17px;font-weight:600;margin:4px 0 22px">' +
        f.escape(message) + '</p>' +
      '<div class="btn-row">' +
        '<button class="btn btn-soft" data-close>Cancel</button>' +
        '<button class="btn" data-yes>' + f.escape(confirmLabel || 'Confirm') + '</button>' +
      '</div>'
    );
    m.el.querySelector('[data-yes]').addEventListener('click', function () {
      m.close();
      onYes();
    });
    return m;
  }

  /* ---------- Markup builders ---------- */

  function tile(emoji, small) {
    return '<span class="tile' + (small ? ' tile-sm' : '') + '">' + f.escape(emoji || '•') + '</span>';
  }

  function optionRow(item, selected, index) {
    return '<button class="option" aria-pressed="' + (selected ? 'true' : 'false') +
      '" data-index="' + index + '">' +
      tile(item.emoji) +
      '<span>' + f.escape(item.name) + '</span>' +
      '<span class="check"></span>' +
    '</button>';
  }

  function switchRow(label, sub, on, dataAttr) {
    return '<div class="switch-row">' +
      '<div style="flex:1;min-width:0">' +
        '<div class="label">' + f.escape(label) + '</div>' +
        (sub ? '<div class="tiny muted">' + f.escape(sub) + '</div>' : '') +
      '</div>' +
      '<button class="switch" aria-pressed="' + (on ? 'true' : 'false') + '" ' + dataAttr + '></button>' +
    '</div>';
  }

  /* Progress-bar header used by onboarding. */
  function obHead(fraction) {
    return '<div class="ob-head">' +
      '<button class="back" data-ob-back aria-label="Back">←</button>' +
      '<div class="progress"><i style="width:' + Math.round(fraction * 100) + '%"></i></div>' +
    '</div>';
  }

  function emptyState(title, body) {
    return '<div class="empty">' +
      (title ? '<div class="title" style="font-size:26px;margin-bottom:6px">' + title + '</div>' : '') +
      '<p style="margin:0">' + body + '</p>' +
    '</div>';
  }

  /* Keeps a numeric text input tidy without fighting the caret. */
  function readNumber(el) {
    if (!el) return 0;
    var n = parseFloat(String(el.value).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  return {
    root: root,
    qs: qs,
    qsa: qsa,
    on: on,
    overlay: overlay,
    sheet: sheet,
    modal: modal,
    toast: toast,
    confirm: confirm,
    tile: tile,
    optionRow: optionRow,
    switchRow: switchRow,
    obHead: obHead,
    emptyState: emptyState,
    readNumber: readNumber
  };
})();
