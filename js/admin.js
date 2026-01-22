import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { requireAuth, setupLogoutButton } from './common.js';

requireAuth(async (user, role) => {
    if (role !== 'admin') {
        alert("Bạn không có quyền truy cập trang này!");
        window.location.href = '../';
        return;
    }
    
    document.getElementById('auth-loading').classList.add('hidden');
    document.getElementById('admin-ui').classList.remove('hidden');
    document.getElementById('admin-ui').classList.add('flex');
    
    setupLogoutButton('../');
    loadUsers();
}, '../');

async function loadUsers() {
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Đang tải...</td></tr>';
    
    // Lấy tất cả user
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    tbody.innerHTML = '';
    snapshot.forEach(docSnap => {
        const u = { id: docSnap.id, ...docSnap.data() };
        renderUserRow(u, tbody);
    });
}

function renderUserRow(u, tbody) {
    const tr = document.createElement('tr');
    tr.className = "border-b hover:bg-gray-50";
    
    // Mặc định permissions nếu chưa có
    const perms = u.permissions || { can_access_articles: false, view_all_articles: false, can_create_article: false };

    // Tạo Role Label
    let roleBadge = '';
    if (u.role === 'admin') roleBadge = '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Admin</span>';
    else if (u.role === 'pending') roleBadge = '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Chờ duyệt</span>';
    else roleBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">Giảng viên</span>';

    // Disable checkboxes nếu là admin (Admin luôn full quyền)
    const disabled = u.role === 'admin' ? 'disabled checked' : '';
    const isPending = u.role === 'pending';

    tr.innerHTML = `
        <td class="px-4 py-3">
            <div class="font-bold text-gray-900">${u.displayName || 'Không tên'}</div>
            <div class="text-gray-500 text-xs">${u.email}</div>
        </td>
        <td class="px-4 py-3 text-center">${roleBadge}</td>
        
        <!-- Checkbox Quyền -->
        <td class="px-4 py-3 text-center bg-blue-50/50">
            <input type="checkbox" ${perms.can_access_articles ? 'checked' : ''} ${disabled} 
                onchange="window.updatePerm('${u.id}', 'can_access_articles', this.checked)" class="h-4 w-4 text-blue-600 rounded">
        </td>
        <td class="px-4 py-3 text-center bg-blue-50/50">
            <input type="checkbox" ${perms.view_all_articles ? 'checked' : ''} ${disabled} 
                onchange="window.updatePerm('${u.id}', 'view_all_articles', this.checked)" class="h-4 w-4 text-blue-600 rounded">
        </td>
        <td class="px-4 py-3 text-center bg-blue-50/50">
            <input type="checkbox" ${perms.can_create_article ? 'checked' : ''} ${disabled} 
                onchange="window.updatePerm('${u.id}', 'can_create_article', this.checked)" class="h-4 w-4 text-blue-600 rounded">
        </td>

        <!-- Hành động -->
        <td class="px-4 py-3 text-center">
            ${isPending ? `
                <button onclick="window.approveUser('${u.id}')" class="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                    <i class="fas fa-check mr-1"></i> Duyệt
                </button>
            ` : ''}
            ${!isPending && u.role !== 'admin' ? `
                <button onclick="window.setAdmin('${u.id}')" class="text-xs text-purple-600 underline hover:text-purple-800">Thăng Admin</button>
            ` : ''}
        </td>
    `;
    tbody.appendChild(tr);
}

// Hàm global để gọi từ HTML
window.updatePerm = async (uid, key, value) => {
    // Cập nhật trường permissions.key trong Firestore
    // Cú pháp update nested object: "permissions.key": value
    const updateData = {};
    updateData[`permissions.${key}`] = value;
    
    try {
        await updateDoc(doc(db, 'users', uid), updateData);
        // Không cần reload, checkbox đã đổi trạng thái
    } catch (e) {
        alert("Lỗi cập nhật: " + e.message);
    }
};

window.approveUser = async (uid) => {
    if(confirm("Duyệt thành viên này? Họ sẽ được cấp quyền truy cập cơ bản.")) {
        await updateDoc(doc(db, 'users', uid), {
            role: 'member',
            // Cấp quyền mặc định khi duyệt
            permissions: {
                can_access_articles: true,
                view_all_articles: false, // Mặc định chỉ xem bài mình
                can_create_article: true  // Mặc định được đăng bài
            }
        });
        loadUsers();
    }
};

window.setAdmin = async (uid) => {
    if(confirm("CẢNH BÁO: Bạn có chắc chắn muốn thăng cấp người này làm Admin không?")) {
        await updateDoc(doc(db, 'users', uid), {
            role: 'admin',
            // Admin full quyền
            permissions: { can_access_articles: true, view_all_articles: true, can_create_article: true }
        });
        loadUsers();
    }
};