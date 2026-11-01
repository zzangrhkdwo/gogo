/*
 * skillcom RPG (RPG) — 게임 설정
 *  - v42 온라인: 서버 10개 × 최대 30명, 같은 지도에 있는 사람이 보임 (net.js). 손님은 혼자 하기
 *  - 캐릭터 = 내 아바타 (상점·옷장에서 꾸민 모습 그대로). 직업 없음.
 *  - 마을 9개 · 사냥터 90개 (마을마다 10개) · 마을 1~8 은 10레벨씩(사냥터마다 +1), 마을 9(성)는 80→100(사냥터마다 +2) · 만렙 100
 *  - 지도·몬스터·장비·포션·마법 숫자는 data.js, 시간·저장·포인트는 이 파일에서 고칩니다.
 *  - ※ 마법은 skillcom(마법 융합 RPG) 마법을 받기 전 임시 목록 (data.js 의 SKILLS · FUSION)
 */
GoSettings.register({
  id: 'rpg',
  name: 'skillcom RPG',
  category: 'action',
  folder: 'games/action/rpg',
  order: 1,
  tag: 'NEW',
  page: 'GoRPG',                       // 전용 화면 (게임판 + 아래 메뉴 + 랭킹)
  w: 960, ar: 960 / 540,
  blurb: '내 아바타로 떠나는 도트 RPG! 마을 9곳 · 사냥터 90곳 · 만렙 100. 마을에서 마법을 사고, 두 마법을 섞어 새 마법을 만들어요.',
  keys: [['W A S D · 방향키', '이동'], ['Space · J', '기본 공격'], ['1 2 3 4', '마법 (마법 창에서 칸에 넣기)'], ['Q · E', '체력 포션 · 마나 포션'], ['I · K · C', '가방(장비) · 마법 창 · 스탯 창 (왼쪽 위 얼굴을 눌러도 돼요)'], ['F · Enter', '건물 들어가기 · 말 걸기'], ['Esc', '창 닫기'], ['휴대폰', '왼쪽 아래 조이스틱 · 오른쪽 버튼 (가로로 돌리면 크게)']],

  hero: { eyebrow: 'NEW · RPG', title: '내 아바타로 떠나는', em: 'skillcom RPG!', desc: '마을 9곳 · 사냥터 90곳을 지나 만렙 100까지! 마을에서 마법을 배우고, 불+바람 = 화염 폭풍처럼 두 마법을 섞어 나만의 마법을 만들어요.', cta: '모험 떠나기' },

  points: { win: 0, boss: 0 },         // 보스 잡을 때 포인트 (0 = 없음). 예: 1 → 보스 처치마다 +1P (서버 규칙: 한 번에 ±10P 까지)
  autosaveSec: 20,                     // 이 기기에 자동 저장 간격(초)
  serverSaveSec: 60,                   // 서버(로그인) 저장 간격(초). 레벨 업 · 상점 · 지도 이동 때도 저장
  deathExpLoss: 0.05,
  online: { servers: 10, cap: 30, pingSec: 15 },
  respawnSec: 3,                       // v43 몬스터가 쓰러진 뒤 다시 나오는 시간(초) (전에는 9초)
  bossRespawnSec: 30,                  // 보스가 다시 나오는 시간(초) (전에는 60초)
  statPerLevel: 2,                     // v44 레벨이 오를 때마다 받는 스탯 포인트 (힘·민첩·지혜·체력, 스탯마다 최대 50)   // v42 온라인 서버 10개 × 최대 30명 (cap 을 바꾸면 supabase/rpg_online_v42.sql 의 cap 도 같이)                  // 쓰러지면 다음 레벨 경험치의 5% 잃음 (레벨은 안 내려감)

  /* 랭킹: 레벨 (레벨이 오를 때마다 기록) — 점수 = 레벨 */
  scoreText(score) { return score ? 'Lv.' + score : '-'; },
  bgm: { file: 'bgm/bgm.mp3', volume: 0.35 }
});
