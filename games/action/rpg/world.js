/*
 * gogo?gogo! — skillcom RPG · 세계 그리기 (지도 만들기 · 지도/건물/몬스터/아바타+장비 그림)
 *   game.js 가 window.__GoRPGParts 로 가져다 씀
 *
 *  화면: 960 × 540 캔버스 (칸 32px) + 아래 메뉴 버튼 + 창(가방·마법·가게…) + 랭킹(레벨)
 *  캐릭터: 사이트 아바타 그대로 (GoAvatar). 장비는 아바타 위에 겹쳐 그림 → 가방 창 '장비 안보이기' 를 켜면
 *          그림만 숨기고 능력치는 그대로
 *  세계: data.js 의 MAPS (마을 9 + 사냥터 90, 왼쪽 끝 = 이전 지도, 오른쪽 끝 = 다음 지도)
 *  저장: 이 기기(localStorage) + 로그인하면 서버(game_saves 표 · supabase/rpg_v40.sql)
 *        둘 중 더 최근 것을 불러옴. 서버 표가 아직 없으면 이 기기에만 저장
 *  조작: WASD/방향키 이동 · Space/J 공격 · 1~4 마법 · Q/E 포션 · I 가방 · K 마법 · F/Enter 들어가기 · Esc 닫기
 *        휴대폰: 왼쪽 조이스틱, 오른쪽 공격·마법·포션 버튼 (캔버스 위에 그림)
 */
