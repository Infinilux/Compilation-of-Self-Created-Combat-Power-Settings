/* ============================================================
   particles.js —— 几何粒子动效系统
   用于 index.html 开场交互
   白色背景 + 黑色点 + 距离阈值连线构成几何网络
   ============================================================ */

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.width = 0;
    this.height = 0;
    this.animationId = null;
    this.mouse = { x: -1000, y: -1000, active: false };
    this.connectThreshold = 130; // 连线距离阈值
    this.maxSpeed = 0.9;         // 最大速度，保证运动缓慢
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.resize();
    this.bindEvents();
    this.initParticles();
    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    // 适配高分屏
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 根据屏幕面积调整粒子数量
    const targetCount = Math.min(110, Math.max(40, Math.floor((this.width * this.height) / 14000)));
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
      vx: (Math.random() - 0.5) * 0.4, // 初始缓慢速度
      vy: (Math.random() - 0.5) * 0.4,
      radius: 1.2 + Math.random() * 1.6
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.active = false;
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

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
  }

  initParticles() {
    const targetCount = Math.min(110, Math.max(40, Math.floor((this.width * this.height) / 14000)));
    for (let i = 0; i < targetCount; i++) {
      this.addParticle();
    }
  }

  animate() {
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

      // 鼠标交互：轻微排斥，增加几何图形的动态感
      if (this.mouse.active) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0.01) {
          const force = (120 - dist) / 120 * 0.06;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // 限制最大速度，保持缓慢运动
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > this.maxSpeed) {
        p.vx = (p.vx / speed) * this.maxSpeed;
        p.vy = (p.vy / speed) * this.maxSpeed;
      }

      // 轻微阻尼，避免速度持续累积
      p.vx *= 0.995;
      p.vy *= 0.995;

      // 防止完全静止
      const minSpeed = 0.08;
      const curSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (curSpeed < minSpeed) {
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vy += (Math.random() - 0.5) * 0.05;
      }
    }

    // 绘制连线（距离小于阈值时连线，构成几何网络）
    const threshold = this.connectThreshold;
    for (let i = 0; i < this.particles.length; i++) {
      const p1 = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold) {
          // 距离越近线越深
          const alpha = (1 - dist / threshold) * 0.55;
          ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
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

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.particles = [];
  }
}

// 初始化
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return null;
  return new ParticleSystem(canvas);
}
