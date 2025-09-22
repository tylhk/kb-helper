async function buildMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "save-to-app",
    title: "保存到 KB Helper",
    contexts: ["page", "link"]
  });
}
chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

async function sendToApp(payload) {
  try {
    await fetch("http://127.0.0.1:17645/add", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
  } catch (e) {
    const q = new URLSearchParams(payload).toString();
    chrome.tabs.create({ url: `kb-helper://add?${q}` });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-app") return;

  const isLink = !!info.linkUrl;
  const url = isLink ? (info.linkUrl || "") : (tab?.url || "");
  const title = tab?.title || "";

  await sendToApp({ url, title });
});
