/**
 * firebase-db.js
 * Firebase Firestore 및 Storage와 IndexedDB 로컬 이중 백업을 지원하는 데이터베이스 계층
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBr5ZDp6HEeRg_zIUPY6jNdVgjdo1Da6as",
  authDomain: "tape-sing.firebaseapp.com",
  projectId: "tape-sing",
  storageBucket: "tape-sing.firebasestorage.app",
  messagingSenderId: "144707432462",
  appId: "1:144707432462:web:83d45513d3bb56775d8c5f"
};

// Firebase 초기화
let app = null;
let db = null;
let storage = null;
let isFirebaseConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
  isFirebaseConnected = true;
  console.log('Firebase initialized successfully: tape-sing');
} catch (err) {
  console.error('Firebase initialization error, fallback to IndexedDB:', err);
}

// ==================== IndexedDB 로컬 캐시/백업 레이어 ====================
const DB_NAME = 'RetroCassetteDB';
const DB_VERSION = 1;
const STORE_NAME = 'tapes';

function openLocalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToLocalDB(tape) {
  try {
    const dbInstance = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(tape);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('LocalDB save failed:', e);
  }
}

async function loadFromLocalDB() {
  try {
    const dbInstance = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('LocalDB load failed:', e);
    return [];
  }
}

async function deleteFromLocalDB(id) {
  try {
    const dbInstance = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('LocalDB delete failed:', e);
  }
}

// ==================== 테이프 기본 데모 데이터 ====================
export const DEFAULT_SAMPLE_TAPES = [
  {
    id: 'demo-tape-1',
    title: '그대에게 (Shin Hae-chul)',
    artist: '무한궤도 (1988)',
    recordedAt: '1988-12-24',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    playCount: 14,
    duration: 254,
    isFavorite: true,
    folder: '가요',
    audioUrl: '',
    youtubeId: 'W3q8Od5qJio',
    keyShift: 0,
    note: '응답하라 1988 대학가요제 레전드 대상곡'
  },
  {
    id: 'demo-tape-2',
    title: 'City Pop - Plastic Love',
    artist: 'Mariya Takeuchi',
    recordedAt: '1984-04-25',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    playCount: 29,
    duration: 292,
    isFavorite: true,
    folder: 'POP',
    audioUrl: '',
    youtubeId: '3bNITQR4Uso',
    keyShift: 0,
    note: '도쿄 밤거리를 달리는 듯한 80년대 시티팝 감성'
  },
  {
    id: 'demo-tape-3',
    title: '사랑했지만',
    artist: '김광석',
    recordedAt: '1991-03-15',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
    playCount: 8,
    duration: 268,
    isFavorite: false,
    folder: '발라드',
    audioUrl: '',
    youtubeId: 'V9aGk3Hh7C4',
    keyShift: -1,
    note: '통기타와 하모니카 향수가 묻어나는 레트로 명곡'
  }
];

// ==================== 데이터베이스 CRUD 작업 ====================

/**
 * 새로운 테이프(녹음 음원 및 메타데이터)를 파이어베이스에 저장
 */
export async function saveTape(tapeData, audioBlob = null) {
  const tapeId = tapeData.id || 'tape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  let audioUrl = tapeData.audioUrl || '';
  let storagePath = '';

  // 1. Audio Blob이 전달된 경우 Firebase Storage에 업로드
  if (audioBlob && storage) {
    try {
      storagePath = `tapes/${tapeId}.webm`;
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, audioBlob, {
        contentType: audioBlob.type || 'audio/webm'
      });
      audioUrl = await getDownloadURL(snapshot.ref);
      console.log('Audio uploaded successfully to Firebase Storage:', audioUrl);
    } catch (uploadErr) {
      console.warn('Firebase Storage upload error, will save audio locally:', uploadErr);
      if (audioBlob) {
        try {
          audioUrl = URL.createObjectURL(audioBlob);
        } catch (e) {}
      }
    }
  }

  // 2. Firestore용 순수 직렬화 메타데이터 (Blob 제외)
  const firestoreData = {
    id: tapeId,
    title: tapeData.title || 'Untitled',
    artist: tapeData.artist || 'Unknown Artist',
    folder: tapeData.folder || '가요',
    audioUrl: audioUrl || '',
    storagePath: storagePath || '',
    createdAt: Date.now(),
    recordedAt: tapeData.recordedAt || new Date().toISOString().split('T')[0],
    playCount: tapeData.playCount || 0,
    isFavorite: !!tapeData.isFavorite,
    keyShift: tapeData.keyShift || 0
  };

  if (db) {
    try {
      const tapeDocRef = doc(db, 'tapes', tapeId);
      await setDoc(tapeDocRef, {
        ...firestoreData,
        updatedAt: serverTimestamp()
      });
      console.log('Tape saved to Firestore successfully:', tapeId);
    } catch (dbErr) {
      console.warn('Firestore write error, falling back to local:', dbErr);
    }
  }

  // 3. IndexedDB에 오디오 원본(Blob)과 함께 로컬 영구 백업
  const localTape = {
    ...firestoreData,
    updatedAt: Date.now(),
    audioBlob: audioBlob || null
  };
  await saveToLocalDB(localTape);

  return localTape;
}

