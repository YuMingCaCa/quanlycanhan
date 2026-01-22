import { db } from './firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot, orderBy, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { requireAuth, setupLogoutButton, hasPermission } from './common.js';

// --- BIẾN TOÀN CỤC ---
let currentUser = null;
let userPerms = {}; // Lưu danh sách quyền chi tiết
const HOME_PATH = '../'; // Đường dẫn quay về trang chủ (chứa Dashboard)

// --- KHỞI TẠO VÀ KIỂM TRA QUYỀN ---
requireAuth(async (user, userData) => {
    // 1. Kiểm tra quyền truy cập module này
    // Super Admin luôn được vào. User thường phải có quyền articles.access
    const canAccess = userData.role === 'super_admin' || hasPermission(userData.permissions, 'articles', 'access');

    if (!canAccess) {
        alert("Bạn không có quyền truy cập module Bài báo.");
        window.location.href = HOME_PATH;
        return;
    }

    currentUser = user;
    userPerms = userData.permissions || {};
    
    // --- QUAN TRỌNG: Cấp full quyền ảo cho Super Admin ---
    // Điều này đảm bảo Super Admin luôn làm được mọi thứ mà không cần chỉnh sửa DB
    if (userData.role === 'super_admin') {
        userPerms.articles = { 
            access: true, 
            view_all: true, 
            create: true, 
            manage_others: true 
        };
    }

    // Hiển thị giao diện chính sau khi đã check xong
    document.getElementById('auth-loading').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');

    // Setup thông tin user trên thanh menu
    document.getElementById('user-display').textContent = user.email;
    setupLogoutButton(HOME_PATH);
    
    // Thiết lập giao diện theo quyền
    setupUI(); 
    
    // Tải dữ liệu
    loadData();
}, HOME_PATH);

// --- THIẾT LẬP GIAO DIỆN (Ẩn/Hiện nút bấm) ---
function setupUI() {
    // Điền thông tin vào mẫu in ấn
    document.getElementById('print-name').textContent = (currentUser.displayName || "").toUpperCase();
    document.getElementById('print-email').textContent = currentUser.email;
    document.getElementById('print-signer').textContent = currentUser.displayName;
    
    // Nút Thêm Mới: Chỉ hiện nếu có quyền 'create'
    if (hasPermission(userPerms, 'articles', 'create')) {
        document.getElementById('btn-add').classList.remove('hidden');
    } else {
        document.getElementById('btn-add').classList.add('hidden');
    }

    // Cột Thao tác (Header): Hiện nếu có quyền sửa bài mình HOẶC sửa bài người khác
    // Để đơn giản, ta cứ hiện cột này, logic bên trong từng dòng sẽ quyết định hiện nút hay không
    document.querySelectorAll('.action-col').forEach(el => el.classList.remove('hidden'));
}

// Helper lấy reference tới collection
const getRef = () => collection(db, 'articles');

// --- TẢI DỮ LIỆU TỪ FIRESTORE ---
function loadData() {
    let q;
    
    // Logic Lọc dữ liệu:
    // 1. Nếu có quyền 'view_all' (Xem tất cả) -> Query lấy hết
    if (hasPermission(userPerms, 'articles', 'view_all')) {
        q = query(getRef(), orderBy("createdAt", "desc"));
    } 
    // 2. Nếu không -> Chỉ lấy bài do mình tạo (createdBy == uid)
    else {
        q = query(getRef(), where("createdBy", "==", currentUser.uid), orderBy("createdAt", "desc"));
    }
    
    // Lắng nghe realtime
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('table-body');
        const printBody = document.getElementById('print-table-body');
        tbody.innerHTML = '';
        printBody.innerHTML = '';

        // Xử lý trạng thái trống
        if (snapshot.empty) document.getElementById('empty-state').classList.remove('hidden');
        else document.getElementById('empty-state').classList.add('hidden');

        let index = 1;
        snapshot.forEach(docSnap => {
            const item = { id: docSnap.id, ...docSnap.data() };
            renderRow(item, index++, tbody, printBody);
        });
        
        // Vẽ thêm dòng trống cho đẹp mẫu in (nếu ít hơn 5 dòng)
        while(index <= 5) {
             printBody.insertAdjacentHTML('beforeend', '<tr><td></td><td></td><td></td><td></td><td></td></tr>');
             index++;
        }
    }, (error) => {
        console.error("Lỗi tải dữ liệu:", error);
        // Nếu lỗi do thiếu index Firestore (thường gặp khi dùng where + orderBy)
        if (error.code === 'failed-precondition') {
             console.log("Vui lòng tạo Index trong Firestore Console theo đường link trong log.");
        }
    });
}

