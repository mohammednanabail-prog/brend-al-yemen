import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  updateDoc,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db, hashPassword } from './firebase';
import type { Product, Category, Ad, Testimonial, StoreSettings, StoreStats, AdminCredentials } from './types';
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_ADS, DEMO_TESTIMONIALS } from './demoData';

export const DEFAULT_SETTINGS: StoreSettings = {
  shopName: 'براند اليمن',
  shopNameEn: 'BRAND YEMEN',
  shopSub: 'للخياطة والتفصيل',
  tagline: 'أناقة .. تليق بك',
  logoUrl: 'https://i.ibb.co/gLjGLrDx/JPEG-4522247807038347929.jpg',
  whatsapp: '201503256581', // رقم صاحب المحل المحدد: +20 15 03256581
  currency: 'ريال',
  waTemplate:
    'السلام عليكم،\nأرغب في طلب هذا المنتج:\n\nاسم المنتج: {name}\nالسعر: {price} {currency}\nالقسم: {category}\nاللون: {color}\nالمقاس: {size}\n\nأرغب في معرفة التفاصيل وإتمام الطلب.',
  waGeneral: 'السلام عليكم،\nأرغب في الاستفسار عن خدمات التفصيل لدى {shop}.',
  showFloatWa: true,
  hoursOpen: '09:00',
  hoursClose: '22:00',
  address: 'صنعاء - شارع تعز',
  mapUrl: '',
  socFb: '',
  socIg: '',
  socTt: '',
  socTw: '',
  aboutText:
    'براند اليمن بيت خبرة في الخياطة والتفصيل الرجالي والنسائي، نجمع بين أصالة الحرفة اليمنية ودقة القصّات العصرية. أقمشة مختارة بعناية، خياطة يدوية متقنة، والتزام كامل بالمواعيد — لأن أناقتك تستحق.',
  homeShow: {
    promo: true,
    cats: true,
    latest: true,
    sale: true,
    feat: true,
    testi: true,
    about: true,
  },
};

// ======================= المنتجات =======================

