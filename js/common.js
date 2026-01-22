import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Hàm đăng xuất (Dùng cho mọi trang)
export function setupLogoutButton() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = 'index.html'; // Về trang chủ sau khi thoát
        });
    }
}

// Hàm lấy thông tin quyền hạn (Role) của user từ Firestore
export async function getUserRole(uid) {
    try {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().role; // 'admin' hoặc 'member'
        }
    } catch (e) {
        console.error("Lỗi lấy quyền:", e);
    }
    return 'guest';
}

// Hàm bảo vệ trang con (Dùng cho articles.html...)
// Nếu chưa đăng nhập -> Đá về index.html
export function requireAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Chưa đăng nhập, chuyển hướng về trang chủ
            window.location.href = 'index.html';
        } else {
            // Đã đăng nhập, kiểm tra domain lần nữa cho chắc
            if (!user.email.endsWith('@dhhp.edu.vn')) {
                await signOut(auth);
                alert("Email không hợp lệ!");
                window.location.href = 'index.html';
                return;
            }
            // Gọi callback để chạy logic của trang đó
            const role = await getUserRole(user.uid);
            callback(user, role);
        }
    });
}