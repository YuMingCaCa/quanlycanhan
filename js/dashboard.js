import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setupLogoutButton, getUserRole } from './common.js';

const loginOverlay = document.getElementById('login-overlay');
const dashboardUi = document.getElementById('dashboard-ui');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-google-login');

// XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ
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

async function handleUserCheck(user) {
    if (!user.email.endsWith('@dhhp.edu.vn')) {
        await signOut(auth);
        alert("Chỉ chấp nhận email @dhhp.edu.vn");
        return;
    }

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    let userData = null;

    if (userSnap.exists()) {
        userData = userSnap.data();
    } else {
        // --- LOGIC MỚI: Người đầu tiên là Admin, người sau là 'pending' (Chờ duyệt) ---
        const qAdmin = query(collection(db, 'users'), where("role", "==", "admin"));
        const adminSnaps = await getDocs(qAdmin);
        
        const initialRole = adminSnaps.empty ? 'admin' : 'pending'; // Mặc định là chờ duyệt
        
        userData = {
            email: user.email,
            displayName: user.displayName,
            role: initialRole,
            // Các quyền mặc định (false hết nếu là pending)
            permissions: {
                can_access_articles: initialRole === 'admin',
                view_all_articles: initialRole === 'admin',
                can_create_article: initialRole === 'admin'
            },
            createdAt: Date.now()
        };

        await setDoc(userRef, userData);
    }

    showDashboard(user, userData);
}

function showDashboard(user, userData) {
    loginOverlay.style.display = 'none';
    dashboardUi.classList.remove('hidden');
    dashboardUi.classList.add('flex');

    document.getElementById('user-name').textContent = user.displayName;
    
    // --- HIỂN THỊ TRẠNG THÁI ---
    const roleBadge = document.getElementById('user-role');
    const warningBox = document.getElementById('pending-warning');
    const moduleArticles = document.getElementById('module-articles');
    const moduleAdmin = document.getElementById('admin-module');

    // Reset giao diện
    warningBox.classList.add('hidden');
    moduleArticles.classList.remove('opacity-50', 'pointer-events-none');
    moduleAdmin.classList.add('hidden');

    if (userData.role === 'admin') {
        roleBadge.textContent = 'Quản trị viên';
        roleBadge.className = 'text-xs bg-red-600 px-2 py-0.5 rounded inline-block text-white';
        moduleAdmin.classList.remove('hidden'); // Hiện nút quản lý User
    } 
    else if (userData.role === 'pending') {
        roleBadge.textContent = 'Chờ duyệt';
        roleBadge.className = 'text-xs bg-yellow-500 px-2 py-0.5 rounded inline-block text-white';
        
        // Hiện thông báo chờ
        warningBox.classList.remove('hidden');
        
        // Vô hiệu hóa các module
        moduleArticles.classList.add('opacity-50', 'pointer-events-none');
    } 
    else {
        // User bình thường (đã được duyệt)
        roleBadge.textContent = 'Giảng viên';
        roleBadge.className = 'text-xs bg-blue-600 px-2 py-0.5 rounded inline-block text-white';
        
        // Kiểm tra quyền vào module bài báo
        if (!userData.permissions?.can_access_articles) {
            moduleArticles.classList.add('opacity-50', 'pointer-events-none');
        }
    }

    setupLogoutButton();
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Lấy lại data mới nhất từ DB để đảm bảo quyền đúng
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            showDashboard(user, snap.data());
        }
    } else {
        loginOverlay.style.display = 'flex';
        dashboardUi.classList.remove('flex');
        dashboardUi.classList.add('hidden');
    }
});