/**
 * 모든 테이프 목록 불러오기 (Firestore 우선, 로컬 IndexedDB 백업 동시 병합)
 */
export async function getAllTapes() {
  let tapes = [];

  if (db) {
    try {
      const tapesCol = collection(db, 'tapes');
      const snapshot = await getDocs(tapesCol);
      snapshot.forEach(docSnap => {
        tapes.push({ id: docSnap.id, ...docSnap.data() });
      });
      console.log(`Loaded ${tapes.length} tapes from Firestore`);
    } catch (err) {
      console.warn('Firestore fetch failed, checking local IndexedDB:', err);
    }
  }

  // Firestore 데이터와 로컬 IndexedDB 데이터 머지 (오프라인 생성 테이프 및 바이너리 Blob 복원)
  const localTapes = await loadFromLocalDB();
  const seenIds = new Set(tapes.map(t => t.id));

  for (const lt of localTapes) {
    if (!seenIds.has(lt.id)) {
      seenIds.add(lt.id);
      if ((!lt.audioUrl || lt.audioUrl.startsWith('blob:')) && lt.audioBlob) {
        try {
          lt.audioUrl = URL.createObjectURL(lt.audioBlob);
        } catch (e) {}
      }
      tapes.push(lt);
    } else {
      // 클라우드 테이프에 로컬 Blob이 있다면 연결 복원
      const existing = tapes.find(t => t.id === lt.id);
      if (existing && (!existing.audioUrl || existing.audioUrl.startsWith('blob:')) && lt.audioBlob) {
        try {
          existing.audioUrl = URL.createObjectURL(lt.audioBlob);
        } catch (e) {}
      }
    }
  }

  // 데이터가 아예 없으면 기본 샘플 테이프 제공
  if (tapes.length === 0) {
    for (const sample of DEFAULT_SAMPLE_TAPES) {
      await saveToLocalDB(sample);
      if (db) {
        try {
          await setDoc(doc(db, 'tapes', sample.id), sample);
        } catch(e) {}
      }
    }
    tapes = [...DEFAULT_SAMPLE_TAPES];
  }

  // 생성일 기준 내림차순 정렬
  tapes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return tapes;
}

/**
 * 테이프 삭제 (Firestore, Storage, IndexedDB 모두 삭제)
 */
export async function deleteTape(id, storagePath = '') {
  if (db) {
    try {
      await deleteDoc(doc(db, 'tapes', id));
    } catch (e) {
      console.warn('Firestore delete error:', e);
    }
  }

  if (storage && storagePath) {
    try {
      const fileRef = ref(storage, storagePath);
      await deleteObject(fileRef);
    } catch (e) {
      console.warn('Storage file delete error:', e);
    }
  }

  await deleteFromLocalDB(id);
  return true;
}

/**
 * 재생 횟수 증가
 */
export async function incrementTapePlayCount(id) {
  const localList = await loadFromLocalDB();
  const target = localList.find(t => t.id === id);
  const newCount = (target && target.playCount ? target.playCount : 0) + 1;

  if (target) {
    target.playCount = newCount;
    await saveToLocalDB(target);
  }

  if (db) {
    try {
      const tapeRef = doc(db, 'tapes', id);
      await updateDoc(tapeRef, { playCount: newCount });
    } catch (e) {
      console.warn('Firestore playCount update error:', e);
    }
  }

  return newCount;
}

/**
 * 즐겨찾기(별표) 토글
 */
export async function toggleTapeFavorite(id, currentStatus) {
  const newStatus = !currentStatus;

  const localList = await loadFromLocalDB();
  const target = localList.find(t => t.id === id);
  if (target) {
    target.isFavorite = newStatus;
    await saveToLocalDB(target);
  }

  if (db) {
    try {
      const tapeRef = doc(db, 'tapes', id);
      await updateDoc(tapeRef, { isFavorite: newStatus });
    } catch (e) {
      console.warn('Firestore favorite update error:', e);
    }
  }

  return newStatus;
}

export function checkFirebaseStatus() {
  return {
    isConfigured: true,
    projectId: firebaseConfig.projectId,
    isConnected: isFirebaseConnected
  };
}
