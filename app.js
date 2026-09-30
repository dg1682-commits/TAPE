/**
 * app.js
 * 레트로 카세트 데크 커스텀 노래방 앱 - 통합 컨트롤러
 */

import { audioEngine } from './audio-engine.js';
import { 
  getAllTapes, saveTape, deleteTape, incrementTapePlayCount, toggleTapeFavorite, checkFirebaseStatus 
} from './firebase-db.js';
import { 
  createCassetteElement, updateCassetteState 
} from './tape-renderer.js';

// ==================== 전역 상태 ====================
const state = {
  currentView: 'dashboard', // 'dashboard' | 'studio' | 'player' | 'rack' | 'settings'
  tapes: [],
  selectedTape: null,
  currentFilter: 'all',
  isPlaying: false,
  isRecording: false,
  studioKeyShift: 0,
  studioIsMicRecord: true,
  studioEcho: 0.4,
  studioMicVol: 1.0,
  playerKeyShift: 0,
  focusedRackTapeId: null
};

// ==================== 모달 팝업 시스템 (모든 팝업은 레트로 모달) ====================
export function showRetroModal({
  title = 'SYSTEM ALERT',
  contentHTML = '',
  confirmText = '확인',
  cancelText = null,
  onConfirm = null,
  onCancel = null
}) {
  const backdrop = document.getElementById('retro-modal-backdrop');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');

  if (!backdrop || !titleEl || !bodyEl || !footerEl) return;

  // 기계음 딸깍
  audioEngine.playMechanicalClick();

  titleEl.innerHTML = title;
  bodyEl.innerHTML = contentHTML;
  footerEl.innerHTML = '';

  if (cancelText) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-action-btn';
    cancelBtn.textContent = cancelText;
    cancelBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      closeRetroModal();
      if (onCancel) onCancel();
    };
    footerEl.appendChild(cancelBtn);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-action-btn btn-confirm';
  confirmBtn.textContent = confirmText;
  confirmBtn.onclick = () => {
    audioEngine.playMechanicalClick();
    closeRetroModal();
    if (onConfirm) onConfirm();
  };
  footerEl.appendChild(confirmBtn);

  backdrop.classList.add('is-open');
}

export function closeRetroModal() {
  const backdrop = document.getElementById('retro-modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('is-open');
  }
}

// ==================== 업데이트 내역 모달 ====================
function showChangelogModal() {
  const changelogHTML = `
    <div class="changelog-box">
      <div>
        <span class="changelog-version-tag">VERSION 1.3.0 (LATEST)</span>
        <div style="font-size: 11px; color: #8892b0; margin-bottom: 8px;">배포 일자: 2026-09-30 | 퍼가기 보장 MR & 파이어베이스 테이프 랙 & 대형 녹음 버튼</div>
        <ul class="changelog-list">
          <li><strong>🟢 재생 보장(퍼가기 허용) MR 반주 우선 노출:</strong> 퍼가기가 제한된 TJ 공식 영상 대신 일반 크리에이터 및 가사 반주 MR을 자동으로 찾아 [🟢 재생 보장 MR] 배지를 달아 최상단에 배치</li>
          <li><strong>💾 파이어베이스 클라우드 & 로컬 랙 즉시 저장:</strong> 녹음 완료 즉시 Firestore/Storage에 업로드되며 테이프 랙(RACK)에 바로 노출 및 원터치 감상</li>
          <li><strong>★ 즐겨찾기 별표 필터링 시스템:</strong> 테이프 랙에서 각 테이프마다 [★ 별표]를 눌러 즐겨찾기를 등록하고 [★ 즐겨찾기] 탭에서 따로 모아보기 지원</li>
          <li><strong>🔴 원터치 대형 물리 녹음 시작 버튼:</strong> 운전 중이나 노래방 모드에서 한 손으로도 쉽게 누를 수 있는 64px 대형 3D 레드 녹음 버튼 적용</li>
          <li><strong>⌨️ 검색 완료 및 엔터 시 모바일 키보드 자동 숨김:</strong> 검색어 입력 후 엔터나 검색 버튼 클릭 시 가상 키보드가 즉시 내려가 화면 가림 완벽 방지</li>
        </ul>
      </div>
    </div>
  `;

  showRetroModal({
    title: '📦 DECK SYSTEM CHANGELOG',
    contentHTML: changelogHTML,
    confirmText: '확인 및 닫기'
  });
}

// ==================== DOM 초기화 및 이벤트 바인딩 ====================
document.addEventListener('DOMContentLoaded', async () => {
  // 모달 닫기 버튼 바인딩
  const modalCloseBtn = document.getElementById('modal-btn-close');
  if (modalCloseBtn) {
    modalCloseBtn.onclick = () => closeRetroModal();
  }

  // GNB 물리 버튼 바인딩
  setupGnbButtons();

  // VU 미터 콜백 연결
  audioEngine.onVuUpdate = (left, right) => {
    updateVuMeterUI(left, right);
  };

  // 실시간 시계 타이머
  startClockTimer();

  // 테이프 데이터 로드
  await loadTapes();

  // 뷰 초기화
  switchView('dashboard');

  // 서브 시스템 바인딩
  setupStudioControls();
  setupPlayerControls();
  setupRackControls();
  setupSettingsControls();
  initKpopChart();

  // 웹 브라우저 고유 동작 방어 (완전한 네이티브 앱 UX)
  // 1. 길게 누르기 / 우클릭 컨텍스트 메뉴 방지
  document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  // 3. PWA Service Worker 등록 (크롬 WebAPK 승격 및 주소창 제거)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }

  // 4. 전체화면 토글 버튼 (원터치로 브라우저 주소창 & 상단바 숨기기)
  const fullscreenBtn = document.getElementById('btn-fullscreen-toggle');
  if (fullscreenBtn) {
    fullscreenBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      toggleAppFullscreen();
    };
  }

  // 5. 앱 완전 종료 (셧다운) 버튼
  const exitBtn = document.getElementById('btn-app-exit');
  if (exitBtn) {
    exitBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      showRetroModal({
        title: '⏻ APP SHUTDOWN',
        contentHTML: '카세트 데크 어플의 모든 오디오 및 반주 기능을 셧다운하시겠습니까?',
        confirmText: '앱 종료',
        cancelText: '취소',
        onConfirm: () => {
          shutdownAppCompletely();
        }
      });
    };
  }

  // 5-1. 전원 오프 화면 버튼들 바인딩
  const forceExitBtn = document.getElementById('btn-force-power-off-exit');
  if (forceExitBtn) {
    forceExitBtn.onclick = () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      } catch (e) {}
      try {
        window.open('', '_self', '');
        window.close();
      } catch (e) {}
      try { history.back(); } catch(e) {}
    };
  }

  const rebootBtn = document.getElementById('btn-power-off-reboot');
  if (rebootBtn) {
    rebootBtn.onclick = () => {
      window.location.reload();
    };
  }

  // 6. 상단 블루투스/오디오 장치 자동 감지 초기화
  initBluetoothAudioDetector();

  // 첫 사용자 상호작용 시 오디오 컨텍스트 기동
  document.body.addEventListener('click', () => {
    audioEngine.initContext();
  }, { once: true });
});

// ==================== GNB 물리 버튼 네비게이션 ====================
function setupGnbButtons() {
  const buttons = document.querySelectorAll('.gnb-mech-key');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      if (!targetView) return;

      audioEngine.playMechanicalClick();

      // 2번 문제 해결: 설정 버튼은 화면을 바꾸지 않고 깔끔한 설정 모달로 띄움!
      if (targetView === 'settings') {
        showSettingsModal();
        return;
      }

      // 버튼 눌림 상태 표시
      buttons.forEach(b => b.classList.remove('is-engaged'));
      btn.classList.add('is-engaged');

      // 도어 사운드
      if (targetView === 'player' || targetView === 'dashboard') {
        audioEngine.playTapeEject();
      }

      switchView(targetView);
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;

  const views = document.querySelectorAll('.deck-view');
  views.forEach(v => {
    v.classList.remove('active');
  });

  const activeView = document.querySelector(`.deck-view[data-view-panel="${viewName}"]`);
  if (activeView) {
    activeView.classList.add('active');
  }

  // 뷰별 렌더링 갱신
  if (viewName === 'dashboard') {
    renderDashboard();
  } else if (viewName === 'player') {
    renderPlayer();
  } else if (viewName === 'rack') {
    renderRack();
  }
}

// ==================== VFD 시계 타이머 ====================
function startClockTimer() {
  const clockEl = document.getElementById('vfd-clock-display');
  const update = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) {
      clockEl.textContent = `${h}:${m}:${s}`;
    }
  };
  update();
  setInterval(update, 1000);
}

// ==================== 테이프 데이터 로드 ====================
async function loadTapes() {
  try {
    state.tapes = await getAllTapes();
    if (state.tapes.length > 0 && !state.selectedTape) {
      state.selectedTape = state.tapes[0];
    }
    renderDashboard();
    renderRack();
    renderPlayer();
  } catch (err) {
    console.error('Failed to load tapes:', err);
  }
}

