(function () {
  "use strict";
  var root = document.documentElement;
  var toggle = document.getElementById("lang-toggle");
  function t(en, ar) { return root.lang === "ar" ? ar : en; }
  function i18n() {
    document.querySelectorAll(".mast-tools [data-en]").forEach(function (el) { el.textContent = el.dataset[root.lang === "ar" ? "ar" : "en"]; });
    if (toggle) {
      toggle.textContent = root.lang === "ar" ? "English" : "العربية";
      toggle.lang = root.lang === "ar" ? "en" : "ar";
    }
    document.querySelectorAll(".copy").forEach(function (b) { b.textContent = t("Copy", "نسخ"); });
    applyMode();
  }
  if (toggle) toggle.addEventListener("click", function (e) {
    e.preventDefault();
    var lang = root.lang === "ar" ? "en" : "ar";
    root.lang = lang; root.dir = lang === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("site-lang", lang); } catch (err) {}
    i18n();
  });

  // Display mode: light, dark or system, remembered per visitor
  var MODE = "system";
  try { MODE = localStorage.getItem("site-mode") || "system"; } catch (e) {}
  if (["light", "dark", "system"].indexOf(MODE) < 0) MODE = "system";
  var LABEL = { light: ["Light mode", "الوضع الفاتح"], dark: ["Dark mode", "الوضع الداكن"], system: ["Follow system setting", "حسب إعداد النظام"] };
  function applyMode() {
    if (MODE === "system") root.removeAttribute("data-mode"); else root.setAttribute("data-mode", MODE);
    document.querySelectorAll("[data-set-mode]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.setMode === MODE));
      b.title = t(LABEL[b.dataset.setMode][0], LABEL[b.dataset.setMode][1]);
    });
    var sw = document.querySelector(".mode-switch");
    if (sw) sw.setAttribute("aria-label", t("Display mode", "وضع العرض"));
  }
  document.querySelectorAll("[data-set-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      MODE = b.dataset.setMode;
      try { localStorage.setItem("site-mode", MODE); } catch (e) {}
      applyMode();
    });
  });

  // Copy buttons on the contact page
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = btn.parentNode.querySelector('[data-copy-src="' + btn.dataset.copy + '"]');
      function done(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = t("Copy", "نسخ"); }, 1600); }
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(src);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        done(t("Selected", "تم التحديد"));
      }
      try { navigator.clipboard.writeText(src.textContent.trim()).then(function () { done(t("Copied", "تم النسخ")); }, fallback); }
      catch (e) { fallback(); }
    });
  });
  i18n();
})();
