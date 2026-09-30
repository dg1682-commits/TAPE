/**
 * tape-renderer.js
 * 100% 순수 CSS 카세트테이프 렌더러 및 해시 기반 고유 그래픽 생성기
 * 이미지 에셋 없이 CSS box-shadow, gradient, border-radius만으로 사실적인 카세트테이프를 구현합니다.
 */

// 문자열을 32비트 정수 해시로 변환하는 함수
export function stringToHash(str) {
  let hash = 0;
  if (!str || str.length === 0) return 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32비트 정수로 변환
  }
  return Math.abs(hash);
}

// 제목과 가수를 바탕으로 테이프 고유 테마(Hue, 보조색, 패턴, 테이프 바디) 생성
export function generateTapeTheme(title = 'Untitled', artist = 'Unknown') {
  const combined = `${title}__${artist}`;
  const hash = stringToHash(combined);

  // 기본 Hue (0 ~ 360)
  const primaryHue = hash % 360;
  const secondaryHue = (primaryHue + 40 + (hash % 120)) % 360;
  const accentHue = (primaryHue + 180) % 360;

  // 채도 및 밝기
  const sat = 65 + (hash % 25); // 65% ~ 90%
  const light = 45 + (hash % 20); // 45% ~ 65%

  // 바디 셸 컬러 타입 (5가지 빈티지 플라스틱 톤)
  const bodyTypes = [
    { name: 'smoke-clear', shell: 'rgba(35, 38, 45, 0.94)', border: '#555b6a', screw: '#8a93a8' },
    { name: 'vintage-black', shell: '#1b1b1f', border: '#2f3138', screw: '#9a9da8' },
    { name: 'warm-ivory', shell: '#e8e2d2', border: '#c4bcab', screw: '#6e695d' },
    { name: 'cobalt-navy', shell: '#131e2f', border: '#293e5e', screw: '#829bbd' },
    { name: 'ruby-transparent', shell: 'rgba(60, 18, 25, 0.93)', border: '#78323c', screw: '#c28b93' }
  ];
  const bodyType = bodyTypes[hash % bodyTypes.length];

  // 패턴 스타일 (6가지 레트로 그래픽)
  const patternIndex = (hash >> 3) % 6;
  let labelBg = '';

  const c1 = `hsl(${primaryHue}, ${sat}%, ${light}%)`;
  const c2 = `hsl(${secondaryHue}, ${sat}%, ${Math.max(20, light - 20)}%)`;
  const c3 = `hsl(${accentHue}, 70%, 55%)`;

  switch (patternIndex) {
    case 0:
      // 레트로 사선 레이싱 스트라이프
      labelBg = `repeating-linear-gradient(45deg, ${c1} 0px, ${c1} 14px, ${c2} 14px, ${c2} 28px, #18181c 28px, #18181c 34px)`;
      break;
    case 1:
      // 80년대 신스웨이브 수평 스트라이프
      labelBg = `linear-gradient(180deg, ${c1} 0%, ${c1} 30%, #fff 30%, #fff 34%, ${c2} 34%, ${c2} 65%, #1a1a24 65%, #1a1a24 100%)`;
      break;
    case 2:
      // 네오 아날로그 다이아몬드/체커 텍스처
      labelBg = `radial-gradient(circle at 50% 50%, ${c1} 15%, transparent 16%), repeating-linear-gradient(0deg, ${c2} 0px, ${c2} 8px, #202028 8px, #202028 16px)`;
      break;
    case 3:
      // 빈티지 투톤 블록 & 악센트 띠
      labelBg = `linear-gradient(90deg, ${c1} 0%, ${c1} 45%, ${c3} 45%, ${c3} 52%, ${c2} 52%, ${c2} 100%)`;
      break;
    case 4:
      // 미니멀 하이파이 그리드
      labelBg = `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
      break;
    default:
      // 부드러운 오로라 아날로그 그라데이션
      labelBg = `radial-gradient(circle at 20% 30%, ${c1} 0%, transparent 60%), radial-gradient(circle at 80% 70%, ${c2} 0%, transparent 70%), #1f2229`;
      break;
  }

  // 테이프 규격 레이블 (C-60, C-90, CrO2 Type II 등)
  const tapeTypes = ['TYPE I / NORMAL POSITION', 'TYPE II / HIGH (CrO2)', 'METAL / TYPE IV', 'TYPE I / C-60', 'TYPE II / C-90'];
  const tapeGrade = tapeTypes[(hash >> 2) % tapeTypes.length];

  return {
    hash,
    primaryHue,
    secondaryHue,
    accentHue,
    c1,
    c2,
    c3,
    bodyType,
    labelBg,
    tapeGrade,
    patternIndex
  };
}

/**
 * 카세트테이프 HTML 요소를 생성합니다.
 * @param {Object} tapeData { title, artist, duration, playCount, date, id }
 * @param {Object} options { size: 'large'|'medium'|'compact', isPlaying: boolean, progress: number }
 */