export function subscribeProducts(
  onData: (products: Product[]) => void,
  onError?: (err: Error) => void
) {
  const col = collection(db, 'products');
  return onSnapshot(
    col,
    (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as Product), id: d.id });
      });
      // Sort newest first
      items.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      onData(items);
    },
    (err) => {
      console.error('Error fetching products from Firestore:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveProduct(product: Product): Promise<void> {
  // Ensure maximum 5 images
  if (product.images.length > 5) {
    product.images = product.images.slice(0, 5);
  }

  // Ensure initial stats fields are numbers starting from 0 if missing
  const cleanProduct: Product = {
    ...product,
    views: typeof product.views === 'number' ? product.views : 0,
    waClicks: typeof product.waClicks === 'number' ? product.waClicks : 0,
    thumbnail: product.thumbnail || product.images[0] || '',
  };

  // Check document size limit (~900KB safety limit)
  const sizeEstimate = new Blob([JSON.stringify(cleanProduct)]).size;
  if (sizeEstimate > 920 * 1024) {
    throw new Error('حجم بيانات المنتج والصور يتجاوز الحد الأقصى المسموح به (900KB). يرجى تقليل عدد الصور.');
  }

  const ref = doc(db, 'products', cleanProduct.id);
  await setDoc(ref, cleanProduct, { merge: true });
}

export async function deleteProduct(productId: string): Promise<void> {
  const ref = doc(db, 'products', productId);
  await deleteDoc(ref);
}

/**
 * احتساب مشاهدة حقيقية للمنتج - يحسب مرة واحدة فقط لكل زائر في كل جلسة
 */
export async function recordProductView(productId: string): Promise<void> {
  try {
    const sessionKey = `by_v_p_${productId}`;
    if (sessionStorage.getItem(sessionKey)) {
      return; // تم احتسابه مسبقاً في هذه الجلسة
    }
    sessionStorage.setItem(sessionKey, '1');

    const ref = doc(db, 'products', productId);
    await updateDoc(ref, {
      views: increment(1),
    });
  } catch (err) {
    console.warn('Could not increment product view:', err);
  }
}

// التوافق مع النداءات السابقة
export const incrementProductView = recordProductView;

/**
 * احتساب ضغطة زر واتساب حقيقية لطلب المنتج - يحسب مرة واحدة لكل زائر في كل جلسة
 */
export async function recordProductWaClick(productId: string): Promise<void> {
  try {
    const sessionKey = `by_wa_p_${productId}`;
    if (sessionStorage.getItem(sessionKey)) {
      return; // تم احتسابه مسبقاً في هذه الجلسة
    }
    sessionStorage.setItem(sessionKey, '1');

    const ref = doc(db, 'products', productId);
    await updateDoc(ref, {
      waClicks: increment(1),
    });
  } catch (err) {
    console.warn('Could not increment product WhatsApp clicks:', err);
  }
}

// ======================= الأقسام =======================

export function subscribeCategories(
  onData: (categories: Category[]) => void,
  onError?: (err: Error) => void
) {
  const col = collection(db, 'categories');
  return onSnapshot(
    col,
    (snapshot) => {
      const items: Category[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as Category), id: d.id });
      });
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      onData(items);
    },
    (err) => {
      console.error('Error fetching categories:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveCategory(category: Category): Promise<void> {
  const ref = doc(db, 'categories', category.id);
  await setDoc(ref, category, { merge: true });
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const ref = doc(db, 'categories', categoryId);
  await deleteDoc(ref);
}

// ======================= الإعلانات =======================

export function subscribeAds(
  onData: (ads: Ad[]) => void,
  onError?: (err: Error) => void
) {
  const col = collection(db, 'ads');
  return onSnapshot(
    col,
    (snapshot) => {
      const items: Ad[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as Ad), id: d.id });
      });
      onData(items);
    },
    (err) => {
      console.error('Error fetching ads:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveAd(ad: Ad): Promise<void> {
  const ref = doc(db, 'ads', ad.id);
  await setDoc(ref, ad, { merge: true });
}

export async function deleteAd(adId: string): Promise<void> {
  const ref = doc(db, 'ads', adId);
  await deleteDoc(ref);
}

// ======================= آراء العملاء =======================

export function subscribeTestimonials(
  onData: (testi: Testimonial[]) => void,
  onError?: (err: Error) => void
) {
  const col = collection(db, 'testimonials');
  return onSnapshot(
    col,
    (snapshot) => {
      const items: Testimonial[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as Testimonial), id: d.id });
      });
      onData(items);
    },
    (err) => {
      console.error('Error fetching testimonials:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveTestimonial(testi: Testimonial): Promise<void> {
  const ref = doc(db, 'testimonials', testi.id);
  await setDoc(ref, testi, { merge: true });
}

export async function deleteTestimonial(testiId: string): Promise<void> {
  const ref = doc(db, 'testimonials', testiId);
  await deleteDoc(ref);
}

// ======================= الإعدادات =======================

export function subscribeSettings(
  onData: (settings: StoreSettings) => void,
  onError?: (err: Error) => void
) {
  const ref = doc(db, 'settings', 'general');
  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<StoreSettings>;
        onData({
          ...DEFAULT_SETTINGS,
          ...data,
          homeShow: { ...DEFAULT_SETTINGS.homeShow, ...data.homeShow },
        });
      } else {
        onData(DEFAULT_SETTINGS);
      }
    },
    (err) => {
      console.error('Error fetching settings:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  const ref = doc(db, 'settings', 'general');
  await setDoc(ref, settings, { merge: true });
}

// ======================= النسخ الاحتياطي والاستيراد =======================

export async function exportFullBackup(): Promise<{
  exportedAt: string;
  categories: Category[];
  products: Product[];
  ads: Ad[];
  testimonials: Testimonial[];
  settings: StoreSettings;
}> {
  const [prodsSnap, catsSnap, adsSnap, testiSnap, setSnap] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'ads')),
    getDocs(collection(db, 'testimonials')),
    getDocs(collection(db, 'settings')),
  ]);

  const products: Product[] = [];
  prodsSnap.forEach((d) => products.push({ ...(d.data() as Product), id: d.id }));

  const categories: Category[] = [];
  catsSnap.forEach((d) => categories.push({ ...(d.data() as Category), id: d.id }));

  const ads: Ad[] = [];
  adsSnap.forEach((d) => ads.push({ ...(d.data() as Ad), id: d.id }));

  const testimonials: Testimonial[] = [];
  testiSnap.forEach((d) => testimonials.push({ ...(d.data() as Testimonial), id: d.id }));

  let settings = DEFAULT_SETTINGS;
  setSnap.forEach((d) => {
    if (d.id === 'general') {
      settings = { ...DEFAULT_SETTINGS, ...(d.data() as StoreSettings) };
    }
  });

  return {
    exportedAt: new Date().toISOString(),
    categories,
    products,
    ads,
    testimonials,
    settings,
  };
}