// ==================== VIEW 1: DASHBOARD ====================
function renderDashboard() {
  const stage = document.getElementById('dash-stage-container');
  const titleEl = document.getElementById('dash-tape-title');
  const artistEl = document.getElementById('dash-tape-artist');
  const dateEl = document.getElementById('dash-tape-date');
  const countEl = document.getElementById('dash-tape-count');
  const totalEl = document.getElementById('dash-total-tapes');

  const tape = state.selectedTape || state.tapes[0];
  if (!tape) return;

  if (stage) {
    stage.innerHTML = '';
    const cassette = createCassetteElement(tape, {
      size: 'large',
      isPlaying: state.isPlaying,
      progress: 0.15
    });
    stage.appendChild(cassette);
  }

  if (titleEl) titleEl.textContent = tape.title || 'Untitled';
  if (artistEl) artistEl.textContent = tape.artist || 'Unknown Artist';
  if (dateEl) dateEl.textContent = tape.recordedAt || '1988-00-00';
  if (countEl) countEl.textContent = `${tape.playCount || 0} 회`;
  if (totalEl) totalEl.textContent = `${state.tapes.length} 개`;

  // 대시보드 빠른 액션 바인딩
  const playNowBtn = document.getElementById('dash-btn-play-now');
  if (playNowBtn) {
    playNowBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      // GNB 플레이어 버튼 활성화
      document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
      document.querySelector('.gnb-mech-key[data-view="player"]')?.classList.add('is-engaged');
      switchView('player');
      startPlayback();
    };
  }

  const goRecBtn = document.getElementById('dash-btn-go-rec');
  if (goRecBtn) {
    goRecBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
      document.querySelector('.gnb-mech-key[data-view="studio"]')?.classList.add('is-engaged');
      switchView('studio');
    };
  }
}

// ==================== 국내가요 노래방 애창곡 & 최신 인기차트 TOP 50 데이터 ====================
export const CURATED_KARAOKE_DB = [
  { rank: 1, title: '나는 아픈 건 딱 질색이니까', artist: '(여자)아이들', vid: 'F033g9QJq0c', keywords: ['아픈건딱질색이니까', '아이들', '여자아이들', 'fate', 'ㄴㄴㅇㅍㄱㄸㅈㅅㅇㄴㄲ'] },
  { rank: 2, title: '첫 만남은 계획대로 되지 않아', artist: 'TWS (투어스)', vid: 'FqS2h5sM7_M', keywords: ['첫만남은', '투어스', 'tws', '첫만남은계획대로', 'ㅊㅁㄴㅇㄱㅎㄷㄹㄷㅈㅇㅇ'] },
  { rank: 3, title: '밤양갱', artist: '비비 (BIBI)', vid: '4kL_v_6p9oY', keywords: ['밤양갱', '비비', 'bibi', 'ㅂㅇㄱ'] },
  { rank: 4, title: '고민중독', artist: 'QWER', vid: 'ImuWa3SJulY', keywords: ['고민중독', 'qwer', 'ㄱㅁㅈㄷ'] },
  { rank: 5, title: '에피소드', artist: '이무진', vid: 'rD-cT-0Q_50', keywords: ['에피소드', '이무진', 'ㅇㅍㅅㄷ'] },
  { rank: 6, title: '사건의 지평선', artist: '윤하', vid: '1-4Y6n60P2o', keywords: ['사건의지평선', '윤하', 'ㅅㄱㅇㅈㅍㅅ'] },
  { rank: 7, title: '사랑은 늘 도망가', artist: '임영웅', vid: 'K_xTe4q2hP8', keywords: ['사랑은늘도망가', '임영웅', 'ㅅㄹㅇㄴㄷㅁㄱ'] },
  { rank: 8, title: '한 페이지가 될 수 있게', artist: 'DAY6 (데이식스)', vid: 'vnS_6zGheEg', keywords: ['한페이지가될수있게', '데이식스', 'day6', 'ㅎㅍㅇㅈㄱㄷㅅㅇㄱ'] },
  { rank: 9, title: 'Welcome to the Show', artist: 'DAY6 (데이식스)', vid: 'V0eGZ8hM0m8', keywords: ['웰컴투더쇼', 'welcometotheshow', 'day6', '데이식스'] },
  { rank: 10, title: '예뻤어', artist: 'DAY6 (데이식스)', vid: 'BS7tz2rAQUI', keywords: ['예뻤어', '데이식스', 'day6', 'ㅇㅃㅇ'] },
  { rank: 11, title: '비의 랩소디', artist: '임재현', vid: 'K9eE3d1i9m8', keywords: ['비의랩소디', '임재현', 'ㅂㅇㄹㅅㄷ'] },
  { rank: 12, title: '헤어지자 말해요', artist: '박재정', vid: 'D9E1eZfM8y8', keywords: ['헤어지자말해요', '박재정', 'ㅎㅇㅈㅈㅁㅎㅇ'] },
  { rank: 13, title: 'Supernova', artist: 'aespa (에스파)', vid: 'phuiAIQAxZ4', keywords: ['슈퍼노바', 'supernova', '에스파', 'aespa', 'ㅅㅍㄴㅂ'] },
  { rank: 14, title: 'Hype Boy', artist: 'NewJeans (뉴진스)', vid: '11cta61Wi0g', keywords: ['하입보이', 'hypeboy', '뉴진스', 'newjeans', 'ㅎㅇㅂㅇ'] },
  { rank: 15, title: 'Ditto', artist: 'NewJeans (뉴진스)', vid: 'pSUydWEq46E', keywords: ['디토', 'ditto', '뉴진스', 'newjeans', 'ㄷㅌ'] },
  { rank: 16, title: '서른 즈음에', artist: '김광석', vid: '4dHsW45mrfk', keywords: ['서른즈음에', '김광석', 'ㅅㄹㅈㅇㅁ'] },
  { rank: 17, title: '그대에게', artist: '신해철 (무한궤도)', vid: 'R9V4G0S7s-Q', keywords: ['그대에게', '신해철', '무한궤도', 'ㄱㄷㅇㄱ'] },
  { rank: 18, title: '가시', artist: '버즈 (Buzz)', vid: 'tOAn1IMGmK4', keywords: ['가시', '버즈', 'buzz', '민경훈', 'ㄱㅅ'] },
  { rank: 19, title: '좋니', artist: '윤종신', vid: 's1qYp3b_Q1Y', keywords: ['좋니', '윤종신', 'ㅈㄴ'] },
  { rank: 20, title: '응급실', artist: 'izi', vid: '1M4mYf_86nQ', keywords: ['응급실', 'izi', '이지', '쾌걸춘향', 'ㅇㄱㅅ'] },
  { rank: 21, title: '소주 한 잔', artist: '임창정', vid: 'y5cZJpPqY_w', keywords: ['소주한잔', '임창정', 'ㅅㅈㅎㅈ'] },
  { rank: 22, title: '야생화', artist: '박효신', vid: '_hsr0ST6Mrc', keywords: ['야생화', '박효신', 'ㅇㅅㅎ'] },
  { rank: 23, title: '너의 모든 순간', artist: '성시경', vid: 'sV9Q6v8o5a8', keywords: ['너의모든순간', '성시경', 'ㄴㅇㅁㄷㅅㄱ'] },
  { rank: 24, title: 'I AM', artist: 'IVE (아이브)', vid: '6ZUIwj3FlWY', keywords: ['아이엠', 'iam', '아이브', 'ive', 'ㅇㅇㅇ'] },
  { rank: 25, title: '신호등', artist: '이무진', vid: 'SK6Sm2Ki9tI', keywords: ['신호등', '이무진', 'ㅅㅎㄷ'] },
  { rank: 26, title: '취중고백', artist: '김민석 (멜로망스)', vid: 'aY7B0T_U1lU', keywords: ['취중고백', '김민석', '멜로망스', 'ㅊㅈㄱㅂ'] },
  { rank: 27, title: 'Love Lee', artist: 'AKMU (악뮤)', vid: 'EIz0GnyRRck', keywords: ['러브리', 'lovelee', '악뮤', 'akmu', 'ㄹㅂㄹ'] },
  { rank: 28, title: '어떻게 이별까지 사랑하겠어', artist: 'AKMU (악뮤)', vid: 'm3DZsBw5bnE', keywords: ['어떻게이별까지사랑하겠어', '악뮤', 'akmu', 'ㅇㄸㄱㅇㅂㄲㅈㅅㄹㅎㄱㅇ'] },
  { rank: 29, title: '모든 날, 모든 순간', artist: '폴킴', vid: 'o_WfP6j8t2o', keywords: ['모든날모든순간', '폴킴', 'ㅁㄷㄴㅁㄷㅅㄱ'] },
  { rank: 30, title: '사랑앓이', artist: 'FT아일랜드', vid: 'uOa7e4h2Tks', keywords: ['사랑앓이', 'ft아일랜드', '이홍기', 'ㅅㄹㅇㅇ'] },
  { rank: 31, title: 'Plastic Love', artist: 'Mariya Takeuchi', vid: '9Gj47G2e1Jc', keywords: ['plasticlove', '플라스틱러브', '시티팝', 'citypop', 'ㅍㄹㅅㅌㄹㅂ'] }
];

// 초성 추출 함수
export function getKoreanChosung(str) {
  if (!str) return '';
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code >= 0 && code <= 11171) {
      res += CHO[Math.floor(code / 588)];
    } else {
      res += str[i];
    }
  }
  return res;
}

// ==================== HTML 이스케이프 유틸 ====================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 전역 노래방 영상 & 오디오 상태
let currentKaraokeVideoId = 'R9V4G0S7s-Q'; // 신해철 그대에게 원곡 MR
let currentKaraokeTitle = '그대에게';
let currentKaraokeArtist = '신해철 (무한궤도)';
let isVideoFloating = false;

