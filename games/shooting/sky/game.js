/*
 * gogo?gogo! — 하늘 편대 (오락실 세로 비행기 슈팅처럼)
 *  - 혼자(쉬움·보통·어려움) · 한 기기 둘이서(협동) · 온라인 둘이서(협동), 최대 2명
 *  - 스테이지 10개. 스테이지마다 적 편대가 몰려오다가 마지막에 보스가 나옴. 보스를 무찌르면 다음 스테이지
 *  - 스테이지가 올라갈수록 적 총알이 빨라짐 (settings.js 의 bulletBase · bulletStep)
 *  - 총알은 저절로 나감. 빨간(주황) 편대를 모두 잡거나 폭격기를 잡으면 P(파워)·B(폭탄)·★(점수) 아이템
 *  - 폭탄: 화면의 적 총알을 모두 지우고 적에게 큰 피해. 맞으면 목숨 -1, 파워 -1 (잠깐 무적)
 *  - v46: 비행기·적·보스 15개 = Meshy 3D 를 위에서 찍은 그림(img/). 그림을 못 받으면 예전 도트 그림으로
 *  - 온라인: 방장 기기가 적·총알·점수를 계산해서 보냄(초당 10번). 손님은 자기 비행기를 직접 움직이고,
 *    자기 화면에 보이는 총알에 맞았는지도 직접 판단해서 방장에게 알림 (끊김 때문에 억울하게 맞지 않게)
 */
