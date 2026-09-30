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
        <span class="changelog-version-tag">VERSION 1.0.0 (RELEASE)</span>
        <div style="font-size: 11px; color: #8892b0; margin-bottom: 8px;">배포 일자: 2026-09-30 | 레트로 아날로그 카세트 에디션</div>
        <ul class="changelog-list">
          <li><strong>100% 순수 CSS 카세트테이프 엔진:</strong> 외부 이미지 전혀 없이 CSS 그라디언트와 섀도우만으로 플라스틱 섀시, 6스포크 톱니 릴, 진행률 가변 마그네틱 테이프 롤 완벽 구현</li>
          <li><strong>문자열 해시 기반 동적 아트워크:</strong> 곡 제목과 가수명에 따라 고유한 Hue와 레트로 그래피티 패턴 라벨 무한 자동 생성</li>
          <li><strong>Web Audio API 피치/키 시프터:</strong> -6반음부터 +6반음까지 실시간 키 조절 및 가요 노래방 에코 리버브 내장</li>
          <li><strong>유튜브 노래방 동기화 & 마이크 믹싱:</strong> 자동 '+ 노래방' 검색 덧붙임 및 실시간 수음 오디오 캡처</li>
          <li><strong>파이어베이스 클라우드 동기화:</strong> Firebase Firestore DB 및 Firebase Storage에 음원과 테이프 메타데이터 안전 저장 (IndexedDB 로컬 오프라인 이중 백업)</li>
          <li><strong>자석식 CSS Scroll Snap 테이프 랙:</strong> 카세트 랙에서 스크롤 시 중앙 테이프가 자석처럼 착 달라붙으며 실시간 릴 회전 프리뷰</li>
          <li><strong>아날로그 하이파이 기계음 신디사이저:</strong> 물리 버튼 클릭 시 '철칵-턱' 금속 솔레노이드 기계음 및 테이프 히스 노이즈 내장</li>
          <li><strong>전역 레트로 모달 시스템:</strong> 모든 안내/설정/업데이트 팝업을 하이파이 데크 테마 모달로 통일</li>
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

  // 5. 앱 종료 버튼
  const exitBtn = document.getElementById('btn-app-exit');
  if (exitBtn) {
    exitBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      showRetroModal({
        title: '⏻ APP SHUTDOWN',
        contentHTML: '카세트 데크 어플을 종료하시겠습니까?',
        confirmText: '앱 종료',
        cancelText: '취소',
        onConfirm: () => {
          audioEngine.shutdownMicrophone();
          window.close();
          setTimeout(() => {
            window.location.href = 'about:blank';
          }, 300);
        }
      });
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

// ==================== VIEW 2: STUDIO (노래/녹음 모드) ====================
function setupStudioControls() {
  const searchInput = document.getElementById('studio-search-input');
  const searchBtn = document.getElementById('studio-search-btn');
  const karaokeFrame = document.getElementById('karaoke-embed-frame');
  const placeholder = document.getElementById('karaoke-placeholder');

  // 검색 시 "+ 노래방" 자동 결합
  const doSearch = () => {
    const query = searchInput.value.trim();
    if (!query) {
      showRetroModal({
        title: '⚠️ SEARCH NOTICE',
        contentHTML: '가수명 또는 노래 제목을 입력해주세요.',
        confirmText: '확인'
      });
  // ==================== 유튜브 노래방 영상 로더 ====================
  let currentKaraokeVideoId = 'W3q8Od5qJio'; // 기본 신해철 그대에게
  let currentKaraokeTitle = '그대에게';
  let currentKaraokeArtist = '신해철 (무한궤도)';

  const loadKaraokeVideo = (videoId, title = '', artist = '') => {
    currentKaraokeVideoId = videoId;
    if (title) currentKaraokeTitle = title;
    if (artist) currentKaraokeArtist = artist;

    if (karaokeFrame && placeholder) {
      placeholder.style.display = 'none';
      karaokeFrame.style.display = 'block';
      // 임베드 차단을 방지하는 youtube-nocookie 및 origin 파라미터 적용
      karaokeFrame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0`;
    }
  };

  // 추천곡 칩 클릭 이벤트
  document.querySelectorAll('.karaoke-chip').forEach(chip => {
    chip.onclick = () => {
      audioEngine.playMechanicalClick();
      const vid = chip.dataset.vid;
      const title = chip.dataset.title;
      const artist = chip.dataset.artist;
      if (searchInput) searchInput.value = `${artist} - ${title}`;
      loadKaraokeVideo(vid, title, artist);
    };
  });

  // 검색창: 유튜브 URL 파싱 또는 노래방 검색
  const doSearch = () => {
    const raw = searchInput ? searchInput.value.trim() : '';
    if (!raw) {
      showRetroModal({
        title: '⚠️ SEARCH NOTICE',
        contentHTML: '곡명이나 가수명, 또는 유튜브 영상 링크를 입력해주세요.',
        confirmText: '확인'
      });
      return;
    }

    audioEngine.playMechanicalClick();

    // 1. 유튜브 URL인지 판별 (youtu.be/xxx 또는 watch?v=xxx)
    const ytMatch = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      loadKaraokeVideo(ytMatch[1], '유튜브 노래방', 'YouTube Track');
      return;
    }

    // 2. 일반 검색어인 경우: 유튜브 노래방 검색 도우미 및 바로가기
    const query = encodeURIComponent(raw + ' 노래방 MR');
    showRetroModal({
      title: '🎤 YOUTUBE KARAOKE',
      contentHTML: `
        <div style="font-size: 12px; line-height: 1.6;">
          <p><strong>[${raw}]</strong> 노래방을 선택하세요.</p>
          <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
            <button id="modal-btn-open-yt" class="modal-action-btn" style="width: 100%; height: 36px; background: #dc2626; color: #fff; font-weight: bold;">
              ▶ 유튜브 노래방 검색창 열기 (영상 링크 복사)
            </button>
            <div style="font-size: 10px; color: #94a3b8;">
              * 유튜브에서 원하는 노래방 영상을 찾아 <strong>'공유 ➔ 링크 복사'</strong> 후 아래 입력창에 넣으시면 1초 만에 로드됩니다!
            </div>
            <input type="text" id="modal-yt-url-input" class="studio-input" placeholder="여기에 유튜브 영상 링크 붙여넣기" style="width: 100%;" />
          </div>
        </div>
      `,
      confirmText: '영상 로드하기',
      cancelText: '취소',
      onConfirm: () => {
        const link = document.getElementById('modal-yt-url-input')?.value.trim();
        if (link) {
          const m = link.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
          if (m && m[1]) {
            loadKaraokeVideo(m[1], raw, '노래방');
            if (searchInput) searchInput.value = raw;
          }
        }
      }
    });

    setTimeout(() => {
      const openBtn = document.getElementById('modal-btn-open-yt');
      if (openBtn) {
        openBtn.onclick = () => {
          window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
        };
      }
    }, 100);
  };

  if (searchBtn) searchBtn.onclick = doSearch;
  if (searchInput) {
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') doSearch();
    };
  }

  // 유튜브 링크 직접 입력 버튼
  const directLinkBtn = document.getElementById('studio-direct-link-btn');
  if (directLinkBtn) {
    directLinkBtn.onclick = () => {
      showRetroModal({
        title: '🔗 YOUTUBE LINK INPUT',
        contentHTML: `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 11px; color: #94a3b8;">유튜브 영상 주소(URL)를 입력해주세요:</div>
            <input type="text" id="direct-yt-url" class="studio-input" placeholder="https://youtu.be/..." style="width: 100%;" />
          </div>
        `,
        confirmText: '재생',
        cancelText: '취소',
        onConfirm: () => {
          const val = document.getElementById('direct-yt-url')?.value.trim();
          if (val) {
            const m = val.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            if (m && m[1]) {
              loadKaraokeVideo(m[1], '커스텀 노래방', 'YouTube');
            }
          }
        }
      });
    };
  }

  // ==================== 키 조절 로직 ====================
  const pitchValEl = document.getElementById('studio-pitch-val');
  const pitchDownBtn = document.getElementById('pitch-btn-down');
  const pitchUpBtn = document.getElementById('pitch-btn-up');
  const pitchLiveVal = document.getElementById('pitch-live-val');
  const pitchLiveDown = document.getElementById('pitch-live-down');
  const pitchLiveUp = document.getElementById('pitch-live-up');

  const updatePitchDisplay = () => {
    const sign = state.studioKeyShift > 0 ? `+${state.studioKeyShift}` : `${state.studioKeyShift}`;
    if (pitchValEl) {
      pitchValEl.textContent = sign;
      pitchValEl.style.color = state.studioKeyShift === 0 ? 'var(--vfd-cyan)' : 'var(--vfd-amber)';
    }
    if (pitchLiveVal) {
      pitchLiveVal.textContent = sign;
    }
    audioEngine.setKeyShift(state.studioKeyShift);
  };

  const handlePitchDown = () => {
    audioEngine.playMechanicalClick();
    if (state.studioKeyShift > -6) {
      state.studioKeyShift--;
      updatePitchDisplay();
    }
  };

  const handlePitchUp = () => {
    audioEngine.playMechanicalClick();
    if (state.studioKeyShift < 6) {
      state.studioKeyShift++;
      updatePitchDisplay();
    }
  };

  if (pitchDownBtn) pitchDownBtn.onclick = handlePitchDown;
  if (pitchUpBtn) pitchUpBtn.onclick = handlePitchUp;
  if (pitchLiveDown) pitchLiveDown.onclick = handlePitchDown;
  if (pitchLiveUp) pitchLiveUp.onclick = handlePitchUp;

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
        isRecPaused = true;
        livePauseBtn.classList.add('is-paused');
        if (livePauseIcon) livePauseIcon.textContent = '▶';
        if (livePauseLabel) livePauseLabel.textContent = '계속 부르기';
      } else {
        // 녹음 재개
        audioEngine.resumeRecording();
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
      const blob = await audioEngine.stopRecording();
      state.isRecording = false;
      if (studioView) studioView.classList.remove('studio-recording-mode');

      // 저장 모달 팝업
      const titleVal = currentKaraokeTitle || (searchInput ? searchInput.value.trim() : '나의 노래방');
      const artistVal = currentKaraokeArtist || '원곡 가수';
      promptSaveTapeModal(titleVal, blob, artistVal);
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

        showRetroModal({
          title: '✨ SAVED TO CLOUD',
          contentHTML: `
            <p><strong>[${title}]</strong> 테이프가 파이어베이스 클라우드에 성공적으로 구워졌습니다!</p>
            <p style="font-size: 11px; color: #7b8599; margin-top: 6px;">플레이어 또는 테이프 랙에서 언제든지 감상하실 수 있습니다.</p>
          `,
          confirmText: '플레이어로 이동',
          onConfirm: () => {
            document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
            document.querySelector('.gnb-mech-key[data-view="player"]')?.classList.add('is-engaged');
            switchView('player');
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

  filtered.forEach(tape => {
    const slot = document.createElement('div');
    slot.className = 'rack-snap-slot';
    slot.dataset.id = tape.id;

    const cassette = createCassetteElement(tape, {
      size: 'medium',
      isPlaying: false,
      progress: 0.2
    });

    slot.appendChild(cassette);

    // 클릭 시 플레이어로 장착 & 재생
    slot.onclick = () => {
      audioEngine.playMechanicalClick();
      state.selectedTape = tape;
      document.querySelectorAll('.gnb-mech-key').forEach(b => b.classList.remove('is-engaged'));
      document.querySelector('.gnb-mech-key[data-view="player"]')?.classList.add('is-engaged');
      switchView('player');
      startPlayback();
    };

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
