/*
 * 닷지 — 게임 설정 (옛날 곰플레이어 숨은 게임 '닷지'처럼: 사방에서 날아오는 총알을 피해 오래 버티기)
 *  - 혼자 · 한 기기 둘이서 · 온라인 친구와 둘이서. 둘이서·온라인은 [협동] 또는 [대결]
 *    협동 = 둘이 같이 버티기 (한 명이라도 맞으면 바로 끝) · 대결 = 먼저 맞는 사람이 짐
 *  - 피하는 캐릭터 = 내 아바타. 점수 = 버틴 시간 (0.01초까지)
 * ※ 숫자(총알 수·빠르기·포인트)는 이 파일만 고치면 됩니다.
 */
GoSettings.register({
  id: 'dodge',
  name: '닷지',
  category: 'arcade',
  folder: 'games/arcade/dodge',
  order: 5,
  tag: 'NEW',
  board: true,                         // 대결 화면 사용 (혼자 / 한 기기 둘이서 / 온라인)
  online: true, netRoom: true,         // 온라인: 다른 기기 친구와 둘이서 (방장 기기가 총알을 계산)
  scoreRank: true,                     // 랭킹 = 가장 오래 버틴 시간
  scoreText: v => (Math.max(0, +v || 0) / 100).toFixed(2) + '초',
  w: 480, ar: 1,                       // 정사각형 화면
  aiLabel: '혼자', aiLevels: ['normal'], levelNames: { normal: '혼자 도전' },
  subModes: [['coop', '협동 · 둘이 같이 버티기'], ['vs', '대결 · 먼저 맞으면 짐']],
  onlineBtn: '다른 기기 친구와', resignLabel: '그만하기',
  rankSub: '가장 오래 버틴 시간 TOP 10',
  sides: '혼자 또는 둘이서',
  vsText: '총알을 피해 오래 버티기',

  // 총알 (원래 닷지처럼: 화면 가장자리에서 나를 노리고 날아옴, 시간이 갈수록 많아짐)
  bulletStart: 12,                     // 처음 총알 수
  bulletPerSec: 2.0,                   // 1초마다 늘어나는 총알 수 (v49: 원래 닷지보다 어렵게 1 → 2)
  bulletMax: 220,                      // 가장 많을 때
  bulletSpeed: [100, 165],             // 처음 총알 빠르기 (화면 점/초, 이 사이에서 무작위)
  speedUpPerSec: 0.015,                // 1초마다 총알 빠르기 +1.5% (30초 = 1.45배, 60초 = 1.9배)
  speedUpMax: 2.2,                     // 가장 빠를 때 (처음의 몇 배)
  bulletAim: 0.22,                     // 노리는 방향에서 벗어나는 정도 (라디안, ±)
  moveSpeed: 170,                      // 내 아바타 빠르기
  hitR: 5, bulletR: 3,                 // 맞는 범위 (아바타 가슴 둘레 · 총알)
  readySec: 2,                         // 시작 전 준비 시간
  coopGoal: 30,                        // 온라인 협동: 이 시간(초) 넘게 버티면 '성공'
  // 포인트 (혼자·온라인): 버틴 시간에 따라 · 온라인 대결 승리 +2P
  timePoints: [[10, 1], [30, 2], [60, 3]],
  points: { win: 2, lose: 0 },
  levelScore: { easy: 0, normal: 0, hard: 0 },

  blurb: '옛날 곰플레이어에 숨어 있던 그 게임! 사방에서 날아오는 총알을 내 아바타로 피해 오래 버텨요. 둘이서 협동하거나 누가 오래 버티나 대결해요.',
  keys: [['방향키 또는 W A S D', '아바타 움직이기'], ['한 기기 둘이서', '1P = W A S D · 2P = 방향키'], ['P · Esc', '일시정지 (혼자·한 기기)'], ['휴대폰', '화면을 끌어서 이동 · 둘이서는 왼쪽 반 = 1P, 오른쪽 반 = 2P']],
  noteText(mode) { return mode === 'local' ? '한 기기 둘이서 · 포인트 없이 기록만 남아요' : mode === 'online' ? '협동 = 같이 버틴 시간 · 대결 이기면 +' + this.points.win + 'P' : '10초 +1P · 30초 +2P · 60초 +3P · 랭킹은 가장 오래 버틴 시간'; },
  cardRules() {
    return '<dt>목표</dt><dd>날아오는 총알을 피해 오래 버티기</dd>'
      + '<dt>포인트</dt><dd>10초 <b class="plus">+1P</b> · 30초 <b class="plus">+2P</b> · 60초 <b class="plus">+3P</b> · 온라인 대결 승리 <b class="plus">+' + this.points.win + 'P</b></dd>'
      + '<dt>랭킹</dt><dd>가장 오래 버틴 시간</dd>'
      + '<dt>둘이서</dt><dd>협동 = 한 명이라도 맞으면 끝 · 대결 = 먼저 맞으면 짐</dd>';
  },
  hero: { eyebrow: 'NEW · 오락실', title: '닷지,', em: '피해라!', desc: '그 시절 곰플레이어 숨은 게임. 사방에서 쏟아지는 총알을 내 아바타로 피해 몇 초 버틸 수 있을까요?', cta: '도전하기' },
  goalText() { return '총알을 피해 오래 버티기'; }
});
