// Import các biến kết nối từ file cấu hình riêng
import { auth, db, provider } from './firebase-config.js';

// Import các hàm từ thư viện Firebase
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot, getDoc, setDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- TRẠNG THÁI ---
let currentUser = null;
let currentRole = 'guest'; // admin, member, guest

// --- ĐƯỜNG DẪN FIRESTORE ---
// Lưu trực tiếp vào collection 'articles' và 'users' trên Firebase của bạn
const getArticlesRef = () => collection(db, 'articles');
const getUsersRef = () => collection(db, 'users');

// --- XỬ LÝ ĐĂNG NHẬP ---

const btnLogin = document.getElementById('btn-google-login');
const loginOverlay = document.getElementById('login-overlay');
const appUi = document.getElementById('app-ui');
const loginError = document.getElementById('login-error');

// Xử lý sự kiện click nút đăng nhập
btnLogin.addEventListener('click', async () => {
    loginError.classList.add('hidden');
    try {
        // Đăng nhập bằng Google Popup
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        await handleUserLogin(user);

    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        loginError.textContent = "Lỗi: " + error.message;
        loginError.classList.remove('hidden');
    }
});

// Hàm kiểm tra User & Phân quyền
async function handleUserLogin(user) {
    // 1. Kiểm tra đuôi Email (@dhhp.edu.vn)
    if (user.email && !user.email.endsWith('@dhhp.edu.vn')) {
        await signOut(auth); // Đăng xuất ngay nếu sai email
        loginError.textContent = "Chỉ chấp nhận email nhà trường (@dhhp.edu.vn)!";
        loginError.classList.remove('hidden');
        return;
    }

    // 2. Kiểm tra/Tạo User trong Database
    const userDocRef = doc(getUsersRef(), user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        // Nếu user đã tồn tại, lấy quyền hiện tại
        currentRole = userSnap.data().role;
    } else {
        // Nếu là user mới: Kiểm tra xem đã có Admin nào chưa?
        const qAdmin = query(getUsersRef(), where("role", "==", "admin"));
        const adminSnaps = await getDocs(qAdmin);
        
        // Người đầu tiên sẽ là Admin, người sau là Member
        currentRole = adminSnaps.empty ? 'admin' : 'member';
        
        // Lưu thông tin user mới
        await setDoc(userDocRef, {
            email: user.email,
            displayName: user.displayName,
            role: currentRole,
            createdAt: Date.now()
        });
    }

    // 3. Ẩn màn hình đăng nhập & Hiện giao diện chính
    loginOverlay.style.display = 'none';
    appUi.classList.remove('hidden');
    appUi.style.display = 'flex';
    
    updateUIByRole(user);
    loadArticles();
}

// Nút Đăng xuất
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth);
    location.reload(); // Tải lại trang để reset trạng thái
});

// Giữ trạng thái đăng nhập khi F5
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        handleUserLogin(user);
    } else {
        // Nếu chưa đăng nhập, hiện lại màn hình login
        loginOverlay.style.display = 'flex';
        appUi.classList.add('hidden');
    }
});

// --- CẬP NHẬT GIAO DIỆN THEO QUYỀN (UI) ---

function updateUIByRole(user) {
    // Hiển thị tên user trên thanh menu
    document.getElementById('user-name').textContent = user.displayName || user.email;
    
    // Hiển thị nhãn quyền (Admin/Giảng viên)
    const badge = document.getElementById('user-role-badge');
    badge.textContent = currentRole === 'admin' ? 'Quản trị viên' : 'Giảng viên';
    badge.className = `text-xs px-2 rounded inline-block ${currentRole === 'admin' ? 'bg-red-600' : 'bg-blue-600'}`;

    // Lấy các phần tử giao diện cần ẩn/hiện
    const adminElements = document.querySelectorAll('.admin-only');
    const btnAdd = document.getElementById('btn-add-new');
    const btnManage = document.getElementById('btn-manage-users');

    // Logic hiển thị nút
    if (currentRole === 'admin') {
        // Admin: Thấy hết
        btnAdd.classList.remove('hidden');
        btnManage.classList.remove('hidden');
        adminElements.forEach(el => el.classList.remove('hidden'));
    } 
    else if (currentRole === 'member') {
        // Member: Thấy nút thêm, nhưng không quản lý user, không xóa bài người khác
        btnAdd.classList.remove('hidden');
        btnManage.classList.add('hidden');
        adminElements.forEach(el => el.classList.add('hidden'));
    }
    else {
        // Guest: Chỉ xem
        btnAdd.classList.add('hidden');
        btnManage.classList.add('hidden');
    }

    // Tự động điền thông tin vào Mẫu In
    const userNameUpper = (user.displayName || "LÊ NGỌC MINH").toUpperCase();
    document.getElementById('print-name').textContent = userNameUpper;
    document.getElementById('print-email').textContent = user.email || "minhln@dhhp.edu.vn";
    document.getElementById('print-signer').textContent = "ThS " + (user.displayName || "Lê Ngọc Minh");
}

