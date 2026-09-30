# 🎵 레트로 카세트 데크 커스텀 노래방 앱 (TAPE-SING RS-M85)

> **빈티지 Hi-Fi 아날로그 카세트 데크 감성의 개인용 노래방 & 플레이어 웹 애플리케이션**  
> GitHub Pages 정적 호스팅 지원 / Firebase Firestore & Storage 실시간 클라우드 동기화 / 100% 순수 CSS 스큐어모피즘 UI

---

## 📻 핵심 기능 및 특징

1. **100% 순수 CSS 카세트테이프 엔진 (이미지 0개)**
   - 플라스틱 섀시 두께감, 정밀 나사, 쓰기방지 탭, 사다리꼴 관찰창, 6스포크 톱니 릴(Reel), 자기 테이프 롤 두께까지 모두 순수 CSS 코드로 구현.
   - 곡 재생 시 테이프 릴이 무한 회전하며, 곡 진행률에 따라 좌측 테이프 롤이 풀리고 우측 롤이 감기는 사실적 애니메이션 적용.

2. **동적 해시 기반 라벨 그래픽 자동 생성**
   - 곡 제목과 가수명 문자열을 해싱하여 곡마다 고유한 Hue와 빈티지 그래픽 패턴(레이싱 스트라이프, 80s 신스웨이브, 아날로그 그리드 등)의 라벨을 자동 생성 (비용 0원).

3. **GNB 카세트 물리 버튼 네비게이션**
   - `[◁◁ MAIN]`: 최근/자주 들은 카세트테이프 및 VFD 패널(정보, 디지털 시계, 스테레오 VU 레벨 미터).
   - `[● REC/SING]`: 스튜디오 노래/녹음 모드 (레드 포인트 물리 버튼).
   - `[▶ PLAYER]`: 카세트 도어 및 테이프 데크 플레이어 (카운터, 되감기/빨리감기/정지).
   - `[❚❚ RACK]`: 자석식 CSS Scroll Snap 테이프 랙 (스크롤 멈춤 시 중앙 착붙 & 릴 회전 프리뷰).
   - `[▷▷ SETUP]`: 시스템 설정 (섀시 테마, 아날로그 테이프 히스 노이즈, 업데이트 내역 확인 모달).
   - 클릭 시 아날로그 기계식 '철칵-턱' 금속 솔레노이드 사운드 및 입체 눌림 애니메이션.

4. **스튜디오 노래방 & Web Audio API**
   - 검색창에 곡명/가수 입력 시 `+ 노래방` 자동 결합 검색.
   - Web Audio API 기반 -6 ~ +6 반음 실시간 키(Pitch) 조절.
   - 마이크 실시간 수음 및 가요 노래방 에코/리버브 효과.
   - 실시간 듀얼 VU 미터 (녹색, 호박색, 적색 세그먼트 레벨 미터 점등).

5. **Firebase 클라우드 실시간 동기화 + IndexedDB 오프라인 백업**
   - 녹음 완료 시 Firebase Storage(`tape-sing.firebasestorage.app`)에 음원 업로드.
   - Firebase Firestore `tapes` 컬렉션에 메타데이터 영구 보관.
   - 오프라인 환경에서도 IndexedDB 로컬 이중 백업 동작.

6. **전역 레트로 모달 팝업 시스템**
   - 브라우저 기본 알림창(`alert`, `confirm`)을 일절 사용하지 않고, 기기 일체형 레트로 모달 팝업으로 통일.
   - 설정 메뉴에서 **[버전 및 업데이트 내역 확인 (Changelog)]** 모달 팝업 제공.

---

## 📂 파일 구성 안내

- [`index.html`](file:///c:/Users/user1/Desktop/개발/테이프/index.html): 16:9 가로 모드 뷰포트 및 데크 전체 섀시 마크업
- [`style.css`](file:///c:/Users/user1/Desktop/개발/테이프/style.css): 스큐어모피즘, 순수 CSS 카세트테이프, VFD 디스플레이, 모달 스타일
- [`app.js`](file:///c:/Users/user1/Desktop/개발/테이프/app.js): 5대 뷰 전환, 플레이어/스튜디오 오케스트레이션, 모달 제어
- [`tape-renderer.js`](file:///c:/Users/user1/Desktop/개발/테이프/tape-renderer.js): CSS 카세트 렌더러 및 해시 기반 고유 컬러/패턴 생성기
- [`audio-engine.js`](file:///c:/Users/user1/Desktop/개발/테이프/audio-engine.js): Web Audio API 기계음 신스, 피치 조절, 마이크 에코, 레코더, VU 미터
- [`firebase-db.js`](file:///c:/Users/user1/Desktop/개발/테이프/firebase-db.js): Firebase Firestore/Storage 연동 및 IndexedDB 백업

---

## 🚀 깃허브 업로드 및 실행 방법

1. 별도의 빌드 과정(npm, webpack 등)이 전혀 필요 없는 **순수 정적 웹(Pure Web)** 구조입니다.
2. 폴더 내 파일들을 그대로 GitHub 저장소에 푸시한 후, **GitHub Pages** (Settings > Pages > Branch: `main` / `root`)를 활성화하시면 즉시 전 세계 어디서든 웹/모바일 앱으로 동작합니다.
3. 브라우저에서 `index.html`을 더블 클릭하여 바로 로컬에서 실행하실 수도 있습니다 (로컬 웹서버 권장: VSCode Live Server 등).
