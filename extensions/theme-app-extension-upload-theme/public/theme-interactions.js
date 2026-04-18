(function () {
  var marker = "data-blind-box-theme-interactions-ready";

  if (!document.documentElement || document.documentElement.getAttribute(marker) === "true") {
    return;
  }

  document.documentElement.setAttribute(marker, "true");

  var blindBoxTheme = window.BlindBoxTheme || {};
  var normalizeValue =
    blindBoxTheme.normalizeValue ||
    function (value) {
      return value == null ? "" : String(value).trim();
    };

  function isBlindBoxProduct(product) {
    if (blindBoxTheme && typeof blindBoxTheme.isBlindBoxProduct === "function") {
      return blindBoxTheme.isBlindBoxProduct(product);
    }

    return false;
  }

  function toNumber(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampQuantity(value) {
    return Math.max(1, toNumber(value, 1));
  }

  function syncProductQuantity(form, isBlindBox) {
    var quantityField = form ? form.querySelector("[data-quantity-field]") : null;
    var quantityInput = form ? form.querySelector('input[name="quantity"]') : null;
    var quantityButtons = quantityField
      ? quantityField.querySelectorAll("[data-quantity-trigger]")
      : [];

    if (!quantityInput) {
      return;
    }

    if (isBlindBox) {
      quantityInput.value = "1";
      quantityInput.setAttribute("max", "1");
      quantityInput.setAttribute("readonly", "readonly");

      Array.prototype.forEach.call(quantityButtons, function (button) {
        button.disabled = true;
      });

      return;
    }

    quantityInput.removeAttribute("max");
    quantityInput.removeAttribute("readonly");

    Array.prototype.forEach.call(quantityButtons, function (button) {
      button.disabled = false;
    });
  }

  function syncProductForm(form) {
    if (!form) {
      return;
    }

    var variantSelect = form.querySelector("[data-product-variant-select]");
    var sectionRoot = form.closest("[data-product-section]");
    var selectedOption =
      variantSelect && variantSelect.options.length > 0
        ? variantSelect.options[variantSelect.selectedIndex]
        : null;

    if (!sectionRoot) {
      return;
    }

    var isBlindBox = isBlindBoxProduct(sectionRoot);
    syncProductQuantity(form, isBlindBox);

    var isAvailable = selectedOption
      ? normalizeValue(selectedOption.getAttribute("data-available")) !== "false"
      : normalizeValue(sectionRoot.getAttribute("data-initial-variant-available")) !== "false";
    var price = selectedOption
      ? normalizeValue(selectedOption.getAttribute("data-price"))
      : normalizeValue(sectionRoot.getAttribute("data-initial-product-price"));
    var priceNodes = sectionRoot.querySelectorAll("[data-product-price-display]");
    var availabilityNode = form.querySelector("[data-product-availability-note]");
    var submitButtons = sectionRoot.querySelectorAll("[data-product-submit]");
    var availableLabel = isBlindBox
      ? normalizeValue(sectionRoot.getAttribute("data-blind-box-add-label")) || "Add Blind Box to Cart"
      : normalizeValue(sectionRoot.getAttribute("data-standard-add-label")) || "Add to cart";
    var soldOutLabel =
      normalizeValue(sectionRoot.getAttribute("data-soldout-label")) || "Sold out";

    Array.prototype.forEach.call(priceNodes, function (node) {
      if (price) {
        node.textContent = price;
      }
    });

    Array.prototype.forEach.call(submitButtons, function (button) {
      button.disabled = !isAvailable;
      button.textContent = isAvailable ? availableLabel : soldOutLabel;
    });

    if (availabilityNode) {
      if (isBlindBox) {
        availabilityNode.textContent = isAvailable
          ? "This is a blind box. One surprise item will be assigned after payment."
          : "Selected blind box edition is currently sold out. Choose another variant.";
      } else {
        availabilityNode.textContent = isAvailable
          ? "Selected edition is available for checkout."
          : "Selected edition is currently sold out. Choose another variant.";
      }
    }

    sectionRoot.setAttribute("data-selected-variant-available", isAvailable ? "true" : "false");

    var mediaId = selectedOption
      ? normalizeValue(selectedOption.getAttribute("data-media-id"))
      : normalizeValue(sectionRoot.getAttribute("data-initial-media-id"));
    if (!mediaId) {
      return;
    }

    var mediaNodes = sectionRoot.querySelectorAll("[data-product-media-id]");
    var thumbnailNodes = sectionRoot.querySelectorAll("[data-product-thumbnail-id]");
    var hasMatchingMedia = false;

    Array.prototype.forEach.call(mediaNodes, function (mediaNode) {
      if (mediaNode.getAttribute("data-product-media-id") === mediaId) {
        hasMatchingMedia = true;
      }
    });

    if (!hasMatchingMedia) {
      return;
    }

    Array.prototype.forEach.call(mediaNodes, function (mediaNode) {
      mediaNode.hidden = mediaNode.getAttribute("data-product-media-id") !== mediaId;
    });

    Array.prototype.forEach.call(thumbnailNodes, function (thumbnailNode) {
      thumbnailNode.setAttribute(
        "data-active",
        thumbnailNode.getAttribute("data-product-thumbnail-id") === mediaId ? "true" : "false"
      );
    });
  }

  function syncBlindBoxCards() {
    var cards = document.querySelectorAll("[data-blind-box-card]");

    Array.prototype.forEach.call(cards, function (card) {
      card.setAttribute("data-blind-box-mode", isBlindBoxProduct(card) ? "blind-box" : "standard");
    });
  }

  function syncBlindBoxCartLines() {
    var lines = document.querySelectorAll("[data-blind-box-cart-line]");

    Array.prototype.forEach.call(lines, function (line) {
      var blindBoxLine = isBlindBoxProduct(line);
      var quantityInput = line.querySelector("[data-cart-quantity-input]");
      var quantityButtons = line.querySelectorAll("[data-cart-quantity-trigger]");

      line.setAttribute("data-blind-box-mode", blindBoxLine ? "blind-box" : "standard");

      if (quantityInput) {
        if (blindBoxLine) {
          quantityInput.value = "1";
          quantityInput.setAttribute("max", "1");
          quantityInput.setAttribute("readonly", "readonly");
        } else {
          quantityInput.removeAttribute("max");
          quantityInput.removeAttribute("readonly");
        }
      }

      Array.prototype.forEach.call(quantityButtons, function (button) {
        button.disabled = blindBoxLine;
      });
    });
  }

  function initializeProductForms() {
    var forms = document.querySelectorAll("[data-product-native-form]");
    Array.prototype.forEach.call(forms, syncProductForm);
  }

  function initializeBlindBoxMerchandising() {
    syncBlindBoxCards();
    syncBlindBoxCartLines();
  }

  function closeOpenNavigation(excludedToggle) {
    var navPanels = document.querySelectorAll("[data-nav-panel]");
    var navToggles = document.querySelectorAll("[data-nav-toggle]");

    Array.prototype.forEach.call(navPanels, function (panel) {
      panel.setAttribute("data-open", "false");
    });

    Array.prototype.forEach.call(navToggles, function (toggle) {
      if (toggle !== excludedToggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  async function updateCartLine(input, quantity) {
    if (!input || !window.routes || !window.routes.cart_change_url) {
      return;
    }

    var line = input.closest("[data-cart-line]");
    var key = normalizeValue(input.getAttribute("data-key"));
    var nextQuantity = clampQuantity(quantity);

    if (!line || !key) {
      return;
    }

    if (isBlindBoxProduct(line)) {
      nextQuantity = 1;
      input.value = "1";
    }

    line.setAttribute("data-updating", "true");

    try {
      await fetch(window.routes.cart_change_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          id: key,
          quantity: nextQuantity
        })
      });

      window.location.reload();
    } catch (_error) {
      line.setAttribute("data-updating", "false");
    }
  }

  document.addEventListener("click", function (event) {
    var quantityTrigger = event.target.closest("[data-quantity-trigger]");
    if (quantityTrigger) {
      var targetSelector = normalizeValue(quantityTrigger.getAttribute("data-target"));
      var quantityField = quantityTrigger.closest("[data-quantity-field]");
      var targetInput = targetSelector
        ? document.querySelector(targetSelector)
        : quantityField
          ? quantityField.querySelector("input")
          : null;

      if (targetInput) {
        var nextValue =
          clampQuantity(targetInput.value) +
          (normalizeValue(quantityTrigger.getAttribute("data-direction")) === "decrease" ? -1 : 1);
        targetInput.value = clampQuantity(nextValue);
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    var cartTrigger = event.target.closest("[data-cart-quantity-trigger]");
    if (cartTrigger) {
      var cartLine = cartTrigger.closest("[data-cart-line]");
      var cartInput = cartLine ? cartLine.querySelector("[data-cart-quantity-input]") : null;

      if (!cartInput) {
        return;
      }

      event.preventDefault();

      var direction = normalizeValue(cartTrigger.getAttribute("data-direction"));
      var nextQuantity = clampQuantity(cartInput.value) + (direction === "decrease" ? -1 : 1);
      updateCartLine(cartInput, clampQuantity(nextQuantity));
      return;
    }

    var thumbnail = event.target.closest("[data-product-thumbnail-id]");
    if (thumbnail) {
      var sectionRoot = thumbnail.closest("[data-product-section]");
      var mediaId = normalizeValue(thumbnail.getAttribute("data-product-thumbnail-id"));

      if (!sectionRoot || !mediaId) {
        return;
      }

      event.preventDefault();

      var mediaNodes = sectionRoot.querySelectorAll("[data-product-media-id]");
      var thumbnailNodes = sectionRoot.querySelectorAll("[data-product-thumbnail-id]");

      Array.prototype.forEach.call(mediaNodes, function (mediaNode) {
        mediaNode.hidden = mediaNode.getAttribute("data-product-media-id") !== mediaId;
      });

      Array.prototype.forEach.call(thumbnailNodes, function (thumbnailNode) {
        thumbnailNode.setAttribute(
          "data-active",
          thumbnailNode.getAttribute("data-product-thumbnail-id") === mediaId ? "true" : "false"
        );
      });

      return;
    }

    var navToggle = event.target.closest("[data-nav-toggle]");
    if (navToggle) {
      var controls = normalizeValue(navToggle.getAttribute("aria-controls"));
      var navPanel = controls ? document.getElementById(controls) : null;
      var shouldOpen = !navPanel || navPanel.getAttribute("data-open") !== "true";

      closeOpenNavigation(navToggle);

      if (navPanel) {
        navPanel.setAttribute("data-open", shouldOpen ? "true" : "false");
      }

      navToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      return;
    }

    if (!event.target.closest("[data-nav-panel]")) {
      closeOpenNavigation();
    }
  });

  document.addEventListener("change", function (event) {
    var variantSelect = event.target.closest("[data-product-variant-select]");
    if (variantSelect) {
      syncProductForm(variantSelect.closest("[data-product-native-form]"));
      return;
    }

    var cartQuantityInput = event.target.closest("[data-cart-quantity-input]");
    if (cartQuantityInput) {
      updateCartLine(cartQuantityInput, cartQuantityInput.value);
      return;
    }

    var sortSelect = event.target.closest("[data-sort-by-select]");
    if (sortSelect) {
      var url = new URL(window.location.href);
      var sortValue = normalizeValue(sortSelect.value);

      if (sortValue) {
        url.searchParams.set("sort_by", sortValue);
      } else {
        url.searchParams.delete("sort_by");
      }

      window.location.assign(url.toString());
    }
  });

  function initializeThemeInteractions() {
    initializeProductForms();
    initializeBlindBoxMerchandising();
    closeOpenNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeThemeInteractions, { once: true });
  } else {
    initializeThemeInteractions();
  }

  document.addEventListener("shopline:section:load", initializeThemeInteractions);
})();
