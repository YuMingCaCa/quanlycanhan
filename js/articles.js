import { db } from './firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot, orderBy, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { requireAuth, setupLogoutButton, hasPermission } from './common.js';

let currentUser = null;
let userPerms = {}; 
let allArticles = []; // Lưu trữ toàn bộ bài báo để lọc ở Client
const HOME_PATH = '../'; 

// --- KHỞI TẠO ---
requireAuth(async (user, userData) => {
    const canAccess = userData.role === 'super_admin' || hasPermission(userData.permissions, 'articles', 'access');
    if (!canAccess) {
        alert("Bạn không có quyền truy cập.");
        window.location.href = HOME_PATH;
        return;
    }

    currentUser = user;
    userPerms = userData.permissions || {};
    
    if (userData.role === 'super_admin') {
        userPerms.articles = { access: true, view_all: true, create: true, manage_others: true };
    }

    document.getElementById('auth-loading').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');
    document.getElementById('user-display').textContent = user.email;
    setupLogoutButton(HOME_PATH);
    
    setupUI(); 
    loadData();
}, HOME_PATH);

function setupUI() {
    document.getElementById('print-name').textContent = (currentUser.displayName || "").toUpperCase();
    document.getElementById('print-email').textContent = currentUser.email;
    document.getElementById('print-signer').textContent = currentUser.displayName;
    
    if (hasPermission(userPerms, 'articles', 'create')) {
        document.getElementById('btn-add').classList.remove('hidden');
    }
    document.querySelectorAll('.action-col').forEach(el => el.classList.remove('hidden'));
}

// --- TẢI DỮ LIỆU ---
function loadData() {
    const ref = collection(db, 'articles');
    let q;
    
    // Nếu có quyền xem tất cả -> Load hết
    if (hasPermission(userPerms, 'articles', 'view_all')) {
        q = query(ref, orderBy("createdAt", "desc"));
    } else {
        q = query(ref, where("createdBy", "==", currentUser.uid), orderBy("createdAt", "desc"));
    }
    
    onSnapshot(q, (snapshot) => {
        allArticles = [];
        snapshot.forEach(docSnap => {
            allArticles.push({ id: docSnap.id, ...docSnap.data() });
        });

        // 1. Cập nhật bộ lọc User (Nếu xem all)
        if (hasPermission(userPerms, 'articles', 'view_all')) {
            updateUserFilterOptions();
        } else {
            document.getElementById('filter-user').classList.add('hidden'); // Ẩn filter user nếu chỉ xem bài mình
        }

        // 2. Vẽ bảng
        renderTable();
    });
}

// Cập nhật Dropdown chọn User
function updateUserFilterOptions() {
    const select = document.getElementById('filter-user');
    const currentVal = select.value;
    
    // Lấy danh sách email duy nhất từ các bài báo
    const uniqueEmails = [...new Set(allArticles.map(item => item.createdEmail || "Không rõ"))];
    
    let html = '<option value="all">Tất cả tài khoản</option>';
    uniqueEmails.forEach(email => {
        if(email !== "Không rõ") {
             html += `<option value="${email}">${email}</option>`;
        }
    });
    
    select.innerHTML = html;
    select.value = currentVal; // Giữ lại lựa chọn cũ nếu đang chọn
}

// --- VẼ BẢNG & LỌC DỮ LIỆU ---
function renderTable() {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const filterUser = document.getElementById('filter-user').value;

    tbody.innerHTML = '';

    // Lọc dữ liệu
    const filteredData = allArticles.filter(item => {
        const matchesSearch = (item.tenBai || '').toLowerCase().includes(searchTerm) || 
                              (item.tacGia || '').toLowerCase().includes(searchTerm);
        
        const matchesUser = filterUser === 'all' || item.createdEmail === filterUser;

        return matchesSearch && matchesUser;
    });

    if (filteredData.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filteredData.forEach((item, index) => renderRow(item, index + 1, tbody));
    }
}

function renderRow(item, index, tbody) {
    const tr = document.createElement('tr');
    tr.className = "border-b hover:bg-gray-50 transition";
    tr.dataset.id = item.id; // Đánh dấu ID để dễ tìm khi in

    let canEdit = false;
    if (item.createdBy === currentUser.uid && hasPermission(userPerms, 'articles', 'create')) canEdit = true;
    if (hasPermission(userPerms, 'articles', 'manage_others')) canEdit = true;

    const actionBtns = canEdit ? `
        <button class="text-blue-600 mr-3 hover:text-blue-800" onclick="openModal('${item.id}')"><i class="fas fa-edit"></i></button>
        <button class="text-red-600 hover:text-red-800" onclick="deleteItem('${item.id}')"><i class="fas fa-trash"></i></button>
    ` : '<span class="text-gray-300">--</span>';

    tr.innerHTML = `
        <td class="text-center py-3">
            <input type="checkbox" class="select-row w-4 h-4 text-blue-600 rounded cursor-pointer" value="${item.id}">
        </td>
        <td class="text-center py-3 text-gray-500">${index}</td>
        <td class="px-4 py-3 font-semibold text-blue-900">${item.tenBai}</td>
        <td class="px-4 py-3 italic text-gray-600">${item.tacGia}</td>
        <td class="px-4 py-3 text-sm">${item.noiCongBo}</td>
        <td class="text-center"><span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs truncate max-w-[150px] inline-block" title="${item.danhMuc}">${item.danhMuc}</span></td>
        <td class="text-center action-col">${actionBtns}</td>
    `;
    tbody.appendChild(tr);
}

