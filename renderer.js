const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
let FOLDERS_RENDER_GEN = 0;
let STATE = {
  resources: [],
  folders: [],
  tags: [],
  q: "",
  filterFolder: "",
  selectedId: null,
};
window.__DND__ = { folder: null, res: null };
const UNCAT = "__UNCAT__";
document.addEventListener("dragend", () => document.body.classList.remove("dragging-folder"), true);
document.addEventListener("drop", () => document.body.classList.remove("dragging-folder"), true);
function ensureToast() {
  let w = $("#toastWrap");
  if (!w) {
    w = document.createElement("div");
    w.id = "toastWrap";
    w.className = "toast-wrap";
    document.body.appendChild(w);
  }
  return w;
}
function toast(msg, type = "info", ms = 2200) {
  const w = ensureToast();
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
  }, ms - 260);
  setTimeout(() => el.remove(), ms);
}
function openFormModal({
  title,
  bodyHTML,
  onSubmit,
  okText = "确定",
  cancelText = "取消",
}) {
  const modal = document.getElementById("modal");
  const titleEl = document.getElementById("modalTitle");
  const form = document.getElementById("modalForm");
  const okBtn = document.getElementById("modalOk");
  const cancel = document.getElementById("modalCancel");
  const host = document.getElementById('viewerHost');
  let resumed = false;
  const resumePreview = () => {
    if (resumed) return; resumed = true;
    try {
      document.body.classList.remove('menu-open');
      if (host && window.preview?.setBounds) {
        const r = host.getBoundingClientRect();
        window.preview.setBounds({
          width: Math.round(r.width), height: Math.round(r.height)
        });
      }
    } catch { }
  };
  try {
    document.body.classList.add('menu-open');
    if (host && window.preview?.setBounds) {
      window.preview.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    }
  } catch { }
  if (!modal || !titleEl || !form || !okBtn || !cancel) {
    toast("弹窗初始化失败", "error");
    return;
  }

  okBtn.disabled = false;
  okBtn.classList.remove("is-disabled");
  cancel.disabled = false;

  titleEl.textContent = title;
  form.innerHTML = bodyHTML;
  okBtn.textContent = okText;

  if (cancelText === "") {
    cancel.style.display = "none";
  } else {
    cancel.style.display = "";
    cancel.textContent = cancelText;
  }

  form.querySelectorAll("input,select,textarea").forEach((el) => {
    el.style.padding = "10px";
    el.style.borderRadius = "10px";
    el.style.border = "1px solid var(--line)";
    el.style.background = "#0e0f12";
    el.style.color = "var(--fg)";
    el.style.outline = "none";
  });

  const oldHandler = form.__kb_submit_handler__;
  if (oldHandler) form.removeEventListener("submit", oldHandler);

  const handler = async (ev) => {
    ev.preventDefault();
    try {
      await onSubmit(new FormData(form));
      modal.classList.add("hidden");
      resumePreview();
      form.removeEventListener("submit", handler);
      form.__kb_submit_handler__ = null;
    } catch (err) {
      toast("操作失败：" + (err?.message || err), "error");
    }
  };
  form.addEventListener("submit", handler);
  form.__kb_submit_handler__ = handler;

  cancel.onclick = () => {
    modal.classList.add("hidden");
    resumePreview();
    form.removeEventListener("submit", handler);
    form.__kb_submit_handler__ = null;
  };

  modal.classList.remove("hidden");
}

function confirmBox(message, okText = "确定", cancelText = "取消") {
  return new Promise((resolve) => {
    const wrap = $("#confirmWrap"),
      msg = $("#confirmMsg"),
      ok = $("#confirmOk"),
      cancel = $("#confirmCancel");
    if (!wrap || !msg || !ok || !cancel) {
      resolve(false);
      return;
    }
    msg.textContent = message;
    ok.textContent = okText;
    cancel.textContent = cancelText;
    const off = () => {
      wrap.classList.add("hidden");
      ok.onclick = cancel.onclick = null;
    };
    ok.onclick = () => {
      off();
      resolve(true);
    };
    cancel.onclick = () => {
      off();
      resolve(false);
    };
    wrap.classList.remove("hidden");
  });
}

async function getPreviewURL() {
  return (await window.preview?.getURL?.()) || '';
}

function setPreviewButtonsVisible(visible) {
  const wrap = document.getElementById('previewActions');
  if (wrap) wrap.classList.toggle('hidden', !visible);
}

(function wireClosePreviewBtn() {
  const closeBtn = document.getElementById('btnPreviewClose');
  if (!closeBtn) return;
  closeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await openInPreview(null);
    setPreviewButtonsVisible(false);
  });
})();

