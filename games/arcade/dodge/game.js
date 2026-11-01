/*
 * gogo?gogo! — 닷지 (옛날 곰플레이어 숨은 게임 '닷지'처럼 총알 피하기)
 *  - 피하는 캐릭터 = 내 아바타. 화면 가장자리에서 총알이 나를 노리고 날아오고, 시간이 갈수록 많아짐 (settings.js)
 *  - 점수 = 버틴 시간 (0.01초). 혼자 · 한 기기 둘이서 · 온라인 둘이서
 *  - 둘이서·온라인 방식(sub): 'coop' 협동 = 한 명이라도 맞으면 바로 끝 / 'vs' 대결 = 먼저 맞는 사람이 짐 (같이 맞으면 무승부)
 *  - 온라인: 방장 기기가 총알을 계산해서 보냄(초당 10번). 손님은 자기 아바타를 직접 움직이고,
 *    자기 화면의 총알에 맞았는지 직접 판단해서 방장에게 알림 (끊김 때문에 억울하게 맞지 않게)
 */
(function () {
  'use strict';
  const PX = window.GoPixel, AV = window.GoAvatar;
  let S = null;   // GoSport 는 이 파일보다 늦게 읽혀서 create() 때 가져옴
  const W = 480, H = 480, STEP = 1 / 60, SNAP_MS = 100, POS_MS = 50;
  const cfg = () => window.GoSettings.get('dodge') || {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const RING = ['#FF5A5F', '#4C7DFF'];
  const fmtT = t => t.toFixed(2) + '초';

  // 별 (배경, 천천히 흐름)
  const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97.13) % W, y: (i * 53.71) % H, s: (i % 3) + 1, v: 6 + (i % 5) * 4 }));
  function drawBg(ctx, t) {
    ctx.fillStyle = '#05070F'; ctx.fillRect(0, 0, W, H);
    STARS.forEach(st => { const y = (st.y + t * st.v) % H; ctx.fillStyle = st.s === 3 ? '#C8D0FF' : st.s === 2 ? '#7880B8' : '#3E4470'; ctx.fillRect(st.x | 0, y | 0, st.s === 3 ? 2 : 1, st.s === 3 ? 2 : 1); });
  }
  // 총알: 가운데 흰 점 + 노랑/주황 테두리 (원래 닷지 느낌)
  const BUL = {};
  function bulletImg(k) {
    if (BUL[k]) return BUL[k];
    const c = document.createElement('canvas'); c.width = c.height = 12; const g = c.getContext('2d');
    const col = ['#FFD23F', '#FF9A3D', '#FF5A5F'][k];
    g.fillStyle = 'rgba(255,200,80,.25)'; g.beginPath(); g.arc(6, 6, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(6, 6, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFFFFF'; g.fillRect(5, 5, 2, 2);
    return (BUL[k] = c);
  }
  // 아바타 (발밑에 1P 빨강 · 2P 파랑 고리). x, y = 맞는 자리(가슴)
  function drawAvatar(ctx, av, x, y, slot, frame, blink, name) {
    if (blink) return;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 16, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = RING[slot] || RING[0]; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 16, 10, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    AV.draw(ctx, av, Math.round(x - 9), Math.round(y - 15), 1, { frame });
    if (name) { ctx.font = '700 11px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#05070F'; ctx.strokeText(name, x, y - 20); ctx.fillStyle = RING[slot] ? '#FFFFFF' : '#FFFFFF'; ctx.fillText(name, x, y - 20); }
  }

  function thumbDraw(ctx, t) {
    drawBg(ctx, t);
    const av = (window.GameHub && window.GameHub.user && window.GameHub.user.avatar) || AV.normalize({});
    for (let i = 0; i < 26; i++) {   // 가운데로 몰려드는 총알
      const a = i * 2.39, r = 70 + (i * 37) % 160, im = bulletImg(i % 3);
      ctx.drawImage(im, W / 2 + Math.cos(a) * r - 6, H / 2 + Math.sin(a) * r - 6);
    }
    drawAvatar(ctx, av, W / 2, H / 2, 0, 0, false, '');
  }

  window.GoGames = window.GoGames || {};
  window.GoGames.dodge = {
    id: 'dodge', size: [W, H],
    thumb(ctx, w, h) {
      ctx.save(); ctx.fillStyle = '#05070F'; ctx.fillRect(0, 0, w, h);
      const k = Math.max(w / W, h / H) * 0.9; ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
      thumbDraw(ctx, 0);
      ctx.restore();
      ctx.font = '22px "Jua", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#1D2340'; ctx.strokeText('피해라!', w / 2, h * 0.9); ctx.fillStyle = '#FFE45C'; ctx.fillText('피해라!', w / 2, h * 0.9);
    },
    create(canvas, hooks) {
      S = window.GoSport;
      const ctx = PX.setup(canvas, W, H), clock = PX.clock();
      let mode = 'ai', sub = 'coop', phase = 'idle', raf = 0, last = 0, acc = 0, pausedFrom = 'play';
      let P = [], B = [], FX = [], t = 0, readyT = 0, bgT = 0, nextSpawn = 0, net = null, result = null, seedR = Math.random;
      const C = () => cfg();
      const online = () => mode === 'online', isHost = () => !online() || (net && net.host);
      const two = () => P.length > 1;

      /* ---------- 조작 ---------- */
      const KEYS = {
        KeyA: 'k0.left', KeyD: 'k0.right', KeyW: 'k0.up', KeyS: 'k0.down',
        ArrowLeft: 'k1.left', ArrowRight: 'k1.right', ArrowUp: 'k1.up', ArrowDown: 'k1.down',
        KeyP: 'pause', Escape: 'pause'
      };
      const input = S.keys(KEYS, a => { if (a === 'pause') togglePause(); });
      hooks.onTurn({ text: '방식을 골라 주세요', side: -1 });
      const touch = S.touchDevice();
      const ctl = (p, k) => p.ks.some(q => input.down['k' + q + '.' + k]);
      // 휴대폰: 화면을 끌면 그만큼 움직임 (손가락이 아바타를 가리지 않게). 한 기기 둘이서 = 왼쪽 반 1P · 오른쪽 반 2P
      const drags = {};
      const gpos = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
      const pd = e => {
        if (phase === 'paused') { togglePause(); return; }
        if (phase === 'idle' || phase === 'over') return;
        const [x, y] = gpos(e);
        const who = mode === 'local' ? P[x < W / 2 ? 0 : 1] : P.find(p => p.mine);
        if (!who) return;
        drags[e.pointerId] = { p: who, x, y }; e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* noop */ }
      };
      const pm = e => {
        const d = drags[e.pointerId]; if (!d) return;
        const [x, y] = gpos(e), p = d.p;
        if (p.alive && phase !== 'paused') { p.x = clamp(p.x + (x - d.x) * 1.3, 10, W - 10); p.y = clamp(p.y + (y - d.y) * 1.3, 16, H - 18); p.moving = 0.15; }
        d.x = x; d.y = y;
      };
      const pu = e => { delete drags[e.pointerId]; };
      canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm);
      ['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, pu));
      canvas.style.touchAction = 'none';

      /* ---------- 사람 ---------- */
      function mkPlayer(slot, name, av, ks, mine) {
        return { slot, name, av: av || AV.normalize({}), ks, mine, x: two0(slot), y: H / 2, alive: true, moving: 0, walk: 0, tx: null, ty: null, pend: 0 };
      }
      let nPlayers = 1;
      const two0 = slot => (nPlayers > 1 ? (slot ? W / 2 + 40 : W / 2 - 40) : W / 2);
      function movePlayer(p, dt) {
        if (!p.alive) return;
        let mx = 0, my = 0;
        if (ctl(p, 'left')) mx -= 1; if (ctl(p, 'right')) mx += 1; if (ctl(p, 'up')) my -= 1; if (ctl(p, 'down')) my += 1;
        if (mx || my) { const l = Math.hypot(mx, my), sp = C().moveSpeed || 170; p.x = clamp(p.x + mx / l * sp * dt, 10, W - 10); p.y = clamp(p.y + my / l * sp * dt, 16, H - 18); p.moving = 0.15; }
        if (p.moving > 0) { p.moving -= dt; p.walk += dt; }
      }
      const hitR = () => (C().hitR || 5) + (C().bulletR || 3);
      const hitBy = p => B.some(b => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < hitR() ** 2);

      /* ---------- 총알 (방장 · 혼자 · 한 기기가 계산) ---------- */
      const target = () => { const al = P.filter(p => p.alive); return al.length ? al[Math.floor(seedR() * al.length)] : { x: W / 2, y: H / 2 }; };
      function spawn() {
        const side = Math.floor(seedR() * 4), u = seedR();
        const x = side === 0 ? u * W : side === 1 ? W + 6 : side === 2 ? u * W : -6;
        const y = side === 0 ? -6 : side === 1 ? u * H : side === 2 ? H + 6 : u * H;
        const tg = target(), aim = C().bulletAim == null ? 0.22 : C().bulletAim;
        const a = Math.atan2(tg.y - y, tg.x - x) + (seedR() * 2 - 1) * aim;
        const [s0, s1] = C().bulletSpeed || [100, 165], up = Math.min(C().speedUpMax || 2.2, 1 + t * (C().speedUpPerSec == null ? 0.015 : C().speedUpPerSec)), sp = (s0 + seedR() * (s1 - s0)) * up;   // 시간이 갈수록 빨라짐
        B.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, k: Math.floor(seedR() * 3) });
      }
      const wantBullets = () => Math.min(C().bulletMax || 150, Math.floor((C().bulletStart || 12) + t * (C().bulletPerSec == null ? 1 : C().bulletPerSec)));
      function stepBullets(dt) {
        B.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        B = B.filter(b => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
        let n = 0; while (B.length < wantBullets() && n < 4) { spawn(); n++; }   // 한 번에 조금씩 (한꺼번에 몰려오지 않게)
      }
      function boom(x, y, col) { for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160; FX.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, c: i % 3 ? col : '#FFFFFF' }); } }

      function step(dt) {
        bgT += dt;
        if (phase === 'ready') { readyT -= dt; P.forEach(p => movePlayer(p, dt)); if (readyT <= 0) { phase = 'play'; clock.start(); status(); } }
        else if (phase === 'play') {
          t += dt;
          P.forEach(p => { if (p.local) movePlayer(p, dt); else if (p.tx != null) { const k = Math.min(1, dt * 14); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; } });
          stepBullets(dt);
          if (!window.__GOGO_QA || !window.__GOGO_QA.dodgeGod) {
            const dead = P.filter(p => p.alive && p.local && hitBy(p));
            if (dead.length) { dead.forEach(p => { p.alive = false; boom(p.x, p.y, RING[p.slot] || '#FFD23F'); }); decide(); }
          }
        }
        stepFx(dt);
      }
      function stepFx(dt) { FX.forEach(f => { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.vy *= 0.96; f.life -= dt; }); FX = FX.filter(f => f.life > 0); }

      // 누가 맞았는지로 끝낼지 정함 (방장 · 혼자 · 한 기기)
      function decide() {
        if (phase !== 'play') return;
        const dead = P.filter(p => !p.alive).map(p => p.slot);
        if (!dead.length) return;
        if (!two() || sub === 'coop' || dead.length >= P.length || sub === 'vs') end(dead);
      }
      function end(dead) {
        if (net && net.host) send({ k: 'end', t: Math.round(t * 100), dead });
        finish(dead);
      }

      /* ---------- 끝 ---------- */
      function timePoints(sec) { let pt = 0; (C().timePoints || []).forEach(([s, p]) => { if (sec >= s) pt = p; }); return pt; }
      function finish(dead) {
        if (phase === 'over') return;
        phase = 'over'; clock.stop();
        P.forEach(p => { if (dead.includes(p.slot) && p.alive) { p.alive = false; boom(p.x, p.y, RING[p.slot]); } });
        const sec = Math.round(t * 100) / 100, score = Math.round(t * 100), me = P.find(p => p.mine) || P[0];
        let title, message, win, winner, points = 0;
        if (!two()) { title = fmtT(sec) + ' 버텼어요!'; message = '총알을 피해 ' + fmtT(sec) + ' 버텼어요'; win = sec >= 10; winner = win ? 0 : 1; points = timePoints(sec); }
        else if (sub === 'coop') {
          const goal = C().coopGoal || 30;
          title = '둘이서 ' + fmtT(sec) + '!'; message = '협동 · ' + P.filter(p => dead.includes(p.slot)).map(p => p.name).join(', ') + ' 맞아서 끝 · 같이 ' + fmtT(sec) + ' 버텼어요';
          win = sec >= goal; winner = win ? 0 : 1; points = online() ? timePoints(sec) : 0;
        } else {
          const alive = P.filter(p => !dead.includes(p.slot));
          if (alive.length === 1) { const w = alive[0]; winner = w.slot; title = w.name + ' 승리!'; message = '대결 · ' + P.find(p => p !== w).name + ' 먼저 맞음 · ' + fmtT(sec); }
          else { winner = -1; title = '무승부!'; message = '대결 · 둘이 같이 맞았어요 · ' + fmtT(sec); }
          win = online() ? winner === me.slot : undefined; points = online() && win ? ((C().points || {}).win || 2) : 0;
        }
        result = { title, sec };
        hooks.onTurn({ text: title, side: -1 });
        hooks.onOver({ winner, win: mode === 'local' ? undefined : !!win, score, points, title, message, duration_sec: Math.round(sec), extra: { sub: two() ? sub : 'solo', time: sec, players: P.length } });
        render();
      }

      /* ---------- 온라인 ---------- */
      function send(m) { if (online() && hooks.onMove) hooks.onMove(m); }
      function hostSnap() {
        const b = []; B.forEach(q => b.push(q.x | 0, q.y | 0, q.vx | 0, q.vy | 0, q.k));
        send({ k: 'st', ph: phase, r: Math.round(readyT * 10) / 10, t: Math.round(t * 100), b, p: P.map(p => [p.x | 0, p.y | 0, p.alive ? 1 : 0]) });
      }
      function applySnap(m) {
        if (m.ph !== phase && phase !== 'over') { if (m.ph === 'play' && phase !== 'play') clock.start(); phase = m.ph; status(); }
        readyT = m.r; t = m.t / 100;
        m.p.forEach((a, i) => { const p = P[i]; if (!p || p.mine) return; p.tx = a[0]; p.ty = a[1]; if (p.alive && !a[2]) boom(p.x, p.y, RING[p.slot]); p.alive = !!a[2]; });
        B = []; for (let i = 0; i + 4 < m.b.length; i += 5) B.push({ x: m.b[i], y: m.b[i + 1], vx: m.b[i + 2], vy: m.b[i + 3], k: m.b[i + 4] });
      }
      function clientStep(dt) {
        bgT += dt;
        const me = P.find(p => p.mine);
        if (phase === 'play') t += dt; else if (phase === 'ready') readyT -= dt;
        if (me) {
          if (phase === 'ready' || phase === 'play') movePlayer(me, dt);
          if (phase === 'play' && me.alive && !me.pend && hitBy(me) && !(window.__GOGO_QA && window.__GOGO_QA.dodgeGod)) { me.pend = performance.now(); me.alive = false; boom(me.x, me.y, RING[me.slot]); send({ k: 'hit', t: Math.round(t * 100) }); }
          if (performance.now() - net.lastPos > POS_MS) { net.lastPos = performance.now(); send({ k: 'pos', x: Math.round(me.x), y: Math.round(me.y) }); }
        }
        P.forEach(p => { if (!p.mine && p.tx != null) { const k = Math.min(1, dt * 12); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.moving = 0.1; p.walk += dt; } });
        B.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        stepFx(dt);
      }

      /* ---------- 화면 ---------- */
      function status() {
        if (phase === 'ready') hooks.onTurn({ text: '준비…', side: -1 });
        else if (phase === 'play') hooks.onTurn({ text: two() ? (sub === 'coop' ? '협동 · 둘이 같이 버텨요!' : '대결 · 먼저 맞으면 져요!') : '피해라!', side: -1 });
      }
      function render() {
        drawBg(ctx, bgT);
        B.forEach(b => { const im = bulletImg(b.k); ctx.drawImage(im, Math.round(b.x - 6), Math.round(b.y - 6)); });
        P.forEach(p => {
          if (!p.alive) return;
          const fr = p.moving > 0 ? [1, 0, 3, 0][Math.floor(p.walk * 8) % 4] : 0;
          drawAvatar(ctx, p.av, p.x, p.y, two() ? p.slot : 0, fr, phase === 'ready' && Math.floor(bgT * 6) % 2 === 1, two() ? p.name : '');
        });
        FX.forEach(f => { ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6)); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }); ctx.globalAlpha = 1;
        // 위: 버틴 시간 (크게) · 총알 수
        ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#05070F';
        ctx.font = '700 30px Galmuri11, Pretendard, sans-serif'; const tt = fmtT(t); ctx.strokeText(tt, W / 2, 40); ctx.fillStyle = '#FFE45C'; ctx.fillText(tt, W / 2, 40);
        ctx.font = '700 12px Pretendard, sans-serif'; ctx.fillStyle = '#9AA3D8'; ctx.textAlign = 'right'; ctx.fillText('총알 ' + B.length, W - 10, 20);
        if (two()) { ctx.textAlign = 'left'; ctx.fillStyle = '#C8D0FF'; ctx.fillText(sub === 'coop' ? '협동' : '대결', 10, 20); }
        if (phase === 'ready') { ctx.textAlign = 'center'; ctx.font = '700 40px Galmuri11, Pretendard, sans-serif'; ctx.lineWidth = 6; const n = String(Math.max(1, Math.ceil(readyT))); ctx.strokeText(n, W / 2, H / 2 - 50); ctx.fillStyle = '#FFFFFF'; ctx.fillText(n, W / 2, H / 2 - 50); }
        if (phase === 'paused') { ctx.fillStyle = 'rgba(5,7,15,.6)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.font = '700 28px Galmuri11, Pretendard, sans-serif'; ctx.fillStyle = '#FFFFFF'; ctx.fillText('일시정지', W / 2, H / 2); ctx.font = '700 13px Pretendard, sans-serif'; ctx.fillText(touch ? '화면을 누르면 계속' : 'P 를 누르면 계속', W / 2, H / 2 + 26); }
        if (phase === 'over' && result) { ctx.fillStyle = 'rgba(5,7,15,.45)'; ctx.fillRect(0, H / 2 - 40, W, 70); ctx.textAlign = 'center'; ctx.font = '700 28px Galmuri11, Pretendard, sans-serif'; ctx.lineWidth = 5; ctx.strokeText(result.title, W / 2, H / 2 + 6); ctx.fillStyle = '#FFE45C'; ctx.fillText(result.title, W / 2, H / 2 + 6); }
        if (phase === 'idle') { ctx.textAlign = 'center'; ctx.font = '700 22px Galmuri11, Pretendard, sans-serif'; ctx.fillStyle = '#C8D0FF'; ctx.fillText('총알을 피해 오래 버티기', W / 2, H - 40); }
      }
      function loop(ts) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
        if (phase === 'ready' || phase === 'play') {
          if (isHost()) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; } if (n >= 6) acc = 0; }
          else clientStep(dt);
          if (net && net.host && ts - net.lastSnap >= SNAP_MS) { net.lastSnap = ts; hostSnap(); }
        } else { bgT += dt; stepFx(dt); }
        render();
      }
      function togglePause() {
        if (online()) return;
        if (phase === 'paused') { phase = pausedFrom; if (phase === 'play') clock.start(); }
        else if (phase === 'ready' || phase === 'play') { pausedFrom = phase; phase = 'paused'; clock.stop(); }
      }
      const vis = () => { if (document.hidden && !online() && (phase === 'ready' || phase === 'play')) togglePause(); };
      document.addEventListener('visibilitychange', vis);
      raf = requestAnimationFrame(loop);
      // 자동 검사용 (검사 도구가 window.__GOGO_QA 를 켰을 때만)
      if (window.__GOGO_QA) window.__GOGO_QA.dodge = {
        get: () => ({ phase, sub, mode, t: Math.round(t * 100) / 100, B: B.length, P: P.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), alive: p.alive, name: p.name, mine: p.mine })) }),
        hit: slot => { const p = P[slot]; if (p && p.alive && phase === 'play') { if (p.local || isHost()) { p.alive = false; boom(p.x, p.y, '#fff'); if (isHost()) decide(); } if (!isHost() && p.mine) { p.pend = performance.now(); send({ k: 'hit', t: Math.round(t * 100) }); } } },
        skip: sec => { t += sec; }
      };

      return {
        get state() { return phase === 'over' ? 'over' : phase === 'idle' ? 'ready' : 'playing'; },
        start(o) {
          o = o || {}; mode = o.mode || 'ai'; sub = o.sub === 'vs' ? 'vs' : 'coop';
          net = null; P = []; B = []; FX = []; t = 0; acc = 0; result = null; Object.keys(drags).forEach(k => delete drags[k]);
          const myAv = S.myAvatar(), meName = S.myName();
          if (mode === 'online') {
            const roster = o.roster || []; nPlayers = Math.min(2, roster.length || 2);
            net = { host: !!o.host, lastSnap: 0, lastPos: 0 };
            for (let i = 0; i < 2; i++) {
              const r = roster[i]; if (!r) continue;
              const mine = i === o.me, p = mkPlayer(i, mine ? meName : (r.nick || '친구'), mine ? myAv : (r.avatar || S.cpuAvatar(r.id || i)), mine ? [0, 1] : [], mine);
              p.local = mine; p.netId = r.id; P.push(p);
            }
          } else if (mode === 'local') {
            nPlayers = 2;
            const a = mkPlayer(0, '1P', myAv, [0], true), b = mkPlayer(1, '2P', S.cpuAvatar('dodge-2p'), [1], false); a.local = b.local = true; P.push(a, b);
          } else { nPlayers = 1; const a = mkPlayer(0, meName, myAv, [0, 1], true); a.local = true; P.push(a); }
          P.forEach(p => { p.x = two0(p.slot); p.y = H / 2 + 40; });
          phase = 'ready'; readyT = C().readySec || 2; status();
          clock.reset(); hooks.onState('playing');
          hooks.onButtons(online() ? [] : [{ id: 'pause', label: '일시정지 / 계속' }]);
        },
        remote(m) {
          if (!m || !net) return;
          if (m.left && !m.k) {   // 상대가 나감
            if (phase === 'over') return;
            if (!net.host) { if (m.wasHost) finish(sub === 'vs' ? [0] : [0]); return; }
            const p = P.find(q => q.netId === m.left) || P.find(q => !q.mine);
            if (p) { p.alive = false; end([p.slot]); }
            return;
          }
          if (net.host) {
            const p = P.find(q => !q.mine); if (!p) return;
            if (m.k === 'pos') { p.tx = m.x; p.ty = m.y; }
            else if (m.k === 'hit') { if (p.alive && phase === 'play') { p.alive = false; boom(p.x, p.y, RING[p.slot]); decide(); } }
            else if (m.k === 'quit') { if (phase !== 'over') { p.alive = false; end([p.slot]); } }
          } else {
            if (m.k === 'st') applySnap(m);
            else if (m.k === 'end') { t = m.t / 100; finish(m.dead || []); }
          }
        },
        press(id) {
          if (id === 'pause') return togglePause();
          if (id === 'resign' && phase !== 'over' && phase !== 'idle') {
            const me = P.find(p => p.mine) || P[0];
            if (online()) { if (!net.host) { send({ k: 'quit' }); finish([me.slot]); } else end([me.slot]); return; }
            finish(P.map(p => p.slot));
          }
        },
        togglePause,
        action() {},
        destroy() {
          cancelAnimationFrame(raf); input.off();
          canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm);
          ['pointerup', 'pointercancel'].forEach(ev => canvas.removeEventListener(ev, pu));
          document.removeEventListener('visibilitychange', vis);
        }
      };
    }
  };
})();
