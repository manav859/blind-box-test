(function () {
  var modalMarker = "data-blind-box-modal-ready";
  if (document.documentElement.getAttribute(modalMarker) === "true") return;
  document.documentElement.setAttribute(modalMarker, "true");

  console.log("[BlindBoxModal] Script loaded");

  var STYLES = [
    ".bb-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center;}",
    ".bb-modal-overlay.bb-open{display:flex;}",
    ".bb-modal{background:#fff;border-radius:20px;padding:32px 28px 24px;max-width:420px;width:92%;box-shadow:0 12px 48px rgba(0,0,0,.22);position:relative;text-align:center;}",
    ".bb-modal__close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#aaa;line-height:1;}",
    ".bb-modal__close:hover{color:#333;}",
    ".bb-reveal-box{width:110px;height:110px;margin:0 auto 18px;border-radius:18px;background:linear-gradient(135deg,#424cab,#fd7ad4);display:flex;align-items:center;justify-content:center;font-size:52px;box-shadow:0 6px 24px rgba(66,76,171,.35);}",
    ".bb-reveal-box.bb-opening{animation:bb-pulse .6s ease-in-out infinite alternate;}",
    "@keyframes bb-pulse{from{transform:scale(1)}to{transform:scale(1.08)}}",
    ".bb-reveal-label{font-size:21px;font-weight:700;color:#222;margin-bottom:5px;}",
    ".bb-reveal-sub{font-size:13px;color:#888;margin-bottom:22px;}",
    ".bb-reveal-card{background:#f3f4ff;border:2px solid #424cab;border-radius:14px;padding:18px 20px;margin-bottom:20px;}",
    ".bb-reveal-card__eyebrow{font-size:11px;font-weight:700;color:#424cab;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;}",
    ".bb-reveal-card__name{font-size:22px;font-weight:800;color:#222;margin-bottom:6px;}",
    ".bb-reveal-card__stock{font-size:12px;color:#888;}",
    ".bb-reveal-mystery{background:#f9f0ff;border:2px dashed #fd7ad4;border-radius:14px;padding:20px;margin-bottom:20px;color:#424cab;}",
    ".bb-reveal-mystery strong{display:block;font-size:16px;margin-bottom:4px;}",
    ".bb-modal__loading{padding:28px 0;color:#888;font-size:14px;}",
    ".bb-spin{display:inline-block;animation:bb-spin 1s linear infinite;}",
    "@keyframes bb-spin{to{transform:rotate(360deg)}}",
    ".bb-modal__actions{display:flex;gap:10px;}",
    ".bb-btn-confirm{flex:1;padding:13px;background:#424cab;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s;}",
    ".bb-btn-confirm:hover:not(:disabled){background:#333d8a;}",
    ".bb-btn-confirm:disabled{opacity:.6;cursor:default;}",
    ".bb-btn-cancel{padding:13px 18px;background:#f0f0f0;color:#555;border:none;border-radius:10px;font-size:15px;cursor:pointer;}"
  ].join("");

  var styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  var overlay = document.createElement("div");
  overlay.className = "bb-modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML =
    '<div class="bb-modal">' +
      '<button class="bb-modal__close" aria-label="Close">&times;</button>' +
      '<div class="bb-reveal-box bb-opening">🎁</div>' +
      '<div class="bb-reveal-label">Opening your box…</div>' +
      '<div class="bb-reveal-sub">Selecting your item from the pool</div>' +
      '<div class="bb-modal__body"><div class="bb-modal__loading"><span class="bb-spin">⟳</span> Please wait…</div></div>' +
      '<div class="bb-modal__actions">' +
        '<button class="bb-btn-cancel">Cancel</button>' +
        '<button class="bb-btn-confirm" disabled>Please wait…</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var modalBody = overlay.querySelector(".bb-modal__body");
  var btnConfirm = overlay.querySelector(".bb-btn-confirm");
  var btnCancel = overlay.querySelector(".bb-btn-cancel");
  var btnClose = overlay.querySelector(".bb-modal__close");
  var revealBox = overlay.querySelector(".bb-reveal-box");
  var revealLabel = overlay.querySelector(".bb-reveal-label");
  var revealSub = overlay.querySelector(".bb-reveal-sub");

  var pendingAddToCartFn = null;

  function openModal(addToCartFn) {
    pendingAddToCartFn = addToCartFn;
    revealBox.className = "bb-reveal-box bb-opening";
    revealBox.textContent = "🎁";
    revealLabel.textContent = "Opening your box…";
    revealSub.textContent = "Selecting your item from the pool";
    modalBody.innerHTML = '<div class="bb-modal__loading"><span class="bb-spin">⟳</span> Please wait…</div>';
    btnConfirm.disabled = true;
    btnConfirm.textContent = "Please wait…";
    overlay.classList.add("bb-open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    overlay.classList.remove("bb-open");
    document.body.style.overflow = "";
    pendingAddToCartFn = null;
  }

  function showAssigned(data) {
    revealBox.className = "bb-reveal-box";
    revealBox.textContent = "🎉";
    btnConfirm.disabled = false;
    btnConfirm.textContent = "Add to Cart ✓";

    if (data && data.label) {
      revealLabel.textContent = "Your item is selected!";
      revealSub.textContent = "Assigned from the blind box pool · Ready to add";
      modalBody.innerHTML =
        '<div class="bb-reveal-card">' +
          '<div class="bb-reveal-card__eyebrow">Your Blind Box Item</div>' +
          '<div class="bb-reveal-card__name">' + escHtml(data.label) + '</div>' +
          (data.inventoryRemaining !== undefined
            ? '<div class="bb-reveal-card__stock">' + data.inventoryRemaining + ' left in stock after this</div>'
            : '') +
        '</div>';
    } else {
      revealLabel.textContent = "Mystery Box";
      revealSub.textContent = "Item confirmed after cart add";
      modalBody.innerHTML =
        '<div class="bb-reveal-mystery">' +
          '<strong>🎁 Surprise!</strong>' +
          'Could not load item details. Tap "Add to Cart" to continue.' +
        '</div>';
    }
  }

  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function isBlindBoxPage(page) {
    if (!page) return false;
    if (page.getAttribute("data-product-mode") === "blind-box") return true;
    if (page.getAttribute("data-blind-box-backend-status") === "active") return true;
    var tags = (page.getAttribute("data-product-tags") || "").toLowerCase();
    return tags.split(",").some(function (t) { return t.trim() === "blind-box"; });
  }

  function assignOnCart(shop, productId, callback) {
    var appUrl = (window.blindBoxAppUrl || "").replace(/\/$/, "");
    if (!appUrl) {
      console.warn("[BlindBoxModal] blindBoxAppUrl not set — showing mystery box");
      callback(null);
      return;
    }
    var cartToken = "cart-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    fetch(appUrl + "/api/storefront/blind-box/assign-on-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: shop, productId: productId, cartToken: cartToken })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        console.log("[BlindBoxModal] assign-on-cart response:", json);
        callback(json && json.success ? json.data : null);
      })
      .catch(function (err) {
        console.error("[BlindBoxModal] assign-on-cart error:", err);
        callback(null);
      });
  }

  btnConfirm.addEventListener("click", function () {
    if (btnConfirm.disabled) return;
    closeModal();
    if (typeof pendingAddToCartFn === "function") pendingAddToCartFn();
  });
  btnCancel.addEventListener("click", closeModal);
  btnClose.addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  function interceptForm(form, page) {
    if (!form || form.getAttribute("data-bb-intercepted") === "true") return;
    form.setAttribute("data-bb-intercepted", "true");

    console.log("[BlindBoxModal] Attached submit interceptor to form:", form.action || "(no action)", "page mode:", page && page.getAttribute("data-product-mode"));

    var allowNextSubmit = false;

    form.addEventListener("submit", function (e) {
      var blind = isBlindBoxPage(page);
      console.log("[BlindBoxModal] Form submit — isBlindBox:", blind, "allowNext:", allowNextSubmit, "mode:", page && page.getAttribute("data-product-mode"), "backendStatus:", page && page.getAttribute("data-blind-box-backend-status"));

      if (!blind) return;
      if (allowNextSubmit) { allowNextSubmit = false; return; }

      e.preventDefault();
      e.stopImmediatePropagation();

      var productId = page ? (page.getAttribute("data-product-id") || "") : "";
      var shop = (window.blindBoxShop || "").replace(".myshopline.com", "");
      console.log("[BlindBoxModal] Intercepted! shop:", shop, "productId:", productId, "appUrl:", window.blindBoxAppUrl);

      openModal(function () {
        allowNextSubmit = true;
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });

      assignOnCart(shop, productId, function (data) {
        showAssigned(data);
      });
    }, true);
  }

  function bindForms() {
    var pages = document.querySelectorAll("[data-blind-box-product-page]");
    console.log("[BlindBoxModal] bindForms: found", pages.length, "blind-box product page(s)");
    pages.forEach(function (page) {
      var forms = page.querySelectorAll("form");
      console.log("[BlindBoxModal] Found", forms.length, "form(s) in page. Tags:", page.getAttribute("data-product-tags"), "Mode:", page.getAttribute("data-product-mode"));
      forms.forEach(function (f) { interceptForm(f, page); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindForms, { once: true });
  } else {
    bindForms();
  }

  document.addEventListener("shopline:section:load", bindForms);
  window.addEventListener("blind_box_theme:refresh", bindForms);
  window.BlindBoxCartModal = { open: openModal, close: closeModal };
})();