const urlParams = new URLSearchParams(location.search);
const IS_OVERLAY = urlParams.get('overlay') === '1';
function setupTagBox(boxSel, inputSel, menuSel, initialTags = []) {
  const box = document.querySelector(boxSel);
  const input = document.querySelector(inputSel);
  let menu = document.querySelector(menuSel);
  if (!menu) {
    menu = document.createElement("div");
    menu.id = menuSel.startsWith("#") ? menuSel.slice(1) : menuSel;
    menu.className = "suggest-menu hidden";
    box.parentElement.classList.add("suggest");
    box.parentElement.appendChild(menu);
  }
  let tagPool = Array.from(new Set((initialTags || []).filter(Boolean)));
  let active = -1;
  const curTags = () =>
    Array.from(box.querySelectorAll(".chip[data-tag]")).map((el) =>
      el.getAttribute("data-tag")
    );
  function addChip(tag) {
    const exists = new Set(curTags().map((t) => (t || "").toLowerCase()));
    const key = (tag || "").trim();
    if (!key) return;
    if (exists.has(key.toLowerCase())) return;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.setAttribute("data-tag", key);
    chip.innerHTML = `<span>${esc(key)}</span><span class="x">✕</span>`;
    chip.querySelector(".x").onclick = () => chip.remove();
    box.insertBefore(chip, input);
    input.value = "";
    hideMenu();
  }
  function hideMenu() {
    menu.classList.add("hidden");
    active = -1;
  }
  function setActive(i) {
    active = i;
    $$("#" + menu.id + " .suggest-item").forEach((el, idx) => {
      el.classList.toggle("active", idx === i);
    });
  }
  function draw(list) {
    menu.innerHTML = list
      .map((t, i) => `<div class="suggest-item" data-i="${i}">${esc(t)}</div>`)
      .join("");
    $$("#" + menu.id + " .suggest-item").forEach((el) => {
      el.onmouseenter = () => setActive(+el.dataset.i);
      el.onclick = () => {
        addChip(el.textContent.trim());
      };
    });
    menu.classList.toggle("hidden", list.length === 0);
    if (list.length) setActive(0);
  }
  function filterAndShow() {
    const q = (input.value || "").trim().toLowerCase();
    if (!q) {
      hideMenu();
      return;
    }
    const selected = new Set(curTags().map((t) => (t || "").toLowerCase()));
    const list = tagPool
      .filter((t) => !selected.has((t || "").toLowerCase()))
      .filter((t) => (t || "").toLowerCase().includes(q))
      .slice(0, 50);
    draw(list);
  }
  input.addEventListener("keydown", async (e) => {
    const items = $$("#" + menu.id + " .suggest-item");
    if (e.key === "ArrowDown") {
      if (!items.length) return;
      e.preventDefault();
      setActive((active + 1) % items.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setActive((active - 1 + items.length) % items.length);
      return;
    }
    if (["Enter", "Tab", ",", ";"].includes(e.key)) {
      const typed = (input.value || "").trim();
      if (!menu.classList.contains("hidden") && items.length && active >= 0) {
        e.preventDefault();
        addChip(items[active].textContent.trim());
        return;
      }
      if (typed) {
        e.preventDefault();
        const hit = tagPool.find(
          (t) => t.toLowerCase() === typed.toLowerCase()
        );
        const chosen = hit || typed;
        addChip(chosen);
        if (!hit) {
          try {
            tagPool =
              (await window.api.addTag(chosen)) || tagPool.concat([chosen]);
          } catch { }
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Backspace" && !input.value) {
      const chips = box.querySelectorAll(".chip[data-tag]");
      if (chips.length) chips[chips.length - 1].remove();
    }
  });
  input.addEventListener("input", filterAndShow);
  input.addEventListener("focus", filterAndShow);
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== input) hideMenu();
  });
  return {
    getTags: () => curTags(),
    setTags: (arr = []) => {
      box.querySelectorAll(".chip[data-tag]").forEach((el) => el.remove());
      arr.forEach(addChip);
    },
  };
}
async function refresh() {
  const data = await window.api.list();
  STATE.expanded = STATE.expanded || new Set();

  STATE.resources = data.resources || [];
  const deriveFolders = (resources = []) => {
    const set = new Set();
    for (const r of resources) {
      const f = (r.folder || "").trim();
      if (!f) continue;
      const segs = f.split("/").filter(Boolean);
      let acc = "";
      for (const s of segs) { acc = acc ? acc + "/" + s : s; set.add(acc); }
    }
    return Array.from(set);
  };
  STATE.folders = Array.isArray(data.folders) && data.folders.length
    ? data.folders
    : deriveFolders(STATE.resources);
  STATE.tags = data.tags || [];

  const valid = new Set(STATE.folders);
  STATE.expanded = new Set([...STATE.expanded].filter(p => valid.has(p)));

  renderFolders();
  renderList();
}

function buildTree(paths) {
  const firstIndex = new Map();
  (paths || []).forEach((p, i) => {
    const segs = (p || "").split("/").filter(Boolean);
    let acc = "";
    for (const s of segs) {
      acc = acc ? acc + "/" + s : s;
      if (!firstIndex.has(acc)) firstIndex.set(acc, i);
    }
  });

  const root = { name: "", path: "", depth: 0, children: [] };

  for (const p of paths || []) {
    const segs = (p || "").split("/").filter(Boolean);
    let cur = root, curPath = "";
    segs.forEach((name, idx) => {
      const next = curPath ? `${curPath}/${name}` : name;
      let node = cur.children.find(c => c.path === next);
      if (!node) {
        node = { name, path: next, depth: idx + 1, children: [] };
        cur.children.push(node);
        cur.children.sort((a, b) =>
          (firstIndex.get(a.path) ?? 1e9) - (firstIndex.get(b.path) ?? 1e9)
        );
      }
      cur = node;
      curPath = next;
    });
  }

  return root.children;
}

function renderFolders() {
  const ul = $("#folderList");
  if (!ul) return;
  ul.classList.add("tree");
  ul.innerHTML = "";

  ul.appendChild(makeSpecialEntry(
    "根目录",
    "",
    STATE.filterFolder === "",
    countLinksUnder("")
  ));
  const uncatCount = (STATE.resources || []).filter(r => !r.folder).length;
  if (uncatCount > 0) {
    ul.appendChild(makeSpecialEntry("[未分类链接]", UNCAT, STATE.filterFolder === UNCAT, uncatCount));
  }
  const tree = buildTree(STATE.folders);
  const frag = document.createDocumentFragment();
  for (const node of tree) frag.appendChild(makeFolderLi(node));
  ul.appendChild(frag);

  requestAnimationFrame(() => {
    $$(".folder-item.expanded > .children").forEach(ch => {
      ch.style.maxHeight = ch.scrollHeight + "px";
    });
  });
}
function bumpAncestorHeights(fromLi) {
  let p = fromLi && fromLi.parentElement;
  while (p) {
    if (p.classList?.contains('children')) {
      const pli = p.parentElement;
      if (pli?.classList?.contains('expanded')) {
        p.style.maxHeight = '0px';
        void p.offsetHeight;
        p.style.maxHeight = p.scrollHeight + 'px';
      }
    }
    p = p.parentElement;
  }
}

function openFolderMenuFloating(menuEl, anchorBtn) {
  const rect = anchorBtn.getBoundingClientRect();
  const originLi = anchorBtn.closest("li.folder-item");
  menuEl.__originLi = originLi;
  menuEl.classList.remove("hidden");
  menuEl.classList.add("floating-menu");
  document.body.appendChild(menuEl);
  const minW = Math.max(rect.width, 160);
  menuEl.style.minWidth = minW + "px";
  menuEl.style.left = rect.left + "px";
  menuEl.style.top = (rect.bottom + 4) + "px";
  menuEl.style.right = "auto";
  menuEl.style.maxWidth = "280px";
  menuEl.style.width = "max-content";
  menuEl.style.whiteSpace = "nowrap";
  document.body.classList.add("menu-open");
  requestAnimationFrame(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    let left = Math.min(Math.max(rect.right - mw, 8), vw - 8 - mw);
    let top = rect.bottom + 4;
    if (top + mh > vh - 8) top = Math.max(8, rect.top - 4 - mh);
    menuEl.style.left = left + "px";
    menuEl.style.top = top + "px";
  });
}

function countLinksUnder(pathKey) {
  const list = STATE.resources || [];
  if (pathKey === UNCAT) return list.filter(r => !r.folder).length;
  if (!pathKey) return list.length; // 根目录
  const prefix = pathKey + "/";
  let n = 0;
  for (const r of list) {
    const f = r.folder || "";
    if (f === pathKey || f.startsWith(prefix)) n++;
  }
  return n;
}

