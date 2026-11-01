/*
 * Skillcom Fight — 게임 설정 (v45 첫 버전)
 *  - skillcom RPG 에서 키운 캐릭터의 아바타 + 레벨만 가져옴 (장비는 안 가져옴)
 *  - 3D 대결 (three.js, vendor/three.min.js). 1인칭 ↔ 3인칭 (V 키 / 화면 버튼)
 *  - 마법: 숫자 1~4 = 차지(발사 대기). 차지 중 숫자 하나 더 = 융합 차지(같은 숫자 = 강화 1+1, 다른 숫자 = 1+2)
 *          마우스 왼쪽 = 발사, 오른쪽 = 차지 취소 (휴대폰: 화면의 발사·취소 버튼)
 *  - 대기방(컴퓨터와 대결 · 온라인 방) — 1:1 또는 2:2 (2:2 는 같은 편끼리 안 맞음, 온라인은 빈자리를 컴퓨터로 채워 시작 가능) + 스킬 고르기 + 스탯 (레벨당 2포인트, 스탯마다 최대 50)
 *  - ※ 배경(경기장)·컴퓨터 상대 그림은 임시. PC 의 Skillcom 원본을 받으면 game.js 의 buildArena()·makeEnemy() 를 바꿈
 */
GoSettings.register({
  id: 'scfight',
  name: 'Skillcom Fight',
  category: 'action',
  folder: 'games/action/scfight',
  order: 2,
  tag: 'NEW',
  page: 'GoSCFight',
  w: 960, ar: 960 / 540,
  blurb: 'skillcom RPG 캐릭터로 겨루는 3D 마법 대결! 숫자로 마법을 차지하고 클릭으로 발사! 차지 중에 숫자를 하나 더 누르면 융합 마법. 1인칭·3인칭 시점 전환.',
  keys: [['W A S D', '이동'], ['마우스 · 화면 끌기', '둘러보기 (화면을 누르면 마우스 고정, Esc 로 풀기)'], ['1 2 3 4', '마법 차지 (화면 숫자 버튼을 눌러도 돼요)'], ['차지 중 숫자 하나 더', '융합 차지 (예: 1+1, 1+2)'], ['마우스 왼쪽', '발사'], ['마우스 오른쪽', '차지 취소'], ['V', '1인칭 ↔ 3인칭'], ['Space', '점프']],
  hero: { eyebrow: 'NEW · 3D 대결', title: 'RPG 에서 키운 캐릭터로', em: 'Skillcom Fight!', desc: '숫자로 차지, 클릭으로 발사! 차지 중에 숫자를 하나 더 누르면 융합 마법! 컴퓨터나 친구와 1:1 · 2:2 로 겨뤄요.', cta: '대결하러 가기' },

  levelFrom: 'rpg',                   // 레벨을 가져올 게임 (skillcom RPG)
  statPerLevel: 2,                    // 레벨당 스탯 포인트
  statMax: 50,                        // 스탯마다 최대
  points: { win: 1, lose: 0 },        // 이기면 +1P (로그인한 사람)
  roundHp: 100,                       // 기본 체력 (레벨·체력 스탯으로 늘어남)
  scoreText(score) { return score ? score + '승' : '-'; },
  bgm: { file: 'bgm/bgm.mp3', volume: 0.35 }
});
