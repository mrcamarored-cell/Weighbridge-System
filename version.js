const APP_VERSION = "v1.24.0";
const APP_LAST_UPDATE = "2026-07-22";

document.addEventListener("DOMContentLoaded", () => {
  const badge = document.createElement("div");
  badge.textContent = APP_VERSION;
  badge.title = "Last updated: " + APP_LAST_UPDATE;
  badge.style.cssText = `
    position: fixed; bottom: 8px; left: 12px; font-size: 11px;
    color: #a0aec0; background: rgba(255,255,255,0.85);
    padding: 3px 8px; border-radius: 6px; z-index: 999;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif; cursor: default;
  `;
  document.body.appendChild(badge);
});