function makeSpecialEntry(label, key, active, count = null) {
  const isRoot = (key || "") === "";
  const li = document.createElement('li');
  li.className = 'folder-item ' + (isRoot ? 'depth-0 root-entry' : 'depth-1');
  li.dataset.path = key;
  const row = document.createElement('div');
  row.className = 'folder-row';
  const spacer = document.createElement('span');
  spacer.className = 'arrow-spacer';
  row.appendChild(spacer);
  const nameWrap = document.createElement('div');
  nameWrap.className = 'name-wrap';
  const text = document.createElement('span');
  text.className = 'folder-name';
  text.textContent = label;
  nameWrap.appendChild(text);

  if (typeof count === 'number') {
    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = String(count);
    nameWrap.appendChild(badge);
  }
  row.appendChild(nameWrap);

  const right = document.createElement('div');
  if (isRoot) {
    const plus = document.createElement('button');
    plus.className = 'root-plus';
    plus.title = '新建根目录文件夹';
    plus.textContent = '＋';
    plus.onclick = async (e) => {
      e.stopPropagation();
      await openCreateRootFolder();
    };
    right.appendChild(plus);
  }
  row.appendChild(right);

  li.appendChild(row);

  if (active) {
    row.classList.add('active');
  }

  li.onclick = () => {
    STATE.filterFolder = key;
    STATE.selectedId = null;
    renderFolders();
    renderList();
  };

  if (isRoot) {
    li.ondragover = (e) => {
      const types = e.dataTransfer?.types || [];
      const hasFolder = types.includes("text/kb-folder") || document.body.classList.contains('dragging-folder');
      if (!hasFolder) return;
      e.preventDefault();
      e.stopPropagation();
      li.classList.add('as-child');
    };
    li.ondragleave = (e) => { e.stopPropagation(); li.classList.remove('as-child'); };
    li.ondrop = async (e) => {
      e.preventDefault(); e.stopPropagation(); li.classList.remove('as-child');
      const folderSrc = e.dataTransfer.getData('text/kb-folder');
      if (folderSrc) {
        await window.api.moveFolder({ sourcePath: folderSrc, targetParentPath: '' });
        STATE.filterFolder = "";
        await refresh();
        toast('已移动到：根目录');
      }
      document.body.classList.remove('dragging-folder');
    };
  }
  return li;
}

async function openCreateRootFolder() {
  await openFormModal({
    title: '新建根目录文件夹',
    bodyHTML: `
      <div class="row">
        <label>文件夹名称</label>
        <input name="name" placeholder="例如：学习 / 工作" required />
      </div>
    `,
    onSubmit: async (fd) => {
      const name = (fd.get('name') || '').toString().trim();
      if (!name) throw new Error('请输入名称');
      if (STATE.folders.some(f => f.split('/').length === 1 && f === name)) {
        throw new Error('已存在同名根目录');
      }
      await window.api.addFolder(name);
      await refresh();
      toast('已创建：' + name);
    }
  });
}
function expandChildren(el) {
  el.style.overflow = 'hidden';
  const h = el.scrollHeight;
  el.style.maxHeight = h + 'px';
  const onEnd = (e) => {
    if (e.propertyName !== 'max-height') return;
    el.removeEventListener('transitionend', onEnd);
    if (el.parentElement?.classList.contains('expanded')) {
      el.style.maxHeight = 'none';
    }
  };
  el.addEventListener('transitionend', onEnd, { once: true });
}

function collapseChildren(el) {
  el.style.overflow = 'hidden';
  const h = el.scrollHeight;
  el.style.maxHeight = h + 'px';
  void el.offsetHeight;
  el.style.maxHeight = '0px';
}

