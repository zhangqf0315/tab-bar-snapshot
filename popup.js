const STORAGE_KEY = "tabSnapshots";

const state = {
  currentTabs: [],
  snapshots: []
};

const elements = {
  currentSummary: document.querySelector("#currentSummary"),
  currentTabs: document.querySelector("#currentTabs"),
  refreshTabs: document.querySelector("#refreshTabs"),
  snapshotName: document.querySelector("#snapshotName"),
  saveSnapshot: document.querySelector("#saveSnapshot"),
  selectAll: document.querySelector("#selectAll"),
  selectNone: document.querySelector("#selectNone"),
  selectedCount: document.querySelector("#selectedCount"),
  savedSummary: document.querySelector("#savedSummary"),
  savedSnapshots: document.querySelector("#savedSnapshots"),
  tabItemTemplate: document.querySelector("#tabItemTemplate"),
  snapshotTemplate: document.querySelector("#snapshotTemplate")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireEvents();
  if (!hasExtensionApis()) {
    showExtensionOnlyState();
    return;
  }

  await Promise.all([loadCurrentTabs(), loadSnapshots()]);
}

function wireEvents() {
  elements.refreshTabs.addEventListener("click", loadCurrentTabs);
  elements.saveSnapshot.addEventListener("click", saveSelectedSnapshot);
  elements.selectAll.addEventListener("click", () => setAllTabSelection(true));
  elements.selectNone.addEventListener("click", () => setAllTabSelection(false));
  elements.currentTabs.addEventListener("change", updateSelectedCount);
}

async function loadCurrentTabs() {
  elements.currentSummary.textContent = "正在读取浏览器标签...";
  state.currentTabs = await chrome.tabs.query({ windowType: "normal" });
  renderCurrentTabs();
}

async function loadSnapshots() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  state.snapshots = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  renderSnapshots();
}

function hasExtensionApis() {
  return Boolean(
    globalThis.chrome &&
      chrome.tabs &&
      chrome.tabs.query &&
      chrome.storage &&
      chrome.storage.local
  );
}

function showExtensionOnlyState() {
  elements.currentSummary.textContent = "请在浏览器扩展环境中运行";
  elements.currentTabs.replaceChildren(
    createEmptyState("不要用 localhost 打开 popup.html，请到扩展管理页加载整个文件夹。")
  );
  elements.savedSummary.textContent = "扩展未加载";
  elements.savedSnapshots.replaceChildren(
    createEmptyState("Chrome: chrome://extensions/；Edge: edge://extensions/")
  );
  elements.saveSnapshot.disabled = true;
  elements.refreshTabs.disabled = true;
  elements.selectAll.disabled = true;
  elements.selectNone.disabled = true;
  updateSelectedCount();
}

function renderCurrentTabs() {
  elements.currentTabs.replaceChildren();

  if (state.currentTabs.length === 0) {
    elements.currentSummary.textContent = "浏览器里没有可保存的标签";
    elements.currentTabs.append(createEmptyState("没有读取到标签"));
    updateSelectedCount();
    return;
  }

  const fragment = document.createDocumentFragment();

  state.currentTabs.forEach((tab) => {
    const item = elements.tabItemTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = item.querySelector(".tab-check");
    const favicon = item.querySelector(".favicon");

    checkbox.dataset.tabId = String(tab.id);
    item.querySelector(".tab-title").textContent = tab.title || tab.url || "未命名标签";
    item.querySelector(".tab-url").textContent = tab.url || "";
    favicon.src = tab.favIconUrl || "";

    fragment.append(item);
  });

  elements.currentTabs.append(fragment);
  elements.currentSummary.textContent = `浏览器共 ${state.currentTabs.length} 个标签`;
  updateSelectedCount();
}

function updateSelectedCount() {
  const checked = getCheckedTabIds().length;
  elements.selectedCount.textContent = `${checked} 个标签已选择`;
  elements.saveSnapshot.disabled = checked === 0;
}

function getCheckedTabIds() {
  return Array.from(elements.currentTabs.querySelectorAll(".tab-check:checked"))
    .map((input) => Number(input.dataset.tabId));
}

function setAllTabSelection(checked) {
  elements.currentTabs.querySelectorAll(".tab-check").forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateSelectedCount();
}

