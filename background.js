// Background service worker (MV3)
// - Listens to HTTP responses for specific URL patterns
// - Stores configurable URL patterns in chrome.storage

const DEFAULT_CONFIG = {
  listenUrlPatterns: [
    "https://www.youtube.com/api/timedtext?*",
  ],
  injectDomains: [
    "www.youtube.com"
  ]
};

// In-memory map: videoId (v param) -> parsed JSON response
// Note: This resets when the service worker is terminated/restarted.
const responseJsonByVideoId = new Map();

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_CONFIG, (items) => resolve(items));
  });
}

// Listen helpers
function handleCompleted(details) {
  console.log("[PreviewTube] Request completed:", {
    url: details.url,
    statusCode: details.statusCode,
    ip: details.ip,
    fromCache: details.fromCache,
    method: details.method,
    responseHeaders: details.responseHeaders
  });
}

function handleBeforeRequest(details) {
  console.log("[PreviewTube] handleBeforeRequest called for:", details.url);
  try {
    const filter = chrome.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    let buffered = "";

    filter.ondata = (event) => {
      try {
        buffered += decoder.decode(event.data, { stream: true });
      } catch (e) {
        // ignore decode errors mid-stream
      }
      // Defer writing until onstop so we don't duplicate output
    };

    filter.onstop = () => {
      try {
        buffered += decoder.decode();
        try {
          const json = JSON.parse(buffered);
          const urlObj = new URL(details.url);
          const videoId = urlObj.searchParams.get("v");
          if (videoId) {
            console.log("[PreviewTube] JSON response stored", { videoId });
            responseJsonByVideoId.set(videoId, json);
          } else {
            console.log("[PreviewTube] JSON response (no v param)", { url: details.url });
          }
        } catch (e) {
          // Not JSON; leave map untouched
        }
        // Always write back original body, unchanged
        filter.write(encoder.encode(buffered));
      } catch (e) {
        // best-effort pass-through
      } finally {
        filter.disconnect();
      }
    };
  } catch (err) {
    console.warn("[PreviewTube] filterResponseData failed", err);
  }
}

async function installListeners() {
  const { listenUrlPatterns } = await getConfig();

  if (chrome.webRequest && chrome.webRequest.onCompleted) {
    if (chrome.webRequest.onCompleted.hasListener(handleCompleted)) {
      chrome.webRequest.onCompleted.removeListener(handleCompleted);
    }
    chrome.webRequest.onCompleted.addListener(
      handleCompleted,
      { urls: listenUrlPatterns },
      ["responseHeaders"]
    );
  }

  if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
    if (chrome.webRequest.onBeforeRequest.hasListener(handleBeforeRequest)) {
      chrome.webRequest.onBeforeRequest.removeListener(handleBeforeRequest);
    }
    chrome.webRequest.onBeforeRequest.addListener(
      handleBeforeRequest,
      { urls: listenUrlPatterns }
    );
    console.log("[PreviewTube] onBeforeRequest listener installed for:", listenUrlPatterns);
  } else {
    console.warn("[PreviewTube] chrome.webRequest.onBeforeRequest not available");
  }

  console.log("[PreviewTube] webRequest listeners installed for:", listenUrlPatterns);
}

// Install listeners immediately when service worker starts
installListeners();

chrome.runtime.onInstalled.addListener(() => {
  installListeners();
});

// Also ensure listener is active on startup (not only on install/update)
chrome.runtime.onStartup.addListener(() => {
  installListeners();
});

// Automatically inject content.js when YouTube pages load
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  
  const config = await getConfig();
  const targetDomains = new Set(config.injectDomains || []);

  try {
    const url = new URL(tab.url);
    if (!targetDomains.has(url.hostname)) return;

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Inject content.js as a script tag
        if (!document.getElementById("previewtube-content-script")) {
          const script = document.createElement("script");
          script.id = "previewtube-content-script";
          script.src = chrome.runtime.getURL("content.js");
          script.onload = () => {
            console.log("[PreviewTube] content.js loaded via script tag");
          };
          script.onerror = () => {
            console.error("[PreviewTube] Failed to load content.js");
          };
          document.documentElement.appendChild(script);
        }
      }
    });
  } catch (err) {
    console.warn("[PreviewTube] Failed to inject script:", err);
  }
});


// Optional: simple query API to fetch stored JSON by URL or by videoId
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "PreviewTube.getResponseForUrl") {
    try {
      const urlObj = new URL(message.url);
      const videoId = urlObj.searchParams.get("v");
      const json = videoId ? responseJsonByVideoId.get(videoId) : undefined;
      sendResponse({ videoId, json });
    } catch (_) {
      sendResponse({ videoId: undefined, json: undefined });
    }
    return true;
  }

  if (message.type === "PreviewTube.getResponseForVideoId") {
    const json = responseJsonByVideoId.get(message.videoId);
    sendResponse({ videoId: message.videoId, json });
    return true;
  }
});