function makeFolderLi(node) {
  const li = document.createElement("li");
  const hasChildren = !!(node.children && node.children.length);
  const depth = Math.min(node.depth || 1, 4);
  li.className = `folder-item depth-${depth}` + (hasChildren ? " has-children" : "");
  li.dataset.path = node.path;
  li.style.position = "relative";
  const row = document.createElement("div");
  row.className = "folder-row";
  let arrowBtn = null;
  if (hasChildren && depth >= 1) {
    arrowBtn = document.createElement("button");
    arrowBtn.className = "folder-arrow";
    arrowBtn.type = "button";
    arrowBtn.title = "展开/收起";
    row.appendChild(arrowBtn);
  } else {
    const spacer = document.createElement("span");
    spacer.style.display = "inline-block";
    spacer.style.width = "16px";
    row.appendChild(spacer);
  }

  const nameWrap = document.createElement("div");
  nameWrap.className = "name-wrap";
  const nameEl = document.createElement("span");
  nameEl.className = "folder-name";
  nameEl.textContent = node.name;
  const badge = document.createElement("span");
  badge.className = "count-badge";
  badge.textContent = String(countLinksUnder(node.path));
  nameWrap.append(nameEl, badge);
  row.appendChild(nameWrap);
  const kebab = document.createElement("button");
  kebab.className = "kebab";
  kebab.type = "button";
  kebab.textContent = "⋯";
  row.appendChild(kebab);
  kebab.onclick = (e) => {
    e.stopPropagation();
    openFolderMenuFloating(menu, kebab);
  };
  const menu = document.createElement("div");
  menu.className = "folder-menu hidden";
  menu.innerHTML = `
    <div data-act="new-folder">新建文件夹</div>
    <div data-act="new-link">新建链接到此处</div>
    <div data-act="rename-folder">重命名</div>
    <div class="danger" data-act="delete-folder">删除该文件夹</div>
  `;
  li.appendChild(row);
  li.appendChild(menu);
  const childrenWrap = document.createElement("div");
  childrenWrap.className = "children";
  li.appendChild(childrenWrap);
  if (hasChildren) {
    const frag = document.createDocumentFragment();
    for (const child of node.children) frag.appendChild(makeFolderLi(child));
    childrenWrap.appendChild(frag);
  }
  if (STATE.expanded?.has?.(node.path)) {
    li.classList.add("expanded");
    childrenWrap.style.maxHeight = 'none';
  }
  row.addEventListener("click", (e) => {
    if (e.target === arrowBtn || e.target === kebab || menu.contains(e.target)) return;
    STATE.filterFolder = node.path;
    STATE.selectedId = null;
    renderFolders();
    renderList();
  });

  if (arrowBtn) {
    arrowBtn.onclick = (e) => {
      e.stopPropagation();
      const willExpand = !li.classList.contains("expanded");
      li.classList.toggle("expanded", willExpand);
      if (willExpand) {
        STATE.expanded.add(node.path);
        if (!childrenWrap.hasChildNodes() && node.children && node.children.length) {
          const frag = document.createDocumentFragment();
          for (const child of node.children) frag.appendChild(makeFolderLi(child));
          childrenWrap.appendChild(frag);
        }
        expandChildren(childrenWrap);
        bumpAncestorHeights(li);
      } else {
        STATE.expanded.delete(node.path);
        collapseChildren(childrenWrap);
        bumpAncestorHeights(li);
      }
    };
  }

  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    if (e.target === kebab || e.target === arrowBtn || menu.contains(e.target)) { e.preventDefault(); return; }
    e.stopPropagation();
    document.body.classList.add("dragging-folder");
    e.dataTransfer.setData("text/kb-folder", node.path);
    e.dataTransfer.setData("text/plain", "KB:FOLDER:" + node.path);
    window.__DND__.folder = node.path;
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("drag-ghost");
  });
  row.addEventListener("dragend", () => {
    document.body.classList.remove("dragging-folder");
    li.classList.remove("drag-ghost");
  });

  const line = document.createElement("div"); line.className = "drop-line"; li.appendChild(line);
  li.ondragover = (e) => {
    const types = e.dataTransfer?.types || [];
    const maybeFolder = types.includes("text/kb-folder") || types.includes("text/plain");
    const maybeRes = types.includes("text/kb-resource") || types.includes("text/plain");
    if (!(maybeFolder || maybeRes)) return;

    let srcFolder = e.dataTransfer.getData("text/kb-folder");
    let srcRes = e.dataTransfer.getData("text/kb-resource");
    if (!srcFolder && !srcRes) {
      const plain = e.dataTransfer.getData("text/plain") || "";
      if (plain.startsWith("KB:FOLDER:")) srcFolder = plain.slice("KB:FOLDER:".length);
      if (plain.startsWith("KB:RES:")) srcRes = plain.slice("KB:RES:".length);
    }
    if (!srcFolder && !srcRes && window.__DND__) {
      if (window.__DND__.folder) srcFolder = window.__DND__.folder;
      if (window.__DND__.res) srcRes = window.__DND__.res;
    }
    if (!srcFolder && !srcRes) return;

    const tgt = li.dataset.path;
    const depthOf = (p) => (p ? p.split("/").filter(Boolean).length : 0);
    const parentOf = (p) => (p ? p.split("/").slice(0, -1).join("/") : "");
    const isInSubtree = (a, b) => a === b || a.startsWith(b + "/");
    const sameDepth = srcFolder ? depthOf(srcFolder) === depthOf(tgt) : false;
    const sameParent = srcFolder ? parentOf(srcFolder) === parentOf(tgt) : false;
    const canReorder = !!srcFolder && sameDepth && sameParent && !isInSubtree(tgt, srcFolder) && !isInSubtree(srcFolder, tgt);
    const canNest = !!srcFolder && !isInSubtree(tgt, srcFolder) && srcFolder !== tgt;
    const canDropRes = !!srcRes;
    if (!(canReorder || canNest || canDropRes)) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    const y = Math.max(r.top, Math.min(e.clientY, r.bottom));
    const frac = (y - r.top) / Math.max(1, r.height);
    li.classList.add("drag-over");
    li.classList.toggle("show-top", canReorder && frac < 0.25);
    li.classList.toggle("show-bottom", canReorder && frac > 0.75);
    li.classList.toggle("as-child", (canNest || canDropRes) && frac >= 0.25 && frac <= 0.75);
    e.dataTransfer.dropEffect = "move";
  };

  li.ondragleave = (e) => {
    e.stopPropagation();
    li.classList.remove("drag-over", "show-top", "show-bottom", "as-child");
  };
  li.ondrop = async (e) => {
    e.preventDefault(); e.stopPropagation();
    li.classList.remove("drag-over", "show-top", "show-bottom", "as-child");
    document.body.classList.remove("dragging-folder");
    const src = e.dataTransfer.getData("text/kb-folder") || window.__DND__?.folder || "";
    const res = e.dataTransfer.getData("text/kb-resource");
    const tgt = li.dataset.path;
    if (res) {
      await window.api.updateResource(res, { folder: tgt });
      toast("已移动到：" + tgt);
      await refresh(); return;
    }
    if (!src) return;
    const depthOf = (p) => (p ? p.split("/").filter(Boolean).length : 0);
    const parentOf = (p) => (p ? p.split("/").slice(0, -1).join("/") : "");
    const isInSubtree = (a, b) => a === b || a.startsWith(b + "/");
    if (tgt === src || isInSubtree(tgt, src)) { toast("不能移动到自身或子目录", "error"); return; }
    const sameDepth = depthOf(src) === depthOf(tgt);
    const sameParent = parentOf(src) === parentOf(tgt);
    const canReorder = sameDepth && sameParent;
    const r = row.getBoundingClientRect();
    const y = Math.max(r.top, Math.min(e.clientY, r.bottom));
    const frac = (y - r.top) / Math.max(1, r.height);
    if (canReorder && (frac < 0.25 || frac > 0.75)) {
      const area = (frac < 0.25) ? "top" : "bottom";
      const ordered = reorderFolders(STATE.folders, src, tgt, area);
      await window.api.setFolders(ordered);
      await refresh();
      return;
    }
    if (frac >= 0.25 && frac <= 0.75) {
      await window.api.moveFolder({ sourcePath: src, targetParentPath: tgt });
      await refresh();
    }
  };

  menu.addEventListener("mousedown", (e) => e.stopPropagation());
  menu.addEventListener("click", (e) => e.stopPropagation());
  kebab.onclick = (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    closeAllFolderMenus();
    if (opening) openFolderMenuFloating(menu, kebab);
  };
  menu.onclick = (e) => {
    e.stopPropagation();
    const act = e.target?.dataset?.act;
    closeAllFolderMenus();
    if (act === "new-link") openCreateLinkTo(node.path);
    else if (act === "new-folder") openCreateSubFolder(node.path);
    else if (act === "rename-folder") openRenameFolder(node.path);
    else if (act === "delete-folder") deleteFolderWithConfirm(node.path);
  };
  if (STATE.filterFolder === node.path) row.classList.add("active");
  return li;
}

function closeAllFolderMenus() {
  $$(".folder-menu").forEach((m) => {
    if (m.classList.contains("floating-menu") && m.__originLi) {
      m.classList.remove("floating-menu");
      m.style.left = ""; m.style.top = ""; m.style.minWidth = "";
      m.style.right = ""; m.style.maxWidth = ""; m.style.width = ""; m.style.whiteSpace = "";
      m.__originLi.appendChild(m); m.__originLi = null;
    }
    m.classList.add("hidden");
  });
  document.body.classList.remove("menu-open");
}
window.addEventListener("scroll", closeAllFolderMenus, true);
window.addEventListener("resize", closeAllFolderMenus);
function reorderFolders(all, srcPath, targetPath, area) {
  const isInSubtree = (p, base) => p === base || p.startsWith(base + "/");
  const arr = [...all];
  const srcBlock = arr.filter(p => isInSubtree(p, srcPath));
  if (!srcBlock.length) return all;
  let rest = arr.filter(p => !isInSubtree(p, srcPath));
  const idxs = rest.map((p, i) => [p, i]).filter(([p]) => isInSubtree(p, targetPath)).map(([, i]) => i);
  if (!idxs.length) return all;
  if (isInSubtree(targetPath, srcPath)) return all;
  const tStart = Math.min(...idxs);
  const tEnd = Math.max(...idxs) + 1;
  const insertAt = area === "bottom" ? tEnd : tStart;
  rest.splice(insertAt, 0, ...srcBlock);
  return rest;
}