// --- VẼ TỪNG DÒNG DỮ LIỆU ---
function renderRow(item, index, tbody, printBody) {
    const tr = document.createElement('tr');
    tr.className = "border-b hover:bg-gray-50";
    
    // --- LOGIC QUYỀN SỬA/XÓA ---
    let canEdit = false;

    // Trường hợp 1: Bài do chính mình tạo VÀ mình vẫn còn quyền đăng bài
    if (item.createdBy === currentUser.uid && hasPermission(userPerms, 'articles', 'create')) {
        canEdit = true;
    }

    // Trường hợp 2: Có quyền quản lý tất cả (manage_others) - Dành cho Admin/Super Admin
    // Quyền này ghi đè tất cả điều kiện trên
    if (hasPermission(userPerms, 'articles', 'manage_others')) {
        canEdit = true;
    }

    const actionBtns = canEdit ? `
        <button class="text-blue-600 mr-3 hover:text-blue-800" onclick="openModal('${item.id}')" title="Sửa">
            <i class="fas fa-edit"></i>
        </button>
        <button class="text-red-600 hover:text-red-800" onclick="deleteItem('${item.id}')" title="Xóa">
            <i class="fas fa-trash"></i>
        </button>
    ` : '<span class="text-gray-300 text-xs italic">--</span>';

    // Render HTML cho Bảng Quản lý
    tr.innerHTML = `
        <td class="text-center py-3 text-gray-500">${index}</td>
        <td class="px-4 py-3 font-semibold text-blue-900">${item.tenBai || '(Chưa có tên)'}</td>
        <td class="px-4 py-3 italic text-gray-600">${item.tacGia || ''}</td>
        <td class="px-4 py-3 text-sm text-gray-700">${item.noiCongBo || ''}</td>
        <td class="text-center">
            <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                ${item.danhMuc || 'Khác'}
            </span>
        </td>
        <td class="text-center action-col">
            ${actionBtns}
        </td>
    `;
    tbody.appendChild(tr);

    // Render HTML cho Bảng In ấn (Đơn giản hơn)
    printBody.insertAdjacentHTML('beforeend', `
        <tr>
            <td style="text-align:center">${index}</td>
            <td>${item.tenBai || ''}</td>
            <td>${item.tacGia || ''}</td>
            <td>${item.noiCongBo || ''}</td>
            <td style="text-align:center">${item.danhMuc || ''}</td>
        </tr>
    `);
}

// --- CÁC CHỨC NĂNG THÊM / SỬA / XÓA ---
let editId = null;

// Mở Modal (Form nhập liệu)
window.openModal = (id = null) => {
    document.getElementById('form-article').reset();
    editId = null;
    document.getElementById('modal-title').textContent = "Thêm Bài Báo Mới";

    if (id) {
        editId = id;
        document.getElementById('modal-title').textContent = "Đang tải dữ liệu...";
        
        // Lấy dữ liệu chi tiết để điền vào form
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
            .then(({ getDoc, doc }) => getDoc(doc(db, 'articles', id)))
            .then(snap => {
                if(snap.exists()) {
                    const d = snap.data();
                    document.getElementById('ten-bai').value = d.tenBai || '';
                    document.getElementById('tac-gia').value = d.tacGia || '';
                    document.getElementById('noi-cong-bo').value = d.noiCongBo || '';
                    document.getElementById('danh-muc').value = d.danhMuc || 'Scopus Q1';
                    document.getElementById('modal-title').textContent = "Cập Nhật Bài Báo";
                }
            })
            .catch(err => alert("Lỗi tải bài báo: " + err.message));
    }
    document.getElementById('article-modal').classList.remove('hidden');
};

// Đóng Modal
window.closeModal = () => document.getElementById('article-modal').classList.add('hidden');

// Xử lý Submit Form
document.getElementById('form-article').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const oldBtnText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Đang lưu...";

    const data = {
        tenBai: document.getElementById('ten-bai').value,
        tacGia: document.getElementById('tac-gia').value,
        noiCongBo: document.getElementById('noi-cong-bo').value,
        danhMuc: document.getElementById('danh-muc').value,
        updatedAt: Date.now(),
        // Luôn lưu vết người thao tác cuối cùng nếu cần (opsional)
        // lastUpdatedBy: currentUser.email 
    };
    
    try {
        if (editId) {
            // Cập nhật bài viết
            // Lưu ý: KHÔNG cập nhật createdBy để giữ nguyên tác giả gốc
            await updateDoc(doc(getRef(), editId), data);
        } else {
            // Thêm mới bài viết
            data.createdAt = Date.now();
            data.createdBy = currentUser.uid;      // Lưu ID người tạo để lọc
            data.createdEmail = currentUser.email; // Lưu email để hiển thị nếu cần
            await addDoc(getRef(), data);
        }
        closeModal();
    } catch (err) { 
        console.error(err);
        alert("Có lỗi xảy ra: " + err.message); 
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = oldBtnText;
    }
});

// Xóa bài viết
window.deleteItem = async (id) => {
    if(confirm("Bạn có chắc chắn muốn xóa bài báo này không? Hành động này không thể hoàn tác.")) {
        try {
            await deleteDoc(doc(getRef(), id));
        } catch (err) {
            alert("Lỗi xóa: " + err.message);
        }
    }
};

// --- CHỨC NĂNG PHỤ TRỢ ---

// Chuyển đổi chế độ Xem trước khi in
window.togglePreview = () => {
    const p = document.getElementById('print-area');
    const m = document.getElementById('main-app');
    
    if (p.classList.contains('preview-mode')) {
        // Tắt chế độ in -> Hiện lại giao diện chính
        p.classList.remove('preview-mode');
        m.classList.remove('hidden'); 
        m.classList.add('flex');
    } else {
        // Bật chế độ in -> Ẩn giao diện chính
        p.classList.add('preview-mode');
        m.classList.add('hidden'); 
        m.classList.remove('flex');
        window.scrollTo(0,0);
    }
};

// Tìm kiếm bài báo (Client-side)
document.getElementById('search-input').addEventListener('keyup', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#table-body tr');
    
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        // Tìm theo tên bài hoặc tác giả
        if (text.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});