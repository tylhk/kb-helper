/* ========= 选择器 ========= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
let FOLDERS_RENDER_GEN = 0; // 目录渲染代次

/* ========= 全局状态 ========= */
let STATE = {
  resources: [],
  folders: [], // 扁平路径 '学习/项目A'
  tags: [],
  q: "",
  filterFolder: "",
  selectedId: null, // 选中的资源 id
};
window.__DND__ = { folder: null, res: null };
const UNCAT = "__UNCAT__";
document.addEventListener("dragend", () => document.body.classList.remove("dragging-folder"), true);
document.addEventListener("drop", () => document.body.classList.remove("dragging-folder"), true);
/* ========= Toast ========= */
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
/* ========= 使用页面内置弹窗 ========= */
function openFormModal({
  title,
  bodyHTML,
  onSubmit,
  okText = "确定",
  cancelText = "取消",
}) {
  const modal = $("#modal");
  const titleEl = $("#modalTitle");
  const form = $("#modalForm");
  const okBtn = $("#modalOk");
  const cancel = $("#modalCancel");
  if (!modal || !titleEl || !form || !okBtn || !cancel) {
    toast("弹窗初始化失败", "error");
    return;
  }
  titleEl.textContent = title;
  form.innerHTML = bodyHTML;
  okBtn.textContent = okText;
  cancel.textContent = cancelText;
  form.querySelectorAll("input,select,textarea").forEach((el) => {
    el.style.padding = "10px";
    el.style.borderRadius = "10px";
    el.style.border = "1px solid var(--line)";
    el.style.background = "#0e0f12";
    el.style.color = "var(--fg)";
    el.style.outline = "none";
  });
  const handler = async (ev) => {
    ev.preventDefault();
    try {
      await onSubmit(new FormData(form));
      modal.classList.add("hidden");
      form.removeEventListener("submit", handler);
    } catch (err) {
      toast("操作失败：" + (err?.message || err), "error");
    }
  };
  form.addEventListener("submit", handler);
  cancel.onclick = () => {
    modal.classList.add("hidden");
    form.removeEventListener("submit", handler);
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

const urlParams = new URLSearchParams(location.search);
const IS_OVERLAY = urlParams.get('overlay') === '1';

/* ========= 标签 chips：无下拉建议、只允许已有标签 ========= */
/* ========= 标签 chips：输入时显示匹配建议；Enter 选建议，否则新建 ========= */
function setupTagBox(boxSel, inputSel, menuSel, initialTags = []) {
  const box = document.querySelector(boxSel);
  const input = document.querySelector(inputSel);
  let menu = document.querySelector(menuSel);
  if (!menu) {
    menu = document.createElement("div");
    menu.id = menuSel.startsWith("#") ? menuSel.slice(1) : menuSel;
    menu.className = "suggest-menu hidden";
    // 放在 tagbox 的容器里，继承已有的 .suggest 样式
    box.parentElement.classList.add("suggest");
    box.parentElement.appendChild(menu);
  }
  // “已有标签库”，用于匹配；但允许创建新标签
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
  // 匹配规则：和搜索栏一致，用“包含匹配”（不区分大小写）
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
  // 键盘交互：Enter/Tab/逗号/分号 确认；上下键移动高亮；Backspace 删除最后一个
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
      // 有下拉且有高亮 -> 选中高亮
      if (!menu.classList.contains("hidden") && items.length && active >= 0) {
        e.preventDefault();
        addChip(items[active].textContent.trim());
        return;
      }
      // 没有高亮：如果正好与已有标签“精确等同”，也直接用；否则创建新标签
      if (typed) {
        e.preventDefault();
        const hit = tagPool.find(
          (t) => t.toLowerCase() === typed.toLowerCase()
        );
        const chosen = hit || typed;
        addChip(chosen);
        // 如为新标签，写入全局库，供以后匹配
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
/* ========= 数据加载 ========= */
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

  // 清理无效展开路径
  const valid = new Set(STATE.folders);
  STATE.expanded = new Set([...STATE.expanded].filter(p => valid.has(p)));

  renderFolders();
  renderList();
}

/* ========= 目录树 ========= */
function buildTree(paths) {
  // 计算每个目录前缀（如 "A"、"A/B"）在 flat 列表中“首次出现”的索引
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
        // 关键：同级按首次出现的索引稳定排序
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

  // 顶部特殊项
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

  // 构树并渲染（递归）
  const tree = buildTree(STATE.folders);
  const frag = document.createDocumentFragment();
  for (const node of tree) frag.appendChild(makeFolderLi(node));
  ul.appendChild(frag);

  // 展开中的容器，首次渲染时矫正高度，保证动画起点正确
  requestAnimationFrame(() => {
    $$(".folder-item.expanded > .children").forEach(ch => {
      ch.style.maxHeight = ch.scrollHeight + "px";
    });
  });
}
// 让所有已展开祖先的 .children 跟着内容变化更新高度
function bumpAncestorHeights(fromLi) {
  let p = fromLi && fromLi.parentElement;
  while (p) {
    if (p.classList?.contains('children')) {
      const pli = p.parentElement; // <li.folder-item>
      if (pli?.classList?.contains('expanded')) {
        // 先清零触发一次 reflow，再用新的 scrollHeight
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
    // 右对齐到按钮：左 = 按钮右边 - 菜单宽度，且做可视区夹紧
    let left = Math.min(Math.max(rect.right - mw, 8), vw - 8 - mw);
    // 底部容不下就翻到上方
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


// 替换整个 makeSpecialEntry 函数
function makeSpecialEntry(label, key, active, count = null) {
  const isRoot = (key || "") === "";
  const li = document.createElement('li');
  li.className = 'folder-item ' + (isRoot ? 'depth-0 root-entry' : 'depth-1');
  li.dataset.path = key;

  // 一行三列：箭头占位 | 名称(+徽章) | 右侧功能区
  const row = document.createElement('div');
  row.className = 'folder-row';

  // 1) 左：与文件夹箭头同宽的占位，保证缩进一致
  const spacer = document.createElement('span');
  spacer.className = 'arrow-spacer';
  row.appendChild(spacer);

  // 2) 中：名称 + 计数
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

  // 3) 右：根目录的「＋」放这里（未分类不放）
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
    row.classList.add('active'); // 行高亮落在 .folder-row 上
  }

  li.onclick = () => {
    STATE.filterFolder = key;
    STATE.selectedId = null;
    openInPreview(null);
    renderFolders();
    renderList();
  };

  // 仅根目录接收放置（保留你现有逻辑）
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
      // 校验同级重名
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
  // 先从当前高度动画到实际高度
  el.style.overflow = 'hidden';
  const h = el.scrollHeight;
  el.style.maxHeight = h + 'px';
  // 动画结束后解锁高度，避免后续回流把它压回去
  const onEnd = (e) => {
    if (e.propertyName !== 'max-height') return;
    el.removeEventListener('transitionend', onEnd);
    // 仍处于展开态才解锁
    if (el.parentElement?.classList.contains('expanded')) {
      el.style.maxHeight = 'none';
    }
  };
  el.addEventListener('transitionend', onEnd, { once: true });
}

function collapseChildren(el) {
  // 从“实际高度”动画回 0
  el.style.overflow = 'hidden';
  const h = el.scrollHeight;
  el.style.maxHeight = h + 'px';
  void el.offsetHeight;          // 强制回流，确保过渡生效
  el.style.maxHeight = '0px';
}

function makeFolderLi(node) {
  const li = document.createElement("li");
  const hasChildren = !!(node.children && node.children.length);
  const depth = Math.min(node.depth || 1, 4);
  li.className = `folder-item depth-${depth}` + (hasChildren ? " has-children" : "");
  li.dataset.path = node.path;
  li.style.position = "relative";

  // —— 行：箭头 | 名称 | 三点 —— //
  const row = document.createElement("div");
  row.className = "folder-row";

  // 箭头（仅非根且有子目录）
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

  // 名称
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
  // 三点菜单按钮（kebab）
  const kebab = document.createElement("button");
  kebab.className = "kebab";
  kebab.type = "button";
  kebab.textContent = "⋯"; // 也可用图标
  row.appendChild(kebab);

  // 打开浮层菜单（已存在的函数）
  kebab.onclick = (e) => {
    e.stopPropagation();
    openFolderMenuFloating(menu, kebab);
  };

  // 菜单
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

  // —— 子容器：用于“推/收”动画 —— //
  const childrenWrap = document.createElement("div");
  childrenWrap.className = "children";
  li.appendChild(childrenWrap);

  // 递归渲染子项
  if (hasChildren) {
    const frag = document.createDocumentFragment();
    for (const child of node.children) frag.appendChild(makeFolderLi(child));
    childrenWrap.appendChild(frag);
  }

  // 初始展开态（根据 STATE.expanded）
  if (STATE.expanded?.has?.(node.path)) {
    li.classList.add("expanded");
    childrenWrap.style.maxHeight = 'none';
  }

  // 交互：点击“整行（排除箭头/三点/菜单）”= 选中该目录
  row.addEventListener("click", (e) => {
    if (e.target === arrowBtn || e.target === kebab || menu.contains(e.target)) return;
    STATE.filterFolder = node.path;
    STATE.selectedId = null;
    openInPreview(null);
    renderFolders();
    renderList();
  });


  // 交互：点击箭头 = 就地展开/收回（保留 DOM ⇒ 有动画 & 箭头旋转）
  if (arrowBtn) {
    arrowBtn.onclick = (e) => {
      e.stopPropagation();
      const willExpand = !li.classList.contains("expanded");
      li.classList.toggle("expanded", willExpand);

      if (willExpand) {
        STATE.expanded.add(node.path);

        // 如极少数情况下子节点还未挂载，补挂一遍
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
      STATE.filterFolder = node.path;
      STATE.selectedId = null;
      openInPreview(null);
      renderList();

    };
  }

  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    if (e.target === kebab || e.target === arrowBtn || menu.contains(e.target)) { e.preventDefault(); return; }
    e.stopPropagation();
    document.body.classList.add("dragging-folder");
    e.dataTransfer.setData("text/kb-folder", node.path);
    e.dataTransfer.setData("text/plain", "KB:FOLDER:" + node.path); // 兜底
    window.__DND__.folder = node.path;
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("drag-ghost");
  });
  row.addEventListener("dragend", () => {
    document.body.classList.remove("dragging-folder");
    li.classList.remove("drag-ghost");
  });

  // 预览线
  const line = document.createElement("div"); line.className = "drop-line"; li.appendChild(line);

  li.ondragover = (e) => {
    // ① 探测是否拖的是我们支持的类型（兼容 Chromium dragover 读不到自定义类型）
    const types = e.dataTransfer?.types || [];
    const maybeFolder = types.includes("text/kb-folder") || types.includes("text/plain");
    const maybeRes = types.includes("text/kb-resource") || types.includes("text/plain");
    if (!(maybeFolder || maybeRes)) return;

    // ② 解析源（优先自定义 MIME，兜底 text/plain 前缀）
    let srcFolder = e.dataTransfer.getData("text/kb-folder");
    let srcRes = e.dataTransfer.getData("text/kb-resource");
    if (!srcFolder && !srcRes) {
      const plain = e.dataTransfer.getData("text/plain") || "";
      if (plain.startsWith("KB:FOLDER:")) srcFolder = plain.slice("KB:FOLDER:".length);
      if (plain.startsWith("KB:RES:")) srcRes = plain.slice("KB:RES:".length);
    }
    // ★ 关键兜底：dragover 阶段很多浏览器读不到 getData，用我们在 dragstart 里存的全局状态
    if (!srcFolder && !srcRes && window.__DND__) {
      if (window.__DND__.folder) srcFolder = window.__DND__.folder;
      if (window.__DND__.res) srcRes = window.__DND__.res;
    }
    // 只有是“我们”的拖拽才继续（这句保留不变）
    if (!srcFolder && !srcRes) return;


    // ③ 目标/来源信息 & 能力判断（你的原有逻辑）
    const tgt = li.dataset.path;
    const depthOf = (p) => (p ? p.split("/").filter(Boolean).length : 0);
    const parentOf = (p) => (p ? p.split("/").slice(0, -1).join("/") : "");
    const isInSubtree = (a, b) => a === b || a.startsWith(b + "/");

    // 拖文件夹：同级同父才允许“排序”；不是自身/子树才允许“并为子目录”
    const sameDepth = srcFolder ? depthOf(srcFolder) === depthOf(tgt) : false;
    const sameParent = srcFolder ? parentOf(srcFolder) === parentOf(tgt) : false;
    const canReorder = !!srcFolder && sameDepth && sameParent && !isInSubtree(tgt, srcFolder) && !isInSubtree(srcFolder, tgt);
    const canNest = !!srcFolder && !isInSubtree(tgt, srcFolder) && srcFolder !== tgt;

    // 拖资源：永远允许“放进这个文件夹”
    const canDropRes = !!srcRes;

    // ④ 没有任何可执行操作就别阻止默认（让浏览器忽略这次 hover）
    if (!(canReorder || canNest || canDropRes)) return;

    e.preventDefault(); e.stopPropagation();

    // ⑤ 画预览：用“行”的矩形判断上/中/下
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

    // 计算落点区域（按 row）
    const r = row.getBoundingClientRect();
    const y = Math.max(r.top, Math.min(e.clientY, r.bottom));
    const frac = (y - r.top) / Math.max(1, r.height);

    // 优先“排序”，仅当可排序时才认定上下；否则尝试并为子目录
    if (canReorder && (frac < 0.25 || frac > 0.75)) {
      const area = (frac < 0.25) ? "top" : "bottom";
      const ordered = reorderFolders(STATE.folders, src, tgt, area);
      await window.api.setFolders(ordered);
      await refresh();
      return;
    }

    // 并为子目录（中间区域）
    if (frac >= 0.25 && frac <= 0.75) {
      await window.api.moveFolder({ sourcePath: src, targetParentPath: tgt });
      await refresh();
    }
  };

  // 菜单：浮到 body，防点透
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

  // 选中态：只高亮“行”，不罩住子级
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




// 把 srcPath 这棵子树（srcPath 以及所有以它为前缀的路径）
// 当成一个整体，在 flat 列表里移动到 targetPath 这棵子树的上/下。
function reorderFolders(all, srcPath, targetPath, area) {
  const isInSubtree = (p, base) => p === base || p.startsWith(base + "/");
  const arr = [...all];

  // 取出 src 子树块（保持相对顺序）
  const srcBlock = arr.filter(p => isInSubtree(p, srcPath));
  if (!srcBlock.length) return all;

  // 去掉 src 子树
  let rest = arr.filter(p => !isInSubtree(p, srcPath));

  // 找到 target 子树在 rest 里的区间
  const idxs = rest.map((p, i) => [p, i]).filter(([p]) => isInSubtree(p, targetPath)).map(([, i]) => i);
  if (!idxs.length) return all;

  // 不能把一棵树插到自己内部
  if (isInSubtree(targetPath, srcPath)) return all;

  const tStart = Math.min(...idxs);
  const tEnd = Math.max(...idxs) + 1;
  const insertAt = area === "bottom" ? tEnd : tStart;

  rest.splice(insertAt, 0, ...srcBlock);
  return rest;
}

/* ========= 资源列表（仅选中时预览） ========= */
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
      openCreateLink(); // 会自动把“当前文件夹”带到弹窗里
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
    // 点击卡片：选中 + 预览
    el.addEventListener("click", () => {
      STATE.selectedId = r.id;
      renderList();
      openInPreview(r.url);
    });
    // 按钮不冒泡
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
    // 可拖动
    el.draggable = true;
    el.ondragstart = (e) => {
      e.dataTransfer.setData("text/kb-resource", r.id);
      e.dataTransfer.setData("text/plain", "KB:RES:" + r.id);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("drag-ghost");

      // ← 移进来（正确）
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
  // 如果当前选中项不在过滤后列表里，自动取消预览
  if (STATE.selectedId && !filtered.some((x) => x.id === STATE.selectedId)) {
    STATE.selectedId = null;
    openInPreview(null);
  }
}
async function openInPreview(url) {
  if (!url) {
    await window.preview?.load?.('about:blank');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    toast("仅支持 http/https 预览", "error");
    await window.preview?.load?.('about:blank');
    return;
  }
  await window.preview?.load?.(url);
}

/* ========= 新建 / 编辑 ========= */
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
    // 当前预览宽（从 CSS 变量或计算得出）
    const cur = $get('--preview-w') || document.querySelector('.preview')?.getBoundingClientRect().width || 0;
    startPreviewW = clampPreview(cur);
    setPreviewW(startPreviewW);
    document.body.classList.add('resizing');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    // 分隔条向左拖，预览变宽；向右拖，预览变窄
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
    // 窗口缩放时也夹紧一次，避免溢出造成错觉
    const cur = $get('--preview-w') || document.querySelector('.preview')?.getBoundingClientRect().width || 0;
    setPreviewW(clampPreview(cur));
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
      openInPreview(null);
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
      // 同级重名校验（前端简单校验）
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
      // 如果当前正浏览该目录或其子树，更新 STATE.filterFolder
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
  // 如果当前正在查看被删目录或其子树，则切回根目录
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
/* ========= 搜索 & 新建按钮（不再下拉，直连新建链接） ========= */
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
  }; // 直连“新建链接”
}
/* ========= 工具 ========= */
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
// 监听来自主进程的 deeplink
if (window.deeplink?.onAdd) {
  window.deeplink.onAdd(({ url, title, folder }) => {
    // folder 可能是完整路径（如 "学习/项目A"）
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
// 点击页面空白处关闭所有菜单
document.addEventListener("click", () => {
  closeAllFolderMenus();
});
// 滚动或窗口尺寸变化时也收起，避免菜单“悬空”
window.addEventListener("scroll", () => closeAllFolderMenus(), true);
window.addEventListener("resize", () => closeAllFolderMenus());
// —— 等待 window.api 可用（最多等 3 秒），避免未就绪就报错 ——
// 把你原来直接调用 init() 的地方改为：bootstrap();
async function bootstrap() {
  const start = Date.now();
  while (!window.api || typeof window.api.list !== "function") {
    if (Date.now() - start > 3000) {
      // 3 秒还没好，抛明确的错误并给出帮助
      console.error("[bootstrap] window.api 未就绪：", window.api);
      toast("预加载未就绪（window.api 不可用）", "error");
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  // 预加载就绪，继续你原本的流程
  try {
    await init(); // ← 这里就是你原来调用的初始化函数
    if (window.ops?.onChanged) {
      let t = null;
      window.ops.onChanged(() => {
        clearTimeout(t);
        t = setTimeout(async () => {
          try {
            const local = await window.api.list();
            if (window.auth?.syncNow) await window.auth.syncNow(local);
          } catch (e) { }
        }, 800); // 800ms 防抖
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
    // 先解除窗口大小限制（新 API，下面会在 preload/main 中实现）
    try {
      await window.win?.resize?.free?.();
    } catch { }

    document.body.classList.add('preview-max');
    btn.textContent = '⤡';
    btn.title = '退出预览最大化';

    // 等两帧，确保 DOM 布局稳定后再下发 bounds
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

    // 极少数机器上首帧还未稳定：再补一次
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

  // 退出“预览填充满”
  const exit = async () => {
    // ★ 关键：先把 BrowserView 立即缩到极小，避免盖住 UI
    try {
      window.preview?.setBounds?.({ x: 0, y: 0, width: 1, height: 1 });
    } catch { }

    document.body.classList.remove('preview-max');
    btn.textContent = '⤢';
    btn.title = '预览最大化';

    // 等两帧让 DOM 回到“正常布局”
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 再把 BrowserView 放回宿主区域
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

  // 本页焦点时
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

  // 主进程转发的硬键（webview 焦点也能收到）
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

  // overlay 模式初始化：只显示预览
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
// ===== 账号菜单与认证逻辑 =====
function bindAccountUI() {
  const btn = document.getElementById('accountBtn');
  const menu = document.getElementById('accountMenu');
  if (!btn || !menu) return;

  async function redraw() {
    const me = await window.auth?.whoami?.();
    const logged = !!(me && me.user && me.token);
    menu.innerHTML = logged ? `
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
    // 计算菜单位置（右上角对齐按钮）
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
    }
    menu.classList.add('hidden');
    document.body.classList.remove('menu-open');
  });
}

// 启动时绑定账号UI，并做自动同步
async function trySyncNow(showToast = false) {
  try {
    const local = await window.api.list();
    const result = await window.auth.syncNow(local);
    if (showToast) toast(result?.changed ? '已同步（合并去重）' : '已是最新');
    // 如服务端有变更，主动刷新渲染
    if (result?.changed) await refresh();
  } catch (e) { if (showToast) toast('同步失败：' + (e.message || e), 'error'); }
}

// 首次加载 & 定时自动同步
(function () {
  // 你的初始化流程：bootstrap/init 之后调用
  // 若你已有 init()，在它完成后调用这两个：
  bindAccountUI();
  setInterval(() => trySyncNow(false), 60 * 1000); // 每分钟自动同步
})();

// 用现有的表单模态 (#modal) 打开只读 JSON 视图；注意参数顺序：(title, obj)
function openJsonViewer(title, obj) {
  const pretty = JSON.stringify(obj ?? {}, null, 2);

  // 1) 缩小 BrowserView，避免遮住按钮
  let restored = false;
  const restorePreview = () => {
    if (restored) return;
    restored = true;
    try {
      const host = document.getElementById('viewerHost');
      if (host && window.preview?.setBounds) {
        const r = host.getBoundingClientRect();
        window.preview.setBounds({
          x: Math.round(r.left), y: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height)
        });
      }
    } catch {}
    document.body.classList.remove('menu-open');
  };
  try {
    const host = document.getElementById('viewerHost');
    if (host && window.preview?.setBounds) {
      window.preview.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    }
  } catch {}
  document.body.classList.add('menu-open');

  // 2) 复用 openFormModal 画出中心弹窗（去掉取消按钮，统一按钮样式）
  openFormModal({
    title,
    bodyHTML: `
      <textarea id="jsonView" class="json-view" readonly>${pretty}</textarea>
    `,
    onSubmit: () => {},          // 只是关闭
    okText: '关闭',
    cancelText: ''               // 不显示取消
  });

  const modal = document.getElementById('modal');
  const okBtn = document.getElementById('modalOk');
  const cancelBtn = document.getElementById('modalCancel');
  if (cancelBtn) cancelBtn.style.display = 'none';

  // 在 actions 区追加“复制 / 下载JSON”两个按钮（样式跟随 .modal-actions）
  const actions = modal.querySelector('.modal-actions');
  const mkBtn = (txt) => { const b=document.createElement('button'); b.textContent=txt; return b; };
  const copyBtn = mkBtn('复制');
  const saveBtn = mkBtn('下载JSON');
  actions.insertBefore(copyBtn, okBtn);
  actions.insertBefore(saveBtn, okBtn);

  const ta = document.getElementById('jsonView');
  copyBtn.onclick = () => navigator.clipboard.writeText(ta.value);
  saveBtn.onclick = () => {
    const blob = new Blob([ta.value], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='cloud-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  // 3) 关闭时恢复 BrowserView
  okBtn.addEventListener('click', restorePreview, { once: true });
  cancelBtn?.addEventListener('click', restorePreview, { once: true });
  window.addEventListener('beforeunload', restorePreview, { once: true });
}

/* ========= 启动 ========= */
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
  window.addEventListener('resize', layoutPreview);
  layoutPreview();
})();