/*
 * gogo?gogo! — Skillcom Fight (3D 마법 대결 · v45 첫 버전)
 *
 *  화면: ① 대기방(왼쪽: 컴퓨터와 대결 · 온라인 1:1 방 / 오른쪽: 스킬 고르기 + 그 아래 스탯) ② 3D 대결
 *  캐릭터: skillcom RPG 저장(game_saves 'rpg' 또는 이 기기)에서 **아바타 + 레벨만** (장비 X). 아바타 도트를 3D 블록으로 세움
 *  마법: 원소 6개(화염·냉기·번개·땅·암흑·빛) 중 4개를 1~4 칸에. 숫자 하나 = 차지(발사 대기) → 마우스 왼쪽 = 발사, 오른쪽 = 취소. 차지 중 숫자 하나 더 = 융합 차지 (같은 숫자 = 강화)
 *  스탯: 레벨당 2포인트 · 최대 50 — 힘(피해 +2%) 민첩(이동 +1%) 지혜(마나 회복 +4%) 체력(최대 체력 +2%) + 원소 저항 6개(그 원소 피해 −1%)
 *  저장: game_saves 'scfight' {stat, skills, wins} (로그인) + 이 기기
 *  대결: 1:1 또는 2:2 (컴퓨터와 · 온라인). 2:2 는 같은 편끼리 안 맞음. 한 편이 모두 쓰러지면 끝
 *  온라인: Hub.channel 'scf-lobby'(방 목록) · 'scf-room-<코드>'(1:1 = 2명, 2:2 = 4명. 모자라면 방장이 빈자리를 컴퓨터로 채워 시작)
 *          방장이 'start'(편 나눔) 를 보냄. 각자 자기 몸(방장은 컴퓨터도)의 자리·체력을 보내고, 맞았는지는 맞은 몸을 맡은 기기가 판단
 *  ※ 경기장·컴퓨터 상대는 임시 그림 → Skillcom 원본으로 바꿀 자리: buildArena() · makeEnemyAvatar()
 */