// 유튜브 IFrame 명령어 전송 헬퍼 (재생, 일시정지, 정지 등 인앱 동기화)
export function sendYouTubeCommand(funcName, args = '') {
  const frame = document.getElementById('karaoke-embed-frame');
  if (frame && frame.contentWindow) {
    try {
      frame.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: funcName,
        args: args
      }), '*');
    } catch (e) {}
  }
}

// ==================== 순수 인앱 유튜브 노래방 플레이어 (모바일 인라인 웹 재생 강제) ====================
export function loadKaraokeVideo(videoId, title = '', artist = '') {
  currentKaraokeVideoId = videoId;
  if (title) currentKaraokeTitle = title;
  if (artist) currentKaraokeArtist = artist;

  const karaokeFrame = document.getElementById('karaoke-embed-frame');
  const placeholder = document.getElementById('karaoke-placeholder');
  const lyricsMonitor = document.getElementById('karaoke-lyrics-monitor');
  const searchPicker = document.getElementById('karaoke-search-picker');

  if (searchPicker) searchPicker.style.display = 'none';
  if (lyricsMonitor) lyricsMonitor.style.display = 'none';
  if (placeholder) placeholder.style.display = 'none';

  // 모바일 브라우저 표준 유튜브 인앱 임베드 (playsinline 및 올바른 origin 강제)
  const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : 'https://dg1682-commits.github.io';
  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&origin=${encodeURIComponent(origin)}`;

  if (karaokeFrame) {
    karaokeFrame.setAttribute('playsinline', '1');
    karaokeFrame.setAttribute('webkit-playsinline', '1');
    karaokeFrame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    karaokeFrame.style.display = 'block';
    karaokeFrame.src = embedUrl;
  }

  const floatTitle = document.getElementById('in-app-window-track-title');
  if (floatTitle) {
    floatTitle.textContent = `${title || '노래방 영상'} - ${artist || ''}`;
  }

  const floatBtn = document.getElementById('studio-btn-toggle-float');
  const reopenBtn = document.getElementById('studio-btn-reopen-picker');
  if (floatBtn) {
    floatBtn.style.display = 'flex';
    floatBtn.innerHTML = isVideoFloating ? '<span>🖥️</span> 화면으로 도킹' : '<span>🪟</span> 인앱 창 띄우기';
  }
  if (reopenBtn) reopenBtn.style.display = 'flex';
}

// 어플 내 새창 (인앱 플로팅 윈도우) 띄우기
export function floatVideoInApp() {
  const win = document.getElementById('in-app-video-window');
  const body = document.getElementById('in-app-window-body');
  const embedFrame = document.getElementById('karaoke-embed-frame');
  const floatBtn = document.getElementById('studio-btn-toggle-float');

  if (!win || !body || !embedFrame) return;

  audioEngine.playMechanicalClick();
  isVideoFloating = true;

  body.appendChild(embedFrame);
  embedFrame.style.display = 'block';
  win.style.display = 'flex';

  if (floatBtn) {
    floatBtn.innerHTML = '<span>🖥️</span> 화면으로 도킹';
    floatBtn.onclick = dockVideoToMonitor;
  }

  setupFloatingWindowDrag();
}

// 플로팅 창을 다시 모니터 안으로 도킹 복귀
export function dockVideoToMonitor() {
  const win = document.getElementById('in-app-video-window');
  const monitorFrame = document.getElementById('studio-screen-frame');
  const embedFrame = document.getElementById('karaoke-embed-frame');
  const floatBtn = document.getElementById('studio-btn-toggle-float');

  if (!win || !monitorFrame || !embedFrame) return;

  audioEngine.playMechanicalClick();
  isVideoFloating = false;

  monitorFrame.appendChild(embedFrame);
  embedFrame.style.display = 'block';
  win.style.display = 'none';

  if (floatBtn) {
    floatBtn.innerHTML = '<span>🪟</span> 인앱 창 띄우기';
    floatBtn.onclick = floatVideoInApp;
  }
}

export function toggleFloatVideo() {
  if (isVideoFloating) {
    dockVideoToMonitor();
  } else {
    floatVideoInApp();
  }
}

// 인앱 플로팅 창 터치 & 마우스 드래그 이동 핸들러
let isDraggingFloat = false;
let dragStartX = 0, dragStartY = 0;
let initialWinLeft = 0, initialWinTop = 0;

function setupFloatingWindowDrag() {
  const header = document.getElementById('in-app-window-header');
  const win = document.getElementById('in-app-video-window');
  if (!header || !win || header._hasDragAttached) return;
  header._hasDragAttached = true;

  const onPointerDown = (e) => {
    isDraggingFloat = true;
    dragStartX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    dragStartY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

    const rect = win.getBoundingClientRect();
    initialWinLeft = rect.left;
    initialWinTop = rect.top;

    win.style.left = `${initialWinLeft}px`;
    win.style.top = `${initialWinTop}px`;
    win.style.right = 'auto';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!isDraggingFloat) return;
    if (e.cancelable) e.preventDefault();
    const curX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const curY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    const dx = curX - dragStartX;
    const dy = curY - dragStartY;

    const newLeft = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initialWinLeft + dx));
    const newTop = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 10, initialWinTop + dy));

    win.style.left = `${newLeft}px`;
    win.style.top = `${newTop}px`;
  };

  const onPointerUp = () => {
    isDraggingFloat = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  };

  header.addEventListener('pointerdown', onPointerDown);
  header.addEventListener('touchstart', onPointerDown, { passive: true });
}

// ==================== 노래방 버전 선택 모달 열기 & 인앱 렌더링 ====================
export function showKaraokePicker(query, candidates = []) {
  const picker = document.getElementById('karaoke-search-picker');
  const queryText = document.getElementById('picker-query-text');
  const listEl = document.getElementById('picker-results-list');
  if (!picker || !listEl) return;

  if (queryText) {
    queryText.textContent = `"${query}" 노래방 반주 선택`;
  }

  picker.style.display = 'flex';
  listEl.innerHTML = '';

  if (candidates.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
        <div style="font-size: 22px; margin-bottom: 6px;">⚠️</div>
        <div style="font-weight: bold; color: #f87171;">"${escapeHTML(query)}" 관련 반주를 자동으로 찾지 못했습니다.</div>
        <div style="margin-top: 6px; font-size: 10px; color: #718096; line-height: 1.5;">
          곡명이나 가수명을 더 간단하게 검색해보시거나, 상단의 [🎹 피치 테스트] 또는 [📁 MP3] 버튼을 눌러보세요.
        </div>
      </div>
    `;
    return;
  }

  // 퍼가기 허용/인앱 재생 보장 항목을 상단에 우선 정렬
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aPlayable = a.isPlayable !== false ? 1 : 0;
    const bPlayable = b.isPlayable !== false ? 1 : 0;
    return bPlayable - aPlayable;
  });

  sortedCandidates.forEach(item => {
    const row = document.createElement('div');
    const isPlaying = item.videoId === currentKaraokeVideoId;
    row.className = `picker-item ${isPlaying ? 'is-current-playing' : ''}`;

    let badgeClass = item.badgeType || '';
    if (!badgeClass) {
      if (/tj|티제이/i.test(item.badge || '')) badgeClass = 'badge-tj';
      else if (/ky|금영/i.test(item.badge || '')) badgeClass = 'badge-ky';
      else if (/재생 보장|보장|크리에이터/i.test(item.badge || '')) badgeClass = 'badge-playable';
      else if (/mr|가사/i.test(item.badge || '')) badgeClass = 'badge-mr';
      else badgeClass = 'badge-playable';
    }

    row.innerHTML = `
      <div class="picker-item-info">
        <div class="picker-item-title">${escapeHTML(item.title)}</div>
        <div class="picker-item-channel">
          <span class="picker-tag-badge ${badgeClass}">${escapeHTML(item.badge || '반주')}</span>
          <span>${escapeHTML(item.channel || '노래방')}</span>
        </div>
      </div>
      <div class="picker-actions-cell">
        <button class="btn-pick-embed" title="모니터 화면 내에서 재생">
          <span>📺</span> 화면 재생
        </button>
        <button class="btn-pick-popup" title="어플 안에서 자유롭게 떠다니는 인앱 창으로 재생">
          <span>🪟</span> 인앱 새창
        </button>
      </div>
    `;

    const embedBtn = row.querySelector('.btn-pick-embed');
    const floatBtn = row.querySelector('.btn-pick-popup');

    const selectEmbed = (e) => {
      if (e) e.stopPropagation();
      audioEngine.playMechanicalClick();
      hideKaraokePicker();
      loadKaraokeVideo(item.videoId, item.title, item.artist || query);
      dockVideoToMonitor();

      const searchInput = document.getElementById('studio-search-input');
      if (searchInput && item.artist) {
        searchInput.value = `${item.artist} - ${item.title.replace(/\[.*?\]|\(.*?\)/g, '').trim()}`;
      }
    };

    const selectFloat = (e) => {
      if (e) e.stopPropagation();
      audioEngine.playMechanicalClick();
      hideKaraokePicker();
      loadKaraokeVideo(item.videoId, item.title, item.artist || query);
      floatVideoInApp();

      const searchInput = document.getElementById('studio-search-input');
      if (searchInput && item.artist) {
        searchInput.value = `${item.artist} - ${item.title.replace(/\[.*?\]|\(.*?\)/g, '').trim()}`;
      }
    };

    row.onclick = selectEmbed;
    embedBtn.onclick = selectEmbed;
    floatBtn.onclick = selectFloat;

    listEl.appendChild(row);
  });
}

