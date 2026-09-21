import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import config from '../firebase-applet-config.json';

export const ADMIN_EMAIL = 'mohammednanabail@gmail.com';

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
  measurementId: config.measurementId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// تهيئة Firestore مع التوافق العالي وميزة experimentalAutoDetectLongPolling لمنع مشاكل الاتصال
export const db = (() => {
  const dbId =
    config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
      ? config.firestoreDatabaseId
      : undefined;
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      dbId
    );
  } catch {
    return dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
})();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * تسجيل الدخول بحساب Google (Firebase Auth)
 */
export async function loginWithGoogle(): Promise<{ user: User | null; error?: string }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    if (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return { user };
    } else {
      await signOut(auth);
      return {
        user: null,
        error: `الحساب (${user.email || 'غير معروف'}) غير مصرح له بالدخول كمدير. الحساب المصرح له فقط هو: ${ADMIN_EMAIL}`,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل تسجيل الدخول بحساب Google';
    return { user: null, error: message };
  }
}

/**
 * تسجيل الخروج
 */
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * التحقق من صلاحية المدير
 */
export function isUserAdmin(user: User | null): boolean {
  if (!user || !user.email) return false;
  return user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * دالة ضغط الصور بدقة وحجم محددين:
 * - أقصى بُعد 900px
 * - جودة JPEG 0.7
 * - النتيجة: نص base64 خفيف لا يتجاوز ~150KB
 */
export function compressImage(file: File, maxDim = 900, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|svg)$/i.test(file.name);
    if (!isImage) {
      return reject(new Error('الملف المختار ليس صورة صالحة'));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failure'));
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('فشل معالجة بيانات الصورة'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });
}

/**
 * دالة إنشاء صورة مصغرة فائقة الخفة (~20KB) لقوائم المنتجات لتسريع تصفح المتجر
 */
export function compressThumbnail(source: File | string, maxDim = 320, quality = 0.55): Promise<string> {
  return new Promise((resolve, reject) => {
    const processImage = (src: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('فشل معالجة الكانفاس'));
        ctx.drawImage(img, 0, 0, width, height);
        // خفض الحجم إلى صورة مصغرة خفيفة جداً (~20KB)
        const thumbBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(thumbBase64);
      };
      img.onerror = () => {
        // Fallback: if external URL fails CORS canvas, resolve original string
        resolve(src);
      };
      img.src = src;
    };

    if (typeof source === 'string') {
      processImage(source);
    } else {
      const reader = new FileReader();
      reader.onload = () => processImage(reader.result as string);
      reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المصغرة'));
      reader.readAsDataURL(source);
    }
  });
}

/**
 * تشفير كلمة المرور عبر SHA-256 للحفاظ على أمان بيانات المدير
 */
export async function hashPassword(str: string): Promise<string> {
  if (!str) return '';
  const enc = new TextEncoder().encode(str.trim() + '_by_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

