import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Hàm đăng xuất
// redirectPath: Đường dẫn sẽ chuyển về sau khi logout (Mặc định là index.html)
export function setupLogoutButton(redirectPath = 'index.html') {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = redirectPath;
        });
    }
}

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
// failRedirectPath: Đường dẫn sẽ đá về nếu chưa đăng nhập (Ví dụ: ../index.html)
export function requireAuth(callback, failRedirectPath = 'index.html') {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = failRedirectPath;
        } else {
            if (!user.email.endsWith('@dhhp.edu.vn')) {
                await signOut(auth);
                alert("Email không hợp lệ!");
                window.location.href = failRedirectPath;
                return;
            }
            const role = await getUserRole(user.uid);
            callback(user, role);
        }
    });
}