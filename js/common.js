import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Hàm đăng xuất
export function setupLogoutButton(redirectPath = 'index.html') {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = redirectPath;
        });
    }
}

// Hàm lấy quyền
export async function getUserRole(uid) {
    try {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().role; 
        }
    } catch (e) { console.error(e); }
    return 'guest';
}

// Hàm bảo vệ trang
// ĐÃ SỬA: Bỏ kiểm tra đuôi email. Chấp nhận mọi email Google.
export function requireAuth(callback, failRedirectPath = 'index.html') {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = failRedirectPath;
        } else {
            // Không còn kiểm tra @dhhp.edu.vn ở đây nữa
            const role = await getUserRole(user.uid);
            callback(user, role);
        }
    });
}