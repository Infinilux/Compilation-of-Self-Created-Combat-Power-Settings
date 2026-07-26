/* ============================================================
   particles.js —— 几何粒子动效系统
   用于 index.html 开场交互
   白色背景 + 黑色点 + 距离阈值连线构成几何网络
   优化：空间分区降低连线计算复杂度、节流鼠标事件、
        离屏渲染跳过、粒子数量自适应
   ============================================================ */

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }); // alpha:false 提升性能
    this.particles = [];
    this.width = 0;
    this.height = 0;
    this.animationId = null;
    this.mouse = { x: -1000, y: -1000, active: false };
    this.connectThreshold = 130;
    this.cellSize = this.connectThreshold; // 空间分区单元格大小
    this.grid = new Map(); // 空间分区网格
    this.maxSpeed = 0.9;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lastFrameTime = 0;
    this.frameInterval = 1000 / 60; // 目标 60fps
    this.isVisible = true;

    this.resize();
    this.bindEvents();
    this.initParticles();
    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 根据屏幕面积调整粒子数量（性能与效果平衡）
    const targetCount = Math.min(80, Math.max(30, Math.floor((this.width * this.height) / 18000)));
    while (this.particles.length < targetCount) {
      this.addParticle();
    }
    while (this.particles.length > targetCount) {
      this.particles.pop();
    }
  }

  addParticle() {
    this.particles.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: 1.2 + Math.random() * 1.6
    });
  }

  bindEvents() {
    // 节流的 resize 事件
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.resize(), 150);
    });

    // 节流的鼠标移动事件
    let mouseTimer = null;
    window.addEventListener('mousemove', (e) => {
      if (mouseTimer) return;
      mouseTimer = requestAnimationFrame(() => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
        mouseTimer = null;
      });
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.active = false;
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    // 触摸事件
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouse.x = e.touches[0].clientX;
        this.mouse.y = e.touches[0].clientY;
        this.mouse.active = true;
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.mouse.active = false;
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    // 页面可见性变化时暂停/恢复动画
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible && !this.animationId) {
        this.lastFrameTime = 0;
        this.animate();
      } else if (!this.isVisible && this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    });
  }

  initParticles() {
    const targetCount = Math.min(80, Math.max(30, Math.floor((this.width * this.height) / 18000)));
    for (let i = 0; i < targetCount; i++) {
      this.addParticle();
    }
  }

  // 构建空间分区网格，将粒子分配到单元格
  buildGrid() {
    this.grid.clear();
    for (const p of this.particles) {
      const cx = Math.floor(p.x / this.cellSize);
      const cy = Math.floor(p.y / this.cellSize);
      const key = cx + ',' + cy;
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(p);
    }
  }

  // 获取某粒子周围单元格内的所有粒子
  getNeighbors(p) {
    const cx = Math.floor(p.x / this.cellSize);
    const cy = Math.floor(p.y / this.cellSize);
    const neighbors = [];
    // 只检查 3x3 的相邻单元格（因为 cellSize >= connectThreshold）
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = (cx + dx) + ',' + (cy + dy);
        const cell = this.grid.get(key);
        if (cell) {
          for (const other of cell) {
            if (other !== p) neighbors.push(other);
          }
        }
      }
    }
    return neighbors;
  }

  animate(timestamp) {
    // 帧率限制
    if (timestamp && this.lastFrameTime && timestamp - this.lastFrameTime < this.frameInterval) {
      this.animationId = requestAnimationFrame((t) => this.animate(t));
      return;
    }
    this.lastFrameTime = timestamp || 0;

    if (!this.isVisible) {
      this.animationId = null;
      return;
    }

    const ctx = this.ctx;

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    // 更新粒子位置
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;

      // 边界反弹
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      else if (p.x > this.width) { p.x = this.width; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      else if (p.y > this.height) { p.y = this.height; p.vy *= -1; }

      // 鼠标交互
      if (this.mouse.active) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 14400 && distSq > 0.01) { // 120^2
          const dist = Math.sqrt(distSq);
          const force = (120 - dist) / 120 * 0.06;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // 限制最大速度
      const speedSq = p.vx * p.vx + p.vy * p.vy;
      if (speedSq > 0.81) { // 0.9^2
        const speed = Math.sqrt(speedSq);
        p.vx = (p.vx / speed) * this.maxSpeed;
        p.vy = (p.vy / speed) * this.maxSpeed;
      }

      // 阻尼
      p.vx *= 0.995;
      p.vy *= 0.995;

      // 防止完全静止
      const curSpeedSq = p.vx * p.vx + p.vy * p.vy;
      if (curSpeedSq < 0.0064) { // 0.08^2
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vy += (Math.random() - 0.5) * 0.05;
      }
    }

    // 构建空间分区网格
    this.buildGrid();

    // 绘制连线（使用空间分区，复杂度从 O(n²) 降到 O(n)）
    const threshold = this.connectThreshold;
    const thresholdSq = threshold * threshold;
    const drawnPairs = new Set();

    for (const p of this.particles) {
      const neighbors = this.getNeighbors(p);
      for (const p2 of neighbors) {
        // 避免重复绘制同一对粒子
        const pairKey = p.x < p2.x ? p.x + ',' + p.y + '|' + p2.x + ',' + p2.y
                                   : p2.x + ',' + p2.y + '|' + p.x + ',' + p.y;
        if (drawnPairs.has(pairKey)) continue;
        drawnPairs.add(pairKey);

        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < thresholdSq) {
          const dist = Math.sqrt(distSq);
          const alpha = (1 - dist / threshold) * 0.55;
          ctx.strokeStyle = 'rgba(0,0,0,' + alpha + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // 绘制黑色点
    ctx.fillStyle = '#000000';
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    this.animationId = requestAnimationFrame((t) => this.animate(t));
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.particles = [];
    this.grid.clear();
  }
}

// 初始化
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return null;
  return new ParticleSystem(canvas);
}