// 노래방 버전 선택 모달 닫기
export function hideKaraokePicker() {
  const picker = document.getElementById('karaoke-search-picker');
  if (picker) {
    picker.style.display = 'none';
  }
}

// 실시간 온라인 노래방 검색 (Invidious API & CORS 프록시 - 크리에이터 MR 및 가사 반주 동시 수집)
async function fetchOnlineKaraokeVideo(raw) {
  const clean = raw.trim();
  const searchQueries = [`${clean} MR 가사`, `${clean} 노래방`];
  const results = [];
  const seenIds = new Set();

  // 1. Invidious 공개 API 인스턴스들
  const invidiousInstances = [
    'https://inv.nadeko.net',
    'https://invidious.private.coffee',
    'https://invidious.protokolla.fi',
    'https://iv.melmac.space',
    'https://invidious.drgns.space'
  ];

  const parseAndAdd = (vid, rawTitle, channel) => {
    if (!vid || seenIds.has(vid)) return;
    seenIds.add(vid);
    const title = rawTitle || clean;
    let badge = '🟢 재생 보장 MR';
    let badgeType = 'badge-playable';
    let isPlayable = true;

    if (/tj|티제이/i.test(title) || /tj|티제이/i.test(channel || '')) {
      badge = '⚠️ TJ 노래방 (퍼가기 제한 가능)';
      badgeType = 'badge-tj';
      isPlayable = false;
    } else if (/ky|금영/i.test(title) || /ky|금영/i.test(channel || '')) {
      badge = '🟢 금영 노래방 (재생 보장)';
      badgeType = 'badge-ky';
      isPlayable = true;
    } else if (/mr|엠알|inst|가사|반주/i.test(title)) {
      badge = '🟢 크리에이터 MR (가사/재생 보장)';
      badgeType = 'badge-playable';
      isPlayable = true;
    } else {
      badge = '🟢 일반 반주 (재생 가능)';
      badgeType = 'badge-playable';
      isPlayable = true;
    }

    results.push({
      videoId: vid,
      title: title,
      channel: channel || 'YouTube Creator',
      badge: badge,
      badgeType: badgeType,
      isPlayable: isPlayable
    });
  };

  for (const q of searchQueries) {
    for (const base of invidiousInstances) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {
          signal: ctrl.signal
        });
        clearTimeout(tid);
        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              if (item.videoId) {
                parseAndAdd(item.videoId, item.title, item.author);
                if (results.length >= 8) break;
              }
            }
            if (results.length >= 5) break;
          }
        }
      } catch (e) {}
    }
    if (results.length >= 6) break;
  }

  // 2. AllOrigins / CORS 프록시로 YouTube 검색 결과 보강
  if (results.length < 4) {
    const proxies = [
      (q) => `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)}`,
      (q) => `https://corsproxy.io/?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)}`
    ];

    for (const q of searchQueries) {
      for (const proxyGen of proxies) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2500);
          const res = await fetch(proxyGen(q), { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            let html = '';
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              html = json.contents || '';
            } else {
              html = await res.text();
            }

            const videoMatches = [...html.matchAll(/"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g)];
            if (videoMatches.length > 0) {
              for (const m of videoMatches) {
                parseAndAdd(m[1], m[2], 'YouTube');
                if (results.length >= 8) break;
              }
            } else {
              const simpleMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
              for (const sm of simpleMatches) {
                parseAndAdd(sm[1], `${clean} 가사 반주 버전 ${results.length + 1}`, 'YouTube');
                if (results.length >= 5) break;
              }
            }
            if (results.length >= 4) break;
          }
        } catch (e) {}
      }
      if (results.length >= 6) break;
    }
  }

  return results.length > 0 ? results : null;
}

