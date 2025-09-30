(function () {
  function buildTopPrevNext() {
    const content = document.querySelector(".md-content");
    if (!content) return;

    const article = content.querySelector("article");
    if (!article) {
      // Retry once the article exists
      requestAnimationFrame(buildTopPrevNext);
      return;
    }

    // Remove any existing bar
    const old = content.querySelector(".top-prev-next");
    if (old) old.remove();

    const footer = document.querySelector(".md-footer__inner");
    if (!footer) return;

    const prevA = footer.querySelector(".md-footer__link--prev a");
    const nextA = footer.querySelector(".md-footer__link--next a");
    if (!prevA && !nextA) return;

    const bar = document.createElement("div");
    bar.className = "top-prev-next";
    bar.style.display = "flex";
    bar.style.justifyContent = "space-between";
    bar.style.gap = "1rem";
    bar.style.margin = "0 0 1rem 0";

    function makeLink(src) {
      const a = document.createElement("a");
      a.className = "md-footer__link";
      a.href = src.href;
      a.innerHTML = src.innerHTML; // icon + label
      return a;
    }

    if (prevA) bar.appendChild(makeLink(prevA));
    if (nextA) bar.appendChild(makeLink(nextA));

    article.parentNode.insertBefore(bar, article);
  }

  // Initial load
  document.addEventListener("DOMContentLoaded", buildTopPrevNext);

  // Re-run after every instant navigation
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(buildTopPrevNext);
  }
})();
