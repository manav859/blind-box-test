(function () {
  var rootMarker = "data-blind-box-product-shell-script-ready";
  var documentElement = document.documentElement;

  if (!documentElement || documentElement.getAttribute(rootMarker) === "true") {
    return;
  }

  documentElement.setAttribute(rootMarker, "true");

  var blindBoxTheme = window.BlindBoxTheme || {};
  var normalizeValue =
    blindBoxTheme.normalizeValue ||
    function (value) {
      return value == null ? "" : String(value).trim();
    };
  var ROOT_SELECTOR = "[data-blind-box-product-page]";

  function isBlindBoxProduct(product) {
    if (blindBoxTheme && typeof blindBoxTheme.isBlindBoxProduct === "function") {
      return blindBoxTheme.isBlindBoxProduct(product);
    }

    return false;
  }

  function isLocalDevelopmentHost() {
    var hostname = normalizeValue(window.location.hostname).toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  function shouldShowDiagnostics(page) {
    if (!page) {
      return false;
    }

    if (page.getAttribute("data-design-mode") === "true") {
      return true;
    }

    try {
      var searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("blind_box_debug") === "1") {
        return true;
      }
    } catch (_error) {
      // no-op
    }

    return isLocalDevelopmentHost();
  }

  function getPageDetails(page) {
    var hasProductContext = Boolean(normalizeValue(page && page.getAttribute("data-product-id")));
    var eligible = hasProductContext && isBlindBoxProduct(page);

    return {
      hasProductContext: hasProductContext,
      isEligible: eligible,
      state: hasProductContext ? (eligible ? "eligible" : "missing_tag") : "not_product_page",
      diagnosticsEnabled: shouldShowDiagnostics(page),
      tags:
        blindBoxTheme && typeof blindBoxTheme.parseTags === "function"
          ? blindBoxTheme.parseTags(page)
          : []
    };
  }

  function setSetupMessage(page, details) {
    var titleNode = page.querySelector("[data-blind-box-setup-title]");
    var messageNode = page.querySelector("[data-blind-box-setup-message]");
    var metaNode = page.querySelector("[data-blind-box-setup-meta]");

    if (details.state === "not_product_page") {
      if (titleNode) {
        titleNode.textContent = "Blind box mode only applies on product pages";
      }
      if (messageNode) {
        messageNode.textContent = "Open a product page in the theme editor to preview blind box styling.";
      }
    } else {
      if (titleNode) {
        titleNode.textContent = "Blind box mode is inactive on this product";
      }
      if (messageNode) {
        messageNode.textContent = "Add the product tag blind-box in SHOPLINE admin to activate the blind box storefront experience.";
      }
    }

    if (metaNode) {
      if (details.diagnosticsEnabled) {
        metaNode.hidden = false;
        metaNode.textContent =
          "Supported tag: blind-box. Current tags: " +
          (details.tags.length > 0 ? details.tags.join(", ") : "(none)");
      } else {
        metaNode.hidden = true;
        metaNode.textContent = "";
      }
    }
  }

  function syncPage(page) {
    if (!page) {
      return;
    }

    var details = getPageDetails(page);
    var setupCard = page.querySelector("[data-blind-box-setup-content]");

    page.hidden = false;
    page.setAttribute("data-product-mode", details.isEligible ? "blind-box" : "standard");
    page.setAttribute("data-blind-box-page-state", details.state);
    page.setAttribute(
      "data-blind-box-diagnostics",
      details.diagnosticsEnabled ? "true" : "false"
    );

    if (setupCard) {
      if (details.diagnosticsEnabled && !details.isEligible) {
        setSetupMessage(page, details);
        setupCard.hidden = false;
      } else {
        setupCard.hidden = true;
      }
    }
  }

  function refreshPages() {
    var pages = document.querySelectorAll(ROOT_SELECTOR);
    Array.prototype.forEach.call(pages, syncPage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshPages, { once: true });
  } else {
    refreshPages();
  }

  document.addEventListener("shopline:section:load", refreshPages);
  window.addEventListener("blind_box_theme:refresh", refreshPages);
})();
