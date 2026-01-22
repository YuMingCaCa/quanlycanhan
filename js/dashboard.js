import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setupLogoutButton, getUserRole } from './common.js';

const loginOverlay = document.getElementById('login-overlay');
const dashboardUi = document.getElementById('dashboard-ui');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-google-login');

// XỬ LÝ ĐĂNG NHẬP
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
    // ĐÃ XÓA: Kiểm tra domain @dhhp.edu.vn
    // Chấp nhận mọi tài khoản Google

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    let userData = null;

    if (userSnap.exists()) {
        userData = userSnap.data();
    } else {
        // User mới tinh -> Kiểm tra xem có ai là Admin chưa?
        const qAdmin = query(collection(db, 'users'), where("role", "==", "admin"));
        const adminSnaps = await getDocs(qAdmin);
        
        // Nếu chưa có ai -> Admin. Nếu có rồi -> Pending (Chờ duyệt)
        const initialRole = adminSnaps.empty ? 'admin' : 'pending'; 
        
        userData = {
            email: user.email,
            displayName: user.displayName,
            role: initialRole,
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
    
    const roleBadge = document.getElementById('user-role');
    const warningBox = document.getElementById('pending-warning');
    const moduleArticles = document.getElementById('module-articles');
    const moduleAdmin = document.getElementById('admin-module');

    warningBox.classList.add('hidden');
    moduleArticles.classList.remove('opacity-50', 'pointer-events-none');
    moduleAdmin.classList.add('hidden');

    // Hiển thị giao diện theo quyền
    if (userData.role === 'admin') {
        roleBadge.textContent = 'Quản trị viên';
        roleBadge.className = 'text-xs bg-red-600 px-2 py-0.5 rounded inline-block text-white';
        moduleAdmin.classList.remove('hidden');
    } 
    else if (userData.role === 'pending') {
        roleBadge.textContent = 'Chờ duyệt';
        roleBadge.className = 'text-xs bg-yellow-500 px-2 py-0.5 rounded inline-block text-white';
        
        // Hiện cảnh báo và khóa chức năng
        warningBox.classList.remove('hidden');
        moduleArticles.classList.add('opacity-50', 'pointer-events-none');
    } 
    else {
        // Đã duyệt (Giảng viên/Khách...)
        roleBadge.textContent = 'Thành viên';
        roleBadge.className = 'text-xs bg-blue-600 px-2 py-0.5 rounded inline-block text-white';
        
        // Kiểm tra quyền vào module cụ thể
        if (!userData.permissions?.can_access_articles) {
            moduleArticles.classList.add('opacity-50', 'pointer-events-none');
        }
    }

    setupLogoutButton();
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Lấy thông tin mới nhất từ DB để đảm bảo quyền đúng (ví dụ vừa được admin duyệt xong)
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            showDashboard(user, snap.data());
        } else {
            // Trường hợp user xóa trong DB nhưng auth vẫn còn lưu
            handleUserCheck(user);
        }
    } else {
        loginOverlay.style.display = 'flex';
        dashboardUi.classList.remove('flex');
        dashboardUi.classList.add('hidden');
    }
});