/*
 * gogo?gogo! — skillcom RPG · 온라인 (v42)
 *   서버 10개 × 최대 30명 (settings.js 의 online). 로그인한 사람만 (손님은 혼자 하기)
 *
 *   1) 서버 인원·자리: DB 함수 (supabase/rpg_online_v42.sql)
 *        rpg_servers() 10개 서버 인원 · rpg_join(서버, 지도, 레벨) 들어가기 + 15초마다 다시 불러 자리 유지 · rpg_leave()
 *   2) 같은 지도에 있는 사람끼리만 실시간 연결: Hub.channel('rpg-<서버>-<지도>')
 *        presence(누가 있나: 닉네임·레벨·아바타·장비) + broadcast(움직임 'p' · 마법 'c')
 *   ※ 무료 요금제 한도(동시 연결 200 · 초당 메시지 100)를 아끼려고
 *      · 같은 지도에 아무도 없으면 아무것도 안 보냄 · 가만히 있으면 안 보냄
 *      · 움직일 때도 사람이 많을수록 덜 자주 보냄 (0.3초 ~ 1.2초), 대신 받는 쪽이 속도로 앞질러 그려서 부드럽게
 *   몬스터·전리품은 각자 따로 (같은 지도라도 내 몬스터는 나만 봄). 저장은 계정(game_saves) 하나라서 어느 서버에서나 이어서
 *   체험 모드(Supabase 없음)에서는 같은 브라우저의 다른 탭끼리 연결됨 (시험용)
 */