// 통합 검색 및 버전 선택 모달 띄우기 함수 (사용자가 직접 선택하여 재생)
export async function executeKaraokeSearch(raw) {
  if (!raw || !raw.trim()) {
    showRetroModal({
      title: '⚠️ SEARCH NOTICE',
      contentHTML: '곡명이나 가수명을 입력하거나 음성 버튼을 눌러 말씀해주세요.',
      confirmText: '확인'
    });
    return;
  }

  const query = raw.trim();
  audioEngine.playMechanicalClick();

  // 0. 유튜브 URL 링크 직접 입력된 경우 즉시 재생
  const ytMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    hideKaraokePicker();
    loadKaraokeVideo(ytMatch[1], '유튜브 노래방', 'YouTube Track');
    return;
  }

  // 1. 피커 모달 즉시 열고 검색 중 스피너 표시
  const picker = document.getElementById('karaoke-search-picker');
  const queryText = document.getElementById('picker-query-text');
  const listEl = document.getElementById('picker-results-list');
  if (picker && listEl) {
    picker.style.display = 'flex';
    if (queryText) queryText.textContent = `"${query}" 노래방 반주 선택`;
    listEl.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--vfd-cyan); font-size: 11px;">
        <div style="font-size: 24px; animation: spin 1s infinite linear; display: inline-block;">💿</div>
        <div style="margin-top: 8px; font-weight: bold; font-size: 12px;">"${escapeHTML(query)}" 노래방 반주 찾는 중...</div>
        <div style="font-size: 10px; color: #718096; margin-top: 4px;">TJ / 금영 / 크리에이터 MR 가사 반주 목록을 검색하고 있습니다.</div>
      </div>
    `;
  }

  const candidates = [];
  const seenIds = new Set();

  // 2. 내장 인기차트 & 노래방 DB 매칭 검사 (초성 및 키워드 검색 지원)
  const normQuery = query.toLowerCase().replace(/[\s\-_]/g, '');
  const queryChosung = getKoreanChosung(normQuery);

  const localMatches = CURATED_KARAOKE_DB.filter(song => {
    const normTitle = song.title.toLowerCase().replace(/[\s\-_]/g, '');
    const normArtist = song.artist.toLowerCase().replace(/[\s\-_]/g, '');
    const titleChosung = getKoreanChosung(normTitle);
    const artistChosung = getKoreanChosung(normArtist);

    return normTitle.includes(normQuery) || normQuery.includes(normTitle) ||
           normArtist.includes(normQuery) ||
           (queryChosung && (titleChosung.includes(queryChosung) || artistChosung.includes(queryChosung))) ||
           (song.keywords && song.keywords.some(k => normQuery.includes(k.toLowerCase().replace(/[\s\-_]/g, ''))));
  });

  localMatches.forEach((m, idx) => {
    if (!seenIds.has(m.vid)) {
      seenIds.add(m.vid);
      candidates.push({
        videoId: m.vid,
        title: `${m.title} - ${m.artist}`,
        artist: m.artist,
        channel: '고음질 MR 반주 (가사 지원 - 인앱 재생)',
        badge: '🟢 재생 보장 MR',
        badgeType: 'badge-playable',
        isPlayable: true
      });
    }
  });

  // 3. 온라인 실시간 노래방 검색
  try {
    const online = await fetchOnlineKaraokeVideo(query);
    if (online && online.length > 0) {
      online.forEach(item => {
        if (!seenIds.has(item.videoId)) {
          seenIds.add(item.videoId);
          candidates.push(item);
        }
      });
    }
  } catch (e) {
    console.warn('Online karaoke search error:', e);
  }

  // 4. 검색 결과가 없을 경우 추천 애창곡으로 자동 보강
  if (candidates.length === 0) {
    CURATED_KARAOKE_DB.slice(0, 5).forEach((song, idx) => {
      candidates.push({
        videoId: song.vid,
        title: `${song.title} - ${song.artist}`,
        artist: song.artist,
        channel: '추천 공인 노래방 반주',
        badge: '🟢 재생 보장 MR',
        badgeType: 'badge-playable',
        isPlayable: true
      });
    });
  }

  // 5. 피커 리스트 렌더링 (사용자가 직접 원하는 버전 선택)
  showKaraokePicker(query, candidates);
}

// 완전 전원 셧다운 함수
export function shutdownAppCompletely() {
  audioEngine.playMechanicalClick();

  // 1. 모든 오디오 엔진, 마이크 녹음 및 수음 하드웨어 강제 정지
  audioEngine.shutdownMicrophone();
  audioEngine.pause();
  audioEngine.toggleTapeHiss(false);
  audioEngine.stopVuMeter();
  if (audioEngine.ctx && audioEngine.ctx.state !== 'closed') {
    try {
      audioEngine.ctx.close();
    } catch (e) {}
  }

  // 2. 유튜브 노래방 iframe 완전 정지 및 제거 (백그라운드 소리 방지)
  const karaokeFrame = document.getElementById('karaoke-embed-frame');
  if (karaokeFrame) {
    karaokeFrame.src = 'about:blank';
    karaokeFrame.style.display = 'none';
  }

  // 3. 블랙 셧다운 오버레이 화면 전개
  const powerScreen = document.getElementById('deck-power-off-screen');
  if (powerScreen) {
    powerScreen.style.display = 'flex';
  }

  // 4. 네이티브 앱 종료 시도 & 전체화면 해제 (스마트폰 네비게이션 홈/뒤로가기 즉시 노출)
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  } catch (e) {}

  try {
    window.open('', '_self', '');
    window.close();
  } catch (e) {}

  try {
    history.back();
  } catch (e) {}
}

// ==================== 음성인식 (STT) 마이크 검색 ====================
function setupVoiceSearch(searchInput) {
  const voiceBtn = document.getElementById('studio-voice-btn');
  if (!voiceBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다';
    voiceBtn.onclick = () => {
      showRetroModal({
        title: '🎙️ VOICE SEARCH',
        contentHTML: '현재 브라우저에서 마이크 음성 인식이 지원되지 않습니다. Chrome 브라우저를 이용해주세요.',
        confirmText: '확인'
      });
    };
    return;
  }

  let recognition = null;
  let isListening = false;

  voiceBtn.onclick = () => {
    audioEngine.playMechanicalClick();

    if (isListening && recognition) {
      recognition.stop();
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListening = true;
        voiceBtn.classList.add('is-listening');
        voiceBtn.innerHTML = '<span>🔴</span> 듣는 중...';
        if (searchInput) searchInput.placeholder = '말씀해주세요... (예: 서른 즈음에)';
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (transcript) {
          if (searchInput) {
            searchInput.value = transcript;
            searchInput.blur();
          }
          executeKaraokeSearch(transcript);
        }
      };

      recognition.onerror = () => {
        isListening = false;
        voiceBtn.classList.remove('is-listening');
        voiceBtn.innerHTML = '<span>🎙️</span> 음성';
        if (searchInput) searchInput.placeholder = '곡명이나 가수명을 입력하세요';
      };

      recognition.onend = () => {
        isListening = false;
        voiceBtn.classList.remove('is-listening');
        voiceBtn.innerHTML = '<span>🎙️</span> 음성';
        if (searchInput) searchInput.placeholder = '곡명이나 가수명을 입력하세요';
      };

      recognition.start();
    } catch (err) {
      isListening = false;
      voiceBtn.classList.remove('is-listening');
      voiceBtn.innerHTML = '<span>🎙️</span> 음성';
    }
  };
}

// ==================== K-POP TOP 50 인기차트 컨트롤러 ====================
export function initKpopChart() {
  const listEl = document.getElementById('kpop-chart-list');
  const refreshBtn = document.getElementById('btn-refresh-kpop-chart');
  if (!listEl) return;

  // 캐시된 차트 로드 또는 기본 50곡 데이터 적용
  let chartData = CURATED_KARAOKE_DB;
  try {
    const cached = localStorage.getItem('kpop_top50_chart');
    if (cached) {
      chartData = JSON.parse(cached);
    }
  } catch (e) {}

  renderChartList(chartData);

  // 차트 새로고침 버튼 (원할 때만 1회성 동작 - 토큰 낭비 방지)
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      showChartRefreshModal();
    };
  }
}

function renderChartList(songs) {
  const listEl = document.getElementById('kpop-chart-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  songs.forEach(song => {
    const item = document.createElement('div');
    item.className = 'chart-item';

    let rankClass = '';
    if (song.rank === 1) rankClass = 'rank-1';
    else if (song.rank === 2) rankClass = 'rank-2';
    else if (song.rank === 3) rankClass = 'rank-3';
    else if (song.rank <= 10) rankClass = 'rank-top10';

    item.innerHTML = `
      <span class="chart-rank ${rankClass}">${song.rank}</span>
      <div class="chart-info">
        <span class="chart-song-title">${song.title}</span>
        <span class="chart-song-artist">${song.artist}</span>
      </div>
      <button class="chart-sing-btn" title="이 노래 바로 부르기">
        <span>🎤</span> 부르기
      </button>
    `;

    const singBtn = item.querySelector('.chart-sing-btn');
    singBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      // 스튜디오 뷰로 즉시 전환
      document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
      document.querySelector('.gnb-mech-key[data-view="studio"]')?.classList.add('is-engaged');
      switchView('studio');

      // 검색창에 곡명 세팅
      const searchInput = document.getElementById('studio-search-input');
      if (searchInput) searchInput.value = `${song.artist} - ${song.title}`;

      // 검증된 비디오 ID가 있으면 즉시 인앱 모니터 재생
      if (song.vid) {
        loadKaraokeVideo(song.vid, song.title, song.artist);
      } else {
        executeKaraokeSearch(`${song.artist} ${song.title}`);
      }
    };

    listEl.appendChild(item);
  });
}

function showChartRefreshModal() {
  const savedKey = localStorage.getItem('gemini_api_key') || '';
  showRetroModal({
    title: '🔥 K-POP CHART UPDATE',
    contentHTML: `
      <div style="font-size: 12px; line-height: 1.6;">
        <p><strong>가요 인기차트 TOP 50 최신 갱신</strong></p>
        <p style="font-size: 10px; color: #94a3b8; margin-top: 4px;">
          * 토큰 낭비를 방지하기 위해 자동 호출되지 않으며, 원하실 때만 1회성으로 갱신됩니다.
        </p>
        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          <button id="modal-btn-builtin-chart" class="modal-action-btn" style="width: 100%; height: 34px; background: #0284c7; color: #fff; font-weight: bold;">
            ⭐ 최신 공인 가요 차트 바로 적용 (0 토큰 / 즉시 갱신)
          </button>
          <div style="border-top: 1px dashed #282f40; margin: 6px 0; padding-top: 8px;">
            <label style="font-size: 10px; color: #64748b;">Gemini AI API 키 (선택 사항):</label>
            <input type="password" id="modal-gemini-key" class="studio-input" placeholder="Google AI Studio API Key (AI 토큰 생성 시 사용)" value="${savedKey}" style="width: 100%; margin-top: 4px;" />
            <button id="modal-btn-ai-chart" class="modal-action-btn" style="width: 100%; height: 34px; background: #1e2434; color: var(--vfd-cyan); font-weight: bold; margin-top: 6px;">
              ✨ Gemini AI 실시간 차트 생성 (AI 토큰 1회 사용)
            </button>
          </div>
        </div>
      </div>
    `,
    confirmText: '닫기'
  });

  setTimeout(() => {
    const builtinBtn = document.getElementById('modal-btn-builtin-chart');
    if (builtinBtn) {
      builtinBtn.onclick = () => {
        audioEngine.playMechanicalClick();
        localStorage.removeItem('kpop_top50_chart');
        renderChartList(CURATED_KARAOKE_DB);
        closeRetroModal();
      };
    }

    const aiBtn = document.getElementById('modal-btn-ai-chart');
    if (aiBtn) {
      aiBtn.onclick = async () => {
        audioEngine.playMechanicalClick();
        const key = document.getElementById('modal-gemini-key')?.value.trim();
        if (!key) {
          alert('Gemini API 키를 입력해주세요. 없으신 경우 상단의 [최신 공인 가요 차트 바로 적용]을 누르시면 됩니다.');
          return;
        }
        localStorage.setItem('gemini_api_key', key);
        aiBtn.textContent = '⏳ AI 차트 생성 중...';
        aiBtn.disabled = true;

        try {
          const prompt = '대한민국 노래방 및 멜론 국내가요 최신 인기차트 TOP 50 목록을 JSON으로 출력해줘. JSON 외 다른 텍스트는 출력하지 마. 형식: [{"rank": 1, "title": "곡명", "artist": "가수명"}]';
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localStorage.setItem('kpop_top50_chart', JSON.stringify(parsed));
              renderChartList(parsed);
              closeRetroModal();
              return;
            }
          }
          throw new Error('AI 응답 파싱 실패');
        } catch (err) {
          alert('AI 차트 생성 중 오류가 발생했습니다: ' + err.message);
          aiBtn.textContent = '✨ Gemini AI 실시간 차트 생성 (AI 토큰 1회 사용)';
          aiBtn.disabled = false;
        }
      };
    }
  }, 100);
}

// ==================== VIEW 2: STUDIO (노래/녹음 모드) ====================
function setupStudioControls() {
  const searchInput = document.getElementById('studio-search-input');
  const searchBtn = document.getElementById('studio-search-btn');

  // 추천곡 칩 클릭 이벤트 (즉시 인앱 모니터 재생)
  document.querySelectorAll('.karaoke-chip').forEach(chip => {
    chip.onclick = () => {
      audioEngine.playMechanicalClick();
      const title = chip.dataset.title;
      const artist = chip.dataset.artist;
      const vid = chip.dataset.vid;
      if (searchInput) {
        searchInput.value = `${artist} - ${title}`;
        searchInput.blur();
      }
      if (vid) {
        loadKaraokeVideo(vid, title, artist);
      } else {
        executeKaraokeSearch(`${artist} ${title}`);
      }
    };
  });

  // 검색 버튼 및 엔터키 이벤트 (즉시 검색 & 모바일 가상키보드 내리기)
  if (searchBtn && searchInput) {
    searchBtn.onclick = () => {
      searchInput.blur();
      executeKaraokeSearch(searchInput.value);
    };
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchInput.blur();
        executeKaraokeSearch(searchInput.value);
      }
    };
  }

  // 마이크 음성인식 (STT) 검색 세팅
  setupVoiceSearch(searchInput);

  // 에코 및 볼륨 슬라이더
  const echoSlider = document.getElementById('studio-slider-echo');
  if (echoSlider) {
    echoSlider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      state.studioEcho = val;
      audioEngine.setMicEcho(val);
    };
  }

  const micVolSlider = document.getElementById('studio-slider-mic');
  if (micVolSlider) {
    micVolSlider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      state.studioMicVol = val;
      audioEngine.setMicVolume(val);
    };
  }

  // ==================== 7번 & 3번 요구사항: 녹음 모드 전환 & 타이머 & 3대 버튼 ====================
  const studioView = document.getElementById('studio-view-container');
  const launchRecBtn = document.getElementById('studio-btn-launch');
  const liveTimerEl = document.getElementById('live-rec-timer');
  const livePauseBtn = document.getElementById('studio-live-btn-pause');
  const livePauseIcon = document.getElementById('live-pause-icon');
  const livePauseLabel = document.getElementById('live-pause-label');
  const liveCancelBtn = document.getElementById('studio-live-btn-cancel');
  const liveFinishBtn = document.getElementById('studio-live-btn-finish');

  let recTimerInterval = null;
  let recSeconds = 0;
  let isRecPaused = false;

  const startRecTimer = () => {
    clearInterval(recTimerInterval);
    recSeconds = 0;
    if (liveTimerEl) liveTimerEl.textContent = '00:00';
    recTimerInterval = setInterval(() => {
      if (!isRecPaused) {
        recSeconds++;
        if (liveTimerEl) liveTimerEl.textContent = formatTime(recSeconds);
      }
    }, 1000);
  };

  const stopRecTimer = () => {
    clearInterval(recTimerInterval);
  };

  // [노래 시작!] 클릭 시 -> 2/3 대형 뷰 전환 & 녹음 시작
  if (launchRecBtn) {
    launchRecBtn.onclick = async () => {
      audioEngine.playMechanicalClick();

      try {
        await audioEngine.startRecording();
        state.isRecording = true;
        isRecPaused = false;

        // 7번 요구사항: 스튜디오 뷰에 대형 레이아웃 클래스 부여 (영상 2/3 확장)
        if (studioView) {
          studioView.classList.add('studio-recording-mode');
        }

        startRecTimer();

        // 유튜브 영상 인라인 자동 시작 동기화
        sendYouTubeCommand('playVideo');

        // 일시정지 버튼 초기화
        if (livePauseBtn) livePauseBtn.classList.remove('is-paused');
        if (livePauseIcon) livePauseIcon.textContent = '❚❚';
        if (livePauseLabel) livePauseLabel.textContent = '일시정지';

      } catch (err) {
        showRetroModal({
          title: '❌ 마이크 권한 필요',
          contentHTML: `
            <p>마이크 수음 권한이 필요합니다.</p>
            <p style="font-size: 11px; color: #a0aec0; margin-top: 6px;">브라우저 상단의 마이크 권한을 허용해주세요.</p>
          `,
          confirmText: '확인'
        });
      }
    };
  }

  // 1. [❚❚ 일시정지 / ▶ 계속] 버튼
  if (livePauseBtn) {
    livePauseBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      if (!isRecPaused) {
        // 일시정지 상태로 변경
        audioEngine.pauseRecording();
        sendYouTubeCommand('pauseVideo');
        isRecPaused = true;
        livePauseBtn.classList.add('is-paused');
        if (livePauseIcon) livePauseIcon.textContent = '▶';
        if (livePauseLabel) livePauseLabel.textContent = '계속 부르기';
      } else {
        // 녹음 재개
        audioEngine.resumeRecording();
        sendYouTubeCommand('playVideo');
        isRecPaused = false;
        livePauseBtn.classList.remove('is-paused');
        if (livePauseIcon) livePauseIcon.textContent = '❚❚';
        if (livePauseLabel) livePauseLabel.textContent = '일시정지';
      }
    };
  }

  // 2. [■ 취소/리셋] 버튼
  if (liveCancelBtn) {
    liveCancelBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      showRetroModal({
        title: '⚠️ 녹음 취소',
        contentHTML: '현재 녹음 중인 오디오를 버리고 처음으로 돌아가시겠습니까?',
        confirmText: '녹음 버리기',
        cancelText: '계속 노래하기',
        onConfirm: () => {
          stopRecTimer();
          sendYouTubeCommand('pauseVideo');
          audioEngine.cancelRecording();
          state.isRecording = false;
          if (studioView) studioView.classList.remove('studio-recording-mode');
        }
      });
    };
  }

  // 3. [✓ 노래 완료 및 테이프 저장] 버튼
  if (liveFinishBtn) {
    liveFinishBtn.onclick = async () => {
      audioEngine.playMechanicalClick();
      stopRecTimer();
      sendYouTubeCommand('pauseVideo');
      const blob = await audioEngine.stopRecording();
      state.isRecording = false;
      if (studioView) studioView.classList.remove('studio-recording-mode');

      // 저장 모달 팝업
      const titleVal = currentKaraokeTitle || (searchInput ? searchInput.value.trim() : '나의 노래방');
      const artistVal = currentKaraokeArtist || '원곡 가수';
      promptSaveTapeModal(titleVal, blob, artistVal);
    };
  }

  // ==================== 노래방 버전 피커 & 서브 툴바 버튼 바인딩 ====================
  const pickerCloseBtn = document.getElementById('picker-btn-close');
  if (pickerCloseBtn) {
    pickerCloseBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      hideKaraokePicker();
    };
  }

  const reopenPickerBtn = document.getElementById('studio-btn-reopen-picker');
  if (reopenPickerBtn) {
    reopenPickerBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      const q = searchInput?.value.trim() || currentKaraokeTitle || '노래방';
      executeKaraokeSearch(q);
    };
  }

  // 인앱 플로팅 윈도우 토글 버튼
  const floatToggleBtn = document.getElementById('studio-btn-toggle-float');
  if (floatToggleBtn) {
    floatToggleBtn.onclick = () => {
      toggleFloatVideo();
    };
  }

  // 플로팅 윈도우 도킹 복귀 버튼
  const dockBtn = document.getElementById('btn-dock-video');
  if (dockBtn) {
    dockBtn.onclick = () => {
      dockVideoToMonitor();
    };
  }

  // 플로팅 윈도우 닫기 버튼
  const closeFloatBtn = document.getElementById('btn-close-float-window');
  if (closeFloatBtn) {
    closeFloatBtn.onclick = () => {
      dockVideoToMonitor();
    };
  }

}

// 녹음 완료 후 저장 정보 입력 모달
function promptSaveTapeModal(defaultTitle, audioBlob, defaultArtist = '원곡 가수') {
  const formHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div>
        <label style="font-size: 11px; color: #a0aec0; display: block; margin-bottom: 4px;">노래 제목</label>
        <input id="modal-save-title" type="text" value="${defaultTitle}" class="studio-input" style="width: 100%;" />
      </div>
      <div>
        <label style="font-size: 11px; color: #a0aec0; display: block; margin-bottom: 4px;">원곡 가수</label>
        <input id="modal-save-artist" type="text" value="${defaultArtist}" class="studio-input" style="width: 100%;" />
      </div>
      <div>
        <label style="font-size: 11px; color: #a0aec0; display: block; margin-bottom: 4px;">플레이리스트 폴더</label>
        <select id="modal-save-folder" class="setting-select" style="width: 100%;">
          <option value="가요">가요</option>
          <option value="POP">POP</option>
          <option value="발라드">발라드</option>
          <option value="애창곡">애창곡</option>
        </select>
      </div>
    </div>
  `;

  showRetroModal({
    title: '💾 CASSETTE RECORDING SAVED',
    contentHTML: formHTML,
    confirmText: '테이프 굽기 (파이어베이스 저장)',
    cancelText: '취소',
    onConfirm: async () => {
      const title = document.getElementById('modal-save-title')?.value.trim() || defaultTitle;
      const artist = document.getElementById('modal-save-artist')?.value.trim() || '나의 노래방';
      const folder = document.getElementById('modal-save-folder')?.value || '가요';

      const newTapeData = {
        title,
        artist,
        folder,
        keyShift: state.studioKeyShift,
        recordedAt: new Date().toISOString().split('T')[0]
      };

      try {
        const savedTape = await saveTape(newTapeData, audioBlob);
        state.tapes.unshift(savedTape);
        state.selectedTape = savedTape;

        // 랙, 대시보드, 플레이어 즉각 동기화 갱신
        renderRack();
        renderDashboard();
        renderPlayer();

        showRetroModal({
          title: '✨ SAVED TO CLOUD',
          contentHTML: `
            <p><strong>[${escapeHTML(title)}]</strong> 테이프가 파이어베이스 클라우드에 성공적으로 구워졌습니다!</p>
            <p style="font-size: 11px; color: #7b8599; margin-top: 6px;">플레이어 또는 테이프 랙에서 언제든지 감상하실 수 있습니다.</p>
          `,
          confirmText: '테이프 랙(RACK)에서 확인',
          cancelText: '플레이어로 이동',
          onConfirm: () => {
            document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
            document.querySelector('.gnb-mech-key[data-view="rack"]')?.classList.add('is-engaged');
            switchView('rack');
          },
          onCancel: () => {
            document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
            document.querySelector('.gnb-mech-key[data-view="player"]')?.classList.add('is-engaged');
            switchView('player');
            startPlayback();
          }
        });
      } catch (err) {
        showRetroModal({
          title: '⚠️ SAVE ERROR',
          contentHTML: '파이어베이스 저장 중 오류가 발생했습니다. 로컬 데이터베이스에 임시 보관됩니다.',
          confirmText: '확인'
        });
      }
    }
  });
}

