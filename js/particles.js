/* ============================================================
   particles.js —— 几何粒子动效系统
   用于 index.html 开场交互
   ============================================================ */

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: -100, y: -100, active: false };
    this.width = 0;
    this.height = 0;
    this.animationId = null;
    this.lastSpawn = 0;
    this.spawnInterval = 80; // ms

    this.resize();
    this.bindEvents();
    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    // 鼠标移动
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.active = false;
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
    });
  }

  // 创建粒子爆发
  spawnBurst(x, y) {
    const count = 8 + Math.floor(Math.random() * 12);
    const shapeType = Math.floor(Math.random() * 3); // 0: 圆形扩散, 1: 三角, 2: 网格

    for (let i = 0; i < count; i++) {
      let angle, speed, life;

      switch (shapeType) {
        case 0: // 圆形扩散
          angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
          speed = 1.5 + Math.random() * 3;
          life = 40 + Math.random() * 30;
          break;
        case 1: // 三角形
          angle = (Math.PI * 2 * i) / 3 + (Math.random() - 0.5) * 0.3;
          speed = 2 + Math.random() * 4;
          life = 30 + Math.random() * 25;
          break;
        case 2: // 网格线
          angle = (Math.PI / 2) * (i % 4) + (Math.random() - 0.5) * 0.2;
          speed = 2.5 + Math.random() * 3;
          life = 35 + Math.random() * 20;
          break;
      }

      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        size: 0.5 + Math.random() * 1.5,
        shapeType: shapeType,
        connectId: i < 4 ? i : null // 用于连线
      });
    }

    // 限制粒子总数
    if (this.particles.length > 300) {
      this.particles.splice(0, this.particles.length - 300);
    }
  }

  // 绘制连线
  drawConnections(particles) {
    const ctx = this.ctx;
    const threshold = 80;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < threshold) {
          const alpha = (1 - dist / threshold) * 0.15 * (particles[i].life / particles[i].maxLife) * (particles[j].life / particles[j].maxLife);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  animate() {
    const ctx = this.ctx;
    const now = Date.now();

    // 清理画布 - 使用拖尾效果
    ctx.fillStyle = 'rgba(10,10,10,0.15)';
    ctx.fillRect(0, 0, this.width, this.height);

    // 鼠标活跃时生成粒子
    if (this.mouse.active && now - this.lastSpawn > this.spawnInterval) {
      this.spawnBurst(this.mouse.x, this.mouse.y);
      this.lastSpawn = now;
    }

    // 背景粒子（始终存在少量）
    if (!this.mouse.active && Math.random() < 0.03) {
      const rx = Math.random() * this.width;
      const ry = Math.random() * this.height;
      this.particles.push({
        x: rx,
        y: ry,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: 60 + Math.random() * 40,
        maxLife: 100,
        size: 0.3 + Math.random() * 0.8,
        shapeType: -1,
        connectId: null
      });
    }

    // 更新和绘制粒子
    const alive = [];
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      if (p.life <= 0) continue;

      const alpha = p.life / p.maxLife;
      const size = p.size * alpha;

      // 绘制粒子光点
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
      ctx.shadowColor = `rgba(255,255,255,${alpha * 0.4})`;
      ctx.shadowBlur = size * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      alive.push(p);
    }

    // 绘制连线
    this.drawConnections(alive);

    this.particles = alive;
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