function inScope(r) {
  if (STATE.filterFolder === "") return true;
  if (STATE.filterFolder === UNCAT) return !r.folder;
  const f = r.folder || "";
  return f === STATE.filterFolder || f.startsWith(STATE.filterFolder + "/");
}
function renderList() {
  const list = $("#resourceList");
  if (!list) return;
  list.innerHTML = "";
  const q = (STATE.q || "").trim().toLowerCase();
  const filtered = STATE.resources.filter((r) => {
    const byFolder = inScope(r);
    const byQ =
      !q ||
      (r.title || "").toLowerCase().includes(q) ||
      (r.url || "").toLowerCase().includes(q) ||
      (r.tags || []).join(",").toLowerCase().includes(q);
    return byFolder && byQ;
  });
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "card empty-tip";
    empty.textContent = "点击此处添加第一条链接";
    empty.addEventListener("click", (e) => {
      e.stopPropagation();
      openCreateLink();
    });
    list.appendChild(empty);
    openInPreview(null);
    STATE.selectedId = null;
    return;
  }
  for (const r of filtered) {
    const el = document.createElement("div");
    el.className = "card";
    if (STATE.selectedId === r.id) el.classList.add("selected");
    el.style.display = "grid";
    el.style.gridTemplateColumns = "1fr auto";
    el.style.gap = "8px";
    el.style.padding = "12px";
    el.style.marginBottom = "8px";
    el.innerHTML = `
      <div>
        <div style="font-weight:600;margin-bottom:4px;text-align:left">${esc(r.title || r.url)}</div>
        <div class="meta" style="text-align:left;color:#9ca3af;font-size:12px">${esc(r.url)}</div>
        <div class="badges" style="margin-top:8px;display:flex;gap:6px;align-items:center;">
          ${(r.tags || []).map((t) => `<span class="badge" style="font-size:12px;padding:2px 8px;border:1px solid #2a2f37;border-radius:999px;color:#cbd5e1">${esc(t)}</span>`).join("")}
        </div>
      </div>
      <div class="actions" style="display:flex;gap:6px;align-items:flex-start;">
        <button data-open>跳转</button>
        <button data-edit>编辑</button>
        <button data-del>删除</button>
      </div>`;
    el.addEventListener("click", () => {
      STATE.selectedId = r.id;
      renderList();
      openInPreview(r.url);
    });
    el.querySelectorAll(".actions button").forEach((b) => {
      Object.assign(b.style, {
        background: "#13161b",
        color: "#cbd5e1",
        border: "1px solid #2a2f37",
        borderRadius: "8px",
        padding: "6px 10px",
        cursor: "pointer",
      });
      b.addEventListener("click", (e) => e.stopPropagation());
    });
    el.querySelector("[data-open]").onclick = () =>
      window.api.openExternal(r.url);
    el.querySelector("[data-edit]").onclick = () => openEditResource(r);
    el.querySelector("[data-del]").onclick = async () => {
      if (await confirmBox("确定删除这条资源吗？")) {
        await window.api.deleteResource(r.id);
        toast("已删除");
        if (STATE.selectedId === r.id) {
          STATE.selectedId = null;
          openInPreview(null);
        }
        refresh();
      }
    };
    el.draggable = true;
    el.ondragstart = (e) => {
      e.dataTransfer.setData("text/kb-resource", r.id);
      e.dataTransfer.setData("text/plain", "KB:RES:" + r.id);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("drag-ghost");

      window.__DND__.res = r.id;
      document.body.classList.add("dragging-folder");
    };
    el.ondragend = () => {
      el.classList.remove("drag-ghost");
      window.__DND__.res = null;
      document.body.classList.remove("dragging-folder");
    };
    list.appendChild(el);
  }
  if (STATE.selectedId && !filtered.some((x) => x.id === STATE.selectedId)) {
    STATE.selectedId = null;
  }
}
async function openInPreview(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    if (url && !/^https?:/i.test(url)) toast("仅支持 http/https 预览", "error");
    await window.preview?.load?.('about:blank');
    setPreviewButtonsVisible(false);
    return;
  }
  await window.preview?.load?.(url);
  setPreviewButtonsVisible(true);
}

function openCreateLink() {
  openCreateLinkTo(STATE.filterFolder === UNCAT ? "" : STATE.filterFolder);
}
function openCreateLinkTo(folderPath) {
  const opts = ['<option value="">根目录</option>']
    .concat(
      STATE.folders.map(
        (f) =>
          `<option value="${escAttr(f)}"${folderPath === f ? " selected" : ""}>${esc(f)}</option>`
      )
    )
    .join("");
  openFormModal({
    title: "新建链接",
    bodyHTML: `<div class="row"><label>链接 URL</label><input name="url" placeholder="https://…" required/></div><div class="row"><label>标题（可选）</label><input name="title" placeholder="不填则使用 URL"/></div><div class="row"><label>文件夹</label><select name="folder">${opts}</select></div><div class="row"><label>标签（可选）</label><div id="tagBox" class="tagbox"><input id="tagInput" placeholder="输入后回车完成添加"/></div></div>`,
    onSubmit: async (fd) => {
      const url = (fd.get("url") || "").toString().trim();
      if (!/^https?:\/\//i.test(url))
        throw new Error("URL 必须以 http/https 开头");
      const title = (fd.get("title") || "").toString().trim() || url;
      const folder = (fd.get("folder") || "").toString();
      const tags = tbox.getTags();
      await window.api.addResource({ url, title, folder, tags });
      for (const t of tags) await window.api.addTag(t);
      await refresh();
      toast("已添加：" + title);
    },
  });
  const tbox = setupTagBox("#tagBox", "#tagInput", "#tagSuggest", STATE.tags);
  document.querySelector("#tagInput")?.focus();
}
function initSplitter() {
  const app = document.getElementById('app');
  const split = document.getElementById('splitter');
  if (!app || !split) return;

  const $get = (k) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k)) || 0;
  const setPreviewW = (px) => {
    document.documentElement.style.setProperty('--preview-w', px + 'px');
  };

  const MIN_PREVIEW_PX = 260;   // 预览最小宽
  const MIN_MIDDLE_PX = 550;   // 中间列（.main）最小宽，和 CSS 的 minmax 一致
  const SIDEBAR_PX = 260;   // 左侧固定宽
  const SPLITTER_PX = 6;     // 分隔条宽

  let startX = 0, startPreviewW = 0, dragging = false;

  function clampPreview(px) {
    const total = app.clientWidth;
    const spaceForMidAndPreview = total - SIDEBAR_PX - SPLITTER_PX;
    const MAX_PREVIEW = Math.max(MIN_PREVIEW_PX, spaceForMidAndPreview - MIN_MIDDLE_PX);
    return Math.min(Math.max(px, MIN_PREVIEW_PX), MAX_PREVIEW);
  }

  split.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    const cur = $get('--preview-w') || document.querySelector('.preview')?.getBoundingClientRect().width || 0;
    startPreviewW = clampPreview(cur);
    setPreviewW(startPreviewW);
    document.body.classList.add('resizing');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = startPreviewW - dx;
    const clamped = clampPreview(w);
    setPreviewW(clamped);
    const host = document.getElementById('viewerHost');
    if (host && window.preview?.setBounds) {
      const r = host.getBoundingClientRect();
      window.preview.setBounds({
        x: Math.round(r.left), y: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height)
      });
    }
    layoutPreview();

    if (clamped !== w) {
      startX = e.clientX;
      startPreviewW = clamped;
    }
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
  };
  window.addEventListener('mouseup', end);
  window.addEventListener('mouseleave', end);
  window.addEventListener('resize', () => {
    const cur = $get('--preview-w') || document.querySelector('.preview')?.getBoundingClientRect().width || 0;
    setPreviewW(clampPreview(cur));
  });
  requestAnimationFrame(() => {
    const cur = $get('--preview-w')
      || document.querySelector('.preview')?.getBoundingClientRect().width
      || 0;
    setPreviewW(clampPreview(cur));
    window.dispatchEvent(new Event('resize'));
  });
}

