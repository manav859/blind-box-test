(function () {
  var rootMarker = "data-blind-box-product-shell-script-ready";
  var documentElement = document.documentElement;

  if (!documentElement || documentElement.getAttribute(rootMarker) === "true") {
    return;
  }

  documentElement.setAttribute(rootMarker, "true");

  var ROOT_SELECTOR = "[data-blind-box-product-shell]";
  var PAGE_SELECTOR = "[data-blind-box-product-page]";
  var FORM_SELECTOR = "form[action*='/cart/add']";
  var SUPPORTED_TAGS = {
    "blind-box": true,
    "blind-box-active": true,
  };
  var scheduled = false;
  var roots = [];

  function normalizeValue(value) {
    return value == null ? "" : String(value).trim();
  }

  function uniquePush(collection, candidate) {
    if (!candidate) {
      return;
    }

    for (var index = 0; index < collection.length; index += 1) {
      if (collection[index] === candidate) {
        return;
      }
    }

    collection.push(candidate);
  }

  function findCandidateProductForms(root) {
    var forms = [];
    var currentNode = root.parentElement;

    while (currentNode && currentNode !== document.body) {
      var scopedForms = currentNode.querySelectorAll(FORM_SELECTOR);
      Array.prototype.forEach.call(scopedForms, function (form) {
        if (!form.hasAttribute("data-blind-box-purchase-form")) {
          uniquePush(forms, form);
        }
      });

      if (forms.length > 0) {
        return forms;
      }

      currentNode = currentNode.parentElement;
    }

    var fallbackForms = document.querySelectorAll(FORM_SELECTOR);
    Array.prototype.forEach.call(fallbackForms, function (form) {
      if (!form.hasAttribute("data-blind-box-purchase-form")) {
        uniquePush(forms, form);
      }
    });

    return forms;
  }

  function parseTags(rawTags) {
    return normalizeValue(rawTags)
      .split(",")
      .map(function (tag) {
        return normalizeValue(tag).toLowerCase();
      })
      .filter(Boolean);
  }

  function hasBlindBoxTag(rawTags) {
    var tags = parseTags(rawTags);

    for (var index = 0; index < tags.length; index += 1) {
      if (SUPPORTED_TAGS[tags[index]]) {
        return true;
      }
    }

    return false;
  }

  function isLocalDevelopmentHost() {
    var hostname = normalizeValue(window.location.hostname).toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  function isGlobalDebugEnabled() {
    if (window.__BLIND_BOX_DEBUG__ === true) {
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

  function shouldShowDiagnostics(page) {
    return Boolean(
      isGlobalDebugEnabled() || (page && page.getAttribute("data-design-mode") === "true")
    );
  }

  function canLogForNode(scopeNode) {
    var page = scopeNode && scopeNode.closest ? scopeNode.closest(PAGE_SELECTOR) : null;
    return shouldShowDiagnostics(page);
  }

  function getPageDetails(page) {
    var productId = normalizeValue(page && page.getAttribute("data-product-id"));
    var tags = parseTags(page && page.getAttribute("data-product-tags"));
    var hasProductContext = Boolean(productId);
    var isEligible = hasProductContext && hasBlindBoxTag(page && page.getAttribute("data-product-tags"));

    return {
      state: hasProductContext ? (isEligible ? "eligible" : "missing_tag") : "not_product_page",
      productId: productId,
      tags: tags,
      hasProductContext: hasProductContext,
      isEligible: isEligible,
      diagnosticsEnabled: shouldShowDiagnostics(page),
    };
  }

  function setSetupMessage(page, details) {
    var titleNode = page.querySelector("[data-blind-box-setup-title]");
    var messageNode = page.querySelector("[data-blind-box-setup-message]");
    var metaNode = page.querySelector("[data-blind-box-setup-meta]");

    if (details.state === "not_product_page") {
      if (titleNode) {
        titleNode.textContent = "Blind Box block only works on product pages";
      }
      if (messageNode) {
        messageNode.textContent =
          "Open a product detail page in Theme Editor or use View in Online Store from the sold blind-box product.";
      }
    } else {
      if (titleNode) {
        titleNode.textContent = "This product is not configured as a blind box";
      }
      if (messageNode) {
        messageNode.textContent =
          "Add the product tag blind-box or blind-box-active, then confirm the sold product mapping in the Blind Box admin.";
      }
    }

    if (metaNode) {
      if (details.diagnosticsEnabled) {
        metaNode.hidden = false;
        metaNode.textContent =
          "Supported tags: blind-box, blind-box-active. Current tags: " +
          (details.tags.length > 0 ? details.tags.join(", ") : "(none)");
      } else {
        metaNode.hidden = true;
        metaNode.textContent = "";
      }
    }
  }

  function syncPageVisibility(page) {
    if (!page) {
      return true;
    }

    var details = getPageDetails(page);
    var liveContent = page.querySelector("[data-blind-box-live-content]");
    var setupContent = page.querySelector("[data-blind-box-setup-content]");
    var lastState = normalizeValue(page.getAttribute("data-blind-box-last-page-state"));

    page.setAttribute("data-blind-box-eligible", details.isEligible ? "true" : "false");
    page.setAttribute("data-blind-box-page-state", details.state);
    page.setAttribute(
      "data-blind-box-diagnostics",
      details.diagnosticsEnabled ? "true" : "false"
    );

    if (details.isEligible) {
      page.hidden = false;
      if (liveContent) {
        liveContent.hidden = false;
      }
      if (setupContent) {
        setupContent.hidden = true;
      }
      if (lastState !== "eligible") {
        logState(page, "eligibility_status", {
          productId: details.productId,
          tags: details.tags,
          eligibilityStatus: details.state
        });
        page.setAttribute("data-blind-box-last-page-state", "eligible");
      }
      return true;
    }

    if (lastState !== details.state) {
      warnState(
        page,
        details.state === "missing_tag" ? "missing_tag" : "ineligible_page",
        {
          productId: details.productId,
          tags: details.tags,
          eligibilityStatus: details.state
        }
      );
      page.setAttribute("data-blind-box-last-page-state", details.state);
    }

    setSetupMessage(page, details);

    if (details.diagnosticsEnabled) {
      page.hidden = false;
      if (liveContent) {
        liveContent.hidden = true;
      }
      if (setupContent) {
        setupContent.hidden = false;
      }
      return false;
    }

    page.hidden = true;
    if (liveContent) {
      liveContent.hidden = true;
    }
    if (setupContent) {
      setupContent.hidden = true;
    }
    return false;
  }

  function readVariantIdFromForm(form) {
    if (!form) {
      return "";
    }

    var checkedIdInput = form.querySelector("input[name='id']:checked");
    if (checkedIdInput && normalizeValue(checkedIdInput.value)) {
      return normalizeValue(checkedIdInput.value);
    }

    var selectedIdInput = form.querySelector("select[name='id']");
    if (selectedIdInput && normalizeValue(selectedIdInput.value)) {
      return normalizeValue(selectedIdInput.value);
    }

    var idInput = form.querySelector("input[name='id']");
    if (idInput && normalizeValue(idInput.value)) {
      return normalizeValue(idInput.value);
    }

    return "";
  }

  function readVariantIdFromUrl() {
    try {
      var searchParams = new URLSearchParams(window.location.search);
      return normalizeValue(searchParams.get("variant"));
    } catch (_error) {
      return "";
    }
  }

  function findNativeProductForm(root) {
    var forms = findCandidateProductForms(root);
    return forms.length > 0 ? forms[0] : null;
  }

  function isNativeProductUnavailable(nativeProductForm) {
    if (!nativeProductForm) {
      return false;
    }

    var nativeSubmit = nativeProductForm.querySelector(
      "button[type='submit'], input[type='submit']"
    );

    return Boolean(nativeSubmit && nativeSubmit.disabled);
  }

  function getCurrentVariantId(root, nativeProductForm) {
    return (
      readVariantIdFromForm(nativeProductForm) ||
      readVariantIdFromUrl() ||
      normalizeValue(root.getAttribute("data-initial-variant-id"))
    );
  }

  function getNodes(root) {
    return {
      variantInput: root.querySelector("[data-blind-box-variant-input]"),
      quantityInput: root.querySelector("[data-blind-box-quantity-input]"),
      submitButton: root.querySelector("[data-blind-box-submit]"),
      errorNode: root.querySelector("[data-blind-box-error]"),
      variantNote: root.querySelector("[data-blind-box-variant-note]"),
      formDiagnostic: root.querySelector("[data-blind-box-form-diagnostic]")
    };
  }

  function setError(root, message) {
    var nodes = getNodes(root);
    if (!nodes.errorNode) {
      return;
    }

    if (message) {
      nodes.errorNode.hidden = false;
      nodes.errorNode.textContent = message;
      root.setAttribute("data-state", "error");
      return;
    }

    nodes.errorNode.hidden = true;
    nodes.errorNode.textContent = "";

    if (root.getAttribute("data-state") === "error") {
      root.setAttribute("data-state", "idle");
    }
  }

  function setVariantNote(root, message) {
    var nodes = getNodes(root);
    if (nodes.variantNote) {
      nodes.variantNote.textContent = message;
    }
  }

  function setFormDiagnostic(root, isVisible) {
    var nodes = getNodes(root);
    var page = root.closest(PAGE_SELECTOR);

    if (!nodes.formDiagnostic) {
      return;
    }

    nodes.formDiagnostic.hidden = !(isVisible && shouldShowDiagnostics(page));
  }

  function logState(scopeNode, label, details) {
    if (!canLogForNode(scopeNode)) {
      return;
    }

    try {
      console.info("[BlindBoxStorefront]", label, details);
    } catch (_error) {
      // no-op
    }
  }

  function warnState(scopeNode, label, details) {
    if (!canLogForNode(scopeNode)) {
      return;
    }

    try {
      console.warn("[BlindBoxStorefront]", label, details);
    } catch (_error) {
      // no-op
    }
  }

  function syncRoot(root) {
    if (!document.body.contains(root)) {
      return;
    }

    var page = root.closest(PAGE_SELECTOR);
    var nativeProductForm = findNativeProductForm(root);
    var nodes = getNodes(root);
    var currentVariantId = getCurrentVariantId(root, nativeProductForm);
    var isUnavailable =
      isNativeProductUnavailable(nativeProductForm) ||
      (root.getAttribute("data-initial-variant-available") === "false" &&
        !currentVariantId);

    if (nodes.variantInput) {
      nodes.variantInput.value = currentVariantId;
    }

    if (nodes.quantityInput) {
      nodes.quantityInput.value = "1";
    }

    root.setAttribute("data-selected-variant-id", currentVariantId);

    if (!nodes.submitButton) {
      return;
    }

    if (!nativeProductForm) {
      nodes.submitButton.disabled = true;
      nodes.submitButton.setAttribute("aria-disabled", "true");
      nodes.submitButton.textContent = normalizeValue(
        root.getAttribute("data-button-default-label")
      );
      setVariantNote(
        root,
        shouldShowDiagnostics(page)
          ? "Unable to locate product form — theme incompatibility."
          : "Blind Box purchase is temporarily unavailable."
      );
      setFormDiagnostic(root, true);

      if (root.getAttribute("data-missing-native-form-logged") !== "true") {
        root.setAttribute("data-missing-native-form-logged", "true");
        warnState(root, "missing_product_form", {
          productId: normalizeValue(root.getAttribute("data-product-id")),
          selectedVariantId: currentVariantId
        });
      }

      return;
    }

    setFormDiagnostic(root, false);

    var previousVariantId = normalizeValue(root.getAttribute("data-last-logged-variant-id"));
    if (currentVariantId && currentVariantId !== previousVariantId) {
      root.setAttribute("data-last-logged-variant-id", currentVariantId);
      logState(root, "variant_sync", {
        productId: normalizeValue(root.getAttribute("data-product-id")),
        selectedVariantId: currentVariantId
      });
    }

    if (!currentVariantId) {
      nodes.submitButton.disabled = true;
      nodes.submitButton.setAttribute("aria-disabled", "true");
      setVariantNote(
        root,
        normalizeValue(root.getAttribute("data-missing-variant-message"))
      );
      return;
    }

    if (isUnavailable) {
      nodes.submitButton.disabled = true;
      nodes.submitButton.setAttribute("aria-disabled", "true");
      setVariantNote(
        root,
        normalizeValue(root.getAttribute("data-unavailable-message"))
      );
      return;
    }

    nodes.submitButton.disabled = false;
    nodes.submitButton.setAttribute("aria-disabled", "false");
    nodes.submitButton.textContent = normalizeValue(
      root.getAttribute("data-button-default-label"))
    ;
    setVariantNote(
      root,
      "Quantity is fixed at 1 per add-to-cart action for this blind-box purchase."
    );

    if (root.getAttribute("data-state") !== "submitting") {
      setError(root, "");
    }
  }

  function registerRoot(root) {
    if (root.getAttribute("data-blind-box-product-shell-ready") === "true") {
      return;
    }

    root.setAttribute("data-blind-box-product-shell-ready", "true");
    roots.push(root);

    var pageDetails = getPageDetails(root.closest(PAGE_SELECTOR));
    logState(root, "init", {
      productId: normalizeValue(root.getAttribute("data-product-id")),
      selectedVariantId: normalizeValue(root.getAttribute("data-initial-variant-id")),
      tags: pageDetails.tags,
      eligibilityStatus: pageDetails.state
    });

    syncRoot(root);
  }

  function refreshRoots() {
    var pages = document.querySelectorAll(PAGE_SELECTOR);
    Array.prototype.forEach.call(pages, syncPageVisibility);

    roots = roots.filter(function (root) {
      return document.body.contains(root);
    });

    var discoveredRoots = document.querySelectorAll(ROOT_SELECTOR);
    Array.prototype.forEach.call(discoveredRoots, function (root) {
      var page = root.closest(PAGE_SELECTOR);
      if (!page || page.getAttribute("data-blind-box-eligible") === "true") {
        registerRoot(root);
      }
    });

    roots.forEach(syncRoot);
  }

  function scheduleRefresh() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      refreshRoots();
    });
  }

  function handleSubmit(event) {
    var form = event.target;

    if (!form || !form.matches("[data-blind-box-purchase-form]")) {
      return;
    }

    var root = form.closest(ROOT_SELECTOR);
    if (!root) {
      return;
    }

    syncRoot(root);

    var nodes = getNodes(root);
    var currentVariantId = normalizeValue(root.getAttribute("data-selected-variant-id"));

    if (!currentVariantId) {
      event.preventDefault();
      setError(
        root,
        normalizeValue(root.getAttribute("data-missing-variant-message"))
      );
      return;
    }

    if (nodes.submitButton && nodes.submitButton.disabled) {
      event.preventDefault();
      setError(
        root,
        normalizeValue(root.getAttribute("data-unavailable-message"))
      );
      return;
    }

    if (nodes.variantInput) {
      nodes.variantInput.value = currentVariantId;
    }

    if (nodes.quantityInput) {
      nodes.quantityInput.value = "1";
    }

    if (nodes.submitButton) {
      nodes.submitButton.disabled = true;
      nodes.submitButton.textContent = normalizeValue(
        root.getAttribute("data-button-loading-label")
      );
    }

    root.setAttribute("data-state", "submitting");
    setError(root, "");

    logState(root, "submit", {
      productId: normalizeValue(root.getAttribute("data-product-id")),
      selectedVariantId: currentVariantId
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshRoots, { once: true });
  } else {
    refreshRoots();
  }

  document.addEventListener("change", scheduleRefresh, true);
  document.addEventListener("submit", handleSubmit, true);
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("blind_box_debug_refresh", scheduleRefresh);

  var observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["value", "checked", "disabled", "aria-disabled"]
  });
})();
