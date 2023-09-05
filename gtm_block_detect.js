const BLOCKEDCHECKRUN = "__blocked_check_run";

// // Set DEBUG based on the URL parameter
let DEBUG = false;
const url = window.location.href;
const urlObj = new URL(url);
const debugParam = urlObj.searchParams.get('debug');
if (debugParam !== null) {
  DEBUG = debugParam.toLowerCase() === 'true';
}

const __gtm_checks = (function () {
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
  }

  async function storeResultInFirestore(shimmingDetected, blockingDetected, shopifyY) {
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
    try {
      if (!window.google_tag_manager || !window.google_tag_manager.dataLayerEx) return true;

      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // Attempt to push consent states
      if (DEBUG) console.log("GTM consent entry value", window.google_tag_data?.ics?.entries);
      function gtag() {
        dataLayer.push(arguments);
      }
      // Check if ics values are updated on main data layer after consent push
      gtag("consent", "default", { security_storage: "granted" });

      // Wait for 500 ms. There may be some delay in GTM updating ICS values
      await delay(500);

      const data = window.google_tag_data?.ics?.entries;
      if (
        data !== undefined &&
        Object.keys(data).length > 0 &&
        data?.security_storage?.default === true
      ) {
        if (DEBUG) console.log("No shimming detected");
        return false;
      } else {
        if (DEBUG) console.log("Shimming detected");
        return true;
      }
    } catch (error) {
      if (DEBUG) console.error(error);
      return false;
    }
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

  async function gtmBlockedChecks(gtmHasLoaded) {
    const shopifyY = getCookie("_shopify_y");
    if (DEBUG) console.log("_shopify_y is", shopifyY);
    const botWasDetected = await botDetected();
    if (typeof shopifyY === "undefined" || botWasDetected) {
      if (DEBUG) console.log("Bot detected or _shopify_y is undefined");
      localStorage.setItem(BLOCKEDCHECKRUN, true);
      return;
    }

    const gtmBlockedOnLoad = !gtmHasLoaded;
    if (DEBUG) console.log("GTM was blocked on load: ", gtmBlockedOnLoad);
    const shimmingWasDetected = await shimmingDetected();
    if (DEBUG) console.log("Shimming was detected: ", shimmingWasDetected);
    localStorage.setItem(BLOCKEDCHECKRUN, true);
    if (DEBUG) console.log("Setting blocked check run to true");
    storeResultInFirestore(shimmingWasDetected, gtmBlockedOnLoad, shopifyY);
    return;
  }

  return {
    gtmBlockedChecks,
  };
})();
window.__gtm_checks = __gtm_checks;

function main() {
  const blockCheckAlreadyRun = localStorage.getItem(BLOCKEDCHECKRUN);
  if (DEBUG)
    console.log("Value of blockCheckAlreadyRun: ", blockCheckAlreadyRun);
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
