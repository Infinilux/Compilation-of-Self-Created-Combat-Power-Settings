/* ============================================================
   main.js —— 公共工具与数据加载模块
   所有列表页和阅读页共用
   优化：智能缓存、搜索索引、减少重排
   ============================================================ */

// 分类体系定义
const CATEGORY_CONFIG = {
  'aos标准': {
    subs: ['论外三线', '论外二线', '论外一线', '论外超一线', '论外天花板·下', '论外天花板·中', '论外天花板·上', '论外天花板·最上'],
    page: 'category-aos.html'
  },
  '404标准': {
    subs: ['论外三线', '论外二线', '论外一线', '论外超一线', '论外天花板·下', '论外天花板·中', '论外天花板·上', '论外天花板·最上'],
    page: 'category-404.html'
  },
  '超越旧神盒': {
    subs: [],
    page: 'category-beyond-godbox.html'
  },
  '未评定量级': {
    subs: [],
    page: 'category-unrated.html'
  },
  '想法/灵感/闲言碎语': {
    subs: [],
    page: 'category-ideas.html'
  }
};

const TOP_CATEGORIES = Object.keys(CATEGORY_CONFIG);

// 全局数据缓存（仅元数据 + 摘要，不含正文）
let allTexts = [];
// 搜索索引缓存（避免每次输入都重新计算 toLowerCase）
let searchIndex = null;
// 单个文档正文缓存（内存）：id -> content
const textContentCache = {};

// 数据版本号（更新数据时手动递增此数字即可破坏缓存）
const DATA_VERSION = '20260756';

// 加载索引（轻量，仅元数据+摘要，约 15KB）
// 列表页和阅读页共用，用于展示卡片和搜索
async function loadData() {
  try {
    const cacheKey = 'index_cache_v' + DATA_VERSION;

    // 尝试从 localStorage 读取缓存
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        allTexts = JSON.parse(cached);
        // 后台异步检查更新（不阻塞渲染）
        refreshIndexInBackground(cacheKey);
        return allTexts;
      }
    } catch (e) {
      // localStorage 不可用或缓存损坏，忽略
    }

    // 无缓存，直接下载 index.json（15KB，秒开）
    const resp = await fetch('index.json?v=' + DATA_VERSION);
    if (!resp.ok) throw new Error('索引加载失败');
    allTexts = await resp.json();

    // 写入缓存（15KB 完全没问题）
    try {
      localStorage.setItem(cacheKey, JSON.stringify(allTexts));
    } catch (e) {
      cleanOldCache();
      try {
        localStorage.setItem(cacheKey, JSON.stringify(allTexts));
      } catch (e2) { /* 忽略 */ }
    }

    return allTexts;
  } catch (err) {
    console.error('加载 index.json 失败:', err);
    return [];
  }
}

// 按需加载单个文档的完整正文（阅读页使用）
// 大文档（>500KB）只内存缓存，不进 localStorage；小文档进 localStorage
async function loadTextById(id) {
  // 1. 内存缓存
  if (textContentCache[id]) return textContentCache[id];

  // 2. localStorage 缓存（仅小文档）
  const lsKey = 'text_v' + DATA_VERSION + '_' + id;
  try {
    const cached = localStorage.getItem(lsKey);
    if (cached) {
      const data = JSON.parse(cached);
      textContentCache[id] = data.content;
      return data.content;
    }
  } catch (e) { /* 忽略 */ }

  // 3. 从服务器下载 data/{id}.json
  try {
    const resp = await fetch(`data/${id}.json?v=` + DATA_VERSION);
    if (!resp.ok) throw new Error('文档加载失败');
    const data = await resp.json();
    textContentCache[id] = data.content;

    // 小文档（< 200KB）写入 localStorage，大文档只内存缓存
    if (data.content.length < 200000) {
      try {
        localStorage.setItem(lsKey, JSON.stringify({ content: data.content }));
      } catch (e) {
        // localStorage 满了，清理旧版本文档缓存
        cleanOldTextCache();
        try {
          localStorage.setItem(lsKey, JSON.stringify({ content: data.content }));
        } catch (e2) { /* 忽略 */ }
      }
    }
    return data.content;
  } catch (err) {
    console.error(`加载文档 ${id} 失败:`, err);
    return null;
  }
}

