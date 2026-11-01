/*
 * gogo?gogo! — skillcom RPG · 효과(FX) 엔진  (v40 그래픽 강화)
 *  - 빛나는 입자(파티클) · 마법 모양(원소 6 × 종류 8) · 맞을 때 불꽃 · 몬스터 사라짐 · 동전 · 레벨 업 기둥
 *  - 지역 분위기(날씨·안개·반딧불·눈·불티·꽃잎·동굴 어둠과 빛) · 마법 아이콘 그림
 *  - game.js 가 위치·피해를 계산하고, 그림은 모두 여기서 그림 (window.GoRPGFx)
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  /* ---------- 원소 색 (밝은 → 진한) ---------- */
  const PAL = {
    fire: ['#FFFBE0', '#FFE45C', '#FF9A3D', '#E8402A', '#8A1E10'],
    water: ['#FFFFFF', '#CFF0FF', '#6CC4FF', '#2F7FE0', '#183E8A'],
    wind: ['#FFFFFF', '#E8FFF6', '#9AF0D4', '#3EC09A', '#1E6A58'],
    earth: ['#FFF0CC', '#E8C07A', '#B8834A', '#7A5228', '#3E2814'],
    thunder: ['#FFFFFF', '#FFFBC8', '#FFE45C', '#C8A0FF', '#6A3ED0'],
    light: ['#FFFFFF', '#FFFCE8', '#FFF0A0', '#FFD23F', '#C89A1A'],
    dark: ['#E8D8FF', '#B08AF0', '#7A4AD0', '#4A2A8A', '#1E1040'],
    blood: ['#FFFFFF', '#FFC0C0', '#FF6A6E', '#D2343A', '#6A1018']
  };
  const pal = el => PAL[el] || PAL.light;

  /* ---------- 빛 번짐 그림 (색·크기마다 한 번만 만듦) ---------- */
  const glowC = {};
  function glow(color, r) {
    r = Math.max(4, Math.round(r / 4) * 4); const k = color + r;
    if (glowC[k]) return glowC[k];
    const [c, x] = mk(r * 2, r * 2), g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, color); g.addColorStop(0.35, color + 'AA'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
    return (glowC[k] = c);
  }
  const drawGlow = (ctx, x, y, r, color, a) => { const g = glow(color, r); ctx.globalAlpha = a == null ? 1 : a; ctx.drawImage(g, x - g.width / 2, y - g.height / 2); ctx.globalAlpha = 1; };

  /* ---------- 번개 모양 (꺾인 선) ---------- */
  function boltPath(x1, y1, x2, y2, jag, seg) {
    const pts = [[x1, y1]], n = seg || Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) { const t = i / n, o = rand(-jag, jag); pts.push([x1 + (x2 - x1) * t + nx / l * o, y1 + (y2 - y1) * t + ny / l * o]); }
    pts.push([x2, y2]); return pts;
  }
  function strokeBolt(ctx, pts, P, w) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[w * 3.2, P[3], 0.35], [w * 1.8, P[2], 0.8], [w * 0.8, P[0], 1]].forEach(([lw, col, a]) => {
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* ================= 입자 ================= */
  const parts = [];        // 세계 좌표
  const MAX = 1400;
  // o: { x, y, vx, vy, life, size, color, g(중력), drag, shape: 'sq'|'glow'|'spark'|'ring'|'star'|'rock'|'leaf'|'coin'|'drop', grow, add(빛남), spin, target }
  function emit(o) { if (parts.length >= MAX) parts.shift(); o.t = 0; o.life = o.life || 0.6; o.size = o.size || 4; o.drag = o.drag == null ? 1.5 : o.drag; o.rot = o.rot || Math.random() * TAU; parts.push(o); return o; }
  function burst(x, y, n, P, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = opt.angle != null ? opt.angle + rand(-(opt.spread || 0.6), opt.spread || 0.6) : Math.random() * TAU, sp = rand(opt.min || 40, opt.max || 220);
      emit({ x: x + rand(-(opt.jit || 0), opt.jit || 0), y: y + rand(-(opt.jit || 0), opt.jit || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (opt.flat || 1) + (opt.up || 0), life: rand(opt.lmin || 0.3, opt.lmax || 0.8),
        size: rand(opt.smin || 2, opt.smax || 6), color: P[Math.floor(Math.random() * Math.min(P.length, opt.cols || 4))], g: opt.g || 0, drag: opt.drag, shape: opt.shape || 'sq', add: opt.add !== false, grow: opt.grow || 0, spin: rand(-8, 8) });
    }
  }
  function updateParts(dt, me) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      if (p.target && me) {   // 동전: 잠깐 튀었다가 나에게 날아옴
        if (p.t > 0.35) { const dx = me.x - p.x, dy = me.y - 30 - p.y, d = Math.hypot(dx, dy); if (d < 14) { p.t = p.life; continue; } const sp = 520 * Math.min(1, (p.t - 0.35) * 3); p.vx = dx / d * sp; p.vy = dy / d * sp; }
      } else { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy = p.vy * k + (p.g || 0) * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.spin || 0) * dt;
      if (p.wave) p.x += Math.sin(p.t * p.wave + p.seed) * 20 * dt;
    }
  }
  function drawParts(ctx, view) {
    let mode = null;
    for (const p of parts) {
      if (view && (p.x < view.x - 40 || p.x > view.x + view.w + 40 || p.y < view.y - 60 || p.y > view.y + view.h + 60)) continue;
      const k = p.t / p.life, a = p.fade === false ? 1 : 1 - k * k, s = p.size * (1 + (p.grow || 0) * k);
      const m = p.add ? 'lighter' : 'source-over'; if (m !== mode) { ctx.globalCompositeOperation = m; mode = m; }
      ctx.globalAlpha = clamp(a, 0, 1);
      switch (p.shape) {
        case 'glow': { const g = glow(p.color, s * 2); ctx.drawImage(g, p.x - g.width / 2, p.y - g.height / 2); break; }
        case 'spark': { ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, s * 0.5); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break; }
        case 'ring': { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.stroke(); break; }
        case 'star': { ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s, -s / 4, s * 2, s / 2); ctx.fillRect(-s / 4, -s, s / 2, s * 2); ctx.restore(); break; }
        case 'rock': { ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s * 0.8); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-s / 2, s * 0.1, s, s * 0.2); ctx.restore(); break; }
        case 'leaf': { ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore(); break; }
        case 'coin': { const w = Math.abs(Math.cos(p.t * 12)) * 5 + 1; ctx.fillStyle = '#8A5A10'; ctx.fillRect(p.x - w / 2 - 1, p.y - 4, w + 2, 8); ctx.fillStyle = '#FFD23F'; ctx.fillRect(p.x - w / 2, p.y - 3, w, 6); ctx.fillStyle = '#FFF6C2'; ctx.fillRect(p.x - w / 2, p.y - 3, Math.max(1, w / 3), 2); break; }
        case 'drop': { ctx.fillStyle = p.color; ctx.fillRect(p.x - 1, p.y - s, 2, s); break; }
        default: ctx.fillStyle = p.color; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* ================= 효과 (모양이 있는 것) ================= */
  const fxs = [];   // { t, dur, draw(ctx, k, now), update(dt), under(바닥에 그림) }
  const add = f => { f.t = f.t || 0; fxs.push(f); return f; };
  function updateFx(dt) { for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; if (f.update) f.update(dt, f); if (f.t >= f.dur) fxs.splice(i, 1); } }
  function drawFx(ctx, under, now) {
    for (const f of fxs) {
      if (!!f.under !== under || f.t < 0) continue;
      ctx.save(); f.draw(ctx, clamp(f.t / f.dur, 0, 1), now, f); ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // 마법진 (쓸 때 발밑)
  function castCircle(x, y, els, big) {
    const P = pal(els[0]), P2 = pal(els[els.length - 1]), r = big ? 46 : 34;
    add({ dur: 0.55, under: true, draw(c, k, now) {
      const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.9; c.translate(x, y); c.scale(1, 0.45); c.rotate(now / 300);
      c.strokeStyle = P[2]; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      c.strokeStyle = P2[1]; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 0.72, 0, TAU); c.stroke();
      for (let i = 0; i < 6; i++) { const a2 = i * TAU / 6; c.fillStyle = i % 2 ? P[1] : P2[2]; c.fillRect(Math.cos(a2) * r * 0.86 - 3, Math.sin(a2) * r * 0.86 - 3, 6, 6); }
      c.beginPath(); for (let i = 0; i <= 6; i++) { const a2 = i * TAU / 3 * 1; const px = Math.cos(a2) * r * 0.72, py = Math.sin(a2) * r * 0.72; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.strokeStyle = P[1]; c.lineWidth = 1.5; c.stroke();
    } });
    burst(x, y - 10, big ? 18 : 10, P, { min: 20, max: 80, up: -80, lmin: 0.4, lmax: 0.8, shape: 'glow', smin: 2, smax: 4, g: -40 });
  }

  /* ---------- 탄 그리기 (원소마다 다른 모양) ---------- */
  function drawShot(c, s, now) {
    const el = (s.els && s.els[0]) || 'light', P = s.mine ? pal(el) : pal(s.monEl || 'dark'), ang = Math.atan2(s.vy, s.vx), r = s.r;
    c.save(); c.globalCompositeOperation = 'lighter';
    drawGlow(c, s.x, s.y, r * 3.2, P[3], 0.55);
    c.translate(s.x, s.y); c.rotate(ang);
    if (!s.mine) { c.fillStyle = P[2]; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.fillStyle = P[0]; c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.fill(); }
    else if (el === 'fire') {   // 불덩이: 뒤로 늘어진 불꽃
      for (let i = 4; i >= 0; i--) { c.fillStyle = P[Math.min(4, i)]; c.beginPath(); c.ellipse(-i * r * 0.55, 0, r * (1.3 - i * 0.18), r * (1 - i * 0.15), 0, 0, TAU); c.fill(); }
      c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(r * 0.2, 0, r * 0.4, 0, TAU); c.fill();
    } else if (el === 'water') {   // 물방울: 앞이 둥근 물줄기
      c.fillStyle = P[3]; c.beginPath(); c.moveTo(-r * 2.4, 0); c.quadraticCurveTo(-r * 0.6, -r * 1.1, r, 0); c.quadraticCurveTo(-r * 0.6, r * 1.1, -r * 2.4, 0); c.fill();
      c.fillStyle = P[2]; c.beginPath(); c.arc(0, 0, r * 0.85, 0, TAU); c.fill(); c.fillStyle = P[0]; c.fillRect(-r * 0.3, -r * 0.5, r * 0.5, r * 0.3);
    } else if (el === 'wind') {   // 바람 칼날: 도는 초승달
      c.rotate(now / 50); c.strokeStyle = P[1]; c.lineWidth = r * 0.5; c.beginPath(); c.arc(0, 0, r * 1.3, -1.2, 1.2); c.stroke(); c.strokeStyle = P[3]; c.lineWidth = r * 0.25; c.beginPath(); c.arc(0, 0, r * 1.7, -0.9, 0.9); c.stroke();
    } else if (el === 'earth') {   // 바위 조각
      c.rotate(now / 90); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#1D2340'; c.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2); c.fillStyle = P[2]; c.fillRect(-r, -r, r * 2, r * 2); c.fillStyle = P[1]; c.fillRect(-r, -r, r, r * 0.6); c.fillStyle = P[3]; c.fillRect(0, r * 0.3, r, r * 0.7);
    } else if (el === 'thunder') {   // 번개 구슬 + 튀는 전기
      c.fillStyle = P[2]; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill();
      c.rotate(-ang); strokeBolt(c, boltPath(0, 0, rand(-r * 3, r * 3), rand(-r * 3, r * 3), 4, 3), P, 1.2);
    } else {   // 빛: 반짝이는 별
      c.rotate(now / 120); c.fillStyle = P[2]; c.fillRect(-r * 2, -r * 0.3, r * 4, r * 0.6); c.fillRect(-r * 0.3, -r * 2, r * 0.6, r * 4); c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.fill();
    }
    c.restore();
  }
  // 날아가는 동안 꼬리 입자
  function trail(s, dt) {
    if (Math.random() > dt * 60) return;
    const el = (s.els && s.els[0]) || 'light', P = s.mine ? pal(el) : pal('dark');
    const shape = el === 'fire' ? 'glow' : el === 'earth' ? 'rock' : el === 'water' ? 'sq' : el === 'thunder' ? 'spark' : el === 'wind' ? 'leaf' : 'star';
    emit({ x: s.x + rand(-3, 3), y: s.y + rand(-3, 3), vx: -s.vx * 0.15 + rand(-30, 30), vy: -s.vy * 0.15 + rand(-30, 30) + (el === 'fire' ? -40 : 0), life: rand(0.25, 0.5), size: rand(2, el === 'fire' ? 6 : 4), color: P[Math.floor(rand(0, 4))], shape, add: el !== 'earth', g: el === 'earth' || el === 'water' ? 300 : 0, spin: rand(-10, 10) });
  }

  /* ---------- 맞음 · 사라짐 · 레벨 업 ---------- */
  function hit(x, y, els, crit) {
    const el = (els && els[0]) || null, P = el ? pal(el) : ['#FFFFFF', '#FFF6C2', '#FFD23F', '#FF9A3D'];
    burst(x, y, crit ? 16 : 8, P, { min: 80, max: crit ? 320 : 220, lmin: 0.15, lmax: 0.35, shape: 'spark', smin: 2, smax: 4, drag: 4 });
    add({ dur: 0.18, draw(c, k) { c.globalCompositeOperation = 'lighter'; drawGlow(c, x, y, (crit ? 40 : 26) * (1 - k * 0.5), P[1], 1 - k); c.strokeStyle = P[0]; c.globalAlpha = 1 - k; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 8 + k * (crit ? 30 : 18), 0, TAU); c.stroke(); } });
    if (el === 'fire') burst(x, y, 5, P, { min: 20, max: 80, up: -60, g: -60, shape: 'glow', lmin: 0.3, lmax: 0.6 });
    if (el === 'water') burst(x, y, 6, P, { min: 60, max: 160, up: -120, g: 500, shape: 'drop', add: false, lmin: 0.3, lmax: 0.5, smin: 3, smax: 6 });
    if (el === 'earth') burst(x, y, 5, P, { min: 60, max: 160, up: -140, g: 600, shape: 'rock', add: false, lmin: 0.4, lmax: 0.7, smin: 3, smax: 6 });
  }
  function death(x, y, colors, big) {
    const P = [colors.c || '#FFFFFF', colors.a, colors.b, colors.d || '#FFFFFF'];
    burst(x, y, big ? 60 : 22, P, { min: 60, max: big ? 380 : 220, lmin: 0.4, lmax: big ? 1.4 : 0.8, shape: 'sq', add: false, smin: 3, smax: big ? 9 : 6, g: 200, up: -100 });
    burst(x, y, big ? 30 : 10, ['#FFFFFF', '#FFF6C2'], { min: 30, max: 140, lmin: 0.3, lmax: 0.7, shape: 'glow', smin: 3, smax: 6 });
    add({ dur: big ? 0.7 : 0.4, draw(c, k) { c.globalCompositeOperation = 'lighter'; drawGlow(c, x, y, (big ? 140 : 60) * (0.5 + k), '#FFFFFF', (1 - k) * 0.8); c.strokeStyle = colors.a; c.globalAlpha = 1 - k; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.ellipse(x, y + 10, (big ? 120 : 50) * k, (big ? 60 : 24) * k, 0, 0, TAU); c.stroke(); } });
  }
  function coins(x, y, n) { for (let i = 0; i < n; i++) emit({ x, y, vx: rand(-140, 140), vy: rand(-260, -120), g: 700, drag: 1, life: 1.6, size: 4, shape: 'coin', add: false, target: true, fade: false }); }
  function levelUp(x, y) {
    const P = PAL.light;
    add({ dur: 1.4, draw(c, k) {
      c.globalCompositeOperation = 'lighter'; const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85, w = 46 * (1 - k * 0.5);
      const g = c.createLinearGradient(0, y - 420, 0, y); g.addColorStop(0, 'rgba(255,240,160,0)'); g.addColorStop(1, 'rgba(255,240,160,' + (0.75 * a) + ')');
      c.fillStyle = g; c.fillRect(x - w, y - 420, w * 2, 420); c.fillStyle = 'rgba(255,255,255,' + (0.8 * a) + ')'; c.fillRect(x - w * 0.25, y - 420, w * 0.5, 420);
      drawGlow(c, x, y - 10, 90, '#FFE45C', a);
    } });
    for (let i = 0; i < 40; i++) emit({ x: x + rand(-40, 40), y: y + rand(-10, 10), vx: rand(-20, 20), vy: rand(-260, -80), g: -40, life: rand(0.8, 1.5), size: rand(3, 6), color: P[Math.floor(rand(0, 4))], shape: i % 3 ? 'glow' : 'star', add: true, spin: 6 });
    add({ dur: 0.8, under: true, draw(c, k) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = '#FFE45C'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y, 30 + k * 120, (30 + k * 120) * 0.45, 0, 0, TAU); c.stroke(); } });
  }
  function dust(x, y, color) { if (Math.random() < 0.5) emit({ x: x + rand(-8, 8), y: y - 2, vx: rand(-20, 20), vy: rand(-30, -10), g: 0, life: 0.4, size: rand(3, 5), color: color || 'rgba(255,255,255,.5)', shape: 'sq', add: false, grow: 1 }); }
  function heal(x, y, big) {
    const P = ['#FFFFFF', '#C8FFD8', '#3DDC84', '#1E9E5A'];
    for (let i = 0; i < (big ? 36 : 22); i++) emit({ x: x + rand(-26, 26), y: y + rand(-30, 20), vx: rand(-10, 10), vy: rand(-140, -40), g: -20, life: rand(0.7, 1.2), size: rand(3, 6), color: P[Math.floor(rand(0, 3))], shape: i % 4 ? 'glow' : 'star', add: true });
    add({ dur: 0.9, under: true, draw(c, k) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = '#3DDC84'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y + 26, 40 * (0.6 + k), 18 * (0.6 + k), 0, 0, TAU); c.stroke(); drawGlow(c, x, y, 80, '#3DDC84', (1 - k) * 0.6); } });
    for (let i = 0; i < 5; i++) add({ t: -i * 0.12, dur: 0.8, draw(c, k) { const px = x + Math.sin(i * 2.3) * 22, py = y + 10 - k * 60; c.globalAlpha = 1 - k; c.fillStyle = '#1D2340'; c.fillRect(px - 5, py - 2, 10, 5); c.fillRect(px - 2, py - 5, 5, 11); c.fillStyle = '#7CFFB0'; c.fillRect(px - 4, py - 1, 8, 3); c.fillRect(px - 1, py - 4, 3, 9); } });
  }

  /* ---------- 큰 마법 ---------- */
  function nova(x, y, r, els) {
    const el = els[0], P = pal(el), P2 = pal(els[els.length - 1]);
    add({ dur: 0.7, under: true, draw(c, k) {   // 바닥 그을음·충격파
      c.globalAlpha = (1 - k) * 0.5; c.fillStyle = P[4]; c.beginPath(); c.ellipse(x, y + 20, r * 0.9, r * 0.45, 0, 0, TAU); c.fill();
    } });
    add({ dur: 0.55, draw(c, k) {
      c.globalCompositeOperation = 'lighter'; const e = 1 - Math.pow(1 - k, 3), rr = r * (0.2 + 0.85 * e);
      drawGlow(c, x, y, r * 1.2 * (0.6 + e * 0.6), P[3], (1 - k) * 0.7);
      [[10, P[2]], [5, P2[1]], [2, '#FFFFFF']].forEach(([lw, col]) => { c.globalAlpha = 1 - k; c.strokeStyle = col; c.lineWidth = lw * (1 - k) + 1; c.beginPath(); c.ellipse(x, y, rr, rr * 0.62, 0, 0, TAU); c.stroke(); });
      if (el === 'thunder' || els.includes('thunder')) { c.globalAlpha = 1 - k; for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + k; strokeBolt(c, boltPath(x, y, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62, 10), pal('thunder'), 1.6); } }
      if (el === 'wind' || els.includes('wind')) { c.globalAlpha = 1 - k; c.strokeStyle = PAL.wind[1]; c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x, y - i * 14 * e, rr * (0.4 + i * 0.12), rr * 0.2, 0, k * 8 + i, k * 8 + i + 4); c.stroke(); } }
    } });
    const n = Math.round(r / 3);
    if (el === 'earth' || els.includes('earth')) spikes(x, y, r, pal('earth'));
    burst(x, y, n, P, { min: r * 1.2, max: r * 3.2, flat: 0.62, lmin: 0.3, lmax: 0.6, shape: el === 'earth' ? 'rock' : el === 'water' ? 'drop' : 'glow', smin: 3, smax: 7, add: el !== 'earth', drag: 3 });
    burst(x, y, Math.round(n / 2), P2, { min: 40, max: 160, up: -120, g: el === 'fire' ? -80 : 200, lmin: 0.4, lmax: 0.9, shape: 'star', smin: 2, smax: 5 });
  }
  function spikes(x, y, r, P) {   // 땅에서 솟는 바위 가시
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + rand(-0.2, 0.2), d = r * rand(0.35, 0.95), px = x + Math.cos(a) * d, py = y + 20 + Math.sin(a) * d * 0.5, h = rand(18, 34);
      add({ t: -i * 0.02, dur: 0.6, draw(c, k) {
        const up = k < 0.25 ? k / 0.25 : 1, a2 = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1; c.globalAlpha = a2;
        c.fillStyle = '#1D2340'; c.beginPath(); c.moveTo(px - 9, py); c.lineTo(px, py - h * up - 2); c.lineTo(px + 9, py); c.fill();
        c.fillStyle = P[2]; c.beginPath(); c.moveTo(px - 7, py); c.lineTo(px, py - h * up); c.lineTo(px + 7, py); c.fill(); c.fillStyle = P[1]; c.beginPath(); c.moveTo(px - 7, py); c.lineTo(px, py - h * up); c.lineTo(px - 2, py); c.fill();
      } });
    }
  }
  function beam(x, y, dx, dy, len, w, els) {
    const el = els[0], P = pal(el), P2 = pal(els[els.length - 1]), ang = Math.atan2(dy, dx);
    if (el === 'earth' && els.length === 1) {   // 대지 가르기: 줄지어 솟는 바위
      const n = Math.round(len / 26);
      for (let i = 0; i < n; i++) { const px = x + dx * (i + 1) * 26, py = y + dy * (i + 1) * 26 + 20, h = rand(22, 40); add({ t: -i * 0.03, dur: 0.55, draw(c, k) { const up = k < 0.25 ? k / 0.25 : 1; c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1; c.fillStyle = '#1D2340'; c.beginPath(); c.moveTo(px - 11, py); c.lineTo(px, py - h * up - 2); c.lineTo(px + 11, py); c.fill(); c.fillStyle = P[2]; c.beginPath(); c.moveTo(px - 9, py); c.lineTo(px, py - h * up); c.lineTo(px + 9, py); c.fill(); c.fillStyle = P[1]; c.beginPath(); c.moveTo(px - 9, py); c.lineTo(px, py - h * up); c.lineTo(px - 3, py); c.fill(); } }); burst(px, py, 3, P, { min: 40, max: 120, up: -100, g: 500, shape: 'rock', add: false }); }
      return;
    }
    add({ dur: 0.45, draw(c, k, now) {
      c.globalCompositeOperation = 'lighter'; c.translate(x, y); c.rotate(ang);
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85, ww = w * (0.6 + 0.4 * Math.sin(now / 30)) * (k < 0.15 ? 0.5 + k * 3 : 1);
      if (el === 'thunder') { c.globalAlpha = a; for (let i = 0; i < 3; i++) strokeBolt(c, boltPath(0, 0, len, rand(-w / 3, w / 3), w * 0.4), P, 2.4 - i * 0.6); }
      else {
        const g = c.createLinearGradient(0, -ww, 0, ww); g.addColorStop(0, P[3] + '00'); g.addColorStop(0.3, P[3]); g.addColorStop(0.5, P[0]); g.addColorStop(0.7, P2[3]); g.addColorStop(1, P2[3] + '00');
        c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, -ww, len, ww * 2);
        c.fillStyle = '#FFFFFF'; c.fillRect(0, -ww * 0.12, len, ww * 0.24);
        if (el === 'water') { c.fillStyle = P[1]; for (let i = 0; i < len; i += 24) c.fillRect(i + (now / 4 % 24), -ww * 0.6 + Math.sin(i + now / 80) * 6, 10, 3); }
      }
      c.rotate(-ang); drawGlow(c, 0, 0, w * 1.6, P[2], a);
    } });
    for (let i = 0; i < len / 10; i++) { const t = Math.random() * len; emit({ x: x + dx * t + rand(-w / 3, w / 3), y: y + dy * t + rand(-w / 3, w / 3), vx: -dy * rand(-80, 80) + dx * 60, vy: dx * rand(-80, 80) + dy * 60, life: rand(0.3, 0.6), size: rand(2, 5), color: P[Math.floor(rand(0, 3))], shape: el === 'thunder' ? 'spark' : 'glow', add: true }); }
  }
  // 하늘에서 떨어지는 것 (화염 비=운석, 낙뢰=번개, 대지의 분노=바위, 대폭포=물기둥, 심판의 빛=빛기둥)
  function fall(x, y, r, els, delay) {
    const el = els[0], P = pal(el), P2 = pal(els[els.length - 1]), lead = 0.32;
    add({ t: -delay, dur: lead + 0.45, under: true, draw(c, k) {   // 떨어질 곳 표시
      const tt = k * (lead + 0.45); if (tt > lead) return; c.globalAlpha = 0.25 + tt / lead * 0.4; c.strokeStyle = P[2]; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r * (1 - tt / lead * 0.3), r * 0.5 * (1 - tt / lead * 0.3), 0, 0, TAU); c.stroke();
    } });
    add({ t: -delay, dur: lead + 0.45, draw(c, k) {
      const tt = k * (lead + 0.45);
      c.globalCompositeOperation = 'lighter';
      if (tt < lead) {
        const q = tt / lead, sy = y - 420 * (1 - q), sx = x - 140 * (1 - q) * (el === 'fire' || el === 'earth' ? 1 : 0);
        if (el === 'thunder') { if (q > 0.6) { c.globalAlpha = 1; strokeBolt(c, boltPath(x + rand(-20, 20), y - 420, x, y, 18), P, 3); } }
        else if (el === 'light') { c.globalAlpha = q; const g = c.createLinearGradient(0, y - 420, 0, y); g.addColorStop(0, 'rgba(255,250,200,0)'); g.addColorStop(1, 'rgba(255,250,200,.9)'); c.fillStyle = g; c.fillRect(x - r * 0.35 * q, y - 420, r * 0.7 * q, 420); }
        else if (el === 'water') { c.globalAlpha = 0.85; c.fillStyle = P[2]; c.fillRect(x - 8, sy - 80, 16, 80); c.fillStyle = P[0]; c.fillRect(x - 3, sy - 80, 6, 80); }
        else { const rr = el === 'earth' ? 14 : 12; drawGlow(c, sx, sy, rr * 3.5, P[3], 0.8); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#1D2340'; c.beginPath(); c.arc(sx, sy, rr + 2, 0, TAU); c.fill(); c.fillStyle = P[el === 'earth' ? 2 : 1]; c.beginPath(); c.arc(sx, sy, rr, 0, TAU); c.fill(); c.fillStyle = P[0]; c.beginPath(); c.arc(sx + 3, sy - 3, rr * 0.4, 0, TAU); c.fill(); }
      } else {
        const q = (tt - lead) / 0.45; c.globalAlpha = 1 - q;
        drawGlow(c, x, y, r * 1.6 * (0.6 + q), P[2], 1 - q);
        c.strokeStyle = P2[1]; c.lineWidth = 6 * (1 - q) + 1; c.beginPath(); c.ellipse(x, y, r * (0.4 + q), r * (0.4 + q) * 0.55, 0, 0, TAU); c.stroke();
      }
    }, update(dt, f) {
      if (!f.boom && f.t >= lead) { f.boom = true; burst(x, y, 16, P, { min: 60, max: r * 4, flat: 0.6, lmin: 0.3, lmax: 0.7, shape: el === 'earth' ? 'rock' : el === 'water' ? 'drop' : 'glow', add: el !== 'earth', g: el === 'earth' || el === 'water' ? 400 : -30, up: -100, smin: 3, smax: 7 }); burst(x, y, 6, P2, { min: 40, max: 120, shape: 'star', lmin: 0.4, lmax: 0.7 }); if (Fx.onBoom) Fx.onBoom(r > 70 ? 5 : 3); }
      if (el === 'fire' && !f.boom && Math.random() < 0.6) { const q = f.t / lead; if (q > 0) emit({ x: x - 140 * (1 - q) + rand(-5, 5), y: y - 420 * (1 - q), vx: rand(-20, 20), vy: rand(-40, 0), life: 0.4, size: rand(3, 6), color: P[Math.floor(rand(0, 4))], shape: 'glow', add: true }); }
    } });
  }
  function drawPool(c, p, now) {
    const el = p.els[0], P = pal(el), P2 = pal(p.els[p.els.length - 1]), fade = Math.min(1, (p.dur - p.t) / 0.5, p.t / 0.2);
    c.save(); c.globalAlpha = 0.55 * fade;
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, P[2]); g.addColorStop(0.7, P2[3]); g.addColorStop(1, P2[4] + '00');
    c.fillStyle = g; c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, TAU); c.fill();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * fade; c.strokeStyle = P[1]; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const rr = p.r * ((now / 900 + i / 3) % 1); c.beginPath(); c.ellipse(p.x, p.y, rr, rr * 0.55, 0, 0, TAU); c.stroke(); }
    c.restore();
    if (Math.random() < 0.5) { const a = Math.random() * TAU, d = Math.random() * p.r; emit({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.55, vx: 0, vy: rand(-60, -20), life: 0.6, size: rand(3, 6), color: P[Math.floor(rand(0, 3))], shape: el === 'fire' ? 'glow' : 'ring', add: true, grow: 0.5 }); }
  }
  function drawShield(c, x, y, now, el, left) {
    const P = pal(el), a = left < 1 ? (Math.floor(now / 100) % 2 ? 0.3 : 0.8) : 0.8;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.35;
    const g = c.createRadialGradient(x, y, 10, x, y, 40); g.addColorStop(0, P[3] + '00'); g.addColorStop(0.8, P[2] + '66'); g.addColorStop(1, P[1]);
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 30, 40, 0, 0, TAU); c.fill();
    c.globalAlpha = a; c.strokeStyle = P[1]; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const t = now / 600 + i * TAU / 6, px = x + Math.cos(t) * 26, py = y + Math.sin(t) * 34; c.beginPath(); for (let j = 0; j <= 6; j++) { const a2 = j * TAU / 6; j ? c.lineTo(px + Math.cos(a2) * 6, py + Math.sin(a2) * 6) : c.moveTo(px + Math.cos(a2) * 6, py + Math.sin(a2) * 6); } c.stroke(); }
    c.beginPath(); c.ellipse(x, y, 30, 40, 0, 0, TAU); c.stroke(); c.restore();
  }
  function slash(x, y, dx, dy, staff) {
    const ang = Math.atan2(dy, dx), col = staff ? PAL.dark : ['#FFFFFF', '#E8EEFF', '#B8C4FF', '#6A7AD0'];
    add({ dur: 0.18, draw(c, k) {
      c.globalCompositeOperation = 'lighter'; c.translate(x, y); c.rotate(ang); const a0 = -1.3 + k * 1.6;
      [[44, 10, col[2]], [44, 4, col[0]]].forEach(([r, lw, cc]) => { c.globalAlpha = 1 - k; c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.arc(0, 0, r, a0, a0 + 1.6); c.stroke(); });
    } });
  }
  function afterimage(img, x, y, w, h, flip, color) {
    add({ dur: 0.28, draw(c, k) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * 0.45; if (flip) { c.translate(x + w, y); c.scale(-1, 1); } else c.translate(x, y); c.drawImage(img, 0, 0, w, h); } });
    if (Math.random() < 0.6) emit({ x: x + w / 2 + rand(-8, 8), y: y + h * rand(0.3, 0.9), vx: rand(-30, 30), vy: rand(-30, 30), life: 0.4, size: rand(3, 5), color, shape: 'glow', add: true });
  }
  function slamWarn(c, x, y, r, k, now) {
    c.save(); c.globalAlpha = 0.25 + k * 0.4; c.fillStyle = '#FF3D4A'; c.beginPath(); c.ellipse(x, y, r * k, r * k * 0.6, 0, 0, TAU); c.fill();
    c.globalAlpha = 0.9; c.strokeStyle = Math.floor(now / 80) % 2 ? '#FFD23F' : '#FF3D4A'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0, 0, TAU); c.stroke(); c.restore();
  }

  /* ================= 지역 분위기 ================= */
  // 지역 번호(0~8)마다: 날씨 입자 · 색 덧칠 · 안개 · 어둠
  const AMB = [
    { tint: 'rgba(255,240,200,.06)', bits: 'petal', rate: 3, cols: ['#FFFFFF', '#FFE45C', '#FFB3D1'] },
    { tint: 'rgba(40,120,60,.10)', bits: 'firefly', rate: 5, cols: ['#E8FF8A', '#B8FF6A'], rays: true },
    { tint: 'rgba(40,60,40,.22)', bits: 'firefly', rate: 6, cols: ['#9AFFD8', '#C8FF8A'], fog: 'rgba(220,235,220,' },
    { tint: 'rgba(255,190,90,.10)', bits: 'sand', rate: 10, cols: ['#F5E2A8', '#E8C878'], haze: true },
    { tint: 'rgba(120,100,80,.08)', bits: 'dust', rate: 4, cols: ['#E8E0C8', '#C8B898'] },
    { tint: 'rgba(160,200,255,.12)', bits: 'snow', rate: 22, cols: ['#FFFFFF', '#E8F4FF'] },
    { tint: 'rgba(60,30,120,.10)', bits: 'sparkle', rate: 8, cols: ['#C8A8FF', '#7FE0F0', '#FF9AE0'], dark: 0.62 },
    { tint: 'rgba(200,230,255,.08)', bits: 'petal', rate: 8, cols: ['#FFB3D1', '#FFD8E8', '#FFFFFF'], clouds: true },
    { tint: 'rgba(255,60,20,.12)', bits: 'ember', rate: 14, cols: ['#FFB13D', '#FF6A3D', '#FFE45C'], haze: true, dark: 0.25 }
  ];
  const amb = [];    // 화면 좌표 입자 (날씨)
  let ambT = 0;
  function ambient(region, dt, W, H, cam) {
    const A = AMB[region] || AMB[0]; ambT += dt;
    const want = A.rate * dt; let n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    while (n-- > 0 && amb.length < 220) {
      const p = { t: 0, x: rand(-20, W + 20), y: rand(-20, H), cx: cam.x, cy: cam.y, seed: Math.random() * 10, col: A.cols[Math.floor(Math.random() * A.cols.length)], kind: A.bits };
      if (A.bits === 'snow') { p.y = -10; p.vy = rand(30, 70); p.vx = rand(-15, 5); p.life = 12; p.s = rand(2, 4); }
      else if (A.bits === 'petal') { p.y = -10; p.vy = rand(25, 50); p.vx = rand(10, 40); p.life = 14; p.s = rand(3, 5); }
      else if (A.bits === 'ember') { p.y = H + 10; p.vy = rand(-70, -30); p.vx = rand(-15, 15); p.life = 8; p.s = rand(2, 4); }
      else if (A.bits === 'sand') { p.x = -10; p.vx = rand(60, 140); p.vy = rand(-5, 10); p.life = 10; p.s = rand(1, 3); }
      else if (A.bits === 'firefly' || A.bits === 'sparkle') { p.vx = rand(-10, 10); p.vy = rand(-10, 10); p.life = rand(3, 6); p.s = rand(2, 3); }
      else { p.vx = rand(-8, 8); p.vy = rand(-6, 6); p.life = 5; p.s = rand(2, 3); }
      amb.push(p);
    }
    for (let i = amb.length - 1; i >= 0; i--) {
      const p = amb[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'snow' || p.kind === 'petal') p.x += Math.sin(p.t * 1.5 + p.seed) * 18 * dt;
      if (p.t > p.life || p.y > H + 30 || p.y < -40 || p.x > W + 40) amb.splice(i, 1);
    }
  }
  function drawAmbient(ctx, region, W, H, cam, now, lights) {
    const A = AMB[region] || AMB[0];
    ctx.save();
    if (A.rays) {   // 숲: 비스듬한 햇살
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { const x0 = ((i * 300 - cam.x * 0.3 + now / 60) % (W + 400)) - 200; ctx.globalAlpha = 0.06 + 0.03 * Math.sin(now / 900 + i); ctx.fillStyle = '#FFF6C2'; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 80, 0); ctx.lineTo(x0 - 120, H); ctx.lineTo(x0 - 220, H); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (A.clouds) {   // 하늘섬: 지나가는 구름 그림자
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#5A6A9A';
      for (let i = 0; i < 3; i++) { const x0 = ((i * 420 - cam.x * 0.6 + now / 25) % (W + 500)) - 250, y0 = 80 + i * 170 - (cam.y * 0.6) % 200; ctx.beginPath(); ctx.ellipse(x0, y0, 160, 60, 0, 0, TAU); ctx.ellipse(x0 + 90, y0 + 20, 110, 50, 0, 0, TAU); ctx.fill(); }
    }
    if (A.fog) {   // 늪: 흘러가는 안개
      for (let i = 0; i < 5; i++) { const x0 = ((i * 260 - cam.x * 0.5 + now / 40) % (W + 600)) - 300, y0 = (i * 130 + 60 - cam.y * 0.5) % (H + 100); const g = glow('#E8F0E8', 180); ctx.globalAlpha = 0.18; ctx.drawImage(g, x0 - 180, y0 - 90, 360, 180); }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = A.tint; ctx.fillRect(0, 0, W, H);
    // 날씨 입자
    ctx.globalCompositeOperation = A.bits === 'firefly' || A.bits === 'sparkle' || A.bits === 'ember' ? 'lighter' : 'source-over';
    for (const p of amb) {
      const x = p.x - (cam.x - p.cx) * 0.6, y = p.y - (cam.y - p.cy) * 0.6, k = p.t / p.life, a = Math.min(1, p.t * 2, (1 - k) * 3);
      if (p.kind === 'firefly' || p.kind === 'sparkle') { ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(now / 200 + p.seed * 5)); const g = glow(p.col, 10); ctx.drawImage(g, x - 10, y - 10); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 1, y - 1, 2, 2); }
      else if (p.kind === 'ember') { ctx.globalAlpha = a; const g = glow(p.col, 8); ctx.drawImage(g, x - 8, y - 8); ctx.fillStyle = p.col; ctx.fillRect(x - 1, y - 1, p.s, p.s); }
      else if (p.kind === 'petal') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * 2 + p.seed); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
      else { ctx.globalAlpha = a * 0.85; ctx.fillStyle = p.col; ctx.fillRect(x, y, p.s, p.s); }
    }
    ctx.restore();
    // 어둠 (수정 동굴·불꽃왕성): 내 주변과 빛나는 것들 둘레만 밝게
    if (A.dark) {
      const [dc, dx] = darkCanvas(W, H);
      dx.globalCompositeOperation = 'source-over'; dx.clearRect(0, 0, W, H); dx.fillStyle = region === 8 ? 'rgba(40,8,8,' + A.dark + ')' : 'rgba(12,6,30,' + A.dark + ')'; dx.fillRect(0, 0, W, H);
      dx.globalCompositeOperation = 'destination-out';
      lights.forEach(l => { const g = glow('#FFFFFF', l.r); dx.globalAlpha = l.a == null ? 1 : l.a; dx.drawImage(g, l.x - g.width / 2, l.y - g.height / 2); });
      dx.globalAlpha = 1; ctx.drawImage(dc, 0, 0);
      // 빛 색 번짐
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      lights.forEach(l => { if (l.col) drawGlow(ctx, l.x, l.y, l.r * 0.6, l.col, 0.18); });
      ctx.restore();
    }
    if (A.haze) { ctx.save(); ctx.globalAlpha = 0.05 + 0.03 * Math.sin(now / 500); ctx.fillStyle = region === 8 ? '#FF6A3D' : '#FFE0A0'; ctx.fillRect(0, H * 0.6, W, H * 0.4); ctx.restore(); }
    // 가장자리 어둡게 (모든 지역)
    ctx.drawImage(vignette(W, H), 0, 0);
  }
  let darkC = null; const darkCanvas = (W, H) => (darkC && darkC[0].width === W ? darkC : (darkC = mk(W, H)));
  let vigC = null;
  function vignette(W, H) {
    if (vigC && vigC.width === W) return vigC;
    const [c, x] = mk(W, H), g = x.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(10,14,36,0)'); g.addColorStop(1, 'rgba(10,14,36,.45)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    return (vigC = c);
  }

  /* ================= 마법 아이콘 (창·마법 칸) ================= */
  const iconC = {};
  function icon(sk, size) {
    size = size || 40; const key = sk.id + size;
    if (iconC[key]) return iconC[key];
    const [c, x] = mk(size, size), s = size / 40, P = pal(sk.els[0]), P2 = pal(sk.els[sk.els.length - 1]);
    x.scale(s, s);
    const g = x.createLinearGradient(0, 0, 40, 40); g.addColorStop(0, P[3]); g.addColorStop(1, P2[4]);
    x.fillStyle = '#0A0E24'; x.fillRect(0, 0, 40, 40); x.fillStyle = g; x.fillRect(2, 2, 36, 36);
    x.globalCompositeOperation = 'lighter'; x.drawImage(glow(P[1], 20), 0, 0, 40, 40); x.globalCompositeOperation = 'source-over';
    // 원소 문양
    const el = sk.els[0], O = '#1D2340';
    const sym = (e, cx, cy, k) => {
      x.save(); x.translate(cx, cy); x.scale(k, k);
      if (e === 'fire') { x.fillStyle = O; x.beginPath(); x.moveTo(0, -13); x.quadraticCurveTo(11, -2, 8, 7); x.quadraticCurveTo(4, 13, 0, 13); x.quadraticCurveTo(-4, 13, -8, 7); x.quadraticCurveTo(-11, -2, 0, -13); x.fill(); x.fillStyle = PAL.fire[2]; x.beginPath(); x.moveTo(0, -10); x.quadraticCurveTo(9, -1, 6, 6); x.quadraticCurveTo(3, 11, 0, 11); x.quadraticCurveTo(-3, 11, -6, 6); x.quadraticCurveTo(-9, -1, 0, -10); x.fill(); x.fillStyle = PAL.fire[1]; x.beginPath(); x.moveTo(0, -2); x.quadraticCurveTo(5, 4, 3, 8); x.lineTo(-3, 8); x.quadraticCurveTo(-5, 4, 0, -2); x.fill(); }
      else if (e === 'water') { x.fillStyle = O; x.beginPath(); x.moveTo(0, -13); x.quadraticCurveTo(11, 3, 0, 12); x.quadraticCurveTo(-11, 3, 0, -13); x.fill(); x.fillStyle = PAL.water[2]; x.beginPath(); x.moveTo(0, -10); x.quadraticCurveTo(8, 3, 0, 10); x.quadraticCurveTo(-8, 3, 0, -10); x.fill(); x.fillStyle = '#FFFFFF'; x.fillRect(-4, 0, 2, 5); }
      else if (e === 'wind') { x.strokeStyle = O; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 9, 0.5, 5.2); x.stroke(); x.strokeStyle = PAL.wind[1]; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 9, 0.5, 5.2); x.stroke(); x.beginPath(); x.arc(0, 0, 4, 2, 6.5); x.stroke(); }
      else if (e === 'earth') { x.fillStyle = O; x.beginPath(); x.moveTo(-12, 10); x.lineTo(-5, -8); x.lineTo(1, 0); x.lineTo(5, -12); x.lineTo(12, 10); x.fill(); x.fillStyle = PAL.earth[2]; x.beginPath(); x.moveTo(-9, 8); x.lineTo(-5, -4); x.lineTo(1, 3); x.lineTo(5, -8); x.lineTo(9, 8); x.fill(); x.fillStyle = PAL.earth[1]; x.fillRect(3, -6, 2, 8); }
      else if (e === 'thunder') { x.fillStyle = O; x.beginPath(); x.moveTo(3, -14); x.lineTo(-9, 2); x.lineTo(-1, 2); x.lineTo(-4, 14); x.lineTo(9, -3); x.lineTo(1, -3); x.closePath(); x.fill(); x.fillStyle = PAL.thunder[2]; x.beginPath(); x.moveTo(2, -10); x.lineTo(-6, 0); x.lineTo(0, 0); x.lineTo(-2, 9); x.lineTo(6, -1); x.lineTo(0, -1); x.closePath(); x.fill(); }
      else { x.fillStyle = O; x.fillRect(-2, -13, 4, 26); x.fillRect(-13, -2, 26, 4); x.fillStyle = PAL.light[2]; x.fillRect(-1, -11, 2, 22); x.fillRect(-11, -1, 22, 2); x.beginPath(); x.arc(0, 0, 5, 0, TAU); x.fillStyle = '#FFFFFF'; x.fill(); }
      x.restore();
    };
    if (sk.els.length > 1) { sym(sk.els[0], 14, 15, 0.85); sym(sk.els[1], 26, 25, 0.85); }
    else sym(el, 20, 20, 1.1);
    // 종류 표시 (작은 모서리 그림)
    x.fillStyle = 'rgba(10,14,36,.75)'; x.fillRect(27, 27, 12, 12); x.fillStyle = '#FFFFFF';
    const k = sk.kind;
    if (k === 'bolt') { x.fillRect(29, 32, 6, 2); x.fillRect(34, 31, 2, 4); }
    else if (k === 'nova') { x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.5; x.beginPath(); x.arc(33, 33, 4, 0, TAU); x.stroke(); }
    else if (k === 'beam') x.fillRect(28, 32, 10, 2);
    else if (k === 'rain') { x.fillRect(29, 29, 2, 5); x.fillRect(33, 31, 2, 5); x.fillRect(36, 29, 1, 4); }
    else if (k === 'pool') x.fillRect(28, 34, 10, 3);
    else if (k === 'dash') { x.fillRect(28, 31, 4, 2); x.fillRect(31, 33, 5, 2); }
    else if (k === 'heal') { x.fillRect(32, 29, 2, 8); x.fillRect(29, 32, 8, 2); }
    else if (k === 'shield') { x.fillRect(29, 29, 8, 5); x.fillRect(30, 34, 6, 2); x.fillRect(32, 36, 2, 1); }
    if (sk.fusion) { x.fillStyle = '#FFD23F'; x.fillRect(2, 2, 8, 3); x.fillRect(2, 2, 3, 8); }
    x.strokeStyle = sk.fusion ? '#FFD23F' : 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.strokeRect(1, 1, 38, 38);
    return (iconC[key] = c);
  }
  const iconURL = (sk, size) => { const c = icon(sk, size || 40); return c._url || (c._url = c.toDataURL()); };

  function reset() { parts.length = 0; fxs.length = 0; amb.length = 0; }

  const Fx = { PAL, pal, glow, drawGlow, emit, burst, updateParts, drawParts, updateFx, drawFx, castCircle, drawShot, trail, hit, death, coins, levelUp, dust, heal, nova, beam, fall, drawPool, drawShield, slash, afterimage, slamWarn, strokeBolt, boltPath,
    ambient, drawAmbient, icon, iconURL, reset, onBoom: null, count: () => parts.length + fxs.length };
  window.GoRPGFx = Fx;
})();