(function () {
  'use strict';
  const D = window.GoRPGData, AV = window.GoAvatar, Hub = window.GameHub, BGM = window.GoBGM;
  const CFG = window.GoSettings.get('rpg');
  const W = 960, H = 540, TS = 32;
  const SAVE_V = 1, GAME = 'rpg';
  const MAPBY = {}; D.MAPS.forEach(m => { MAPBY[m.id] = m; });

  /* ================= 작은 도구 ================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fmtN = n => Math.round(n).toLocaleString('ko-KR');
  function seeded(seed) {
    let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };

  /* ================= 지도 만들기 =================
   * 칸 값: 0 땅 · 1 길 · 2 장애물(큰) · 3 장애물(작은) · 4 물 · 5 꽃(지나갈 수 있음) · 6 건물 · 7 문 · 8 분수 */
  const SOLID = { 2: 1, 3: 1, 4: 1, 6: 1, 8: 1 };
  const mapCache = {};
  function getMap(id) {
    if (mapCache[id]) return mapCache[id];
    const M = MAPBY[id], R = D.REGIONS[M.region], rnd = seeded('gogo-rpg-' + id);
    const w = M.kind === 'village' ? 36 : 50, h = M.kind === 'village' ? 24 : 34;
    const t = new Uint8Array(w * h), at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 2 : t[y * w + x]), set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) t[y * w + x] = v; };
    const mid = M.kind === 'village' ? 9 : Math.floor(h / 2);
    const map = { id, M, R, w, h, t, at, set, mid, buildings: [], doors: [], spawns: [] };
    // 테두리
    for (let x = 0; x < w; x++) { set(x, 0, 2); set(x, h - 1, 2); }
    for (let y = 0; y < h; y++) { set(0, y, 2); set(w - 1, y, 2); }
    if (M.kind === 'village') {
      for (let x = 0; x < w; x++) { set(x, mid, 1); set(x, mid + 1, 1); }
      const bs = D.BUILDINGS.map(b => Object.assign({}, b));
      if (R.castle) bs.push(Object.assign({}, D.CASTLE));
      bs.forEach(b => {
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) set(x, y, 6);
        b.door = { x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 };
        set(b.door.x, b.door.y, 7);
        map.buildings.push(b); map.doors.push(b);
      });
      // 문 → 큰길
      bs.forEach(b => {
        if (b.door.y < mid) { for (let y = b.door.y + 1; y < mid; y++) set(b.door.x, y, 1); }
        else {      // 큰길 아래 건물(성): 양옆으로 내려가 문 앞까지 길
          const yb = b.door.y + 1;
          for (let y = mid + 2; y <= yb; y++) { set(b.x - 2, y, 1); set(b.x + b.w + 1, y, 1); }
          for (let x = b.x - 2; x <= b.x + b.w + 1; x++) set(x, yb, 1);
        }
      });
      if (!R.castle) { set(17, 14, 8); set(18, 14, 8); set(17, 15, 8); set(18, 15, 8); for (let x = 15; x <= 20; x++) { set(x, 13, 1); set(x, 16, 1); } for (let y = 13; y <= 16; y++) { set(15, y, 1); set(20, y, 1); } for (let y = mid + 2; y < 13; y++) set(17, y, 1); }
      // 나무 몇 그루 · 꽃
      for (let i = 0; i < 70; i++) { const x = 1 + Math.floor(rnd() * (w - 2)), y = 1 + Math.floor(rnd() * (h - 2)); if (at(x, y) === 0 && Math.abs(y - mid) > 2 && !nearDoor(map, x, y)) set(x, y, rnd() < 0.35 ? 2 : 5); }
    } else {
      // 굽은 길 (왼쪽 → 오른쪽)
      let y = mid;
      for (let x = 0; x < w; x++) {
        for (let k = -1; k <= 1; k++) set(x, y + k, 1);
        if (x > 3 && x < w - 4 && rnd() < 0.35) y = clamp(y + (rnd() < 0.5 ? -1 : 1), 5, h - 6);
        if (x >= w - 6) y += Math.sign(mid - y);
      }
      // 연못
      const ponds = 2 + Math.floor(rnd() * 3);
      for (let p = 0; p < ponds; p++) {
        const cx = 6 + rnd() * (w - 12), cy = 4 + rnd() * (h - 8), rx = 2 + rnd() * 3, ry = 1.5 + rnd() * 2;
        for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
          if (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1 && at(xx, yy) === 0) set(xx, yy, 4);
        }
      }
      for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
        if (at(xx, yy) !== 0) continue;
        let nearPath = false; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) if (at(xx + j, yy + k) === 1) nearPath = true;
        if (nearPath || xx < 3 || xx > w - 4) { if (rnd() < 0.05) set(xx, yy, 5); continue; }
        const r = rnd();
        if (r < 0.085) set(xx, yy, 2); else if (r < 0.12) set(xx, yy, 3); else if (r < 0.18) set(xx, yy, 5);
      }
    }
    // 출구 (왼쪽 · 오른쪽)
    map.exitL = M.prev ? M.prev : null; map.exitR = M.next ? M.next : null;
    for (let k = -2; k <= 3; k++) {
      if (map.exitL) { set(0, mid + k, 1); set(1, mid + k, at(1, mid + k) === 2 || at(1, mid + k) === 3 ? 0 : at(1, mid + k)); }
      if (map.exitR) { set(w - 1, mid + k, 1); set(w - 2, mid + k, at(w - 2, mid + k) === 2 || at(w - 2, mid + k) === 3 ? 0 : at(w - 2, mid + k)); }
    }
    map.startL = { x: 2.5 * TS, y: (mid + 1) * TS };
    map.startR = { x: (w - 2.5) * TS, y: (mid + 1) * TS };
    // 갈 수 없는 빈칸은 막기 (몬스터가 갇히지 않게) + 몬스터가 나올 칸 목록
    const seen = new Uint8Array(w * h), q = [[2, mid]]; seen[mid * w + 2] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || SOLID[at(nx, ny)]) return; seen[ny * w + nx] = 1; q.push([nx, ny]); });
    }
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const v = at(xx, yy); if (SOLID[v]) continue;
      if (!seen[yy * w + xx]) { set(xx, yy, 3); continue; }
      if (M.kind === 'field' && xx > 6 && xx < w - 7 && v !== 7) map.spawns.push({ x: (xx + 0.5) * TS, y: (yy + 0.8) * TS });
    }
    map.ground = paintGround(map);
    mapCache[id] = map;
    // 그림이 큰 지도(사냥터 1장 ≈ 7MB)가 쌓이지 않게 최근 4개만 남김 (다시 들어가면 같은 모양으로 다시 만듦)
    const ids = Object.keys(mapCache); if (ids.length > 4) delete mapCache[ids[0]];
    return map;
  }
  function nearDoor(map, x, y) { return map.doors.some(b => Math.abs(b.door.x - x) <= 2 && y >= b.door.y && y <= b.door.y + 3); }
  const solidAt = (map, px, py) => !!SOLID[map.at(Math.floor(px / TS), Math.floor(py / TS))];

  /* ---------- 지도 그림 (v40 그래픽 강화) ----------
   *  땅(map.ground) 은 한 번만 그려 둠: 땅 무늬·풀·자갈·길 가장자리·물가 모래·그림자
   *  나무·바위·건물(map.objs) 은 따로 그림 조각으로 만들어 두고, 화면에서 캐릭터와 함께 '아래쪽이 앞'으로 그림
   *  → 나무 뒤로 걸어가면 나뭇잎이 캐릭터를 가림 */
  const mixC = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const r = (A >> 16) + ((B >> 16) - (A >> 16)) * t, g = ((A >> 8) & 255) + (((B >> 8) & 255) - ((A >> 8) & 255)) * t, bl = (A & 255) + ((B & 255) - (A & 255)) * t; return '#' + [r, g, bl].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); };
  function noise2(seed) {   // 부드러운 값 잡음 (칸 단위)
    const r = seeded(seed), G = {}; const v = (x, y) => { const k = x + ',' + y; if (G[k] == null) G[k] = r(); return G[k]; };
    return (x, y, s) => { const X = x / s, Y = y / s, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, sm = t => t * t * (3 - 2 * t);
      const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1); return (a + (b - a) * sm(fx)) * (1 - sm(fy)) + (c + (d - c) * sm(fx)) * sm(fy); };
  }
  function paintGround(map) {
    const { w, h, R, at } = map, [c, x] = mk(w * TS, h * TS), rnd = seeded('paint-' + map.id), nz = noise2('nz-' + map.id);
    const px = (X, Y, ww, hh, col) => { x.fillStyle = col; x.fillRect(X, Y, ww, hh); };
    const isPath = v => v === 1 || v === 7, G0 = R.ground[0], G1 = R.ground[1], dark = shade(G0, -0.18), light = shade(G0, 0.16);
    map.water = []; map.objs = []; map.glows = [];
    // 1) 땅: 큰 얼룩 무늬(잡음) + 8px 조각 무늬
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const gx = tx * 4 + i, gy = ty * 4 + j, n = nz(gx, gy, 6) * 0.7 + rnd() * 0.3;
        px(tx * TS + i * 8, ty * TS + j * 8, 8, 8, n < 0.35 ? shade(G1, -0.06) : n < 0.62 ? G1 : n < 0.85 ? G0 : light);
      }
    }
    // 2) 길: 가장자리 울퉁불퉁 + 테두리 그림자 + 자갈
    const P0 = R.path, Pd = shade(P0, -0.14), Pl = shade(P0, 0.12);
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const v = at(tx, ty); if (!isPath(v)) continue;
      const X = tx * TS, Y = ty * TS;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const n = nz(tx * 4 + i + 99, ty * 4 + j, 5); px(X + i * 8, Y + j * 8, 8, 8, n < 0.4 ? Pd : n < 0.8 ? P0 : Pl); }
      const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b2]) => isPath(at(tx + a, ty + b2)) || tx + a < 0 || tx + a >= w);
      // 이웃이 길이 아니면 그쪽 가장자리를 들쭉날쭉하게 + 어두운 선
      if (!nb[0]) { for (let i = 0; i < 32; i += 4) { const d = Math.floor(rnd() * 3) * 2; px(X + i, Y, 4, d, G1); } px(X, Y + 4, 32, 2, shade(P0, -0.22)); }
      if (!nb[2]) { for (let i = 0; i < 32; i += 4) { const d = Math.floor(rnd() * 3) * 2; px(X + i, Y + 32 - d, 4, d, G1); } px(X, Y + 26, 32, 2, shade(P0, -0.22)); }
      if (!nb[3]) { for (let i = 0; i < 32; i += 4) { const d = Math.floor(rnd() * 3) * 2; px(X, Y + i, d, 4, G1); } px(X + 4, Y, 2, 32, shade(P0, -0.22)); }
      if (!nb[1]) { for (let i = 0; i < 32; i += 4) { const d = Math.floor(rnd() * 3) * 2; px(X + 32 - d, Y + i, d, 4, G1); } px(X + 26, Y, 2, 32, shade(P0, -0.22)); }
      for (let k = 0; k < 3; k++) if (rnd() < 0.5) { const a = 6 + Math.floor(rnd() * 20), b2 = 6 + Math.floor(rnd() * 20); px(X + a, Y + b2, 4, 3, shade(P0, -0.3)); px(X + a, Y + b2, 2, 1, Pl); }
    }
    // 3) 물: 깊이에 따라 진하게 · 물가 모래 테두리 · 위쪽 물보라
    const W0 = R.water;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      if (at(tx, ty) !== 4) continue;
      let deep = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (at(tx + i, ty + j) === 4) deep++;
      const X = tx * TS, Y = ty * TS; px(X, Y, TS, TS, mixC(shade(W0, 0.15), shade(W0, -0.25), Math.min(1, deep / 25)));
      map.water.push([tx, ty]);
      const up = at(tx, ty - 1) !== 4, dn = at(tx, ty + 1) !== 4, lf = at(tx - 1, ty) !== 4, rt = at(tx + 1, ty) !== 4, sand = shade(R.path, 0.05);
      if (up) { px(X, Y, TS, 6, sand); px(X, Y + 6, TS, 3, shade(W0, 0.55)); }
      if (dn) { px(X, Y + 26, TS, 6, shade(W0, -0.35)); px(X, Y + 30, TS, 2, sand); }
      if (lf) { px(X, Y, 4, TS, sand); px(X + 4, Y, 2, TS, shade(W0, 0.45)); }
      if (rt) { px(X + 28, Y, 4, TS, sand); px(X + 26, Y, 2, TS, shade(W0, 0.45)); }
    }
    // 4) 풀·꽃·돌 장식
    const grassy = !/[#](E8|F3|D6|4A|5A)/.test(G0);
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const v = at(tx, ty), X = tx * TS, Y = ty * TS;
      if (v === 0) {
        for (let k = 0; k < 3; k++) if (rnd() < 0.55) {   // 풀잎 (V 모양)
          const a = 2 + Math.floor(rnd() * 26), b2 = 4 + Math.floor(rnd() * 24), col = rnd() < 0.5 ? dark : light;
          if (grassy) { px(X + a, Y + b2, 2, 4, col); px(X + a - 2, Y + b2 + 1, 2, 3, col); px(X + a + 2, Y + b2 + 1, 2, 3, col); }
          else { px(X + a, Y + b2, 3, 2, col); }
        }
      }
      if (v === 5) {   // 꽃 (꽃잎 4장 + 가운데)
        for (let k = 0; k < 3; k++) if (rnd() < 0.75) {
          const a = 4 + Math.floor(rnd() * 22), b2 = 4 + Math.floor(rnd() * 20), col = pick(R.deco);
          px(X + a + 2, Y + b2 + 6, 2, 5, shade(G0, -0.35)); px(X + a, Y + b2 + 2, 6, 2, col); px(X + a + 2, Y + b2, 2, 6, col); px(X + a + 2, Y + b2 + 2, 2, 2, '#FFE45C'); px(X + a + 4, Y + b2 + 9, 3, 2, shade(G0, -0.25));
        }
      }
    }
    // 5) 나무·바위 → 그림 조각 + 땅 그림자
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const v = at(tx, ty); if (v !== 2 && v !== 3) continue;
      const kind = v === 2 ? R.block : R.block2, vr = Math.floor(rnd() * 3), spr = blockSprite(kind, vr, R);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.beginPath(); x.ellipse(tx * TS + 16, ty * TS + 28, 15, 6, 0, 0, Math.PI * 2); x.fill();
      map.objs.push({ img: spr, x: tx * TS - 16, y: ty * TS - 40, sy: (ty + 1) * TS - 2, kind, tx, ty, alt: 'obj_r' + map.M.region + '_' + (v === 2 ? 1 : 2) });
      if (kind === 'crystal') map.glows.push({ x: tx * TS + 16, y: ty * TS + 6, r: 70, col: '#B08AFF' });
      if (kind === 'lavarock') map.glows.push({ x: tx * TS + 16, y: ty * TS + 18, r: 40, col: '#FF6A3D' });
    }
    if (R.water === '#FF5A2A') map.water.forEach(([tx, ty]) => { if ((tx + ty) % 3 === 0) map.glows.push({ x: tx * TS + 16, y: ty * TS + 16, r: 60, col: '#FF6A3D' }); });   // 용암 빛
    // 6) 건물 · 분수
    map.buildings.forEach(b => {
      const spr = buildingSprite(b, R);
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(b.x * TS - 6, (b.y + b.h) * TS - 10, b.w * TS + 12, 12);
      map.objs.push({ img: spr.c, x: b.x * TS - spr.ox, y: b.y * TS - spr.oy, sy: (b.y + b.h) * TS - 1, b });
      map.glows.push({ x: (b.door.x + 0.5) * TS, y: (b.y + b.h - 1) * TS, r: 70, col: '#FFD27A' });
    });
    if (map.at(17, 14) === 8) {
      x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(17 * TS + 32, 16 * TS - 2, 34, 10, 0, 0, Math.PI * 2); x.fill();
      map.objs.push({ img: fountainSprite(R), x: 17 * TS - 8, y: 14 * TS - 40, sy: 16 * TS - 1, fountain: true });
      map.fountain = { x: 17 * TS + 32, y: 14 * TS - 8 };
    }
    // 7) 출구: 빛나는 길
    const exitGlow = (X0, dir) => { for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(255,255,220,' + (0.18 - k * 0.04) + ')'; x.fillRect(dir < 0 ? X0 : X0 - (k + 1) * 32, (map.mid - 2) * TS, (k + 1) * 32, 6 * TS); } };
    if (map.exitL) exitGlow(0, -1); if (map.exitR) exitGlow(w * TS, 1);
    map.objs.sort((a, b2) => a.sy - b2.sy);
    map.mini = paintMini(map);
    return c;
  }
  // 작은 지도 (1칸 = 1점)
  function paintMini(map) {
    const { w, h, R, at } = map, [c, x] = mk(w, h), col = { 0: R.ground[0], 1: R.path, 2: shade(R.ground[0], -0.45), 3: shade(R.ground[0], -0.35), 4: R.water, 5: R.ground[0], 6: '#B8A080', 7: '#FFD27A', 8: '#9AD8F5' };
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { x.fillStyle = col[at(i, y)] || R.ground[0]; x.fillRect(i, y, 1, 1); }
    return c;
  }

  /* ---------- 나무·바위 그림 조각 (64 × 80, 칸 왼쪽 위 = (16, 40)) ---------- */
  const blockC = {};
  function blockSprite(kind, vr, R) {
    const key = kind + vr; if (blockC[key]) return blockC[key];
    const [c, x] = mk(64, 80), rnd = seeded('blk-' + key);
    drawBlock(x, 16, 40, kind, rnd, vr);
    return (blockC[key] = c);
  }
  function drawBlock(x, X, Y, kind, rnd, vr) {
    const p = (a, b, ww, hh, col) => { x.fillStyle = col; x.fillRect(X + a, Y + b, ww, hh); };
    const K = '#1D2340';
    if (kind === 'tree' || kind === 'blossom') {
      const base = kind === 'tree' ? ['#3E9E45', '#46A84A', '#358C3E'][vr] : ['#FF9EC4', '#FFB3D1', '#F58AB8'][vr], lt = shade(base, 0.28), dk = shade(base, -0.22), dk2 = shade(base, -0.38);
      // 줄기·뿌리
      p(11, 12, 10, 22, K); p(12, 12, 8, 21, '#6B4226'); p(12, 12, 3, 21, '#8A5A36'); p(18, 14, 2, 18, '#4E2E1A'); p(8, 30, 16, 3, K); p(9, 30, 4, 2, '#6B4226'); p(19, 30, 4, 2, '#6B4226');
      // 나뭇잎 덩어리 3개 (뒤 → 앞)
      const blob = (cx, cy, r, col, hl) => {
        x.fillStyle = K; x.beginPath(); for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2, rr = r + 1.5 + (a % 2 ? 1 : 0); x.lineTo(X + cx + Math.cos(t) * rr, Y + cy + Math.sin(t) * rr * 0.92); } x.fill();
        x.fillStyle = col; x.beginPath(); for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2, rr = r + (a % 2 ? 1 : 0); x.lineTo(X + cx + Math.cos(t) * rr, Y + cy + Math.sin(t) * rr * 0.92); } x.fill();
        x.fillStyle = dk; x.beginPath(); x.ellipse(X + cx + 2, Y + cy + r * 0.45, r * 0.85, r * 0.45, 0, 0, Math.PI); x.fill();
        if (hl) { x.fillStyle = lt; x.beginPath(); x.ellipse(X + cx - r * 0.3, Y + cy - r * 0.35, r * 0.45, r * 0.3, -0.4, 0, Math.PI * 2); x.fill(); }
      };
      blob(6, 4, 11, dk, false); blob(27, 2, 11, dk, false); blob(16, -8, 15, base, true); blob(5, 6, 9, base, true); blob(27, 5, 9, base, true);
      for (let i = 0; i < 26; i++) { const a = Math.floor(rnd() * 34) - 3, b = Math.floor(rnd() * 26) - 20; p(a, b, 2, 2, rnd() < 0.5 ? lt : dk2); }
      if (kind === 'blossom') for (let i = 0; i < 10; i++) p(Math.floor(rnd() * 30), Math.floor(rnd() * 22) - 18, 2, 2, '#FFFFFF');
      if (kind === 'tree' && vr === 1) [[6, -4], [24, -10], [14, 6]].forEach(([a, b]) => { p(a, b, 4, 4, K); p(a + 1, b + 1, 2, 2, '#FF5A5F'); });   // 사과
    } else if (kind === 'pine' || kind === 'snowpine') {
      const leaf = kind === 'pine' ? ['#2E7A3A', '#2A7036', '#357F40'][vr] : '#3E7A5A', lt = shade(leaf, 0.25), dk = shade(leaf, -0.25);
      p(13, 18, 6, 16, K); p(14, 18, 4, 15, '#6B4226'); p(14, 18, 1, 15, '#8A5A36');
      for (let i = 0; i < 5; i++) {
        const ww = 10 + i * 6, yy = -24 + i * 9;
        x.fillStyle = K; x.beginPath(); x.moveTo(X + 16, Y + yy - 3); x.lineTo(X + 16 + ww / 2 + 2, Y + yy + 11); x.lineTo(X + 16 - ww / 2 - 2, Y + yy + 11); x.fill();
        x.fillStyle = leaf; x.beginPath(); x.moveTo(X + 16, Y + yy - 1); x.lineTo(X + 16 + ww / 2, Y + yy + 10); x.lineTo(X + 16 - ww / 2, Y + yy + 10); x.fill();
        x.fillStyle = lt; x.beginPath(); x.moveTo(X + 16, Y + yy); x.lineTo(X + 16 - ww / 2 + 2, Y + yy + 9); x.lineTo(X + 14, Y + yy + 9); x.fill();
        p(16 - ww / 2, yy + 9, ww, 1, dk);
        if (kind === 'snowpine') { p(16 - ww / 2 + 1, yy + 7, ww - 2, 2, '#FFFFFF'); p(14, yy, 4, 2, '#FFFFFF'); }
      }
    } else if (kind === 'cactus') {
      const g = '#4E9E3A', lt = '#7FC86A', dk = '#2E7A2A';
      const arm = (a, b, ww, hh) => { p(a - 1, b - 1, ww + 2, hh + 2, K); p(a, b, ww, hh, g); p(a + 1, b, 2, hh, lt); p(a + ww - 2, b, 1, hh, dk); };
      arm(12, -6, 9, 38); arm(3, 4, 6, 14); arm(5, 14, 9, 5); arm(23, 0, 6, 16); arm(19, 12, 6, 5);
      for (let i = 0; i < 8; i++) p(12 + Math.floor(rnd() * 9), -4 + Math.floor(rnd() * 34), 1, 1, '#FFF3B0');
      if (vr === 2) { p(14, -9, 5, 4, K); p(15, -8, 3, 2, '#FF7EB6'); }
    } else if (kind === 'crystal') {
      [[2, 8, 8, 24, '#A880F0'], [11, -12, 10, 44, '#C8A8FF'], [22, 2, 8, 30, '#7FE0F0'], [7, 20, 6, 12, '#FF9AE0']].forEach(([a, b, ww, hh, col]) => {
        x.fillStyle = K; x.beginPath(); x.moveTo(X + a - 1, Y + b + hh + 1); x.lineTo(X + a - 1, Y + b + 3); x.lineTo(X + a + ww / 2, Y + b - 4); x.lineTo(X + a + ww + 1, Y + b + 3); x.lineTo(X + a + ww + 1, Y + b + hh + 1); x.fill();
        x.fillStyle = col; x.beginPath(); x.moveTo(X + a, Y + b + hh); x.lineTo(X + a, Y + b + 3); x.lineTo(X + a + ww / 2, Y + b - 2); x.lineTo(X + a + ww, Y + b + 3); x.lineTo(X + a + ww, Y + b + hh); x.fill();
        p(a + 1, b + 3, 2, hh - 5, shade(col, 0.55)); p(a + ww / 2, b, ww / 2, hh, shade(col, -0.18)); p(a + 1, b + 2, 1, 3, '#FFFFFF');
      });
    } else if (kind === 'deadtree') {
      const t = '#5A4A40', lt = '#7A6A5A';
      p(12, -4, 8, 38, K); p(13, -3, 6, 36, t); p(13, -3, 2, 36, lt);
      p(2, 2, 12, 4, K); p(3, 3, 10, 2, t); p(2, -8, 4, 12, K); p(3, -7, 2, 10, t); p(18, 6, 12, 4, K); p(19, 7, 10, 2, t); p(26, -4, 4, 12, K); p(27, -3, 2, 10, t); p(10, -12, 4, 10, K); p(11, -11, 2, 8, t);
      p(8, 30, 16, 3, K); if (vr === 1) { p(20, 12, 6, 4, '#8AB85A'); p(6, 4, 5, 3, '#8AB85A'); }
    } else {
      const col = kind === 'ice' ? '#A8DCF5' : kind === 'sandrock' ? '#C99A5A' : kind === 'lavarock' ? '#3A2A2A' : kind === 'mossrock' ? '#7A8A6A' : kind === 'cloudrock' ? '#F3F6FF' : ['#8A8FA8', '#9096AE', '#7E849C'][vr];
      const lt = shade(col, 0.32), dk = shade(col, -0.28);
      // 둥근 바위 (윗면 밝게 · 아랫면 어둡게 · 금)
      x.fillStyle = K; x.beginPath(); x.moveTo(X + 1, Y + 31); x.lineTo(X + 3, Y + 12); x.lineTo(X + 10, Y + 4); x.lineTo(X + 22, Y + 3); x.lineTo(X + 30, Y + 11); x.lineTo(X + 32, Y + 31); x.fill();
      x.fillStyle = col; x.beginPath(); x.moveTo(X + 3, Y + 30); x.lineTo(X + 5, Y + 13); x.lineTo(X + 11, Y + 6); x.lineTo(X + 21, Y + 5); x.lineTo(X + 28, Y + 12); x.lineTo(X + 30, Y + 30); x.fill();
      x.fillStyle = lt; x.beginPath(); x.moveTo(X + 6, Y + 14); x.lineTo(X + 11, Y + 7); x.lineTo(X + 21, Y + 6); x.lineTo(X + 24, Y + 11); x.lineTo(X + 12, Y + 13); x.fill();
      p(3, 23, 27, 7, dk); p(17, 14, 2, 8, dk); p(18, 21, 5, 2, dk);
      if (kind === 'lavarock') { p(18, 16, 6, 2, '#FF6A3D'); p(10, 22, 4, 2, '#FFB13D'); p(22, 24, 3, 2, '#FFE45C'); }
      if (kind === 'ice') { p(9, 9, 3, 12, '#FFFFFF'); p(22, 12, 2, 6, '#FFFFFF'); }
      if (kind === 'mossrock') { p(5, 6, 20, 5, '#8AB85A'); p(9, 11, 8, 3, '#6E9A44'); p(22, 8, 6, 3, '#8AB85A'); }
      if (kind === 'cloudrock') { p(0, 16, 6, 12, K); p(1, 17, 5, 10, col); p(26, 14, 7, 14, K); p(27, 15, 5, 12, col); p(4, 26, 26, 4, '#D8E4F8'); }
      if (kind === 'sandrock') { p(6, 20, 22, 2, shade(col, -0.15)); p(8, 25, 18, 1, shade(col, -0.15)); }
    }
  }
  /* ---------- 건물 그림 조각 ---------- */
  const bldC = {};
  function buildingSprite(b, R) {
    const key = b.type + b.w + b.h + R.name; if (bldC[key]) return bldC[key];
    const ox = 40, oy = 90, w = b.w * TS, h = b.h * TS, [c, x] = mk(w + ox * 2, h + oy + 10), K = '#1D2340';
    const p = (a, d, ww, hh, col) => { x.fillStyle = col; x.fillRect(ox + a, oy + d, ww, hh); };
    if (b.type === 'castle') {
      const st = '#9AA0B8', lt = '#B8BED6', dk = '#5A5F78', dk2 = '#454A60';
      // 본관 벽 (벽돌)
      p(-4, 20, w + 8, h - 20, K); p(-2, 22, w + 4, h - 22, st);
      for (let yy = 26; yy < h; yy += 12) for (let xx = ((yy / 12) % 2) * 14; xx < w; xx += 28) { p(xx - 2, yy, 26, 10, ((xx + yy) / 7) % 3 < 1 ? lt : st); p(xx - 2, yy + 10, 26, 2, dk); }
      for (let i = 0; i < b.w + 1; i++) { p(-4 + i * 32, 6, 18, 16, K); p(-2 + i * 32, 8, 14, 14, st); p(-2 + i * 32, 8, 14, 3, lt); }
      // 탑 2개
      [[-26, -40], [w - 30, -40]].forEach(([a, d]) => {
        p(a, d, 56, h + 40 - d, K); p(a + 2, d + 2, 52, h + 36 - d, dk); p(a + 2, d + 2, 10, h + 36 - d, st); p(a + 44, d + 2, 10, h + 36 - d, dk2);
        x.fillStyle = K; x.beginPath(); x.moveTo(ox + a - 6, oy + d + 4); x.lineTo(ox + a + 28, oy + d - 60); x.lineTo(ox + a + 62, oy + d + 4); x.fill();
        x.fillStyle = b.roof; x.beginPath(); x.moveTo(ox + a - 2, oy + d + 2); x.lineTo(ox + a + 28, oy + d - 55); x.lineTo(ox + a + 58, oy + d + 2); x.fill();
        x.fillStyle = shade(b.roof, 0.25); x.beginPath(); x.moveTo(ox + a + 2, oy + d + 2); x.lineTo(ox + a + 28, oy + d - 50); x.lineTo(ox + a + 22, oy + d + 2); x.fill();
        p(a + 26, d - 76, 3, 22, K); p(a + 29, d - 76, 18, 10, '#D2343A'); p(a + 29, d - 72, 18, 2, '#FFD23F');
        p(a + 18, d + 30, 20, 26, K); p(a + 20, d + 32, 16, 22, '#FFE45C'); p(a + 27, d + 32, 2, 22, K);
        p(a + 18, d + 90, 20, 24, K); p(a + 20, d + 92, 16, 20, '#FFE45C');
      });
      // 정문 (아치) + 깃발 장식
      p(w / 2 - 30, h - 62, 60, 62, K); p(w / 2 - 28, h - 60, 56, 60, '#4A3420'); for (let i = 0; i < 6; i++) p(w / 2 - 26 + i * 10, h - 58, 2, 58, '#3A2814'); p(w / 2 - 1, h - 60, 2, 60, K);
      p(w / 2 - 34, h - 70, 68, 8, '#FFD23F'); p(w / 2 - 34, h - 70, 68, 2, '#FFF3B0');
      [w / 2 - 70, w / 2 + 52].forEach(a => { p(a, 30, 18, 46, K); p(a + 2, 32, 14, 40, '#D2343A'); p(a + 2, 32, 14, 4, '#FFD23F'); p(a + 7, 48, 4, 8, '#FFD23F'); });
      x.font = '14px "Jua", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      p(w / 2 - 54, h - 100, 108, 24, K); p(w / 2 - 52, h - 98, 104, 20, '#3A2A1A'); x.fillStyle = '#FFE45C'; x.fillText('왕성 · 퀘스트', ox + w / 2, oy + h - 87);
    } else {
      const wall = '#F3E6CC', wl = '#FFF6E0', wd = '#D8C8A8', roof = b.roof, rl = shade(roof, 0.25), rd = shade(roof, -0.28);
      // 벽 (나무판 + 기둥)
      p(-4, 28, w + 8, h - 28, K); p(-2, 30, w + 4, h - 30, wall);
      for (let yy = 38; yy < h; yy += 10) p(-2, yy, w + 4, 2, wd);
      p(-2, 30, 8, h - 30, '#8A5A36'); p(w - 6, 30, 8, h - 30, '#8A5A36'); p(-2, 30, 3, h - 30, '#A87048');
      // 지붕 (기와 줄 + 빛)
      x.fillStyle = K; x.beginPath(); x.moveTo(ox - 16, oy + 40); x.lineTo(ox + 10, oy - 30); x.lineTo(ox + w - 10, oy - 30); x.lineTo(ox + w + 16, oy + 40); x.fill();
      x.fillStyle = roof; x.beginPath(); x.moveTo(ox - 12, oy + 37); x.lineTo(ox + 12, oy - 27); x.lineTo(ox + w - 12, oy - 27); x.lineTo(ox + w + 12, oy + 37); x.fill();
      for (let r2 = 0; r2 < 6; r2++) { const yy = -22 + r2 * 10, inset = 12 - r2 * 4; for (let xx = -8 + inset + (r2 % 2) * 6; xx < w + 8 - inset; xx += 12) { p(xx, yy + 6, 10, 3, rd); p(xx, yy, 10, 2, rl); } }
      p(10, -27, w - 20, 4, rl); p(-12, 34, w + 24, 4, rd);
      // 굴뚝
      p(w - 46, -48, 18, 28, K); p(w - 44, -46, 14, 24, '#B8836A'); p(w - 44, -46, 14, 4, '#D8A48A');
      // 창문 (빛나는 유리 + 꽃 상자)
      [[14, 52], [w - 46, 52]].forEach(([a, d]) => { p(a, d, 32, 26, K); p(a + 2, d + 2, 28, 22, '#FFE9A8'); p(a + 2, d + 2, 28, 6, '#FFF6D0'); p(a + 15, d + 2, 2, 22, K); p(a + 2, d + 12, 28, 2, K); p(a - 2, d + 26, 36, 8, K); p(a, d + 27, 32, 6, '#8A5A36'); [4, 12, 20, 26].forEach((q, i) => p(a + q, d + 24, 4, 4, ['#FF5A5F', '#FFE45C', '#FF7EB6', '#FFFFFF'][i])); });
      // 문 (아치 + 손잡이) · 계단
      const dx = (b.door.x - b.x) * TS; p(dx - 4, h - 50, 40, 50, K); p(dx - 2, h - 48, 36, 48, '#7A4A26'); p(dx, h - 46, 14, 46, '#8A5A36'); p(dx + 18, h - 46, 14, 46, '#8A5A36'); p(dx + 24, h - 24, 4, 4, '#FFD23F'); p(dx - 6, h - 4, 44, 4, '#A8A098');
      // 간판 (그림 + 글자)
      const bw = 112, bx = w / 2 - bw / 2; p(bx - 2, 6, bw + 4, 24, K); p(bx, 8, bw, 20, '#8A5A36'); p(bx + 2, 10, bw - 4, 16, '#FFF2D0'); p(bx + 20, 2, 2, 6, K); p(bx + bw - 22, 2, 2, 6, K);
      const ic = (q, d) => { if (b.type === 'potion') { p(q + 3, d, 6, 3, K); p(q + 1, d + 3, 10, 11, K); p(q + 2, d + 4, 8, 9, '#FF5A5F'); p(q + 3, d + 5, 2, 3, '#FFFFFF'); } else if (b.type === 'school') { p(q, d + 2, 14, 11, K); p(q + 1, d + 3, 5, 9, '#A66BFF'); p(q + 8, d + 3, 5, 9, '#7E4DE0'); p(q + 6, d + 2, 2, 11, '#FFE45C'); } else { p(q, d + 6, 14, 8, K); p(q + 1, d + 7, 12, 6, '#3DDC84'); p(q + 2, d + 1, 10, 6, K); p(q + 3, d + 2, 8, 4, '#D2343A'); } };
      ic(bx + 6, 10);
      x.font = '13px "Jua", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#3A2414'; x.fillText(b.name, ox + w / 2 + 8, oy + 19);
      // 가게 앞 소품
      if (b.type === 'potion') { p(w + 4, h - 22, 18, 22, K); p(w + 6, h - 20, 14, 18, '#A87048'); p(w + 8, h - 28, 4, 8, '#FF5A5F'); p(w + 13, h - 30, 4, 10, '#4C7DFF'); }
      if (b.type === 'school') { p(-24, h - 40, 6, 40, K); p(-23, h - 40, 4, 40, '#5A5F78'); p(-28, h - 52, 14, 14, K); p(-26, h - 50, 10, 10, '#FFE45C'); }
      if (b.type === 'chief') { p(w + 2, h - 18, 30, 18, K); p(w + 4, h - 16, 26, 14, '#8A5A36'); p(w + 6, h - 14, 22, 2, '#A87048'); }
    }
    return (bldC[key] = { c, ox, oy });
  }
  function fountainSprite(R) {
    if (bldC.fountain) return bldC.fountain;
    const [c, x] = mk(80, 100), p = (a, d, ww, hh, col) => { x.fillStyle = col; x.fillRect(8 + a, 40 + d, ww, hh); };
    p(0, 14, 64, 44, '#1D2340'); p(2, 16, 60, 40, '#B9C0DE'); p(2, 16, 60, 4, '#D9DEF2'); p(6, 22, 52, 26, '#4FA8E8'); p(6, 22, 52, 4, '#8AD0FF'); p(2, 50, 60, 6, '#8A90B0');
    p(26, -14, 12, 38, '#1D2340'); p(28, -12, 8, 34, '#D9DEF2'); p(20, -18, 24, 8, '#1D2340'); p(22, -16, 20, 4, '#B9C0DE');
    return (bldC.fountain = c);
  }

  /* ================= Meshy 그림 (v40) =================
   *  img/ 폴더의 그림을 불러 두었다가 있으면 쓰고, 없으면(또는 늦으면) 코드로 그린 그림을 씀
   *  bld_potion·bld_school·bld_chief·bld_castle / boss_r0~8 / mon_r0~8 (9칸 × 64px) / obj_r0~8_1·2 / key.jpg */
  const RIMG = {}, IMG_DIR = 'games/action/rpg/img/';
  const IMG_LIST = ['bld_potion', 'bld_school', 'bld_chief', 'bld_castle'].concat([0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap(i => ['boss_r' + i, 'mon_r' + i, 'obj_r' + i + '_1', 'obj_r' + i + '_2']));
  let imgPromise = null;
  function loadImages(timeoutMs) {
    if (!imgPromise) imgPromise = Promise.all(IMG_LIST.concat(['key']).map(n => new Promise(res => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { RIMG[n] = im; res(); }; im.onerror = () => res();
      im.src = IMG_DIR + n + (n === 'key' ? '.jpg' : '.png') + '?v=40';
    })));
    return Promise.race([imgPromise, new Promise(r => setTimeout(r, timeoutMs || 6000))]);
  }
  const imgOk = n => { const im = RIMG[n]; return im && im.complete && im.naturalWidth ? im : null; };

  /* ================= 그림 조각 (몬스터 · 아바타 + 장비) ================= */
  const monCache = {};
  // 몬스터: 12×12 도트 → 위쪽이 비면 밝게, 아래쪽이 비면 어둡게 (입체감) + 반짝임 점
  function monSprite(mon, scale) {
    const key = mon.name + scale; if (monCache[key]) return monCache[key];
    // Meshy 그림이 있으면 그것을 씀 (보스: boss_r, 일반: mon_r 의 k번째 칸)
    const boss = scale >= 6, im = mon.ri != null ? imgOk(boss ? 'boss_r' + mon.ri : 'mon_r' + mon.ri) : null;
    if (im && (boss || mon.k < 9)) {
      const sx = boss ? 0 : mon.k * 64, sw = boss ? im.naturalWidth : 64, sh = boss ? im.naturalHeight : 64;
      const [t, tx] = mk(sw, sh); tx.drawImage(im, sx, 0, sw, sh, 0, 0, sw, sh);
      const d = tx.getImageData(0, 0, sw, sh).data; let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > 0) {
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, [c, x] = mk(cw, ch); x.drawImage(t, x0, y0, cw, ch, 0, 0, cw, ch);
        const [c2, x2] = mk(cw, ch); x2.drawImage(c, 0, 0); x2.globalCompositeOperation = 'source-in'; x2.fillStyle = '#FFFFFF'; x2.fillRect(0, 0, cw, ch);
        return (monCache[key] = { img: c, flash: c2, w: cw, h: ch, meshy: true });
      }
    }
    const sh = D.SHAPES[mon.shape] || D.SHAPES.slime, C = Object.assign({ e: '#FFFFFF', k: '#1D2340' }, mon.colors);
    const [c, x] = mk(12 * scale, 12 * scale), at = (i, j) => (sh[j] && sh[j][i]) || '.';
    const empty = ch => ch === '.' || ch === 'k';
    sh.forEach((row, j) => { for (let i = 0; i < 12; i++) {
      const ch = row[i]; if (ch === '.' || !C[ch]) continue;
      let col = C[ch];
      if (ch === 'a' || ch === 'b' || ch === 'c' || ch === 'd') {
        if (empty(at(i, j - 1))) col = shade(col, 0.22); else if (empty(at(i, j + 1)) || empty(at(i + 1, j))) col = shade(col, -0.18);
      }
      x.fillStyle = col; x.fillRect(i * scale, j * scale, scale, scale);
      if (ch === 'a' && scale >= 3 && empty(at(i, j - 1)) && empty(at(i - 1, j))) { x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(i * scale + 1, j * scale + 1, Math.max(1, scale / 3), Math.max(1, scale / 3)); }
    } });
    // 흰 깜빡임용 (맞았을 때)
    const [c2, x2] = mk(12 * scale, 12 * scale); x2.drawImage(c, 0, 0); x2.globalCompositeOperation = 'source-in'; x2.fillStyle = '#FFFFFF'; x2.fillRect(0, 0, c2.width, c2.height);
    return (monCache[key] = { img: c, flash: c2, w: 12 * scale, h: 12 * scale });
  }

  // 장비 그림 (아바타 칸 좌표 · 18 × 29 · 테두리 1칸 포함)
  const GW = AV.size.w, GH = AV.size.h;
  function gearCells(eq, frame) {
    const cells = Array.from({ length: GH }, () => Array(GW).fill(null));
    const px = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const gx = x + i + 1, gy = y + j + 1; if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) cells[gy][gx] = c; } };
    const it = s => eq[s] && D.ITEMS[eq[s]], T = s => D.TIER[it(s).tier];
    if (it('boots')) { const t = T('boots'), L = AV.legs(frame); px(L.L.x, L.LF.y - 2, 3, 3, t.color); px(L.R.x, L.RF.y - 2, 3, 3, t.color); px(L.L.x - 1, L.LF.y, 1, 1, t.dark); px(L.R.x + 3, L.RF.y, 1, 1, t.dark); px(L.L.x, L.LF.y - 2, 3, 1, t.dark); px(L.R.x, L.RF.y - 2, 3, 1, t.dark); }
    if (it('armor')) { const t = T('armor'), r = it('armor').rare; px(5, 12, 6, 7, t.color); px(5, 18, 6, 1, t.dark); px(2, 12, 3, 2, t.color); px(11, 12, 3, 2, t.color); px(2, 13, 3, 1, t.dark); px(11, 13, 3, 1, t.dark); px(6, 13, 1, 4, shade(t.color, 0.35)); px(7, 14, 2, 2, r ? t.gem : t.dark); }
    if (it('helmet')) { const t = T('helmet'), r = it('helmet').rare; px(4, 1, 8, 4, t.color); px(3, 3, 1, 4, t.color); px(12, 3, 1, 4, t.color); px(4, 4, 8, 1, t.dark); px(5, 1, 2, 1, shade(t.color, 0.4)); if (r) { px(7, 0, 2, 1, t.gem); px(7, 2, 2, 1, t.gem); } }
    if (it('weapon')) {
      const t = T('weapon'), wp = it('weapon');
      if (wp.look === 'staff') { px(14, 6, 1, 16, '#7A5230'); px(13, 2, 3, 1, t.color); px(13, 3, 3, 3, t.gem); px(12, 4, 1, 1, t.color); px(16, 4, 1, 1, t.color); px(14, 4, 1, 1, '#FFFFFF'); }
      else { px(14, 5, 1, 12, '#EEF1FF'); px(15, 6, 1, 10, '#B9C0DE'); px(14, 4, 1, 1, '#FFFFFF'); px(12, 17, 5, 1, t.color); px(14, 18, 1, 2, t.dark); px(14, 20, 1, 1, t.gem); }
    }
    if (it('ring')) px(12, 18, 1, 1, T('ring').gem);
    return cells;
  }
  const avCache = {};
  function avatarSprite(av, eq, hide, frame) {
    const key = JSON.stringify([av, hide ? {} : eq, frame]);
    if (avCache[key]) return avCache[key];
    const base = AV.grid(av, frame), OUT = AV.OUT || '#1D2340';
    if (!hide) {
      const g = gearCells(eq, frame);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) base[y][x] = g[y][x];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {      // 장비 테두리
        if (g[y][x] || base[y][x]) continue;
        if ((y > 0 && g[y - 1][x]) || (y < GH - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < GW - 1 && g[y][x + 1])) base[y][x] = OUT;
      }
    }
    // v39 사이트 아바타처럼 2배 정교한 그림(부드러운 대각선·명암·눈 반짝임)이 있으면 장비까지 함께 다듬음
    const cells = AV.refine ? AV.refine(base, true) : base, k = AV.refine ? 2 : 1;
    const [c, x] = mk(GW * k, GH * k);
    for (let y = 0; y < GH * k; y++) for (let i = 0; i < GW * k; i++) if (cells[y][i]) { x.fillStyle = cells[y][i]; x.fillRect(i, y, 1, 1); }
    const keys = Object.keys(avCache); if (keys.length > 40) delete avCache[keys[0]];
    return (avCache[key] = c);
  }
  // 창에 쓰는 작은 그림 (아이템 아이콘): 장비는 그 장비만 따로 그려서 확대, 포션은 병 그림
  const icC = {};
  function itemImg(id) {
    if (icC[id]) return icC[id];
    const it = D.ITEMS[id], S = 36, [c, x] = mk(S, S); x.imageSmoothingEnabled = false;
    if (it.stack) {
      const col = it.kind === 'hp' ? D.TIER[0] && ['#FF5A5F', '#FF8A3D', '#E8402A', '#FF6A8A', '#D2143A', '#B0102A', '#A040C0', '#FFB3D1', '#FF9A3D'][it.tier] : it.kind === 'mp' ? ['#4C7DFF', '#5AB8F5', '#2EC0B8', '#3E4AC0', '#2F55D9', '#7FA0FF', '#8A6AF0', '#BDE8FF', '#3BC8F5'][it.tier] : null;
      const p = (a, b, w, h, cc) => { x.fillStyle = cc; x.fillRect(a, b, w, h); };
      if (it.kind === 'scroll') { p(7, 8, 22, 22, '#1D2340'); p(9, 10, 18, 18, '#F5E2B8'); p(11, 14, 14, 2, '#B8834A'); p(11, 18, 14, 2, '#B8834A'); p(11, 22, 10, 2, '#B8834A'); p(5, 6, 26, 5, '#1D2340'); p(6, 7, 24, 3, '#E8C07A'); p(22, 24, 6, 6, '#D2343A'); }
      else { p(13, 3, 10, 7, '#1D2340'); p(14, 4, 8, 5, '#C8A070'); p(15, 9, 6, 4, '#1D2340'); p(8, 12, 20, 21, '#1D2340'); p(10, 14, 16, 17, '#D9E4FF'); p(10, 19, 16, 12, col); p(10, 19, 16, 2, shade(col, 0.4)); p(12, 15, 3, 6, '#FFFFFF'); p(20, 26, 4, 3, shade(col, -0.3)); if (it.tier >= 3) { p(16, 22, 4, 4, '#FFFFFF'); } }
    } else {
      const eq = {}; eq[it.slot] = id;
      const g = gearCells(eq, 0); let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
      for (let y = 0; y < GH; y++) for (let i = 0; i < GW; i++) if (g[y][i]) { x0 = Math.min(x0, i); y0 = Math.min(y0, y); x1 = Math.max(x1, i); y1 = Math.max(y1, y); }
      if (it.slot === 'ring') { const t = D.TIER[it.tier]; x.fillStyle = '#1D2340'; x.beginPath(); x.arc(18, 20, 11, 0, Math.PI * 2); x.fill(); x.fillStyle = t.color; x.beginPath(); x.arc(18, 20, 9, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1D2340'; x.beginPath(); x.arc(18, 20, 5, 0, Math.PI * 2); x.fill(); x.fillStyle = t.gem; x.fillRect(14, 4, 8, 8); x.fillStyle = '#FFFFFF'; x.fillRect(15, 5, 3, 3); }
      else {
        const bw = x1 - x0 + 3, bh = y1 - y0 + 3, k = Math.max(1, Math.floor(Math.min((S - 4) / bw, (S - 4) / bh))), ox = Math.floor((S - bw * k) / 2), oy = Math.floor((S - bh * k) / 2);
        const OUT = '#1D2340';
        for (let y = y0 - 1; y <= y1 + 1; y++) for (let i = x0 - 1; i <= x1 + 1; i++) {   // 테두리
          const on = g[y] && g[y][i]; if (on) continue;
          const nb = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => g[y + b] && g[y + b][i + a]);
          if (nb) { x.fillStyle = OUT; x.fillRect(ox + (i - x0 + 1) * k, oy + (y - y0 + 1) * k, k, k); }
        }
        for (let y = y0; y <= y1; y++) for (let i = x0; i <= x1; i++) if (g[y][i]) { x.fillStyle = g[y][i]; x.fillRect(ox + (i - x0 + 1) * k, oy + (y - y0 + 1) * k, k, k); }
      }
    }
    return (icC[id] = c.toDataURL());
  }
  function itemIcon(id) {
    const it = D.ITEMS[id]; if (!it) return '';
    const t = it.slot ? D.TIER[it.tier] : { color: '#5A64A0', gem: '#FFFFFF' };
    return `<img class="rg-ic${it.rare ? ' rare' : ''}" style="--c:${t.color};--g:${t.gem}" src="${itemImg(id)}" alt="">`;
  }

  window.__GoRPGParts = { loadImages, imgOk, getMap, solidAt, monSprite, avatarSprite, itemIcon, itemImg, seeded, clamp, rand, pick, dist, fmtN, shade, mk, MAPBY, SOLID, W, H, TS, SAVE_V, GAME };
})();