// 清理旧版本的文档正文缓存
function cleanOldTextCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // 清理旧版本的 text_v* 缓存
      if (key && key.startsWith('text_v') && !key.startsWith('text_v' + DATA_VERSION)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) { /* 忽略 */ }
}

// 后台静默刷新索引
async function refreshIndexInBackground(cacheKey) {
  try {
    const resp = await fetch('index.json?v=' + DATA_VERSION, { method: 'GET' });
    if (!resp.ok) return;
    const fresh = await resp.json();
    const freshStr = JSON.stringify(fresh);
    const cachedStr = localStorage.getItem(cacheKey);
    if (freshStr !== cachedStr) {
      localStorage.setItem(cacheKey, freshStr);
      allTexts = fresh;
      searchIndex = null;
    }
  } catch (e) {
    // 后台刷新失败不影响用户使用
  }
}

// 清理旧版本索引缓存
function cleanOldCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('index_cache_v') && key !== 'index_cache_v' + DATA_VERSION) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    cleanOldTextCache();
  } catch (e) { /* 忽略 */ }
}

// 构建搜索索引（搜标题+作者+摘要，不搜全文）
// 列表页只加载了 index.json（无正文），所以搜索基于摘要
function buildSearchIndex() {
  if (searchIndex) return searchIndex;
  searchIndex = allTexts.map(t => ({
    id: t.id,
    titleLower: t.title.toLowerCase(),
    authorLower: (t.author || '').toLowerCase(),
    summaryLower: (t.summary || '').toLowerCase(),
    ref: t
  }));
  return searchIndex;
}

// 获取文本摘要（从 index 的 summary 字段取，或从 content 截取）
function getExcerpt(text, len = 100) {
  // 优先使用 index 中的 summary 字段
  if (text.summary) return text.summary;
  // 兼容旧数据：从 content 截取
  const content = text.content || '';
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.length > len ? cleaned.slice(0, len) + '…' : cleaned;
}

// 根据分类筛选文本
function filterByCategory(texts, topCategory) {
  return texts.filter(t => t.categories.includes(topCategory));
}

// 根据子分类筛选
function filterBySubCategory(texts, subCategory) {
  return texts.filter(t => t.categories.includes(subCategory));
}

// 搜索文本（搜标题+作者+摘要，不搜全文）
// 列表页只加载了 index.json（无正文），所以搜索基于摘要
function searchTexts(texts, query) {
  if (!query.trim()) return texts.map(t => ({ ...t, matches: [] }));
  const q = query.trim().toLowerCase();

  // 使用搜索索引
  const index = buildSearchIndex();
  const idSet = new Set(texts.map(t => t.id));

  const results = [];
  for (const item of index) {
    if (!idSet.has(item.id)) continue;
    const titleMatch = item.titleLower.includes(q);
    const authorMatch = item.authorLower.includes(q);
    const summaryMatch = item.summaryLower.includes(q);
    if (titleMatch || authorMatch || summaryMatch) {
      results.push({ ...item.ref, matches: { title: titleMatch, author: authorMatch, summary: summaryMatch } });
    }
  }
  return results;
}

