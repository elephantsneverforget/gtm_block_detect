const BLOCKEDCHECKRUN = "__blocked_check_run";

// // Set DEBUG based on the URL parameter
let DEBUG = false;
const url = window.location.href;
const urlObj = new URL(url);
const debugParam = urlObj.searchParams.get("debug");
if (debugParam !== null) {
  DEBUG = debugParam.toLowerCase() === "true";
}

const __gtm_checks = (function () {
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
  }

  async function storeResultInFirestore(
    shimmingDetected,
    blockingDetected,
    shopifyY,
    privateBrowsingDetected
  ) {
    const userAgent = navigator.userAgent;
    const domain = window.location.hostname; // Getting the domain
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/gtm-ad-block-testing-sep-2023/databases/(default)/documents/users?documentId=${shopifyY}`;
    const headers = {
      "Content-Type": "application/json",
    };

    const data = {
      fields: {
        shimmingDetected: { booleanValue: shimmingDetected },
        blockingDetected: { booleanValue: blockingDetected },
        privateBrowsingDetected: { stringValue: privateBrowsingDetected },
        userAgent: { stringValue: userAgent },
        domain: { stringValue: domain },
      },
    };

    try {
      const response = await fetch(firestoreUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const jsonResponse = await response.json();
        if (DEBUG) console.log("Document successfully written!", jsonResponse);
      } else {
        if (DEBUG) console.log("Error writing document: ", response.status);
      }
    } catch (error) {
      if (DEBUG) console.error("Error writing document: ", error);
    }
  }

  async function shimmingDetected() {
    if (!window.google_tag_manager || !window.google_tag_manager.dataLayerEx)
      return true;
    return false;
  }

  async function detectPrivateBrowsing() {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/gh/Joe12387/detectIncognito@v1.3.0/dist/es5/detectIncognito.min.js";

      script.onload = async function () {
        try {
          const result = await detectIncognito();
          resolve(result.isPrivate ? "true" : "false");
        } catch (error) {
          console.error("Error calling detectIncognito:", error);
          resolve(`Error calling detectIncognito: ${error}`);
        }
      };

      script.onerror = function (error) {
        console.error("Failed to load the script.");
        resolve(`Failed to load the script: ${error}`);
      };

      document.head.appendChild(script);
    });
  }

  async function botDetected() {
    try {
      const BotdModule = await import("https://openfpcdn.io/botd/v1");
      const botd = await BotdModule.load();
      const result = await botd.detect();
      return result.bot;
    } catch (error) {
      if (DEBUG) console.error(error);
      return false;
    }
  }

  // Detect if GTM was blocked or shimmed
  async function gtmBlockedChecks(gtmHasLoaded) {
    if (DEBUG) debugger;
    const shopifyY = getCookie("_shopify_y");
    if (DEBUG) console.log("_shopify_y is", shopifyY);
    const botWasDetected = await botDetected();
    if (typeof shopifyY === "undefined" || botWasDetected) {
      if (DEBUG) console.log("Bot detected or _shopify_y is undefined");
      localStorage.setItem(BLOCKEDCHECKRUN, true);
      return;
    }

    // Detect private browsing mode
    const privateBrowsingDetected = await detectPrivateBrowsing();

    const gtmBlockedOnLoad = !gtmHasLoaded;
    if (DEBUG) console.log("GTM was blocked on load: ", gtmBlockedOnLoad);
    const shimmingWasDetected = await shimmingDetected();
    if (DEBUG) console.log("Shimming was detected: ", shimmingWasDetected);
    localStorage.setItem(BLOCKEDCHECKRUN, true);
    if (DEBUG) console.log("Setting blocked check run to true");
    storeResultInFirestore(
      shimmingWasDetected,
      gtmBlockedOnLoad,
      shopifyY,
      privateBrowsingDetected
    );
    return;
  }

  return {
    gtmBlockedChecks,
  };
})();
window.__gtm_checks = __gtm_checks;

function main() {
  if (DEBUG) localStorage.removeItem(BLOCKEDCHECKRUN);
  const blockCheckAlreadyRun = localStorage.getItem(BLOCKEDCHECKRUN);
  if (DEBUG)
    console.log("Value of blockCheckAlreadyRun: ", blockCheckAlreadyRun);
  // Bail if we've already run the test. Only run once per client so that we aren't loading an extra GTM container on all page loads
  // Load generic GTM container so we aren't messing with the original GTM container
  if (!blockCheckAlreadyRun) {
    window.dataLayerEx = window.dataLayerEx || [];
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
      var f = d.getElementsByTagName(s)[0],
        j = d.createElement(s),
        dl = l != "dataLayer" ? "&l=" + l : "";
      j.async = true;
      j.onload = function () {
        if (DEBUG) console.log("The GTM script has loaded successfully.");
        window.__gtm_checks.gtmBlockedChecks(true);
      };
      j.onerror = function () {
        if (localStorage.getItem("_gtm_blocked_check_run")) return;
        if (DEBUG) console.log("Error loading the GTM script.");
        window.__gtm_checks.gtmBlockedChecks(false);
      };
      j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, "script", "dataLayerEx", "GTM-KMLMPV78");
  }
}

main();