(function () {
  'use strict';
  const Hub = window.GameHub, AV = window.GoAvatar, BGM = window.GoBGM;
  const CFG = window.GoSettings.get('scfight'), GAME = 'scfight', DIR = 'games/action/scfight/';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];

  /* ================= 원소 · 마법 ================= */
  const EL = {
    fire: { n: '화염', c: '#FF6A3D', c2: '#FFD27A' }, cold: { n: '냉기', c: '#7FD8FF', c2: '#E6FBFF' }, bolt: { n: '번개', c: '#FFE45C', c2: '#FFFFFF' },
    earth: { n: '땅', c: '#C8915A', c2: '#F0D2A0' }, dark: { n: '암흑', c: '#9A5AE0', c2: '#E0C8FF' }, light: { n: '빛', c: '#FFF3B0', c2: '#FFFFFF' }
  };
  const ELS = Object.keys(EL);
  // 기본 마법 (원소마다 하나): 피해 · 마나 · 재사용(초) · 탄 속도 · 크기 · 특징
  const SK = {
    fire: { n: '화염구', dmg: 14, mp: 12, cd: 0.9, spd: 22, r: 0.45, fx: '맞으면 2초 동안 불탐' },
    cold: { n: '얼음 화살', dmg: 11, mp: 10, cd: 0.7, spd: 30, r: 0.32, fx: '맞으면 느려짐' },
    bolt: { n: '번개 창', dmg: 12, mp: 12, cd: 0.8, spd: 42, r: 0.28, fx: '가장 빠름' },
    earth: { n: '바위 던지기', dmg: 19, mp: 16, cd: 1.2, spd: 16, r: 0.6, fx: '가장 셈 · 느림' },
    dark: { n: '암흑 구슬', dmg: 12, mp: 12, cd: 0.9, spd: 19, r: 0.42, fx: '상대를 살짝 따라감' },
    light: { n: '빛의 화살', dmg: 10, mp: 10, cd: 0.7, spd: 34, r: 0.3, fx: '맞히면 내 체력 회복' }
  };
  // 융합 이름 (같은 원소 = 강화)
  const FU = {
    'fire+fire': '겁화', 'cold+cold': '절대 영도', 'bolt+bolt': '천둥 벼락', 'earth+earth': '대지 붕괴', 'dark+dark': '심연', 'light+light': '태양 창',
    'cold+fire': '증기 폭발', 'bolt+fire': '플라즈마', 'earth+fire': '용암 탄', 'dark+fire': '지옥불', 'fire+light': '홍염 광선',
    'bolt+cold': '얼음 번개', 'cold+earth': '빙하 바위', 'cold+dark': '어둠 서리', 'cold+light': '오로라',
    'bolt+earth': '자력 폭풍', 'bolt+dark': '검은 번개', 'bolt+light': '섬광',
    'dark+earth': '저주 바위', 'earth+light': '수정 창', 'dark+light': '혼돈'
  };
  const fuseKey = (a, b) => [a, b].sort().join('+');
  function spell(a, b) {   // a, b = 원소 (b 없으면 기본 마법)
    if (!b) return Object.assign({ els: [a], name: SK[a].n, count: 1, fused: false }, SK[a]);
    const A = SK[a], B = SK[b], same = a === b;
    return { els: same ? [a] : [a, b], name: FU[fuseKey(a, b)], fused: true, count: same ? 1 : 3, dmg: Math.round((A.dmg + B.dmg) * (same ? 1.05 : 0.5)), mp: Math.round((A.mp + B.mp) * 0.85), cd: Math.max(A.cd, B.cd) + 0.6, spd: (A.spd + B.spd) / 2, r: Math.max(A.r, B.r) * (same ? 1.5 : 1.1) };
  }

  /* ================= 스탯 ================= */
  const STATS = [
    ['str', '힘', '#FF8A8E', '주는 피해 +2%'], ['dex', '민첩', '#9AF0B0', '이동 속도 +1%'], ['int', '지혜', '#C8A8FF', '마나 회복 +4%'], ['vit', '체력', '#FFB86B', '최대 체력 +2%'],
    ['rfire', '화염 저항', EL.fire.c, '화염 피해 −1%'], ['rcold', '냉기 저항', EL.cold.c, '냉기 피해 −1%'], ['rbolt', '번개 저항', EL.bolt.c, '번개 피해 −1%'],
    ['rearth', '땅 저항', EL.earth.c, '땅 피해 −1%'], ['rdark', '암흑 저항', EL.dark.c, '암흑 피해 −1%'], ['rlight', '빛 저항', EL.light.c, '빛 피해 −1%']
  ];
  const MAXS = CFG.statMax || 50, PER = CFG.statPerLevel || 2;
  function fighter(lv, stat) {   // 레벨 + 스탯 → 싸움 능력치
    const s = k => (stat && stat[k]) || 0;
    return { lv, hp: Math.round(((CFG.roundHp || 100) + lv * 9) * (1 + s('vit') * 0.02)), mp: 100, regen: 9 * (1 + s('int') * 0.04), spd: 6 * (1 + s('dex') * 0.01), dmgK: (1 + lv * 0.025) * (1 + s('str') * 0.02), res: { fire: s('rfire'), cold: s('rcold'), bolt: s('rbolt'), earth: s('rearth'), dark: s('rdark'), light: s('rlight') } };
  }

  /* ================= 저장 ================= */
  const newSave = () => ({ v: 1, stat: {}, skills: ['fire', 'cold', 'bolt', 'earth'], wins: 0, losses: 0, view: 1, mode: 2, savedAt: 0 });
  function fixSave(s, lv) {
    const n = newSave(); if (!s || typeof s !== 'object') s = n;
    const st = {}; let used = 0; STATS.forEach(([k]) => { st[k] = clamp(Math.floor(+((s.stat || {})[k]) || 0), 0, MAXS); used += st[k]; });
    const total = (lv - 1) * PER; if (used > total) STATS.forEach(([k]) => { st[k] = 0; });
    s.stat = st; s.sp = total - STATS.reduce((a, [k]) => a + st[k], 0);
    s.skills = (Array.isArray(s.skills) ? s.skills : []).filter(e => SK[e]).slice(0, 4); ELS.forEach(e => { if (s.skills.length < 4 && !s.skills.includes(e)) s.skills.push(e); });
    s.wins = Math.max(0, +s.wins || 0); s.losses = Math.max(0, +s.losses || 0); s.view = s.view === 3 ? 3 : 1; s.mode = s.mode === 4 ? 4 : 2;
    return s;
  }
  const online = () => Hub.mode === 'online' && Hub.user && Hub._sb;
  const lkey = (g, uid) => 'gogogogo.' + g + '.' + (uid || 'guest');
  async function loadRow(game) {
    const uid = Hub.user && Hub.user.id; let s = null;
    try { s = JSON.parse(localStorage.getItem(lkey(game, uid)) || 'null'); } catch (e) { s = null; }
    if (online()) { try { const { data } = await Hub._sb.from('game_saves').select('data').eq('user_id', uid).eq('game_id', game).maybeSingle(); if (data && data.data && (!s || (data.data.savedAt || 0) > (s.savedAt || 0))) s = data.data; } catch (e) { /* 표 없음 */ } }
    if (!s && uid && game === 'rpg') { try { s = JSON.parse(localStorage.getItem(lkey(game, null)) || 'null'); } catch (e) { /* noop */ } }
    return s;
  }
  async function saveRow(s) {
    s.savedAt = Date.now(); const copy = JSON.parse(JSON.stringify(s));
    try { localStorage.setItem(lkey(GAME, Hub.user && Hub.user.id), JSON.stringify(copy)); } catch (e) { /* noop */ }
    if (online()) { try { await Hub._sb.from('game_saves').upsert({ user_id: Hub.user.id, game_id: GAME, data: copy, updated_at: new Date().toISOString() }); } catch (e) { /* noop */ } }
  }

  /* ================= three.js 불러오기 ================= */
  let threeP = null;
  const loadThree = () => threeP || (threeP = window.THREE ? Promise.resolve(window.THREE) : new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = DIR + 'vendor/three.min.js?v=149'; sc.onload = () => res(window.THREE); sc.onerror = () => { threeP = null; rej(new Error('three')); }; document.head.appendChild(sc);
  }));

  /* ================= 화면 모양 ================= */
  const CSS = `
  .sf-page .sf-lobby { display: grid; grid-template-columns: 1fr 1.15fr; gap: 14px; }
  .sf-card { background: linear-gradient(180deg, #232B5C, #151B42); color: #EEF1FF; border: 3px solid #0A0E24; border-radius: 16px; padding: 14px; box-shadow: 0 4px 0 rgba(0,0,0,.3); }
  .sf-card h3 { font-family: var(--f-display); font-size: 21px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  .sf-card .sub { color: #AEB7E0; font-size: 13px; margin: 0 0 10px; }
  .sf-me { display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,.06); border: 2px solid #0A0E24; border-radius: 12px; padding: 8px 10px; margin-bottom: 10px; }
  .sf-me canvas { width: 54px; height: 54px; image-rendering: pixelated; border-radius: 10px; background: radial-gradient(circle at 50% 30%, #5C86FF, #2F3FA0); border: 2px solid #0A0E24; flex: none; }
  .sf-me b { font-family: var(--f-display); font-size: 18px; } .sf-me small { display: block; color: #AEB7E0; font-size: 12px; }
  .sf-rooms { display: grid; gap: 8px; }
  .sf-room { display: flex; align-items: center; gap: 10px; background: #1A2148; border: 2px solid #0A0E24; border-radius: 12px; padding: 10px 12px; }
  .sf-room .grow { flex: 1; min-width: 0; } .sf-room b { font-size: 15px; } .sf-room small { display: block; color: #AEB7E0; font-size: 12px; }
  .sf-room.cpu { background: linear-gradient(90deg, #3A2050, #1A2148); }
  .sf-btn { background: #FFD23F; color: #1D2340; border: 2px solid #0A0E24; border-radius: 8px; padding: 7px 14px; font-size: 14px; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .sf-btn.ghost { background: #2A325E; color: #EEF1FF; } .sf-btn[disabled] { opacity: .45; cursor: default; }
  .sf-btn.on { background: #3DDC84; }
  .sf-skills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
  .sf-sk { position: relative; display: grid; gap: 2px; text-align: left; background: #1A2148; color: #EEF1FF; border: 2px solid #0A0E24; border-left: 5px solid var(--c); border-radius: 10px; padding: 7px 9px; cursor: pointer; font-family: inherit; }
  .sf-sk b { font-size: 14px; } .sf-sk small { color: #AEB7E0; font-size: 11px; }
  .sf-sk .no { position: absolute; right: 6px; top: 6px; background: #FFD23F; color: #1D2340; border-radius: 6px; font-size: 13px; padding: 0 7px; font-weight: 700; }
  .sf-sk.sel { box-shadow: 0 0 0 2px var(--c) inset; background: #232D66; }
  .sf-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .sf-st { display: flex; align-items: center; gap: 6px; background: #141A3C; border: 2px solid #0A0E24; border-left: 4px solid var(--c); border-radius: 9px; padding: 4px 6px 4px 8px; }
  .sf-st .grow { flex: 1; min-width: 0; } .sf-st b { color: var(--c); font-size: 13px; } .sf-st span { font-family: var(--f-display); font-size: 16px; margin-left: 4px; } .sf-st small { display: block; color: #8A93C0; font-size: 11px; }
  .sf-st .sf-btn { padding: 2px 9px; font-size: 13px; }
  .sf-sp { display: flex; align-items: center; gap: 8px; margin: 2px 0 8px; font-size: 13px; color: #C9D0F0; } .sf-sp b { font-family: var(--f-display); font-size: 20px; color: #FFD23F; }
  .sf-stage { position: relative; width: min(100%, calc((100svh - 150px) * 1.7778)); margin: 0 auto; aspect-ratio: 16 / 9; background: #05081A; border: 3px solid #0A0E24; border-radius: 14px; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
  .sf-stage canvas { display: block; width: 100%; height: 100%; }
  .sf-hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--f-display); color: #FFFFFF; }
  .sf-bar { position: absolute; height: 16px; background: rgba(10,14,36,.8); border: 2px solid #0A0E24; border-radius: 8px; overflow: hidden; }
  .sf-bar i { display: block; height: 100%; transition: width .15s; } .sf-bar span { position: absolute; inset: 0; font-size: 11px; display: grid; place-items: center; text-shadow: 0 1px 2px #000; }
  .sf-name { position: absolute; font-size: 15px; text-shadow: 0 2px 2px #000; }
  .sf-nums { position: absolute; left: 50%; bottom: 3%; transform: translateX(-50%); display: flex; gap: 8px; pointer-events: auto; }
  .sf-num { position: relative; width: 64px; height: 64px; border-radius: 14px; border: 3px solid #0A0E24; background: radial-gradient(circle at 35% 30%, var(--c2), var(--c) 70%); color: #1D2340; font-family: var(--f-display); font-size: 28px; cursor: pointer; box-shadow: 0 4px 0 rgba(0,0,0,.4); touch-action: manipulation; }
  .sf-num small { position: absolute; left: 0; right: 0; bottom: -18px; font-size: 11px; color: #FFFFFF; text-shadow: 0 1px 2px #000; white-space: nowrap; }
  .sf-num .cd { position: absolute; inset: 0; border-radius: 11px; background: rgba(10,14,36,.65); color: #FFF; display: grid; place-items: center; font-size: 16px; }
  .sf-num.wait { outline: 4px solid #FFFFFF; outline-offset: 2px; transform: translateY(-4px); }
  .sf-view { position: absolute; right: 2%; bottom: 4%; pointer-events: auto; }
  .sf-full { position: absolute; right: 2%; bottom: calc(4% + 44px); pointer-events: auto; display: grid; place-items: center; padding: 6px 8px; }
  .sf-hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px 30px rgba(255,40,60,.75); opacity: 0; transition: opacity .25s; }
  .sf-stage.sf-max { position: fixed; inset: 0; z-index: 200; width: 100vw; height: 100dvh; max-width: none; border: 0; border-radius: 0; aspect-ratio: auto; }
  .sf-diff { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .sf-fu { margin: 0 0 6px; } .sf-fu summary { cursor: pointer; color: #FFD23F; font-size: 13px; padding: 4px 0; }
  .sf-fugrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-top: 6px; }
  .sf-fugrid div { background: linear-gradient(90deg, color-mix(in srgb, var(--c) 30%, #141A3C), color-mix(in srgb, var(--c2) 30%, #141A3C)); border: 2px solid #0A0E24; border-radius: 8px; padding: 4px 8px; font-size: 13px; }
  .sf-fugrid b { color: #FFD23F; margin-right: 4px; } .sf-fugrid small { display: block; color: #C9D0F0; font-size: 11px; }
  .sf-num.ch2 { outline: 4px solid #FFD23F; outline-offset: 2px; transform: translateY(-4px); }
  .sf-act { position: absolute; right: 2%; bottom: calc(4% + 92px); display: none; flex-direction: column; gap: 8px; pointer-events: auto; }
  .sf-act button { width: 74px; height: 56px; border-radius: 14px; border: 3px solid #0A0E24; font-family: var(--f-display); font-size: 18px; color: #1D2340; box-shadow: 0 4px 0 rgba(0,0,0,.4); touch-action: manipulation; }
  .sf-act .fire { background: #FFD23F; } .sf-act .no { background: #E9ECF5; font-size: 15px; height: 40px; }
  .sf-stage.charging .sf-act { display: flex; }
  @media (pointer: fine) { .sf-act { display: none !important; } }
  .sf-teamroom { align-items: flex-start; }
  .sf-teams { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .sf-tcol { display: grid; gap: 4px; align-content: start; background: #141A3C; border: 2px solid #0A0E24; border-top: 4px solid #4C7BFF; border-radius: 10px; padding: 6px 8px; }
  .sf-tcol.t1 { border-top-color: #E0484E; } .sf-tcol > b { font-size: 14px; }
  .sf-tcol span { font-size: 13px; background: #1F2752; border-radius: 6px; padding: 3px 7px; } .sf-tcol span.mine { box-shadow: 0 0 0 2px #FFD23F inset; } .sf-tcol span.empty { color: #8A93C0; background: transparent; border: 1px dashed #3A4373; }
  .sf-tcol .sf-btn { padding: 4px 8px; font-size: 12px; margin-top: 2px; }
  .sf-ulist { position: absolute; width: 30%; display: grid; gap: 5px; }
  .sf-ulist.foe { text-align: right; }
  .sf-urow .nm { font-size: 14px; text-shadow: 0 2px 2px #000; } .sf-urow .nm small { font-size: 11px; }
  .sf-urow .sf-bar { position: relative; height: 14px; } .sf-urow.ally i { background: linear-gradient(#9FC4FF,#3E6AD9); } .sf-urow.foe i { background: linear-gradient(#FFB86B,#C86A2A); }
  .sf-urow.ally .nm { color: #BFD6FF; } .sf-urow.dead { opacity: .5; }
  .sf-tag { position: absolute; transform: translate(-50%, -100%); font-size: 13px; padding: 1px 7px; border-radius: 6px; background: rgba(10,14,36,.62); white-space: nowrap; }
  .sf-tag.ally { color: #9FC4FF; } .sf-tag.foe { color: #FFA58A; }
  .sf-combo { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); font-size: 26px; text-shadow: 0 2px 3px #000; white-space: nowrap; }
  .sf-cross { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 2px solid rgba(255,255,255,.8); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.5); }
  .sf-cross::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; background: #FFF; border-radius: 50%; }
  .sf-msg { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); font-size: 40px; text-shadow: 0 3px 4px #000; white-space: nowrap; }
  .sf-over { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(5,8,26,.72); pointer-events: auto; }
  .sf-over .sf-card { text-align: center; min-width: 280px; }
  .sf-joy { position: absolute; left: 3%; bottom: 6%; width: 120px; height: 120px; border-radius: 50%; border: 3px solid rgba(255,255,255,.35); pointer-events: none; display: none; }
  .sf-joy i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px; border-radius: 50%; background: rgba(255,255,255,.55); }
  @media (pointer: coarse) { .sf-joy { display: block; } .sf-num { width: 56px; height: 56px; } }
  .sf-page .sf-stage:fullscreen { width: 100vw; height: 100vh; max-width: none; border: 0; border-radius: 0; aspect-ratio: auto; }
  @media (max-width: 860px) { .sf-page .sf-lobby { grid-template-columns: 1fr; } .sf-skills { grid-template-columns: repeat(2, 1fr); } }
  @media (max-height: 520px) { .sf-stage { width: min(100%, calc((100svh - 12px) * 1.7778)); } }`;

  /* ================= 본체 ================= */
  window.GoSCFight = {
    render(el, A) {
      BGM.load(GAME);
      if (!document.getElementById('sfCss')) { const st = document.createElement('style'); st.id = 'sfCss'; st.textContent = CSS; document.head.appendChild(st); }
      el.innerHTML = `<div class="sf-page"><div class="play-head"><a class="back" href="#home">← 게임 목록</a><span class="cat">3D 대결</span><h1>${CFG.name}</h1></div><div id="sfBody"><p class="small">캐릭터를 불러오는 중…</p></div></div>`;
      const body = el.querySelector('#sfBody');
      let alive = true, S = null, LV = 1, av = null, lobbyCh = null, roomCh = null, rooms = new Map(), myRoom = null, battle = null;
      let isHost = false, roomSize = 2, roomPeers = [], roomHostId = '', seenHost = false, starting = false, joinAt = 0, myPick = null;
      const TEAM = ['청군', '홍군'];
      const nick = () => (Hub.user ? Hub.user.nickname : '손님');
      const modeName = n => (n === 4 ? '2:2' : '1:1');

      /* ---------- 대기방 (왼쪽) + 스킬 고르기 · 스탯 (오른쪽) ---------- */
      function renderLobby() {
        if (!alive) return;
        const F = fighter(LV, S.stat), sel = S.skills, cm = S.mode === 4 ? 4 : 2;
        const roomList = [...rooms.values()].filter(r => r.open && r.host !== Hub.clientId && r.code !== myRoom);
        const members = roomPeers.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
        const tcount = t => members.filter(p => p.team === t).length;
        const myRoomHtml = myRoom ? (roomSize === 4
          ? `<div class="sf-room sf-teamroom"><div class="grow"><b>${isHost ? '내 방' : '들어간 방'} ${myRoom} · 2:2 (${members.length}/4)</b><small>${isHost ? '편을 고른 뒤 [시작]을 누르세요. 빈자리는 컴퓨터가 채워요' : '편을 고르고 기다려 주세요. 방장이 [시작]을 누르면 시작해요'}</small>
              <div class="sf-teams">${[0, 1].map(t => `<div class="sf-tcol t${t}"><b>${TEAM[t]} (${tcount(t)}/2)</b>${members.filter(p => p.team === t).map(p => `<span class="${p.id === Hub.clientId ? 'mine' : ''}">${p.nick}${p.id === roomHostId ? ' (방장)' : ''}${p.id === Hub.clientId ? ' · 나' : ''}</span>`).join('')}${Array.from({ length: Math.max(0, 2 - tcount(t)) }, () => '<span class="empty">빈자리 (컴퓨터)</span>').join('')}${myPick !== t ? `<button type="button" class="sf-btn ghost" data-team="${t}" ${tcount(t) >= 2 ? 'disabled' : ''}>${TEAM[t]}으로 옮기기</button>` : ''}</div>`).join('')}</div></div>
              <div class="sf-diff" style="flex-direction:column;align-items:stretch">${isHost ? `<button type="button" class="sf-btn" data-fill ${members.length < 2 ? 'disabled' : ''}>시작</button>` : ''}<button type="button" class="sf-btn ghost" data-close>${isHost ? '방 닫기' : '나가기'}</button></div></div>`
          : `<div class="sf-room"><div class="grow"><b>${isHost ? '내 방' : '들어간 방'} ${myRoom} · 1:1 (${members.length}/2)</b>
            <small>${members.map(p => p.nick + (p.id === roomHostId ? ' (방장)' : '')).join(', ') || '연결 중…'}</small>
            <small>${isHost ? '상대가 들어오면 바로 시작해요' : '곧 시작해요…'}</small></div>
            <div class="sf-diff"><button type="button" class="sf-btn ghost" data-close>${isHost ? '방 닫기' : '나가기'}</button></div></div>`)
          : `<div class="sf-room"><div class="grow"><b>온라인 방 만들기</b><small>${Hub.mode === 'online' ? '친구가 아래 방 목록에서 들어와요 · 2:2 는 같은 편끼리 서로 안 맞아요' : '체험 모드: 같은 브라우저의 다른 탭끼리'}</small></div><div class="sf-diff"><button type="button" class="sf-btn" data-make="2">1:1 방</button><button type="button" class="sf-btn" data-make="4">2:2 방</button></div></div>`;
        body.innerHTML = `<div class="sf-lobby">
          <section class="sf-card"><h3>대기방</h3>
            <div class="sf-me"><canvas width="54" height="54" id="sfMe"></canvas><div><b>${nick()}</b><small>skillcom RPG Lv.${LV} · 체력 ${F.hp} · ${S.wins}승 ${S.losses}패</small><small>${Hub.user ? '아바타와 레벨만 가져와요 (장비는 안 가져와요)' : '로그인하면 RPG 캐릭터·전적이 저장돼요'}</small></div></div>
            <div class="sf-rooms">
              <div class="sf-room cpu"><div class="grow"><b>Skillcom 컴퓨터와 대결</b><small>혼자 연습 · ${cm === 4 ? '2:2 는 내 편 컴퓨터 1명 + 상대 컴퓨터 2명' : '1:1'} · 쉬움 Lv.${Math.max(1, LV - 3)} · 보통 Lv.${LV} · 어려움 Lv.${Math.min(100, LV + 3)}</small>
                <div class="sf-diff" style="justify-content:flex-start;margin-top:6px"><button type="button" class="sf-btn${cm === 2 ? ' on' : ' ghost'}" data-cpumode="2">1:1</button><button type="button" class="sf-btn${cm === 4 ? ' on' : ' ghost'}" data-cpumode="4">2:2</button></div></div>
                <div class="sf-diff">${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button type="button" class="sf-btn${k === 'normal' ? '' : ' ghost'}" data-cpu="${k}">${n}</button>`).join('')}</div></div>
              ${myRoomHtml}
              ${roomList.length ? roomList.map(r => { const full = (r.n || 1) >= (r.size || 2); return `<div class="sf-room"><div class="grow"><b>${r.nick}의 방 · ${modeName(r.size || 2)}</b><small>Lv.${r.lv} · ${r.code} · ${r.n || 1}/${r.size || 2}명</small></div><button type="button" class="sf-btn" data-join="${r.code}" ${myRoom || full ? 'disabled' : ''}>${full ? '가득 참' : '들어가기'}</button></div>`; }).join('') : '<p class="sub" style="margin:4px 0 0">지금 열린 방이 없어요.</p>'}
            </div>
          </section>
          <section class="sf-card"><h3>스킬 고르기</h3><p class="sub">원소 6개 중 4개를 눌러 1~4 칸에 넣어요. 대결에서 숫자를 누르면 차지, 차지 중에 숫자를 하나 더 누르면 융합 차지(같은 숫자도 돼요). 마우스 왼쪽 = 발사, 오른쪽 = 취소</p>
            <div class="sf-skills">${ELS.map(e => { const i = sel.indexOf(e); return `<button type="button" class="sf-sk${i >= 0 ? ' sel' : ''}" style="--c:${EL[e].c}" data-sk="${e}">${i >= 0 ? `<span class="no">${i + 1}</span>` : ''}<b>${SK[e].n}</b><small>${EL[e].n} · 피해 ${SK[e].dmg} · 마나 ${SK[e].mp}</small><small>${SK[e].fx}</small></button>`; }).join('')}</div>
            <details class="sf-fu"${S.fuOpen ? ' open' : ''}><summary>내 융합 마법 ${sel.length * (sel.length + 1) / 2}가지 보기</summary><div class="sf-fugrid">${sel.flatMap((a, i) => sel.slice(i).map((b, j) => { const sp = spell(a, b); return `<div style="--c:${EL[a].c};--c2:${EL[b].c}"><b>${i + 1}+${i + j + 1}</b> ${sp.name}<small>${a === b ? '강화 한 발' : '세 발'} · 피해 ${sp.dmg} · 마나 ${sp.mp}</small></div>`; })).join('')}</div></details>
            <h3 style="margin-top:12px">스탯</h3>
            <div class="sf-sp">남은 포인트 <b>${S.sp}</b><span>레벨당 ${PER}개 · 스탯마다 최대 ${MAXS}</span><button type="button" class="sf-btn ghost" data-reset style="margin-left:auto" ${S.sp === (LV - 1) * PER ? 'disabled' : ''}>다시 나누기</button></div>
            <div class="sf-stats">${STATS.map(([k, n, c, d]) => `<div class="sf-st" style="--c:${c}"><div class="grow"><b>${n}</b><span>${S.stat[k]}</span><small>${d}</small></div><button type="button" class="sf-btn" data-st="${k}:1" ${S.sp < 1 || S.stat[k] >= MAXS ? 'disabled' : ''}>+1</button><button type="button" class="sf-btn ghost" data-st="${k}:5" ${S.sp < 1 || S.stat[k] >= MAXS ? 'disabled' : ''}>+5</button></div>`).join('')}</div>
          </section></div>
          <div class="panel" style="margin-top:14px"><h3>랭킹 (승리 수)</h3><ol class="rank" id="sfRank"><li class="empty">불러오는 중…</li></ol></div>`;
        const cv = body.querySelector('#sfMe'); if (cv) { const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; AV.draw(x, av, 0, 0, 3, { crop: 'bust' }); }
        loadRank();
      }
      async function loadRank() {
        const rk = body.querySelector('#sfRank'); if (!rk) return;
        try { const rows = await Hub.leaderboard(GAME, 10); if (!rk.isConnected) return; rk.innerHTML = A.rankItems(rows, 'best_score', GAME); AV.paintAll(rk); } catch (e) { rk.innerHTML = '<li class="empty">랭킹을 불러오지 못했어요.</li>'; }
      }
      body.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.sf-fu')) S.fuOpen = e.target.open; }, true);
      const need4 = () => { if (S.skills.length < 4) { A.toast('스킬 4개를 골라 주세요'); return false; } return true; };
      body.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled || battle) return; const d = b.dataset;
        if (d.sk) { const i = S.skills.indexOf(d.sk); if (i >= 0) { if (S.skills.length > 1) S.skills.splice(i, 1); } else { if (S.skills.length >= 4) S.skills.shift(); S.skills.push(d.sk); } saveRow(S); renderLobby(); }
        else if (d.st) { const [k, n0] = d.st.split(':'), n = Math.min(+n0, S.sp, MAXS - S.stat[k]); if (n > 0) { S.stat[k] += n; S.sp -= n; saveRow(S); } renderLobby(); }
        else if ('reset' in d) { STATS.forEach(([k]) => { S.stat[k] = 0; }); S.sp = (LV - 1) * PER; saveRow(S); renderLobby(); }
        else if (d.cpumode) { S.mode = +d.cpumode === 4 ? 4 : 2; saveRow(S); renderLobby(); }
        else if ('cpu' in d) { if (need4()) startCpu(d.cpu || 'normal'); }
        else if (d.make) makeRoom(+d.make === 4 ? 4 : 2);
        else if ('fill' in d) hostStart();
        else if (d.team) pickTeam(+d.team);
        else if ('close' in d) closeRoom();
        else if (d.join) joinRoom(d.join);
      });

      /* ---------- 컴퓨터와 대결 (1:1 · 2:2) ---------- */
      const DIFFS = { easy: { lv: -3, cast: 1.5, lead: 0.2, aim: 0.09, n: '쉬움' }, normal: { lv: 0, cast: 1, lead: 0.6, aim: 0.03, n: '보통' }, hard: { lv: 3, cast: 0.72, lead: 0.95, aim: 0.012, n: '어려움' } };
      function cpuEntry(i, team, lv, diff, nm, ally) { return { id: 'cpu' + i, cpu: true, team, nick: nm, lv, av: makeEnemyAvatar(ally ? 'ally' : i), stat: cpuStat(lv), skills: pickN(ELS, 4), diff }; }
      function startCpu(diff) {
        const D = DIFFS[diff] || DIFFS.normal, lv = clamp(LV + D.lv, 1, 100), four = S.mode === 4;
        const ros = [{ id: Hub.clientId, team: 0 }];
        if (four) ros.push(cpuEntry(0, 0, LV, 'normal', '조선 장수', true));
        ros.push(cpuEntry(1, 1, lv, diff, 'Skillcom 장수' + (four ? ' 1' : '') + ' (' + D.n + ')'));
        if (four) ros.push(cpuEntry(2, 1, lv, diff, 'Skillcom 장수 2 (' + D.n + ')'));
        startBattle({ cpu: true, diff, size: four ? 4 : 2, roster: ros });
      }

      /* ---------- 온라인 방 (1:1 = 2명 · 2:2 = 4명, 모자라면 방장이 컴퓨터로 채움) ---------- */
      function lobby() {
        if (lobbyCh) return;
        lobbyCh = Hub.channel('scf-lobby', { onPeers: list => { rooms = new Map(); (list || []).forEach(s => { if (s && s.code) rooms.set(s.code, s); }); if (!battle) renderLobby(); }, onMsg() {} });
        lobbyCh.track({ id: Hub.clientId });
      }
      const myInfo = () => ({ id: Hub.clientId, nick: nick(), lv: LV, av, stat: S.stat, skills: S.skills, at: joinAt, team: myPick });
      function pickTeam(t) { if (!roomCh || battle) return; if (roomPeers.filter(p => p.team === t && p.id !== Hub.clientId).length >= 2) { A.toast(TEAM[t] + '이 가득 찼어요'); return; } myPick = t; roomCh.track(myInfo()); renderLobby(); }
      const roomInfo = () => ({ id: Hub.clientId, code: myRoom, host: Hub.clientId, nick: nick(), lv: LV, open: true, size: roomSize, n: Math.max(1, roomPeers.length) });
      function makeRoom(size) {
        if (!need4()) return;
        myRoom = Math.random().toString(36).slice(2, 7).toUpperCase(); isHost = true; roomSize = size; roomHostId = Hub.clientId; roomPeers = []; myPick = 0;
        lobbyCh.track(roomInfo()); openRoom(myRoom); renderLobby();
      }
      function closeRoom() { if (roomCh) { roomCh.leave(); roomCh = null; } myRoom = null; isHost = false; roomPeers = []; seenHost = false; starting = false; myPick = null; lobbyCh && lobbyCh.track({ id: Hub.clientId }); renderLobby(); }
      function joinRoom(code) {
        if (!need4()) return; const r = rooms.get(code); if (!r) return;
        myRoom = code; isHost = false; roomSize = r.size === 4 ? 4 : 2; roomHostId = r.host; seenHost = false; roomPeers = []; myPick = null; openRoom(code); renderLobby();
      }
      function openRoom(code) {
        joinAt = Date.now();
        roomCh = Hub.channel('scf-room-' + code, {
          onPeers: list => {
            roomPeers = (list || []).filter(p => p && p.id);
            if (battle) { battle.onPeers && battle.onPeers(roomPeers); return; }
            if (starting) return;
            if (myPick === null && roomPeers.some(p => p.id !== Hub.clientId)) {   // 처음 들어오면 사람이 적은 편으로
              const c = t => roomPeers.filter(p => p.id !== Hub.clientId && p.team === t).length; myPick = c(1) < c(0) ? 1 : 0; roomCh.track(myInfo());
            } else if (roomSize === 4 && myPick !== null) {   // 동시에 들어와 한 편이 3명이 되면 늦게 온 사람이 다른 편으로
              const same = roomPeers.filter(p => p.team === myPick).sort((x, y) => (x.at || 0) - (y.at || 0));
              if (same.length > 2 && same.slice(2).some(p => p.id === Hub.clientId) && roomPeers.filter(p => p.team === 1 - myPick).length < 2) { myPick = 1 - myPick; roomCh.track(myInfo()); }
            }
            if (isHost) { lobbyCh.track(roomInfo()); if (roomSize === 2 && roomPeers.length >= 2) { hostStart(); return; } }
            else { const hostHere = roomPeers.some(p => p.id === roomHostId); if (hostHere) seenHost = true; else if (seenHost) { A.toast('방장이 방을 닫았어요'); closeRoom(); return; } }
            renderLobby();
          },
          onMsg: m => {
            if (!m) return;
            if (m.t === 'start') { if (!isHost && !battle && !starting) guestStart(m); return; }
            if (battle && battle.net) battle.onMsg(m);
          }
        });
        roomCh.track(myInfo());
      }
      function hostStart() {
        if (starting || battle || !roomCh) return; starting = true;
        const hum = roomPeers.slice().sort((a, b) => (a.id === Hub.clientId ? -1 : b.id === Hub.clientId ? 1 : (a.at || 0) - (b.at || 0))).slice(0, roomSize);
        const cnt = [0, 0], half = roomSize / 2;
        const ros = hum.map((p, i) => {   // 2:2 = 각자 고른 편 (넘치면 다른 편으로) · 1:1 = 방장 청군, 상대 홍군
          let t = roomSize === 2 ? i % 2 : (p.team === 0 || p.team === 1 ? p.team : (cnt[0] <= cnt[1] ? 0 : 1)); if (cnt[t] >= half) t = 1 - t; cnt[t]++;
          return { id: p.id, nick: String(p.nick || '').slice(0, 12), lv: +p.lv || 1, av: p.av, stat: p.stat || {}, skills: p.skills, team: t };
        });
        const lv = Math.round(ros.reduce((a, r) => a + r.lv, 0) / ros.length); let k = 0;
        [0, 1].forEach(t => { while (cnt[t] < half) { cnt[t]++; ros.push(Object.assign(cpuEntry(++k, t, lv, 'normal', '컴퓨터 장수 ' + k), { owner: Hub.clientId })); } });
        const msg = { t: 'start', from: Hub.clientId, size: roomSize, roster: ros };
        roomCh.send(msg); setTimeout(() => { if (roomCh) roomCh.send(msg); }, 900);   // 혹시 못 받은 사람을 위해 한 번 더
        lobbyCh.track({ id: Hub.clientId });
        startBattle({ net: true, host: true, size: roomSize, roster: ros });
      }
      function guestStart(m) {
        if (!(m.roster || []).some(r => r.id === Hub.clientId && !r.cpu)) { A.toast('방이 가득 차서 못 들어갔어요'); closeRoom(); return; }
        starting = true;
        startBattle({ net: true, host: false, size: m.size, roster: m.roster });
      }

      /* ================= 3D 대결 ================= */
      async function startBattle(opt) {
        let THREE;
        try { THREE = await loadThree(); } catch (e) { starting = false; A.toast('3D 엔진을 불러오지 못했어요. 새로고침해 주세요'); return; }
        if (!alive) return;
        battle = makeBattle(THREE, opt); starting = false;
      }

      function makeBattle(THREE, opt) {
        body.innerHTML = `<div class="sf-stage" id="sfStage" tabindex="0"><canvas id="sfCv"></canvas><div class="sf-hud">
          <div class="sf-name" style="left:2%;top:3%">${nick()} <small>Lv.${LV}</small></div><div class="sf-bar" style="left:2%;top:9%;width:30%"><i id="sfHp" style="background:linear-gradient(#FF7A7E,#D2343A);width:100%"></i><span id="sfHpT"></span></div>
          <div class="sf-bar" style="left:2%;top:14%;width:24%;height:12px"><i id="sfMp" style="background:linear-gradient(#7FA0FF,#2F55D9);width:100%"></i><span id="sfMpT"></span></div>
          <div class="sf-ulist" id="sfAllies" style="left:2%;top:19%"></div><div class="sf-ulist foe" id="sfFoes" style="right:2%;top:3%"></div><div id="sfTags"></div>
          <div class="sf-hurt" id="sfHurt"></div><div class="sf-cross" id="sfCross"></div><div class="sf-combo" id="sfCombo"></div><div class="sf-msg" id="sfMsg"></div>
          <button type="button" class="sf-btn ghost sf-view" id="sfView">시점: ${(S.view || 1)}인칭 (V)</button>
          <button type="button" class="sf-btn ghost sf-full" id="sfFull" aria-label="화면 크게 보기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
          <div class="sf-joy" id="sfJoy"><i></i></div>
          <div class="sf-act" id="sfAct"><button type="button" class="fire" id="sfFire">발사</button><button type="button" class="no" id="sfNo">취소</button></div><div class="sf-nums">${S.skills.map((e, i) => `<button type="button" class="sf-num" data-num="${i + 1}" style="--c:${EL[e].c};--c2:${EL[e].c2}">${i + 1}<small>${SK[e].n}</small></button>`).join('')}</div>
        </div></div><p class="small" style="text-align:center;margin-top:8px">${modeName(opt.size)} 대결 · 화면을 누르면 마우스로 둘러봐요 (Esc 로 풀기) · WASD 이동 · 숫자 1~4 차지 · 차지 중 숫자 하나 더 = 융합 · 마우스 왼쪽 발사 · 오른쪽 취소 · V 시점 전환${opt.size === 4 ? ' · 같은 편(파란 이름)은 안 맞아요' : ''}</p>`;
        const stage = body.querySelector('#sfStage'), cv = body.querySelector('#sfCv'), $h = id => body.querySelector('#' + id);
        const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true;
        const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 300);
        const size = () => { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); };
        size(); const onRs = () => size(); window.addEventListener('resize', onRs);
        if (matchMedia('(pointer: coarse)').matches) { try { stage.scrollIntoView({ block: 'center' }); } catch (e) { /* noop */ } }
        buildArena(THREE, scene);

        /* --- 몸 (아바타 도트 → 3D 블록) --- */
        function voxel(avatar, tint) {
          const g = AV.grid(AV.normalize(avatar), 0), GH = g.length, GW = g[0].length, s = 1.8 / GH, grp = new THREE.Group();
          // 앞면 = 아바타 그림 그대로, 뒷면 = 머리 부분을 머리카락 색으로 (뒤에서 보면 뒤통수)
          const geo = new THREE.BoxGeometry(s, s, s * 1.15), mat = new THREE.MeshLambertMaterial();
          const OUT = (AV.OUT || '#1D2340').toLowerCase(), cnt = {}; for (let y = 0; y < Math.min(5, GH); y++) g[y].forEach(c => { if (c && c.toLowerCase() !== OUT) cnt[c] = (cnt[c] || 0) + 1; });
          const hair = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '#3A2A20', headRows = Math.round(GH * 0.38);
          let n = 0; g.forEach(r => r.forEach(c => { if (c) n += 2; }));
          const mesh = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), col = new THREE.Color(); let i = 0;
          g.forEach((row, y) => row.forEach((c, x) => {
            if (!c) return;
            [[1, c], [-1, y < headRows && c.toLowerCase() !== OUT ? hair : c]].forEach(([side, cc]) => {
              m4.makeTranslation((x - GW / 2 + 0.5) * s, (GH - y - 0.5) * s, side * s * 0.58); mesh.setMatrixAt(i, m4); col.set(cc); if (tint) col.lerp(new THREE.Color(tint), 0.12); mesh.setColorAt(i, col); i++;
            });
          }));
          mesh.castShadow = true; grp.add(mesh);
          const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; grp.add(sh);
          grp.userData.body = mesh; return grp;
        }

        /* --- 참가자 (나 · 같은 편 · 상대). own = 이 기기가 움직이고 체력을 정하는 몸 (나 + 컴퓨터 대결의 컴퓨터 + 온라인 방장이 맡은 컴퓨터) --- */
        const ros = opt.roster, myR = ros.find(r => r.id === Hub.clientId && !r.cpu), myTeam = myR.team;
        const teamIdx = {}, units = ros.map(r => {
          const isMe = r === myR, F = isMe ? fighter(LV, S.stat) : fighter(r.lv, r.stat), k = teamIdx[r.team] = (teamIdx[r.team] || 0) + 1, inTeam = ros.filter(q => q.team === r.team).length;
          const x = inTeam > 1 ? (k === 1 ? -3 : 3) * (r.team ? -1 : 1) : 0, z = r.team ? -8 : 8;
          const U = { id: r.id, me: isMe, cpu: !!r.cpu, owner: r.owner || '', team: r.team, nick: isMe ? nick() : String(r.nick || ''), lv: isMe ? LV : r.lv, skills: r.skills || ['fire', 'cold', 'bolt', 'earth'],
            x, z, y: 0, vy: 0, tx: x, tz: z, px: x, pz: z, vx: 0, vz: 0, yaw: r.team ? Math.PI : 0, pitch: 0, hp: F.hp, mp: F.mp, F, cds: {}, slow: 0, burn: 0, dead: false,
            own: isMe || (!!r.cpu && (opt.cpu || opt.host)), ai: r.cpu ? { t: 1.5, move: 0, strafe: 1, D: DIFFS[r.diff] || DIFFS.normal } : null };
          U.mesh = voxel(isMe ? av : r.av, r.cpu && r.team !== myTeam ? '#3A2050' : null); scene.add(U.mesh);
          return U;
        });
        const me = units.find(u => u.me), byId = {}; units.forEach(u => { byId[u.id] = u; });
        const ally = u => u.team === me.team, foes = () => units.filter(u => !ally(u)), anyLeft = { v: false };
        // 이름표 (머리 위) + 체력 줄 (왼쪽 = 같은 편, 오른쪽 = 상대)
        units.forEach(u => {
          if (u.me) return;
          const row = document.createElement('div'); row.className = 'sf-urow ' + (ally(u) ? 'ally' : 'foe');
          row.innerHTML = `<div class="nm">${u.nick} <small>Lv.${u.lv}</small></div><div class="sf-bar"><i></i><span></span></div>`;
          $h(ally(u) ? 'sfAllies' : 'sfFoes').appendChild(row); u.bar = row.querySelector('i'); u.barT = row.querySelector('span'); u.row = row;
          const tag = document.createElement('div'); tag.className = 'sf-tag ' + (ally(u) ? 'ally' : 'foe'); tag.textContent = (ally(u) ? '내 편 ' : '') + u.nick; $h('sfTags').appendChild(tag); u.tag = tag;
        });
        const B = { net: !!opt.net, over: false, shots: [], parts: [], view: S.view || 1, keys: {}, ch: null, t: 0, sendT: 0, joy: null, look: null, lock: false };

        /* --- 마법 쓰기 --- */
        function fwd(yaw, pitch) { return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
        function cast(U, a, b, dirOverride, remote) {
          if (U.dead) return false;
          const sp = spell(a, b), key = b ? fuseKey(a, b) : a;
          if (!remote) {
            if ((U.cds[key] || 0) > 0) return false;
            if (U.me && me.mp < sp.mp) { flash('마나가 부족해요'); return false; }
            if (U.me) me.mp -= sp.mp;
            U.cds[key] = sp.cd;
          }
          const dir = dirOverride || fwd(U.yaw, U.pitch);
          const o = new THREE.Vector3(U.x, U.y + 1.3, U.z).add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(0.6));
          for (let i = 0; i < sp.count; i++) {
            const d = dir.clone(); if (sp.count > 1) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - 1) * 0.12);
            const el = sp.els[i % sp.els.length], m = new THREE.Mesh(new THREE.SphereGeometry(sp.r, 14, 10), new THREE.MeshBasicMaterial({ color: EL[el].c }));
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, EL[el].c2), color: EL[el].c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(sp.r * 5); m.add(glow);
            m.position.copy(o); scene.add(m);
            B.shots.push({ m, v: d.multiplyScalar(sp.spd), from: U, team: U.team, els: sp.els, dmg: sp.dmg * U.F.dmgK / sp.count * (sp.count > 1 ? 1.15 : 1), r: sp.r, life: 3, home: sp.els.includes('dark'), fused: sp.fused });
          }
          if (!remote && B.net && U.own) send({ t: 'c', id: U.id, a, b: b || null, d: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) });
          if (U.me) showCombo(sp);
          burst(o, sp.els[0], 10);
          return true;
        }
        function hit(T, s) {   // T 는 이 기기가 맡은 몸일 때만 불림
          const F = T.F; let dmg = 0; s.els.forEach(e => { dmg += s.dmg / s.els.length * (1 - Math.min(50, F.res[e] || 0) / 100); });
          dmg = Math.max(1, Math.round(dmg * rand(0.92, 1.08)));
          T.hp = Math.max(0, T.hp - dmg);
          if (s.els.includes('cold')) T.slow = 1.6; if (s.els.includes('fire')) T.burn = 2;
          if (s.els.includes('light')) { const h = Math.round(dmg * 0.3), A2 = s.from; if (A2.own) A2.hp = Math.min(A2.F.hp, A2.hp + h); else if (B.net) send({ t: 'heal', id: A2.id, n: h }); }
          floatText(T, '-' + dmg, s.fused ? '#FFD23F' : '#FFFFFF');
        }

        /* --- 숫자 입력: 숫자 = 차지(발사 대기), 차지 중 숫자 하나 더 = 융합 차지 · 마우스 왼쪽 = 발사, 오른쪽 = 취소 --- */
        function press(n) {
          if (B.over || !B.started || me.dead) return;
          const e = S.skills[n - 1]; if (!e) return;
          if (B.ch && !B.ch.b) B.ch = { a: B.ch.a, na: B.ch.na, b: e, nb: n };   // 차지 중 하나 더 → 융합 차지
          else B.ch = { a: e, na: n, b: null, nb: 0 };                           // 새 차지 (융합 차지 중이면 새로 시작)
          markCharge();
        }
        function fire() {
          if (!B.ch || B.over || !B.started || me.dead) return false;
          const c = B.ch, key = c.b ? fuseKey(c.a, c.b) : c.a, cd = me.cds[key] || 0;
          if (cd > 0) { flash('아직 못 써요 ' + cd.toFixed(1) + '초', 0.8); return false; }
          if (cast(me, c.a, c.b)) { B.ch = null; markCharge(true); return true; }
          return false;
        }
        function cancelCharge() { if (!B.ch) return; B.ch = null; markCharge(); flash('차지 취소', 0.6); }
        function markCharge(keepText) {
          const c = B.ch;
          body.querySelectorAll('.sf-num').forEach(b => { const n = +b.dataset.num; b.classList.toggle('wait', !!c && n === c.na && !c.b); b.classList.toggle('ch2', !!c && !!c.b && (n === c.na || n === c.nb)); });
          stage.classList.toggle('charging', !!c);
          const el = $h('sfCombo');
          if (c) { const sp = spell(c.a, c.b); el.textContent = (c.b ? `${c.na}+${c.nb} ${sp.name}` : `${c.na} ${sp.name}`) + ' 차지 중'; el.style.color = EL[c.a].c; clearTimeout(B.comboT); }
          else if (!keepText) el.textContent = '';
        }
        function showCombo(sp) { const c = $h('sfCombo'); c.textContent = sp.name + (sp.fused ? ' !' : ''); c.style.color = EL[sp.els[0]].c; clearTimeout(B.comboT); B.comboT = setTimeout(() => { if (c.isConnected && !B.ch) c.textContent = ''; }, 900); }
        function flash(t, sec) { const m = $h('sfMsg'); m.textContent = t; m.style.fontSize = t.length > 10 ? '24px' : '40px'; clearTimeout(B.msgT); B.msgT = setTimeout(() => { if (m.isConnected) m.textContent = ''; }, (sec || 1.2) * 1000); }

        /* --- 입력 --- */
        const onKey = e => {
          if (!body.isConnected) return; const down = e.type === 'keydown', c = e.code;
          if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) { e.preventDefault(); B.keys[c] = down; if (c === 'Space' && down && me.y <= 0.001 && !me.dead) me.vy = 6; return; }
          if (!down || e.repeat) return;
          if (/^Digit[1-4]$/.test(c)) { e.preventDefault(); press(+c.slice(5)); }
          else if (c === 'KeyV') { e.preventDefault(); toggleView(); }
        };
        document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
        function toggleView() { B.view = B.view === 1 ? 3 : 1; S.view = B.view; $h('sfView').textContent = `시점: ${B.view}인칭 (V)`; saveRow(S); }
        $h('sfView').addEventListener('click', e => { e.stopPropagation(); toggleView(); });
        // 크게 보기: 브라우저 전체 화면(+가로 고정), 안 되면 페이지 위에 가득
        const fsNow = () => document.fullscreenElement || document.webkitFullscreenElement;
        $h('sfFull').addEventListener('click', e => {
          e.stopPropagation();
          if (fsNow() || stage.classList.contains('sf-max')) { if (fsNow()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); stage.classList.remove('sf-max'); setTimeout(size, 200); return; }
          const req = stage.requestFullscreen || stage.webkitRequestFullscreen, fb = () => { stage.classList.add('sf-max'); setTimeout(size, 100); };
          if (!req) { fb(); return; }
          try { const pr = req.call(stage, { navigationUI: 'hide' }); if (pr && pr.then) pr.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (er) { /* noop */ } setTimeout(size, 200); }, fb); } catch (er) { fb(); }
        });
        const onFs = () => setTimeout(size, 150); document.addEventListener('fullscreenchange', onFs);
        body.querySelectorAll('.sf-num').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(+b.dataset.num); }));
        // 마우스: 화면을 누르면 마우스 고정(포인터 잠금) → 움직이면 둘러보기 / 휴대폰: 왼쪽 끌기 = 이동, 오른쪽 끌기 = 둘러보기
        const onLockCh = () => { B.lock = document.pointerLockElement === stage; };
        document.addEventListener('pointerlockchange', onLockCh);
        const onMove = e => { if (B.lock) { me.yaw -= e.movementX * 0.0026; me.pitch = clamp(me.pitch - e.movementY * 0.0026, -1.2, 1.2); } };
        document.addEventListener('mousemove', onMove);
        stage.addEventListener('contextmenu', e => e.preventDefault());
        $h('sfFire').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fire(); });
        $h('sfNo').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cancelCharge(); });
        const pts = {};
        stage.addEventListener('pointerdown', e => {
          if (e.target.closest('button')) return;
          if (e.pointerType === 'mouse') {
            if (e.button === 2) { e.preventDefault(); cancelCharge(); return; }
            if (e.button === 0) { if (!B.lock && stage.requestPointerLock && !B.over) stage.requestPointerLock(); fire(); }
            return;
          }
          e.preventDefault(); stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
          const r = stage.getBoundingClientRect(), x = e.clientX - r.left;
          if (x < r.width * 0.4) { pts[e.pointerId] = 'joy'; B.joy = { cx: e.clientX, cy: e.clientY, vx: 0, vy: 0 }; } else { pts[e.pointerId] = 'look'; B.look = { x: e.clientX, y: e.clientY }; }
        });
        stage.addEventListener('pointermove', e => {
          const k = pts[e.pointerId]; if (!k) return;
          if (k === 'joy' && B.joy) { const dx = e.clientX - B.joy.cx, dy = e.clientY - B.joy.cy, l = Math.hypot(dx, dy), q = Math.min(1, l / 50); B.joy.vx = l ? dx / l * q : 0; B.joy.vy = l ? dy / l * q : 0; const j = $h('sfJoy').firstChild; j.style.transform = `translate(${B.joy.vx * 36}px,${B.joy.vy * 36}px)`; }
          if (k === 'look' && B.look) { me.yaw -= (e.clientX - B.look.x) * 0.006; me.pitch = clamp(me.pitch - (e.clientY - B.look.y) * 0.006, -1.2, 1.2); B.look = { x: e.clientX, y: e.clientY }; }
        });
        const up = e => { const k = pts[e.pointerId]; if (k === 'joy') { B.joy = null; $h('sfJoy').firstChild.style.transform = ''; } if (k === 'look') B.look = null; delete pts[e.pointerId]; };
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* --- 컴퓨터 (Skillcom 장수): 가장 가까운 상대를 노림 --- */
        function aiTick(U, dt) {
          const ai = U.ai, D = ai.D; let T = null, d = 1e9;
          units.forEach(o => { if (o.team !== U.team && !o.dead) { const dd = Math.hypot(o.x - U.x, o.z - U.z); if (dd < d) { d = dd; T = o; } } });
          if (!T) return;
          const dx = T.x - U.x, dz = T.z - U.z; d = d || 1;
          U.yaw = Math.atan2(-dx, -dz);
          ai.t -= dt; if (ai.t <= 0) { ai.t = rand(0.8, 1.8); ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.move = d > 13 ? 1 : d < 7 ? -1 : 0; }
          const sp = U.F.spd * (U.slow > 0 ? 0.55 : 1) * 0.8 * dt, fx = dx / d, fz = dz / d;
          moveBody(U, (fx * ai.move + -fz * ai.strafe * 0.8) * sp, (fz * ai.move + fx * ai.strafe * 0.8) * sp);
          ai.cast = (ai.cast || rand(1, 2)) - dt;
          if (ai.cast <= 0) {
            ai.cast = rand(1.1, 2.4) * (LV < 10 ? 1.3 : 1) * D.cast;
            const a = pick(U.skills), b = Math.random() < 0.3 ? pick(U.skills) : null, sp2 = spell(a, b);
            const t = d / sp2.spd, aim = new THREE.Vector3(T.x + T.vx * t * D.lead - U.x, 0, T.z + T.vz * t * D.lead - U.z).normalize(); aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-1, 1) * D.aim * 3); aim.y = 0.02 + rand(-D.aim, D.aim);
            cast(U, a, b, aim.normalize());
          }
        }
        function moveBody(U, mx, mz) { const nx = clamp(U.x + mx, -ARENA + 0.6, ARENA - 0.6), nz = clamp(U.z + mz, -ARENA + 0.6, ARENA - 0.6); if (!blocked(nx, U.z)) U.x = nx; if (!blocked(U.x, nz)) U.z = nz; }

        /* --- 온라인: 각자 맡은 몸의 자리·체력을 보냄 (컴퓨터는 방장이 맡음). 맞았는지는 맞은 몸을 맡은 기기가 판단 --- */
        function send(m) { if (roomCh) roomCh.send(Object.assign({ from: Hub.clientId }, m)); }
        function sendPos() { send({ t: 'p', u: units.filter(u => u.own).map(u => [u.id, +u.x.toFixed(2), +u.z.toFixed(2), +u.y.toFixed(2), +u.yaw.toFixed(3), Math.round(u.hp)]) }); }
        B.onMsg = m => {
          if (!m || m.from === Hub.clientId) return;
          if (m.t === 'p') (m.u || []).forEach(([id, x, z, y, yaw, hp]) => { const u = byId[id]; if (!u || u.own) return; u.tx = x; u.tz = z; u.y = y || 0; u.yaw = yaw; u.lastMsg = performance.now(); if (!u.dead) u.hp = hp; });
          else if (m.t === 'c') { const u = byId[m.id]; if (u && !u.own) cast(u, m.a, m.b, new THREE.Vector3(m.d[0], m.d[1], m.d[2]), true); }
          else if (m.t === 'heal') { const u = byId[m.id]; if (u && u.own && !u.dead) u.hp = Math.min(u.F.hp, u.hp + (+m.n || 0)); }
        };
        // 나간 사람(과 그 사람이 맡은 컴퓨터)은 쓰러진 것으로: 방 목록에서 빠지고 + 5초 넘게 소식이 없을 때 (잠깐 끊긴 것은 봐 줌)
        let here = null;
        B.onPeers = list => { here = new Set(list.map(p => p.id)); };
        function checkLeft() {
          if (!B.net || !here || B.over) return; const now = performance.now();
          units.forEach(u => { if (u.own || u.dead) return; const who = u.cpu ? u.owner : u.id; if (who && !here.has(who) && now - (u.lastMsg || B.t0) > 5000) { u.hp = 0; anyLeft.v = true; if (!u.cpu) flash(u.nick + ' 님이 나갔어요', 2); } });
        }

        /* --- 한 틱 --- */
        let last = performance.now(), raf = 0;
        B.started = false; let countdown = 3; flash('3');
        if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement) setTimeout(() => flash('오른쪽 아래 [ ] 를 누르면 크게 보여요', 2.4), 3300);
        const sendEvery = units.length > 2 ? 0.12 : 0.08; B.t0 = performance.now();
        function tick(now) {
          if (!alive || !body.isConnected) return;
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (now - last) / 1000); last = now; B.t += dt;
          if (!B.started) { const c0 = Math.ceil(countdown); countdown -= dt; const c1 = Math.ceil(countdown); if (c1 !== c0) flash(c1 > 0 ? String(c1) : '시작!'); if (countdown <= 0) B.started = true; }
          units.forEach(U => { U.px = U.x; U.pz = U.z; Object.keys(U.cds).forEach(k => { U.cds[k] -= dt; }); if (U.slow > 0) U.slow -= dt; if (U.burn > 0) { U.burn -= dt; if (U.own && !U.dead) U.hp = Math.max(0, U.hp - 3 * dt); } });
          if (B.started && !B.over) {
            // 내 움직임 (보는 방향 기준)
            if (!me.dead) {
              let mx = 0, mz = 0; const K = B.keys;
              if (K.KeyW || K.ArrowUp) mz -= 1; if (K.KeyS || K.ArrowDown) mz += 1; if (K.KeyA || K.ArrowLeft) mx -= 1; if (K.KeyD || K.ArrowRight) mx += 1;
              if (B.joy) { mx = B.joy.vx; mz = B.joy.vy; }
              const l = Math.hypot(mx, mz), sp = me.F.spd * (me.slow > 0 ? 0.55 : 1);
              if (l > 0.1) { const s2 = Math.sin(me.yaw), c2 = Math.cos(me.yaw), wx = (mx * c2 + mz * s2) / Math.max(1, l), wz = (-mx * s2 + mz * c2) / Math.max(1, l); moveBody(me, wx * sp * dt, wz * sp * dt); }
              me.mp = Math.min(me.F.mp, me.mp + me.F.regen * dt);
            }
            me.vy -= 18 * dt; me.y = Math.max(0, me.y + me.vy * dt); if (me.y === 0) me.vy = 0;
            units.forEach(U => {
              if (U.me || U.dead) return;
              if (U.own && U.ai) aiTick(U, dt);
              else if (!U.own) { U.x += (U.tx - U.x) * Math.min(1, dt * 12); U.z += (U.tz - U.z) * Math.min(1, dt * 12); }
            });
            if (B.net && (B.sendT += dt) >= sendEvery) { B.sendT = 0; sendPos(); checkLeft(); }
          }
          units.forEach(U => { U.vx = (U.x - U.px) / Math.max(dt, 0.001); U.vz = (U.z - U.pz) / Math.max(dt, 0.001); });
          // 탄: 다른 편 몸에만 맞음 (같은 편은 지나감)
          B.shots = B.shots.filter(s => {
            const tg = units.filter(u => u.team !== s.team && !u.dead);
            if (s.home && !B.over && tg.length) { let T = tg[0], best = 1e9; tg.forEach(u => { const dd = u.m0 = Math.hypot(u.x - s.m.position.x, u.z - s.m.position.z); if (dd < best) { best = dd; T = u; } }); const want = new THREE.Vector3(T.x - s.m.position.x, T.y + 1.1 - s.m.position.y, T.z - s.m.position.z).normalize().multiplyScalar(s.v.length()); s.v.lerp(want, Math.min(1, dt * 1.2)); }
            s.m.position.addScaledVector(s.v, dt); s.life -= dt;
            const p = s.m.position;
            if (!B.over) {
              const T = tg.find(u => Math.hypot(p.x - u.x, p.z - u.z) < 0.45 + s.r && Math.abs(p.y - (u.y + 0.9)) < 1 + s.r);
              if (T) { if (T.own) hit(T, s); else if (s.from.me) floatText(T, '명중!', '#FFD23F'); burst(p, s.els[0], s.fused ? 26 : 14); kill(s); return false; }
            }
            if (s.life <= 0 || p.y < 0 || Math.abs(p.x) > ARENA + 4 || Math.abs(p.z) > ARENA + 4 || blocked(p.x, p.z)) { burst(p, s.els[0], 6); kill(s); return false; }
            return true;
          });
          B.parts = B.parts.filter(q => { q.life -= dt; q.m.position.addScaledVector(q.v, dt); q.v.y -= 6 * dt; q.m.material.opacity = Math.max(0, q.life / q.max); if (q.life <= 0) { scene.remove(q.m); q.m.geometry.dispose(); q.m.material.dispose(); return false; } return true; });
          // 쓰러짐 · 승패 (한 편이 모두 쓰러지면 끝)
          units.forEach(U => {
            if (U.dead || U.hp > 0 || !B.started) return;
            U.dead = true; U.hp = 0; burst(new THREE.Vector3(U.x, U.y + 1, U.z), 'dark', 22);
            if (U.me) { B.ch = null; markCharge(); if (units.some(o => ally(o) && !o.dead)) flash('쓰러졌어요! 같은 편을 응원해요', 2.4); }
            else if (!B.over) flash((ally(U) ? '같은 편 ' : '') + U.nick + ' 쓰러짐!', 1.2);
          });
          if (!B.over && B.started) { if (!foes().some(u => !u.dead)) end(true); else if (!units.some(u => ally(u) && !u.dead)) end(false); }
          // 몸 · 카메라 (내가 쓰러지면 살아 있는 같은 편을 따라 봄)
          units.forEach(U => { U.mesh.position.set(U.x, U.y + (U.me && !U.dead && Math.hypot(U.vx, U.vz) > 0.5 ? Math.abs(Math.sin(B.t * 10)) * 0.06 : 0) + (U.dead ? 0.25 : 0), U.z); U.mesh.rotation.set(U.dead ? -Math.PI / 2 : 0, U.yaw + Math.PI, 0, 'YXZ'); });
          const camU = me.dead ? (units.find(u => ally(u) && !u.dead) || me) : me, third = B.view === 3 || me.dead;
          me.mesh.visible = third;
          if (!third) { cam.position.set(me.x, me.y + 1.6, me.z); }
          else { const back = fwd(me.yaw, 0).multiplyScalar(-3.6); cam.position.set(camU.x + back.x + Math.cos(me.yaw) * 0.6, camU.y + 2.3, camU.z + back.z - Math.sin(me.yaw) * 0.6); }
          const look = fwd(me.yaw, me.pitch); cam.lookAt(cam.position.x + look.x, cam.position.y + look.y - (third ? 0.15 : 0), cam.position.z + look.z);
          renderer.render(scene, cam);
          // HUD
          $h('sfHp').style.width = (me.hp / me.F.hp * 100) + '%'; $h('sfHpT').textContent = me.dead ? '쓰러짐' : `체력 ${Math.ceil(me.hp)} / ${me.F.hp}`;
          $h('sfMp').style.width = (me.mp / me.F.mp * 100) + '%'; $h('sfMpT').textContent = `마나 ${Math.floor(me.mp)}`;
          units.forEach(U => {
            if (U.me) return;
            U.bar.style.width = (Math.max(0, U.hp) / U.F.hp * 100) + '%'; U.barT.textContent = U.dead ? '쓰러짐' : `${Math.ceil(U.hp)} / ${U.F.hp}`; U.row.classList.toggle('dead', U.dead);
            const v = new THREE.Vector3(U.x, U.y + 2.15, U.z).project(cam);
            if (U.dead || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) U.tag.style.display = 'none';
            else { U.tag.style.display = ''; U.tag.style.left = ((v.x + 1) / 2 * 100) + '%'; U.tag.style.top = ((1 - v.y) / 2 * 100) + '%'; }
          });
          body.querySelectorAll('.sf-num').forEach(b => { const e = S.skills[+b.dataset.num - 1], cd = me.cds[e] || 0; let o = b.querySelector('.cd'); if (cd > 0) { if (!o) { o = document.createElement('span'); o.className = 'cd'; b.appendChild(o); } o.textContent = cd.toFixed(1); } else if (o) o.remove(); });
          updFloats();
        }
        raf = requestAnimationFrame(tick);

        /* --- 효과 --- */
        function kill(s) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); }
        function burst(p, el, n) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? EL[el].c : EL[el].c2, transparent: true })); m.position.copy(p); scene.add(m); const life = rand(0.3, 0.7); B.parts.push({ m, v: new THREE.Vector3(rand(-3, 3), rand(0, 4), rand(-3, 3)), life, max: life }); } }
        const floats = [];
        function floatText(U, t, col) {
          if (U === me && B.view === 1) { const hu = $h('sfHurt'); if (hu && t[0] === '-') { hu.style.opacity = '1'; clearTimeout(B.hurtT); B.hurtT = setTimeout(() => { hu.style.opacity = '0'; }, 180); } return; }   /* 1인칭: 내 몸 위 숫자 대신 붉은 테두리 */
          const d = document.createElement('div'); d.className = 'sf-name'; d.textContent = t; d.style.color = col; d.style.fontSize = '22px'; stage.querySelector('.sf-hud').appendChild(d); floats.push({ d, U, t: 0, y: 2.1 }); }
        function updFloats() {
          for (let i = floats.length - 1; i >= 0; i--) {
            const f = floats[i]; f.t += 1 / 60; const v = new THREE.Vector3(f.U.x, f.U.y + f.y + f.t, f.U.z).project(cam);
            if (f.t > 0.9 || v.z > 1) { f.d.remove(); floats.splice(i, 1); continue; }
            f.d.style.left = ((v.x + 1) / 2 * 100) + '%'; f.d.style.top = ((1 - v.y) / 2 * 100) + '%'; f.d.style.opacity = String(1 - f.t);
          }
        }

        /* --- 끝 --- */
        async function end(win) {
          if (B.over) return; B.over = true; if (document.pointerLockElement) document.exitPointerLock();
          if (B.net) sendPos();
          if (win) S.wins++; else S.losses++; saveRow(S);
          const pts = win ? ((CFG.points && CFG.points.win) || 0) : 0;
          if (Hub.user) { try { await Hub.submitScore({ game_id: GAME, score: S.wins, duration_sec: Math.round(B.t), result: win ? 'win' : 'lose', points_delta: pts, extra: { lv: LV, vs: opt.cpu ? 'cpu' : 'player', mode: modeName(opt.size) } }); } catch (e) { /* noop */ } }
          const ov = document.createElement('div'); ov.className = 'sf-over';
          ov.innerHTML = `<div class="sf-card"><h3 style="justify-content:center;font-size:34px">${opt.size === 4 ? TEAM[win ? me.team : 1 - me.team] + ' 승리!' + (win ? '' : ' (우리 편 패배…)') : (win ? '승리!' : '패배…')}</h3><p class="sub">${modeName(opt.size)} 대결 · ${anyLeft.v ? '나간 사람은 쓰러진 것으로 쳤어요. ' : ''}${S.wins}승 ${S.losses}패${win && pts && Hub.user ? ` · +${pts}P` : ''}</p><button type="button" class="sf-btn" data-again>${opt.cpu ? '다시 대결' : '대기방으로'}</button> <button type="button" class="sf-btn ghost" data-lobby>대기방</button></div>`;
          stage.querySelector('.sf-hud').appendChild(ov);
          ov.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const again = 'again' in b.dataset && opt.cpu; stop(); if (again) startCpu(opt.diff); });
        }
        function stop() {
          cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey);
          document.removeEventListener('mousemove', onMove); document.removeEventListener('pointerlockchange', onLockCh); window.removeEventListener('resize', onRs); document.removeEventListener('fullscreenchange', onFs);
          if (fsNow()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (er) { /* noop */ } }
          if (document.pointerLockElement) document.exitPointerLock();
          renderer.dispose(); battle = null;
          if (B.net) { send({ t: 'bye' }); if (roomCh) { roomCh.leave(); roomCh = null; } myRoom = null; isHost = false; roomPeers = []; seenHost = false; starting = false; lobbyCh && lobbyCh.track({ id: Hub.clientId }); }
          if (alive) renderLobby();
        }
        B.stop = stop; B.end = end;
        window.__scf = { B, me, units, op: foes()[0], foes, press, fire, cancelCharge, cast: (a, b) => cast(me, a, b), end };   // 점검(테스트)용
        return B;
      }

      /* ================= 시작 ================= */
      (async () => {
        const rpg = await loadRow(CFG.levelFrom || 'rpg'); if (!alive) return;
        LV = clamp(Math.floor(+(rpg && rpg.lv) || 1), 1, 100);
        av = Hub.user ? Hub.user.avatar : AV.normalize({});
        S = fixSave(await loadRow(GAME), LV);
        lobby(); renderLobby(); BGM.play();
      })();

      return () => {
        alive = false;
        if (battle) { try { battle.stop(); } catch (e) { /* noop */ } }
        if (roomCh) roomCh.leave(); if (lobbyCh) lobbyCh.leave();
        BGM.stop();
      };
    }
  };

  /* ================= 경기장 (임시 — Skillcom 원본 배경으로 바꿀 자리) =================
   *  지금: 조선 성곽 느낌의 돌 경기장 (바닥 돌판 · 성벽 · 깃발 · 기둥 · 노을 하늘) */
  const ARENA = 16;
  const blocks = [];
  const blocked = (x, z) => blocks.some(b => Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3);
  function canvasTex(THREE, w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); fn(x, w, h); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; }
  const glowC = {};
  function glowTex(THREE, col) { return glowC[col] || (glowC[col] = canvasTex(THREE, 64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(0.3, col + 'AA'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); })); }
  function buildArena(THREE, scene) {
    blocks.length = 0;
    scene.background = canvasTex(THREE, 4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2A1E4A'); g.addColorStop(0.55, '#C8605A'); g.addColorStop(1, '#F5B060'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    scene.background.magFilter = THREE.LinearFilter;
    scene.fog = new THREE.Fog(0x8A5070, 30, 90);
    scene.add(new THREE.HemisphereLight(0xFFE2C0, 0x403050, 0.75));
    const sun = new THREE.DirectionalLight(0xFFD8A8, 0.85); sun.position.set(12, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 }); scene.add(sun);
    // 바닥: 돌판 (도트 무늬)
    const floor = canvasTex(THREE, 128, 128, (x) => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const v = 118 + ((i * 7 + j * 13) % 5) * 8; x.fillStyle = `rgb(${v},${v - 8},${v - 18})`; x.fillRect(i * 16, j * 16, 16, 16); x.fillStyle = 'rgba(40,30,20,.5)'; x.fillRect(i * 16, j * 16, 16, 1); x.fillRect(i * 16, j * 16, 1, 16); } });
    floor.wrapS = floor.wrapT = THREE.RepeatWrapping; floor.repeat.set(8, 8);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 8, ARENA * 2 + 8), new THREE.MeshLambertMaterial({ map: floor })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    // 가운데 원 (태극 느낌 색)
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 48), new THREE.MeshBasicMaterial({ color: 0xD2343A })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
    // 성벽 (네 둘레) + 성가퀴
    const wallM = new THREE.MeshLambertMaterial({ color: 0x8A7A68 }), capM = new THREE.MeshLambertMaterial({ color: 0x5A4A40 });
    const side = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), wallM); m.position.set(x, 1.5, z); m.castShadow = m.receiveShadow = true; scene.add(m); for (let i = -w / 2 + 0.6; i < w / 2; i += 1.4) { const c = new THREE.Mesh(new THREE.BoxGeometry(d > w ? 0.9 : 0.8, 0.6, d > w ? 0.8 : 0.9), capM); if (w > d) c.position.set(x + i, 3.3, z); else c.position.set(x, 3.3, z + i); scene.add(c); } if (d > w) for (let i = -d / 2 + 0.6; i < d / 2; i += 1.4) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.8), capM); c.position.set(x, 3.3, z + i); scene.add(c); } };
    side(0, -ARENA - 0.5, ARENA * 2 + 2, 1); side(0, ARENA + 0.5, ARENA * 2 + 2, 1); side(-ARENA - 0.5, 0, 1, ARENA * 2 + 2); side(ARENA + 0.5, 0, 1, ARENA * 2 + 2);
    // 깃발 (빨강·파랑)
    [[-10, -ARENA, 0xD2343A], [10, -ARENA, 0x3E4AC0], [-10, ARENA, 0x3E4AC0], [10, ARENA, 0xD2343A]].forEach(([x, z, c]) => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4), capM); pole.position.set(x, 5, z); scene.add(pole); const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })); fl.position.set(x + 0.8, 6.4, z); scene.add(fl); });
    // 기둥 (숨을 곳)
    const pilM = new THREE.MeshLambertMaterial({ color: 0x9A3A2A });
    [[-6, -3], [6, 3], [-6, 4], [6, -4], [0, 0.01]].slice(0, 4).forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 1.2), pilM); p.position.set(x, 1.6, z); p.castShadow = p.receiveShadow = true; scene.add(p); const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.8), capM); roof.position.set(x, 3.35, z); scene.add(roof); blocks.push({ x, z, w: 1.2, d: 1.2 }); });
  }
  // 컴퓨터 상대 모습 (임시 — Skillcom 원본 상대로 바꿀 자리): 아바타 옷으로 만든 장수
  function makeEnemyAvatar(k) {
    if (k === 'ally') return { skin: 's1', hair: 'h_topknot', hat: 'hat_gat', face: 'f_beard', top: 't_armor', bottom: 'b_armor', shoes: 'sh_boots', back: 'bk_cape' };   // 내 편 장수 (조선)
    if (k === 2) return { skin: 's1', hair: 'h_spiky', hat: 'hat_darkhelm', face: 'f_mask', top: 't_darkarmor', bottom: 'b_ninja', shoes: 'sh_black', back: 'bk_darkcape' };
    return { skin: 's1', hair: 'h_topknot', hat: 'hat_darkhelm', face: 'f_mustache', top: 't_samurai', bottom: 'b_armor', shoes: 'sh_black', back: 'bk_darkcape' };
  }
  function cpuStat(lv) { const st = {}, pts = (lv - 1) * PER; const keys = ['str', 'vit', 'dex', 'int']; for (let i = 0; i < pts; i++) { const k = keys[i % 4]; st[k] = Math.min(MAXS, (st[k] || 0) + 1); } return st; }
  function pickN(a, n) { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); }

  // 게임 카드 그림
  window.GoGames = window.GoGames || {};
  window.GoGames.scfight = {
    id: 'scfight',
    thumb(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2A1E4A'); g.addColorStop(0.6, '#C8605A'); g.addColorStop(1, '#F5B060'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8A7A68'; ctx.fillRect(0, h * 0.55, w, h * 0.12); for (let x = 0; x < w; x += 16) ctx.fillRect(x, h * 0.5, 10, h * 0.06);
      ctx.fillStyle = '#B09A80'; ctx.fillRect(0, h * 0.67, w, h * 0.33);
      [[w * 0.3, '#FF6A3D'], [w * 0.7, '#7FD8FF']].forEach(([x, c]) => { const r = ctx.createRadialGradient(x, h * 0.5, 2, x, h * 0.5, 30); r.addColorStop(0, '#FFFFFF'); r.addColorStop(0.4, c); r.addColorStop(1, c + '00'); ctx.fillStyle = r; ctx.fillRect(x - 30, h * 0.5 - 30, 60, 60); });
      ctx.font = '20px "Jua", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#1D2340'; ctx.strokeText('1 + 2 = 융합!', w / 2, h * 0.88); ctx.fillStyle = '#FFE45C'; ctx.fillText('1 + 2 = 융합!', w / 2, h * 0.88);
    }
  };
})();