// 高亮关键词
function highlightText(text, query) {
  if (!query || !query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 统计字数（中文字符+英文单词）
function countWords(text) {
  if (!text) return 0;
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

// 统计符号数量
function countSymbols(text) {
  if (!text) return 0;
  return (text.match(/[^\u4e00-\u9fff\u0030-\u0039\u0041-\u005a\u0061-\u007a\s]/g) || []).length;
}

// localStorage 读写
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem('reading_' + key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function lsSet(key, value) {
  try {
    localStorage.setItem('reading_' + key, JSON.stringify(value));
  } catch { /* ignore */ }
}

// Toast 消息
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// 获取 URL 参数
function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// 渲染导航栏（使用 DocumentFragment 减少重排）
function renderNavbar(currentPage) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = `
    <a href="index.html" class="navbar-brand">藏书阁</a>
    <button class="nav-toggle" aria-label="菜单">&#9776;</button>
    <div class="navbar-links">
      <a href="category-aos.html" class="${currentPage === 'aos' ? 'active' : ''}">AOS标准</a>
      <a href="category-404.html" class="${currentPage === '404' ? 'active' : ''}">404标准</a>
      <a href="category-beyond-godbox.html" class="${currentPage === 'godbox' ? 'active' : ''}">超越旧神盒</a>
      <a href="category-unrated.html" class="${currentPage === 'unrated' ? 'active' : ''}">未评定量级</a>
      <a href="category-ideas.html" class="${currentPage === 'ideas' ? 'active' : ''}">想法/灵感</a>
      <a href="changelog.html" class="${currentPage === 'changelog' ? 'active' : ''}">更新日志</a>
    </div>
  `;
  return nav;
}

// 导航栏移动端切换
function initNavToggle() {
  document.addEventListener('click', function(e) {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.navbar-links');
    if (!toggle || !links) return;
    if (e.target === toggle || toggle.contains(e.target)) {
      links.classList.toggle('open');
    } else if (!links.contains(e.target)) {
      links.classList.remove('open');
    }
  });
}

// 渲染分类tab
function renderCategoryTabs(activeCategory, container) {
  container.innerHTML = TOP_CATEGORIES.map(cat =>
    `<button class="category-tab${cat === activeCategory ? ' active' : ''}" data-category="${cat}">
      ${cat}
    </button>`
  ).join('');

  container.querySelectorAll('.category-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      const cfg = CATEGORY_CONFIG[cat];
      if (cfg && cfg.page) {
        window.location.href = cfg.page;
      }
    });
  });
}

// 渲染筛选按钮
function renderFilterBar(subCategories, activeSub, container, onChange) {
  // 使用 DocumentFragment 减少重排
  const fragment = document.createDocumentFragment();

  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn' + (activeSub === 'all' ? ' active' : '');
  allBtn.textContent = '全部';
  allBtn.dataset.category = 'all';
  allBtn.addEventListener('click', () => {
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    onChange('all');
  });
  fragment.appendChild(allBtn);

  subCategories.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (activeSub === sub ? ' active' : '');
    btn.textContent = sub;
    btn.dataset.category = sub;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(sub);
    });
    fragment.appendChild(btn);
  });

  container.appendChild(fragment);
}