export async function importFullBackup(data: {
  categories?: Category[];
  products?: Product[];
  ads?: Ad[];
  testimonials?: Testimonial[];
  settings?: StoreSettings;
}): Promise<void> {
  const batch = writeBatch(db);

  if (Array.isArray(data.categories)) {
    for (const c of data.categories) {
      batch.set(doc(db, 'categories', c.id), c, { merge: true });
    }
  }

  if (Array.isArray(data.products)) {
    for (const p of data.products) {
      batch.set(doc(db, 'products', p.id), p, { merge: true });
    }
  }

  if (Array.isArray(data.ads)) {
    for (const a of data.ads) {
      batch.set(doc(db, 'ads', a.id), a, { merge: true });
    }
  }

  if (Array.isArray(data.testimonials)) {
    for (const t of data.testimonials) {
      batch.set(doc(db, 'testimonials', t.id), t, { merge: true });
    }
  }

  if (data.settings) {
    batch.set(doc(db, 'settings', 'general'), data.settings, { merge: true });
  }

  await batch.commit();
}

/**
 * استيراد وإضافة المنتجات التجريبية والأقسام إلى قاعدة بيانات Firestore بضغطة واحدة
 */
export async function seedDemoProductsToFirestore(): Promise<number> {
  const batch = writeBatch(db);

  for (const c of DEMO_CATEGORIES) {
    batch.set(doc(db, 'categories', c.id), c, { merge: true });
  }

  for (const p of DEMO_PRODUCTS) {
    batch.set(
      doc(db, 'products', p.id),
      {
        ...p,
        views: typeof p.views === 'number' ? p.views : 0,
        waClicks: typeof p.waClicks === 'number' ? p.waClicks : 0,
        thumbnail: p.thumbnail || p.images[0] || '',
      },
      { merge: true }
    );
  }

  for (const a of DEMO_ADS) {
    batch.set(doc(db, 'ads', a.id), a, { merge: true });
  }

  for (const t of DEMO_TESTIMONIALS) {
    batch.set(doc(db, 'testimonials', t.id), t, { merge: true });
  }

  batch.set(doc(db, 'settings', 'general'), DEFAULT_SETTINGS, { merge: true });

  await batch.commit();
  return DEMO_PRODUCTS.length;
}

// ======================= الإحصائيات الحقيقية للمتجر =======================

export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * تسجيل زيارة حقيقية للمتجر - يُحسب الزائر مرة واحدة فقط لكل جلسة متصفح
 */
