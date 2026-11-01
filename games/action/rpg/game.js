/*
 * gogo?gogo! — skillcom RPG (도트 RPG · 혼자 플레이 첫 버전 v40 · v41 건물 안·사람·가방 창)
 *
 *  파일 3개: data.js (숫자·목록) · world.js (지도 만들기·그림) · game.js (이 파일: 움직임·전투·창·저장)
 *  캐릭터: 사이트 아바타 그대로 + 장비를 위에 겹쳐 그림. 가방 창 '장비 안보이기' = 그림만 숨김 (능력치 그대로)
 *  저장: 이 기기(localStorage) + 로그인하면 서버 game_saves 표 (supabase/rpg_v40.sql). 더 최근 것을 불러옴
 *  조작: WASD/방향키 이동 · Space/J 공격 · 1~4 마법 · Q/E 포션 · I 가방 · K 마법 · F/Enter 들어가기 · Esc 닫기
 *        휴대폰: 왼쪽 조이스틱 + 오른쪽 버튼 (캔버스 위)
 */
(function () {
  'use strict';
  const D = window.GoRPGData, AV = window.GoAvatar, Hub = window.GameHub, BGM = window.GoBGM;
  const P = window.__GoRPGParts, CFG = window.GoSettings.get('rpg');
  const { loadImages, imgOk, getMap, solidAt, monSprite, avatarSprite, itemIcon, clamp, rand, pick, dist, fmtN, W, H, TS, SAVE_V, GAME, MAPBY, getRoom, npcSprite, npcPortrait, villagers } = P;
  const ITEMS = D.ITEMS, SKILLS = D.SKILLS, ELEM = D.ELEM, Fx = window.GoRPGFx;
  const POT_T = D.POTIONS.filter(p => p.kind === 'hp').map(p => p.tier + 1).reverse();   // 포션 단계 (큰 것부터) 9 … 1
  const ROMAN = ['', ' Ⅱ', ' Ⅲ', ' Ⅳ', ' Ⅴ'];
  const KIND_TXT = { bolt: '탄', nova: '주변 폭발', beam: '일직선', rain: '여러 곳에 떨어짐', pool: '바닥 장판', dash: '돌진', heal: '회복', shield: '보호막' };
  const FX_TXT = { burn: '화상', slow: '느려짐', stun: '기절', push: '밀어내기', heavy: '큰 피해', holy: '흡수 회복' };

  /* ================= 마법 (기본 + 융합) ================= */
  const fuseId = (a, b) => 'fu:' + [a, b].sort().join('+');
  function skill(id) {
    if (!id) return null;
    if (SKILLS[id]) return Object.assign({ els: [SKILLS[id].el] }, SKILLS[id]);
    if (!id.startsWith('fu:')) return null;
    const [a, b] = id.slice(3).split('+'), A = SKILLS[a], B = SKILLS[b]; if (!A || !B) return null;
    const rec = D.fusionOf(A.el, B.el); if (!rec) return null;
    const lv = Math.max(A.lv, B.lv), ap = X => (X.kind === 'heal' || X.kind === 'shield' ? 1.5 + X.lv / 40 : X.pow);
    const kind = rec[3];
    const pow = kind === 'heal' ? Math.min(0.85, 0.35 + lv / 250) : kind === 'shield' ? Math.min(0.7, 0.4 + lv / 400) : Math.round((ap(A) + ap(B)) * 0.85 * 10) / 10;
    return Object.assign({ id, name: rec[2] + ROMAN[Math.min(4, Math.floor((lv - 1) / 20))], el: A.el, els: [A.el, B.el], lv, kind, pow, mp: Math.round((A.mp + B.mp) * 0.75), cd: Math.max(2, Math.max(A.cd, B.cd)), fusion: [a, b], dur: 6 }, rec[4]);
  }
  const fusePrice = (a, b) => { const lv = Math.max(SKILLS[a].lv, SKILLS[b].lv); return Math.round(100 + lv * lv * 2); };
  function describe(sk) {
    const els = sk.els.map(e => `<b style="color:${ELEM[e].color}">${ELEM[e].name}</b>`).join(' + ');
    const fx = sk.els.map(e => FX_TXT[ELEM[e].fx]).join('·');
    const p = sk.kind === 'heal' ? `최대 체력의 ${Math.round(sk.pow * 100)}% 회복` : sk.kind === 'shield' ? `받는 피해 ${Math.round(sk.pow * 100)}% 줄임 · ${sk.dur || 6}초` : `위력 ×${sk.pow}${sk.count ? ' · ' + sk.count + '번' : ''} · ${fx}`;
    return `${els} · ${KIND_TXT[sk.kind]} · ${p} · 마나 ${sk.mp} · ${sk.cd}초`;
  }

  /* ================= 저장 ================= */
  function newSave() {
    const s = { v: SAVE_V, lv: 1, exp: 0, gold: 50, hp: 0, mp: 0, map: 'v1', x: null, y: null, home: 'v1',
      inv: [{ id: 'hp1', n: 5 }, { id: 'mp1', n: 3 }, { id: 'scroll', n: 1 }], eq: {}, hide: false,
      stat: { str: 0, dex: 0, int: 0, vit: 0 }, statV: 2, sp: 0, skills: ['magicarrow'], slots: ['magicarrow', null, null, null], visited: ['v1'], play: 0, kills: 0, bosses: {}, help: false, savedAt: 0 };
    return s;
  }
  function fixSave(s) {
    const n = newSave(); if (!s || typeof s !== 'object' || s.v !== SAVE_V) return n;
    const oldStatV = s.statV;   // 기본값을 채우기 전에 기억 (v44 스탯 바뀜 확인용)
    Object.keys(n).forEach(k => { if (s[k] === undefined) s[k] = n[k]; });
    s.lv = clamp(Math.floor(+s.lv || 1), 1, D.MAX_LV); s.exp = Math.max(0, +s.exp || 0); s.gold = Math.max(0, Math.floor(+s.gold || 0));
    if (!MAPBY[s.map]) s.map = 'v1'; if (!MAPBY[s.home] || MAPBY[s.home].kind !== 'village') s.home = 'v1';
    s.inv = (Array.isArray(s.inv) ? s.inv : []).filter(x => x && ITEMS[x.id] && x.n > 0).slice(0, 60);
    Object.keys(s.eq || {}).forEach(k => { if (!ITEMS[s.eq[k]] || ITEMS[s.eq[k]].slot !== k) delete s.eq[k]; });
    s.skills = (s.skills || []).filter(id => skill(id));
    if (!s.skills.includes('magicarrow')) { s.skills.unshift('magicarrow'); if (Array.isArray(s.slots) && !s.slots.includes('magicarrow')) { const i = s.slots.indexOf(null); if (i >= 0) s.slots[i] = 'magicarrow'; } }   // v41 기본 마법
    s.slots = [0, 1, 2, 3].map(i => (s.slots && s.skills.includes(s.slots[i]) ? s.slots[i] : null));
    s.visited = (s.visited || []).filter(id => MAPBY[id]); if (!s.visited.includes('v1')) s.visited.unshift('v1');
    // v44 스탯 4가지 · 레벨당 2포인트 · 스탯마다 최대 50. v43(힘·민첩·지혜, 레벨당 3) 저장은 한 번 모두 돌려받아 다시 나눔
    const st = s.stat && typeof s.stat === 'object' && oldStatV === 2 ? s.stat : {}; if (oldStatV !== 2) { s.statV = 2; if (s.lv > 1) s.statReset = true; }
    s.stat = {}; D.STAT.keys.forEach(k => { s.stat[k] = clamp(Math.floor(+st[k] || 0), 0, D.STAT.max); });
    const total = (s.lv - 1) * (CFG.statPerLevel || 2), used = D.STAT.keys.reduce((a, k) => a + s.stat[k], 0);
    if (used > total) { D.STAT.keys.forEach(k => { s.stat[k] = 0; }); s.sp = total; } else s.sp = total - used;
    return s;
  }
  const Store = {
    noServer: false,
    key: uid => 'gogogogo.rpg.' + (uid || 'guest'),
    local(uid) { try { return JSON.parse(localStorage.getItem(this.key(uid)) || 'null'); } catch (e) { return null; } },
    setLocal(uid, s) { try { localStorage.setItem(this.key(uid), JSON.stringify(s)); } catch (e) { /* noop */ } },
    online: () => Hub.mode === 'online' && Hub.user && Hub._sb,
    async server() {
      if (!this.online() || this.noServer) return null;
      try {
        const { data, error } = await Hub._sb.from('game_saves').select('data').eq('user_id', Hub.user.id).eq('game_id', GAME).maybeSingle();
        if (error) { this.noServer = true; console.warn('[rpg] 서버 저장 표 없음 → 이 기기에만 저장', error.message); return null; }
        return data ? data.data : null;
      } catch (e) { return null; }
    },
    async push(s) {
      if (!this.online() || this.noServer) return false;
      try {
        const { error } = await Hub._sb.from('game_saves').upsert({ user_id: Hub.user.id, game_id: GAME, data: s, updated_at: new Date().toISOString() });
        if (error) { if (/relation|does not exist|schema cache|permission/i.test(error.message)) this.noServer = true; console.warn('[rpg] 서버 저장 실패', error.message); return false; }
        return true;
      } catch (e) { return false; }
    },
    async load() {
      const uid = Hub.user && Hub.user.id;
      let s = this.local(uid);
      const srv = await this.server();
      if (srv && (!s || (srv.savedAt || 0) > (s.savedAt || 0))) s = srv;
      if (!s && uid) { const g = this.local(null); if (g && g.lv > 1) s = g; }   // 손님으로 하던 기록을 로그인 계정으로 이어서
      return fixSave(s);
    }
  };

  /* ================= 화면 모양 (이 게임 전용 CSS) ================= */
  const CSS = `
  .rg-page .rg-wrap { display: grid; gap: 12px; justify-items: center; }
  .rg-page .cabinet { max-width: min(calc(960px + 32px), max(320px, calc((100svh - 190px) * 1.7778 + 32px))); padding: 12px; }
  .rg-page .screen { outline: none; }
  .rg-bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .rg-bar .btn { min-width: 0; padding: 8px 12px; font-size: 14px; }
  .rg-panel { position: absolute; inset: 4% 6%; background: linear-gradient(180deg, rgba(34, 42, 92, .97), rgba(12, 16, 40, .97)); color: #EEF1FF; border: 3px solid #0A0E24; border-radius: 10px; padding: 12px 14px; overflow-y: auto; overscroll-behavior: contain; font-size: 14px; z-index: 3; box-shadow: 0 6px 0 rgba(0,0,0,.35); }
  .rg-panel[hidden] { display: none; }
  .rg-panel h3 { font-family: var(--f-display); font-size: 22px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
  .rg-panel h3 .x { margin-left: auto; background: #2A325E; color: #fff; border: 2px solid #0A0E24; border-radius: 6px; font-size: 14px; padding: 2px 10px; cursor: pointer; }
  .rg-panel .sub { color: #AEB7E0; font-size: 13px; margin: 0 0 8px; }
  .rg-tabs { display: flex; gap: 6px; margin: 4px 0 10px; flex-wrap: wrap; }
  .rg-tabs button { background: #222A52; color: #C9D0F0; border: 2px solid #0A0E24; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  .rg-tabs button[aria-pressed="true"] { background: #FFD23F; color: #1D2340; }
  .rg-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .rg-row { display: flex; align-items: center; gap: 10px; background: linear-gradient(180deg, #232B5C, #1A2148); border: 2px solid #0A0E24; border-radius: 10px; padding: 6px 8px; box-shadow: 0 2px 0 rgba(0,0,0,.25); transition: transform .1s; }
  .rg-row:hover { transform: translateY(-1px); border-color: #3A4690; }
  .rg-row.off { opacity: .55; }
  .rg-row .nm { font-weight: 700; }
  .rg-row .ds { color: #AEB7E0; font-size: 12px; display: block; font-weight: 400; }
  .rg-row .grow { flex: 1; min-width: 0; }
  .rg-row .btn, .rg-mini { padding: 4px 10px; font-size: 13px; min-width: 0; border-radius: 6px; cursor: pointer; background: #FFD23F; color: #1D2340; border: 2px solid #0A0E24; white-space: nowrap; }
  .rg-mini.ghost { background: #2A325E; color: #EEF1FF; }
  .rg-mini[disabled] { opacity: .45; cursor: default; }
  .rg-mini.on { background: #3DDC84; }
  .rg-ic { width: 40px; height: 40px; flex: none; border-radius: 8px; background: radial-gradient(circle at 35% 30%, #2E3870, #0F1430 70%); border: 2px solid var(--c); image-rendering: pixelated; padding: 1px; box-sizing: border-box; }
  .rg-ic.rare { box-shadow: 0 0 10px var(--g), 0 0 0 1px var(--g) inset; animation: rgShine 1.6s ease-in-out infinite; }
  @keyframes rgShine { 50% { box-shadow: 0 0 16px var(--g), 0 0 0 1px var(--g) inset; } }
  .rg-sk { width: 40px; height: 40px; flex: none; border-radius: 8px; border: 2px solid #0A0E24; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
  .rg-slots { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
  .rg-slot { display: inline-flex; align-items: center; gap: 6px; background: #1A2148; border: 2px solid #0A0E24; border-radius: 8px; padding: 3px 8px 3px 3px; font-size: 13px; }
  .rg-slot b { background: #FFD23F; color: #1D2340; border-radius: 4px; padding: 0 5px; }
  .rg-slot .rg-sk { width: 28px; height: 28px; }
  .rg-slot i { color: #8A93C0; font-style: normal; padding: 4px; }
  .rg-eq { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; margin-bottom: 8px; }
  .rg-stats { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; color: #C9D0F0; margin: 6px 0 10px; }
  .rg-stats b { color: #FFD23F; }
  .rg-check { display: inline-flex; align-items: center; gap: 6px; background: #222A52; border: 2px solid #0A0E24; border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  .rg-check input { width: 18px; height: 18px; }
  .rg-gold { color: #FFD23F; font-weight: 700; }
  .rg-fuse { display: grid; gap: 8px; background: #1A2148; border: 2px dashed #5A64A0; border-radius: 8px; padding: 8px; margin-bottom: 10px; }
  .rg-fuse select { width: 100%; padding: 4px; border-radius: 6px; font-size: 14px; }
  .rg-msg { position: absolute; left: 50%; top: 66%; transform: translateX(-50%); background: rgba(10,14,36,.85); color: #FFE45C; border: 2px solid #0A0E24; border-radius: 8px; padding: 6px 14px; font-size: 15px; pointer-events: none; z-index: 2; white-space: nowrap; font-family: var(--f-display); }
  .rg-msg[hidden] { display: none; }
  .rg-side { width: min(100%, 560px); display: grid; grid-template-columns: 1fr; gap: 12px; }
  /* v43 크게 보기 */
  .rg-full { position: absolute; top: 2%; right: 18.4%; width: 36px; height: 36px; z-index: 2; border-radius: 9px; background: rgba(10,14,36,.78); border: 2px solid #0A0E24; color: #FFFFFF; display: none; place-items: center; cursor: pointer; padding: 0; }
  @media (pointer: coarse) { .rg-full { display: grid; } }
  .rg-page .cabinet:fullscreen { max-width: none; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: #05081A; display: flex; align-items: center; justify-content: center; }
  .rg-page .cabinet:-webkit-full-screen { max-width: none; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: #05081A; display: flex; align-items: center; justify-content: center; }
  .rg-page .cabinet.rg-max { position: fixed; inset: 0; z-index: 200; max-width: none; width: 100vw; height: 100dvh; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: #05081A; display: flex; align-items: center; justify-content: center; }
  .rg-page .cabinet:fullscreen .screen { width: min(100vw, calc(100vh * 1.7778)); border: 0; border-radius: 0; }
  .rg-page .cabinet:-webkit-full-screen .screen { width: min(100vw, calc(100vh * 1.7778)); border: 0; border-radius: 0; }
  .rg-page .cabinet.rg-max .screen { width: min(100vw, calc(100dvh * 1.7778)); border: 0; border-radius: 0; }
  /* v43 스탯 창 */
  .rg-statwin { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: stretch; }
  .rg-statfig { display: grid; gap: 6px; justify-items: center; align-content: start; }
  .rg-statfig .rg-fig { grid-area: auto; width: 100%; height: 156px; } .rg-statfig .rg-fig img { height: 140px; }
  .rg-statfig .nm { font-family: var(--f-display); font-size: 17px; }
  .rg-xp { width: 100%; height: 8px; background: #0A0E24; border-radius: 4px; overflow: hidden; } .rg-xp i { display: block; height: 100%; background: linear-gradient(90deg, #FFD23F, #FFF3B0); }
  .rg-statfig small { color: #AEB7E0; font-size: 12px; }
  .rg-alloc { display: grid; gap: 6px; align-content: start; } .rg-alloc .rg-srvact { margin: 2px 0 0; }
  .rg-sp { font-size: 14px; color: #C9D0F0; } .rg-sp b { font-family: var(--f-display); font-size: 22px; color: #FFD23F; margin-left: 6px; }
  .rg-st { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "lab btns" "ds btns"; gap: 0 10px; align-items: center; background: #141A3C; border: 2px solid #0A0E24; border-left: 5px solid var(--c); border-radius: 10px; padding: 5px 10px; }
  .rg-st .lab { grid-area: lab; display: flex; align-items: baseline; gap: 10px; } .rg-st .lab b { color: var(--c); font-family: var(--f-display); font-size: 18px; } .rg-st .lab span { font-family: var(--f-display); font-size: 20px; color: #FFFFFF; }
  .rg-st small { grid-area: ds; color: #AEB7E0; font-size: 12px; } .rg-st .lab small.mx { font-size: 12px; color: #8A93C0; }
  .rg-st .btns { grid-area: btns; display: flex; gap: 6px; } .rg-st .btns .rg-mini { font-size: 15px; padding: 6px 12px; }
  .rg-detailgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; }
  .rg-detailgrid div { background: #141A3C; border: 2px solid #0A0E24; border-radius: 10px; padding: 7px 9px; display: grid; gap: 1px; }
  .rg-detailgrid span { font-size: 12px; } .rg-detailgrid b { font-family: var(--f-display); font-size: 19px; color: #FFFFFF; }
  .rg-detailgrid small { font-size: 11px; color: #AEB7E0; line-height: 1.35; } .rg-detailgrid small.pt { color: #8A93C0; }
  .rg-detailgrid em { font-style: normal; } .rg-detailgrid em.s { color: #FFD23F; } .rg-detailgrid em.g { color: #9AE6FF; }
  /* v44 거래 */
  .rg-trade { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rg-trade .rg-bag.ok { border-color: #3DDC84; box-shadow: 0 0 0 2px #3DDC84 inset; }
  .rg-trade .tt { display: flex; align-items: center; gap: 8px; font-family: var(--f-display); font-size: 16px; margin-bottom: 6px; }
  .rg-trade .tt em { font-style: normal; font-size: 12px; background: #3DDC84; color: #0A0E24; border-radius: 6px; padding: 0 6px; }
  .rg-trlist { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; min-height: 52px; align-items: start; }
  .rg-trempty { grid-column: 1 / -1; color: #8A93C0; font-size: 13px; padding: 10px 0; }
  .rg-trgold { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; }
  .rg-trgold input { width: 110px; color: #1D2340; padding: 4px 6px; border-radius: 6px; border: 2px solid #0A0E24; font-size: 14px; }
  .rg-trgold small { color: #AEB7E0; }
  /* v42 서버 고르기 */
  .rg-srvs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .rg-srv { position: relative; display: grid; gap: 6px; text-align: left; background: linear-gradient(180deg, #2A3266, #182050); color: #EEF1FF; border: 2px solid #0A0E24; border-radius: 12px; padding: 10px 10px 8px; cursor: pointer; box-shadow: 0 3px 0 rgba(0,0,0,.3); transition: transform .1s, filter .1s; }
  .rg-srv:hover:not([disabled]) { transform: translateY(-2px); filter: brightness(1.12); }
  .rg-srv[disabled] { opacity: .5; cursor: default; }
  .rg-srv.cur { border-color: #9AE6FF; box-shadow: 0 0 0 2px #9AE6FF inset, 0 3px 0 rgba(0,0,0,.3); }
  .rg-srv b { font-family: var(--f-display); font-size: 18px; }
  .rg-srv em { position: absolute; right: 6px; top: 6px; font-style: normal; font-size: 11px; background: #3DDC84; color: #0A0E24; border-radius: 6px; padding: 0 6px; }
  .rg-srv em.me { background: #9AE6FF; }
  .rg-srv .bar { height: 8px; background: #0A0E24; border-radius: 4px; overflow: hidden; }
  .rg-srv .bar i { display: block; height: 100%; border-radius: 4px; }
  .rg-srv small { font-size: 12px; color: #C9D0F0; }
  .rg-srvact { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 6px; }
  .rg-srvact .rg-mini { font-size: 15px; padding: 8px 16px; }
  /* v41 가게 사람 (초상화 + 말풍선) */
  .rg-npc { display: flex; gap: 12px; align-items: center; background: linear-gradient(90deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); border: 2px solid #0A0E24; border-radius: 12px; padding: 8px 12px; margin: 0 0 10px; }
  .rg-npc img { width: 64px; height: 64px; flex: none; image-rendering: pixelated; border-radius: 10px; background: radial-gradient(circle at 50% 30%, #5C86FF, #2F3FA0); border: 2px solid #0A0E24; }
  .rg-npc b { font-family: var(--f-display); font-size: 17px; }
  .rg-npc p { position: relative; margin: 4px 0 0 6px; background: #FFFDF4; color: #1D2340; border: 2px solid #0A0E24; border-radius: 10px; padding: 6px 10px; font-size: 14px; line-height: 1.45; }
  .rg-npc p::before { content: ''; position: absolute; left: -9px; top: 10px; border: 7px solid transparent; border-right-color: #0A0E24; border-left: 0; }
  .rg-npc p::after { content: ''; position: absolute; left: -5px; top: 12px; border: 5px solid transparent; border-right-color: #FFFDF4; border-left: 0; }
  /* v41 가방 창 */
  .rg-inv { display: grid; grid-template-columns: 272px 1fr; gap: 12px; align-items: start; }
  .rg-doll, .rg-bag { background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,0,0,.14)); border: 2px solid #0A0E24; border-radius: 14px; padding: 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,.12); }
  .rg-dollgrid { display: grid; grid-template-columns: 64px 1fr 64px; grid-template-rows: repeat(3, 70px); grid-template-areas: "helmet fig weapon" "armor fig ring" "boots fig ."; gap: 6px; }
  .rg-fig { grid-area: fig; position: relative; border-radius: 12px; background: radial-gradient(ellipse at 50% 88%, rgba(255,210,63,.38), transparent 40%), radial-gradient(circle at 50% 35%, #4A5AB0, #1A2148 75%); border: 2px solid #0A0E24; display: grid; place-items: center; overflow: hidden; }
  .rg-fig img { height: 174px; image-rendering: pixelated; filter: drop-shadow(0 4px 0 rgba(0,0,0,.35)); }
  .rg-fig .lv { position: absolute; left: 6px; top: 6px; background: #FFD23F; color: #1D2340; border: 2px solid #0A0E24; border-radius: 6px; font-size: 12px; padding: 0 6px; font-family: var(--f-display); }
  .rg-eqs { position: relative; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #2E3870, #0F1430 70%); border: 2px solid var(--c); border-radius: 10px; cursor: pointer; padding: 0 0 10px; color: #EEF1FF; transition: transform .1s, filter .1s; }
  .rg-eqs img { width: 42px; height: 42px; image-rendering: pixelated; }
  .rg-eqs small { position: absolute; bottom: 2px; left: 0; right: 0; font-size: 10px; color: #AEB7E0; text-align: center; }
  .rg-eqs.empty { border-style: dashed; border-color: #3A4270; }
  .rg-eqs img.ph { opacity: .2; filter: grayscale(1) brightness(1.6); }
  .rg-eqs.rare, .rg-cell.rare { box-shadow: 0 0 10px var(--g), inset 0 0 0 1px var(--g); }
  .rg-eqs.sel, .rg-cell.sel { outline: 3px solid #FFD23F; outline-offset: 1px; }
  .rg-statgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 10px 0; }
  .rg-statgrid div { background: #141A3C; border: 2px solid #0A0E24; border-radius: 8px; padding: 3px 7px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  .rg-statgrid b { color: #FFFFFF; font-family: var(--f-display); font-size: 14px; }
  .rg-bag .rg-tabs { margin-top: 0; }
  .rg-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
  .rg-cell { position: relative; aspect-ratio: 1; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #2A3266, #12183A 75%); border: 2px solid var(--c, #2A3260); border-radius: 8px; padding: 0; cursor: pointer; transition: transform .1s, filter .1s; min-width: 0; }
  .rg-cell.empty { background: rgba(10,14,36,.5); border: 2px solid #20264E; cursor: default; box-shadow: inset 0 2px 4px rgba(0,0,0,.4); }
  .rg-cell img { width: 78%; height: 78%; image-rendering: pixelated; }
  .rg-cell .n { position: absolute; right: 3px; bottom: 0; font-size: 12px; font-family: var(--f-display); color: #FFFFFF; text-shadow: 0 0 2px #0A0E24, 0 0 3px #0A0E24; }
  .rg-cell .lk { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(210,52,58,.88); font-size: 10px; color: #FFFFFF; border-radius: 0 0 6px 6px; line-height: 1.3; }
  .rg-cell.off img { filter: grayscale(.7) brightness(.8); }
  .rg-cell:not(.empty):hover, .rg-eqs:hover { transform: translateY(-1px); filter: brightness(1.15); }
  .rg-detail { display: flex; gap: 10px; align-items: center; margin-top: 10px; background: #141A3C; border: 2px solid #0A0E24; border-radius: 10px; padding: 8px 10px; min-height: 60px; }
  .rg-detail.hint { display: block; color: #AEB7E0; font-size: 13px; line-height: 1.5; }
  .rg-detail .grow { flex: 1; min-width: 0; }
  .rg-detail .nm { display: block; font-size: 15px; } .rg-detail .nm.rare { color: #E0C8FF; } .rg-detail .nm small { color: #9AF0B0; font-size: 11px; }
  .rg-detail .ds { display: block; color: #AEB7E0; font-size: 12px; }
  .rg-detail .cmp { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; margin-top: 3px; }
  .rg-detail em { font-style: normal; } .rg-detail em.up { color: #3DDC84; } .rg-detail em.dn { color: #FF8A8E; }
  .rg-side .panel { margin: 0; }
  @media (max-height: 520px) {   /* 휴대폰 가로: 게임판을 화면 높이에 꽉 차게 */
    .rg-page .cabinet { max-width: min(100%, calc((100svh - 14px) * 1.7778 + 8px)); padding: 3px; border-radius: 8px; border-width: 2px; }
    .rg-page .screen { border-width: 1px; }
    .rg-detailgrid { grid-template-columns: repeat(4, 1fr); }
    .rg-panel { position: fixed; inset: 6px 8% 6px 8%; max-height: none; z-index: 60; }
  }
  @media (max-width: 760px) {
    .rg-inv { grid-template-columns: 1fr; } .rg-grid { grid-template-columns: repeat(6, 1fr); } .rg-srvs { grid-template-columns: repeat(2, 1fr); }
    .rg-statwin { grid-template-columns: 1fr; } .rg-detailgrid { grid-template-columns: repeat(2, 1fr); } .rg-trade { grid-template-columns: 1fr; }
    .rg-panel { position: fixed; inset: auto 0 0 0; max-height: 72svh; border-radius: 14px 14px 0 0; z-index: 60; }
    .rg-msg { font-size: 12px; }
  }`;

  /* ================= 본체 ================= */
  window.GoRPG = {
    render(el, A) {
      BGM.load(GAME);
      if (!document.getElementById('rgCss')) { const st = document.createElement('style'); st.id = 'rgCss'; st.textContent = CSS; document.head.appendChild(st); }
      el.innerHTML = `
        <div class="rg-page">
          <div class="play-head"><a class="back" href="#home">← 게임 목록</a><span class="cat">RPG</span><h1>${CFG.name}</h1></div>
          <div class="rg-wrap">
            <div class="cabinet cab-blue" style="--cw:960px;--ar:1.7778"><div class="screen" id="rgScreen" tabindex="0">
              <canvas id="rgCanvas" aria-label="${CFG.name} 게임 화면"></canvas>
              <div class="rg-msg" id="rgMsg" hidden></div>
              <button type="button" class="rg-full" id="rgFull" aria-label="화면 크게 보기"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
              <div class="rg-panel" id="rgPanel" hidden></div>
            </div></div>
            <div class="rg-bar">
              <button type="button" class="btn" data-rg="stat">스탯 (C)</button>
              <button type="button" class="btn" data-rg="inv">가방 · 장비 (I)</button>
              <button type="button" class="btn" data-rg="skill">마법 (K)</button>
              <button type="button" class="btn" data-rg="servers">서버</button>
              <button type="button" class="btn" data-rg="help">도움말</button>
              <button type="button" class="btn" data-rg="full">크게 보기</button>
              <a class="btn" href="#scfight" style="background:#9A5AE0;color:#fff">Skillcom Fight 대결</a>
              <button type="button" class="btn btn-sun" data-rg="save">지금 저장</button>
            </div>
            <div class="rg-side">
              <div class="panel"><h3>레벨 랭킹</h3><ol class="rank" id="rgRank"><li class="empty">불러오는 중…</li></ol><p class="small" id="rgMine"></p></div>
            </div>
          </div>
        </div>`;
      const $ = s => el.querySelector(s);
      const canvas = $('#rgCanvas'), screenEl = $('#rgScreen'), panel = $('#rgPanel'), msgEl = $('#rgMsg');
      let ctx = window.GoPixel.setup(canvas, W, H);
      const onResize = () => { ctx = window.GoPixel.setup(canvas, W, H); };
      window.addEventListener('resize', onResize);

      let S = null, alive = true, raf = 0, last = 0, loadingText = '';
      const G = { map: null, px: 0, py: 0, fx: 1, fy: 0, face: 1, walk: 0, moving: false, mons: [], shots: [], fxs: [], texts: [], pools: [],
        atkCd: 0, cds: {}, inv: 0, shield: null, dash: null, lastHit: 99, dead: false, paused: true, saveT: 0, srvT: 0, dirty: false,
        keys: {}, touch: false, joy: null, btnDown: {}, onDoor: null, lastSubmit: 0, playMark: 0, shake: 0, hurt: 0, flash: 0, hitstop: 0, title: null };
      Fx.onBoom = n => { G.shake = Math.max(G.shake, n); };

      /* ---------- 능력치 ---------- */
      // 능력치 = 레벨 기본 + 스탯(힘·민첩·지혜) + 장비.  part = 창에서 '기본 + 스탯 + 장비' 로 나눠 보여 줄 때
      function stats(part) {
        const F = D.F, T = D.STAT, lv = S.lv, a = S.stat || {};
        const base = { atk: F.atk(lv), mag: F.mag(lv), def: F.def(lv), hp: F.hp(lv), mp: F.mp(lv), spd: 0, dmg: 0, mpRegen: 100, crit: T.baseCrit };
        const sta = { dmg: (a.str || 0) * T.str.dmg, spd: (a.dex || 0) * T.dex.spd, mpRegen: (a.int || 0) * T.int.mpRegen, hp: Math.round(base.hp * (a.vit || 0) * T.vit.hpPct / 100) };
        const gear = {}; Object.values(S.eq).forEach(id => { const it = ITEMS[id]; if (it && it.st) Object.keys(it.st).forEach(k => { gear[k] = (gear[k] || 0) + it.st[k]; }); });
        if (part) return { base, sta, gear };
        const st = {}; Object.keys(base).forEach(k => { st[k] = base[k] + (sta[k] || 0) + (gear[k] || 0); });
        ['atk', 'mag', 'def', 'hp', 'mp'].forEach(k => { st[k] = Math.round(st[k]); });
        st.atkCd = T.atkCd;
        return st;
      }
      let ST = null; const restat = () => { ST = stats(); S.hp = clamp(S.hp, 0, ST.hp); S.mp = clamp(S.mp, 0, ST.mp); };

      /* ---------- 가방 ---------- */
      const count = id => (S.inv.find(x => x.id === id) || { n: 0 }).n;
      function addItem(id, n) {
        n = n || 1; const e = S.inv.find(x => x.id === id);
        if (e) { e.n += n; return true; }
        if (S.inv.length >= 40) { say('가방이 가득 찼어요! (40칸)'); return false; }
        S.inv.push({ id, n }); return true;
      }
      function takeItem(id, n) { n = n || 1; const e = S.inv.find(x => x.id === id); if (!e || e.n < n) return false; e.n -= n; if (!e.n) S.inv.splice(S.inv.indexOf(e), 1); return true; }

      /* ---------- 글자 띄우기 ---------- */
      let msgT = 0;
      function say(t, sec) { msgEl.textContent = t; msgEl.hidden = false; msgT = sec || 2.4; }
      const float = (x, y, text, color, big) => G.texts.push({ x, y, text, color: color || '#FFFFFF', t: 0, big });

      /* ---------- 지도 들어가기 ---------- */
      function enter(id, side, quiet) {
        const M = MAPBY[id]; if (!M) return;
        const map = getMap(id);
        G.map = map; S.map = id; G.room = null; G.npcs = M.kind === 'village' ? villagers(map) : []; G.onNpc = null; G.shots = []; G.fxs = []; G.pools = []; G.texts = []; Fx.reset(); G.hpGhost = null;
        if (!quiet) G.title = { t: 0, text: M.kind === 'village' ? M.name : M.name, sub: M.kind === 'village' ? (D.REGIONS[M.region].castle ? '마지막 마을 · 왕성' : `마을 ${M.region + 1}`) : `사냥터 ${M.no} · 권장 Lv.${M.rec}${M.boss ? ' · 보스' : ''}` };
        const p = side && typeof side === 'object' ? side : side === 'R' ? map.startR : side === 'door' ? doorFront(map) : side === 'pos' && S.x ? { x: S.x, y: S.y } : map.startL;
        G.px = p.x; G.py = p.y;
        if (solidAt(map, G.px, G.py)) { const q = map.startL; G.px = q.x; G.py = q.y; }
        if (!S.visited.includes(id)) S.visited.push(id);
        if (M.kind === 'village') { S.home = id; spawnNone(); }
        else { spawnAll(); if (M.rec > S.lv + 6) say(`권장 Lv.${M.rec} — 지금 레벨로는 위험해요!`, 3); }
        G.onDoor = null; markDirty(!quiet); netRoom();
      }
      // v41 건물 안: 문으로 걸어 들어가면 실내 지도 · 아래 가운데 문으로 나가면 그 건물 문 앞
      function enterRoom(b) {
        const vmap = G.map, back = { x: (b.door.x + 0.5) * TS, y: (b.door.y + 1.9) * TS }, room = getRoom(b.type, vmap.M.region);
        G.map = room; G.room = { type: b.type, back, village: S.map }; G.npcs = room.npcs.map(n => Object.assign({}, n)); G.onNpc = null;
        G.mons = []; G.shots = []; G.fxs = []; G.pools = []; G.texts = []; Fx.reset(); G.hpGhost = null;
        G.px = room.startL.x; G.py = room.startL.y; G.fx = 0; G.fy = -1; G.onDoor = null; G.keys = {};
        const main = G.npcs.find(n => !n.guard);
        G.title = null; say(main ? `${main.def.name}에게 가까이 가면 이야기할 수 있어요` : room.M.name, 2.6);
        netRoom();
      }
      /* ---------- v42 온라인 (net.js) ---------- */
      const roomKey = () => (G.room ? 'r-' + G.room.type + '-' + G.map.M.region : S.map);
      const netRoom = () => { if (net && net.joined) net.setRoom(roomKey()); };
      let net = null;
      function makeNet() {
        net = window.GoRPGNet.create({
          me: () => ({ nick: Hub.user ? Hub.user.nickname : '손님', lv: S.lv, av: Hub.user ? Hub.user.avatar : AV.normalize({}), eq: S.eq, hide: S.hide, x: G.px, y: G.py }),
          onPeers: () => {},
          onFx: (m, p) => peerFx(m, p),
          onTrade: (m, p) => onTrade(m, p),
          onLeave: cid => { if (G.trade && G.trade.with === cid) { say('상대가 떠나서 거래가 취소됐어요', 2.6); endTrade(false); } },
          onKick: why => { say(why === 'full' ? '서버 인원이 가득 차서 나왔어요. 다른 서버를 골라 주세요' : '서버 연결이 끊겼어요. 다시 골라 주세요', 4); if (!pane) openPanel('servers'); }
        });
      }
      /* ---------- v44 1:1 거래 ----------
       *  같은 지도에 있는 사람을 누르거나(F 키: 가까운 사람) → 거래 신청 → 상대가 수락 → 서로 아이템·골드를 올림
       *  둘 다 '확인'을 누르면 교환. 올린 것이 바뀌면 확인이 풀림. 입고 있는 장비는 못 올림(가방에 있는 것만)
       *  확인은 '두 사람이 올린 것 전체'를 글자로 만든 열쇠(key)로 맞춰 봄 → 둘이 본 내용이 같을 때만 교환 */
      const offerOf = o => ({ items: Object.keys(o.items).filter(id => o.items[id] > 0).sort().map(id => [id, o.items[id]]), gold: o.gold | 0 });
      const tradeKey = () => { const T = G.trade, a = JSON.stringify(offerOf(T.mine)), b = JSON.stringify(offerOf(T.theirs)); return Hub.clientId < T.with ? a + '|' + b : b + '|' + a; };
      function cleanOffer(m) {
        const items = {}; (Array.isArray(m.items) ? m.items : []).slice(0, 12).forEach(x => { if (Array.isArray(x) && ITEMS[x[0]]) items[x[0]] = clamp(Math.floor(+x[1] || 0), 0, 999); });
        return { items, gold: clamp(Math.floor(+m.gold || 0), 0, 1e9) };
      }
      function askTrade(pp) {
        if (!net || !net.joined) return;
        if (G.trade) { say('이미 거래 중이에요', 2); return; }
        openPanel('tradeAsk', { pp });
      }
      function sendOffer() { const T = G.trade; T.myOk = false; T.theirOk = false; const o = offerOf(T.mine); net.trade({ k: 'offer', to: T.with, items: o.items, gold: o.gold }); }
      function startTrade(cid, nick) {
        G.trade = { with: cid, nick, state: 'open', mine: { items: {}, gold: 0 }, theirs: { items: {}, gold: 0 }, myOk: false, theirOk: false };
        tab.trSel = null; openPanel('trade');
      }
      function endTrade(tell) {
        const T = G.trade; if (!T) return;
        if (tell) net.trade({ k: 'cancel', to: T.with });
        G.trade = null; if (pane === 'trade' || pane === 'tradeIn') { pane = null; panel.hidden = true; G.paused = false; }
      }
      function roomFor(theirs, mine) {   // 받을 물건이 가방 40칸에 들어가나
        let slots = S.inv.length;
        Object.keys(mine.items).forEach(id => { if (mine.items[id] > 0 && mine.items[id] >= count(id)) slots--; });
        Object.keys(theirs.items).forEach(id => { if (theirs.items[id] > 0 && !(count(id) - (mine.items[id] || 0) > 0)) slots++; });
        return slots <= 40;
      }
      function applyTrade() {
        const T = G.trade; if (!T) return;
        const ok = Object.keys(T.mine.items).every(id => count(id) >= T.mine.items[id]) && S.gold >= T.mine.gold;
        if (!ok) { say('가방이 바뀌어서 거래를 할 수 없어요', 3); endTrade(true); return; }
        Object.keys(T.mine.items).forEach(id => { if (T.mine.items[id] > 0) takeItem(id, T.mine.items[id]); });
        S.gold -= T.mine.gold;
        Object.keys(T.theirs.items).forEach(id => { const n = T.theirs.items[id]; if (n > 0) { const e = S.inv.find(x => x.id === id); if (e) e.n += n; else S.inv.push({ id, n }); } });
        S.gold += T.theirs.gold;
        const nick = T.nick; G.trade = null; save(true); markDirty(true);
        if (pane === 'trade') { pane = null; panel.hidden = true; G.paused = false; }
        say(`${nick}님과 거래 완료!`, 3); Fx.coins(G.px, G.py - 30, 8);
      }
      function onTrade(m, p) {
        const T = G.trade, nick = p.nick || '상대';
        if (m.k === 'req') {
          if (T || pane || G.dead) { net.trade({ k: 'busy', to: m.cid }); return; }
          openPanel('tradeIn', { cid: m.cid, nick }); return;
        }
        if (!T || T.with !== m.cid) return;
        if (m.k === 'busy' || m.k === 'no') { say(m.k === 'busy' ? `${nick}님은 지금 다른 일을 하고 있어요` : `${nick}님이 거래를 거절했어요`, 2.6); G.trade = null; return; }
        if (m.k === 'yes' && T.state === 'wait') { startTrade(m.cid, nick); return; }
        if (m.k === 'cancel') { say(`${nick}님이 거래를 취소했어요`, 2.6); endTrade(false); return; }
        if (m.k === 'offer') { T.theirs = cleanOffer(m); T.myOk = false; T.theirOk = false; if (pane === 'trade') renderPanel(); return; }
        if (m.k === 'ok') { T.theirOk = m.key === tradeKey(); if (T.myOk && T.theirOk && Hub.clientId < T.with) { net.trade({ k: 'commit', to: T.with, key: tradeKey() }); applyTrade(); return; } if (pane === 'trade') renderPanel(); return; }
        if (m.k === 'unok') { T.theirOk = false; if (pane === 'trade') renderPanel(); return; }
        if (m.k === 'commit') { if (T.myOk && m.key === tradeKey()) applyTrade(); return; }
      }
      // 화면 좌표(캔버스) → 그 자리에 있는 다른 플레이어
      function peerAt(q) {
        if (!net || !net.peers.size) return null;
        const wx = q.x + cam.x, wy = q.y + cam.y; let best = null, bd = 40;
        net.peers.forEach(pp => { if (wy < pp.y - 70 || wy > pp.y + 8) return; const d = Math.abs(wx - pp.x); if (d < bd) { bd = d; best = pp; } });
        return best;
      }
      // 다른 사람이 쓴 마법: 그림만 (피해 없음)
      function peerFx(m, p) {
        const sk = skill(m.id); if (!sk) return;
        const els = sk.els, x = m.x, y = m.y, dx = m.dx || 1, dy = m.dy || 0, col = ELEM[els[0]].color, col2 = ELEM[els[els.length - 1]].light;
        Fx.castCircle(p.x, p.y, els, !!sk.fusion);
        if (sk.kind === 'bolt') { const n = sk.count || 1, sp = 430 * (sk.speed || 1); for (let i = 0; i < n; i++) { const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.18; G.shots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1, dmg: 0, els, pierce: true, hit: new Set(), r: 9, color: col, color2: col2, mine: false, ghost: true }); } }
        else if (sk.kind === 'nova') Fx.nova(x, y, sk.radius || 120, els);
        else if (sk.kind === 'beam') Fx.beam(x, y, dx, dy, sk.len || 300, sk.w || 30, els);
        else if (sk.kind === 'rain') { for (let i = 0; i < (sk.count || 5); i++) Fx.fall(x + dx * 160 + rand(-90, 90), y + dy * 160 + rand(-60, 60), sk.radius || 60, els, i * 0.1); }
        else if (sk.kind === 'pool') Fx.nova(x + dx * 120, y + dy * 120, (sk.radius || 90) * 0.7, els);
        else if (sk.kind === 'heal') Fx.heal(p.x, p.y - 28, sk.pow > 0.4);
        else if (sk.kind === 'shield') Fx.burst(p.x, p.y - 28, 16, Fx.pal(els[0]), { min: 60, max: 140, shape: 'star', lmin: 0.4, lmax: 0.7 });
      }
      function leaveRoom() {
        const r = G.room; if (!r) return;
        enter(r.village, r.back, true);
        G.onDoor = G.map.doors.find(d => d.type === r.type) || null; G.fx = 0; G.fy = 1;
      }
      function doorFront(map) {
        const b = map.buildings.find(x => x.type === 'chief') || map.buildings[0];
        return { x: (b.door.x + 0.5) * TS, y: (b.door.y + 1.9) * TS };
      }
      function spawnNone() { G.mons = []; }
      function spawnAll() {
        const M = G.map.M; G.mons = [];
        if (M.boss) {
          G.mons.push(makeMon(M.mon, M.rec + 2, true));
          const minion = D.MAPS.find(m => m.kind === 'field' && m.no === M.no - 1);
          for (let i = 0; i < 6; i++) G.mons.push(makeMon(minion.mon, M.rec - 1));
        } else for (let i = 0; i < 12; i++) G.mons.push(makeMon(M.mon, M.rec - 1 + (Math.random() < 0.5 ? 0 : 1)));
      }
      function spawnPoint() {
        const sp = G.map.spawns; let p = pick(sp);
        for (let i = 0; i < 12 && Math.hypot(p.x - G.px, p.y - G.py) < 260; i++) p = pick(sp);
        return p;
      }
      function makeMon(def, lvl, boss) {
        lvl = clamp(lvl, 1, D.MAX_LV); const F = D.F, B = F.boss;
        const p = boss ? { x: G.map.w * TS * 0.62, y: (G.map.mid + 1) * TS } : spawnPoint();
        const sc = boss ? 6 : 3, spr = monSprite(def, sc);
        const hp = Math.round(F.monHp(lvl) * (boss ? B.hp : 1));
        return { def, name: def.name, lvl, boss: !!boss, kind: boss ? 'boss' : def.kind, x: p.x, y: p.y, hx: p.x, hy: p.y, hp, max: hp,
          atk: Math.round(F.monAtk(lvl) * (boss ? B.atk : 1)), mdef: F.monDef(lvl), spr, r: boss ? 30 : 14,
          exp: Math.round(F.monExp(lvl) * (boss ? B.exp : 1)), gold: Math.round(F.monGold(lvl) * (boss ? B.gold : 1)),
          spd: boss ? 70 : def.kind === 'shoot' ? 60 : 80, cd: rand(0.5, 1.5), wt: 0, wx: 0, wy: 0, aggro: false, flash: 0,
          burn: null, slow: 0, stun: 0, dead: false, respawn: 0, slam: null };
      }

      /* ---------- 전투: 피해 계산 ---------- */
      function hitMon(m, base, els, opt) {
        if (m.dead) return 0;
        opt = opt || {};
        const diff = m.lvl - S.lv, lvF = diff > 0 ? Math.max(0.4, 1 - 0.06 * diff) : 1 + Math.min(0.3, -diff * 0.03);
        let dmg = (base * rand(0.9, 1.1) * (1 + (ST.dmg || 0) / 100) - m.mdef * 0.5) * lvF;   // v44 힘 → 주는 피해 +%
        if ((els || []).some(e => ELEM[e].fx === 'heavy')) dmg *= 1.2;
        const crit = Math.random() < ST.crit / 100; if (crit) dmg *= D.STAT.critDmg;
        dmg = Math.max(1, Math.round(dmg));
        m.hp -= dmg; m.flash = 0.12; m.aggro = true; m.knock = (m.x < G.px ? -1 : 1) * (crit ? 6 : 3);
        const elc = els && els.length ? Fx.pal(els[0])[1] : '#FFFFFF';
        G.texts.push({ x: m.x + rand(-8, 8), y: m.y - m.spr.h - 4, text: (crit ? '치명! ' : '') + dmg, color: crit ? '#FFD23F' : elc, t: 0, big: crit, dmg: true });
        Fx.hit(m.x, m.y - m.spr.h / 2, els, crit);
        if (crit) { G.shake = Math.max(G.shake, 4); G.hitstop = 0.05; }
        (els || []).forEach(e => {
          const fx = ELEM[e].fx;
          if (fx === 'burn') m.burn = { t: 3, dps: dmg * 0.12, tick: 0.5 };
          else if (fx === 'slow') m.slow = 2.5;
          else if (fx === 'stun' && !opt.noStun) m.stun = m.boss ? 0.25 : 0.7;
          else if (fx === 'push') { const a = Math.atan2(m.y - G.py, m.x - G.px), k = m.boss ? 8 : 46; moveMon(m, Math.cos(a) * k, Math.sin(a) * k); }
          else if (fx === 'holy') S.hp = Math.min(ST.hp, S.hp + Math.max(1, Math.round(dmg * 0.03)));
        });
        if (m.hp <= 0) killMon(m);
        return dmg;
      }
      function killMon(m) {
        m.dead = true; m.respawn = m.boss ? (CFG.bossRespawnSec || 30) : (CFG.respawnSec || 3); S.kills++;   // v43 다시 나오는 시간 단축
        const low = m.lvl < S.lv - 10 ? 0.2 : 1;
        gainExp(Math.round(m.exp * low)); S.gold += m.gold; float(m.x, m.y - m.spr.h - 18, `+${fmtN(m.gold)}G`, '#FFD23F');
        Fx.death(m.x, m.y - m.spr.h / 2, m.def.colors, m.boss); Fx.coins(m.x, m.y - m.spr.h / 2, m.boss ? 14 : Math.min(6, 2 + Math.floor(m.gold / 40)));
        if (m.boss) { G.shake = 10; G.flash = 0.35; G.hitstop = 0.12; G.title = { t: 0, text: '보스 처치!', sub: m.name }; }
        // 떨어뜨리는 물건
        const M = G.map.M, t = M.region, k = (M.no - 1) % 10, drops = [];
        const gear = rare => { const ids = Object.keys(ITEMS).filter(id => { const it = ITEMS[id]; return it.slot && it.tier === t && it.rare === rare; }); return pick(ids); };
        if (m.boss) { drops.push(gear(Math.random() < 0.5)); drops.push('hp' + (t + 1), 'hp' + (t + 1), 'mp' + (t + 1)); S.bosses[M.id] = (S.bosses[M.id] || 0) + 1; bossReward(); }
        else {
          if (Math.random() < 0.025) drops.push(gear(false));
          if (k >= 5 && Math.random() < 0.01) drops.push(gear(true));
          if (Math.random() < 0.06) drops.push((Math.random() < 0.6 ? 'hp' : 'mp') + (t + 1));
        }
        drops.forEach((id, i) => { if (addItem(id, 1)) setTimeout(() => float(m.x, m.y - m.spr.h - 34 - i * 14, '획득: ' + ITEMS[id].name, ITEMS[id].rare ? '#C8A8FF' : '#9AE6FF'), i * 150); });
        if (drops.some(id => ITEMS[id].slot)) say('장비를 얻었어요! 가방(I)에서 입어 보세요');
        markDirty(drops.length > 0);   // 얻은 물건은 곧 계정에 저장 (다른 서버·기기에서도 그대로)
      }
      function gainExp(n) {
        if (S.lv >= D.MAX_LV) return;
        S.exp += n;
        let up = false;
        while (S.lv < D.MAX_LV && S.exp >= D.F.need(S.lv)) { S.exp -= D.F.need(S.lv); S.lv++; S.sp += CFG.statPerLevel || 2; up = true; }
        if (S.lv >= D.MAX_LV) S.exp = 0;
        if (up) {
          restat(); S.hp = ST.hp; S.mp = ST.mp;
          float(G.px, G.py - 70, `레벨 업! Lv.${S.lv}`, '#FFE45C', true);
          Fx.levelUp(G.px, G.py); G.flash = 0.25;
          const learnable = Object.values(SKILLS).filter(s => s.lv === S.lv);
          if (learnable.length) say(`Lv.${S.lv} — 마법 학교에서 '${learnable[0].name}'을(를) 배울 수 있어요!`, 3.5);
          else say(`스탯 포인트 +${CFG.statPerLevel || 2}! 왼쪽 위 얼굴을 눌러 원하는 스탯을 올려요`, 3.2);
          submitRank(); markDirty(true); if (net) net.retrack();
        }
      }
      function hitPlayer(dmg0, lvl) {
        if (G.inv > 0 || G.dead) return;
        const diff = lvl - S.lv, lvF = diff > 0 ? 1 + 0.08 * diff : Math.max(0.5, 1 + 0.05 * diff);
        let dmg = (dmg0 * rand(0.9, 1.1) - ST.def * 0.5) * lvF;
        if (G.shield) dmg *= 1 - G.shield.pow;
        dmg = Math.max(1, Math.round(dmg));
        S.hp -= dmg; G.inv = 0.35; G.lastHit = 0; G.hurt = 0.22; G.shake = Math.max(G.shake, 3);
        G.texts.push({ x: G.px + rand(-8, 8), y: G.py - 64, text: '-' + dmg, color: '#FF6A6E', t: 0, dmg: true });
        Fx.hit(G.px, G.py - 28, ['fire'], false);
        if (S.hp <= 0) { S.hp = 0; die(); }
      }
      function die() {
        G.dead = true; const loss = Math.round(D.F.need(S.lv) * (CFG.deathExpLoss || 0.05));
        S.exp = Math.max(0, S.exp - loss);
        openPanel('dead', { loss });
      }

      /* ---------- 마법 쓰기 ---------- */
      function nearest(range, from) {
        from = from || { x: G.px, y: G.py - 20 }; let best = null, bd = range;
        G.mons.forEach(m => { if (m.dead) return; const d = Math.hypot(m.x - from.x, m.y - m.spr.h / 2 - from.y); if (d < bd) { bd = d; best = m; } });
        return best;
      }
      function aimDir(range) {
        const m = nearest(range); if (m) { const a = Math.atan2(m.y - m.spr.h / 2 - (G.py - 20), m.x - G.px); return [Math.cos(a), Math.sin(a)]; }
        const l = Math.hypot(G.fx, G.fy) || 1; return [G.fx / l, G.fy / l];
      }
      function cast(slot) {
        const id = S.slots[slot]; if (!id) { say(`${slot + 1}번 칸이 비어 있어요. 마법 창(K)에서 넣어 주세요`); return; }
        const sk = skill(id); if (!sk) return;
        if (G.map.M.kind !== 'field' && sk.kind !== 'heal' && sk.kind !== 'shield') { say(G.room ? '건물 안에서는 공격 마법을 쓸 수 없어요' : '마을에서는 공격 마법을 쓸 수 없어요'); return; }
        if ((G.cds[id] || 0) > 0) return;
        if (S.mp < sk.mp) { say('마나가 부족해요 (E: 마나 포션)'); return; }
        S.mp -= sk.mp; G.cds[id] = sk.cd; Fx.castCircle(G.px, G.py, sk.els, !!sk.fusion);
        if (net && net.joined) { const [adx, ady] = aimDir(sk.len || 420); net.cast({ id, x: Math.round(G.px), y: Math.round(G.py - 22), dx: +adx.toFixed(2), dy: +ady.toFixed(2) }); }
        const els = sk.els, col = ELEM[els[0]].color, col2 = ELEM[els[els.length - 1]].light, base = ST.mag * sk.pow;
        const ox = G.px, oy = G.py - 22;
        if (sk.kind === 'bolt') {
          const [dx, dy] = aimDir(420), n = sk.count || 1, sp = 430 * (sk.speed || 1);
          for (let i = 0; i < n; i++) { const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.18; G.shots.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1, dmg: base, els, pierce: !!sk.pierce, hit: new Set(), r: 9, color: col, color2: col2, mine: true }); }
        } else if (sk.kind === 'nova') {
          const r = sk.radius || 120; Fx.nova(ox, oy, r, els); G.shake = Math.max(G.shake, r > 150 ? 6 : 3);
          G.mons.forEach(m => { if (!m.dead && Math.hypot(m.x - ox, m.y - m.spr.h / 2 - oy) < r + m.r) hitMon(m, base, els); });
        } else if (sk.kind === 'beam') {
          const [dx, dy] = aimDir(sk.len || 300), len = sk.len || 300, w = sk.w || 30;
          Fx.beam(ox, oy, dx, dy, len, w, els); G.shake = Math.max(G.shake, 3);
          G.mons.forEach(m => { if (m.dead) return; const mx = m.x - ox, my = m.y - m.spr.h / 2 - oy, along = mx * dx + my * dy, off = Math.abs(mx * dy - my * dx); if (along > -10 && along < len && off < w / 2 + m.r) hitMon(m, base, els); });
        } else if (sk.kind === 'rain') {
          const n = sk.count || 5, r = sk.radius || 60, targets = G.mons.filter(m => !m.dead && Math.hypot(m.x - ox, m.y - oy) < 420).sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy));
          for (let i = 0; i < n; i++) {
            const tg = targets[i % Math.max(1, targets.length)];
            const p = tg ? { x: tg.x + rand(-20, 20), y: tg.y - tg.spr.h / 2 + rand(-20, 20) } : { x: ox + G.fx * 160 + rand(-90, 90), y: oy + G.fy * 160 + rand(-70, 70) };
            G.fxs.push({ type: 'strike', x: p.x, y: p.y, r, t: -i * 0.1, dur: 0.54, done: false, dmg: base, els }); Fx.fall(p.x, p.y, r, els, i * 0.1);
          }
        } else if (sk.kind === 'pool') {
          const m = nearest(360), p = m ? { x: m.x, y: m.y - 8 } : { x: ox + G.fx * 120, y: G.py + G.fy * 120 };
          G.pools.push({ x: p.x, y: p.y, r: sk.radius || 90, t: 0, dur: sk.dur || 4, tick: 0, dmg: base * 0.35, els, color: col, color2: col2 });
        } else if (sk.kind === 'dash') {
          const [dx, dy] = aimDir(sk.len || 220); G.dash = { dx, dy, left: sk.len || 220, hit: new Set(), dmg: base, els, color: col }; G.inv = 0.45;
        } else if (sk.kind === 'heal') {
          const v = Math.round(ST.hp * sk.pow); S.hp = Math.min(ST.hp, S.hp + v); float(G.px, G.py - 70, '+' + v, '#3DDC84', true);
          Fx.heal(G.px, G.py - 28, sk.pow > 0.4);
        } else if (sk.kind === 'shield') {
          G.shield = { pow: sk.pow, t: sk.dur || 6, color: col, el: els[0] }; Fx.burst(G.px, G.py - 28, 20, Fx.pal(els[0]), { min: 60, max: 160, shape: 'star', lmin: 0.4, lmax: 0.7 }); say(`${sk.name}: 받는 피해 ${Math.round(sk.pow * 100)}% 감소`, 1.6);
        }
      }
      function basicAttack() {
        if (G.atkCd > 0 || G.dead) return;
        G.atkCd = ST.atkCd;
        const staff = S.eq.weapon && ITEMS[S.eq.weapon].look === 'staff';
        const [dx, dy] = aimDir(staff ? 150 : 70);
        G.face = dx < 0 ? -1 : 1;
        Fx.slash(G.px, G.py - 24, dx, dy, staff);
        if (G.map.M.kind !== 'field') return;
        if (staff) { G.shots.push({ x: G.px, y: G.py - 24, vx: dx * 380, vy: dy * 380, life: 0.42, dmg: ST.atk * 0.6 + ST.mag * 0.5, els: [], look: ['light'], pierce: false, hit: new Set(), r: 7, color: '#C8A8FF', color2: '#FFFFFF', mine: true }); return; }
        G.mons.forEach(m => {
          if (m.dead) return; const mx = m.x - G.px, my = m.y - m.spr.h / 2 - (G.py - 24), d = Math.hypot(mx, my);
          if (d < 58 + m.r && (d < 24 + m.r || (mx * dx + my * dy) / (d || 1) > 0.2)) hitMon(m, ST.atk, []);
        });
      }
      function usePotion(kind) {
        const tiers = POT_T, id = kind === 'hp'
          ? (tiers.map(t => 'hp' + t).filter(i => count(i) > 0).find(i => ITEMS[i].amount <= ST.hp - S.hp) || tiers.map(t => 'hp' + t).slice().reverse().find(i => count(i) > 0))
          : (tiers.map(t => 'mp' + t).filter(i => count(i) > 0).find(i => ITEMS[i].amount <= ST.mp - S.mp) || tiers.map(t => 'mp' + t).slice().reverse().find(i => count(i) > 0));
        if (!id) { say(kind === 'hp' ? '체력 포션이 없어요' : '마나 포션이 없어요'); return; }
        useItem(id);
      }
      function useItem(id) {
        const it = ITEMS[id]; if (!it || !count(id)) return;
        if (it.kind === 'hp') { if (S.hp >= ST.hp) { say('체력이 가득 찼어요'); return; } takeItem(id); S.hp = Math.min(ST.hp, S.hp + it.amount); float(G.px, G.py - 70, '+' + it.amount, '#3DDC84'); Fx.heal(G.px, G.py - 28, false); }
        else if (it.kind === 'mp') { if (S.mp >= ST.mp) { say('마나가 가득 찼어요'); return; } takeItem(id); S.mp = Math.min(ST.mp, S.mp + it.amount); float(G.px, G.py - 70, '+' + it.amount, '#6FA0FF'); Fx.burst(G.px, G.py - 28, 16, Fx.pal('water'), { min: 30, max: 90, up: -90, g: -40, shape: 'glow', lmin: 0.5, lmax: 0.9 }); }
        else if (it.kind === 'scroll') { if (G.map.M.kind !== 'field' && S.map === S.home) { say('이미 마을이에요'); return; } takeItem(id); closePanel(); enter(S.home, 'door'); }
        markDirty();
      }

      /* ---------- 움직임 ---------- */
      function canStand(map, x, y) { return !solidAt(map, x - 9, y - 4) && !solidAt(map, x + 9, y - 4) && !solidAt(map, x - 9, y) && !solidAt(map, x + 9, y); }
      function movePlayer(dx, dy) {
        const map = G.map;
        if (dx && canStand(map, G.px + dx, G.py)) G.px += dx;
        if (dy && canStand(map, G.px, G.py + dy)) G.py += dy;
        G.px = clamp(G.px, 4, map.w * TS - 4); G.py = clamp(G.py, 8, map.h * TS - 2);
      }
      function moveMon(m, dx, dy) {
        const map = G.map, ok = (x, y) => !solidAt(map, x - 8, y - 2) && !solidAt(map, x + 8, y - 2) && !solidAt(map, x, y);
        if (ok(m.x + dx, m.y)) m.x += dx; else m.wt = 0;
        if (ok(m.x, m.y + dy)) m.y += dy; else m.wt = 0;
      }

      /* ---------- 사람(NPC) ---------- */
      function talk(n) {
        if (n.guard || !['potion', 'school', 'chief', 'castle'].includes(n.key)) { n.say = pick(n.def.lines || ['…']); n.sayT = 3; return; }
        n.say = null; openPanel(n.key, { npc: n, hello: pick(n.def.hello) });
      }
      function updateNpcs(dt) {
        (G.npcs || []).forEach(n => {
          const d = Math.hypot(G.px - n.x, G.py - n.y);
          if (n.sayT > 0) n.sayT -= dt;
          if (n.walker) {   // 마을 사람: 큰길에서 좌우로 천천히 · 내가 가까이 오면 멈춰서 말 걸기
            if (d < 90) { n.vx = 0; if (!n.near) { n.near = true; n.say = pick(n.def.lines); n.sayT = 3.2; } }
            else { n.near = false; n.wt -= dt; if (n.wt <= 0) { n.wt = rand(1.5, 3.5); n.vx = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) * 32 : 0; if (Math.abs(n.x - n.hx) > 60) n.vx = Math.sign(n.hx - n.x) * 32; } }
            const nx = n.x + n.vx * dt; if (n.vx && !solidAt(G.map, nx + Math.sign(n.vx) * 10, n.y - 4)) n.x = nx; else n.vx = 0;
            n.moving = !!n.vx; if (n.vx) n.face = n.vx < 0 ? -1 : 1; else if (d < 160) n.face = G.px < n.x ? -1 : 1;
            n.walk = (n.walk || 0) + (n.moving ? dt : 0);
          } else if (!n.guard && d < 220) n.face = G.px < n.x ? -1 : 1;
        });
      }

      /* ---------- 한 틱 ---------- */
      function update(dt) {
        const map = G.map, M = map.M;
        S.play += dt; G.saveT += dt; G.srvT += dt; if (msgT > 0 && (msgT -= dt) <= 0) msgEl.hidden = true;
        G.atkCd -= dt; G.inv -= dt; G.lastHit += dt;
        G.shake = Math.max(0, G.shake * Math.pow(0.002, dt) - dt); G.hurt = Math.max(0, G.hurt - dt); G.flash = Math.max(0, G.flash - dt); if (G.title) G.title.t += dt;
        Fx.updateParts(dt, { x: G.px, y: G.py }); Fx.updateFx(dt); if (!G.room) Fx.ambient(M.region, dt, W, H, cam);
        Object.keys(G.cds).forEach(k => { G.cds[k] -= dt; });
        if (G.shield && (G.shield.t -= dt) <= 0) G.shield = null;
        // 자연 회복
        const reg = (M.kind !== 'field' ? 3 : 1) * (G.lastHit > 5 ? 1 : 0.25);
        S.hp = Math.min(ST.hp, S.hp + ST.hp * 0.012 * reg * dt); S.mp = Math.min(ST.mp, S.mp + ST.mp * 0.02 * reg * (ST.mpRegen / 100) * dt);   // v44 지혜 → 마나 회복

        // 입력 → 이동
        let mx = 0, my = 0; const K = G.keys;
        if (K.ArrowLeft || K.KeyA) mx--; if (K.ArrowRight || K.KeyD) mx++; if (K.ArrowUp || K.KeyW) my--; if (K.ArrowDown || K.KeyS) my++;
        if (G.joy && G.joy.on) { mx = G.joy.vx; my = G.joy.vy; }
        const ml = Math.hypot(mx, my);
        if (G.dash) {
          const step = Math.min(G.dash.left, 1100 * dt); movePlayer(G.dash.dx * step, G.dash.dy * step); G.dash.left -= step;
          G.mons.forEach(m => { if (!m.dead && !G.dash.hit.has(m) && Math.hypot(m.x - G.px, m.y - m.spr.h / 2 - (G.py - 20)) < 40 + m.r) { G.dash.hit.add(m); hitMon(m, G.dash.dmg, G.dash.els); } });
          if (G.dash.left <= 0) G.dash = null;
        } else if (ml > 0.15) {
          const sp = 150 * (1 + ST.spd / 100) * dt * Math.min(1, ml);
          G.fx = mx / ml; G.fy = my / ml; if (Math.abs(mx) > 0.2) G.face = mx < 0 ? -1 : 1;
          movePlayer(G.fx * sp, G.fy * sp); G.moving = true; G.walk += dt; if (Math.floor(G.walk * 8) !== Math.floor((G.walk - dt) * 8)) Fx.dust(G.px, G.py, M.region === 5 ? 'rgba(255,255,255,.8)' : 'rgba(255,240,210,.55)');
        } else { G.moving = false; G.walk = 0; }
        if (K.Space || K.KeyJ || G.btnDown.atk) basicAttack();
        if (net) { const vx = (G.px - (G.lpx == null ? G.px : G.lpx)) / dt, vy = (G.py - (G.lpy == null ? G.py : G.lpy)) / dt; G.lpx = G.px; G.lpy = G.py; net.tick(dt, { x: G.px, y: G.py, vx, vy, face: G.face, lv: S.lv }); }

        // 출구 (v41: 벽 판정 때문에 끝 6px 까지 못 가서 안 넘어가던 것 → 끝 16px 안에 들어오면 넘어감)
        if (G.px < 16 && map.exitL) { enter(map.exitL, 'R'); return; }
        if (G.px > map.w * TS - 16 && map.exitR) { enter(map.exitR, 'L'); return; }
        // 건물 안: 아래 문으로 나감 · 사람 가까이 가면 대화
        if (G.room) {
          if (G.py > (map.exit.y + 0.25) * TS && G.px > map.exit.x0 * TS - 8 && G.px < (map.exit.x1 + 1) * TS + 8) { leaveRoom(); return; }
          const near = G.npcs.find(n => Math.hypot(G.px - n.talk.x, G.py - n.talk.y) < n.talk.r);
          if (near && G.onNpc !== near) { G.onNpc = near; talk(near); return; }
          if (!near) G.onNpc = null;
        }
        updateNpcs(dt);
        // 건물 문
        //  문 칸에 들어가거나, 문 바로 아래 칸에서 위(↑)로 걸으면 들어감
        const ty = Math.floor((G.py - 4) / TS);
        const door = map.doors.find(b => Math.abs((b.door.x + 0.5) * TS - G.px) < 30 && (ty === b.door.y || (ty === b.door.y + 1 && my < -0.3)));
        if (door && G.onDoor !== door) { G.onDoor = door; enterRoom(door); return; }
        if (!door) G.onDoor = null;

        // 몬스터
        G.mons.forEach(m => {
          if (m.dead) { if ((m.respawn -= dt) <= 0) { const n = makeMon(m.def, m.lvl, m.boss); Object.assign(m, n); } return; }
          m.flash -= dt; m.cd -= dt; if (m.lunge > 0) m.lunge -= dt; if (m.knock) m.knock *= Math.pow(0.001, dt);
          if (m.burn) { m.burn.t -= dt; m.burn.tick -= dt; if (m.burn.tick <= 0) { m.burn.tick = 0.5; m.hp -= Math.max(1, Math.round(m.burn.dps * 0.5)); float(m.x, m.y - m.spr.h, Math.max(1, Math.round(m.burn.dps * 0.5)), '#FF9A3D'); if (m.hp <= 0) { killMon(m); return; } } if (m.burn.t <= 0) m.burn = null; }
          if (m.stun > 0) { m.stun -= dt; return; }
          const slowF = m.slow > 0 ? 0.5 : 1; if (m.slow > 0) m.slow -= dt;
          const dx = G.px - m.x, dy = G.py - m.y, d = Math.hypot(dx, dy), home = Math.hypot(m.x - m.hx, m.y - m.hy);
          if (m.kind === 'aggro' || m.kind === 'shoot' || m.kind === 'boss') { if (d < (m.boss ? 320 : 200)) m.aggro = true; }
          if (m.aggro && (d > 520 || home > 640)) { m.aggro = false; }
          if (G.dead) m.aggro = false;
          const sp = m.spd * slowF * dt;
          if (m.aggro) {
            if (m.kind === 'shoot') {
              const want = 170; if (d > want + 30) moveMon(m, dx / d * sp, dy / d * sp); else if (d < want - 40) moveMon(m, -dx / d * sp, -dy / d * sp);
              if (m.cd <= 0 && d < 300) { m.cd = 2.2; const a = Math.atan2(G.py - 24 - (m.y - m.spr.h / 2), G.px - m.x); G.shots.push({ x: m.x, y: m.y - m.spr.h / 2, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 1.6, dmg: m.atk * 0.8, lvl: m.lvl, r: 6, color: m.def.colors.d, color2: '#FFFFFF', mine: false, monEl: 'dark' }); m.lunge = 0.2; }
            } else {
              if (d > m.r + 12) moveMon(m, dx / d * sp, dy / d * sp);
              if (d < m.r + 22 && m.cd <= 0) { m.cd = m.boss ? 1.4 : 1.2; m.lunge = 0.25; hitPlayer(m.atk, m.lvl); }
              if (m.boss) {
                if (!m.slam && m.cd <= 0.2 && Math.random() < 0.01 + dt) m.slam = { t: 0, x: m.x, y: m.y - 20 };
                if (m.slam) { m.slam.t += dt; if (m.slam.t >= 0.9) { if (Math.hypot(G.px - m.slam.x, G.py - 20 - m.slam.y) < 130) hitPlayer(m.atk * 1.5, m.lvl); Fx.nova(m.slam.x, m.slam.y, 130, ['fire', 'earth']); G.shake = Math.max(G.shake, 9); m.slam = null; m.cd = 2.2; } }
              }
            }
          } else {
            m.wt -= dt;
            if (m.wt <= 0) { m.wt = rand(1.5, 3.5); const a = Math.random() * Math.PI * 2, go = Math.random() < 0.6; m.wx = go ? Math.cos(a) : 0; m.wy = go ? Math.sin(a) : 0; if (home > 140) { const b = Math.atan2(m.hy - m.y, m.hx - m.x); m.wx = Math.cos(b); m.wy = Math.sin(b); } }
            moveMon(m, m.wx * sp * 0.5, m.wy * sp * 0.5);
          }
        });
        // 탄
        G.shots = G.shots.filter(s => {
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; Fx.trail(s, dt);
          if (s.life <= 0 || solidAt(map, s.x, s.y + 16) && map.at(Math.floor(s.x / TS), Math.floor((s.y + 16) / TS)) !== 4) return false;
          if (s.ghost) return true;   // 다른 사람 마법 그림 (피해 없음)
          if (s.mine) {
            for (const m of G.mons) {
              if (m.dead || s.hit.has(m)) continue;
              if (Math.hypot(m.x - s.x, m.y - m.spr.h / 2 - s.y) < m.r + s.r) { s.hit.add(m); hitMon(m, s.dmg, s.els); if (!s.pierce) return false; }
            }
          } else if (Math.hypot(G.px - s.x, G.py - 24 - s.y) < 16 + s.r) { hitPlayer(s.dmg, s.lvl); return false; }
          return true;
        });
        // 장판
        G.pools = G.pools.filter(p => {
          p.t += dt; p.tick -= dt;
          if (p.tick <= 0) { p.tick = 0.5; G.mons.forEach(m => { if (!m.dead && Math.hypot(m.x - p.x, m.y - 8 - p.y) < p.r + m.r) hitMon(m, p.dmg, p.els, { noStun: true }); }); }
          return p.t < p.dur;
        });
        // 효과 (떨어지는 마법은 시간이 되면 피해)
        G.fxs = G.fxs.filter(f => {
          f.t += dt;
          if (f.type === 'strike' && !f.done && f.t >= f.dur * 0.6) { f.done = true; G.mons.forEach(m => { if (!m.dead && Math.hypot(m.x - f.x, m.y - m.spr.h / 2 - f.y) < f.r + m.r) hitMon(m, f.dmg, f.els); }); }
          return f.t < f.dur;
        });
        G.texts = G.texts.filter(t => (t.t += dt) < 1.1);
        if (G.saveT > (CFG.autosaveSec || 20)) save(false);
        if (G.srvT > (CFG.serverSaveSec || 60) && G.dirty) save(true);
      }

      /* ---------- 그리기 (v40 그래픽 강화) ----------
       *  땅 → 물결 → 바닥 효과(마법진·장판·예고) → 나무·건물·몬스터·나(아래쪽이 앞) → 탄 → 빛나는 효과·입자 → 글자
       *  → 지역 분위기(날씨·안개·어둠) → 화면 흔들림 · 맞으면 붉은 번쩍 → HUD(초상화·막대·작은 지도·마법 칸) */
      let cam = { x: 0, y: 0 };
      const glowLights = [];
      function draw(now) {
        const map = G.map, c = ctx;
        cam.x = map.w * TS <= W ? (map.w * TS - W) / 2 : clamp(G.px - W / 2, 0, map.w * TS - W);   // 작은 지도(건물 안)는 화면 가운데
        cam.y = map.h * TS <= H ? (map.h * TS - H) / 2 + 12 : clamp(G.py - 30 - H / 2, 0, map.h * TS - H);
        let sx = 0, sy = 0; if (G.shake > 0.2) { sx = rand(-G.shake, G.shake); sy = rand(-G.shake, G.shake); }
        const cx = Math.round(cam.x + sx), cy = Math.round(cam.y + sy);
        if (G.room) { c.fillStyle = '#0F1430'; c.fillRect(0, 0, W, H); c.drawImage(map.ground, -cx, -cy); }
        else { c.fillStyle = map.R.sky; c.fillRect(0, 0, W, H);
        c.drawImage(map.ground, clamp(cx, 0, map.ground.width - W), clamp(cy, 0, map.ground.height - H), W, H, clamp(cx, 0, map.ground.width - W) - cx, clamp(cy, 0, map.ground.height - H) - cy, W, H); }
        c.save(); c.translate(-cx, -cy);
        if (G.room) drawRoomFx(c, now, true);
        const view = { x: cx, y: cy, w: W, h: H };
        // 물결 (보이는 물 칸만)
        const lava = map.R.water === '#FF5A2A';
        c.globalCompositeOperation = lava ? 'lighter' : 'source-over';
        for (const [tx, ty] of map.water) {
          const X = tx * TS, Y = ty * TS; if (X < cx - TS || X > cx + W || Y < cy - TS || Y > cy + H) continue;
          const ph = now / (lava ? 700 : 500) + tx * 0.7 + ty * 1.3;
          c.globalAlpha = lava ? 0.25 + 0.2 * Math.sin(ph) : 0.35 + 0.25 * Math.sin(ph);
          c.fillStyle = lava ? '#FFB13D' : '#FFFFFF';
          c.fillRect(X + 4 + ((now / 40 + tx * 9) % 20), Y + 12 + Math.sin(ph) * 3, 8, 2);
          c.fillRect(X + 18 - ((now / 55 + ty * 7) % 16), Y + 22 + Math.cos(ph) * 2, 6, 2);
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        // 출구 화살표 (움직이며 빛남)
        const arrows = (X, dir) => { for (let i = 0; i < 3; i++) { const yy = (map.mid - 0.5) * TS + i * 22, off = ((now / 300 + i * 0.3) % 1) * 14 * dir; c.globalAlpha = 0.5 + 0.4 * Math.sin(now / 200 + i); c.fillStyle = '#FFF6C2'; c.beginPath(); c.moveTo(X + off, yy); c.lineTo(X + off + dir * 14, yy + 7); c.lineTo(X + off, yy + 14); c.fill(); } c.globalAlpha = 1; };
        if (map.exitL && cx < 80) arrows(14, -1); if (map.exitR && cx > map.w * TS - W - 80) arrows(map.w * TS - 14, 1);
        // 바닥 효과
        Fx.drawFx(c, true, now);
        G.pools.forEach(p => Fx.drawPool(c, p, now));
        G.mons.forEach(m => { if (m.slam) Fx.slamWarn(c, m.slam.x, m.slam.y + 20, 130, Math.min(1, m.slam.t / 0.9), now); });
        // 나무·건물·몬스터·나 — 아래쪽(sy)이 큰 것이 앞
        const list = [];
        for (const o of map.objs) { if (o.x > cx + W + 40 || o.x + o.img.width < cx - 40 || o.y > cy + H + 40 || o.y + o.img.height < cy - 40) continue; list.push({ y: o.sy, o }); }
        G.mons.forEach(m => { if (!m.dead) list.push({ y: m.y, m }); });
        (G.npcs || []).forEach(n => list.push({ y: n.y, n }));
        if (net) net.peers.forEach(pp => list.push({ y: pp.y, pp }));
        if (G.room) drawRoomFx(c, now, false);   // 벽난로 불·촛불 등은 사람보다 먼저 (머리 위 느낌표·말풍선이 가려지지 않게)
        list.push({ y: G.py, me: true }); list.sort((a, b) => a.y - b.y);
        list.forEach(e => (e.me ? drawMe(c, now) : e.m ? drawMon(c, e.m, now) : e.n ? drawNpc(c, e.n, now) : e.pp ? drawPeer(c, e.pp, now) : drawObj(c, e.o, now)));
        if (G.room) {
          const ex = map.exit, dx = (ex.x0 + ex.x1 + 1) / 2 * TS, dy = (ex.y + 0.5) * TS, k = Math.abs(Math.sin(now / 300));
          c.font = '13px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#1D2340'; c.strokeText('▼ 나가기', dx, dy - 22 + k * 3); c.fillStyle = '#FFF6C2'; c.fillText('▼ 나가기', dx, dy - 22 + k * 3);
        }
        // 분수 물보라
        if (map.fountain && Math.random() < 0.5) Fx.emit({ x: map.fountain.x + rand(-4, 4), y: map.fountain.y, vx: rand(-50, 50), vy: rand(-150, -90), g: 420, life: 0.7, size: 3, color: pick(['#FFFFFF', '#BDE8FF', '#8AD0FF']), shape: 'drop', add: false });
        // 탄
        G.shots.forEach(s => Fx.drawShot(c, s, now));
        // 빛나는 효과 · 입자
        Fx.drawFx(c, false, now);
        Fx.drawParts(c, view);
        // 글자 (톡 튀어나왔다가 올라가며 사라짐)
        c.textAlign = 'center'; c.textBaseline = 'middle';
        G.texts.forEach(t => {
          const k = t.t / 1.1, pop = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.7 : t.t < 0.22 ? 1.3 - (t.t - 0.12) / 0.1 * 0.3 : 1, size = (t.big ? 22 : t.dmg ? 17 : 14) * pop;
          c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.5) * 2); c.font = Math.round(size) + 'px "Jua", "Malgun Gothic", sans-serif';
          const y = t.y - t.t * 40; c.lineWidth = 4; c.strokeStyle = '#1D2340'; c.strokeText(t.text, t.x, y); c.fillStyle = t.color; c.fillText(t.text, t.x, y);
        });
        c.globalAlpha = 1;
        // 출구 이름
        c.font = '13px "Jua", "Malgun Gothic", sans-serif';
        const ex = (id, x, al) => { const M = MAPBY[id]; const t = (al === 'left' ? '← ' : '') + (M.kind === 'village' ? M.name : `${M.no}. ${M.name} (Lv.${M.rec})`) + (al === 'right' ? ' →' : ''), y = (map.mid + 3.4) * TS; c.textAlign = al; c.lineWidth = 3; c.strokeStyle = '#1D2340'; c.strokeText(t, x, y); c.fillStyle = '#FFFFFF'; c.fillText(t, x, y); };
        if (map.exitL && cx <= 4) ex(map.exitL, 8, 'left');
        if (map.exitR && cx >= map.w * TS - W - 4) ex(map.exitR, map.w * TS - 8, 'right');
        c.restore();
        // 지역 분위기 (어두운 지역은 나·빛나는 것 둘레만 밝게)
        glowLights.length = 0;
        glowLights.push({ x: G.px - cx, y: G.py - 30 - cy, r: 190, col: '#FFF6C2' });
        map.glows.forEach(g => { const x = g.x - cx, y = g.y - cy; if (x > -100 && x < W + 100 && y > -100 && y < H + 100) glowLights.push({ x, y, r: g.r, col: g.col, a: 0.85 }); });
        G.shots.forEach(s => { if (s.mine) glowLights.push({ x: s.x - cx, y: s.y - cy, r: 60, col: Fx.pal((s.els && s.els[0]) || 'light')[2] }); });
        G.pools.forEach(p => glowLights.push({ x: p.x - cx, y: p.y - cy, r: p.r * 1.2 }));
        if (G.room) {   // 건물 안: 따뜻한 빛 + 가장자리 어둡게
          c.save(); c.globalCompositeOperation = 'lighter';
          map.glows.forEach(g => { const fl = 0.85 + 0.15 * Math.sin(now / 130 + g.x); Fx.drawGlow(c, g.x - cx, g.y - cy, g.r, g.col, 0.32 * fl); });
          c.restore();
          const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(10,14,36,0)'); vg.addColorStop(1, 'rgba(10,14,36,.55)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
        } else Fx.drawAmbient(c, map.R === D.REGIONS[map.M.region] ? map.M.region : 0, W, H, { x: cx, y: cy }, now, glowLights);
        if (G.hurt > 0) { c.fillStyle = 'rgba(255,40,60,' + (G.hurt * 1.2).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
        if (G.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (G.flash * 1.5).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
        drawHud(c, now);
        if (G.touch) drawTouch(c);
      }
      function drawObj(c, o, now) {
        // Meshy 그림이 있으면: 장애물은 칸 아래 가운데에 세움, 건물은 건물 칸 폭에 맞춤 (+ 이름표)
        const alt = o.alt && imgOk(o.alt), bim = o.b && imgOk('bld_' + o.b.type);
        if (bim) {
          const b = o.b, ww = b.w * TS + (b.type === 'castle' ? 90 : 34), hh = bim.naturalHeight * ww / bim.naturalWidth, cx0 = (b.x + b.w / 2) * TS, by = (b.y + b.h) * TS + 6;
          c.drawImage(bim, Math.round(cx0 - ww / 2), Math.round(by - hh), Math.round(ww), Math.round(hh));
          const label = b.type === 'castle' ? '왕성 · 퀘스트' : b.name; c.font = '13px "Jua", "Malgun Gothic", sans-serif'; const lw = c.measureText(label).width + 20, ly = by - hh - 4;
          c.fillStyle = 'rgba(10,14,36,.82)'; c.fillRect(cx0 - lw / 2, ly - 11, lw, 22); c.fillStyle = '#FFD23F'; c.fillRect(cx0 - lw / 2, ly + 10, lw, 2);
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = b.type === 'potion' ? '#FF9AA0' : b.type === 'school' ? '#D8B8FF' : b.type === 'chief' ? '#9AF0B0' : '#FFE45C'; c.fillText(label, cx0, ly + 1);
          return;
        }
        if (alt) {
          const im = alt, x = o.tx * TS + 16 - im.naturalWidth / 2, y = (o.ty + 1) * TS - im.naturalHeight + 2, tree = im.naturalHeight > 56;
          if (tree) { const sway = Math.sin(now / 900 + o.tx * 0.7) * 0.012; c.save(); c.translate(x + im.naturalWidth / 2, y + im.naturalHeight); c.transform(1, 0, sway, 1, 0, 0); c.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight); c.restore(); }
          else c.drawImage(im, Math.round(x), Math.round(y));
        } else if (o.kind === 'tree' || o.kind === 'blossom' || o.kind === 'pine' || o.kind === 'snowpine') {   // 바람에 살짝 흔들림
          const sway = Math.sin(now / 900 + o.tx * 0.7) * 0.012;
          c.save(); c.translate(o.x + 32, o.y + 74); c.transform(1, 0, sway, 1, 0, 0); c.drawImage(o.img, -32, -74); c.restore();
        } else c.drawImage(o.img, o.x, o.y);
        if (o.kind === 'crystal') { c.save(); c.globalCompositeOperation = 'lighter'; Fx.drawGlow(c, o.tx * TS + 16, o.ty * TS + 6, 40, '#B08AFF', 0.35 + 0.15 * Math.sin(now / 400 + o.tx)); c.restore(); }
      }
      function drawMe(c, now) {
        const fr = G.moving ? [1, 0, 3, 0][Math.floor(G.walk * 8) % 4] : 0;
        const img = avatarSprite(Hub.user ? Hub.user.avatar : AV.normalize({}), S.eq, S.hide, fr);
        const s = img.width > AV.size.w ? 1 : 2, w = img.width * s, h = img.height * s, bob = G.moving ? 0 : Math.round(Math.sin(now / 400)), x = Math.round(G.px - w / 2), y = Math.round(G.py - h + 2 + bob);
        G.meImg = { img, x, y, w, h };
        c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(G.px, G.py, 16, 5, 0, 0, Math.PI * 2); c.fill();
        if (G.dash) Fx.afterimage(img, x, y, w, h, G.face < 0, Fx.pal(G.dash.els[0])[2]);
        if (G.inv > 0 && !G.dash && Math.floor(now / 60) % 2) c.globalAlpha = 0.45;
        if (G.face < 0) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(img, 0, 0, w, h); c.restore(); } else c.drawImage(img, x, y, w, h);
        c.globalAlpha = 1;
        // 장비 단계 빛 (정예 무기)
        const wp = S.eq.weapon && ITEMS[S.eq.weapon]; if (wp && wp.rare && !S.hide) { c.save(); c.globalCompositeOperation = 'lighter'; Fx.drawGlow(c, G.px + (G.face < 0 ? -14 : 14), y + 14, 18, D.TIER[wp.tier].gem, 0.35 + 0.2 * Math.sin(now / 200)); c.restore(); }
        if (G.shield) Fx.drawShield(c, G.px, G.py - 28, now, G.shield.el, G.shield.t);
        c.font = '12px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#1D2340';
        const nm = (Hub.user ? Hub.user.nickname : '손님') + ' Lv.' + S.lv; c.strokeText(nm, G.px, y - 6); c.fillStyle = '#FFE45C'; c.fillText(nm, G.px, y - 6);
      }
      function drawMon(c, m, now) {
        const sp = m.spr, moving = m.aggro || Math.abs(m.wx) + Math.abs(m.wy) > 0.1;
        const ph = now / (moving ? 110 : 260) + m.hx, hop = moving ? Math.abs(Math.sin(ph)) * (m.boss ? 6 : 5) : 0, sq = moving ? 1 + Math.cos(ph * 2) * 0.05 : 1 + Math.sin(ph) * 0.04;
        const lunge = m.lunge > 0 ? Math.sin(m.lunge / 0.25 * Math.PI) * 10 : 0, la = Math.atan2(G.py - m.y, G.px - m.x);
        const w = sp.w * (2 - sq), h = sp.h * sq, bx = m.x + Math.cos(la) * lunge + (m.knock || 0), x = Math.round(bx - w / 2), y = Math.round(m.y - h - hop + Math.sin(la) * lunge * 0.5);
        c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(m.x, m.y, sp.w * 0.38 * (1 - hop / 30), sp.w * 0.12, 0, 0, Math.PI * 2); c.fill();
        if (m.boss) { c.save(); c.globalCompositeOperation = 'lighter'; Fx.drawGlow(c, m.x, m.y - sp.h / 2, sp.w * 0.9, m.def.colors.d || '#FF3D4A', 0.35 + 0.15 * Math.sin(now / 300)); c.restore(); if (Math.random() < 0.3) Fx.emit({ x: m.x + rand(-sp.w / 2, sp.w / 2), y: m.y - rand(0, sp.h), vx: 0, vy: rand(-60, -20), life: 0.8, size: rand(3, 5), color: m.def.colors.d || '#FF3D4A', shape: 'glow', add: true }); }
        const flip = G.px < m.x;
        c.save(); if (flip) { c.translate(x + w, y); c.scale(-1, 1); } else c.translate(x, y);
        c.drawImage(m.flash > 0 ? sp.flash : sp.img, 0, 0, w, h); c.restore();
        if (m.stun > 0) for (let i = 0; i < 3; i++) { const a = now / 150 + i * 2.1; c.fillStyle = '#FFE45C'; c.fillRect(m.x + Math.cos(a) * 14 - 2, y - 6 + Math.sin(a) * 4, 4, 4); }
        if (m.slow > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(Fx.glow('#5AB8F5', 24), m.x - 24, m.y - sp.h / 2 - 24); c.restore(); if (Math.random() < 0.1) Fx.emit({ x: m.x + rand(-10, 10), y: m.y - rand(0, sp.h), vx: 0, vy: 20, life: 0.5, size: 2, color: '#BDE8FF', shape: 'star', add: true }); }
        if (m.burn && Math.random() < 0.4) Fx.emit({ x: m.x + rand(-sp.w / 3, sp.w / 3), y: m.y - rand(4, sp.h * 0.8), vx: rand(-10, 10), vy: rand(-80, -40), life: 0.5, size: rand(3, 5), color: pick(['#FFE45C', '#FF9A3D', '#E8402A']), shape: 'glow', add: true });
        if ((m.hp < m.max || m.aggro) && !m.boss) {
          const bw = 36, hpw = bw * Math.max(0, m.hp / m.max); m.hpShow = m.hpShow == null ? hpw : m.hpShow + (hpw - m.hpShow) * 0.1;
          c.fillStyle = '#0A0E24'; c.fillRect(m.x - bw / 2 - 1, y - 9, bw + 2, 6); c.fillStyle = '#FFE45C'; c.fillRect(m.x - bw / 2, y - 8, m.hpShow, 4); c.fillStyle = '#FF5A5F'; c.fillRect(m.x - bw / 2, y - 8, hpw, 4); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(m.x - bw / 2, y - 8, hpw, 1);
          c.font = '11px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#1D2340';
          const t = m.name + ' Lv.' + m.lvl; c.strokeText(t, m.x, y - 13); c.fillStyle = m.lvl > S.lv + 3 ? '#FF8A8E' : '#FFFFFF'; c.fillText(t, m.x, y - 13);
        }
      }
      function drawNpc(c, n, now) {
        const fr = n.moving ? [1, 0, 3, 0][Math.floor((n.walk || 0) * 7) % 4] : 0, img = npcSprite(n.def.av, fr);
        const k = (img.width > AV.size.w ? 1 : 2) * (n.scale || 1), w = img.width * k, h = img.height * k, bob = n.moving ? 0 : Math.round(Math.sin(now / 420 + n.ph));
        const x = Math.round(n.x - w / 2), y = Math.round(n.y - h + 2 + bob);
        c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(n.x, n.y, 16 * (n.scale || 1), 5, 0, 0, Math.PI * 2); c.fill();
        if (n.face < 0) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(img, 0, 0, w, h); c.restore(); } else c.drawImage(img, x, y, w, h);
        c.font = '12px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#1D2340';
        c.strokeText(n.def.name, n.x, y - 6); c.fillStyle = n.def.color || '#9AE6FF'; c.fillText(n.def.name, n.x, y - 6);
        let top = y - 22;
        if (!n.guard && !n.walker) {   // 가게 사람 머리 위 느낌표 (통통 튐)
          const by = top - 8 - Math.abs(Math.sin(now / 260)) * 5; c.fillStyle = '#1D2340'; rr(c, n.x - 9, by - 12, 18, 22, 6); c.fill(); c.fillStyle = '#FFD23F'; rr(c, n.x - 7, by - 10, 14, 18, 5); c.fill();
          c.fillStyle = '#1D2340'; c.fillRect(n.x - 1.5, by - 7, 3, 8); c.fillRect(n.x - 1.5, by + 3, 3, 3); top = by - 16;
        }
        if (n.say && n.sayT > 0) {
          c.save(); c.globalAlpha = Math.min(1, n.sayT * 3); c.font = '13px "Jua", "Malgun Gothic", sans-serif';
          const tw = c.measureText(n.say).width + 20, bx = clamp(n.x - tw / 2, cam.x + 4, cam.x + W - tw - 4), by = top - 30;
          c.fillStyle = '#1D2340'; rr(c, bx - 2, by - 2, tw + 4, 30, 9); c.fill(); c.beginPath(); c.moveTo(n.x - 7, by + 26); c.lineTo(n.x + 7, by + 26); c.lineTo(n.x, by + 36); c.fill();
          c.fillStyle = '#FFFFFF'; rr(c, bx, by, tw, 26, 8); c.fill(); c.beginPath(); c.moveTo(n.x - 5, by + 25); c.lineTo(n.x + 5, by + 25); c.lineTo(n.x, by + 32); c.fill();
          c.fillStyle = '#1D2340'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(n.say, bx + 10, by + 14); c.restore();
        }
      }
      // 다른 플레이어 (아바타 + 장비, 이름 하늘색)
      function drawPeer(c, p, now) {
        if (!p.av) return;
        const fr = p.moving ? [1, 0, 3, 0][Math.floor(p.walk * 8) % 4] : 0, img = avatarSprite(AV.normalize(p.av), p.eq || {}, p.hide, fr);
        const k = img.width > AV.size.w ? 1 : 2, w = img.width * k, h = img.height * k, x = Math.round(p.x - w / 2), y = Math.round(p.y - h + 2);
        c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(p.x, p.y, 16, 5, 0, 0, Math.PI * 2); c.fill();
        if (p.face < 0) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(img, 0, 0, w, h); c.restore(); } else c.drawImage(img, x, y, w, h);
        c.font = '12px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#1D2340';
        const nm = p.nick + ' Lv.' + p.lv; c.strokeText(nm, p.x, y - 6); c.fillStyle = '#9AE6FF'; c.fillText(nm, p.x, y - 6);
      }
      // 건물 안 움직이는 장식 (마법진 · 벽난로 불 · 촛불 · 가마솥 거품 · 떠다니는 책)
      function drawRoomFx(c, now, floor) {
        (G.map.fx || []).forEach(f => {
          if (floor && f.type === 'circle') {
            c.save(); c.translate(f.x, f.y); c.scale(1, 0.5); c.globalCompositeOperation = 'lighter';
            const a = 0.35 + 0.15 * Math.sin(now / 500);
            [[f.r, 3], [f.r * 0.78, 2], [f.r * 0.45, 2]].forEach(([r, lw], i) => { c.strokeStyle = `rgba(${i === 1 ? '255,214,120' : '176,138,255'},${a})`; c.lineWidth = lw * 2; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); });
            c.rotate(now / 3000); c.strokeStyle = `rgba(200,168,255,${a + 0.1})`; c.lineWidth = 3;
            for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2, t2 = t + Math.PI * 2 / 3; c.beginPath(); c.moveTo(Math.cos(t) * f.r * 0.78, Math.sin(t) * f.r * 0.78); c.lineTo(Math.cos(t2) * f.r * 0.78, Math.sin(t2) * f.r * 0.78); c.stroke(); }
            for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; c.fillStyle = `rgba(255,230,160,${a + 0.2})`; c.fillRect(Math.cos(t) * f.r * 0.9 - 3, Math.sin(t) * f.r * 0.9 - 3, 6, 6); }
            c.restore();
            if (Math.random() < 0.25) Fx.emit({ x: f.x + rand(-f.r, f.r) * 0.8, y: f.y + rand(-f.r, f.r) * 0.35, vx: 0, vy: rand(-50, -20), life: 1.2, size: rand(2, 4), color: pick(['#C8A8FF', '#FFE9A8', '#FFFFFF']), shape: 'star', add: true });
          }
          if (floor) return;
          if (f.type === 'fire') {
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 7; i++) { const ph = now / 120 + i * 1.7, hh = 26 + Math.sin(ph) * 8 + (i % 3) * 6, xx = f.x - 26 + i * 9; c.fillStyle = i % 2 ? 'rgba(255,154,61,.85)' : 'rgba(255,90,40,.8)'; c.beginPath(); c.moveTo(xx - 7, f.y); c.quadraticCurveTo(xx + Math.sin(ph) * 4, f.y - hh, xx + 7, f.y); c.fill(); }
            c.fillStyle = 'rgba(255,240,170,.9)'; c.beginPath(); c.ellipse(f.x, f.y - 6, 18, 8 + Math.sin(now / 90) * 2, 0, 0, Math.PI * 2); c.fill(); c.restore();
            if (Math.random() < 0.3) Fx.emit({ x: f.x + rand(-20, 20), y: f.y - 14, vx: rand(-15, 15), vy: rand(-70, -40), life: 0.8, size: rand(2, 3), color: pick(['#FFE45C', '#FF9A3D']), shape: 'glow', add: true });
          } else if (f.type === 'flame') {
            const fl = Math.sin(now / 80 + f.x) * 1.5; c.save(); c.globalCompositeOperation = 'lighter';
            c.fillStyle = 'rgba(255,154,61,.9)'; c.beginPath(); c.ellipse(f.x, f.y, 4, 8 + fl, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,240,180,.95)'; c.beginPath(); c.ellipse(f.x, f.y + 2, 2, 4 + fl / 2, 0, 0, Math.PI * 2); c.fill(); c.restore();
          } else if (f.type === 'cauldron') {
            if (Math.random() < 0.35) Fx.emit({ x: f.x + rand(-16, 16), y: f.y, vx: rand(-8, 8), vy: rand(-45, -25), life: 1.1, size: rand(3, 6), color: pick(['#9AF0B0', '#3DDC84', '#DFFFE8']), shape: 'glow', add: true });
            c.save(); c.globalAlpha = 0.25 + 0.1 * Math.sin(now / 300); c.fillStyle = '#DFFFE8'; c.beginPath(); c.ellipse(f.x + Math.sin(now / 700) * 6, f.y - 30, 16, 8, 0, 0, Math.PI * 2); c.fill(); c.restore();
          } else if (f.type === 'books') {
            for (let i = 0; i < 3; i++) { const t = now / 900 + i * 2.1, bx = f.x + Math.cos(t) * 40, by = f.y - 40 + Math.sin(t * 1.3) * 10 - i * 14, col = ['#D2343A', '#3E7BD8', '#3DDC84'][i];
              c.fillStyle = '#1D2340'; c.fillRect(bx - 9, by - 7, 18, 14); c.fillStyle = col; c.fillRect(bx - 8, by - 6, 16, 12); c.fillStyle = '#F5E2B8'; c.fillRect(bx - 6 + (Math.floor(now / 200 + i) % 2) * 6, by - 4, 6, 8); }
          }
        });
      }
      // HUD 도구
      function panelBox(c, x, y, w, h, r) {
        const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(30,38,84,.92)'); g.addColorStop(1, 'rgba(12,16,40,.92)');
        c.fillStyle = '#0A0E24'; rr(c, x - 2, y - 2, w + 4, h + 4, r + 2); c.fill();
        c.fillStyle = g; rr(c, x, y, w, h, r); c.fill(); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; rr(c, x + 1, y + 1, w - 2, h - 2, r); c.stroke();
      }
      function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
      function bar(c, x, y, w, h, v, cols, label, ghost) {
        c.fillStyle = '#0A0E24'; rr(c, x - 2, y - 2, w + 4, h + 4, 4); c.fill(); c.fillStyle = '#1E2650'; c.fillRect(x, y, w, h);
        if (ghost != null && ghost > v) { c.fillStyle = '#FFF3B0'; c.fillRect(x, y, Math.round(w * clamp(ghost, 0, 1)), h); }
        const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
        c.fillStyle = g; c.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), h); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y + 1, Math.round(w * clamp(v, 0, 1)), Math.max(1, h / 4));
        if (label) { c.font = '11px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,14,36,.8)'; c.strokeText(label, x + w / 2, y + h / 2 + 1); c.fillStyle = '#FFFFFF'; c.fillText(label, x + w / 2, y + h / 2 + 1); }
      }
      let portrait = null, portraitKey = '';
      function getPortrait() {
        const av = Hub.user ? Hub.user.avatar : AV.normalize({}), k = JSON.stringify(av);
        if (portrait && portraitKey === k) return portrait;
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
        AV.draw(x, av, 0, 0, 4, { crop: 'bust' }); portraitKey = k; return (portrait = cv);
      }
      function drawHud(c, now) {
        const M = G.map.M;
        // 왼쪽 위: 초상화 + 이름·레벨 + 체력·마나 + 골드
        panelBox(c, 8, 8, 270, 82, 10);
        c.fillStyle = '#0A0E24'; rr(c, 14, 14, 70, 70, 8); c.fill();
        const pg = c.createLinearGradient(0, 16, 0, 82); pg.addColorStop(0, '#5C86FF'); pg.addColorStop(1, '#2F3FA0'); c.fillStyle = pg; rr(c, 16, 16, 66, 66, 7); c.fill();
        c.drawImage(getPortrait(), 17, 17, 64, 64);
        if (S.sp > 0) {   // 올릴 스탯 포인트가 있으면 얼굴 오른쪽 위에 + 표시 (톡톡 튐)
          const k2 = 1 + 0.12 * Math.abs(Math.sin(now / 250)); c.save(); c.translate(80, 18); c.scale(k2, k2);
          c.fillStyle = '#0A0E24'; c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill(); c.fillStyle = '#FF5A5F'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#FFFFFF'; c.fillRect(-5, -1.5, 10, 3); c.fillRect(-1.5, -5, 3, 10); c.restore();
        }
        c.fillStyle = '#FFD23F'; rr(c, 12, 70, 36, 18, 5); c.fill(); c.fillStyle = '#1D2340'; c.font = '12px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Lv.' + S.lv, 30, 80);
        c.font = '14px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = '#FFFFFF'; c.fillText(Hub.user ? Hub.user.nickname : '손님', 92, 28);
        c.textAlign = 'right'; c.fillStyle = '#FFD23F'; c.fillText(fmtN(S.gold) + ' G', 270, 28);
        c.fillStyle = '#8A5A10'; c.beginPath(); c.arc(270 - c.measureText(fmtN(S.gold) + ' G').width - 10, 23, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#FFD23F'; c.beginPath(); c.arc(270 - c.measureText(fmtN(S.gold) + ' G').width - 10, 23, 4.5, 0, Math.PI * 2); c.fill();
        G.hpGhost = G.hpGhost == null ? S.hp / ST.hp : Math.max(S.hp / ST.hp, G.hpGhost - 0.4 / 60);
        const low = S.hp / ST.hp < 0.3 && Math.floor(now / 250) % 2;
        bar(c, 92, 36, 178, 16, S.hp / ST.hp, low ? ['#FFB0B0', '#FF5A5F'] : ['#FF7A7E', '#D2343A'], `체력 ${fmtN(S.hp)} / ${fmtN(ST.hp)}`, G.hpGhost);
        bar(c, 92, 58, 178, 12, S.mp / ST.mp, ['#7FA0FF', '#2F55D9'], `마나 ${fmtN(S.mp)} / ${fmtN(ST.mp)}`);
        // 맨 아래 경험치 막대
        const ex = S.lv >= D.MAX_LV ? 1 : S.exp / D.F.need(S.lv);
        c.fillStyle = 'rgba(10,14,36,.85)'; c.fillRect(0, H - 8, W, 8); const eg = c.createLinearGradient(0, 0, W, 0); eg.addColorStop(0, '#FFD23F'); eg.addColorStop(1, '#FFF3B0'); c.fillStyle = eg; c.fillRect(0, H - 7, W * ex, 6);
        for (let i = 1; i < 10; i++) { c.fillStyle = 'rgba(10,14,36,.6)'; c.fillRect(W * i / 10, H - 7, 1, 6); }
        c.font = '10px "Jua", sans-serif'; c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#0A0E24'; const et = S.lv >= D.MAX_LV ? '만렙!' : `경험치 ${(ex * 100).toFixed(1)}%`; c.strokeText(et, W - 6, H - 11); c.fillStyle = '#FFF3B0'; c.fillText(et, W - 6, H - 11);
        // 위 가운데: 지도 이름
        const t = M.kind !== 'field' ? M.name : `사냥터 ${M.no}. ${M.name}`, rec = M.kind === 'room' ? MAPBY[S.map].name + ' · 건물 안' : M.kind === 'village' ? '마을' : `권장 Lv.${M.rec}`;
        c.font = '16px "Jua", "Malgun Gothic", sans-serif'; const tw = Math.max(c.measureText(t).width, 80) + 30;
        panelBox(c, W / 2 - tw / 2, 8, tw, 38, 10);
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText(t, W / 2, 21);
        c.font = '11px "Jua", sans-serif'; c.fillStyle = M.kind !== 'field' ? '#9AE6FF' : M.rec > S.lv + 6 ? '#FF8A8E' : M.rec > S.lv + 2 ? '#FFD23F' : '#9AF0B0'; c.fillText(rec + (M.kind !== 'village' && M.rec > S.lv + 6 ? ' · 위험!' : ''), W / 2, 37);
        // 서버 표시 (위 가운데 이름 아래)
        if (net && net.joined) {
          const st = `${net.server}서버 · 여기 ${net.peers.size + 1}명`; c.font = '12px "Jua", "Malgun Gothic", sans-serif'; const sw = c.measureText(st).width + 18;
          c.fillStyle = 'rgba(10,14,36,.78)'; rr(c, W / 2 - sw / 2, 50, sw, 20, 8); c.fill(); c.fillStyle = '#9AE6FF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(st, W / 2, 61);
        }
        // 오른쪽 위: 작은 지도
        if (!G.room) drawMini(c, now);
        // 보스 체력 (큰 막대)
        const boss = G.mons.find(m => m.boss && !m.dead && (m.aggro || Math.hypot(m.x - G.px, m.y - G.py) < 420));
        if (boss) {
          const bw = 420, bx = W / 2 - bw / 2, by = 54; panelBox(c, bx - 8, by - 4, bw + 16, 34, 8);
          c.font = '13px "Jua", "Malgun Gothic", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#FF8A8E'; c.fillText('보스 ' + boss.name + ' Lv.' + boss.lvl, bx, by + 7);
          c.textAlign = 'right'; c.fillStyle = '#FFFFFF'; c.fillText(Math.ceil(boss.hp / boss.max * 100) + '%', bx + bw, by + 7);
          boss.hpShow = boss.hpShow == null ? boss.hp / boss.max : Math.max(boss.hp / boss.max, boss.hpShow - 0.3 / 60);
          bar(c, bx, by + 16, bw, 9, boss.hp / boss.max, ['#FF5A5F', '#8A1E22'], null, boss.hpShow);
        }
        // 지도 들어올 때 큰 제목
        if (G.title && G.title.t < 3) {
          const k = G.title.t, a = k < 0.4 ? k / 0.4 : k > 2.3 ? 1 - (k - 2.3) / 0.7 : 1;
          c.save(); c.globalAlpha = clamp(a, 0, 1); c.textAlign = 'center'; c.textBaseline = 'middle';
          const g = c.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0); g.addColorStop(0, 'rgba(10,14,36,0)'); g.addColorStop(0.5, 'rgba(10,14,36,.75)'); g.addColorStop(1, 'rgba(10,14,36,0)');
          c.fillStyle = g; c.fillRect(W / 2 - 260, H * 0.3 - 40, 520, 84);
          c.fillStyle = '#FFD23F'; c.fillRect(W / 2 - 160 * a, H * 0.3 - 34, 320 * a, 2); c.fillRect(W / 2 - 160 * a, H * 0.3 + 38, 320 * a, 2);
          c.font = '14px "Jua", "Malgun Gothic", sans-serif'; c.fillStyle = '#FFE9A8'; c.fillText(G.title.sub, W / 2, H * 0.3 - 16);
          c.font = '32px "Jua", "Malgun Gothic", sans-serif'; c.lineWidth = 5; c.strokeStyle = '#0A0E24'; c.strokeText(G.title.text, W / 2, H * 0.3 + 14); c.fillStyle = '#FFFFFF'; c.fillText(G.title.text, W / 2, H * 0.3 + 14);
          c.restore();
        }
        if (G.touch || G.room) return;   // 건물 안에서는 아래 마법 칸을 숨김 (나가는 문이 보이게)
        // 아래 가운데: 마법 4칸 + 포션 2칸
        const x0 = W / 2 - 186, y0 = H - 66;
        panelBox(c, x0 - 8, y0 - 8, 372 + 16, 64, 12);
        for (let i = 0; i < 4; i++) skillSlot(c, x0 + i * 58, y0, 50, i, now);
        potionSlot(c, x0 + 4 * 58 + 14, y0, 50, 'hp', 'Q'); potionSlot(c, x0 + 5 * 58 + 14, y0, 50, 'mp', 'E');
      }
      function drawMini(c, now) {
        const map = G.map, mw = 150, k = mw / map.w, mh = Math.round(map.h * k), x0 = W - mw - 14, y0 = 12;
        panelBox(c, x0 - 4, y0 - 4, mw + 8, mh + 8, 6);
        c.save(); c.globalAlpha = 0.9; c.imageSmoothingEnabled = false; c.drawImage(map.mini, x0, y0, mw, mh); c.restore();
        G.mons.forEach(m => { if (m.dead) return; c.fillStyle = m.boss ? '#FF3D4A' : m.aggro ? '#FF8A3D' : '#FFD8D8'; const s = m.boss ? 5 : 3; c.fillRect(x0 + m.x / TS * k - s / 2, y0 + m.y / TS * k - s / 2, s, s); });
        if (net) net.peers.forEach(p => { c.fillStyle = '#9AE6FF'; c.fillRect(x0 + p.x / TS * k - 2, y0 + p.y / TS * k - 2, 4, 4); });
        map.buildings.forEach(b => { c.fillStyle = '#FFD27A'; c.fillRect(x0 + (b.door.x + 0.5) * k - 2, y0 + (b.door.y + 0.5) * k - 2, 4, 4); });
        const bl = Math.floor(now / 300) % 2; c.fillStyle = bl ? '#FFFFFF' : '#3DDC84'; c.fillRect(x0 + G.px / TS * k - 3, y0 + G.py / TS * k - 3, 6, 6); c.strokeStyle = '#0A0E24'; c.lineWidth = 1; c.strokeRect(x0 + G.px / TS * k - 3, y0 + G.py / TS * k - 3, 6, 6);
        c.strokeStyle = 'rgba(255,255,255,.6)'; c.strokeRect(x0 + cam.x / TS * k, y0 + cam.y / TS * k, W / TS * k, H / TS * k);
      }
      function skillSlot(c, x, y, s, i, now) {
        const id = S.slots[i], sk = skill(id);
        c.fillStyle = '#0A0E24'; rr(c, x - 1, y - 1, s + 2, s + 2, 7); c.fill(); c.fillStyle = '#1A2148'; rr(c, x, y, s, s, 6); c.fill();
        if (sk) {
          c.save(); rr(c, x + 1, y + 1, s - 2, s - 2, 5); c.clip(); c.drawImage(Fx.icon(sk, 48), x + 1, y + 1, s - 2, s - 2);
          const cd = G.cds[id] || 0;
          if (cd > 0) { c.fillStyle = 'rgba(10,14,36,.72)'; c.beginPath(); c.moveTo(x + s / 2, y + s / 2); c.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / sk.cd)); c.closePath(); c.fill(); c.font = '15px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText(cd >= 1 ? Math.ceil(cd) : cd.toFixed(1), x + s / 2, y + s / 2 + 1); }
          else if (G.ready && G.ready[id] > 0) { c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,255,255,' + G.ready[id].toFixed(2) + ')'; c.fillRect(x, y, s, s); c.globalCompositeOperation = 'source-over'; }
          if (S.mp < sk.mp) { c.fillStyle = 'rgba(40,60,160,.6)'; c.fillRect(x, y, s, s); }
          c.restore();
        }
        c.fillStyle = '#0A0E24'; rr(c, x - 3, y - 3, 15, 15, 4); c.fill(); c.font = '11px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFD23F'; c.fillText(String(i + 1), x + 4.5, y + 5);
      }
      function potionSlot(c, x, y, s, kind, key) {
        const n = POT_T.reduce((a, t) => a + count(kind + t), 0);
        c.fillStyle = '#0A0E24'; rr(c, x - 1, y - 1, s + 2, s + 2, 7); c.fill(); c.fillStyle = '#1A2148'; rr(c, x, y, s, s, 6); c.fill();
        const best = POT_T.map(t => kind + t).find(i => count(i) > 0) || kind + '1';
        const im = potionImgs[best] || (potionImgs[best] = Object.assign(new Image(), { src: P.itemImg(best) }));
        if (im.complete) { c.globalAlpha = n ? 1 : 0.35; c.drawImage(im, x + 5, y + 4, 40, 40); c.globalAlpha = 1; }
        c.font = '12px "Jua", sans-serif'; c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = '#0A0E24'; c.strokeText(String(n), x + s - 3, y + s - 4); c.fillStyle = '#FFFFFF'; c.fillText(String(n), x + s - 3, y + s - 4);
        c.fillStyle = '#0A0E24'; rr(c, x - 3, y - 3, 15, 15, 4); c.fill(); c.font = '11px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFD23F'; c.fillText(key, x + 4.5, y + 5);
      }
      const potionImgs = {};
      // 휴대폰 버튼 (캔버스 좌표)
      const TB = { atk: { x: 880, y: 456, r: 48 }, s0: { x: 768, y: 482, r: 31 }, s1: { x: 778, y: 398, r: 31 }, s2: { x: 836, y: 346, r: 31 }, s3: { x: 914, y: 334, r: 31 }, hp: { x: 688, y: 500, r: 25 }, mp: { x: 636, y: 500, r: 25 } };
      function drawTouch(c) {
        if (G.joy && G.joy.on) { c.globalAlpha = 0.3; c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(G.joy.cx, G.joy.cy, 62, 0, Math.PI * 2); c.fill(); c.globalAlpha = 0.85; const g = c.createRadialGradient(G.joy.cx + G.joy.vx * 50, G.joy.cy + G.joy.vy * 50, 4, G.joy.cx + G.joy.vx * 50, G.joy.cy + G.joy.vy * 50, 28); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#9AA8E0'); c.fillStyle = g; c.beginPath(); c.arc(G.joy.cx + G.joy.vx * 50, G.joy.cy + G.joy.vy * 50, 28, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
        else { c.globalAlpha = 0.3; c.strokeStyle = '#FFFFFF'; c.lineWidth = 3; c.beginPath(); c.arc(110, 436, 62, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(110, 436, 24, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
        Object.entries(TB).forEach(([k, b]) => {
          c.globalAlpha = G.btnDown[k] ? 0.9 : 0.62; c.fillStyle = '#0A0E24'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
          if (k === 'atk') { const g = c.createRadialGradient(b.x, b.y - 10, 4, b.x, b.y, b.r); g.addColorStop(0, '#FFE45C'); g.addColorStop(1, '#C88A10'); c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r - 5, 0, Math.PI * 2); c.fill(); c.font = '18px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1D2340'; c.fillText('공격', b.x, b.y + 1); return; }
          if (k === 'hp' || k === 'mp') { const n = POT_T.reduce((a, t) => a + count(k + t), 0); c.fillStyle = k === 'hp' ? '#D2343A' : '#2F55D9'; c.beginPath(); c.arc(b.x, b.y, b.r - 4, 0, Math.PI * 2); c.fill(); c.font = '13px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText(String(n), b.x, b.y + 1); return; }
          const i = +k[1], sk = skill(S.slots[i]);
          c.save(); c.beginPath(); c.arc(b.x, b.y, b.r - 4, 0, Math.PI * 2); c.clip();
          if (sk) { c.drawImage(Fx.icon(sk, 64), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); const cd = G.cds[sk.id] || 0; if (cd > 0) { c.fillStyle = 'rgba(10,14,36,.7)'; c.beginPath(); c.moveTo(b.x, b.y); c.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd / sk.cd); c.fill(); c.font = '14px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText(cd.toFixed(1), b.x, b.y + 1); } }
          else { c.fillStyle = '#2A325E'; c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); c.font = '14px "Jua", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#8A93C0'; c.fillText(String(i + 1), b.x, b.y + 1); }
          c.restore();
        });
        c.globalAlpha = 1;
      }

      /* ---------- 고리 ---------- */
      function loop(t) {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
        if (!S || !G.map) { if (loadingText) { ctx.fillStyle = '#0F1430'; ctx.fillRect(0, 0, W, H); const k = imgOk('key'); if (k) { ctx.globalAlpha = 0.6; ctx.drawImage(k, 0, 0, W, H); ctx.globalAlpha = 1; } ctx.font = '22px "Jua", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(loadingText, W / 2, H - 40); } return; }
        if (G.hitstop > 0) G.hitstop -= dt;
        else if (!G.paused && !G.dead && !document.hidden) update(dt);
        draw(t);
      }

      /* ---------- 저장 ---------- */
      function markDirty(soon) { G.dirty = true; if (soon && G.srvT < (CFG.serverSaveSec || 60) - 8) G.srvT = (CFG.serverSaveSec || 60) - 8; }
      async function save(server) {
        if (!S) return;
        const at = G.room ? G.room.back : { x: G.px, y: G.py };   // 건물 안이면 그 건물 문 앞을 저장
        S.x = Math.round(at.x); S.y = Math.round(at.y); S.savedAt = Date.now();
        const copy = JSON.parse(JSON.stringify(S));
        Store.setLocal(Hub.user && Hub.user.id, copy); G.saveT = 0;
        if (server) { G.srvT = 0; G.dirty = false; return Store.push(copy); }
        return true;
      }
      async function submitRank(pd) {
        if (!Hub.user) return;
        const now = Date.now(); if (now - G.lastSubmit < 4000 && !pd) return; G.lastSubmit = now;
        const sec = Math.min(86400, Math.round(S.play - G.playMark)); G.playMark = S.play;
        try { await Hub.submitScore({ game_id: GAME, score: S.lv, duration_sec: Math.max(0, sec), result: null, points_delta: pd || 0, extra: { lv: S.lv, map: S.map, kills: S.kills } }); loadRank(); } catch (e) { console.warn('[rpg] 랭킹 저장 실패', e.message); }
      }
      function bossReward() { const p = (CFG.points && CFG.points.boss) || 0; if (p) { submitRank(p); A.toast(`보스 처치! +${p}P`); } }
      async function loadRank() {
        const rk = $('#rgRank'), mine = $('#rgMine'); if (!rk) return;
        try {
          const rows = await Hub.leaderboard(GAME, 10); if (!rk.isConnected) return;
          rk.innerHTML = A.rankItems(rows, 'best_score', GAME); AV.paintAll(rk);
          mine.textContent = Hub.user ? `내 레벨 Lv.${S ? S.lv : '-'}` : '로그인하면 레벨이 랭킹에 올라가요.';
        } catch (e) { rk.innerHTML = '<li class="empty">랭킹을 불러오지 못했어요.</li>'; }
      }

      /* ================= 창 ================= */
      let pane = null, paneArg = null, tab = {};
      function openPanel(kind, arg) {
        pane = kind; paneArg = arg || null; G.keys = {}; G.btnDown = {}; G.joy = null;
        G.paused = !(net && net.joined && kind !== 'help');   // 온라인이면 창을 열어도 세상은 계속 (다른 사람이 계속 움직임)
        if (kind === 'servers') { srvList = null; loadServers(); clearInterval(srvTimer); srvTimer = setInterval(() => { if (pane === 'servers') loadServers(); else clearInterval(srvTimer); }, 5000); }
        renderPanel(); panel.hidden = false;
      }
      function closePanel() {
        if (pane === 'dead') return;
        const wasDoor = ['potion', 'school', 'chief', 'castle'].includes(pane);
        if (pane === 'trade' && G.trade) { endTrade(true); say('거래를 취소했어요', 2); return; }
        if (pane === 'tradeIn' && paneArg) net.trade({ k: 'no', to: paneArg.cid });
        const was = pane; pane = null; panel.hidden = true; G.paused = false;
        if (was === 'help' && Hub.user && net && !net.joined && !G.srvAsked) { G.srvAsked = true; openPanel('servers'); return; }
        if (wasDoor && G.onDoor) { const b = G.onDoor; G.px = (b.door.x + 0.5) * TS; G.py = (b.door.y + 1.9) * TS; G.onDoor = null; }
        if (!S.help) { S.help = true; markDirty(); }
        try { screenEl.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
      const npcBox = () => { const a = paneArg; if (!a || !a.npc) return ''; const d = a.npc.def; return `<div class="rg-npc"><img src="${npcPortrait(d.av)}" alt=""><div><b style="color:${d.color}">${d.name}</b><p>“${a.hello}”</p></div></div>`; };
      const head = (t, sub) => `<h3>${t}<button type="button" class="x" data-x>닫기 (Esc)</button></h3>${sub ? `<p class="sub">${sub}</p>` : ''}`;
      const tabs = (key, list) => `<div class="rg-tabs">${list.map(([k, n]) => `<button type="button" data-tab="${key}:${k}" aria-pressed="${(tab[key] || list[0][0]) === k}">${n}</button>`).join('')}</div>`;
      const stOf = it => Object.entries(it.st || {}).map(([k, v]) => ({ atk: '공격', mag: '마력', def: '방어', hp: '체력', mp: '마나', spd: '속도%' }[k] + ' +' + v)).join(' · ');
      function renderPanel() {
        const k = pane; let h = '';
        if (k === 'inv') {   // v41 가방 창: 왼쪽 = 내 캐릭터 + 장비 칸 5개 + 능력치 · 오른쪽 = 가방 40칸 + 고른 물건 자세히
          const f = tab.invF || 'all', sel = tab.invSel || null;
          h = head('가방 · 장비', `<span class="rg-gold">${fmtN(S.gold)} G</span> · 가방 <b>${S.inv.length}</b>/40칸`);
          const av = Hub.user ? Hub.user.avatar : AV.normalize({}), fig = avatarSprite(av, S.eq, S.hide, 0).toDataURL();
          const tierStyle = it => it && it.slot ? `--c:${D.TIER[it.tier].color};--g:${D.TIER[it.tier].gem}` : '--c:#5A64A0;--g:#FFFFFF';
          const slotBtn = sl => { const id = S.eq[sl], it = ITEMS[id]; return `<button type="button" class="rg-eqs${sel === 'eq:' + sl ? ' sel' : ''}${it && it.rare ? ' rare' : ''}${it ? '' : ' empty'}" data-pick="eq:${sl}" style="grid-area:${sl};${tierStyle(it)}">${it ? `<img src="${P.itemImg(id)}" alt="">` : `<img class="ph" src="${P.itemImg(Object.keys(ITEMS).find(q => ITEMS[q].slot === sl && !ITEMS[q].tier && !ITEMS[q].rare))}" alt="">`}<small>${D.SLOT_NAME[sl]}</small></button>`; };
          h += `<div class="rg-inv"><section class="rg-doll"><div class="rg-dollgrid">${['helmet', 'weapon', 'armor', 'ring', 'boots'].map(slotBtn).join('')}<div class="rg-fig"><img src="${fig}" alt="내 캐릭터"><span class="lv">Lv.${S.lv}</span></div></div>`;
          h += `<div class="rg-statgrid">${[['공격', ST.atk, '#FF8A8E'], ['마력', ST.mag, '#C8A8FF'], ['방어', ST.def, '#9AE6FF'], ['체력', ST.hp, '#FF7A7E'], ['마나', ST.mp, '#7FA0FF'], ['속도', '+' + ST.spd + '%', '#9AF0B0']].map(([a2, v, c2]) => `<div><span style="color:${c2}">${a2}</span><b>${v}</b></div>`).join('')}</div>`;
          h += `<label class="rg-check"><input type="checkbox" data-hide ${S.hide ? 'checked' : ''}> 장비 안보이기 <small style="color:#AEB7E0">(그림만 숨김)</small></label></section>`;
          const list = S.inv.filter(x => f === 'all' || (f === 'gear' ? !!ITEMS[x.id].slot : !ITEMS[x.id].slot));
          const cells = list.map(x => { const it = ITEMS[x.id], ok = !it.slot || S.lv >= it.req; return `<button type="button" class="rg-cell${sel === x.id ? ' sel' : ''}${it.rare ? ' rare' : ''}${ok ? '' : ' off'}" data-pick="${x.id}" style="${tierStyle(it)}" title="${it.name}"><img src="${P.itemImg(x.id)}" alt="${it.name}">${x.n > 1 ? `<span class="n">${x.n}</span>` : ''}${ok ? '' : `<span class="lk">Lv.${it.req}</span>`}</button>`; });
          const pad = f === 'all' ? 40 - list.length : (8 - list.length % 8) % 8 + (list.length ? 0 : 8);
          for (let i = 0; i < pad; i++) cells.push('<span class="rg-cell empty"></span>');
          h += `<section class="rg-bag"><div class="rg-tabs">${[['all', '전체'], ['gear', '장비'], ['use', '물약·물건']].map(([k2, n]) => `<button type="button" data-filt="${k2}" aria-pressed="${f === k2}">${n}</button>`).join('')}</div><div class="rg-grid">${cells.join('')}</div>`;
          // 고른 물건 자세히
          let it = null, id = null, worn = false;
          if (sel && sel.startsWith('eq:')) { id = S.eq[sel.slice(3)]; worn = true; } else if (sel && count(sel)) id = sel;
          it = ITEMS[id];
          if (it) {
            const cur = it.slot && !worn ? ITEMS[S.eq[it.slot]] : null, keys = ['atk', 'mag', 'def', 'hp', 'mp', 'spd'], nm = { atk: '공격', mag: '마력', def: '방어', hp: '체력', mp: '마나', spd: '속도%' };
            const cmp = it.slot ? keys.filter(q => (it.st || {})[q] || (cur && (cur.st || {})[q])).map(q => { const v = (it.st || {})[q] || 0, d = v - ((cur && cur.st && cur.st[q]) || 0); return `<span>${nm[q]} <b>${v}</b>${!worn && d ? ` <em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>` : ''}</span>`; }).join('') : '';
            const btn = worn ? `<button type="button" class="rg-mini ghost" data-unequip="${it.slot}">벗기</button>` : it.stack ? `<button type="button" class="rg-mini" data-use="${id}">쓰기</button>` : `<button type="button" class="rg-mini" data-equip="${id}" ${S.lv >= it.req ? '' : 'disabled'}>${S.lv >= it.req ? (cur ? '바꿔 입기' : '입기') : 'Lv.' + it.req + ' 필요'}</button>`;
            h += `<div class="rg-detail">${itemIcon(id)}<div class="grow"><b class="nm${it.rare ? ' rare' : ''}">${it.name}${worn ? ' <small>입는 중</small>' : ''}</b><span class="ds">${it.slot ? `${D.SLOT_NAME[it.slot]} · ${it.rare ? '정예 · ' : ''}Lv.${it.req} 이상${cur ? ' · 지금: ' + cur.name : ''}` : it.desc + ' · 가진 수 ' + count(id)}</span>${cmp ? `<div class="cmp">${cmp}</div>` : ''}</div>${btn}</div>`;
          } else h += `<div class="rg-detail hint">칸을 누르면 자세히 보여요. 장비는 <b>입기</b>, 물약은 <b>쓰기</b>. 사냥터 몬스터가 장비를 떨어뜨려요 (보스는 꼭!)</div>`;
          h += '</section></div>';
        } else if (k === 'skill') {
          h = head('마법', '마법을 누른 뒤 1~4 칸 버튼으로 넣어요. 같은 마법을 다른 칸에 넣으면 옮겨져요. 새 마법은 마을의 <b>마법 학교</b>에서 배워요.');
          h += `<div class="rg-slots">${[0, 1, 2, 3].map(i => { const sk = skill(S.slots[i]); return `<span class="rg-slot"><b>${i + 1}</b>${sk ? `<img class="rg-sk" src="${Fx.iconURL(sk)}" alt="">${sk.name}` : '<i>비어 있음</i>'}</span>`; }).join('')}</div>`;
          h += `<ul class="rg-list">${S.skills.length ? S.skills.map(id => { const sk = skill(id); return `<li class="rg-row"><img class="rg-sk" src="${Fx.iconURL(sk)}" alt=""><span class="grow"><span class="nm">${sk.fusion ? '융합 · ' : ''}${sk.name} <small style="color:#AEB7E0">Lv.${sk.lv}</small></span><span class="ds">${describe(sk)}</span></span>${[0, 1, 2, 3].map(i => `<button type="button" class="rg-mini${S.slots[i] === id ? ' on' : ' ghost'}" data-slot="${i}:${id}">${i + 1}</button>`).join('')}</li>`; }).join('') : '<li class="rg-row">아직 배운 마법이 없어요. Lv.3이 되면 새싹 마을 마법 학교에서 파이어볼을 배울 수 있어요.</li>'}</ul>`;
        } else if (k === 'potion') {
          const ri = G.map.M.region, t = tab.potion || 'buy';
          h = head('포션 가게', `<span class="rg-gold">${fmtN(S.gold)} G</span> · 이 마을은 ${ri + 1}단계 포션까지 팔아요`) + npcBox() + tabs('potion', [['buy', '사기'], ['sell', '팔기']]);
          if (t === 'buy') h += `<ul class="rg-list">${D.POTIONS.filter(p => p.tier <= ri).map(p => `<li class="rg-row">${itemIcon(p.id)}<span class="grow"><span class="nm">${p.name} <small style="color:#AEB7E0">가진 수 ${count(p.id)}</small></span><span class="ds">${p.desc} · ${fmtN(p.price)} G</span></span><button type="button" class="rg-mini" data-buy="${p.id}:1" ${S.gold >= p.price ? '' : 'disabled'}>1개</button><button type="button" class="rg-mini" data-buy="${p.id}:10" ${S.gold >= p.price * 10 ? '' : 'disabled'}>10개</button></li>`).join('')}</ul>`;
          else h += `<p class="sub">팔면 원래 값의 40%를 받아요. 입고 있는 장비는 팔 수 없어요.</p><ul class="rg-list">${S.inv.length ? S.inv.map(x => { const it = ITEMS[x.id], pr = Math.max(1, Math.round(it.price * 0.4)); return `<li class="rg-row">${itemIcon(x.id)}<span class="grow"><span class="nm">${it.name} ×${x.n}</span><span class="ds">1개 ${fmtN(pr)} G</span></span><button type="button" class="rg-mini" data-sell="${x.id}:1">1개</button>${x.n > 1 ? `<button type="button" class="rg-mini ghost" data-sell="${x.id}:${x.n}">모두</button>` : ''}</li>`; }).join('') : '<li class="rg-row">팔 물건이 없어요</li>'}</ul>`;
        } else if (k === 'school') {
          const ri = G.map.M.region, t = tab.school || 'learn';
          h = head('마법 학교', `<span class="rg-gold">${fmtN(S.gold)} G</span> · 마법 배우기 · 두 원소 섞기`) + npcBox() + tabs('school', [['learn', '마법 배우기'], ['fuse', '마법 융합']]);
          if (t === 'learn') {
            const list = Object.values(SKILLS).filter(s => s.village <= ri).sort((a, b) => a.lv - b.lv);
            h += `<p class="sub">이 마을까지의 마법을 배울 수 있어요. 다음 마을에 가면 더 강한 마법이 있어요.</p><ul class="rg-list">${list.map(s => { const has = S.skills.includes(s.id), ok = S.lv >= s.lv, sk = skill(s.id); return `<li class="rg-row${ok || has ? '' : ' off'}"><img class="rg-sk" src="${Fx.iconURL(sk)}" alt=""><span class="grow"><span class="nm">${s.name} <small style="color:#AEB7E0">Lv.${s.lv} · ${fmtN(s.price)} G</small></span><span class="ds">${describe(sk)}</span></span>${has ? '<span class="rg-mini on">배움</span>' : `<button type="button" class="rg-mini" data-learn="${s.id}" ${ok && S.gold >= s.price ? '' : 'disabled'}>${ok ? '배우기' : 'Lv.' + s.lv}</button>`}</li>`; }).join('')}</ul>`;
          } else {
            const base = S.skills.filter(id => SKILLS[id]);
            const a = tab.fa && base.includes(tab.fa) ? tab.fa : base[0], b = tab.fb && base.includes(tab.fb) ? tab.fb : base.find(x => SKILLS[x].el !== (SKILLS[a] || {}).el);
            tab.fa = a; tab.fb = b;
            h += `<p class="sub">서로 <b>다른 원소</b> 마법 2개를 섞으면 새 마법이 생겨요. 재료 마법은 그대로 남아요. (원소 짝 15가지)</p>`;
            if (base.length < 2) h += '<div class="rg-fuse">배운 마법이 2개 이상 있어야 융합할 수 있어요.</div>';
            else {
              const opt = sel => base.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${SKILLS[id].name} (${ELEM[SKILLS[id].el].name} · Lv.${SKILLS[id].lv})</option>`).join('');
              const res = a && b && SKILLS[a].el !== SKILLS[b].el ? skill(fuseId(a, b)) : null, has = res && S.skills.includes(res.id), price = res ? fusePrice(a, b) : 0;
              h += `<div class="rg-fuse"><label>재료 1 <select data-fa>${opt(a)}</select></label><label>재료 2 <select data-fb>${opt(b)}</select></label>
                ${res ? `<div class="rg-row"><img class="rg-sk" src="${Fx.iconURL(res)}" alt=""><span class="grow"><span class="nm">→ ${res.name}</span><span class="ds">${describe(res)}</span></span>${has ? '<span class="rg-mini on">이미 있음</span>' : `<button type="button" class="rg-mini" data-fuse="${a}+${b}" ${S.gold >= price ? '' : 'disabled'}>융합 ${fmtN(price)} G</button>`}</div>` : '<div class="rg-row">같은 원소끼리는 섞을 수 없어요. 다른 원소를 골라 주세요.</div>'}</div>`;
            }
            h += `<p class="sub">원소 짝 결과표</p><ul class="rg-list">${D.FUSION.map(f => `<li class="rg-row" style="padding:4px 8px"><span class="grow"><b style="color:${ELEM[f[0]].color}">${ELEM[f[0]].name}</b> + <b style="color:${ELEM[f[1]].color}">${ELEM[f[1]].name}</b> = ${f[2]} <small style="color:#AEB7E0">(${KIND_TXT[f[3]]})</small></span></li>`).join('')}</ul>`;
          }
        } else if (k === 'chief') {
          const vis = S.visited;
          h = head('이장 집', '이 마을이 귀환 장소가 돼요. 가 본 마을·사냥터로 무료 이동') + npcBox();
          h += `<div class="rg-tabs"><button type="button" class="rg-mini" data-savenow>지금 저장</button><span class="rg-mini ghost" style="cursor:default">처치 ${fmtN(S.kills)} · 플레이 ${Math.floor(S.play / 60)}분</span></div>`;
          D.REGIONS.forEach((R, ri) => {
            const vid = 'v' + (ri + 1), fs = D.MAPS.filter(m => m.kind === 'field' && m.region === ri);
            if (!vis.includes(vid) && !fs.some(m => vis.includes(m.id))) return;
            h += `<p class="sub" style="margin-top:8px"><b>${R.name}</b> 지역</p><div class="rg-tabs">${vis.includes(vid) ? `<button type="button" class="rg-mini" data-go="${vid}">${R.name}</button>` : ''}${fs.map(m => vis.includes(m.id) ? `<button type="button" class="rg-mini ghost" data-go="${m.id}">${m.no}. ${m.name} (Lv.${m.rec})</button>` : '').join('')}</div>`;
          });
          h += '<p class="sub" style="margin-top:8px">※ 퀘스트는 준비 중이에요. 나중에 마지막 마을의 성에서 나눠 줄 예정이에요.</p>';
        } else if (k === 'castle') {
          h = head('왕성', '퀘스트는 아직 준비 중이에요. 다음 업데이트에서 이곳에서 퀘스트를 받을 수 있어요.') + npcBox();
        } else if (k === 'tradeAsk') {
          const pp = paneArg.pp;
          h = head('거래 신청', '같은 지도에 있는 사람과 아이템·골드를 바꿀 수 있어요. 두 사람 모두 확인을 눌러야 바뀌어요.');
          h += `<div class="rg-fuse"><b style="color:#9AE6FF">${pp.nick}</b> (Lv.${pp.lv}) 님에게 거래를 신청할까요?</div><div class="rg-srvact"><button type="button" class="rg-mini" data-trreq="${pp.cid}">거래 신청</button><button type="button" class="rg-mini ghost" data-x>취소</button></div>`;
        } else if (k === 'tradeIn') {
          h = `<h3>거래 신청이 왔어요</h3><div class="rg-fuse"><b style="color:#9AE6FF">${paneArg.nick}</b> 님이 거래를 하고 싶어 해요.</div><div class="rg-srvact"><button type="button" class="rg-mini" data-tryes="${paneArg.cid}">수락</button><button type="button" class="rg-mini ghost" data-trno="${paneArg.cid}">거절</button></div>`;
        } else if (k === 'trade') {
          const T = G.trade; if (!T) { h = head('거래', '거래가 끝났어요.'); panel.innerHTML = h; return; }
          const list = (o, mine) => { const ids = Object.keys(o.items).filter(id => o.items[id] > 0); return ids.length ? ids.map(id => `<${mine ? 'button type="button" data-trdel="' + id + '"' : 'span'} class="rg-cell${ITEMS[id].rare ? ' rare' : ''}" title="${ITEMS[id].name}${mine ? ' (누르면 빼기)' : ''}"><img src="${P.itemImg(id)}" alt="${ITEMS[id].name}"><span class="n">${o.items[id]}</span></${mine ? 'button' : 'span'}>`).join('') : '<span class="rg-trempty">아직 없어요</span>'; };
          h = `<h3>${T.nick}님과 거래<button type="button" class="x" data-trcancel>거래 취소</button></h3>`;
          h += `<div class="rg-trade"><section class="rg-bag${T.myOk ? ' ok' : ''}"><b class="tt">내가 줄 것 ${T.myOk ? '<em>확인</em>' : ''}</b><div class="rg-trlist">${list(T.mine, true)}</div><label class="rg-trgold">골드 <input type="number" min="0" max="${S.gold}" value="${T.mine.gold}" data-trgold> <small>/ ${fmtN(S.gold)} G</small></label></section>`;
          h += `<section class="rg-bag${T.theirOk ? ' ok' : ''}"><b class="tt">${T.nick}님이 줄 것 ${T.theirOk ? '<em>확인</em>' : ''}</b><div class="rg-trlist">${list(T.theirs, false)}</div><div class="rg-trgold">골드 <b class="rg-gold">${fmtN(T.theirs.gold)} G</b></div></section></div>`;
          const bag = S.inv.filter(x => count(x.id) - (T.mine.items[x.id] || 0) > 0);
          h += `<p class="sub" style="margin-top:10px">내 가방 — 눌러서 올리기 (입고 있는 장비는 못 올려요)</p><div class="rg-grid">${bag.map(x => { const left = x.n - (T.mine.items[x.id] || 0), it = ITEMS[x.id]; return `<button type="button" class="rg-cell${it.rare ? ' rare' : ''}" data-tradd="${x.id}" title="${it.name}"><img src="${P.itemImg(x.id)}" alt="${it.name}">${left > 1 ? `<span class="n">${left}</span>` : ''}</button>`; }).join('') || '<span class="rg-trempty">올릴 물건이 없어요</span>'}</div>`;
          const room = roomFor(T.theirs, T.mine);
          h += `<div class="rg-srvact" style="align-items:center"><button type="button" class="rg-mini${T.myOk ? ' on' : ''}" data-trok ${room ? '' : 'disabled'}>${T.myOk ? '확인함 (다시 누르면 풀기)' : '확인'}</button><span class="sub" style="margin:0">${!room ? '가방이 모자라요 (40칸)' : T.myOk && T.theirOk ? '교환하는 중…' : T.myOk ? '상대가 확인하면 바뀌어요' : T.theirOk ? '상대는 확인했어요. 내용을 보고 확인을 눌러요' : '둘 다 확인을 누르면 바뀌어요'}</span></div>`;
        } else if (k === 'stat') {   // v44 스탯 창: 왼쪽 캐릭터 · 오른쪽 힘·민첩·지혜·체력 올리기 · 아래 자세한 능력치
          const T = D.STAT, a = S.stat, PT = stats(true), used = T.keys.reduce((x, q) => x + a[q], 0), per = CFG.statPerLevel || 2;
          const av = Hub.user ? Hub.user.avatar : AV.normalize({}), fig = avatarSprite(av, S.eq, S.hide, 0).toDataURL(), ex = S.lv >= D.MAX_LV ? 100 : S.exp / D.F.need(S.lv) * 100;
          h = head('스탯', `레벨이 오를 때마다 포인트 ${per}개 · 원하는 스탯에 올려요 (스탯마다 최대 ${T.max})`);
          h += `<div class="rg-statwin"><section class="rg-doll rg-statfig"><div class="rg-fig"><img src="${fig}" alt="내 캐릭터"><span class="lv">Lv.${S.lv}</span></div><b class="nm">${Hub.user ? Hub.user.nickname : '손님'}</b><div class="rg-xp"><i style="width:${ex.toFixed(1)}%"></i></div><small>경험치 ${ex.toFixed(1)}%</small></section>`;
          h += `<section class="rg-bag rg-alloc"><div class="rg-sp">남은 포인트 <b>${S.sp}</b></div>${T.keys.map(q => { const full = a[q] >= T.max; return `<div class="rg-st" style="--c:${T[q].color}"><div class="lab"><b>${T[q].name}</b><span>${a[q]}<small class="mx"> / ${T.max}</small></span></div><small>${T[q].desc}</small><div class="btns"><button type="button" class="rg-mini" data-addst="${q}:1" ${S.sp < 1 || full ? 'disabled' : ''}>+1</button><button type="button" class="rg-mini ghost" data-addst="${q}:5" ${S.sp < 1 || full ? 'disabled' : ''}>+5</button></div></div>`; }).join('')}<div class="rg-srvact"><button type="button" class="rg-mini ghost" data-streset ${used ? '' : 'disabled'}>포인트 다시 나누기 (무료)</button></div></section></div>`;
          const fm = v => (Math.round(v * 10) / 10).toLocaleString('ko-KR'), pt = (k2, unit) => { const b = PT.base[k2] || 0, sv = PT.sta[k2] || 0, g = PT.gear[k2] || 0; return [b ? `기본 ${fm(b)}${unit}` : '', sv ? `<em class="s">스탯 +${fm(sv)}${unit}</em>` : '', g ? `<em class="g">장비 +${fm(g)}${unit}</em>` : ''].filter(Boolean).join(' · ') || '—'; };
          const rows = [
            ['주는 피해', '+' + fm(ST.dmg || 0) + '%', '기본 공격·마법 모두', pt('dmg', '%'), '#FF8A8E'],
            ['공격력', ST.atk, '기본 공격 피해', pt('atk', ''), '#FF8A8E'],
            ['마력', ST.mag, '마법 피해 (마법 위력 × 마력)', pt('mag', ''), '#C8A8FF'],
            ['방어력', ST.def, `받는 피해 −${fm(ST.def * 0.5)}`, pt('def', ''), '#9AE6FF'],
            ['최대 체력', ST.hp, '', pt('hp', ''), '#FFB86B'],
            ['최대 마나', ST.mp, '', pt('mp', ''), '#7FA0FF'],
            ['마나 회복', fm(ST.mpRegen) + '%', `싸우지 않을 때 1초에 마나 ${fm(ST.mp * 0.02 * ST.mpRegen / 100)}`, pt('mpRegen', '%'), '#C8A8FF'],
            ['이동 속도', '+' + fm(ST.spd || 0) + '%', '', pt('spd', '%'), '#9AF0B0']
          ];
          h += `<div class="rg-detailgrid">${rows.map(([n, v, d2, parts, c2]) => `<div><span style="color:${c2}">${n}</span><b>${v}</b>${d2 ? `<small>${d2}</small>` : ''}<small class="pt">${parts}</small></div>`).join('')}</div>`;
        } else if (k === 'servers') {   // v42 서버 고르기
          const cap = net.opt.cap, L = srvList;
          h = head('서버 고르기', '같은 서버의 같은 지도에 있는 사람이 보여요. 아이템·마법·레벨은 <b>계정에 저장</b>돼서 어느 서버에서나 그대로 이어져요.');
          if (!Hub.user) h += `<div class="rg-fuse">로그인하면 다른 사람과 함께 모험할 수 있어요. 손님은 혼자 하기로 이어져요.</div><button type="button" class="btn btn-primary" data-x>혼자 하기</button>`;
          else if (!L) h += '<p class="sub">서버 인원을 불러오는 중…</p>';
          else if (L.error) h += `<div class="rg-fuse">${L.error === 'sql' ? '온라인 서버 준비가 아직 안 됐어요. (관리자: supabase/rpg_online_v42.sql 실행 필요)' : '서버 인원을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'}</div><button type="button" class="btn btn-primary" data-solo>혼자 하기</button>`;
          else {
            const rows = L.rows, low = rows.reduce((a, r) => (r.players != null && r.players < cap && (a == null || r.players < a.players) ? r : a), null);
            h += `<div class="rg-srvs">${rows.map(r => { const n = r.players, full = n != null && n >= cap, pct = n == null ? 0 : Math.round(n / cap * 100), cur = net.joined && net.server === r.server;
              const lab = n == null ? '체험 모드' : full ? '가득' : n >= cap * 2 / 3 ? '혼잡' : n >= cap / 3 ? '보통' : '여유', col = full ? '#FF5A5F' : n >= cap * 2 / 3 ? '#FF9A3D' : n >= cap / 3 ? '#FFD23F' : '#3DDC84';
              return `<button type="button" class="rg-srv${cur ? ' cur' : ''}" data-srv="${r.server}" ${full && !cur ? 'disabled' : ''}><b>${r.server}서버</b>${low && low.server === r.server && !cur ? '<em>추천</em>' : ''}${cur ? '<em class="me">지금</em>' : ''}<span class="bar"><i style="width:${pct}%;background:${col}"></i></span><small>${n == null ? lab : `${n} / ${cap}명 · <span style="color:${col}">${lab}</span>`}</small></button>`; }).join('')}</div>`;
            h += `<div class="rg-srvact"><button type="button" class="rg-mini" data-srv="auto">가장 한산한 서버로 들어가기</button><button type="button" class="rg-mini ghost" data-solo>${net.joined ? '서버에서 나와 혼자 하기' : '혼자 하기'}</button></div>`;
            h += `<p class="sub">한 서버에 ${cap}명까지 · 서버 ${rows.length}개. 몬스터와 떨어진 물건은 각자 따로예요. ${L.demo ? '(체험 모드: 같은 브라우저의 다른 탭끼리만 연결돼요)' : ''}</p>`;
          }
        } else if (k === 'dead') {
          h = `<h3>쓰러졌어요…</h3><p class="sub">경험치를 ${fmtN(paneArg.loss)} 잃었어요. (레벨은 그대로)<br>마지막으로 들른 마을(${MAPBY[S.home].name})의 이장 집 앞에서 다시 시작해요.</p><button type="button" class="btn btn-primary" data-revive>마을에서 다시 시작</button>`;
        } else if (k === 'help') {
          h = head('도움말', '내 아바타로 떠나는 도트 RPG — 혼자 플레이 첫 버전') + (imgOk('key') ? `<img src="${imgOk('key').src}" alt="" style="width:100%;border-radius:10px;border:2px solid #0A0E24;margin:4px 0 10px;display:block">` : '');
          h += `<ul class="ult-rules">
            <li><b>이동</b> WASD·방향키 · <b>공격</b> Space·J · <b>마법</b> 1~4 · <b>포션</b> Q(체력) E(마나) · <b>가방</b> I · <b>마법 창</b> K · <b>창 닫기</b> Esc</li>
            <li>휴대폰은 화면 왼쪽을 끌면 이동(조이스틱), 오른쪽 버튼으로 공격·마법·포션. 가로로 돌리면 더 커요.</li>
            <li>지도 <b>오른쪽 끝 → 다음 지도</b>, 왼쪽 끝 → 이전 지도. 마을 → 사냥터 10곳 → 다음 마을 … 마을 하나가 10레벨씩(새싹 마을 Lv.1~10 … 하늘섬 마을 Lv.71~80), 마지막 불꽃왕성은 Lv.80~100.</li>
            <li>문으로 걸어 들어가면 <b>건물 안</b>이에요. 안에 있는 사람에게 가까이 가면 이야기해요: <b>포션 가게</b> 미나 · <b>마법 학교</b> 루멘(마법 배우기·융합) · <b>이장 집</b> 이장님(무료 이동·저장). 아래 가운데 문으로 나가요.</li>
            <li>처음부터 <b>마법 화살</b>(1번 키)을 쓸 수 있어요.</li>
            <li><b>스탯</b>: 레벨이 오를 때마다 포인트 2개 — 왼쪽 위 얼굴(또는 C)을 눌러 힘(피해)·민첩(이동 속도)·지혜(마나 회복)·체력(최대 체력)에 올려요. 스탯마다 최대 50.</li>
            <li><b>거래</b>: 온라인 서버에서 같은 지도에 있는 사람을 누르거나 가까이 가서 F → 거래 신청. 둘 다 확인을 누르면 아이템·골드가 바뀌어요.</li>
            <li>직업은 없어요. 레벨이 오르면 마법 학교에서 새 마법을 배우고, 두 원소를 섞어 <b>융합 마법</b>을 만들어요.</li>
            <li>장비는 몬스터가 떨어뜨려요(보스는 꼭). 입으면 아바타 위에 보이고, 가방의 <b>장비 안보이기</b>로 그림만 숨길 수 있어요.</li>
            <li>쓰러지면 경험치가 조금 줄고 마지막 마을에서 다시 시작해요. <b>귀환 주문서</b>로 언제든 마을로 돌아갈 수 있어요.</li>
          </ul><button type="button" class="btn btn-primary" data-x>모험 시작!</button>`;
        }
        panel.innerHTML = h;
      }
      function equipNow(id) {
        const it = ITEMS[id]; if (!it || !it.slot || S.lv < it.req || !takeItem(id)) return false;
        const old = S.eq[it.slot]; if (old) addItem(old, 1);
        S.eq[it.slot] = id; restat(); markDirty(true); if (net) net.retrack(); say(`${it.name} 착용!`, 1.4); return true;
      }
      let srvList = null, srvTimer = 0;
      async function loadServers() {
        if (!Hub.user) return;
        const L = await net.list(); srvList = L; if (pane === 'servers') renderPanel();
      }
      async function joinServer(v) {
        if (!Hub.user) return;
        if (!srvList || srvList.error) await loadServers();
        const rows = (srvList && srvList.rows) || [], cap = net.opt.cap;
        let n = +v;
        if (v === 'auto') { const ok = rows.filter(r => r.players == null || r.players < cap).sort((a, b) => (a.players || 0) - (b.players || 0)); if (!ok.length) { say('모든 서버가 가득 찼어요. 잠시 뒤 다시 해 주세요', 3); return; } n = ok[0].server; }
        if (net.joined && net.server === n) { closePanel(); return; }
        say(`${n}서버에 들어가는 중…`, 2); save(true);
        const r = await net.join(n, roomKey(), S.lv);
        if (r.ok) { say(`${n}서버에 들어왔어요!${r.players ? ` (지금 ${r.players}명)` : ''}`, 2.6); closePanel(); }
        else { say(r.reason === 'full' ? `${n}서버는 가득 찼어요 (${cap}명). 다른 서버를 골라 주세요` : r.reason === 'sql' ? '온라인 서버 준비가 아직 안 됐어요' : r.reason === 'banned' ? '이 계정은 지금 온라인에 들어갈 수 없어요' : '서버에 들어가지 못했어요. 잠시 뒤 다시 해 주세요', 3.5); loadServers(); }
      }
      panel.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('[data-trgold]')) { const T = G.trade; if (!T) return; T.mine.gold = clamp(Math.floor(+t.value || 0), 0, S.gold); sendOffer(); renderPanel(); return; }
        if (t.matches('[data-hide]')) { S.hide = t.checked; markDirty(); if (net) net.retrack(); renderPanel(); }
        else if (t.matches('[data-fa]')) { tab.fa = t.value; if (tab.fb === t.value || (SKILLS[tab.fb] && SKILLS[tab.fb].el === SKILLS[t.value].el)) tab.fb = null; renderPanel(); }
        else if (t.matches('[data-fb]')) { tab.fb = t.value; renderPanel(); }
      });
      panel.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        const d = b.dataset;
        if ('x' in d) { closePanel(); return; }
        if (d.tab) { const [k, v] = d.tab.split(':'); tab[k] = v; renderPanel(); return; }
        if (d.pick) { tab.invSel = tab.invSel === d.pick && !d.pick.startsWith('eq:') && !ITEMS[d.pick].stack && S.lv >= ITEMS[d.pick].req ? (equipNow(d.pick), 'eq:' + ITEMS[d.pick].slot) : d.pick; renderPanel(); return; }   // 같은 장비를 한 번 더 누르면 입기
        if (d.filt) { tab.invF = d.filt; renderPanel(); return; }
        if (d.equip) { if (equipNow(d.equip)) tab.invSel = 'eq:' + ITEMS[d.equip].slot; }
        else if (d.unequip) {
          const id = S.eq[d.unequip]; if (!id) return; if (!addItem(id, 1)) return; delete S.eq[d.unequip]; restat(); markDirty(true); if (net) net.retrack(); tab.invSel = id;
        } else if (d.use) { useItem(d.use); if (!count(d.use)) tab.invSel = null; }
        else if (d.slot) {
          const [i, id] = d.slot.split(':'); const n = +i;
          if (S.slots[n] === id) S.slots[n] = null; else { S.slots = S.slots.map(x => (x === id ? null : x)); S.slots[n] = id; }
          markDirty();
        } else if (d.buy) {
          const [id, n] = d.buy.split(':'), it = ITEMS[id], cost = it.price * +n; if (S.gold < cost) return;
          if (addItem(id, +n)) { S.gold -= cost; markDirty(true); }
        } else if (d.sell) {
          const [id, n] = d.sell.split(':'), it = ITEMS[id]; if (takeItem(id, +n)) { S.gold += Math.max(1, Math.round(it.price * 0.4)) * +n; markDirty(true); }
        } else if (d.learn) {
          const s = SKILLS[d.learn]; if (S.lv < s.lv || S.gold < s.price || S.skills.includes(s.id)) return;
          S.gold -= s.price; S.skills.push(s.id); const free = S.slots.indexOf(null); if (free >= 0) S.slots[free] = s.id;
          say(`'${s.name}' 배움!${free >= 0 ? ` ${free + 1}번 키로 써 보세요` : ' 마법 창(K)에서 칸에 넣어요'}`, 3); markDirty(true);
        } else if (d.fuse) {
          const [a, bb] = d.fuse.split('+'), id = fuseId(a, bb), price = fusePrice(a, bb);
          if (S.gold < price || S.skills.includes(id) || !skill(id)) return;
          S.gold -= price; S.skills.push(id); const free = S.slots.indexOf(null); if (free >= 0) S.slots[free] = id;
          say(`융합 성공! '${skill(id).name}'`, 3); markDirty(true);
        } else if (d.go) { const id = d.go; pane = null; panel.hidden = true; G.paused = false; enter(id, MAPBY[id].kind === 'village' ? 'door' : 'L'); return; }
        else if (d.addst) { const [q, n0] = d.addst.split(':'), n = Math.min(+n0, S.sp, D.STAT.max - (S.stat[q] || 0)); if (n > 0 && S.stat[q] != null) { S.stat[q] += n; S.sp -= n; const hr = S.hp / ST.hp; restat(); if (q === 'vit') S.hp = Math.round(ST.hp * hr); markDirty(true); } }
        else if ('streset' in d) { D.STAT.keys.forEach(q => { S.sp += S.stat[q]; S.stat[q] = 0; }); restat(); markDirty(true); say('스탯 포인트를 모두 돌려받았어요. 다시 나눠 주세요', 2.4); }
        else if (d.trreq) { const pp = net.peers.get(d.trreq); if (!pp) { say('상대가 이 지도에 없어요', 2); closePanel(); return; } G.trade = { with: pp.cid, nick: pp.nick, state: 'wait' }; net.trade({ k: 'req', to: pp.cid }); pane = null; panel.hidden = true; G.paused = false; say(`${pp.nick}님에게 거래 신청을 보냈어요…`, 3); setTimeout(() => { if (G.trade && G.trade.state === 'wait' && G.trade.with === pp.cid) { G.trade = null; say('대답이 없어서 거래 신청을 취소했어요', 2.6); } }, 20000); return; }
        else if (d.tryes) { const pp = net.peers.get(d.tryes); if (!pp) { closePanel(); return; } net.trade({ k: 'yes', to: pp.cid }); startTrade(pp.cid, pp.nick); return; }
        else if (d.trno) { net.trade({ k: 'no', to: d.trno }); pane = null; panel.hidden = true; G.paused = false; return; }
        else if ('trcancel' in d) { endTrade(true); say('거래를 취소했어요', 2); return; }
        else if (d.tradd) { const T = G.trade; if (!T) return; const id = d.tradd; if (count(id) - (T.mine.items[id] || 0) > 0 && Object.keys(T.mine.items).filter(q => T.mine.items[q] > 0).length < 12) { T.mine.items[id] = (T.mine.items[id] || 0) + 1; sendOffer(); } }
        else if (d.trdel) { const T = G.trade; if (!T) return; T.mine.items[d.trdel] = Math.max(0, (T.mine.items[d.trdel] || 0) - 1); sendOffer(); }
        else if ('trok' in d) { const T = G.trade; if (!T) return; T.myOk = !T.myOk; if (T.myOk) { net.trade({ k: 'ok', to: T.with, key: tradeKey() }); if (T.theirOk && Hub.clientId < T.with) { net.trade({ k: 'commit', to: T.with, key: tradeKey() }); applyTrade(); return; } } else net.trade({ k: 'unok', to: T.with }); }
        else if (d.srv) { joinServer(d.srv); return; }
        else if ('solo' in d) { if (net.joined) { net.leave(); say('혼자 하기로 바꿨어요', 2); } closePanel(); return; }
        else if ('savenow' in d) { save(true).then(ok => say(ok || !Store.online() ? '저장했어요' : '이 기기에 저장했어요 (서버 저장은 준비 중)')); return; }
        else if ('revive' in d) { G.dead = false; pane = null; panel.hidden = true; G.paused = false; restat(); S.hp = ST.hp; S.mp = ST.mp; enter(S.home, 'door'); return; }
        renderPanel();
      });
      el.querySelector('.rg-bar').addEventListener('click', e => {
        const b = e.target.closest('[data-rg]'); if (!b || !S) return; b.blur();
        const k = b.dataset.rg;
        if (k === 'save') { save(true).then(ok => say(ok || !Store.online() ? '저장했어요' : '이 기기에 저장했어요 (서버 저장은 준비 중)')); return; }
        if (k === 'full') { toggleFull(); return; }
        if (G.dead) return;
        if (pane === k) closePanel(); else openPanel(k);
      });

      /* ================= 입력 ================= */
      const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyJ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyE', 'KeyI', 'KeyK', 'KeyC', 'KeyF', 'Enter', 'Escape']);
      function onKey(e) {
        if (!S || !G.map) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (document.querySelector('#authModal:not([hidden])')) return;
        const r = canvas.getBoundingClientRect(); if (r.bottom < 60 || r.top > innerHeight - 60) return;   // 게임판이 화면에 없으면 무시
        if (!GAME_KEYS.has(e.code)) return;
        const down = e.type === 'keydown';
        if (down && e.code === 'Escape') { if (pane) { e.preventDefault(); closePanel(); } return; }
        if (down && (e.code === 'KeyI' || e.code === 'KeyK' || e.code === 'KeyC')) { e.preventDefault(); const k = e.code === 'KeyI' ? 'inv' : e.code === 'KeyK' ? 'skill' : 'stat'; if (G.dead) return; if (pane === k) closePanel(); else if (!pane || pane === 'inv' || pane === 'skill' || pane === 'stat' || pane === 'help') openPanel(k); return; }
        if (pane) { if (tag !== 'button') e.preventDefault(); return; }
        if (tag === 'button' && (e.code === 'Space' || e.code === 'Enter')) return;
        e.preventDefault();
        G.keys[e.code] = down;
        if (!down || e.repeat) return;
        if (e.code.startsWith('Digit')) cast(+e.code.slice(5) - 1);
        else if (e.code === 'KeyQ') usePotion('hp');
        else if (e.code === 'KeyE') usePotion('mp');
        else if (e.code === 'KeyF' || e.code === 'Enter') {
          if (net && net.peers.size) { let pp = null, bd = 70; net.peers.forEach(q => { const dd = Math.hypot(G.px - q.x, G.py - q.y); if (dd < bd) { bd = dd; pp = q; } }); if (pp) { askTrade(pp); return; } }
          if (G.room) { const n = (G.npcs || []).find(q => Math.hypot(G.px - q.talk.x, G.py - q.talk.y) < q.talk.r * 1.4); if (n) talk(n); return; }
          const nv = (G.npcs || []).find(q => Math.hypot(G.px - q.x, G.py - q.y) < 70); if (nv) { nv.say = pick(nv.def.lines); nv.sayT = 3.2; return; }
          const tx = Math.floor(G.px / TS); const b = G.map.doors.find(x => Math.abs(x.door.x - tx) <= 1 && Math.abs((x.door.y + 1) * TS - G.py) < 48); if (b) { G.onDoor = b; enterRoom(b); }
        }
      }
      document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
      const blurKeys = () => { G.keys = {}; G.btnDown = {}; if (G.joy) G.joy.on = false; };
      window.addEventListener('blur', blurKeys);

      // 터치 (캔버스 좌표로 바꿔서)
      const pts = {};
      const toC = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
      const btnAt = p => Object.keys(TB).find(k => Math.hypot(p.x - TB[k].x, p.y - TB[k].y) < TB[k].r + 10);
      canvas.addEventListener('pointerdown', e => {
        if (!S || pane) return;
        if (e.pointerType === 'touch' || e.pointerType === 'pen') G.touch = true;
        { const q = toC(e); if (q.x < 92 && q.y < 96 && !G.dead) { e.preventDefault(); openPanel('stat'); return; }   // v43 왼쪽 위 얼굴 → 스탯 창
          if (!(G.touch && btnAt(q))) { const pp = peerAt(q); if (pp) { e.preventDefault(); askTrade(pp); return; } } }   // v44 다른 사람 누르기 → 거래
        if (!G.touch) { screenEl.focus({ preventScroll: true }); return; }
        e.preventDefault(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        const p = toC(e), b = btnAt(p);
        if (b) { pts[e.pointerId] = { btn: b }; G.btnDown[b] = true; if (b[0] === 's') cast(+b[1]); else if (b === 'hp' || b === 'mp') usePotion(b); return; }
        if (p.x < W * 0.55) { pts[e.pointerId] = { joy: true }; G.joy = { on: true, cx: p.x, cy: p.y, vx: 0, vy: 0 }; }
      }, { passive: false });
      canvas.addEventListener('pointermove', e => {
        const s = pts[e.pointerId]; if (!s || !s.joy || !G.joy) return; e.preventDefault();
        const p = toC(e), dx = p.x - G.joy.cx, dy = p.y - G.joy.cy, l = Math.hypot(dx, dy), k = Math.min(1, l / 50);
        G.joy.vx = l ? dx / l * k : 0; G.joy.vy = l ? dy / l * k : 0;
      }, { passive: false });
      const up = e => { const s = pts[e.pointerId]; if (!s) return; if (s.btn) G.btnDown[s.btn] = false; if (s.joy && G.joy) G.joy.on = false; delete pts[e.pointerId]; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      const onHide = () => { if (document.hidden && S) save(true); };
      document.addEventListener('visibilitychange', onHide);
      const onUnload = () => { if (S) save(false); };
      window.addEventListener('pagehide', onUnload);

      // 휴대폰 가로(낮은 화면): 게임판 위쪽을 화면 맨 위에 맞춤 / 그 밖: 게임판과 아래 버튼이 한 화면에 보이게
      // v43 크게 보기: 게임판만 화면 가득 (가능하면 브라우저 전체 화면 + 가로 고정, 안 되면 페이지 위에 가득)
      const cabEl = () => el.querySelector('.cabinet');
      const fsNow = () => document.fullscreenElement || document.webkitFullscreenElement;
      function toggleFull() {
        const cab = cabEl(); if (!cab) return;
        if (fsNow() || cab.classList.contains('rg-max')) {
          if (fsNow()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* noop */ } }
          cab.classList.remove('rg-max'); setTimeout(onResize, 200); return;
        }
        const req = cab.requestFullscreen || cab.webkitRequestFullscreen;
        const fallback = () => { cab.classList.add('rg-max'); setTimeout(onResize, 100); };
        if (!req) { fallback(); return; }
        try {
          const pr = req.call(cab, { navigationUI: 'hide' });
          if (pr && pr.then) pr.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* noop */ } setTimeout(onResize, 200); }, fallback);
        } catch (e) { fallback(); }
        try { screenEl.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
      const onFs = () => { setTimeout(onResize, 150); const b = el.querySelector('[data-rg="full"]'); if (b) b.textContent = fsNow() ? '작게 보기' : '크게 보기'; };
      document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
      $('#rgFull').addEventListener('click', e => { e.stopPropagation(); toggleFull(); });
      function fitScreen() {
        const cab = el.querySelector('.cabinet'); if (!cab || !cab.isConnected) return;
        if (innerHeight < 520) {
          const top = document.querySelector('.top'), pos = top ? getComputedStyle(top).position : '';
          const th = top && (pos === 'sticky' || pos === 'fixed') ? top.getBoundingClientRect().bottom : 0;
          window.scrollTo(0, Math.max(0, scrollY + cab.getBoundingClientRect().top - th - 2));
        } else if (window.GoStudy && GoStudy.fitView) GoStudy.fitView(cab, el.querySelector('.rg-bar'));
      }
      const onOrient = () => setTimeout(fitScreen, 250);
      window.addEventListener('orientationchange', onOrient);

      /* ================= 시작 ================= */
      (async () => {
        loadingText = '그림 불러오는 중…';
        const [s] = await Promise.all([Store.load(), loadImages(6000)]); if (!alive) return; loadingText = '';
        S = s; restat(); if (!S.hp) S.hp = ST.hp; if (!S.mp) S.mp = ST.mp;
        G.touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
        enter(S.map, S.x ? 'pos' : 'L');
        if (MAPBY[S.map].kind === 'field' && S.x) { /* 그 자리에서 이어서 */ }
        G.paused = false; G.playMark = S.play;
        makeNet();
        fitScreen();
        if (S.statReset) { delete S.statReset; markDirty(true); setTimeout(() => say(`스탯이 힘·민첩·지혜·체력 4가지로 바뀌었어요! 포인트 ${S.sp}개를 다시 나눠 주세요 (왼쪽 위 얼굴)`, 5), 900); }
        else if (G.touch && innerHeight < 520 && !fsNow()) setTimeout(() => say('오른쪽 위 [ ] 버튼을 누르면 화면이 크게 보여요', 3.5), 1200);
        if (!S.help) openPanel('help');
        else if (Hub.user) { G.srvAsked = true; openPanel('servers'); }
        loadRank();
        if (Hub.user) Hub.myBest(GAME).then(b => { if ((b || 0) < S.lv) submitRank(); }).catch(() => {});
        window.__rpg = { net: () => net, S: () => S, G: () => G, ST: () => ST, enter, enterRoom, leaveRoom, cast, gainExp, save, openPanel, closePanel, skill, addItem, renderPanel: () => renderPanel() };   // 점검(테스트)용
      })();
      raf = requestAnimationFrame(loop);
      BGM.play();

      return () => {
        alive = false; cancelAnimationFrame(raf); clearInterval(srvTimer);
        if (S) save(true);
        if (net) net.leave();
        document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey);
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onOrient);
        document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); if (fsNow()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* noop */ } } window.removeEventListener('blur', blurKeys); window.removeEventListener('pagehide', onUnload);
        BGM.stop();
      };
    }
  };
})();