function openEditResource(r) {
  const opts = ['<option value="">根目录</option>']
    .concat(
      STATE.folders.map(
        (f) =>
          `<option value="${escAttr(f)}"${r.folder === f ? " selected" : ""}>${esc(f)}</option>`
      )
    )
    .join("");
  openFormModal({
    title: "编辑资源",
    bodyHTML: `
        <div class="row"><label>标题</label>
          <input name="title" value="${escAttr(r.title || "")}" />
        </div>
        <div class="row"><label>URL</label>
          <input name="url" value="${escAttr(r.url || "")}" required />
        </div>
        <div class="row"><label>文件夹</label>
          <select name="folder">${opts}</select>
        </div>
        <div class="row"><label>标签（可选）</label>
          <div id="tagBox" class="tagbox">
            <input id="tagInput" placeholder="回车添加或选择建议"/>
          </div>
        </div>
      `,
    onSubmit: async (fd) => {
      const title = (fd.get("title") || "").toString().trim() || r.url;
      const url = (fd.get("url") || "").toString().trim();
      if (!/^https?:\/\//i.test(url))
        throw new Error("URL 必须以 http/https 开头");
      const folder = (fd.get("folder") || "").toString();
      const tags = tbox.getTags();
      await window.api.updateResource(r.id, { title, url, folder, tags });
      await refresh();
      toast("已保存");
    },
  });
  const tbox = setupTagBox("#tagBox", "#tagInput", "#tagSuggest", STATE.tags);
  tbox.setTags(r.tags || []);
  document.querySelector("#tagInput")?.focus();
}
function openCreateSubFolder(parentPath) {
  openFormModal({
    title: "新建文件夹",
    bodyHTML: `<div class="row"><label>父目录</label><input value="${escAttr(parentPath)}" disabled/></div><div class="row"><label>名称</label><input name="name" placeholder="例如：子目录" required/></div>`,
    onSubmit: async (fd) => {
      const name = (fd.get("name") || "").toString().trim();
      if (!name) throw new Error("请输入名称");
      const path = parentPath ? `${parentPath}/${name}` : name;
      await window.api.addFolder(path);
      STATE.filterFolder = path;
      STATE.selectedId = null;
      await refresh();
      toast("已创建：" + path);
    },
  });
}
function openRenameFolder(path) {
  const baseName = path.split("/").slice(-1)[0];
  openFormModal({
    title: "重命名文件夹",
    bodyHTML: `
        <div class="row"><label>原路径</label><input value="${escAttr(path)}" disabled /></div>
        <div class="row"><label>新名称</label><input name="name" value="${escAttr(baseName)}" required /></div>
      `,
    onSubmit: async (fd) => {
      const name = (fd.get("name") || "").toString().trim();
      if (!name) throw new Error("请输入新名称");
      const parent = path.split("/").slice(0, -1).join("/");
      const siblingPrefix = parent ? `${parent}/` : "";
      const sameLevel = STATE.folders.filter(
        (f) =>
          f.startsWith(siblingPrefix) &&
          f.split("/").length === (parent ? parent.split("/").length + 1 : 1)
      );
      if (sameLevel.some((f) => f === (parent ? `${parent}/${name}` : name))) {
        throw new Error("同级已存在同名文件夹");
      }
      await window.api.renameFolder({ sourcePath: path, newName: name });
      if (
        STATE.filterFolder === path ||
        STATE.filterFolder.startsWith(path + "/")
      ) {
        const newBase = parent ? `${parent}/${name}` : name;
        STATE.filterFolder = STATE.filterFolder.replace(path, newBase);
      }
      await refresh();
      toast("已重命名");
    },
  });
}
async function deleteFolderWithConfirm(path) {
  if (!path) return;
  const ok = await confirmBox(
    `确定删除文件夹「${path}」以及其所有子文件夹和其中的全部链接吗？此操作不可撤销。`,
    `删除`,
    `取消`
  );
  if (!ok) return;
  await window.api.deleteFolder(path);
  if (
    STATE.filterFolder === path ||
    STATE.filterFolder.startsWith(path + "/")
  ) {
    STATE.filterFolder = "";
    STATE.selectedId = null;
    openInPreview(null);
  }
  await refresh();
  toast("已删除：" + path);
}
function bindSearch() {
  const q = $("#q");
  if (q)
    q.addEventListener("input", (e) => {
      STATE.q = e.target.value;
      renderList();
    });
}
function bindNewButton() {
  const btn = $("#newBtn");
  if (!btn) return;
  btn.onclick = (e) => {
    e.stopPropagation();
    openCreateLink();
  };
}
function esc(s = "") {
  return s.replace(
    /[&<>\"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      c
      ]
  );
}
function escAttr(s = "") {
  return esc(s).replace(/"/g, "&quot;");
}
if (window.deeplink?.onAdd) {
  window.deeplink.onAdd(({ url, title, folder }) => {
    openCreateLinkWithPreset({
      url: url || "",
      title: title || "",
      folder: folder || "",
    });
  });
}
function openCreateLinkWithPreset(preset = {}) {
  const folderPath =
    preset.folder || (STATE.filterFolder === UNCAT ? "" : STATE.filterFolder);
  const opts = ['<option value="">根目录</option>']
    .concat(
      STATE.folders.map(
        (f) =>
          `<option value="${escAttr(f)}"${folderPath === f ? " selected" : ""}>${esc(f)}</option>`
      )
    )
    .join("");
  openFormModal({
    title: "新建链接",
    bodyHTML: `
        <div class="row"><label>链接 URL</label><input name="url" placeholder="必须以https/http开头" value="${escAttr(preset.url || "")}" required/></div>
        <div class="row"><label>标题（可选）</label><input name="title" placeholder="不填则使用 URL" value="${escAttr(preset.title || "")}" /></div>
        <div class="row"><label>文件夹</label><select name="folder">${opts}</select></div>
        <div class="row"><label>标签（可选）</label><div id="tagBox" class="tagbox"><input id="tagInput" placeholder="输入以匹配，Enter 可新建"/></div></div>
      `,
    onSubmit: async (fd) => {
      const url = (fd.get("url") || "").toString().trim();
      if (!/^https?:\/\//i.test(url))
        throw new Error("URL 必须以 http/https 开头");
      const title = (fd.get("title") || "").toString().trim() || url;
      const folder = (fd.get("folder") || "").toString();
      const tags = tbox.getTags();
      await window.api.addResource({ url, title, folder, tags });
      for (const t of tags) await window.api.addTag(t);
      await refresh();
      toast("已添加：" + title);
    },
  });
  const tbox = setupTagBox("#tagBox", "#tagInput", "#tagSuggest", STATE.tags);
  document.querySelector("#tagInput")?.focus();
}
document.addEventListener("click", () => {
  closeAllFolderMenus();
});
window.addEventListener("scroll", () => closeAllFolderMenus(), true);
window.addEventListener("resize", () => closeAllFolderMenus());
async function bootstrap() {
  const start = Date.now();
  while (!window.api || typeof window.api.list !== "function") {
    if (Date.now() - start > 3000) {
      console.error("[bootstrap] window.api 未就绪：", window.api);
      toast("预加载未就绪（window.api 不可用）", "error");
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    await init();
    if (window.ops?.onChanged) {
      let t = null;
      window.ops.onChanged(() => {
        clearTimeout(t);
        t = setTimeout(async () => {
          try {
            const local = await window.api.list();
            if (window.auth?.syncNow) await window.auth.syncNow(local);
          } catch (e) { }
        }, 800);
      });
    }
  } catch (e) {
    console.error("[init] 异常：", e);
    toast("初始化失败：" + e.message, "error");
  }
}
function initFullscreenControls() {
  const btn = document.getElementById('previewMaxBtn');
  if (!btn) return;

  const enter = async () => {
    try {
      await window.win?.resize?.free?.();
    } catch { }

    document.body.classList.add('preview-max');
    btn.textContent = '⤡';
    btn.title = '退出预览最大化';

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const host = document.getElementById('viewerHost');
    if (host && window.preview?.setBounds) {
      const r = host.getBoundingClientRect();
      window.preview.setBounds({
        x: Math.round(r.left), y: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height)
      });
    }
    await window.preview?.focus?.();

    setTimeout(() => {
      const h = document.getElementById('viewerHost');
      if (h && window.preview?.setBounds) {
        const rr = h.getBoundingClientRect();
        window.preview.setBounds({
          x: Math.round(rr.left), y: Math.round(rr.top),
          width: Math.round(rr.width), height: Math.round(rr.height)
        });
      }
    }, 50);
    showHint();
  };

  const exit = async () => {
    try {
      window.preview?.setBounds?.({ x: 0, y: 0, width: 1, height: 1 });
    } catch { }
    document.body.classList.remove('preview-max');
    btn.textContent = '⤢';
    btn.title = '预览最大化';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const host = document.getElementById('viewerHost');
    if (host && window.preview?.setBounds) {
      const r = host.getBoundingClientRect();
      window.preview.setBounds({
        x: Math.round(r.left), y: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height)
      });
    }
    try { await window.win?.resize?.restore?.(); } catch { }
    void document.body.offsetHeight;
    if (typeof layoutPreview === 'function') {
      layoutPreview();
    } else {
      const host = document.getElementById('viewerHost');
      if (host && window.preview?.setBounds) {
        const r = host.getBoundingClientRect();
        window.preview.setBounds({
          x: Math.round(r.left), y: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height)
        });
      }
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  const toggle = async () => {
    if (document.body.classList.contains('preview-max')) await exit();
    else await enter();
  };
  btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      if (!IS_OVERLAY && document.body.classList.contains('preview-max')) {
        const url = await getPreviewURL();
        await window.overlay?.open?.(url);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (document.body.classList.contains('preview-max')) await exit();
    }
  }, { capture: true });
  if (window.keys?.on) {
    window.keys.on(async ({ key }) => {
      if (key === 'F11') {
        if (!IS_OVERLAY && document.body.classList.contains('preview-max')) {
          const url = await getPreviewURL();
          await window.overlay?.open?.(url);
        }
        return;
      }
      if (key === 'Escape') {
        if (document.body.classList.contains('preview-max')) await exit();
      }
    });
  }
  if (IS_OVERLAY) {
    document.body.classList.add('preview-max', 'overlay');
    const url = urlParams.get('url');
    if (url) {
      const wv = document.querySelector('webview');
      if (wv) wv.src = url;
    }
  }

  function showHint() {
    let el = document.getElementById('fsHint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fsHint';
      el.className = 'fs-hint';
      el.textContent = 'Esc 退出；F11 锁定无边框”';
      document.body.appendChild(el);
    }
    el.classList.add('show');
    document.body.classList.add('fs-hinting');
    requestAnimationFrame(() => {
      const host = document.getElementById('viewerHost');
      if (host && window.preview?.setBounds) {
        const r = host.getBoundingClientRect();
        window.preview.setBounds({
          x: Math.round(r.left), y: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height)
        });
      }
    });
    setTimeout(() => {
      el.classList.remove('show');
      document.body.classList.remove('fs-hinting');
      requestAnimationFrame(() => {
        const host = document.getElementById('viewerHost');
        if (host && window.preview?.setBounds) {
          const r = host.getBoundingClientRect();
          window.preview.setBounds({
            x: Math.round(r.left), y: Math.round(r.top),
            width: Math.round(r.width), height: Math.round(r.height)
          });
        }
      });
    }, 2200);
  }
}
function bindAccountUI() {
  const btn = document.getElementById('accountBtn');
  const menu = document.getElementById('accountMenu');
  if (!btn || !menu) return;

  async function redraw() {
    const me = await window.auth?.whoami?.();
    const logged = !!(me && me.user && me.token);
    menu.innerHTML = logged ? `
  <button class="item" data-act="account-info">账号信息</button>
  <button class="item" data-act="view-cloud">查看云端数据</button>
  <button class="item" data-act="sync">同步数据</button>
  <button class="item" data-act="logout">取消登录</button>
` : `
  <button class="item" data-act="login">登录</button>
  <button class="item" data-act="register">注册</button>
`;

  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await redraw();
    const rect = btn.getBoundingClientRect();
    menu.style.minWidth = '240px';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(8, rect.right - 240) + 'px';

    menu.classList.toggle('hidden');
    document.body.classList.add('menu-open');
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
    document.body.classList.remove('menu-open');
  });

  menu.addEventListener('click', async (e) => {
    const act = e.target?.dataset?.act;
    if (!act) return;
    if (act === 'login') {
      openFormModal({
        title: '登录',
        bodyHTML: `
          <div class="row"><label>账号</label><input name="username" required /></div>
          <div class="row"><label>密码</label><input name="password" type="password" required /></div>
        `,
        onSubmit: async (fd) => {
          const username = String(fd.get('username') || '').trim();
          const password = String(fd.get('password') || '');
          await window.auth.login({ username, password });
          toast('登录成功'); await redraw(); await trySyncNow(true);
        }
      });
    } else if (act === 'register') {
      openFormModal({
        title: '注册（审核制）',
        bodyHTML: `
          <div class="row"><label>账号</label><input name="username" required /></div>
          <div class="row"><label>邮箱</label><input name="email" type="email" required /></div>
          <div class="row"><label>密码</label><input name="password" type="password" required /></div>
        `,
        onSubmit: async (fd) => {
          const payload = {
            username: String(fd.get('username') || '').trim(),
            email: String(fd.get('email') || '').trim(),
            password: String(fd.get('password') || '')
          };
          await window.auth.register(payload);
          toast('注册已提交，等待审核（邮件会通知结果）');
        }
      });
    } else if (act === 'logout') {
      await window.auth.logout();
      toast('已退出登录'); await redraw();
    } else if (act === 'sync') {
      await trySyncNow(true);
    } else if (act === 'view-cloud') {
      const data = await window.auth.fetchCloud();
      openJsonViewer('云端数据（只读）', data);
    } else if (act === 'account-info') {
      try {
        const me = await window.auth.accountInfo();
        const regStr = String(me?.registeredAt || '').replace(' ', 'T');
        const regLocal = regStr ? new Date(regStr + 'Z').toLocaleString() : '-';
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        openFormModal({
          title: '账号信息',
          okText: '更改密码',
          cancelText: '关闭',
          bodyHTML: `
            <div class="kv">
              <div>账号</div><div>${esc(me?.username)}</div>
              <div>邮箱</div><div>${esc(me?.email)}</div>
              <div>注册时间</div><div>${esc(regLocal)}</div>
              <div>总文件夹数</div><div>${me?.counts?.folders ?? 0}</div>
              <div>总标签数</div><div>${me?.counts?.tags ?? 0}</div>
            </div>
    
            <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;">
              <label style="display:block;margin-bottom:6px;">新密码</label>
              <input type="password" id="npwd" placeholder="输入新密码" style="width:100%;height:36px;">
            </div>
    
            <div style="margin-top:10px;">
              <label style="display:block;margin-bottom:6px;">确认新密码</label>
              <input type="password" id="npwd2" placeholder="再次输入新密码" style="width:100%;height:36px;">
              <div id="pwdHint" style="margin-top:6px;font-size:12px;color:#f87171;"></div>
            </div>
          `,
          onSubmit: async () => {
            const v1 = document.getElementById('npwd').value.trim();
            const v2 = document.getElementById('npwd2').value.trim();
            if (v1.length < 4) {
              document.getElementById('pwdHint').textContent = '新密码至少 4 位';
              throw new Error('新密码至少 4 位');
            }
            if (v1 !== v2) {
              document.getElementById('pwdHint').textContent = '两次输入不一致';
              throw new Error('两次输入不一致');
            }
            await window.auth.changePassword(v1);
            toast('密码已更改');
          }
        });

        const modal = document.getElementById('modal');
        const actions = modal.querySelector('.modal-actions');
        const okBtn = modal.querySelector('#modalOk');
        const cancel = modal.querySelector('#modalCancel');
        actions.querySelectorAll('[data-extra="json"]').forEach(n => n.remove());
        actions.insertBefore(okBtn, actions.firstChild);
        cancel.style.marginLeft = 'auto';
        const np = modal.querySelector('#npwd');
        const np2 = modal.querySelector('#npwd2');
        const hint = modal.querySelector('#pwdHint');
        const refresh = () => {
          const v1 = np.value.trim();
          const v2 = np2.value.trim();
          let ok = v1.length >= 4 && v1 === v2;
          okBtn.disabled = !ok;
          hint.textContent = (!v1 && !v2) ? '' : (v1 === v2 ? '' : '两次输入不一致');
        };
        okBtn.disabled = true;
        np.addEventListener('input', refresh);
        np2.addEventListener('input', refresh);
        refresh();
      } catch (err) {
        alert('获取账号信息失败：' + (err?.message || err));
      }
    }
    menu.classList.add('hidden');
    document.body.classList.remove('menu-open');
  });
}

