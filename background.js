// Automatically inject content.js when YouTube pages load
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url)
    return
  
  try {
    const url = new URL(tab.url);
    if (url.hostname !== "www.youtube.com")
      return;

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
