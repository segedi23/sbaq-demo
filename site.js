/* SBAQ, julkisen sivun skriptit: pyörivät kuvasarjat. */
(function () {
  "use strict";

  /* ---------- kuvasarjat ---------- */
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };

  document.querySelectorAll("[data-reel]").forEach(function (reel) {
    var imgs = reel.querySelectorAll(".reel-stage img");
    var count = reel.querySelector(".reel-count");
    var i = 0, timer = null;
    if (!imgs.length) return;

    var ticks = document.createElement("div");
    ticks.className = "reel-ticks";
    imgs.forEach(function () { ticks.appendChild(document.createElement("span")); });
    reel.querySelector(".reel-stage").appendChild(ticks);

    function show(n) {
      imgs[i].classList.remove("on");
      ticks.children[i].classList.remove("on");
      i = (n + imgs.length) % imgs.length;
      imgs[i].classList.add("on");
      ticks.children[i].classList.add("on");
      count.textContent = pad(i + 1) + " / " + pad(imgs.length);
    }
    function play() {
      if (timer || imgs.length < 2) return;
      reel.classList.add("playing");
      show(i + 1);
      timer = setInterval(function () { show(i + 1); }, still ? 1400 : 520);
    }
    function stop() {
      clearInterval(timer); timer = null;
      reel.classList.remove("playing");
    }

    show(0);
    reel.tabIndex = 0;
    reel.setAttribute("role", "button");
    reel.setAttribute("aria-label", "Pyöritä kuvasarja: " + reel.querySelector(".reel-name").textContent);

    reel.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") play(); });
    reel.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") stop(); });
    reel.addEventListener("click", function (e) {
      if (e.detail && window.matchMedia("(hover: hover)").matches) return; // hiirellä hover hoitaa
      timer ? stop() : play();
    });
    reel.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); timer ? stop() : play(); }
      if (e.key === "ArrowRight") { stop(); show(i + 1); }
      if (e.key === "ArrowLeft") { stop(); show(i - 1); }
    });
  });

})();

/* ---------- valikko kapealla näytöllä ---------- */
(function () {
  "use strict";
  var mast = document.querySelector(".mast");
  var btn = document.querySelector(".mast-menu");
  if (!mast || !btn) return;
  function set(open) {
    mast.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function () { set(!mast.classList.contains("open")); });
  mast.querySelectorAll(".mast-nav a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
})();