(function () {
  'use strict';
  const Hub = window.GameHub;
  const CFG = window.GoSettings.get('rpg'), OPT = Object.assign({ servers: 10, cap: 30, pingSec: 15 }, CFG.online || {});

  function create(h) {   // h: { me() → {nick, lv, av, eq, hide}, onPeers(), onFx(msg), onKick(reason) }
    const net = { server: 0, room: '', ch: null, peers: new Map(), sendT: 0, lastKey: '', moving: false, pingT: 0, retrackT: 0, joined: false };
    const live = () => Hub.mode === 'online' && Hub._sb && Hub.user;
    net.enabled = () => !!Hub.user;
    net.opt = OPT;

    net.list = async () => {
      if (!live()) return { demo: true, rows: Array.from({ length: OPT.servers }, (_, i) => ({ server: i + 1, players: null })) };
      const { data, error } = await Hub._sb.rpc('rpg_servers');
      if (error) return { error: /rpg_servers|schema cache|does not exist/i.test(error.message) ? 'sql' : error.message, rows: [] };
      return { rows: (data || []).map(r => ({ server: r.server, players: r.players })) };
    };
    async function ask(srv, room, lv) {
      if (!live()) return { ok: true, players: null };
      const { data, error } = await Hub._sb.rpc('rpg_join', { p_server: srv, p_map: room, p_lv: lv });
      if (error) return { ok: false, reason: /rpg_join|schema cache|does not exist/i.test(error.message) ? 'sql' : 'error' };
      return data || { ok: false, reason: 'error' };
    }
    net.join = async (srv, room, lv) => {
      const r = await ask(srv, room, lv);
      if (!r.ok) return r;
      if (net.server && net.server !== srv) net.leaveRoom();
      net.server = srv; net.joined = true; net.pingT = 0;
      try { localStorage.setItem('gogogogo.rpg.server', String(srv)); } catch (e) { /* noop */ }
      net.setRoom(room, true);
      return r;
    };
    net.leave = () => {
      net.leaveRoom(); net.server = 0; net.joined = false;
      if (live()) Hub._sb.rpc('rpg_leave').then(() => {}, () => {});
    };
    net.leaveRoom = () => { if (net.ch) { try { net.ch.leave(); } catch (e) { /* noop */ } } net.ch = null; net.room = ''; net.peers.forEach((p, k) => h.onLeave && h.onLeave(k)); net.peers.clear(); h.onPeers && h.onPeers(); };
    // 지도(또는 건물 안)를 바꿀 때마다: 그 지도 채널로 옮김
    net.setRoom = (room, force) => {
      if (!net.joined) return;
      if (room === net.room && !force) return;
      net.leaveRoom(); net.room = room;
      net.ch = Hub.channel('rpg-' + net.server + '-' + room, { onMsg, onPeers, onError() { /* 연결이 끊기면 다음 지도 이동 때 다시 */ } });
      net.ch.track(stateNow());
      net.lastKey = ''; net.sendT = 9;
    };
    function stateNow() { const m = h.me(); return { cid: Hub.clientId, uid: Hub.user ? Hub.user.id : '', nick: m.nick, lv: m.lv, av: m.av, eq: m.eq, hide: !!m.hide, x: Math.round(m.x), y: Math.round(m.y) }; }
    net.retrack = () => { net.retrackT = 1.5; };   // 레벨·장비가 바뀌면 1.5초 뒤 한 번만 알림

    function onPeers(list) {
      const seen = new Set(); let fresh = false;
      (list || []).forEach(st => {
        if (!st || !st.cid || st.cid === Hub.clientId) return;
        if (Hub.user && st.uid === Hub.user.id) return;            // 같은 계정의 다른 창은 안 보임
        seen.add(st.cid);
        let p = net.peers.get(st.cid);
        if (!p) { p = { cid: st.cid, x: st.x, y: st.y, tx: st.x, ty: st.y, vx: 0, vy: 0, face: 1, at: performance.now(), walk: 0 }; net.peers.set(st.cid, p); fresh = true; }
        Object.assign(p, { nick: String(st.nick || '').slice(0, 12), lv: +st.lv || 1, av: st.av, eq: st.eq || {}, hide: !!st.hide });
      });
      net.peers.forEach((p, k) => { if (!seen.has(k)) { net.peers.delete(k); h.onLeave && h.onLeave(k); } });
      if (fresh) { net.lastKey = ''; net.sendT = 9; net.forceOnce = true; }   // 새로 온 사람에게 내 자리를 바로 알려 줌
      h.onPeers && h.onPeers();
    }
    function onMsg(m) {
      if (!m || !m.cid) return;
      const p = net.peers.get(m.cid); if (!p) return;
      if (m.t === 'p') { p.tx = m.x; p.ty = m.y; p.vx = m.vx || 0; p.vy = m.vy || 0; p.face = m.f || p.face; p.at = performance.now(); if (Math.hypot(p.x - m.x, p.y - m.y) > 200) { p.x = m.x; p.y = m.y; } }
      else if (m.t === 'c') { h.onFx && h.onFx(m, p); }
      else if (m.t === 'tr' && m.to === Hub.clientId) { h.onTrade && h.onTrade(m, p); }   // v44 1:1 거래 (나에게 온 것만)
    }

    // 매 틱: 내 움직임 보내기(필요할 때만) · 다른 사람 부드럽게 움직이기 · 15초마다 자리 유지
    net.tick = (dt, me) => {
      if (!net.joined) return;
      net.pingT += dt;
      if (net.pingT >= OPT.pingSec) {
        net.pingT = 0;
        ask(net.server, net.room, me.lv).then(r => { if (r && !r.ok && r.reason !== 'error') { const why = r.reason; net.leave(); h.onKick && h.onKick(why); } });
      }
      if (net.retrackT > 0 && (net.retrackT -= dt) <= 0 && net.ch) net.ch.track(stateNow());
      const now = performance.now();
      net.peers.forEach(p => {
        const age = Math.min(1, (now - p.at) / 1000), px = p.tx + p.vx * age, py = p.ty + p.vy * age, k = Math.min(1, dt * 10);
        const ox = p.x, oy = p.y; p.x += (px - p.x) * k; p.y += (py - p.y) * k;
        const sp = Math.hypot(p.x - ox, p.y - oy) / Math.max(dt, 0.001); p.moving = sp > 20; if (p.moving) p.walk += dt;
        if (Math.abs(p.x - ox) > 0.5) p.face = p.x < ox ? -1 : 1;
      });
      if (!net.ch || !net.peers.size) return;                          // 같은 지도에 아무도 없으면 안 보냄
      net.sendT += dt;
      const moving = Math.hypot(me.vx, me.vy) > 1;
      const key = moving ? [Math.round(me.vx / 20), Math.round(me.vy / 20)].join(',') : 'stop';
      const every = Math.min(1.2, 0.3 + 0.06 * net.peers.size);
      const changed = key !== net.lastKey;
      if ((moving && (net.sendT >= every || (changed && net.sendT >= 0.15))) || (!moving && changed) || net.forceOnce) {
        net.sendT = 0; net.lastKey = key; net.forceOnce = false;
        net.ch.send({ t: 'p', cid: Hub.clientId, x: Math.round(me.x), y: Math.round(me.y), vx: moving ? Math.round(me.vx) : 0, vy: moving ? Math.round(me.vy) : 0, f: me.face });
      }
    };
    net.trade = msg => { if (net.ch) net.ch.send(Object.assign({ t: 'tr', cid: Hub.clientId }, msg)); };
    net.cast = msg => { if (net.ch && net.peers.size) net.ch.send(Object.assign({ t: 'c', cid: Hub.clientId }, msg)); };
    return net;
  }
  window.GoRPGNet = { create, OPT };
})();
