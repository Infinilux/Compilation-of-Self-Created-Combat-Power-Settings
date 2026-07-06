/* ============================================================
   admin.js —— 管理员页面逻辑
   通过 GitHub Contents API 添加文本到 data.json
   ============================================================ */

// GitHub 配置存储键
const STORAGE_KEYS = {
  token: 'github_token',
  owner: 'github_owner',
  repo: 'github_repo',
  branch: 'github_branch'
};

// 获取/设置 GitHub 配置
function getGithubConfig() {
  return {
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    owner: localStorage.getItem(STORAGE_KEYS.owner) || '',
    repo: localStorage.getItem(STORAGE_KEYS.repo) || '',
    branch: localStorage.getItem(STORAGE_KEYS.branch) || 'main'
  };
}

function saveGithubConfig(config) {
  if (config.token) localStorage.setItem(STORAGE_KEYS.token, config.token);
  if (config.owner) localStorage.setItem(STORAGE_KEYS.owner, config.owner);
  if (config.repo) localStorage.setItem(STORAGE_KEYS.repo, config.repo);
  if (config.branch) localStorage.setItem(STORAGE_KEYS.branch, config.branch);
}

// 调用 GitHub Contents API
// GET: 获取文件内容和 SHA
async function githubGetFile(config) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/data.json?ref=${config.branch}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// PUT: 更新文件
async function githubPutFile(config, content, sha, message) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/data.json`;
  const body = {
    message: message,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
    sha: sha,
    branch: config.branch
  };
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 初始化管理页
document.addEventListener('DOMContentLoaded', () => {
  // 加载已有配置
  const config = getGithubConfig();
  document.getElementById('gh-token').value = config.token;
  document.getElementById('gh-owner').value = config.owner;
  document.getElementById('gh-repo').value = config.repo;
  document.getElementById('gh-branch').value = config.branch;

  // 保存配置按钮
  document.getElementById('btn-save-config').addEventListener('click', () => {
    saveGithubConfig({
      token: document.getElementById('gh-token').value.trim(),
      owner: document.getElementById('gh-owner').value.trim(),
      repo: document.getElementById('gh-repo').value.trim(),
      branch: document.getElementById('gh-branch').value.trim() || 'main'
    });
    showToast('配置已保存到本地', 'success');
  });

  // 提交文本按钮
  document.getElementById('btn-submit').addEventListener('click', async () => {
    const btn = document.getElementById('btn-submit');
    const cfg = getGithubConfig();

    // 验证配置
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      showToast('请先填写并保存 GitHub 配置', 'error');
      return;
    }

    // 获取表单数据
    const title = document.getElementById('text-title').value.trim();
    const author = document.getElementById('text-author').value.trim();
    const content = document.getElementById('text-content').value.trim();
    const date = document.getElementById('text-date').value || new Date().toISOString().split('T')[0];

    if (!title || !content) {
      showToast('标题和正文为必填项', 'error');
      return;
    }

    // 获取选中的分类
    const checkedCategories = [];
    document.querySelectorAll('#category-checks input[type="checkbox"]:checked').forEach(cb => {
      checkedCategories.push(cb.value);
    });

    if (checkedCategories.length === 0) {
      showToast('请至少选择一个分类', 'error');
      return;
    }

    // 构建新文本对象
    const newText = {
      id: generateId(),
      title: title,
      author: author || '佚名',
      content: content,
      date: date,
      categories: checkedCategories
    };

    // 禁用按钮
    btn.disabled = true;
    btn.textContent = '提交中…';

    try {
      // 1. 获取当前 data.json
      const fileData = await githubGetFile(cfg);
      const currentContent = atob(fileData.content);
      let texts;
      try {
        texts = JSON.parse(currentContent);
        if (!Array.isArray(texts)) throw new Error('数据格式错误');
      } catch {
        texts = [];
      }

      // 2. 追加新文本
      texts.push(newText);
      const newContent = JSON.stringify(texts, null, 2);

      // 3. 提交到 GitHub
      await githubPutFile(cfg, newContent, fileData.sha, `添加文本: ${title}`);

      showToast('文本添加成功！GitHub Pages 将在几分钟内自动部署。', 'success');

      // 清空表单
      document.getElementById('text-title').value = '';
      document.getElementById('text-author').value = '';
      document.getElementById('text-content').value = '';
      document.getElementById('text-date').value = '';
      document.querySelectorAll('#category-checks input[type="checkbox"]').forEach(cb => cb.checked = false);

    } catch (err) {
      showToast('提交失败: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = '提交到 GitHub';
    }
  });
});