async function saveSelectedSnapshot() {
  const selectedIds = new Set(getCheckedTabIds());
  const tabs = state.currentTabs
    .filter((tab) => selectedIds.has(tab.id))
    .map((tab) => ({
      title: tab.title || tab.url || "未命名标签",
      url: tab.url,
      favIconUrl: tab.favIconUrl || ""
    }))
    .filter((tab) => isRestorableUrl(tab.url));

  if (tabs.length === 0) {
    elements.currentSummary.textContent = "请选择至少一个普通网页标签";
    return;
  }

  const now = new Date();
  const snapshot = {
    id: crypto.randomUUID(),
    name: elements.snapshotName.value.trim() || formatSnapshotName(now),
    createdAt: now.toISOString(),
    tabs
  };

  state.snapshots = [snapshot, ...state.snapshots];
  await persistSnapshots();
  elements.snapshotName.value = "";
  renderSnapshots();
  elements.currentSummary.textContent = `已保存 ${tabs.length} 个标签`;
}

async function persistSnapshots() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state.snapshots });
}

function renderSnapshots() {
  elements.savedSnapshots.replaceChildren();

  if (state.snapshots.length === 0) {
    elements.savedSummary.textContent = "暂无快照";
    elements.savedSnapshots.append(createEmptyState("保存后的快照会显示在这里"));
    return;
  }

  const totalTabs = state.snapshots.reduce((sum, snapshot) => sum + snapshot.tabs.length, 0);
  elements.savedSummary.textContent = `${state.snapshots.length} 个文件夹，${totalTabs} 个标签`;

  const fragment = document.createDocumentFragment();
  state.snapshots.forEach((snapshot) => {
    const card = elements.snapshotTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".snapshot-title").textContent = snapshot.name;
    card.querySelector(".snapshot-meta").textContent = `${snapshot.tabs.length} 个标签 · ${formatDateTime(snapshot.createdAt)}`;

    card.querySelector(".restore-button").addEventListener("click", () => restoreSnapshot(snapshot.id));
    card.querySelector(".delete-button").addEventListener("click", () => deleteSnapshot(snapshot.id));

    const savedTabList = card.querySelector(".saved-tab-list");
    snapshot.tabs.forEach((tab, tabIndex) => {
      const item = document.createElement("li");
      item.className = "saved-tab-item";

      const content = document.createElement("button");
      content.className = "saved-tab-content";
      content.type = "button";
      content.title = "打开这个标签";
      content.addEventListener("click", () => openSavedTab(snapshot.id, tabIndex));

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title || tab.url;

      const url = document.createElement("span");
      url.className = "tab-url";
      url.textContent = tab.url;

      const actions = document.createElement("span");
      actions.className = "saved-tab-actions";

      const openButton = document.createElement("button");
      openButton.className = "mini-button";
      openButton.type = "button";
      openButton.textContent = "打开";
      openButton.addEventListener("click", () => openSavedTab(snapshot.id, tabIndex));

      const deleteButton = document.createElement("button");
      deleteButton.className = "mini-button mini-danger-button";
      deleteButton.type = "button";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => deleteSavedTab(snapshot.id, tabIndex));

      content.append(title, url);
      actions.append(openButton, deleteButton);
      item.append(content, actions);
      savedTabList.append(item);
    });

    fragment.append(card);
  });

  elements.savedSnapshots.append(fragment);
}

async function restoreSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;

  for (const tab of snapshot.tabs) {
    if (isRestorableUrl(tab.url)) {
      await chrome.tabs.create({ url: tab.url, active: false });
    }
  }
}

async function openSavedTab(snapshotId, tabIndex) {
  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  const tab = snapshot?.tabs[tabIndex];
  if (!tab || !isRestorableUrl(tab.url)) return;

  await chrome.tabs.create({ url: tab.url, active: true });
}

async function deleteSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;

  const confirmed = confirm(`删除“${snapshot.name}”？`);
  if (!confirmed) return;

  state.snapshots = state.snapshots.filter((item) => item.id !== snapshotId);
  await persistSnapshots();
  renderSnapshots();
}

async function deleteSavedTab(snapshotId, tabIndex) {
  const snapshotIndex = state.snapshots.findIndex((item) => item.id === snapshotId);
  if (snapshotIndex === -1) return;

  const snapshot = state.snapshots[snapshotIndex];
  const tab = snapshot.tabs[tabIndex];
  if (!tab) return;

  const confirmed = confirm(`删除“${tab.title || tab.url}”？`);
  if (!confirmed) return;

  const nextTabs = snapshot.tabs.filter((_, index) => index !== tabIndex);
  if (nextTabs.length === 0) {
    state.snapshots = state.snapshots.filter((_, index) => index !== snapshotIndex);
  } else {
    state.snapshots = state.snapshots.map((item, index) =>
      index === snapshotIndex ? { ...item, tabs: nextTabs } : item
    );
  }

  await persistSnapshots();
  renderSnapshots();
}

function isRestorableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function createEmptyState(message) {
  const item = document.createElement("li");
  item.className = "empty-state";
  item.textContent = message;
  return item;
}

function formatSnapshotName(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