// 渲染文本卡片列表（使用 DocumentFragment 优化）
function renderCardList(texts, query, container) {
  if (texts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#9744;</div>
        <p>暂无匹配的文本</p>
      </div>
    `;
    return;
  }

  container.innerHTML = texts.map(t => {
    const titleHtml = highlightText(t.title, query);
    const excerptHtml = highlightText(getExcerpt(t), query);
    return `
      <div class="card" data-id="${t.id}">
        <div class="card-title">${titleHtml}</div>
        <div class="card-meta">
          <span>&#9998; ${t.author}</span>
          <span>&#128197; ${formatDate(t.date)}</span>
        </div>
        <div class="card-tags">
          ${t.categories.map(c => `<span class="card-tag">${c}</span>`).join('')}
        </div>
        <div class="card-excerpt">${excerptHtml}</div>
      </div>
    `;
  }).join('');

  // 点击卡片跳转阅读页
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      window.location.href = `reading.html?id=${id}`;
    });
  });

  // 渲染卡片中的 LaTeX 公式（标题、摘要）
  renderMath(container);
}

// 防抖工具函数（用于搜索输入优化）
function debounce(fn, delay = 200) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

// ============================================================
// LaTeX 渲染支持（KaTeX auto-render）
// 异步等待 KaTeX 加载完成，不阻塞页面渲染
// ============================================================

// 预处理：把文本中裸露的 LaTeX 命令用 $...$ 包裹
// 文档中的 \omega_0 等命令没有用 $...$ 包裹，
// KaTeX auto-render 默认只处理有定界符的内容，因此需要预处理
function wrapBareLatex(text) {
  // 如果已经包含 $ 定界符，不处理（避免重复包裹）
  if (text.includes('$')) return text;

  // 修正 \ 后面多余的空格：\ Gamma → \Gamma
  text = text.replace(/\\\s+([a-zA-Z])/g, '\\$1');

  // 片段边界：遇到这些字符就分割，两边的 LaTeX 片段分别包裹
  // \u4e00-\u9fff: 中文字符
  // \u3000-\u303f: CJK 标点（、。…等）
  // \uff00-\uffef: 全角字符（（）＝＜等）
  // \u2190-\u21ff: 箭头符号（↑→↓等）—— KaTeX 不认识这些 Unicode 符号
  // \u2200-\u22ff: 数学运算符（∞≤≥≠等）—— 同上
  // \u2026: 省略号 …
  const boundary = '\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef'
                 + '\\u2190-\\u21ff\\u2200-\\u22ff\\u2026'
                 + '，。、；：！？';

  // 匹配包含至少一个 \命令 的非边界连续片段
  const regex = new RegExp(
    '([^' + boundary + ']*\\\\[a-zA-Z]+[^' + boundary + ']*)',
    'g'
  );

  return text.replace(regex, (match) => {
    const trimmed = match.trim();
    if (!trimmed) return match;

    // 检查花括号是否配对（避免 \bigcup_{\alpha 这种只有 { 没有 } 的情况）
    const open = (trimmed.match(/\{/g) || []).length;
    const close = (trimmed.match(/\}/g) || []).length;
    if (open !== close) return match; // 花括号不配对，不包裹（保持原文，不标红）

    return '$' + trimmed + '$';
  });
}
let katexReady_ = null;

function loadKatex_() {
  if (katexReady_) return katexReady_;
  katexReady_ = new Promise((resolve) => {
    if (window.renderMathInElement) {
      resolve();
      return;
    }
    // 轮询等待 KaTeX auto-render 加载完成
    let elapsed = 0;
    const check = setInterval(() => {
      elapsed += 50;
      if (window.renderMathInElement) {
        clearInterval(check);
        resolve();
      } else if (elapsed > 10000) {
        // 超时保护：10 秒后放弃，避免 Promise 永远 pending
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  return katexReady_;
}

// 对指定 DOM 元素及其子节点中的 LaTeX 公式进行渲染
// 支持 $...$、$$...$$、\(...\)、\[...\] 定界符
function renderMath(element) {
  if (!element) return Promise.resolve();
  return loadKatex_().then(() => {
    if (!window.renderMathInElement) return;
    try {
      renderMathInElement(element, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        ignoredClasses: ['no-math']
      });
    } catch (e) { /* 渲染失败时保留原始文本 */ }
  });
}

// ============================================================
// 公告条（可关闭，关闭后用 localStorage 记住不再显示）
// ============================================================
const ANNOUNCEMENT_KEY = 'announcement_closed_v2';
const ANNOUNCEMENT_TEXT = '若想提交公开自创战力作品，请联系网站作者 B站:屑鹿a';

function initAnnouncement() {
  // 已关闭则不再显示
  try {
    if (localStorage.getItem(ANNOUNCEMENT_KEY) === '1') return;
  } catch (e) { /* 忽略 */ }

  // 避免重复插入
  if (document.getElementById('site-announcement')) return;

  const bar = document.createElement('div');
  bar.id = 'site-announcement';
  bar.className = 'announcement-bar';
  bar.innerHTML = `
    <span class="announcement-icon">&#128227;</span>
    <span class="announcement-text">${ANNOUNCEMENT_TEXT}</span>
    <button class="announcement-close" aria-label="关闭公告">&times;</button>
  `;

  // 插入到 body 最前面，navbar 会自动推到下方
  document.body.insertBefore(bar, document.body.firstChild);

  // 关闭按钮
  bar.querySelector('.announcement-close').addEventListener('click', () => {
    bar.style.display = 'none';
    try { localStorage.setItem(ANNOUNCEMENT_KEY, '1'); } catch (e) { /* 忽略 */ }
  });
}

// 初始化公共功能
document.addEventListener('DOMContentLoaded', () => {
  initAnnouncement();
  initNavToggle();
});
