import { db } from './firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot, orderBy, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { requireAuth, setupLogoutButton } from './common.js';

let currentUser = null;
let currentPermissions = {};
let currentRole = 'guest'; // Thêm biến này để lưu role

const HOME_PATH = '../'; 

requireAuth(async (user, role) => {
    // Lấy thông tin chi tiết user từ DB
    const snap = await getDoc(doc(db, 'users', user.uid));
    const userData = snap.data();
    
    // Kiểm tra quyền truy cập Module
    // (Admin luôn được vào, kể cả khi chưa có permissions)
    if (role !== 'admin') {
        if (userData.role === 'pending' || (userData.permissions && !userData.permissions.can_access_articles)) {
            alert("Bạn không có quyền truy cập module này.");
            window.location.href = HOME_PATH;
            return;
        }
    }

    currentUser = user;
    currentRole = role; // Lưu role lại dùng sau này

    // --- SỬA LỖI QUAN TRỌNG TẠI ĐÂY ---
    // Nếu là Admin: Tự động gán Full Quyền (Bất chấp DB có lưu permissions hay không)
    if (role === 'admin') {
        currentPermissions = {
            can_access_articles: true,
            view_all_articles: true, 
            can_create_article: true
        };
    } else {
        // Nếu là user thường thì dùng quyền trong DB
        currentPermissions = userData.permissions || {}; 
    }
    // ----------------------------------

    document.getElementById('auth-loading').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('flex');

    document.getElementById('user-display').textContent = user.email;
    setupLogoutButton(HOME_PATH);
    
    setupUIByPermissions(); 
    loadData();
}, HOME_PATH);

function setupUIByPermissions() {
    document.getElementById('print-name').textContent = (currentUser.displayName || "").toUpperCase();
    document.getElementById('print-email').textContent = currentUser.email;
    
    // Nút thêm mới
    if (currentPermissions.can_create_article) {
        document.getElementById('btn-add').classList.remove('hidden');
    } else {
        document.getElementById('btn-add').classList.add('hidden');
    }

    // Cột thao tác: Admin hoặc người có quyền sửa (tùy logic mở rộng)
    if (currentRole === 'admin') {
        document.querySelectorAll('.action-col').forEach(el => el.classList.remove('hidden'));
    }
}

const getRef = () => collection(db, 'articles');

function loadData() {
    let q;
    
    // Vì Admin đã được ép quyền view_all_articles = true ở trên
    // Nên Admin sẽ luôn chạy vào nhánh if này -> Xem được tất cả bài (kể cả bài cũ thiếu createdBy)
    if (currentPermissions.view_all_articles) {
        q = query(getRef(), orderBy("createdAt", "desc"));
    } else {
        // Chỉ user thường mới bị lọc bài
        q = query(getRef(), where("createdBy", "==", currentUser.uid), orderBy("createdAt", "desc"));
    }
    
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('table-body');
        const printBody = document.getElementById('print-table-body');
        tbody.innerHTML = '';
        printBody.innerHTML = '';

        if (snapshot.empty) document.getElementById('empty-state').classList.remove('hidden');
        else document.getElementById('empty-state').classList.add('hidden');

        let index = 1;
        snapshot.forEach(docSnap => {
            const item = { id: docSnap.id, ...docSnap.data() };
            renderRow(item, index++, tbody, printBody);
        });
        
        while(index <= 5) {
             printBody.insertAdjacentHTML('beforeend', '<tr><td></td><td></td><td></td><td></td><td></td></tr>');
             index++;
        }
    });
}

function renderRow(item, index, tbody, printBody) {
    const tr = document.createElement('tr');
    tr.className = "border-b hover:bg-gray-50";
    
    // Logic hiển thị nút sửa/xóa
    // Admin luôn được sửa
    // User thường: Được sửa nếu là bài của mình VÀ có quyền tạo bài
    let canEdit = false;
    if (currentRole === 'admin') canEdit = true;
    else if (item.createdBy === currentUser.uid && currentPermissions.can_create_article) canEdit = true;

    const actionBtns = canEdit ? `
        <button class="text-blue-600 mr-3" onclick="openModal('${item.id}')"><i class="fas fa-edit"></i></button>
        <button class="text-red-600" onclick="deleteItem('${item.id}')"><i class="fas fa-trash"></i></button>
    ` : '<span class="text-gray-300 text-xs">--</span>';

    tr.innerHTML = `
        <td class="text-center py-3">${index}</td>
        <td class="px-4 py-3 font-semibold text-blue-900">${item.tenBai}</td>
        <td class="px-4 py-3 italic text-gray-600">${item.tacGia}</td>
        <td class="px-4 py-3">${item.noiCongBo}</td>
        <td class="text-center"><span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">${item.danhMuc}</span></td>
        <td class="text-center action-col">${actionBtns}</td>
    `;
    tbody.appendChild(tr);

    printBody.insertAdjacentHTML('beforeend', `
        <tr>
            <td style="text-align:center">${index}</td>
            <td>${item.tenBai}</td>
            <td>${item.tacGia}</td>
            <td>${item.noiCongBo}</td>
            <td style="text-align:center">${item.danhMuc}</td>
        </tr>
    `);
}

let editId = null;

window.openModal = (id = null) => {
    document.getElementById('form-article').reset();
    editId = null;
    document.getElementById('modal-title').textContent = "Thêm Mới";

    if (id) {
        editId = id;
        document.getElementById('modal-title').textContent = "Đang tải...";
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
            .then(({ getDoc, doc }) => getDoc(doc(db, 'articles', id)))
            .then(snap => {
                if(snap.exists()) {
                    const d = snap.data();
                    document.getElementById('ten-bai').value = d.tenBai;
                    document.getElementById('tac-gia').value = d.tacGia;
                    document.getElementById('noi-cong-bo').value = d.noiCongBo;
                    document.getElementById('danh-muc').value = d.danhMuc;
                    document.getElementById('modal-title').textContent = "Cập Nhật";
                }
            });
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
        // Luôn lưu người tạo để phục vụ cho các user thường sau này
        createdBy: currentUser.uid, 
        createdEmail: currentUser.email 
    };
    
    try {
        if (editId) {
            // Khi sửa thì xóa createdBy để tránh ghi đè người tạo gốc thành người sửa
            delete data.createdBy;
            delete data.createdEmail;
            await updateDoc(doc(getRef(), editId), data);
        } else {
            data.createdAt = Date.now();
            await addDoc(getRef(), data);
        }
        closeModal();
    } catch (err) { alert(err.message); }
});

window.deleteItem = async (id) => {
    if(confirm("Xóa bài này?")) await deleteDoc(doc(getRef(), id));
};

window.togglePreview = () => {
    const p = document.getElementById('print-area');
    const m = document.getElementById('main-app');
    if (p.classList.contains('preview-mode')) {
        p.classList.remove('preview-mode');
        m.classList.remove('hidden'); m.classList.add('flex');
    } else {
        p.classList.add('preview-mode');
        m.classList.add('hidden'); m.classList.remove('flex');
    }
};

document.getElementById('search-input').addEventListener('keyup', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#table-body tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
});