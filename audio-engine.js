/**
 * audio-engine.js
 * Web Audio API & MediaRecorder 기반의 레트로 카세트 오디오 & 믹싱 엔진
 * - 카세트 물리 버튼 기계음 신디사이저 내장 (외부 사운드 파일 의존 없음)
 * - 마이크 실시간 수음, 에코/리버브, 볼륨 제어
 * - 반음(Pitch/Key) 실시간 조절 (-6 ~ +6)
 * - 실시간 듀얼 VU 미터 레벨 분석
 * - 녹음 및 오디오 합성/Blob 생성
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;

    // 마이크 관련
    this.micStream = null;
    this.micSourceNode = null;
    this.micGainNode = null;
    this.micDelayNode = null;
    this.micFeedbackNode = null;
    this.micWetGainNode = null;
    this.micMasterNode = null;

    // 플레이어 관련
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';
    this.mediaSourceNode = null;
    this.playerGainNode = null;
    this.detuneSemitones = 0; // -6 ~ +6

    // 분석기 (VU 미터)
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.splitterNode = null;
    this.vuAnimationId = null;
    this.onVuUpdate = null; // 콜백

    // 녹음 관련
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordDestination = null;
    this.isRecording = false;

    // 테이프 히스 노이즈
    this.hissSource = null;
    this.hissGain = null;
    this.isHissEnabled = false;
  }

  // 사용자 제스처 시 AudioContext 초기화
  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isInitialized = true;
    this._setupAnalysers();
  }

  _setupAnalysers() {
    if (!this.ctx) return;

    this.splitterNode = this.ctx.createChannelSplitter(2);
    this.leftAnalyser = this.ctx.createAnalyser();
    this.rightAnalyser = this.ctx.createAnalyser();
    this.leftAnalyser.fftSize = 256;
    this.rightAnalyser.fftSize = 256;

    this.splitterNode.connect(this.leftAnalyser, 0);
    this.splitterNode.connect(this.rightAnalyser, 1);

    // 오디오 엘리먼트와 컨텍스트 연결
    if (!this.mediaSourceNode) {
      try {
        this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioElement);
        this.playerGainNode = this.ctx.createGain();
        this.mediaSourceNode.connect(this.playerGainNode);
        this.playerGainNode.connect(this.splitterNode);
        this.playerGainNode.connect(this.ctx.destination);
      } catch (e) {
        console.warn('MediaElementSource already connected or cross-origin:', e);
      }
    }
  }

  // ==================== 카세트 데크 기계음 신디사이저 ====================

  /**
   * 물리 버튼이 '철칵! 턱!' 깊게 눌리는 아날로그 스프링/금속 기계음 재생
   */
  playMechanicalClick() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. 금속성 고음 '틱' (고역 통과 노이즈 버스트)
    const bufferSize = this.ctx.sampleRate * 0.04;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(3200, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseNode.start(now);

    // 2. 묵직한 카세트 솔레노이드/스프링 '턱' (저음 댐프드 사인파)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.08);

    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * 카세트 도어 오픈/클로즈 '철컹' 기계음
   */
  playTapeEject() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 스프링 래치 소리
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.15);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // 약간의 딜레이 후 둔탁한 착지음
    setTimeout(() => {
      this.playMechanicalClick();
    }, 120);
  }

  /**
   * 빈티지 테이프 아날로그 히스 노이즈 재생/정지
   */
  toggleTapeHiss(enable = true) {
    this.initContext();
    if (!this.ctx) return;

    if (!enable) {
      if (this.hissSource) {
        try { this.hissSource.stop(); } catch(e) {}
        this.hissSource.disconnect();
        this.hissSource = null;
      }
      this.isHissEnabled = false;
      return;
    }

    if (this.hissSource) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.05;
      b1 = 0.96300 * b1 + white * 0.05;
      b2 = 0.57000 * b2 + white * 0.02;
      data[i] = (b0 + b1 + b2) * 0.025;
    }

    this.hissSource = this.ctx.createBufferSource();
    this.hissSource.buffer = noiseBuffer;
    this.hissSource.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(4500, this.ctx.currentTime);
    bandpass.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.hissGain = this.ctx.createGain();
    this.hissGain.gain.setValueAtTime(0.035, this.ctx.currentTime);

    this.hissSource.connect(bandpass);
    bandpass.connect(this.hissGain);
    this.hissGain.connect(this.ctx.destination);
    this.hissSource.start();
    this.isHissEnabled = true;
  }

  // ==================== 마이크 및 에코/리버브 ====================

  async initMicrophone() {
    this.initContext();
    if (this.micStream) return true;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.micSourceNode = this.ctx.createMediaStreamSource(this.micStream);
      this.micGainNode = this.ctx.createGain();
      this.micGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // 에코(딜레이) 체인
      this.micDelayNode = this.ctx.createDelay(1.0);
      this.micDelayNode.delayTime.setValueAtTime(0.18, this.ctx.currentTime); // 180ms 가요 노래방 에코

      this.micFeedbackNode = this.ctx.createGain();
      this.micFeedbackNode.gain.setValueAtTime(0.35, this.ctx.currentTime); // 피드백

      this.micWetGainNode = this.ctx.createGain();
      this.micWetGainNode.gain.setValueAtTime(0.4, this.ctx.currentTime);

      this.micMasterNode = this.ctx.createGain();
      this.micMasterNode.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // 연결: Source -> Dry -> Master
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.micMasterNode);

      // Source -> Delay -> Wet -> Master
      this.micGainNode.connect(this.micDelayNode);
      this.micDelayNode.connect(this.micFeedbackNode);
      this.micFeedbackNode.connect(this.micDelayNode); // 딜레이 피드백 루프
      this.micDelayNode.connect(this.micWetGainNode);
      this.micWetGainNode.connect(this.micMasterNode);

      // 하울링(새소리 피드백) 방지:
      // 스마트폰 스피커(ctx.destination)로 직접 출력하지 않고, VU 미터 분석기 및 녹음 버스에만 연결!
      this.micMasterNode.connect(this.splitterNode);

      return true;
    } catch (err) {
      console.warn('Microphone permission denied or unavailable:', err);
      return false;
    }
  }

  setMicVolume(val = 1.0) {
    if (this.micGainNode && this.ctx) {
      this.micGainNode.gain.setValueAtTime(val, this.ctx.currentTime);
    }
  }

  setMicEcho(val = 0.4) {
    // val: 0.0 ~ 1.0
    if (this.micWetGainNode && this.micFeedbackNode && this.ctx) {
      const wet = Math.min(0.8, val);
      const feedback = Math.min(0.65, val * 0.7);
      this.micWetGainNode.gain.setValueAtTime(wet, this.ctx.currentTime);
      this.micFeedbackNode.gain.setValueAtTime(feedback, this.ctx.currentTime);
    }
  }

  // ==================== 키/피치 조절 ====================

  /**
   * 키 조절 (-6 ~ +6 반음)
   * 1 반음 = 100 cents
   */
  setKeyShift(semitones = 0) {
    this.detuneSemitones = semitones;
    // playbackRate를 사용한 피치 조정 (1 semitone = 2^(1/12))
    const rate = Math.pow(2, semitones / 12);
    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
      this.audioElement.preservesPitch = false; // 의도적으로 피치를 올려야 키 조절이 됨!
    }
  }

  // ==================== 오디오 플레이어 ====================

  loadAudioSource(src) {
    this.initContext();
    if (src) {
      this.audioElement.src = src;
      this.audioElement.load();
      this.setKeyShift(this.detuneSemitones);
    } else {
      // 음원 URL이 없는 데모 테이프인 경우 가상 오디오 캔버스 준비
      this.audioElement.removeAttribute('src');
    }
  }

  play() {
    this.initContext();
    this.startVuMeter();
    if (this.audioElement.src && this.audioElement.src !== window.location.href) {
      return this.audioElement.play();
    }
    // 소스가 없는 경우에도 릴 회전 및 레벨 미터 동작을 위한 가상 성공 반환
    return Promise.resolve();
  }

  pause() {
    if (this.audioElement.src) {
      this.audioElement.pause();
    }
    this.stopVuMeter();
  }

  seek(seconds) {
    if (this.audioElement.duration) {
      this.audioElement.currentTime = Math.max(0, Math.min(seconds, this.audioElement.duration));
    }
  }

  setVolume(val = 1.0) {
    this.audioElement.volume = Math.max(0, Math.min(1.0, val));
  }

  // ==================== 실시간 VU 미터 ====================

  startVuMeter() {
    if (this.vuAnimationId) return;

    const leftData = new Uint8Array(this.leftAnalyser ? this.leftAnalyser.frequencyBinCount : 128);
    const rightData = new Uint8Array(this.rightAnalyser ? this.rightAnalyser.frequencyBinCount : 128);

    const update = () => {
      let leftLevel = 0;
      let rightLevel = 0;

      if (this.leftAnalyser && this.rightAnalyser) {
        this.leftAnalyser.getByteTimeDomainData(leftData);
        this.rightAnalyser.getByteTimeDomainData(rightData);

        let leftSum = 0;
        let rightSum = 0;
        for (let i = 0; i < leftData.length; i++) {
          const lVal = (leftData[i] - 128) / 128;
          const rVal = (rightData[i] - 128) / 128;
          leftSum += lVal * lVal;
          rightSum += rVal * rVal;
        }

        const leftRms = Math.sqrt(leftSum / leftData.length);
        const rightRms = Math.sqrt(rightSum / rightData.length);

        // 0 ~ 100% 비선형 매핑
        leftLevel = Math.min(100, Math.round(leftRms * 280));
        rightLevel = Math.min(100, Math.round(rightRms * 280));
      }

      if (this.onVuUpdate) {
        this.onVuUpdate(leftLevel, rightLevel);
      }

      this.vuAnimationId = requestAnimationFrame(update);
    };

    this.vuAnimationId = requestAnimationFrame(update);
  }

  stopVuMeter() {
    if (this.vuAnimationId) {
      cancelAnimationFrame(this.vuAnimationId);
      this.vuAnimationId = null;
    }
    if (this.onVuUpdate) {
      this.onVuUpdate(0, 0);
    }
  }

  // ==================== 녹음 기능 ====================

  async startRecording() {
    this.initContext();
    const hasMic = await this.initMicrophone();
    if (!hasMic) {
      throw new Error('마이크 접근 권한이 필요합니다.');
    }

    // 마이크 노드만 레코더에 연결 (스피커 반주 + 목소리 자연 수음)
    this.recordDestination = this.ctx.createMediaStreamDestination();

    if (this.micMasterNode) {
      this.micMasterNode.connect(this.recordDestination);
    }

    const streamToRecord = this.recordDestination.stream;
    this.recordedChunks = [];

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = '';
        }
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(streamToRecord, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
    this.startVuMeter();
  }

  pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  cancelRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch(e) {}
    }
    this.recordedChunks = [];
    this.isRecording = false;
    this.stopVuMeter();
    this.shutdownMicrophone();
  }

  shutdownMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try { this.micSourceNode.disconnect(); } catch(e) {}
      this.micSourceNode = null;
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.isRecording = false;
        this.shutdownMicrophone();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const type = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type });
        this.recordedChunks = [];
        this.isRecording = false;
        this.stopVuMeter();
        this.shutdownMicrophone();
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }
}

export const audioEngine = new AudioEngine();
