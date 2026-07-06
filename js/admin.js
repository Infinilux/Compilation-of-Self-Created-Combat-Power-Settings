/* ============================================================
   admin.js —— 管理员页面逻辑
   通过 GitHub Contents API 添加/删除文本
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

// UTF-8 字符串转 Base64（经典方案，兼容所有浏览器）
function utf8ToBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    function(match, p1) { return String.fromCharCode('0x' + p1); }
  ));
}

// Base64 转 UTF-8 字符串（处理 GitHub API 返回的含换行 base64）
function base64ToUtf8(b64) {
  // GitHub API 返回的 base64 可能包含换行符，先清理
  const clean = b64.replace(/\s/g, '');
  try {
    const binary = atob(clean);
    return decodeURIComponent(
      Array.prototype.map.call(binary, function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
  } catch (e) {
    // 降级：尝试直接 atob
    return decodeURIComponent(escape(atob(clean)));
  }
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

// PUT: 更新文件（整体替换）
async function githubPutFile(config, content, sha, message) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/data.json`;
  const body = {
    message: message,
    content: utf8ToBase64(content),
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

// 重置添加表单
function resetForm() {
  document.getElementById('text-title').value = '';
  document.getElementById('text-author').value = '佚名';
  document.getElementById('text-content').value = '';
  document.getElementById('text-date').value = new Date().toISOString().split('T')[0];
  document.querySelectorAll('#category-checks input[type="checkbox"]').forEach(cb => cb.checked = false);
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

  // === 文件上传：自动填入正文 ===
  document.getElementById('file-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 更新按钮文字显示文件名
    const btn = document.getElementById('file-upload-btn');
    const originalText = btn.textContent;
    btn.textContent = '读取中…';

    const reader = new FileReader();
    reader.onload = function(ev) {
      const text = ev.target.result;
      document.getElementById('text-content').value = text;

      // 尝试用第一行作为标题
      const titleInput = document.getElementById('text-title');
      if (!titleInput.value.trim()) {
        const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
        if (firstLine && firstLine.length < 50) {
          titleInput.value = firstLine;
        }
      }

      btn.textContent = file.name;
      showToast('文件已读取，已自动填入正文', 'success');
    };
    reader.onerror = function() {
      btn.textContent = originalText;
      showToast('文件读取失败', 'error');
    };
    reader.readAsText(file, 'UTF-8');
  });

  // === 提交文本按钮 ===
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

    const newText = {
      id: generateId(),
      title: title,
      author: author || '佚名',
      content: content,
      date: date,
      categories: checkedCategories
    };

    btn.disabled = true;
    btn.textContent = '提交中…';

    try {
      const fileData = await githubGetFile(cfg);
      const currentContent = base64ToUtf8(fileData.content);
      let texts;
      try {
        texts = JSON.parse(currentContent);
        if (!Array.isArray(texts)) throw new Error('数据格式错误');
      } catch {
        texts = [];
      }
      texts.push(newText);
      const newContent = JSON.stringify(texts, null, 2);
      await githubPutFile(cfg, newContent, fileData.sha, '添加文本: ' + title);

      showToast('文本添加成功！GitHub Pages 将在几分钟内自动部署。', 'success');
      resetForm();

    } catch (err) {
      showToast('提交失败: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = '提交到 GitHub';
    }
  });

  // === 加载现有文本列表 ===
  document.getElementById('btn-load-texts').addEventListener('click', async () => {
    const btn = document.getElementById('btn-load-texts');
    const cfg = getGithubConfig();
    const listEl = document.getElementById('text-list');

    if (!cfg.token || !cfg.owner || !cfg.repo) {
      showToast('请先填写并保存 GitHub 配置', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '加载中…';
    listEl.innerHTML = '';

    try {
      const fileData = await githubGetFile(cfg);
      const currentContent = base64ToUtf8(fileData.content);
      const texts = JSON.parse(currentContent);

      if (!Array.isArray(texts) || texts.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>暂无文本</p></div>';
        return;
      }

      listEl.innerHTML = texts.map((t, idx) => `
        <div class="text-item" data-id="${t.id}">
          <div class="text-item-info">
            <div class="text-item-title">${t.title}</div>
            <div class="text-item-meta">
              ${t.author} · ${t.date} · ${t.categories.join(', ')}
            </div>
          </div>
          <button class="btn btn-danger btn-delete" data-id="${t.id}" data-idx="${idx}">删除</button>
        </div>
      `).join('');

      // 绑定删除按钮事件
      listEl.querySelectorAll('.btn-delete').forEach(delBtn => {
        delBtn.addEventListener('click', async function() {
          const textId = this.dataset.id;
          const textTitle = this.closest('.text-item').querySelector('.text-item-title').textContent;

          if (!confirm('确定要删除「' + textTitle + '」吗？此操作不可撤销。')) return;

          this.disabled = true;
          this.textContent = '删除中…';

          try {
            // 重新获取最新 SHA（防止并发修改）
            const latestFile = await githubGetFile(cfg);
            const latestContent = base64ToUtf8(latestFile.content);
            const latestTexts = JSON.parse(latestContent);

            // 过滤掉被删除的文本
            const updatedTexts = latestTexts.filter(t => t.id !== textId);

            if (updatedTexts.length === latestTexts.length) {
              throw new Error('未找到该文本，可能已被删除');
            }

            const newContent = JSON.stringify(updatedTexts, null, 2);
            await githubPutFile(cfg, newContent, latestFile.sha, '删除文本: ' + textTitle);

            showToast('删除成功！', 'success');
            // 从列表中移除
            this.closest('.text-item').remove();

            // 如果列表为空
            if (updatedTexts.length === 0) {
              listEl.innerHTML = '<div class="empty-state"><p>暂无文本</p></div>';
            }

          } catch (err) {
            showToast('删除失败: ' + err.message, 'error');
            console.error(err);
          } finally {
            this.disabled = false;
            this.textContent = '删除';
          }
        });
      });

    } catch (err) {
      showToast('加载失败: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = '加载现有文本';
    }
  });
});