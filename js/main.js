/* ============================================================
   main.js —— 公共工具与数据加载模块
   所有列表页和阅读页共用
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
  '超越404标准': {
    subs: [],
    page: 'category-beyond-404.html'
  },
  '超越旧神盒': {
    subs: [],
    page: 'category-beyond-godbox.html'
  }
};

const TOP_CATEGORIES = Object.keys(CATEGORY_CONFIG);

// 全局数据缓存
let allTexts = [];

// 加载数据
async function loadData() {
  try {
    const resp = await fetch('data.json');
    if (!resp.ok) throw new Error('数据加载失败');
    allTexts = await resp.json();
    return allTexts;
  } catch (err) {
    console.error('加载 data.json 失败:', err);
    return [];
  }
}

// 获取文本摘要（前100字）
function getExcerpt(content, len = 100) {
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

// 搜索文本（标题+正文），返回匹配项及匹配位置
function searchTexts(texts, query) {
  if (!query.trim()) return texts.map(t => ({ ...t, matches: [] }));
  const q = query.trim().toLowerCase();
  return texts
    .map(t => {
      const titleMatch = t.title.toLowerCase().includes(q);
      const contentMatch = t.content.toLowerCase().includes(q);
      if (titleMatch || contentMatch) {
        return { ...t, matches: { title: titleMatch, content: contentMatch } };
      }
      return null;
    })
    .filter(Boolean);
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
  // 中文字符
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文单词
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

// 统计符号数量（非中英文数字的字符）
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

// 渲染导航栏（分类页使用）
function renderNavbar(currentPage) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = `
    <a href="index.html" class="navbar-brand">藏书阁</a>
    <button class="nav-toggle" aria-label="菜单">&#9776;</button>
    <div class="navbar-links">
      <a href="category-aos.html" class="${currentPage === 'aos' ? 'active' : ''}">AOS标准</a>
      <a href="category-404.html" class="${currentPage === '404' ? 'active' : ''}">404标准</a>
      <a href="category-beyond-404.html" class="${currentPage === 'beyond404' ? 'active' : ''}">超越404</a>
      <a href="category-beyond-godbox.html" class="${currentPage === 'godbox' ? 'active' : ''}">超越旧神盒</a>
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

// 渲染分类tab（顶级分类切换）
function renderCategoryTabs(activeCategory, container) {
  container.innerHTML = TOP_CATEGORIES.map(cat =>
    `<button class="category-tab${cat === activeCategory ? ' active' : ''}" data-category="${cat}">
      ${cat}
    </button>`
  ).join('');

  // 点击事件
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
  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn' + (activeSub === 'all' ? ' active' : '');
  allBtn.textContent = '全部';
  allBtn.dataset.category = 'all';
  allBtn.addEventListener('click', () => {
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    onChange('all');
  });
  container.appendChild(allBtn);

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
    container.appendChild(btn);
  });
}

// 渲染文本卡片列表
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
    const excerptHtml = highlightText(getExcerpt(t.content), query);
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
}

// 初始化公共功能
document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
});