(function () {
  if (window.BlindBoxTheme && window.BlindBoxTheme.version === "1.0.0") {
    return;
  }

  var SUPPORTED_TAGS = {
    "blind-box": true
  };

  function normalizeValue(value) {
    return value == null ? "" : String(value).trim();
  }

  function readRawTags(product) {
    if (!product) {
      return "";
    }

    if (typeof product === "string") {
      return normalizeValue(product);
    }

    if (Array.isArray(product)) {
      return product.join(",");
    }

    if (product.nodeType === 1) {
      return normalizeValue(
        product.getAttribute("data-product-tags") ||
          product.getAttribute("data-tags") ||
          product.getAttribute("data-blind-box-tags")
      );
    }

    if (product.dataset) {
      return normalizeValue(
        product.dataset.productTags || product.dataset.tags || product.dataset.blindBoxTags
      );
    }

    if (product.tags != null) {
      return Array.isArray(product.tags) ? product.tags.join(",") : normalizeValue(product.tags);
    }

    return "";
  }

  function parseTags(product) {
    return readRawTags(product)
      .split(",")
      .map(function (tag) {
        return normalizeValue(tag).toLowerCase();
      })
      .filter(Boolean);
  }

  function isBlindBoxProduct(product) {
    var tags = parseTags(product);

    for (var index = 0; index < tags.length; index += 1) {
      if (SUPPORTED_TAGS[tags[index]]) {
        return true;
      }
    }

    return false;
  }

  window.BlindBoxTheme = {
    version: "1.0.0",
    normalizeValue: normalizeValue,
    parseTags: parseTags,
    isBlindBoxProduct: isBlindBoxProduct,
    supportedTags: Object.keys(SUPPORTED_TAGS)
  };
})();