export async function recordSiteVisit(): Promise<void> {
  try {
    const sessionKey = 'by_site_visited_session';
    if (sessionStorage.getItem(sessionKey)) {
      return; // محسوب مسبقاً في هذه الجلسة
    }
    sessionStorage.setItem(sessionKey, '1');

    const todayStr = getTodayString();
    const statsRef = doc(db, 'stats', 'summary');
    const snap = await getDoc(statsRef);

    if (!snap.exists()) {
      await setDoc(statsRef, {
        totalVisits: 1,
        todayVisits: 1,
        todayDate: todayStr,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const data = snap.data() as Partial<StoreStats>;
      if (data.todayDate === todayStr) {
        await updateDoc(statsRef, {
          totalVisits: increment(1),
          todayVisits: increment(1),
          updatedAt: new Date().toISOString(),
        });
      } else {
        // يوم جديد: إعادة تصفير عداد اليوم لليوم الجديد
        await updateDoc(statsRef, {
          totalVisits: increment(1),
          todayVisits: 1,
          todayDate: todayStr,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Could not record site visit in Firestore:', err);
  }
}

/**
 * الاشتراك في قراءة إحصائيات المتجر لحظياً للوحة تحكم المدير
 */
export function subscribeStoreStats(
  onData: (stats: StoreStats) => void,
  onError?: (err: Error) => void
) {
  const statsRef = doc(db, 'stats', 'summary');
  return onSnapshot(
    statsRef,
    (snap) => {
      const todayStr = getTodayString();
      if (snap.exists()) {
        const data = snap.data() as Partial<StoreStats>;
        const isToday = data.todayDate === todayStr;
        onData({
          totalVisits: data.totalVisits || 0,
          todayVisits: isToday ? (data.todayVisits || 0) : 0,
          todayDate: todayStr,
          updatedAt: data.updatedAt,
        });
      } else {
        onData({
          totalVisits: 0,
          todayVisits: 0,
          todayDate: todayStr,
        });
      }
    },
    (err) => {
      console.error('Error fetching store stats:', err);
      if (onError) onError(err);
    }
  );
}

// ======================= نظام دخول المدير (اسم مستخدم وكلمة مرور) =======================

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD_PLAIN = 'brand2026';

export async function getAdminCredentials(): Promise<AdminCredentials> {
  try {
    const credRef = doc(db, 'admin_auth', 'credentials');
    const snap = await getDoc(credRef);
    if (snap.exists()) {
      const data = snap.data() as AdminCredentials;
      if (data.username && data.passwordHash) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not read admin credentials from Firestore, using local fallback:', err);
  }

  const cachedUser = localStorage.getItem('by_adm_user');
  const cachedHash = localStorage.getItem('by_adm_hash');
  const cachedUpdatedAt = localStorage.getItem('by_adm_updated_at');

  if (cachedUser && cachedHash) {
    return {
      username: cachedUser,
      passwordHash: cachedHash,
      updatedAt: cachedUpdatedAt || undefined,
    };
  }

  return {
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: await hashPassword(DEFAULT_ADMIN_PASSWORD_PLAIN),
  };
}

export async function saveAdminCredentials(username: string, newPasswordPlain: string): Promise<void> {
  const passwordHash = await hashPassword(newPasswordPlain);
  const cleanUsername = username.trim();
  const now = new Date().toISOString();
  const creds: AdminCredentials = {
    username: cleanUsername,
    passwordHash,
    updatedAt: now,
  };

  try {
    const credRef = doc(db, 'admin_auth', 'credentials');
    await setDoc(credRef, creds, { merge: true });
  } catch (err) {
    console.warn('Failed to save admin credentials to Firestore, saving locally:', err);
  }

  localStorage.setItem('by_adm_user', cleanUsername);
  localStorage.setItem('by_adm_hash', passwordHash);
  localStorage.setItem('by_adm_updated_at', now);
}

export async function verifyAdminLogin(
  username: string,
  passwordPlain: string
): Promise<{ success: boolean; error?: string }> {
  const cleanUser = username.trim();
  const cleanPass = passwordPlain.trim();
  if (!cleanUser || !cleanPass) {
    return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  const currentCreds = await getAdminCredentials();
  const inputHash = await hashPassword(cleanPass);

  if (
    cleanUser.toLowerCase() === currentCreds.username.toLowerCase() &&
    inputHash === currentCreds.passwordHash
  ) {
    return { success: true };
  }

  // السماح بالبيانات الافتراضية فقط إذا لم يسبق للمستخدم تغيير بيانات الدخول على الإطلاق
  if (
    !currentCreds.updatedAt &&
    cleanUser.toLowerCase() === DEFAULT_ADMIN_USERNAME.toLowerCase() &&
    cleanPass === DEFAULT_ADMIN_PASSWORD_PLAIN
  ) {
    return { success: true };
  }

  return {
    success: false,
    error: 'اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات والمحاولة مجدداً.',
  };
}

