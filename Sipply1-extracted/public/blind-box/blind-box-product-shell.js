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
    if (!page) return false;
    if (page.getAttribute("data-design-mode") === "true") return true;
    try {
      var searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("blind_box_debug") === "1") return true;
    } catch (_error) {}
    return isLocalDevelopmentHost();
  }

  function getPageDetails(page) {
    var hasProductContext = Boolean(normalizeValue(page && page.getAttribute("data-product-id")));
    var eligible = hasProductContext && isBlindBoxProduct(page);
    return {
      hasProductContext: hasProductContext,
      isEligible: eligible,
      productId: normalizeValue(page && page.getAttribute("data-product-id")),
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
      if (titleNode) titleNode.textContent = "Blind box mode only applies on product pages";
      if (messageNode) messageNode.textContent = "Open a product page in the theme editor to preview blind box styling.";
    } else {
      if (titleNode) titleNode.textContent = "Blind box mode is inactive on this product";
      if (messageNode) messageNode.textContent = "Add the product tag blind-box in SHOPLINE admin to activate the blind box storefront experience.";
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

  function updateBackendStatus(page, data) {
    var noteEl = page.querySelector("[data-blind-box-note]");
    var poolStatusEl = page.querySelector("[data-blind-box-pool-status]");

    if (data && data.blindBox) {
      var bb = data.blindBox;
      if (noteEl) {
        noteEl.hidden = false;
        noteEl.textContent = bb.status === "active"
          ? "Mystery item — your reward is assigned after payment."
          : "Blind box currently unavailable.";
      }
      if (poolStatusEl) {
        poolStatusEl.hidden = false;
        poolStatusEl.textContent = bb.status === "active" ? "Available" : "Unavailable";
        poolStatusEl.setAttribute("data-status", bb.status || "unknown");
      }
      page.setAttribute("data-blind-box-backend-status", bb.status || "unknown");
    } else {
      if (noteEl) noteEl.hidden = true;
      if (poolStatusEl) poolStatusEl.hidden = true;
      page.setAttribute("data-blind-box-backend-status", "not-found");
    }
  }

  function fetchBackendStatus(page, productId) {
    var appUrl = normalizeValue(window.blindBoxAppUrl);
    var shop = normalizeValue(window.blindBoxShop);

    if (!appUrl || !productId) return;

    var url = appUrl + "/api/storefront/blind-box/product-status?shop=" + encodeURIComponent(shop) + "&productId=" + encodeURIComponent(productId);

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.success) {
          updateBackendStatus(page, json.data);
          if (json.data && json.data.isBlindBox) {
            page.setAttribute("data-product-mode", "blind-box");
            console.log("[BlindBoxShell] Backend confirmed blind-box — mode overridden to blind-box");
          } else {
            console.log("[BlindBoxShell] Backend says NOT blind-box:", json.data);
          }
        }
      })
      .catch(function () {
        // silent — backend may not be reachable
      });
  }

  function syncPage(page) {
    if (!page) return;

    var details = getPageDetails(page);
    var setupCard = page.querySelector("[data-blind-box-setup-content]");

    page.hidden = false;
    page.setAttribute("data-product-mode", details.isEligible ? "blind-box" : "standard");
    console.log("[BlindBoxShell] syncPage — productId:", details.productId, "tags:", details.tags, "isEligible:", details.isEligible, "mode:", details.isEligible ? "blind-box" : "standard", "appUrl:", window.blindBoxAppUrl, "shop:", window.blindBoxShop);
    page.setAttribute("data-blind-box-page-state", details.state);
    page.setAttribute("data-blind-box-diagnostics", details.diagnosticsEnabled ? "true" : "false");

    if (setupCard) {
      if (details.diagnosticsEnabled && !details.isEligible) {
        setSetupMessage(page, details);
        setupCard.hidden = false;
      } else {
        setupCard.hidden = true;
      }
    }

    if (details.productId && details.isEligible) {
      fetchBackendStatus(page, details.productId);
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