// --- QUẢN LÝ BÀI BÁO (ARTICLES) ---

function loadArticles() {
    const loader = document.getElementById('loading-indicator');
    const tbody = document.getElementById('article-table-body');
    const printBody = document.getElementById('print-table-body');
    const emptyState = document.getElementById('empty-state');

    // Lắng nghe dữ liệu realtime từ Firestore
    onSnapshot(query(getArticlesRef()), (snapshot) => {
        const articles = [];
        snapshot.forEach(d => articles.push({id: d.id, ...d.data()}));
        
        // Sắp xếp bài mới nhất lên trên
        articles.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

        loader.classList.add('hidden');
        tbody.innerHTML = '';
        printBody.innerHTML = '';

        // Cập nhật ngày tháng hiện tại vào mẫu in
        const now = new Date();
        document.getElementById('print-day').textContent = now.getDate();
        document.getElementById('print-month').textContent = now.getMonth() + 1;
        document.getElementById('print-year').textContent = now.getFullYear();

        // Hiển thị thông báo nếu không có dữ liệu
        if (articles.length === 0) emptyState.classList.remove('hidden');
        else emptyState.classList.add('hidden');

        // Vẽ bảng
        articles.forEach((item, index) => {
            // 1. Vẽ vào bảng quản lý (Dashboard)
            const tr = document.createElement('tr');
            tr.className = "border-b hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-5 py-4 text-center text-sm font-medium text-gray-700">${index + 1}</td>
                <td class="px-5 py-4 text-sm font-semibold text-blue-900">${item.tenBai}</td>
                <td class="px-5 py-4 text-sm text-gray-600 italic">${item.tacGia}</td>
                <td class="px-5 py-4 text-sm text-gray-600">${item.noiCongBo}</td>
                <td class="px-5 py-4 text-center"><span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap">${item.danhMuc}</span></td>
                <td class="px-5 py-4 text-center admin-only ${currentRole !== 'admin' ? 'hidden' : ''}">
                    <button class="btn-edit text-blue-600 hover:text-blue-900 mr-3" title="Sửa"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete text-red-600 hover:text-red-900" title="Xóa"><i class="fas fa-trash"></i></button>
                </td>
            `;
            
            // Gán sự kiện nút sửa/xóa (chỉ cho Admin)
            if(currentRole === 'admin') {
                tr.querySelector('.btn-edit').onclick = () => openModal(item);
                tr.querySelector('.btn-delete').onclick = () => deleteItem(item.id);
            }
            tbody.appendChild(tr);

            // 2. Vẽ vào bảng In ấn (Print Form)
            printBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>${item.tenBai}</td>
                    <td>${item.tacGia}</td>
                    <td>${item.noiCongBo}</td>
                    <td style="text-align: center;">${item.danhMuc}</td>
                </tr>
            `);
        });

        // Vẽ thêm dòng trống vào bảng in cho đẹp (nếu ít hơn 5 dòng)
        if (articles.length < 5) {
            for(let i=0; i< (5-articles.length); i++) 
                printBody.insertAdjacentHTML('beforeend', '<tr><td></td><td></td><td></td><td></td><td></td></tr>');
        }
    });
}