// ==================== VIEW 3: PLAYER (오디오 플레이어) ====================
let playerCassetteEl = null;

function renderPlayer() {
  const bay = document.getElementById('player-tape-bay');
  const titleEl = document.getElementById('player-track-title');
  const artistEl = document.getElementById('player-track-artist');

  const tape = state.selectedTape || state.tapes[0];
  if (!tape) return;

  if (bay) {
    bay.innerHTML = '';
    playerCassetteEl = createCassetteElement(tape, {
      size: 'large',
      isPlaying: state.isPlaying,
      progress: 0
    });
    bay.appendChild(playerCassetteEl);
  }

  if (titleEl) titleEl.textContent = tape.title || 'Untitled';
  if (artistEl) artistEl.textContent = tape.artist || 'Unknown';

  if (tape.audioUrl) {
    audioEngine.loadAudioSource(tape.audioUrl);
  }
}

function setupPlayerControls() {
  const playBtn = document.getElementById('transport-btn-play');
  const pauseBtn = document.getElementById('transport-btn-pause');
  const rewBtn = document.getElementById('transport-btn-rew');
  const ffBtn = document.getElementById('transport-btn-ff');
  const stopBtn = document.getElementById('transport-btn-stop');
  const seekSlider = document.getElementById('player-seek-slider');
  const curTimeEl = document.getElementById('player-time-current');
  const durTimeEl = document.getElementById('player-time-duration');
  const counterDigits = document.getElementById('player-counter-digits');

  if (playBtn) {
    playBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      startPlayback();
    };
  }

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      pausePlayback();
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      stopPlayback();
    };
  }

  if (rewBtn) {
    rewBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      if (audioEngine.audioElement) {
        audioEngine.seek(audioEngine.audioElement.currentTime - 10);
      }
    };
  }

  if (ffBtn) {
    ffBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      if (audioEngine.audioElement) {
        audioEngine.seek(audioEngine.audioElement.currentTime + 10);
      }
    };
  }

  if (seekSlider) {
    seekSlider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      if (audioEngine.audioElement && audioEngine.audioElement.duration) {
        audioEngine.seek((val / 100) * audioEngine.audioElement.duration);
      }
    };
  }

  // 오디오 타임 업데이트 이벤트
  audioEngine.audioElement.ontimeupdate = () => {
    const cur = audioEngine.audioElement.currentTime || 0;
    const dur = audioEngine.audioElement.duration || 1;
    const ratio = cur / dur;

    if (seekSlider) seekSlider.value = ratio * 100;
    if (curTimeEl) curTimeEl.textContent = formatTime(cur);
    if (durTimeEl && !isNaN(dur)) durTimeEl.textContent = formatTime(dur);

    // 카세트 카운터 4자리 (0000 ~ 9999)
    if (counterDigits) {
      const count = Math.floor(cur * 10) % 10000;
      counterDigits.textContent = String(count).padStart(4, '0');
    }

    // 테이프 릴 두께 & 회전 갱신
    if (playerCassetteEl) {
      updateCassetteState(playerCassetteEl, ratio, state.isPlaying);
    }
  };

  audioEngine.audioElement.onended = () => {
    state.isPlaying = false;
    if (playerCassetteEl) updateCassetteState(playerCassetteEl, 1, false);
    audioEngine.stopVuMeter();
  };
}

