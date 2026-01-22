import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setupLogoutButton, getUserRole } from './common.js';

const loginOverlay = document.getElementById('login-overlay');
const dashboardUi = document.getElementById('dashboard-ui');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-google-login');

// --- XỬ LÝ ĐĂNG NHẬP ---
btnLogin.addEventListener('click', async () => {
    loginError.classList.add('hidden');
    try {
        const result = await signInWithPopup(auth, provider);
        handleUserCheck(result.user);
    } catch (error) {
        loginError.textContent = "Lỗi: " + error.message;
        loginError.classList.remove('hidden');
    }
});

// Kiểm tra user sau khi đăng nhập
async function handleUserCheck(user) {
    // 1. Check Domain
    if (!user.email.endsWith('@dhhp.edu.vn')) {
        await signOut(auth);
        alert("Chỉ chấp nhận email @dhhp.edu.vn");
        return;
    }

    // 2. Lưu/Cập nhật user vào DB
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    let role = 'member';

    if (userSnap.exists()) {
        role = userSnap.data().role;
    } else {
        // Nếu là user đầu tiên của hệ thống -> Admin
        const qAdmin = query(collection(db, 'users'), where("role", "==", "admin"));
        const adminSnaps = await getDocs(qAdmin);
        if (adminSnaps.empty) role = 'admin';

        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName,
            role: role,
            createdAt: Date.now()
        });
    }

    // 3. Hiển thị UI
    showDashboard(user, role);
}

// Hiển thị giao diện Dashboard
function showDashboard(user, role) {
    loginOverlay.style.display = 'none';
    dashboardUi.classList.remove('hidden');
    dashboardUi.classList.add('flex');

    document.getElementById('user-name').textContent = user.displayName;
    document.getElementById('user-role').textContent = role === 'admin' ? 'Quản trị viên' : 'Giảng viên';

    // Nếu là Admin, hiện thêm module quản lý user
    if (role === 'admin') {
        document.getElementById('admin-module').classList.remove('hidden');
    }

    setupLogoutButton();
}

// Giữ trạng thái đăng nhập
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const role = await getUserRole(user.uid);
        showDashboard(user, role);
    } else {
        loginOverlay.style.display = 'flex';
        dashboardUi.classList.remove('flex');
        dashboardUi.classList.add('hidden');
    }
});