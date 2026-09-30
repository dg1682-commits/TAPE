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

  // 2. iOS/Android 핀치 줌 및 더블 탭 확대 방지
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, false);

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
      return;
    }

    audioEngine.playMechanicalClick();
    const fullQuery = encodeURIComponent(query + ' 노래방');

    // 유튜브 검색 결과 임베드
    if (karaokeFrame && placeholder) {
      placeholder.style.display = 'none';
      karaokeFrame.style.display = 'block';
      // 유튜브 임베드 검색 리스트 주소
      karaokeFrame.src = `https://www.youtube.com/embed?listType=search&list=${fullQuery}&autoplay=1`;
    }
  };

  if (searchBtn) searchBtn.onclick = doSearch;
  if (searchInput) {
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') doSearch();
    };
  }

  // 키 조절 (-6 ~ +6)
  const pitchValEl = document.getElementById('studio-pitch-val');
  const pitchDownBtn = document.getElementById('pitch-btn-down');
  const pitchUpBtn = document.getElementById('pitch-btn-up');

  const updatePitchDisplay = () => {
    if (pitchValEl) {
      const sign = state.studioKeyShift > 0 ? `+${state.studioKeyShift}` : `${state.studioKeyShift}`;
      pitchValEl.textContent = sign;
      pitchValEl.style.color = state.studioKeyShift === 0 ? 'var(--vfd-cyan)' : 'var(--vfd-amber)';
    }
    audioEngine.setKeyShift(state.studioKeyShift);
  };

  if (pitchDownBtn) {
    pitchDownBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      if (state.studioKeyShift > -6) {
        state.studioKeyShift--;
        updatePitchDisplay();
      }
    };
  }

  if (pitchUpBtn) {
    pitchUpBtn.onclick = () => {
      audioEngine.playMechanicalClick();
      if (state.studioKeyShift < 6) {
        state.studioKeyShift++;
        updatePitchDisplay();
      }
    };
  }

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

  // 대형 레드 녹음 버튼
  const launchRecBtn = document.getElementById('studio-btn-launch');
  if (launchRecBtn) {
    launchRecBtn.onclick = async () => {
      audioEngine.playMechanicalClick();

      if (!state.isRecording) {
        // [노래 시작!]
        try {
          await audioEngine.startRecording();
          state.isRecording = true;
          launchRecBtn.classList.add('recording-active');
          launchRecBtn.innerHTML = `<span>■</span> 노래 완료 및 테이프 저장`;
        } catch (err) {
          showRetroModal({
            title: '❌ MIC PERMISSION REQUIRED',
            contentHTML: `
              <p>마이크 수음 권한이 필요합니다.</p>
              <p style="font-size: 11px; color: #a0aec0; margin-top: 6px;">브라우저 주소창의 마이크 아이콘을 눌러 권한을 허용해주세요.</p>
            `,
            confirmText: '확인'
          });
        }
      } else {
        // [노래 완료 및 저장]
        const blob = await audioEngine.stopRecording();
        state.isRecording = false;
        launchRecBtn.classList.remove('recording-active');
        launchRecBtn.innerHTML = `<span>●</span> 노래 시작! (REC)`;

        // 저장 모달 팝업
        const titleVal = searchInput ? searchInput.value.trim() : '추억의 명곡';
        promptSaveTapeModal(titleVal || '녹음된 노래', blob);
      }
    };
  }
}

// 녹음 완료 후 저장 정보 입력 모달
function promptSaveTapeModal(defaultTitle, audioBlob) {
  const formHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div>
        <label style="font-size: 11px; color: #a0aec0; display: block; margin-bottom: 4px;">노래 제목</label>
        <input id="modal-save-title" type="text" value="${defaultTitle}" class="studio-input" style="width: 100%;" />
      </div>
      <div>
        <label style="font-size: 11px; color: #a0aec0; display: block; margin-bottom: 4px;">원곡 가수</label>
        <input id="modal-save-artist" type="text" placeholder="원곡 가수명" class="studio-input" style="width: 100%;" />
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