(function () {
  'use strict';
  const S = window.GoSport, PX = window.GoPixel;
  const W = 480, H = 640, STEP = 1 / 60, SNAP_MS = 100, POS_MS = 50, SCROLL = 70;
  const cfg = () => window.GoSettings.get('sky') || {};
  const LVL = { easy: '쉬움', normal: '보통', hard: '어려움' };

  /* ---------- 스테이지 · 보스 ---------- */
  const ALLP = ['aimed', 'fan', 'ring', 'spiral', 'rain', 'wall', 'burst'];
  const STAGES = [
    { name: '푸른 바다', bg: 'ocean', water: true, boss: { name: '회색 독수리', type: 'plane', color: '#7C8AA6', hw: 96, hh: 48, guns: [[-52, 12], [52, 12], [0, 40]], pats: ['aimed', 'fan'] } },
    { name: '산호섬', bg: 'islands', water: true, boss: { name: '쌍둥이 매', type: 'plane', color: '#3E8F6E', hw: 112, hh: 52, guns: [[-74, 14], [74, 14], [-24, 36], [24, 36]], pats: ['fan', 'aimed', 'ring'] } },
    { name: '항구 도시', bg: 'coast', water: true, boss: { name: '철갑 포함', type: 'ship', color: '#5B6678', hw: 62, hh: 118, guns: [[0, -64], [0, -14], [0, 36], [0, 84]], pats: ['ring', 'aimed', 'rain'] } },
    { name: '사막 협곡', bg: 'desert', boss: { name: '모래 전갈 전차', type: 'tank', color: '#B5833A', hw: 86, hh: 74, guns: [[0, 30], [-56, -16], [56, -16]], pats: ['fan', 'spiral', 'aimed'] } },
    { name: '정글 강', bg: 'jungle', boss: { name: '정글 비행정', type: 'plane', color: '#3A6B34', hw: 140, hh: 54, guns: [[-96, 10], [96, 10], [-44, 26], [44, 26], [0, 44]], pats: ['spiral', 'ring', 'rain', 'aimed'] } },
    { name: '눈 덮인 산맥', bg: 'snow', boss: { name: '눈보라 포대', type: 'tank', color: '#7F93A8', hw: 100, hh: 80, guns: [[0, 34], [-64, -18], [64, -18], [-30, 50], [30, 50]], pats: ['wall', 'spiral', 'fan', 'aimed'] } },
    { name: '화산 지대', bg: 'lava', boss: { name: '용암 거미 요새', type: 'fortress', color: '#7A2E2E', hw: 110, hh: 84, guns: [[0, 40], [-70, 0], [70, 0], [-40, -44], [40, -44]], pats: ['spiral', 'rain', 'ring', 'burst'] } },
    { name: '밤바다', bg: 'night', water: true, boss: { name: '그림자 전함', type: 'ship', color: '#39425E', hw: 76, hh: 140, guns: [[0, -90], [0, -40], [0, 10], [0, 60], [0, 108]], pats: ['fan', 'spiral', 'wall', 'burst', 'aimed'] } },
    { name: '폭풍 구름', bg: 'storm', boss: { name: '천둥 비행선', type: 'airship', color: '#6B5BA8', hw: 132, hh: 70, guns: [[-80, 30], [80, 30], [0, 66], [-40, 50], [40, 50]], pats: ['spiral', 'ring', 'rain', 'burst', 'wall'] } },
    { name: '하늘 요새', bg: 'sky', boss: { name: '하늘 요새 고고', type: 'fortress', color: '#C8463C', hw: 152, hh: 100, guns: [[0, 56], [-100, 10], [100, 10], [-56, 40], [56, 40], [-120, -40], [120, -40]], pats: ALLP } }
  ];
  const stageOf = s => STAGES[Math.max(0, Math.min(STAGES.length - 1, s - 1))];

  /* ---------- 작은 도구 ---------- */
  function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmtScore = n => String(Math.max(0, Math.round(n))).padStart(7, '0');

  /* ---------- 도트 그림 (왼쪽 반만 적고 좌우 대칭으로) ---------- */
  function sprite(half, pal, sc) {
    const rows = half.map(r => r + r.slice(0, -1).split('').reverse().join(''));
    const w = rows[0].length, h = rows.length;
    const c = document.createElement('canvas'); c.width = w * sc; c.height = h * sc;
    const g = c.getContext('2d');
    rows.forEach((r, y) => r.split('').forEach((ch, x) => { const col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x * sc, y * sc, sc, sc); } }));
    return c;
  }
  const PLANE = ['.......o', '......ow', '......ob', '.....obc', '.....obc', 'o....obb', 'oo..obbb', 'obooobbb', 'obbbbbbb', 'oooobbbd', '....obbb', '.....obb', '....oobb', '...obbbb', '...ooooo'];
  const SMALL = ['...ooo', '...obb', 'oo.obb', 'obooob', 'obbbbb', 'ooobbc', '...obb', '....ob', '.....o'];
  const BOMBER = ['......ooo', '......obb', 'ooooooobb', 'obbbbbbbb', 'obbdbbbbb', 'ooobbbbbc', '..odo.obb', '..ooo.obb', '......obb', '.......ob', '........o'];
  /* v46 Meshy 그림 (img/*.png — Meshy 3D 비행기·보스 15개를 위에서 찍어 도트로). 못 불러오면 아래 도트 그림 */
  const IMGDIR = 'games/shooting/sky/img/', IMGV = 46, IMG = {};
  function img(n) { let i = IMG[n]; if (!i) { i = IMG[n] = new Image(); i.src = IMGDIR + n + '.png?v=' + IMGV; } return i.complete && i.naturalWidth ? i : null; }
  ['p0', 'p1', 'small', 'red', 'dive', 'bomber', 'big'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => 'boss' + n)).forEach(img);   // 미리 받기
  const SPR = {};
  function spr(name) {
    const mi = img(name); if (mi) return mi;
    if (SPR[name]) return SPR[name];
    const O = '#1D2340';
    const map = {
      p0: () => sprite(PLANE, { o: O, b: '#E8484E', d: '#A8282E', c: '#7FE3FF', w: '#FFFFFF' }, 2),
      p1: () => sprite(PLANE, { o: O, b: '#3C78F0', d: '#2445A8', c: '#FFE48A', w: '#FFFFFF' }, 2),
      small: () => sprite(SMALL, { o: O, b: '#8A9A5B', c: '#FFD23F' }, 2),
      red: () => sprite(SMALL, { o: O, b: '#FF8A3D', c: '#FFFFFF' }, 2),
      dive: () => sprite(SMALL, { o: O, b: '#9A6BD8', c: '#7FE3FF' }, 2),
      bomber: () => sprite(BOMBER, { o: O, b: '#6E7F8F', d: '#3E4A58', c: '#FFD23F' }, 2),
      big: () => sprite(BOMBER, { o: O, b: '#55663F', d: '#2E3A22', c: '#FF5A5F' }, 4)
    };
    return (SPR[name] = map[name]());
  }
  // 적 총알 그림 (k0 분홍 작은 알 · k1 주황 큰 알 · k2 하늘색 바늘)
  const BUL = {};
  function bulletImg(k) {
    if (BUL[k]) return BUL[k];
    const r = k === 1 ? 7 : k === 2 ? 4 : 5, c = document.createElement('canvas'); c.width = c.height = r * 2 + 4;
    const g = c.getContext('2d'), m = r + 2;
    const col = k === 1 ? ['#FF9A3D', '#FFE0A0'] : k === 2 ? ['#3BC8F5', '#E6FAFF'] : ['#FF4F9A', '#FFE0F0'];
    g.fillStyle = '#1D2340'; g.beginPath(); g.arc(m, m, r + 1, 0, Math.PI * 2); g.fill();
    g.fillStyle = col[0]; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = col[1]; g.beginPath(); g.arc(m, m, r * 0.5, 0, Math.PI * 2); g.fill();
    return (BUL[k] = c);
  }
  const BUL_R = [4, 6.5, 3.5];

  /* ---------- 배경 (위에서 아래로 흐르는 땅·바다, 세로로 이어지는 그림) ---------- */
  const BGC = {};
  function bgTile(theme) {
    if (BGC[theme]) return BGC[theme];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rng(theme.length * 977 + theme.charCodeAt(0) * 31);
    const wrap = fn => [-H, 0, H].forEach(oy => { g.save(); g.translate(0, oy); fn(); g.restore(); });
    const blob = (x, y, rad, col, n) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = r() * rad * 0.6; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * (0.45 + r() * 0.4), 0, Math.PI * 2); g.fill(); } };
    const sparkle = (n, cols) => { for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H, col = cols[i % cols.length], l = 4 + r() * 10; wrap(() => { g.fillStyle = col; g.fillRect(x, y, l, 2); }); } };
    const base = { ocean: '#1E5FA8', islands: '#1E6AAE', coast: '#1E62A6', desert: '#D9B46C', jungle: '#2F7A3A', snow: '#E4ECF4', lava: '#2E2424', night: '#0F1E44', storm: '#3C4468', sky: '#5C7BD9' }[theme] || '#1E5FA8';
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const sine = (amp, per, ph, x0) => y => x0 + amp * Math.sin((y / H) * Math.PI * 2 * per + ph);
    const band = (fx, w, col) => { g.fillStyle = col; for (let y = 0; y < H; y += 4) { const x = fx(y); g.fillRect(x - w / 2, y, w, 4); } };
    if (theme === 'ocean' || theme === 'islands' || theme === 'coast' || theme === 'night') sparkle(theme === 'night' ? 120 : 200, theme === 'night' ? ['#22407A', '#2A4A88', '#9FB8F0'] : ['#2F7AC4', '#4A90D8', '#8CC0F0']);
    if (theme === 'islands') {
      for (let i = 0; i < 5; i++) {
        const x = 40 + r() * (W - 80), y = r() * H, rad = 34 + r() * 30;
        wrap(() => { blob(x, y, rad + 10, '#E8D59A', 9); blob(x, y, rad, '#4FA35A', 9); blob(x, y, rad * 0.6, '#3A8A46', 5); });
      }
    }
    if (theme === 'coast') {
      const shore = sine(24, 2, 0.6, 150);
      for (let y = 0; y < H; y += 4) { const x = shore(y); g.fillStyle = '#E8D59A'; g.fillRect(0, y, x + 10, 4); g.fillStyle = '#7FA35A'; g.fillRect(0, y, x, 4); }
      g.fillStyle = '#6A6A6A'; for (let y = 0; y < H; y += 80) g.fillRect(0, y, 120, 6);
      g.fillRect(60, 0, 6, H);
      for (let i = 0; i < 40; i++) { const x = 4 + r() * 100, y = r() * H, w = 12 + r() * 16, h = 12 + r() * 18; if (Math.abs(x - 60) < 18) continue; wrap(() => { g.fillStyle = '#4A4A58'; g.fillRect(x + 3, y + 3, w, h); g.fillStyle = ['#C8B8A0', '#A89888', '#D86A5A', '#8A9AB0'][i % 4]; g.fillRect(x, y, w, h); }); }
      for (let i = 0; i < 4; i++) { const y = r() * H; wrap(() => { g.fillStyle = '#5A5A62'; g.fillRect(shore(y) - 8, y, 70, 10); }); }
    }
    if (theme === 'desert') {
      for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, w = 50 + r() * 70; wrap(() => { g.strokeStyle = '#C49A52'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, w, 14, 0, Math.PI, Math.PI * 2); g.stroke(); }); }
      const can = sine(60, 1, 0, 240); band(can, 70, '#B88A4A'); band(can, 40, '#9C7038');
      for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * H; wrap(() => blob(x, y, 10 + r() * 10, '#9C7A4A', 3)); }
    }
    if (theme === 'jungle') {
      const riv = sine(90, 1, 0, W / 2); band(riv, 80, '#8A6A3A'); band(riv, 62, '#3A78B8'); band(riv, 20, '#4A8AC8');
      for (let i = 0; i < 160; i++) { const x = r() * W, y = r() * H; if (Math.abs(x - riv(y)) < 52) continue; wrap(() => { g.fillStyle = i % 3 ? '#256A2E' : '#3E9446'; g.beginPath(); g.arc(x, y, 9 + r() * 9, 0, Math.PI * 2); g.fill(); }); }
    }
    if (theme === 'snow') {
      for (let i = 0; i < 18; i++) { const x = r() * W, y = r() * H, s = 40 + r() * 50; wrap(() => { g.fillStyle = '#9AA8B8'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.8, y + s * 0.4); g.lineTo(x - s * 0.8, y + s * 0.4); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.3, y - s * 0.45); g.lineTo(x - s * 0.3, y - s * 0.45); g.fill(); }); }
      for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H; wrap(() => { g.fillStyle = '#3E6A5A'; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 6, y + 6); g.lineTo(x - 6, y + 6); g.fill(); }); }
    }
    if (theme === 'lava') {
      for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H; wrap(() => blob(x, y, 14 + r() * 16, '#43312E', 4)); }
      const lv = sine(80, 1, 1.2, 180), lv2 = sine(50, 2, 0, 360);
      band(lv, 40, '#C83A1A'); band(lv, 24, '#FF7A2A'); band(lv, 8, '#FFD23F');
      band(lv2, 22, '#C83A1A'); band(lv2, 10, '#FF9A3D');
    }
    if (theme === 'storm') { for (let i = 0; i < 24; i++) { const x = r() * W, y = r() * H; wrap(() => blob(x, y, 40 + r() * 40, i % 2 ? '#2E3456' : '#4A5278', 6)); } }
    if (theme === 'sky') { for (let i = 0; i < 22; i++) { const x = r() * W, y = r() * H; wrap(() => blob(x, y, 30 + r() * 40, i % 3 ? '#8FA8EE' : '#F2B8C8', 6)); } }
    return (BGC[theme] = c);
  }
  const CLOUDS = Array.from({ length: 6 }, (_, i) => ({ x: (i * 157) % W, y: (i * 233) % H, s: 30 + (i * 37) % 40 }));
  function drawBg(ctx, stage, scroll) {
    const t = bgTile(stageOf(stage).bg), off = scroll % H;
    ctx.drawImage(t, 0, off - H); ctx.drawImage(t, 0, off);
    const theme = stageOf(stage).bg;
    ctx.save(); ctx.globalAlpha = theme === 'storm' ? 0.35 : 0.2; ctx.fillStyle = theme === 'storm' ? '#1A1E36' : '#FFFFFF';
    CLOUDS.forEach(c => {
      const y = ((c.y + scroll * 1.8) % (H + 200)) - 100;
      ctx.beginPath(); ctx.arc(c.x, y, c.s, 0, Math.PI * 2); ctx.arc(c.x + c.s * 0.9, y + 8, c.s * 0.8, 0, Math.PI * 2); ctx.arc(c.x - c.s * 0.8, y + 10, c.s * 0.7, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    if (theme === 'night') { ctx.fillStyle = 'rgba(8,10,30,.25)'; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- 그리기: 비행기 · 적 · 보스 ---------- */
  function drawPlane(ctx, slot, x, y, blink, t) {
    if (blink && Math.floor(t * 12) % 2) return;
    const im = spr('p' + slot);
    ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2));
    ctx.fillStyle = Math.floor(t * 20) % 2 ? '#FFD23F' : '#FF9A3D';   // 엔진 불꽃
    ctx.fillRect(Math.round(x - 2), Math.round(y + im.height / 2 - 1), 4, 4 + (Math.floor(t * 20) % 2) * 2);
  }
  function drawGround(ctx, e, water, t) {
    ctx.save(); ctx.translate(Math.round(e.x), Math.round(e.y));
    if (water) {
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-10, 20, 20, 10);
      ctx.fillStyle = '#1D2340'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : '#6E7480'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9AA0AC'; ctx.fillRect(-5, -10, 10, 14);
    } else {
      ctx.fillStyle = '#1D2340'; ctx.fillRect(-15, -17, 30, 34);
      ctx.fillStyle = '#3A3A30'; ctx.fillRect(-14, -16, 7, 32); ctx.fillRect(7, -16, 7, 32);
      ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : '#7A7A4A'; ctx.fillRect(-8, -13, 16, 26);
    }
    // 포탑 (가까운 비행기를 바라봄)
    ctx.rotate(e.aim || 0);
    ctx.fillStyle = '#1D2340'; ctx.fillRect(-2, 0, 4, 16);
    ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : '#B8B090'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawEnemy(ctx, e) {
    const name = e.type === 'sweep' ? (e.red ? 'red' : 'small') : e.type === 'dive' ? 'dive' : e.type === 'bomber' ? 'bomber' : e.type === 'big' ? 'big' : 'small';
    const im = spr(name);
    ctx.drawImage(im, Math.round(e.x - im.width / 2), Math.round(e.y - im.height / 2));
    if (e.flash > 0) { ctx.save(); ctx.globalAlpha = 0.6; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(im, Math.round(e.x - im.width / 2), Math.round(e.y - im.height / 2)); ctx.restore(); }
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function drawBoss(ctx, b, def, t, aimAng) {
    const bi = img('boss' + (STAGES.findIndex(s => s.boss === def) + 1));
    if (bi) {   // Meshy 보스 그림 + 맞으면 하얗게 번쩍 + 총구
      const O = '#1D2340', bob = Math.sin(t * 2) * 2;
      ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y + bob));
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(10, 18, bi.width * 0.42, bi.height * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;   // 그림자
      ctx.drawImage(bi, -Math.round(bi.width / 2), -Math.round(bi.height / 2));
      if (b.flash > 0) { ctx.globalAlpha = 0.65; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(bi, -Math.round(bi.width / 2), -Math.round(bi.height / 2)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      def.guns.forEach(([gx, gy]) => {
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(aimAng - Math.PI / 2); ctx.fillStyle = O; ctx.fillRect(-2.5, 0, 5, 15); ctx.restore();
        ctx.fillStyle = b.flash > 0 ? '#FFFFFF' : '#C8C8D8'; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = O; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.restore(); return;
    }
    const c = b.flash > 0 ? '#FFFFFF' : def.color, d = shade(def.color, 0.6), l = shade(def.color, 1.3), O = '#1D2340', hw = def.hw, hh = def.hh;
    ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y));
    ctx.lineWidth = 3; ctx.strokeStyle = O;
    const path = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
    if (def.type === 'plane') {
      path([[-hw, -6], [-hw * 0.2, -hh * 0.5], [hw * 0.2, -hh * 0.5], [hw, -6], [hw * 0.9, 12], [-hw * 0.9, 12]], c);       // 날개
      path([[-hw * 0.35, -hh], [hw * 0.35, -hh], [hw * 0.2, -hh * 0.7], [-hw * 0.2, -hh * 0.7]], d);                          // 꼬리날개
      path([[-16, -hh * 0.95], [16, -hh * 0.95], [20, hh * 0.6], [0, hh], [-20, hh * 0.6]], l);                                 // 몸통
      [-0.62, -0.3, 0.3, 0.62].forEach(k => { ctx.fillStyle = d; ctx.fillRect(hw * k - 8, -16, 16, 34); ctx.strokeRect(hw * k - 8, -16, 16, 34); ctx.fillStyle = Math.floor(t * 30) % 2 ? '#CFD6E8' : '#8A93C0'; ctx.fillRect(hw * k - 12, 18, 24, 3); });
      ctx.fillStyle = '#7FE3FF'; ctx.fillRect(-7, hh * 0.25, 14, 14); ctx.strokeRect(-7, hh * 0.25, 14, 14);
    } else if (def.type === 'ship') {
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-hw * 0.7, hh * 0.85, hw * 1.4, 24);
      path([[0, -hh], [hw * 0.8, -hh * 0.6], [hw, 0], [hw * 0.8, hh * 0.85], [0, hh], [-hw * 0.8, hh * 0.85], [-hw, 0], [-hw * 0.8, -hh * 0.6]], c);
      path([[-hw * 0.55, -hh * 0.55], [hw * 0.55, -hh * 0.55], [hw * 0.6, hh * 0.7], [-hw * 0.6, hh * 0.7]], d);
      ctx.fillStyle = l; ctx.fillRect(-hw * 0.3, -hh * 0.2, hw * 0.6, hh * 0.35); ctx.strokeRect(-hw * 0.3, -hh * 0.2, hw * 0.6, hh * 0.35);
    } else if (def.type === 'tank') {
      ctx.fillStyle = '#2E2E2A'; ctx.fillRect(-hw, -hh, hw * 0.4, hh * 2); ctx.fillRect(hw * 0.6, -hh, hw * 0.4, hh * 2); ctx.strokeRect(-hw, -hh, hw * 0.4, hh * 2); ctx.strokeRect(hw * 0.6, -hh, hw * 0.4, hh * 2);
      ctx.fillStyle = '#55554A'; for (let y = -hh + ((t * 60) % 14); y < hh; y += 14) { ctx.fillRect(-hw + 2, y, hw * 0.4 - 4, 5); ctx.fillRect(hw * 0.6 + 2, y, hw * 0.4 - 4, 5); }
      path([[-hw * 0.65, -hh * 0.85], [hw * 0.65, -hh * 0.85], [hw * 0.7, hh * 0.85], [-hw * 0.7, hh * 0.85]], c);
      ctx.fillStyle = d; ctx.beginPath(); ctx.arc(0, 0, hw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (def.type === 'airship') {
      ctx.fillStyle = d; ctx.beginPath(); ctx.ellipse(0, 0, hw, hh * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -6, hw * 0.92, hh * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = l; for (let i = -3; i <= 3; i++) ctx.fillRect(i * hw * 0.25 - 3, -hh * 0.55, 6, hh * 1.0);
      path([[-hw * 0.3, hh * 0.5], [hw * 0.3, hh * 0.5], [hw * 0.22, hh], [-hw * 0.22, hh]], shade(def.color, 0.45));
      if (Math.floor(t * 3) % 4 === 0) { ctx.strokeStyle = '#FFE48A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-hw * 0.6, -hh * 0.2); ctx.lineTo(-hw * 0.5, 0); ctx.lineTo(-hw * 0.62, 10); ctx.stroke(); ctx.strokeStyle = O; ctx.lineWidth = 3; }
    } else {   // fortress
      const pts = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; pts.push([Math.cos(a) * hw, Math.sin(a) * hh]); }
      path(pts, c);
      const pts2 = pts.map(([x, y]) => [x * 0.7, y * 0.7]); path(pts2, d);
      ctx.fillStyle = l; ctx.fillRect(-hw * 0.9, -6, hw * 1.8, 12); ctx.strokeRect(-hw * 0.9, -6, hw * 1.8, 12);
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,${Math.round(90 + pulse * 120)},60,1)`; ctx.beginPath(); ctx.arc(0, 0, 16 + pulse * 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // 포탑
    def.guns.forEach(([gx, gy]) => {
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(aimAng - Math.PI / 2);
      ctx.fillStyle = O; ctx.fillRect(-3, 0, 6, 18);
      ctx.restore();
      ctx.fillStyle = b.flash > 0 ? '#FFFFFF' : '#C8C8D8'; ctx.beginPath(); ctx.arc(gx, gy, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = O; ctx.lineWidth = 2; ctx.stroke();
    });
    ctx.restore();
  }
  function drawItem(ctx, it, t) {
    const x = Math.round(it.x), y = Math.round(it.y), bob = Math.sin(t * 6 + it.id) * 2;
    ctx.save(); ctx.translate(x, y + bob);
    if (it.k === 'star') {
      ctx.fillStyle = '#1D2340'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 6 : 13; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 4.5 : 10.5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#1D2340'; ctx.fillRect(-12, -11, 24, 22);
      ctx.fillStyle = it.k === 'P' ? (Math.floor(t * 6) % 2 ? '#FF5A5F' : '#FF9A3D') : '#3DDC84'; ctx.fillRect(-10, -9, 20, 18);
      ctx.fillStyle = '#FFFFFF'; ctx.font = '700 15px Galmuri11, Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.k, 0, 1);
    }
    ctx.restore();
  }

  /* ---------- 썸네일 ---------- */
  function thumbDraw(ctx) {
    drawBg(ctx, 2, 120);
    drawBoss(ctx, { x: W / 2, y: 130, flash: 0 }, STAGES[1].boss, 0.2, Math.PI / 2);
    [[120, 300], [170, 270], [320, 290], [370, 320]].forEach(([x, y], i) => drawEnemy(ctx, { type: i % 2 ? 'sweep' : 'line', red: i % 2, x, y, flash: 0 }));
    for (let i = 0; i < 18; i++) { const a = Math.PI / 2 + (i - 8.5) * 0.12, im = bulletImg(i % 3 === 0 ? 1 : 0); ctx.drawImage(im, W / 2 + Math.cos(a) * (120 + i * 6) - im.width / 2, 170 + Math.sin(a) * (120 + i * 6) - im.height / 2); }
    ctx.fillStyle = '#FFE48A'; for (let i = 0; i < 5; i++) { ctx.fillRect(196, 470 - i * 46, 4, 18); ctx.fillRect(220, 470 - i * 46, 4, 18); ctx.fillRect(260, 470 - i * 46, 4, 18); ctx.fillRect(284, 470 - i * 46, 4, 18); }
    drawPlane(ctx, 0, 210, 540, false, 0); drawPlane(ctx, 1, 274, 560, false, 0.05);
  }

  window.GoGames.sky = {
    id: 'sky', size: [W, H],
    thumb(ctx, w, h) {
      ctx.save(); ctx.fillStyle = '#1E5FA8'; ctx.fillRect(0, 0, w, h);
      // 가로로 긴 칸: 세로 게임 화면을 가운데에 맞춰 그림
      const k = h / H; ctx.translate((w - W * k) / 2, 0); ctx.scale(k, k);
      const t = bgTile('islands'); ctx.drawImage(t, -W, 0); ctx.drawImage(t, W, 0);   // 양옆도 바다로
      thumbDraw(ctx);
      ctx.fillStyle = 'rgba(11,14,34,.35)'; ctx.fillRect(-W, 0, W, H); ctx.fillRect(W, 0, W, H);
      ctx.restore();
    },
    create(canvas, hooks) {
      const ctx = PX.setup(canvas, W, H), clock = PX.clock();
      let mode = 'ai', level = 'normal', phase = 'idle', pausedFrom = 'play', raf = 0, last = 0, acc = 0;
      let P = [], E = [], B = [], SHOT = [], IT = [], FX = [], BOMBFX = [], boss = null;
      let stage = 1, st = 0, waveT = 0, phaseT = 0, scroll = 0, nextId = 1, cleared = 0, bombClear = 0, msg = null, sinceP = 0, sweeps = 0, over = false, overT = 0;
      let net = null, snapFx = [], snapBm = [], gameT = 0;
      const online = () => mode === 'online', isHost = () => !online() || (net && net.host);
      const C = () => cfg();
      const lives0 = () => (C().lives || {})[level] || 3;
      const bombs0 = () => C().bombs == null ? 2 : C().bombs;
      const lvMul = () => (C().levelBullet || {})[level] || 1;
      const bspeed = () => (C().bulletBase || 182) * (1 + (C().bulletStep == null ? 0.12 : C().bulletStep) * (stage - 1)) * lvMul();
      const hpMul = () => (1 + (stage - 1) * 0.12) * ({ easy: 0.8, normal: 1, hard: 1.15 }[level] || 1) * (P.length > 1 ? 1.35 : 1);
      const maxStage = () => Math.min(STAGES.length, C().stages || 10);
      const waveLen = () => (C().waveSec || 40) + stage * 2;

      /* ---------- 조작 ---------- */
      const KEYS = {
        KeyA: 'k0.left', KeyD: 'k0.right', KeyW: 'k0.up', KeyS: 'k0.down', KeyG: 'k0.bomb', Space: 'k0.bomb', KeyB: 'k0.bomb', KeyF: 'k0.bomb',
        ArrowLeft: 'k1.left', ArrowRight: 'k1.right', ArrowUp: 'k1.up', ArrowDown: 'k1.down', Enter: 'k1.bomb', NumpadEnter: 'k1.bomb', Numpad0: 'k1.bomb', Slash: 'k1.bomb', ShiftRight: 'k1.bomb', Period: 'k1.bomb',
        KeyP: 'pause', Escape: 'pause'
      };
      const input = S.keys(KEYS, a => onKey(a));
      hooks.onTurn({ text: '출격 방식을 골라 주세요', side: -1 });
      const touch = S.touchDevice();
      const BOMB_BTN = { x: W - 50, y: H - 60, r: 34 };
      const ctl = (p, k) => p.ks.some(q => input.down['k' + q + '.' + k]);
      function onKey(a) {
        if (a === 'pause') { if (!online()) togglePause(); return; }
        if (phase === 'idle' || phase === 'over' || phase === 'paused') return;
        const m = /^k(\d)\.bomb$/.exec(a); if (!m) return;
        const p = P.find(q => q.local && q.ks.includes(+m[1])); if (p) tryBomb(p);
      }
      function tryBomb(p) {
        if (!isHost()) { if (p.alive && p.bombs > 0) { send({ k: 'act', a: 'bomb' }); p.bombs--; net.bombPend = performance.now(); } return; }
        doBomb(p);
      }
      // 휴대폰: 화면을 끌면 그만큼 비행기가 움직임 (손가락이 비행기를 가리지 않게)
      let drag = null;
      const gpos = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
      const pd = e => {
        if (phase === 'paused') { togglePause(); return; }
        if (phase === 'idle' || phase === 'over') return;
        const [x, y] = gpos(e);
        const me = P.find(p => p.mine);
        if (touch && (x - BOMB_BTN.x) ** 2 + (y - BOMB_BTN.y) ** 2 <= (BOMB_BTN.r + 8) ** 2) { if (me) tryBomb(me); e.preventDefault(); return; }
        drag = { id: e.pointerId, x, y }; e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* noop */ }
      };
      const pm = e => {
        if (!drag || drag.id !== e.pointerId) return;
        const [x, y] = gpos(e), me = P.find(p => p.mine);
        if (me && me.alive && phase !== 'paused') { me.x = clamp(me.x + (x - drag.x) * 1.25, 14, W - 14); me.y = clamp(me.y + (y - drag.y) * 1.25, 30, H - 22); }
        drag.x = x; drag.y = y;
      };
      const pu = e => { if (drag && drag.id === e.pointerId) drag = null; };
      canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm);
      ['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, pu));
      canvas.style.touchAction = 'none';

      /* ---------- 사람(비행기) ---------- */
      function mkPlayer(slot, name, ks, mine, local) {
        return { slot, name, ks, mine, local, x: spawnX(slot), y: H - 70, alive: true, out: false, lives: lives0(), bombs: bombs0(), power: 1, score: 0, inv: 2.5, cd: 0, rsp: 0, dc: 0, tx: null, ty: null, pend: 0 };
      }
      const spawnX = slot => (P.length > 1 || (mode !== 'ai') ? W / 2 + (slot ? 56 : -56) : W / 2);
      const alivePlayers = () => P.filter(p => p.alive);
      function target(x, y) {
        let best = null, bd = 1e9;
        P.forEach(p => { if (!p.alive) return; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } });
        return best || { x: W / 2, y: H - 60 };
      }
      function killPlayer(p) {
        if (!p.alive || p.inv > 0) return;
        p.alive = false; p.lives--; p.dc++; p.rsp = 1.4;
        boom(p.x, p.y, 3);
        if (p.power > 1) { dropItem(p.x, p.y - 20, 'P'); p.power--; }
        if (p.lives <= 0) { p.out = true; p.lives = 0; }
      }
      function respawn(p) { p.tx = p.ty = null; p.alive = true; p.x = spawnX(p.slot); p.y = H - 70; p.inv = 2.5; p.bombs = Math.max(p.bombs, bombs0()); }

      /* ---------- 효과 ---------- */
      function boom(x, y, size, remoteOk) {
        const n = 5 + size * 5;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90 * size; FX.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.35 * size, max: 0.7 * size, s: 2 + Math.random() * 2 * size, c: ['#FFFFFF', '#FFE48A', '#FF9A3D', '#FF5A5F'][i % 4] }); }
        FX.push({ ring: true, x, y, r: 4, vr: 120 * size, life: 0.3 + size * 0.08, max: 0.3 + size * 0.08 });
        if (net && net.host && !remoteOk) snapFx.push([x | 0, y | 0, size]);
      }
      function spark(x, y) { FX.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, life: 0.15, max: 0.15, s: 2, c: '#FFFFFF' }); }
      function say(text, sec, color) { msg = { text, until: gameT + sec, color: color || '#FFFFFF' }; }

      /* ---------- 적 ---------- */
      function addEnemy(o) { const e = Object.assign({ id: nextId++, t: 0, flash: 0, vx: 0, vy: 0, cd: 1 + Math.random(), shots: 0 }, o); e.max = e.hp; E.push(e); return e; }
      /* 총알 수 배율(settings.js bulletCount, 기본 1.5) — 1.5면 총알 2발마다 1발씩 '짝 총알'이 살짝 비껴서 따라 나감 */
      let extraAcc = 0, extraSide = 1;
      function push1(x, y, ang, sp, k) { B.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, k: k || 0 }); }
      function shoot(x, y, ang, sp, k) {
        if (B.length > 700 || bombClear > 0) return;
        push1(x, y, ang, sp, k);
        extraAcc += Math.max(0, (C().bulletCount == null ? 1.5 : C().bulletCount) - 1);
        while (extraAcc >= 1) { extraAcc -= 1; extraSide = -extraSide; push1(x, y, ang + extraSide * 0.09, sp * 0.86, k); }
      }
      function aimed(x, y, sp, n, spread, k) { const t = target(x, y), a = Math.atan2(t.y - y, t.x - x); for (let i = 0; i < n; i++) shoot(x, y, a + (i - (n - 1) / 2) * spread, sp, k); }
      const HP = { line: 1, vee: 1, sweep: 1, dive: 3, bomber: 18, ground: 9, big: 70 };
      const SCORE = { line: 100, vee: 100, sweep: 150, dive: 200, bomber: 800, ground: 300, big: 3000 };
      const R = { line: 10, vee: 10, sweep: 10, dive: 10, bomber: 18, ground: 13, big: 34 };
      function mk(type, x, y, extra) { const hp = Math.max(1, Math.round(HP[type] * (type === 'line' || type === 'vee' || type === 'sweep' ? 1 + Math.floor(stage / 4) * 0.5 : hpMul()))); return addEnemy(Object.assign({ type, x, y, hp, r: R[type] }, extra || {})); }
      function spawnWave() {
        const s = stage, water = !!stageOf(s).water, rnd = Math.random;
        const w = [['line', 3], ['vee', 2], ['sweep', 2.2], ['dive', s >= 2 ? 2 : 0.6], ['bomber', st > 8 || s > 1 ? 1 + s * 0.15 : 0], ['ground', 1.6], ['big', s >= 4 && !E.some(e => e.type === 'big') ? 0.5 + s * 0.06 : 0]];
        let type = 'line';
        if (st < 3) type = 'line';
        else if (sinceP > 14) type = 'sweep';
        else { let tot = w.reduce((a, b) => a + b[1], 0), r = rnd() * tot; for (const [k, v] of w) { if ((r -= v) <= 0) { type = k; break; } } }
        const vy = 120 + s * 6;
        if (type === 'line') { const x = 60 + rnd() * (W - 120), n = 4 + (s > 5 ? 1 : 0); for (let i = 0; i < n; i++) mk('line', x, -20 - i * 34, { vy, fireAt: 0.5 + rnd() * 1.5 }); }
        else if (type === 'vee') { const x = 100 + rnd() * (W - 200); [[0, 0], [-30, -26], [30, -26], [-60, -52], [60, -52]].forEach(([dx, dy]) => mk('vee', x + dx, -20 + dy, { vy: vy + 10, fireAt: 0.6 + rnd() * 1.4 })); }
        else if (type === 'sweep') {
          sweeps++; const red = sinceP > 14 || sweeps % 3 === 0, dir = rnd() < 0.5 ? 1 : -1, y0 = 60 + rnd() * 140, sq = nextId;
          if (red) sinceP = 0;
          for (let i = 0; i < 6; i++) mk('sweep', dir > 0 ? -20 - i * 34 : W + 20 + i * 34, y0, { vx: dir * (150 + s * 6), y0, ph: 0, red, squad: red ? sq : 0, fireAt: 0.8 + rnd() * 2, enter: true });
        }
        else if (type === 'dive') { const n = 3; for (let i = 0; i < n; i++) mk('dive', 90 + i * ((W - 180) / (n - 1)) + (rnd() - 0.5) * 30, -20 - i * 20, { stopY: 110 + rnd() * 90 }); }
        else if (type === 'bomber') mk('bomber', 80 + rnd() * (W - 160), -30, { hoverY: 110 + rnd() * 80, cd: 1.2 });
        else if (type === 'ground') { const x = 60 + rnd() * (W - 120); mk('ground', x, -30, { water, cd: 1.5 }); if (s >= 3 && rnd() < 0.5) mk('ground', clamp(x + (rnd() < 0.5 ? -90 : 90), 40, W - 40), -90, { water, cd: 2 }); }
        else if (type === 'big') mk('big', W / 2 + (rnd() - 0.5) * 160, -50, { cd: 2 });
      }
      function stepEnemy(e, dt) {
        const s = stage, sp = bspeed(), px = e.x, py = e.y;
        e.t += dt; if (e.flash > 0) e.flash -= dt;
        const fireOK = e.y > 10 && e.y < H * 0.62;
        if (e.type === 'line' || e.type === 'vee') {
          e.y += e.vy * dt;
          if (e.type === 'line' && e.y < H * 0.4) { const t = target(e.x, e.y); e.x += clamp(t.x - e.x, -1, 1) * 12 * dt; }
          if (e.t > e.fireAt && e.shots < (s >= 6 ? 2 : 1) && fireOK && Math.random() < 0.35 + s * 0.06) { aimed(e.x, e.y + 8, sp, 1, 0); e.shots++; e.fireAt = e.t + 0.8; }
          else if (e.t > e.fireAt) e.fireAt = e.t + 0.6;
        } else if (e.type === 'sweep') {
          e.x += e.vx * dt; e.y = e.y0 + 60 * Math.sin(e.t * 2.4) + e.t * 18;
          if (e.x > 0 && e.x < W) e.enter = false;
          if (e.t > e.fireAt && e.shots < 1 && fireOK && Math.random() < 0.3 + s * 0.06) { aimed(e.x, e.y + 8, sp, 1, 0); e.shots++; }
        } else if (e.type === 'dive') {
          if (e.t < 1.2) e.y += (e.stopY - e.y) * Math.min(1, dt * 3.5) + 30 * dt * (e.y < 0 ? 4 : 0);
          else if (e.t < 2.0) { if (!e.fired && e.t > 1.4) { e.fired = true; aimed(e.x, e.y + 8, sp * 1.05, s >= 3 ? 3 : 1, 0.2); } }
          else { if (!e.dir) { const t = target(e.x, e.y); e.dir = Math.atan2(t.y - e.y, t.x - e.x); e.spd = 120; } e.spd += 260 * dt; e.x += Math.cos(e.dir) * e.spd * dt; e.y += Math.sin(e.dir) * e.spd * dt; }
        } else if (e.type === 'bomber') {
          if (e.t < 9) { e.y += (e.hoverY - e.y) * Math.min(1, dt * 1.2); e.x += Math.sin(e.t * 0.9) * 30 * dt; } else e.y += 80 * dt;
          e.cd -= dt;
          if (e.cd <= 0 && fireOK) { e.cd = Math.max(0.8, 1.6 - s * 0.06); const n = s >= 5 ? 5 : 3, t = target(e.x, e.y), a = Math.atan2(t.y - e.y, t.x - e.x); for (let i = 0; i < n; i++) shoot(e.x, e.y + 14, a + (i - (n - 1) / 2) * 0.22, sp * 0.95, 0); }
        } else if (e.type === 'ground') {
          e.y += SCROLL * dt; const t = target(e.x, e.y); e.aim = Math.atan2(t.y - e.y, t.x - e.x) - Math.PI / 2;
          e.cd -= dt;
          if (e.cd <= 0 && e.y > 20 && e.y < H * 0.7) { e.cd = Math.max(1.2, 2.4 - s * 0.08); e.burst = s >= 4 ? 3 : 2; e.bt = 0; }
          if (e.burst > 0) { e.bt -= dt; if (e.bt <= 0) { e.bt = 0.14; e.burst--; aimed(e.x, e.y, sp * 1.05, 1, 0, 2); } }
        } else if (e.type === 'big') {
          if (e.t < 14) { e.y += (150 - e.y) * Math.min(1, dt * 0.8); e.x += Math.sin(e.t * 0.6) * 25 * dt; } else e.y += 50 * dt;
          e.cd -= dt;
          if (e.cd <= 0 && fireOK) { e.cd = Math.max(1.3, 2.4 - s * 0.08); const n = 12 + s, o = Math.random() * Math.PI; for (let i = 0; i < n; i++) shoot(e.x, e.y + 10, o + (i / n) * Math.PI * 2, sp * 0.8, 1); aimed(e.x, e.y + 20, sp * 1.1, 3, 0.16); }
        }
        e.vx_ = (e.x - px) / dt; e.vy_ = (e.y - py) / dt;
      }
      const gone = e => e.y > H + 70 || e.y < -260 || (!e.enter && (e.x < -90 || e.x > W + 90)) || e.t > 32;
      function hurtEnemy(e, dmg, owner) {
        e.hp -= dmg; e.flash = 0.06;
        if (e.hp > 0) return;
        e.dead = true;
        const p = P[owner]; if (p) p.score += SCORE[e.type] || 100;
        boom(e.x, e.y, e.type === 'big' ? 4 : e.type === 'bomber' ? 2.4 : 1.2);
        if (e.type === 'bomber') dropItem(e.x, e.y, Math.random() < 0.65 ? 'P' : 'B');
        if (e.type === 'big') { dropItem(e.x - 20, e.y, 'P'); dropItem(e.x + 20, e.y, 'star'); dropItem(e.x, e.y + 20, Math.random() < 0.5 ? 'B' : 'star'); }
        if (e.type === 'ground' && Math.random() < 0.25) dropItem(e.x, e.y, 'star');
        if (e.squad && !E.some(q => q !== e && q.squad === e.squad && !q.dead)) dropItem(e.x, e.y, 'P');
      }
      function dropItem(x, y, k) { IT.push({ id: nextId++, k, x: clamp(x, 16, W - 16), y, vx: (Math.random() < 0.5 ? -1 : 1) * 40, vy: 40, t: 0 }); }

      /* ---------- 보스 ---------- */
      function spawnBoss() {
        const def = stageOf(stage).boss, hp = Math.round((300 + stage * 110) * ({ easy: 0.8, normal: 1, hard: 1.15 }[level] || 1) * (P.length > 1 ? 1.4 : 1));
        boss = { x: W / 2, y: -def.hh - 30, hp, max: hp, t: 0, flash: 0, pat: 0, patT: 3.6, rest: 1.2, acc: {}, ang: 0, ox: 0 };
        say('보스 · ' + def.name, 2.4, '#FF9A3D');
      }
      function bossGuns() { const def = stageOf(stage).boss; return def.guns.map(([gx, gy]) => [boss.x + gx, boss.y + gy]); }
      function runPattern(name, dt, rate) {
        const s = stage, sp = bspeed(), A = boss.acc, guns = bossGuns(), ctr = [boss.x, boss.y + stageOf(stage).boss.hh * 0.4];
        const every = (key, sec, fn) => { A[key] = (A[key] || 0) - dt * rate; if (A[key] <= 0) { A[key] += sec; fn(); } };
        const t = boss.t;
        if (name === 'aimed') every('aimed', 0.75, () => { A.gi = ((A.gi || 0) + 1) % guns.length; const g = guns[A.gi]; aimed(g[0], g[1], sp * 1.1, 3 + (s >= 5 ? 2 : 0), 0.17); });
        else if (name === 'fan') every('fan', 0.95, () => { const n = 7 + Math.floor(s / 2), mid = Math.PI / 2 + Math.sin(t * 1.3) * 0.45, arc = 1.5; for (let i = 0; i < n; i++) shoot(ctr[0], ctr[1], mid - arc / 2 + (arc * i) / (n - 1), sp, 0); });
        else if (name === 'ring') every('ring', 1.35, () => { const n = 14 + s * 2; A.ro = (A.ro || 0) + 0.21; for (let i = 0; i < n; i++) shoot(ctr[0], ctr[1], A.ro + (i / n) * Math.PI * 2, sp * 0.85, i % 2 ? 0 : 1); });
        else if (name === 'spiral') every('spiral', 0.08, () => { const arms = 2 + Math.floor(s / 4); A.sa = (A.sa || 0) + 0.23; for (let i = 0; i < arms; i++) shoot(ctr[0], ctr[1], A.sa + (i / arms) * Math.PI * 2, sp * 0.8, 2); });
        else if (name === 'rain') every('rain', 0.06, () => { const def = stageOf(stage).boss; shoot(boss.x + (Math.random() * 2 - 1) * def.hw, boss.y + def.hh * 0.3, Math.PI / 2 + (Math.random() - 0.5) * 0.5, sp * (0.65 + Math.random() * 0.35), 0); });
        else if (name === 'wall') every('wall', 1.15, () => { const n = 16, gap = 3 + Math.floor(Math.random() * (n - 6)); for (let i = 0; i < n; i++) { if (i >= gap && i < gap + 3) continue; shoot(ctr[0], ctr[1], Math.PI / 2 + (i - (n - 1) / 2) * 0.085, sp * 0.9, 2); } });
        else if (name === 'burst') every('burst', 1.45, () => { aimed(ctr[0], ctr[1], sp * 0.75, 5, 0.32, 1); const n = 10, o = Math.random(); for (let i = 0; i < n; i++) shoot(ctr[0], ctr[1], o + (i / n) * Math.PI * 2, sp * 0.95, 0); });
      }
      function stepBoss(dt) {
        const def = stageOf(stage).boss, b = boss; b.t += dt; if (b.flash > 0) b.flash -= dt;
        const ty = 70 + def.hh * 0.85;
        if (b.t < 2.6) { b.y += (ty - b.y) * Math.min(1, dt * 2.2); return; }
        b.x = W / 2 + Math.sin((b.t - 2.6) * 0.5) * Math.max(0, W / 2 - def.hw - 8) * 0.9;
        b.y = ty + Math.sin(b.t * 0.9) * 12;
        const ph2 = b.hp < b.max * 0.5, rate = ph2 ? 1.25 : 1;
        if (b.rest > 0) { b.rest -= dt; return; }
        const pats = def.pats;
        runPattern(pats[b.pat % pats.length], dt, rate);
        if (ph2 && stage >= 6) runPattern(pats[(b.pat + 2) % pats.length] === 'spiral' ? 'aimed' : pats[(b.pat + 2) % pats.length], dt, 0.5);
        b.patT -= dt;
        if (b.patT <= 0) { b.pat++; b.patT = 3.6; b.rest = ph2 ? 0.4 : 0.9; b.acc = {}; }
      }
      function hurtBoss(dmg, owner) {
        if (!boss || boss.t < 2.6 || boss.hp <= 0) return;
        boss.hp -= dmg; boss.flash = 0.05;
        const p = P[owner]; if (p) p.score += 10;
        if (boss.hp <= 0) {
          boss.hp = 0; phase = 'bossdie'; phaseT = 2.2; B = [];
          P.forEach(q => { q.score += 3000 * stage; });
          for (let i = 0; i < 8; i++) setTimeoutBoom(i * 0.22);
          status();
        }
      }
      const pendingBooms = [];
      function setTimeoutBoom(at) { pendingBooms.push(at); }

      /* ---------- 폭탄 ---------- */
      function doBomb(p) {
        if (!p.alive || p.bombs <= 0 || phase === 'idle' || phase === 'over' || phase === 'clear') return;
        p.bombs--; p.inv = Math.max(p.inv, 2.2); bombClear = 1.4; B = [];
        BOMBFX.push({ x: p.x, y: p.y, t: 0 }); if (net && net.host) snapBm.push([p.x | 0, p.y | 0]);
        E.slice().forEach(e => { if (e.y > -10 && e.y < H + 10 && !e.dead) hurtEnemy(e, 30, p.slot); });
        hurtBoss(70, p.slot);
      }

      /* ---------- 한 칸 진행 (방장·혼자) ---------- */
      function movePlayer(p, dt) {
        if (!p.alive) return;
        if (p.local) {
          let dx = (ctl(p, 'right') ? 1 : 0) - (ctl(p, 'left') ? 1 : 0), dy = (ctl(p, 'down') ? 1 : 0) - (ctl(p, 'up') ? 1 : 0);
          if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
          p.x = clamp(p.x + dx * 270 * dt, 14, W - 14); p.y = clamp(p.y + dy * 270 * dt, 30, H - 22);
        } else if (p.tx != null) { const k = Math.min(1, dt * 18); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
      }
      function fire(p, dt, list, real) {
        if (!p.alive) return;
        p.cd -= dt; if (p.cd > 0) return; p.cd = 0.09;
        const x = p.x, y = p.y - 14, v = -900, add = (dx, ang) => list.push({ x: x + dx, y, vx: Math.sin(ang || 0) * -v, vy: Math.cos(ang || 0) * v, o: p.slot, real });
        const pw = p.power;
        if (pw <= 1) { add(-5); add(5); }
        else if (pw === 2) { add(-8); add(0); add(8); }
        else if (pw === 3) { add(-12); add(-4); add(4); add(12); add(-10, -0.14); add(10, 0.14); }
        else { add(-14); add(-5); add(5); add(14); add(-10, -0.12); add(10, 0.12); add(-16, -0.26); add(16, 0.26); }
      }
      function step(dt) {
        gameT += dt;
        scroll += SCROLL * dt; if (bombClear > 0) { bombClear -= dt; B = []; }
        P.forEach(p => {
          if (p.inv > 0) p.inv -= dt;
          if (!p.alive && !p.out) { p.rsp -= dt; if (p.rsp <= 0) respawn(p); }
          movePlayer(p, dt);
          if (phase === 'play' || phase === 'warning' || phase === 'boss') fire(p, dt, SHOT, true);
        });
        if (phase === 'intro') { phaseT -= dt; if (phaseT <= 0) { phase = 'play'; st = 0; waveT = 1; status(); } }
        else if (phase === 'play') {
          st += dt; sinceP += dt; waveT -= dt;
          if (waveT <= 0) { spawnWave(); waveT = Math.max(0.9, 1.7 - stage * 0.07) + Math.random() * 0.5; }
          if (st >= waveLen()) { phase = 'warning'; phaseT = 2.8; say('WARNING!! 보스가 다가와요', 2.8, '#FF5A5F'); status(); }
        } else if (phase === 'warning') { phaseT -= dt; if (phaseT <= 0) { spawnBoss(); phase = 'boss'; status(); } }
        else if (phase === 'boss') stepBoss(dt);
        else if (phase === 'bossdie') {
          phaseT -= dt;
          for (let i = pendingBooms.length - 1; i >= 0; i--) { pendingBooms[i] -= dt; if (pendingBooms[i] <= 0) { pendingBooms.splice(i, 1); const def = stageOf(stage).boss; boom(boss.x + (Math.random() * 2 - 1) * def.hw * 0.8, boss.y + (Math.random() * 2 - 1) * def.hh * 0.8, 3); } }
          if (phaseT <= 0) { boom(boss.x, boss.y, 6); boss = null; stageClear(); }
        } else if (phase === 'clear') {
          phaseT -= dt;
          if (phaseT <= 0) { if (stage >= maxStage()) return finish(true); stage++; startStage(); }
        }
        // 적
        E.forEach(e => stepEnemy(e, dt));
        E = E.filter(e => !e.dead && !gone(e));
        // 적 총알
        B.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
        B = B.filter(b => b.x > -20 && b.x < W + 20 && b.y > -30 && b.y < H + 20);
        // 내 총알
        SHOT.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; });
        const def = boss ? stageOf(stage).boss : null;
        SHOT = SHOT.filter(s => {
          if (s.y < -20 || s.x < -20 || s.x > W + 20) return false;
          for (const e of E) { if (!e.dead && Math.abs(s.x - e.x) < e.r + 3 && Math.abs(s.y - e.y) < e.r + 8) { hurtEnemy(e, 1, s.o); spark(s.x, s.y); return false; } }
          if (boss && boss.hp > 0 && Math.abs(s.x - boss.x) < def.hw * 0.9 && Math.abs(s.y - boss.y) < def.hh * 0.8) { if (boss.t >= 2.6) { hurtBoss(1, s.o); spark(s.x, s.y); } return false; }
          return true;
        });
        // 비행기가 맞았는지 (온라인 손님 비행기는 손님 기기가 판단)
        P.forEach(p => { if (p.local && p.alive && p.inv <= 0 && hitCheck(p)) killPlayer(p); });
        // 아이템
        IT.forEach(it => {
          it.t += dt; it.x += it.vx * dt; it.y += (it.t < 4 ? 20 : 70) * dt;
          if (it.t < 4) it.y -= Math.sin(it.t * 2) * 15 * dt;
          if (it.x < 14 || it.x > W - 14) it.vx = -it.vx;
          P.forEach(p => { if (!it.got && p.alive && (p.x - it.x) ** 2 + (p.y - it.y) ** 2 < 26 * 26) { it.got = true; pickup(p, it); } });
        });
        IT = IT.filter(it => !it.got && it.y < H + 20);
        stepFx(dt);
        // 끝났는지
        if (!over && P.length && P.every(p => p.out)) { over = true; overT = 2; }
        if (over) { overT -= dt; if (overT <= 0 && phase !== 'over') finish(false); }
      }
      function pickup(p, it) {
        if (it.k === 'P') { if (p.power < 4) p.power++; else p.score += 1000; }
        else if (it.k === 'B') { if (p.bombs < 6) p.bombs++; else p.score += 1000; }
        else p.score += 500;
        FX.push({ txt: it.k === 'star' ? '+500' : it.k === 'P' ? 'POWER UP' : 'BOMB +1', x: it.x, y: it.y, vx: 0, vy: -30, life: 0.8, max: 0.8 });
      }
      function hitCheck(p) {
        for (const b of B) { const rr = BUL_R[b.k] * 0.8 + 3; if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < rr * rr) { b.hit = true; return true; } }
        for (const e of E) { if (!e.dead && e.type !== 'ground' && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r * 0.7 + 5) ** 2) return true; }
        if (boss && boss.t >= 2.6 && boss.hp > 0) { const def = stageOf(stage).boss; if (def.type !== 'ship' && def.type !== 'tank' && Math.abs(p.x - boss.x) < def.hw * 0.6 && Math.abs(p.y - boss.y) < def.hh * 0.5) return true; }
        return false;
      }
      function stepFx(dt) {
        FX.forEach(f => { f.life -= dt; if (f.ring) f.r += f.vr * dt; else { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.vy *= 0.96; } });
        FX = FX.filter(f => f.life > 0);
        BOMBFX.forEach(b => { b.t += dt; }); BOMBFX = BOMBFX.filter(b => b.t < 1.3);
      }
      function stageClear() {
        cleared = Math.max(cleared, stage);
        E = []; B = []; phase = 'clear'; phaseT = 4;
        P.forEach(p => { if (!p.out) p.score += 1000 * stage; });
        // 둘이서: 목숨을 다 쓴 친구는 다음 스테이지에서 목숨 1개로 부활
        if (P.length > 1 && stage < maxStage()) P.forEach(p => { if (p.out && !p.left) { p.out = false; p.lives = 1; p.rsp = 0.1; } });
        over = false;
        say(stage >= maxStage() ? 'ALL CLEAR!' : 'STAGE ' + stage + ' CLEAR!', 3.5, '#FFD23F');
        status();
      }
      function startStage() {
        phase = 'intro'; phaseT = 2.6; st = 0; sinceP = 8; sweeps = 0; E = []; B = []; IT = []; boss = null;
        const mul = (1 + (C().bulletStep == null ? 0.12 : C().bulletStep) * (stage - 1));
        say('STAGE ' + stage + ' · ' + stageOf(stage).name, 2.6, '#FFFFFF');
        msg.sub = stage > 1 ? '적 총알 속도 ×' + mul.toFixed(2) : '총알은 저절로 나가요 · 폭탄으로 위기 탈출!';
        status();
      }
      function status() {
        const nm = 'STAGE ' + stage + ' · ' + stageOf(stage).name;
        const t = phase === 'boss' || phase === 'warning' ? nm + ' · 보스!' : phase === 'clear' ? nm + ' 클리어!' : phase === 'over' ? '게임 끝' : nm;
        hooks.onTurn({ text: t, side: -1 });
      }

      /* ---------- 끝 ---------- */
      function finish(win, why) {
        if (phase === 'over') return;
        phase = 'over'; clock.stop();
        if (win) cleared = maxStage();
        const me = P.find(p => p.mine) || P[0] || { score: 0 };
        const per = (C().points || {}).stage == null ? 1 : C().points.stage;
        const points = mode === 'local' ? 0 : Math.min(10, cleared * per);
        if (net && net.host) send({ k: 'end', win: win ? 1 : 0, sc: P.map(p => p.score), s: stage, cl: cleared, why: why || '' });
        const two = P.length > 1;
        const message = (win ? '스테이지 ' + maxStage() + '개를 모두 깼어요!' : '스테이지 ' + stage + '에서 끝났어요') + ' · ' + (two ? P.map(p => p.name + ' ' + p.score.toLocaleString()).join(' / ') : '점수 ' + me.score.toLocaleString()) + (why ? ' · ' + why : '');
        hooks.onTurn({ text: win ? '모두 클리어!' : 'GAME OVER', side: -1 });
        hooks.onOver({ winner: win ? 0 : 1, win: mode === 'local' ? undefined : !!win, score: me.score, points, title: win ? '모두 클리어!' : 'GAME OVER', message, duration_sec: clock.sec(), extra: { stage, cleared, players: P.length, scores: P.map(p => p.score) } });
        render();
      }

      /* ---------- 온라인 ---------- */
      function send(m) { if (online() && hooks.onMove) hooks.onMove(m); }
      const TYPES = ['line', 'vee', 'sweep', 'dive', 'bomber', 'ground', 'big'];
      const IK = ['P', 'B', 'star'];
      function hostSnap() {
        const b = []; B.forEach(q => b.push(q.x | 0, q.y | 0, q.vx | 0, q.vy | 0, q.k));
        send({
          k: 'st', ph: phase, s: stage, tt: Math.round(st * 10) / 10, cl: cleared,
          p: P.map(p => [p.x | 0, p.y | 0, p.alive ? 1 : 0, p.lives, p.bombs, p.power, p.score, p.inv > 0 ? 1 : 0, p.out ? 1 : 0, p.dc]),
          e: E.map(e => [e.id, TYPES.indexOf(e.type), e.x | 0, e.y | 0, (e.vx_ || 0) | 0, (e.vy_ || 0) | 0, e.flash > 0 ? 1 : 0, e.red ? 1 : 0, e.water ? 1 : 0, Math.round((e.aim || 0) * 100)]),
          b, i: IT.map(it => [it.id, IK.indexOf(it.k), it.x | 0, it.y | 0]),
          bo: boss ? [boss.x | 0, boss.y | 0, Math.max(0, Math.round(boss.hp)), boss.max, boss.flash > 0 ? 1 : 0, Math.round(boss.t * 10) / 10] : 0,
          fx: snapFx, bm: snapBm, m: msg && msg.until > gameT ? [msg.text, Math.round((msg.until - gameT) * 10) / 10, msg.color, msg.sub || ''] : 0
        });
        snapFx = []; snapBm = [];
      }
      // 손님: 방장이 보낸 상태를 받아서 그림
      function applySnap(m) {
        const n = net;
        if (m.s !== stage) { stage = m.s; scroll = 0; }
        if (m.ph !== phase) { phase = m.ph; status(); }
        st = m.tt; cleared = m.cl;
        m.p.forEach((a, i) => {
          const p = P[i]; if (!p) return;
          p.lives = a[3]; p.power = a[5]; p.score = a[6]; p.out = !!a[8];
          if (!p.mine) { p.tx = a[0]; p.ty = a[1]; if (!p.alive && a[2]) { p.x = a[0]; p.y = a[1]; } p.alive = !!a[2]; p.inv = a[7] ? 1 : 0; p.bombs = a[4]; return; }
          // 내 비행기: 자리는 내가 정하고, 살아 있는지·목숨만 방장 기준
          if (!n.bombPend || performance.now() - n.bombPend > 800) p.bombs = a[4];
          if (a[9] !== p.dc) { p.dc = a[9]; p.alive = false; p.pend = 0; }
          else if (p.pend && !a[2]) { p.pend = 0; }
          else if (p.pend && performance.now() - p.pend > 1500) { p.pend = 0; p.alive = true; }   // 방장이 안 맞았다고 함 → 계속
          if (!p.alive && !p.pend && a[2]) { p.alive = true; p.x = spawnX(p.slot); p.y = H - 70; p.inv = 2.5; }
        });
        const seen = new Set();
        m.e.forEach(a => {
          seen.add(a[0]);
          let e = n.E.get(a[0]);
          if (!e) { e = { id: a[0], x: a[2], y: a[3], flash: 0 }; n.E.set(a[0], e); }
          e.type = TYPES[a[1]]; e.tx = a[2]; e.ty = a[3]; e.vx = a[4]; e.vy = a[5]; e.flash = a[6] ? 0.06 : e.flash; e.red = !!a[7]; e.water = !!a[8]; e.aim = a[9] / 100; e.r = R[e.type]; e.age = 0;
        });
        n.E.forEach((e, id) => { if (!seen.has(id)) n.E.delete(id); });
        E = Array.from(n.E.values());
        B = []; for (let i = 0; i + 4 < m.b.length + 1; i += 5) B.push({ x: m.b[i], y: m.b[i + 1], vx: m.b[i + 2], vy: m.b[i + 3], k: m.b[i + 4] });
        IT = m.i.map(a => ({ id: a[0], k: IK[a[1]], x: a[2], y: a[3] }));
        if (m.bo) {
          if (!boss) boss = { x: m.bo[0], y: m.bo[1], flash: 0 };
          boss.tx = m.bo[0]; boss.ty = m.bo[1]; boss.hp = m.bo[2]; boss.max = m.bo[3]; if (m.bo[4]) boss.flash = 0.05; boss.t = m.bo[5];
        } else if (boss && phase !== 'bossdie') boss = null;
        m.fx.forEach(([x, y, s]) => boom(x, y, s, true));
        m.bm.forEach(([x, y]) => BOMBFX.push({ x, y, t: 0 }));
        if (m.m) { msg = { text: m.m[0], until: gameT + m.m[1], color: m.m[2], sub: m.m[3] || undefined }; }
      }
      function clientStep(dt) {
        gameT += dt; scroll += SCROLL * dt;
        const me = P.find(p => p.mine);
        if (me) {
          if (me.inv > 0) me.inv -= dt;
          movePlayer(me, dt);
          if (me.alive && !me.pend && me.inv <= 0 && phase !== 'clear' && phase !== 'intro' && hitCheck(me)) { me.pend = performance.now(); me.alive = false; me.inv = 2.5; send({ k: 'hit' }); boom(me.x, me.y, 3, true); }
          if (performance.now() - net.lastPos > POS_MS && me.alive) { net.lastPos = performance.now(); send({ k: 'pos', x: Math.round(me.x), y: Math.round(me.y) }); }
        }
        P.forEach(p => { if (!p.mine && p.tx != null) { const k = Math.min(1, dt * 12); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; } });
        // 적: 받은 자리에서 속도대로 조금씩 앞으로 + 부드럽게
        E.forEach(e => { e.age += dt; const tx = e.tx + e.vx * Math.min(0.25, e.age), ty = e.ty + e.vy * Math.min(0.25, e.age), k = Math.min(1, dt * 14); e.x += (tx - e.x) * k; e.y += (ty - e.y) * k; if (e.flash > 0) e.flash -= dt; });
        if (boss && boss.tx != null) { const k = Math.min(1, dt * 10); boss.x += (boss.tx - boss.x) * k; boss.y += (boss.ty - boss.y) * k; if (boss.flash > 0) boss.flash -= dt; }
        B.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; }); B = B.filter(b => !b.hit);
        IT.forEach(it => { it.y += 30 * dt; });
        // 보이기만 하는 총알 (실제 맞히기는 방장이 계산)
        if (phase === 'play' || phase === 'warning' || phase === 'boss') P.forEach(p => fire(p, dt, SHOT, false));
        SHOT.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; });
        const def = boss ? stageOf(stage).boss : null;
        SHOT = SHOT.filter(s => {
          if (s.y < -20) return false;
          for (const e of E) if (Math.abs(s.x - e.x) < (e.r || 10) + 3 && Math.abs(s.y - e.y) < (e.r || 10) + 8) { spark(s.x, s.y); return false; }
          if (boss && Math.abs(s.x - boss.x) < def.hw * 0.9 && Math.abs(s.y - boss.y) < def.hh * 0.8) { spark(s.x, s.y); return false; }
          return true;
        });
        stepFx(dt);
      }

      /* ---------- 화면 ---------- */
      function render() {
        const t = gameT;
        ctx.save();
        drawBg(ctx, stage, scroll);
        const water = !!stageOf(stage).water;
        E.forEach(e => { if (e.type === 'ground') drawGround(ctx, e, e.water != null ? e.water : water, t); });
        if (boss && (stageOf(stage).boss.type === 'ship' || stageOf(stage).boss.type === 'tank')) drawBossNow();
        IT.forEach(it => drawItem(ctx, it, t));
        E.forEach(e => { if (e.type !== 'ground') drawEnemy(ctx, e); });
        if (boss && !(stageOf(stage).boss.type === 'ship' || stageOf(stage).boss.type === 'tank')) drawBossNow();
        // 내 총알
        SHOT.forEach(s => { ctx.fillStyle = s.o ? '#9FD8FF' : '#FFE48A'; ctx.fillRect(Math.round(s.x - 2), Math.round(s.y - 8), 4, 14); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(s.x - 1), Math.round(s.y - 7), 2, 6); });
        // 비행기
        P.forEach(p => {
          if (!p.alive) return;
          drawPlane(ctx, p.slot, p.x, p.y, p.inv > 0, t);
          if (P.length > 1 || online()) S.text(ctx, p.slot ? '2P' : '1P', p.x, p.y + 26, 11, p.slot ? '#9FD8FF' : '#FFB0B0');
          if (p.mine || p.local) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
        });
        // 적 총알 (맨 위에 보이게)
        B.forEach(b => { const im = bulletImg(b.k); ctx.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2)); });
        // 효과
        FX.forEach(f => {
          const a = Math.max(0, f.life / f.max);
          if (f.txt) { ctx.globalAlpha = a; S.text(ctx, f.txt, f.x, f.y, 12, '#FFE48A'); ctx.globalAlpha = 1; return; }
          if (f.ring) { ctx.globalAlpha = a; ctx.strokeStyle = '#FFE48A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return; }
          ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = f.c; ctx.fillRect(Math.round(f.x - f.s / 2), Math.round(f.y - f.s / 2), Math.ceil(f.s), Math.ceil(f.s)); ctx.globalAlpha = 1;
        });
        BOMBFX.forEach(b => {
          const k = b.t / 1.3;
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.5 - k) })`; ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = `rgba(255,210,63,${1 - k})`; ctx.lineWidth = 10 * (1 - k) + 2;
          [1, 0.7, 0.4].forEach(m => { ctx.beginPath(); ctx.arc(b.x, b.y, k * 520 * m, 0, Math.PI * 2); ctx.stroke(); });
        });
        drawHud(t);
        ctx.restore();
      }
      function drawBossNow() {
        const def = stageOf(stage).boss, tg = target(boss.x, boss.y), ang = Math.atan2(tg.y - boss.y, tg.x - boss.x);
        drawBoss(ctx, boss, def, gameT, ang);
      }
      function drawHud(t) {
        ctx.fillStyle = 'rgba(11,14,34,.55)'; ctx.fillRect(0, 0, W, 26);
        const p0 = P[0], p1 = P[1];
        if (p0) S.text(ctx, '1P ' + fmtScore(p0.score), 8, 13, 13, '#FFB0B0', 'left');
        if (p1) S.text(ctx, '2P ' + fmtScore(p1.score), W - 8, 13, 13, '#9FD8FF', 'right');
        S.text(ctx, 'STAGE ' + stage, W / 2, 13, 13, '#FFE48A');
        // 보스 체력
        if (boss && boss.max) {
          const def = stageOf(stage).boss;
          S.bar(ctx, 60, 36, W - 120, 8, boss.hp / boss.max, boss.hp < boss.max * 0.5 ? '#FF5A5F' : '#FF9A3D');
          S.text(ctx, def.name, W / 2, 56, 12, '#FFFFFF');
        }
        // 아래: 목숨 · 폭탄 · 파워
        P.forEach((p, i) => {
          const right = i === 1, x0 = right ? W - 10 : 10, dir = right ? -1 : 1, y = H - 16;
          ctx.save(); ctx.globalAlpha = 0.9;
          for (let k = 0; k < Math.min(6, p.lives); k++) { const im = spr('p' + p.slot); ctx.drawImage(im, x0 + dir * (k * 15) - (right ? 13 : 0), y - 8, 13, 15); }
          for (let k = 0; k < Math.min(6, p.bombs); k++) { const bx = x0 + dir * (k * 15) - (right ? 12 : 0); ctx.fillStyle = '#1D2340'; ctx.fillRect(bx, y - 28, 12, 12); ctx.fillStyle = '#3DDC84'; ctx.fillRect(bx + 1, y - 27, 10, 10); ctx.fillStyle = '#fff'; ctx.font = '700 9px Galmuri11, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', bx + 6, y - 21); }
          S.text(ctx, 'P' + '▮'.repeat(p.power) + '▯'.repeat(4 - p.power), x0 + dir * 2, y - 42, 11, '#FFB070', right ? 'right' : 'left');
          if (p.out) S.text(ctx, p.left ? '나감' : 'GAME OVER', x0 + dir * 40, y - 60, 12, '#FF8A8A', right ? 'right' : 'left');
          ctx.restore();
        });
        if (touch && phase !== 'idle' && phase !== 'over') {
          const me = P.find(p => p.mine);
          ctx.save(); ctx.globalAlpha = me && me.bombs > 0 ? 0.75 : 0.35; ctx.fillStyle = '#1A1F3D'; ctx.beginPath(); ctx.arc(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#3DDC84'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
          S.text(ctx, '폭탄', BOMB_BTN.x, BOMB_BTN.y, 15, '#FFFFFF');
        }
        if (msg && msg.until > gameT) {
          const blink = msg.text.startsWith('WARNING') ? Math.floor(t * 4) % 2 === 0 : true;
          if (blink) {
            ctx.fillStyle = 'rgba(11,14,34,.55)'; ctx.fillRect(0, H / 2 - 50, W, msg.sub ? 92 : 70);
            S.text(ctx, msg.text, W / 2, H / 2 - 16, 24, msg.color);
            if (msg.sub) S.text(ctx, msg.sub, W / 2, H / 2 + 20, 14, '#FFE48A');
          }
        }
        if (phase === 'paused') {
          ctx.fillStyle = 'rgba(11,14,34,.6)'; ctx.fillRect(0, 0, W, H);
          S.text(ctx, '일시정지', W / 2, H / 2 - 10, 28, '#FFFFFF');
          S.text(ctx, touch ? '화면을 누르면 계속' : 'P 키 또는 화면을 누르면 계속', W / 2, H / 2 + 26, 14, '#FFE48A');
        }
        if (phase === 'intro' && stage === 1 && P.length && !online() && !touch) S.text(ctx, P.length > 1 ? '1P: W A S D · G 폭탄   |   2P: 방향키 · 엔터 폭탄' : '이동: 방향키 또는 W A S D · 폭탄: 스페이스', W / 2, H - 120, 13, '#FFFFFF');
        if (phase === 'intro' && stage === 1 && touch) S.text(ctx, '화면을 끌어서 이동 · 오른쪽 아래 폭탄', W / 2, H - 120, 14, '#FFFFFF');
      }

      function loop(ts) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
        if (phase !== 'idle' && phase !== 'over' && phase !== 'paused') {
          if (isHost()) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; } if (n >= 6) acc = 0; }
          else clientStep(dt);
          if (net && net.host && phase !== 'over' && ts - net.lastSnap >= SNAP_MS) { net.lastSnap = ts; hostSnap(); }
        } else if (phase === 'idle') { scroll += SCROLL * dt * 0.5; gameT += dt; }
        render();
      }
      function togglePause() {
        if (online()) return;
        if (phase === 'paused') { phase = pausedFrom; clock.start(); }
        else if (phase !== 'idle' && phase !== 'over') { pausedFrom = phase; phase = 'paused'; clock.stop(); }
      }
      const vis = () => { if (document.hidden && !online() && phase !== 'idle' && phase !== 'over' && phase !== 'paused') togglePause(); };
      document.addEventListener('visibilitychange', vis);
      raf = requestAnimationFrame(loop);
      // 자동 검사용 (검사 도구가 window.__GOGO_QA 를 켰을 때만)
      if (window.__GOGO_QA) window.__GOGO_QA.sky = {
        get: () => ({ phase, stage, st, cleared, boss: boss && { hp: boss.hp, max: boss.max, t: boss.t }, P: P.map(p => ({ x: p.x, y: p.y, alive: p.alive, lives: p.lives, bombs: p.bombs, power: p.power, score: p.score, out: p.out })), E: E.length, B: B.length, IT: IT.length }),
        toBoss() { if (phase === 'play' || phase === 'intro') { phase = 'play'; st = waveLen(); } },
        killBoss() { if (boss) hurtBoss(boss.hp + 1, 0); },
        god(on) { P.forEach(p => { p.inv = on ? 9999 : 0; }); },
        stage(n) { stage = n; startStage(); },
        power(n) { P.forEach(p => { p.power = n; }); }
      };

      return {
        get state() { return phase === 'over' ? 'over' : phase === 'idle' ? 'ready' : 'playing'; },
        start(o) {
          o = o || {}; mode = o.mode || 'ai'; level = mode === 'ai' ? (o.level || 'normal') : 'normal';
          net = null; P = []; E = []; B = []; SHOT = []; IT = []; FX = []; BOMBFX = []; boss = null; msg = null;
          stage = 1; cleared = 0; scroll = 0; nextId = 1; bombClear = 0; over = false; gameT = 0; acc = 0; pendingBooms.length = 0;
          const meName = S.myName();
          if (mode === 'online') {
            const roster = o.roster || [];
            net = { host: !!o.host, lastSnap: 0, lastPos: 0, E: new Map(), bombPend: 0 };
            for (let i = 0; i < 2; i++) {
              const r = roster[i]; if (!r) continue;
              const mine = i === o.me;
              const p = mkPlayer(i, mine ? meName : r.nick, mine ? [0, 1] : [], mine, mine);
              p.netId = r.id; P.push(p);
            }
          } else if (mode === 'local') {
            P.push(mkPlayer(0, '1P', [0], true, true));
            P.push(mkPlayer(1, '2P', [1], false, true));
          } else P.push(mkPlayer(0, meName, [0, 1], true, true));
          P.forEach(p => { p.x = spawnX(p.slot); });
          startStage();
          clock.reset(); clock.start(); hooks.onState('playing');
          hooks.onButtons(online() ? [] : [{ id: 'pause', label: '일시정지 / 계속' }]);
        },
        remote(m) {
          if (!m || !net) return;
          if (m.left && !m.k) {
            if (!net.host) { if (m.wasHost) finish(false, '방장이 나가서 끝났어요'); return; }
            const p = P.find(q => q.netId === m.left) || P.find(q => !q.mine);
            if (p) { p.out = true; p.left = true; p.alive = false; p.lives = 0; }
            return;
          }
          if (net.host) {
            const p = P.find(q => !q.mine); if (!p) return;
            if (m.k === 'pos') { p.tx = m.x; p.ty = m.y; if (!p.alive) { p.x = m.x; p.y = m.y; } }
            else if (m.k === 'hit') { if (p.alive) { p.inv = 0; killPlayer(p); } }
            else if (m.k === 'act' && m.a === 'bomb') doBomb(p);
            else if (m.k === 'quit') { p.out = true; p.left = true; p.alive = false; p.lives = 0; }
          } else {
            if (m.k === 'st') applySnap(m);
            else if (m.k === 'end') { P.forEach((p, i) => { if (m.sc && m.sc[i] != null) p.score = m.sc[i]; }); stage = m.s; cleared = m.cl; finish(!!m.win, m.why); }
          }
        },
        press(id) {
          if (id === 'pause') return togglePause();
          if (id === 'resign' && phase !== 'over' && phase !== 'idle') {
            if (online() && !net.host) { send({ k: 'quit' }); finish(false, '그만했어요'); return; }
            finish(false, '그만했어요');
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
