/*
 * gogo?gogo! 서비스 워커 — 앱 설치와 오프라인 플레이를 담당합니다.
 * 파일을 고친 뒤 배포할 때는 VERSION 숫자를 올려 주세요. (설치된 앱이 새 버전을 받습니다)
 */
const VERSION = 'gogogogo-v48';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/config.js',
  './games/common/shared.js',
  './avatar/avatar.js',
  './js/gamehub.js',
  './games/puzzle/blocks/settings.js',
  './games/puzzle/blocks/game.js',
  './games/puzzle/p512/settings.js',
  './games/puzzle/p512/game.js',
  './games/puzzle/ultimate/settings.js',
  './games/puzzle/ultimate/game.js',
  './games/puzzle/battle/settings.js',
  './games/puzzle/battle/game.js',
  './games/puzzle/2048/settings.js',
  './games/puzzle/2048/game.js',
  './games/arcade/snake/settings.js',
  './games/arcade/snake/game.js',
  './games/common/board.js',
  './games/board/baduk/settings.js',
  './games/board/baduk/game.js',
  './games/board/omok/settings.js',
  './games/board/omok/game.js',
  './games/board/janggi/settings.js',
  './games/board/janggi/game.js',
  './games/board/chess/settings.js',
  './games/board/chess/game.js',
  './games/board/alkkagi/settings.js',
  './games/board/alkkagi/game.js',
  './games/board/code/settings.js',
  './games/board/code/game.js',
  './games/sports/sport.js',
  './games/sports/volley/settings.js',
  './games/sports/volley/game.js',
  './games/sports/tennis/settings.js',
  './games/sports/tennis/game.js',
  './games/sports/fight/settings.js',
  './games/sports/fight/game.js',
  './games/action/mecha/settings.js',
  './games/action/mecha/game.js',
  './games/shooting/sky/settings.js',
  './games/shooting/sky/game.js',
  './games/study/common.js',
  './games/study/wordchain/settings.js',
  './games/study/wordchain/game.js',
  './games/study/typing/settings.js',
  './games/study/typing/game.js',
  './games/study/idiom/data.js',
  './games/study/idiom/settings.js',
  './games/study/idiom/game.js',
  './games/study/quiz.js',
  './games/study/english/data.js',
  './games/study/english/settings.js',
  './games/study/english/game.js',
  './games/study/history/data.js',
  './games/study/history/settings.js',
  './games/study/history/game.js',
  './games/puzzle/mines/settings.js',
  './games/puzzle/mines/game.js',
  './games/action/rpg/data.js',
  './games/action/rpg/settings.js',
  './games/action/rpg/world.js',
  './games/action/rpg/room.js',
  './games/action/rpg/net.js',
  './games/action/rpg/fx.js',
  './games/action/rpg/game.js',
  './games/action/scfight/settings.js',
  './games/action/scfight/game.js',
  './js/filter.js',
  './js/social.js',
  './js/admin.js',
  './js/banner.js',
  './js/presence.js',
  './js/shop.js',
  './js/closet.js',
  './js/app.js',
  './js/pwa.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 우리 사이트 파일: 인터넷 우선(항상 최신) → 끊기면 저장본
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        // 배경음악처럼 나눠 받는 파일(206)은 저장하지 않음
        if (res.ok && res.status !== 206 && !req.headers.has('range')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 글꼴·라이브러리: 저장본 우선 (바뀌지 않는 파일)
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // 그 밖(Supabase 등 데이터 요청)은 가로채지 않고 그대로 통과
});