// --- THÊM / SỬA / XÓA BÀI BÁO ---
let editingId = null;

// Mở modal nhập liệu
window.openModal = (item = null) => {
    const form = document.getElementById('form-article');
    form.reset();
    editingId = null;
    document.getElementById('modal-title').textContent = "Thêm Bài Báo Mới";
    
    // Nếu là chế độ sửa, điền dữ liệu cũ vào form
    if (item) {
        editingId = item.id;
        document.getElementById('modal-title').textContent = "Cập Nhật Bài Báo";
        document.getElementById('ten-bai').value = item.tenBai;
        document.getElementById('tac-gia').value = item.tacGia;
        document.getElementById('noi-cong-bo').value = item.noiCongBo;
        document.getElementById('danh-muc').value = item.danhMuc;
    }
    document.getElementById('article-modal').classList.remove('hidden');
};

// Đóng modal
window.closeModal = () => document.getElementById('article-modal').classList.add('hidden');

// Lưu dữ liệu (Submit form)
document.getElementById('form-article').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        tenBai: document.getElementById('ten-bai').value,
        tacGia: document.getElementById('tac-gia').value,
        noiCongBo: document.getElementById('noi-cong-bo').value,
        danhMuc: document.getElementById('danh-muc').value,
        updatedAt: Date.now()
    };
    
    try {
        if (editingId) {
            // Cập nhật bài cũ
            await updateDoc(doc(getArticlesRef(), editingId), data);
        } else {
            // Thêm bài mới
            data.createdAt = Date.now();
            await addDoc(getArticlesRef(), data);
        }
        closeModal();
    } catch (err) { 
        alert("Lỗi lưu dữ liệu: " + err.message); 
    }
});

// Xóa bài báo
window.deleteItem = async (id) => {
    if(confirm("Bạn có chắc chắn muốn xóa bài báo này không?")) {
        await deleteDoc(doc(getArticlesRef(), id));
    }
};

// --- QUẢN LÝ NGƯỜI DÙNG (CHỈ ADMIN) ---
window.openUserModal = () => {
    document.getElementById('users-modal').classList.remove('hidden');
    loadUsersList();
};

function loadUsersList() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4">Đang tải...</td></tr>';
    
    getDocs(getUsersRef()).then(snap => {
        tbody.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            const tr = document.createElement('tr');
            tr.className = "border-b";
            const isSelf = d.id === currentUser.uid;
            
            // Vẽ dòng user
            tr.innerHTML = `
                <td class="px-4 py-2">
                    ${u.email} <br> 
                    <span class="text-gray-400 text-xs">${u.displayName}</span>
                </td>
                <td class="px-4 py-2">
                    <span class="px-2 py-1 rounded text-xs ${u.role==='admin'?'bg-red-100 text-red-800':'bg-blue-100 text-blue-800'}">
                        ${u.role}
                    </span>
                </td>
                <td class="px-4 py-2">
                    ${!isSelf ? `
                        <button class="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600" onclick="window.changeRole('${d.id}', '${u.role==='admin'?'member':'admin'}')">
                            Đổi thành ${u.role==='admin'?'Giảng viên':'Admin'}
                        </button>
                    ` : '<span class="text-xs text-gray-400 italic">Đây là bạn</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

// Đổi quyền user
window.changeRole = async (uid, newRole) => {
    await updateDoc(doc(getUsersRef(), uid), { role: newRole });
    loadUsersList(); // Tải lại bảng user
};

// --- CHẾ ĐỘ XEM TRƯỚC (PREVIEW MODE) ---
window.togglePreview = () => {
    const p = document.getElementById('print-area');
    const app = document.getElementById('app-ui');
    
    if (p.classList.contains('preview-mode')) {
        // Tắt xem trước -> Về trang quản lý
        p.classList.remove('preview-mode');
        app.style.display = 'flex';
    } else {
        // Bật xem trước -> Ẩn trang quản lý
        p.classList.add('preview-mode');
        app.style.display = 'none';
        window.scrollTo(0,0);
    }
};

// Tìm kiếm bài báo (Client-side)
document.getElementById('search-input').addEventListener('keyup', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#article-table-body tr');
    
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
});