let virtualTimer = null;
let virtualCurrentSec = 0;

function startPlayback() {
  state.isPlaying = true;
  const playBtn = document.getElementById('transport-btn-play');
  if (playBtn) playBtn.classList.add('btn-play-engaged');

  if (state.selectedTape && state.selectedTape.id) {
    incrementTapePlayCount(state.selectedTape.id);
  }

  // 실제 음원이 있는 경우 오디오 엘리먼트 재생
  if (audioEngine.audioElement && audioEngine.audioElement.src && audioEngine.audioElement.src !== window.location.href) {
    audioEngine.play().catch(e => console.warn('Audio play error:', e));
  } else {
    // 가상 데모 재생 타이머 구동
    clearInterval(virtualTimer);
    const dur = (state.selectedTape && state.selectedTape.duration) ? state.selectedTape.duration : 240;
    const seekSlider = document.getElementById('player-seek-slider');
    const curTimeEl = document.getElementById('player-time-current');
    const durTimeEl = document.getElementById('player-time-duration');
    const counterDigits = document.getElementById('player-counter-digits');

    if (durTimeEl) durTimeEl.textContent = formatTime(dur);

    virtualTimer = setInterval(() => {
      if (!state.isPlaying) {
        clearInterval(virtualTimer);
        return;
      }
      virtualCurrentSec += 1;
      if (virtualCurrentSec > dur) {
        stopPlayback();
        return;
      }
      const ratio = virtualCurrentSec / dur;
      if (seekSlider) seekSlider.value = ratio * 100;
      if (curTimeEl) curTimeEl.textContent = formatTime(virtualCurrentSec);
      if (counterDigits) {
        const count = Math.floor(virtualCurrentSec * 10) % 10000;
        counterDigits.textContent = String(count).padStart(4, '0');
      }
      if (playerCassetteEl) {
        updateCassetteState(playerCassetteEl, ratio, true);
      }
    }, 1000);
  }

  if (playerCassetteEl) {
    updateCassetteState(playerCassetteEl, virtualCurrentSec ? (virtualCurrentSec / 240) : 0.1, true);
  }
}

function pausePlayback() {
  state.isPlaying = false;
  clearInterval(virtualTimer);
  const playBtn = document.getElementById('transport-btn-play');
  if (playBtn) playBtn.classList.remove('btn-play-engaged');

  audioEngine.pause();
  audioEngine.stopVuMeter();

  if (playerCassetteEl) {
    updateCassetteState(playerCassetteEl, virtualCurrentSec ? (virtualCurrentSec / 240) : 0.1, false);
  }
}