async function trySyncNow(showToast = false) {
  try {
    const local = await window.api.list();
    const result = await window.auth.syncNow(local);
    if (showToast) toast(result?.changed ? '已同步（合并去重）' : '已是最新');
    if (result?.changed) await refresh();
  } catch (e) { if (showToast) toast('同步失败：' + (e.message || e), 'error'); }
}

(function () {
  bindAccountUI();
  setInterval(() => trySyncNow(false), 60 * 1000); // 每分钟自动同步
})();

function openJsonViewer(title, obj) {
  const pretty = JSON.stringify(obj ?? {}, null, 2);

  let restored = false;
  const restorePreview = () => {
    if (restored) return; restored = true;
    try {
      const host = document.getElementById('viewerHost');
      if (host && window.preview?.setBounds) {
        const r = host.getBoundingClientRect();
        window.preview.setBounds({
          x: Math.round(r.left), y: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height)
        });
      }
    } catch { }
    document.body.classList.remove('menu-open');
  };
  try {
    const host = document.getElementById('viewerHost');
    if (host && window.preview?.setBounds) {
      window.preview.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    }
  } catch { }
  document.body.classList.add('menu-open');
  openFormModal({
    title,
    bodyHTML: `<textarea id="jsonView" class="json-view" readonly>${pretty}</textarea>`,
    onSubmit: () => { },
    okText: '关闭',
    cancelText: ''
  });
  const modal = document.getElementById('modal');
  const actions = modal.querySelector('.modal-actions');
  const okBtn = modal.querySelector('#modalOk');
  actions.querySelectorAll('[data-extra="json"]').forEach(n => n.remove());
  const mk = (txt, handler) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.dataset.extra = 'json';
    b.onclick = handler;
    return b;
  };
  const ta = document.getElementById('jsonView');
  const copyBtn = mk('复制', () => navigator.clipboard.writeText(ta.value));
  const saveBtn = mk('下载JSON', () => {
    const blob = new Blob([ta.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cloud-data.json'; a.click();
    URL.revokeObjectURL(url);
  });
  actions.insertBefore(copyBtn, okBtn);
  actions.insertBefore(saveBtn, okBtn);
  okBtn.addEventListener('click', restorePreview, { once: true });
  window.addEventListener('beforeunload', restorePreview, { once: true });
}

(function init() {
  bindSearch();
  bindNewButton();
  initSplitter();
  initFullscreenControls();
  STATE.filterFolder = "";
  STATE.selectedId = null;
  refresh().catch((err) =>
    toast("初始化失败：" + (err?.message || err), "error")
  );
  window.preview?.ensure?.();

  const host = document.getElementById('viewerHost');
  function layoutPreview() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    window.preview?.setBounds?.({
      x: Math.round(r.left), y: Math.round(r.top),
      width: Math.round(r.width), height: Math.round(r.height)
    });
  }
  window.addEventListener('resize', () => requestAnimationFrame(layoutPreview));
  layoutPreview();
  if (window.ResizeObserver) {
    const host = document.getElementById('viewerHost');
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(layoutPreview);
    });
    if (host) ro.observe(host);
  }
  getPreviewURL().then(u => setPreviewButtonsVisible(/^https?:\/\//i.test(u)));
})();