export function createCassetteElement(tapeData = {}, options = {}) {
  const {
    title = '레트로 테이프',
    artist = '미상 아티스트',
    playCount = 0,
    date = '',
    id = 'tape-' + Date.now()
  } = tapeData;

  const {
    size = 'large', // 'large' (메인/플레이어), 'medium' (랙), 'compact' (리스트)
    isPlaying = false,
    progress = 0 // 0.0 ~ 1.0
  } = options;

  const theme = generateTapeTheme(title, artist);

  const container = document.createElement('div');
  container.className = `cassette-wrapper size-${size} ${isPlaying ? 'is-playing' : ''}`;
  container.dataset.tapeId = id;
  container.dataset.title = title;
  container.dataset.artist = artist;

  // 진행률에 따른 왼쪽/오른쪽 테이프 롤 반지름 계산 (0 ~ 1 사이)
  // 재생이 진행될수록 왼쪽 롤은 얇아지고, 오른쪽 롤은 두꺼워짐
  const minThickness = 28; // 최소 테이프 두께 (픽셀 비율)
  const maxThickness = 68; // 최대 테이프 두께
  const leftRoll = maxThickness - (maxThickness - minThickness) * progress;
  const rightRoll = minThickness + (maxThickness - minThickness) * progress;

  container.innerHTML = `
    <div class="cassette-body" style="--shell-color: ${theme.bodyType.shell}; --shell-border: ${theme.bodyType.border}; --screw-color: ${theme.bodyType.screw};">
      <!-- 4 모서리 정밀 나사 -->
      <div class="screw screw-tl"></div>
      <div class="screw screw-tr"></div>
      <div class="screw screw-bl"></div>
      <div class="screw screw-br"></div>
      <div class="screw screw-tc"></div>

      <!-- 상단 라이트 노치 & 쓰기방지 탭 -->
      <div class="write-protect-tab tab-left"></div>
      <div class="write-protect-tab tab-right"></div>

      <!-- 중앙 스티커 라벨 -->
      <div class="cassette-label" style="background: ${theme.labelBg};">
        <div class="label-header">
          <div class="label-side">SIDE <span>A</span></div>
          <div class="label-grade">${theme.tapeGrade}</div>
          <div class="label-brand">RETRO CASSETTE</div>
        </div>

        <div class="label-ruled-area">
          <div class="title-line">
            <span class="label-title-text">${escapeHtml(title)}</span>
          </div>
          <div class="artist-line">
            <span class="label-artist-text">${escapeHtml(artist)}</span>
            <span class="label-count-tag">${playCount > 0 ? `▶ ${playCount}회` : 'NEW'}</span>
          </div>
        </div>
      </div>

      <!-- 중앙 투명 윈도우 & 릴 영역 -->
      <div class="cassette-center-window">
        <!-- 눈금 스케일 가이드 (100 - 50 - 0) -->
        <div class="scale-gauge">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>

        <!-- 왼쪽 릴 & 마그네틱 테이프 롤 -->
        <div class="reel-pack reel-left-pack">
          <div class="tape-roll tape-roll-left" style="width: ${leftRoll}%; height: ${leftRoll}%;"></div>
          <div class="reel-spool reel-left ${isPlaying ? 'spinning' : ''}">
            <div class="spool-center"></div>
            <div class="spool-teeth tooth-1"></div>
            <div class="spool-teeth tooth-2"></div>
            <div class="spool-teeth tooth-3"></div>
            <div class="spool-teeth tooth-4"></div>
            <div class="spool-teeth tooth-5"></div>
            <div class="spool-teeth tooth-6"></div>
          </div>
        </div>

        <!-- 윈도우 중앙 투명 관찰창 홈 -->
        <div class="window-center-bridge"></div>

        <!-- 오른쪽 릴 & 마그네틱 테이프 롤 -->
        <div class="reel-pack reel-right-pack">
          <div class="tape-roll tape-roll-right" style="width: ${rightRoll}%; height: ${rightRoll}%;"></div>
          <div class="reel-spool reel-right ${isPlaying ? 'spinning' : ''}">
            <div class="spool-center"></div>
            <div class="spool-teeth tooth-1"></div>
            <div class="spool-teeth tooth-2"></div>
            <div class="spool-teeth tooth-3"></div>
            <div class="spool-teeth tooth-4"></div>
            <div class="spool-teeth tooth-5"></div>
            <div class="spool-teeth tooth-6"></div>
          </div>
        </div>
      </div>

      <!-- 하단 헤드 접촉부 & 롤러 가이드 구멍 (사다리꼴 베벨) -->
      <div class="cassette-bottom-bay">
        <div class="guide-roller roller-left"></div>
        <div class="head-aperture-left"></div>
        <div class="center-pressure-pad"></div>
        <div class="head-aperture-right"></div>
        <div class="guide-roller roller-right"></div>
      </div>
    </div>
  `;

  return container;
}

/**
 * 재생 상태 및 진행률에 따라 카세트테이프의 릴 회전과 테이프 롤 두께를 실시간으로 업데이트합니다.
 */
export function updateCassetteState(tapeElement, progress = 0, isPlaying = false) {
  if (!tapeElement) return;

  if (isPlaying) {
    tapeElement.classList.add('is-playing');
  } else {
    tapeElement.classList.remove('is-playing');
  }

  const leftSpool = tapeElement.querySelector('.reel-left');
  const rightSpool = tapeElement.querySelector('.reel-right');
  if (leftSpool && rightSpool) {
    if (isPlaying) {
      leftSpool.classList.add('spinning');
      rightSpool.classList.add('spinning');
    } else {
      leftSpool.classList.remove('spinning');
      rightSpool.classList.remove('spinning');
    }
  }

  const minThickness = 28;
  const maxThickness = 68;
  const leftRoll = maxThickness - (maxThickness - minThickness) * progress;
  const rightRoll = minThickness + (maxThickness - minThickness) * progress;

  const leftTapeRoll = tapeElement.querySelector('.tape-roll-left');
  const rightTapeRoll = tapeElement.querySelector('.tape-roll-right');
  if (leftTapeRoll) {
    leftTapeRoll.style.width = `${leftRoll}%`;
    leftTapeRoll.style.height = `${leftRoll}%`;
  }
  if (rightTapeRoll) {
    rightTapeRoll.style.width = `${rightRoll}%`;
    rightTapeRoll.style.height = `${rightRoll}%`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