function stopPlayback() {
  pausePlayback();
  virtualCurrentSec = 0;
  audioEngine.seek(0);
  const curTimeEl = document.getElementById('player-time-current');
  const seekSlider = document.getElementById('player-seek-slider');
  const counterDigits = document.getElementById('player-counter-digits');
  if (curTimeEl) curTimeEl.textContent = '00:00';
  if (seekSlider) seekSlider.value = 0;
  if (counterDigits) counterDigits.textContent = '0000';

  if (playerCassetteEl) {
    updateCassetteState(playerCassetteEl, 0, false);
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ==================== VIEW 4: RACK / LIST (CSS Scroll Snap) ====================
function renderRack() {
  const shelf = document.getElementById('rack-shelf-container');
  if (!shelf) return;

  shelf.innerHTML = '';

  const filtered = state.tapes.filter(t => {
    if (state.currentFilter === 'all') return true;
    if (state.currentFilter === 'favorite') return !!t.isFavorite;
    return t.folder === state.currentFilter;
  });

  if (filtered.length === 0) {
    shelf.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: #94a3b8;">
        <div style="font-size: 32px; margin-bottom: 8px;">📼</div>
        <div style="font-size: 13px; font-weight: bold; color: #cbd5e1;">보관된 테이프가 없습니다.</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
          ${state.currentFilter === 'favorite' ? '★ 별표를 눌러 즐겨찾기에 테이프를 추가해보세요!' : '[● REC / SING] 메뉴에서 새로운 노래를 녹음해보세요!'}
        </div>
      </div>
    `;
    return;
  }

  filtered.forEach(tape => {
    const slot = document.createElement('div');
    slot.className = 'rack-snap-slot';
    slot.dataset.id = tape.id;

    // 1. 상단 툴바 (폴더 배지 + 즐겨찾기 별표 버튼 + 삭제 버튼)
    const toolbar = document.createElement('div');
    toolbar.className = 'rack-slot-toolbar';
    toolbar.innerHTML = `
      <span class="rack-slot-tag">${escapeHTML(tape.folder || '가요')}</span>
      <div class="rack-slot-actions">
        <button class="rack-star-btn ${tape.isFavorite ? 'is-fav' : ''}" title="${tape.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">
          ${tape.isFavorite ? '★' : '☆'}
        </button>
        <button class="rack-del-btn" title="테이프 영구 삭제">🗑️</button>
      </div>
    `;

    // 2. 카세트 비주얼
    const cassette = createCassetteElement(tape, {
      size: 'medium',
      isPlaying: false,
      progress: 0.2
    });

    // 3. 하단 트랙 정보 및 즉시 재생 바
    const playBar = document.createElement('div');
    playBar.className = 'rack-slot-play-bar';
    playBar.innerHTML = `
      <div class="rack-slot-meta">
        <span class="rack-meta-title">${escapeHTML(tape.title || 'Untitled')}</span>
        <span class="rack-meta-artist">${escapeHTML(tape.artist || '가수 미상')} (${tape.recordedAt || ''})</span>
      </div>
      <button class="rack-play-now-btn">
        <span>▶</span> 재생
      </button>
    `;

    slot.appendChild(toolbar);
    slot.appendChild(cassette);
    slot.appendChild(playBar);

    // 즐겨찾기(별표) 토글 이벤트
    const starBtn = toolbar.querySelector('.rack-star-btn');
    starBtn.onclick = async (e) => {
      e.stopPropagation();
      audioEngine.playMechanicalClick();
      const newStatus = await toggleTapeFavorite(tape.id, !!tape.isFavorite);
      tape.isFavorite = newStatus;
      starBtn.classList.toggle('is-fav', newStatus);
      starBtn.textContent = newStatus ? '★' : '☆';
      starBtn.title = newStatus ? '즐겨찾기 해제' : '즐겨찾기 추가';
      if (state.currentFilter === 'favorite') {
        renderRack();
      }
    };

    // 삭제 버튼 이벤트
    const delBtn = toolbar.querySelector('.rack-del-btn');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      audioEngine.playMechanicalClick();
      showRetroModal({
        title: '🗑️ TAPE DISPOSAL',
        contentHTML: `
          <p><strong>[${escapeHTML(tape.title)}]</strong> 테이프를 영구 삭제하시겠습니까?</p>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 6px;">클라우드와 기기에서 모두 삭제되며 되돌릴 수 없습니다.</p>
        `,
        confirmText: '삭제',
        cancelText: '취소',
        onConfirm: async () => {
          await deleteTape(tape.id, tape.storagePath);
          state.tapes = state.tapes.filter(t => t.id !== tape.id);
          if (state.selectedTape && state.selectedTape.id === tape.id) {
            state.selectedTape = state.tapes[0] || null;
          }
          renderRack();
          renderDashboard();
          renderPlayer();
        }
      });
    };

    // 재생 함수 (카세트 본체 또는 하단 재생 버튼 클릭)
    const playThisTape = (e) => {
      if (e) e.stopPropagation();
      audioEngine.playMechanicalClick();
      state.selectedTape = tape;
      document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
      document.querySelector('.gnb-mech-key[data-view="player"]')?.classList.add('is-engaged');
      switchView('player');
      startPlayback();
    };

    cassette.onclick = playThisTape;
    playBar.onclick = playThisTape;

    shelf.appendChild(slot);
  });

  // IntersectionObserver로 중앙에 스냅된 테이프 감지
  setupRackSnapObserver();
}

function setupRackSnapObserver() {
  const shelf = document.getElementById('rack-shelf-container');
  if (!shelf) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
        // 모든 슬롯의 포커스 해제
        shelf.querySelectorAll('.rack-snap-slot').forEach(s => s.classList.remove('slot-focused'));
        entry.target.classList.add('slot-focused');

        // 포커스된 테이프의 릴을 살짝 돌려주는 인터랙션
        const cassette = entry.target.querySelector('.cassette-wrapper');
        if (cassette) {
          updateCassetteState(cassette, 0.3, true);
          setTimeout(() => {
            updateCassetteState(cassette, 0.3, false);
          }, 800);
        }
      }
    });
  }, {
    root: shelf,
    threshold: 0.75
  });

  shelf.querySelectorAll('.rack-snap-slot').forEach(slot => {
    observer.observe(slot);
  });
}

function setupRackControls() {
  const filterBtns = document.querySelectorAll('.rack-filter-tab');
  filterBtns.forEach(btn => {
    btn.onclick = () => {
      audioEngine.playMechanicalClick();
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter || 'all';
      renderRack();
    };
  });
}

// ==================== VIEW 5: SETTINGS ====================
function setupSettingsControls() {
  const changelogBtn = document.getElementById('btn-view-changelog');
  if (changelogBtn) {
    changelogBtn.onclick = () => {
      showChangelogModal();
    };
  }

  // 테마 선택
  const themeSelect = document.getElementById('setting-theme-select');
  if (themeSelect) {
    themeSelect.onchange = (e) => {
      audioEngine.playMechanicalClick();
      document.body.setAttribute('data-theme', e.target.value);
    };
  }

  // 테이프 히스(모터 노이즈) 토글
  const hissToggle = document.getElementById('setting-hiss-toggle');
  if (hissToggle) {
    hissToggle.onchange = (e) => {
      audioEngine.playMechanicalClick();
      audioEngine.toggleTapeHiss(e.target.checked);
    };
  }
}

// ==================== STEREO VU METER UI UPDATE ====================
function updateVuMeterUI(leftPercent, rightPercent) {
  const leftSegments = document.querySelectorAll('#vu-ch-l .vu-segment');
  const rightSegments = document.querySelectorAll('#vu-ch-r .vu-segment');

  renderSegmentBar(leftSegments, leftPercent);
  renderSegmentBar(rightSegments, rightPercent);
}

function renderSegmentBar(segments, percent) {
  if (!segments || segments.length === 0) return;
  const count = segments.length;
  const activeCount = Math.round((percent / 100) * count);

  segments.forEach((seg, idx) => {
    seg.classList.remove('lit-green', 'lit-amber', 'lit-red');
    if (idx < activeCount) {
      if (idx < count - 4) {
        seg.classList.add('lit-green');
      } else if (idx < count - 2) {
        seg.classList.add('lit-amber');
      } else {
        seg.classList.add('lit-red');
      }
    }
  });
}

// ==================== FULLSCREEN TOGGLE (주소창 숨기기) ====================
function toggleAppFullscreen() {
  const doc = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (doc.requestFullscreen) {
      doc.requestFullscreen().catch(err => console.warn(err));
    } else if (doc.webkitRequestFullscreen) {
      doc.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.warn(err));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

// ==================== 6번: 블루투스/오디오 장치 자동 감지 ====================
async function initBluetoothAudioDetector() {
  const deviceNameEl = document.getElementById('bt-device-name');
  const iconEl = document.getElementById('bt-icon');

  const updateDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        if (deviceNameEl) deviceNameEl.textContent = '내장 오디오';
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      let foundBt = null;

      for (const dev of devices) {
        const label = (dev.label || '').trim();
        const l = label.toLowerCase();
        if (l.includes('bluetooth') || l.includes('buds') || l.includes('airpods') || l.includes('car') || l.includes('hands-free') || l.includes('wireless') || l.includes('bt') || l.includes('headset')) {
          foundBt = label;
          break;
        }
      }

      // 첫 번째 활성 오디오 입력/출력 라벨이 있는 경우 표시
      if (!foundBt) {
        const anyAudio = devices.find(d => (d.kind === 'audioinput' || d.kind === 'audiooutput') && d.label);
        if (anyAudio && anyAudio.label) {
          foundBt = anyAudio.label;
        }
      }

      if (foundBt) {
        const l = foundBt.toLowerCase();
        if (l.includes('car')) {
          if (iconEl) iconEl.textContent = '🚗';
        } else if (l.includes('mic') || l.includes('마이크')) {
          if (iconEl) iconEl.textContent = '🎤';
        } else {
          if (iconEl) iconEl.textContent = '🎧';
        }

        // 라벨 정리 (너무 길면 잘라내기)
        let display = foundBt.replace(/default - /i, '').replace(/communications - /i, '');
        if (display.length > 12) {
          display = display.substring(0, 10) + '..';
        }
        if (deviceNameEl) deviceNameEl.textContent = display;
      } else {
        if (iconEl) iconEl.textContent = '📱';
        if (deviceNameEl) deviceNameEl.textContent = '내장 오디오';
      }
    } catch (e) {
      console.warn('Bluetooth/Audio device detect error:', e);
      if (deviceNameEl) deviceNameEl.textContent = '오디오 준비됨';
    }
  };

  updateDevices();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', updateDevices);
  }
}

// ==================== 2번: 스킨 오터치 방지 전용 설정 모달 ====================
function showSettingsModal() {
  const currentTheme = document.body.getAttribute('data-theme') || 'classic-silver';
  const settingsHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div class="setting-item" style="border-bottom: 1px solid #232733; padding-bottom: 10px;">
        <div>
          <div class="setting-title" style="font-size: 13px; font-weight: bold; color: #fff;">데크 섀시 스킨 테마</div>
          <div class="setting-desc" style="font-size: 10px; color: #7b8599;">카세트 데크 외형 금속 패널 질감</div>
        </div>
        <select id="modal-theme-select" class="setting-select">
          <option value="classic-silver" ${currentTheme === 'classic-silver' ? 'selected' : ''}>클래식 실버 메탈</option>
          <option value="matte-black" ${currentTheme === 'matte-black' ? 'selected' : ''}>매트 블랙</option>
          <option value="champagne-gold" ${currentTheme === 'champagne-gold' ? 'selected' : ''}>샴페인 골드</option>
        </select>
      </div>

      <div class="setting-item" style="border-bottom: 1px solid #232733; padding-bottom: 10px;">
        <div>
          <div class="setting-title" style="font-size: 13px; font-weight: bold; color: #fff;">테이프 모터 소음 (Hiss)</div>
          <div class="setting-desc" style="font-size: 10px; color: #7b8599;">재생 시 은은한 아날로그 테이프 모터 노이즈</div>
        </div>
        <input type="checkbox" id="modal-hiss-toggle" ${audioEngine.isHissEnabled ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;" />
      </div>

      <button id="modal-btn-open-changelog" class="modal-action-btn" style="width: 100%; height: 36px; background: #1e2432; color: var(--vfd-cyan); font-weight: bold;">
        📦 버전 및 업데이트 내역 확인 (Changelog)
      </button>
    </div>
  `;

  showRetroModal({
    title: '⚙️ DECK CONFIGURATION',
    contentHTML: settingsHTML,
    confirmText: '설정 저장',
    onConfirm: () => {
      const sel = document.getElementById('modal-theme-select');
      if (sel) {
        document.body.setAttribute('data-theme', sel.value);
      }
      const hiss = document.getElementById('modal-hiss-toggle');
      if (hiss) {
        audioEngine.toggleTapeHiss(hiss.checked);
      }
    }
  });

  setTimeout(() => {
    const changelogBtn = document.getElementById('modal-btn-open-changelog');
    if (changelogBtn) {
      changelogBtn.onclick = () => {
        closeRetroModal();
        setTimeout(showChangelogModal, 200);
      };
    }
  }, 100);
}
