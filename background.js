// Background service worker for Sportlink Waterpolo Assistant

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-lookup") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "toggle-modal" }).catch(() => {
        // Tab might not be on sportlink.com or content script not yet injected
      });
    }
  }
});

// Handle messages from popup or content script if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch-api") {
    fetch(request.url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      credentials: "include"
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        sendResponse({ success: true, data });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }
});