// --- SỰ KIỆN LỌC ---
document.getElementById('search-input').addEventListener('keyup', renderTable);
document.getElementById('filter-user').addEventListener('change', renderTable);

// Chọn tất cả
document.getElementById('select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.select-row').forEach(cb => cb.checked = e.target.checked);
});

// --- CHẾ ĐỘ IN ẤN THÔNG MINH ---
window.togglePreview = () => {
    const p = document.getElementById('print-area');
    const m = document.getElementById('main-app');
    const printBody = document.getElementById('print-table-body');
    
    if (p.classList.contains('preview-mode')) {
        // Tắt in
        p.classList.remove('preview-mode');
        m.classList.remove('hidden'); m.classList.add('flex');
    } else {
        // Bật in -> Xử lý dữ liệu in
        
        // 1. Tìm các bài được tích chọn
        const checkedIds = Array.from(document.querySelectorAll('.select-row:checked')).map(cb => cb.value);
        
        // 2. Lấy danh sách bài để in
        let itemsToPrint = [];
        if (checkedIds.length > 0) {
            // Nếu có tích chọn -> Chỉ in bài đã chọn
            itemsToPrint = allArticles.filter(item => checkedIds.includes(item.id));
        } else {
            // Nếu không tích gì -> In danh sách đang hiển thị (đã qua lọc)
            // Lấy lại logic lọc giống hệt renderTable
            const searchTerm = document.getElementById('search-input').value.toLowerCase();
            const filterUser = document.getElementById('filter-user').value;
            itemsToPrint = allArticles.filter(item => {
                const matchesSearch = (item.tenBai || '').toLowerCase().includes(searchTerm) || (item.tacGia || '').toLowerCase().includes(searchTerm);
                const matchesUser = filterUser === 'all' || item.createdEmail === filterUser;
                return matchesSearch && matchesUser;
            });
        }

        // 3. Render bảng in
        printBody.innerHTML = '';
        if (itemsToPrint.length === 0) {
            alert("Không có bài báo nào để in!");
            return;
        }

        let index = 1;
        itemsToPrint.forEach(item => {
            printBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td style="text-align:center">${index++}</td>
                    <td>${item.tenBai}</td>
                    <td>${item.tacGia}</td>
                    <td>${item.noiCongBo}</td>
                    <td style="text-align:center">${item.danhMuc}</td>
                </tr>
            `);
        });
        
        // Thêm dòng trống cho đẹp
        while(index <= 5) {
             printBody.insertAdjacentHTML('beforeend', '<tr><td></td><td></td><td></td><td></td><td></td></tr>');
             index++;
        }

        p.classList.add('preview-mode');
        m.classList.add('hidden'); m.classList.remove('flex');
        window.scrollTo(0,0);
    }
};

// --- CRUD ---
let editId = null;
window.openModal = (id = null) => {
    document.getElementById('form-article').reset();
    editId = null;
    document.getElementById('modal-title').textContent = "Thêm Mới";
    if (id) {
        editId = id;
        const item = allArticles.find(x => x.id === id);
        if (item) {
            document.getElementById('ten-bai').value = item.tenBai;
            document.getElementById('tac-gia').value = item.tacGia;
            document.getElementById('noi-cong-bo').value = item.noiCongBo;
            document.getElementById('danh-muc').value = item.danhMuc;
            document.getElementById('modal-title').textContent = "Cập Nhật";
        }
    }
    document.getElementById('article-modal').classList.remove('hidden');
};
window.closeModal = () => document.getElementById('article-modal').classList.add('hidden');

document.getElementById('form-article').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        tenBai: document.getElementById('ten-bai').value,
        tacGia: document.getElementById('tac-gia').value,
        noiCongBo: document.getElementById('noi-cong-bo').value,
        danhMuc: document.getElementById('danh-muc').value,
        updatedAt: Date.now(),
        createdBy: currentUser.uid, 
        createdEmail: currentUser.email 
    };
    try {
        if (editId) {
            delete data.createdBy; delete data.createdEmail;
            await updateDoc(doc(collection(db, 'articles'), editId), data);
        } else {
            data.createdAt = Date.now();
            await addDoc(collection(db, 'articles'), data);
        }
        closeModal();
    } catch (err) { alert(err.message); }
});

window.deleteItem = async (id) => { if(confirm("Xóa bài này?")) await deleteDoc(doc(collection(db, 'articles'), id)); };