// ==================== STATE ====================
let web3, contract, currentAccount, isAdmin = false;
let recordsRealtimeTimer = null;
// fallback gas (tới a vừa đủ để tránh out-of-gas trong Ganache)
const DEFAULT_TX_GAS = 1200000;
let allBooks = [], allRecords = [];

function withTxGas(chainTxRequest, txOptions = {}) {
  // Web3 v1: estimateGas có thể chạy/failed tùy provider; nếu failed thì dùng fallback gas.
  const estimateOpts = { ...txOptions };
  return (async () => {
    try {
      const gasEstimate = await estimateOpts.estimateGasFn();
      // thêm buffer để tránh revert do dao động estimate
      const gasWithBuffer = Math.floor(Number(gasEstimate) * 1.25) + 50000;
      return await chainTxRequest.send({ ...txOptions, gas: gasWithBuffer });
    } catch (e) {
      return await chainTxRequest.send({ ...txOptions, gas: DEFAULT_TX_GAS });
    }
  })();
}

async function estimateGasOrDefault(chainTxRequest, txOptions = {}) {
  try {
    const gasEstimate = await chainTxRequest.estimateGas(txOptions);
    return Math.floor(Number(gasEstimate) * 1.25) + 50000;
  } catch (_) {
    return DEFAULT_TX_GAS;
  }
}

// Note: Records/Books rendering is done via view(). Avoid using legacy bulk getters on pages.

const catColors = ['cat-0','cat-1','cat-2','cat-3','cat-4','cat-5'];

// ==================== WALLET (KHÔNG DÙNG METAMASK) ====================
// Phương án: dùng Ganache RPC + private key do bạn copy từ Ganache.
// Chỉ cần nhập Private Key và (tuỳ chọn) RPC URL.
async function connectWallet() {
  try {
    const pk = (document.getElementById('private-key-input')?.value || '').trim();
    if (!pk) { showAlert('error','Vui lòng nhập Private Key (copy từ Ganache)'); return; }

    const rpcUrl = (document.getElementById('rpc-url-input')?.value || '').trim() || 'http://127.0.0.1:7545';

    // Web3 qua HTTP RPC (không phụ thuộc MetaMask)
    web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

    // Tạo address từ private key
    const acct = web3.eth.accounts.privateKeyToAccount(pk);
    currentAccount = acct.address;

    // Đảm bảo Web3 có thể sign/send tx bằng private key (không cần MetaMask)
    web3.eth.accounts.wallet.clear();
    web3.eth.accounts.wallet.add(acct);
    web3.eth.defaultAccount = acct.address;


    // UI cập nhật
    document.getElementById('wallet-addr').textContent = shortAddr(currentAccount);
    document.getElementById('wallet-info').style.display = 'flex';
    document.getElementById('connect-btn').style.display = 'none';

    const netId = await web3.eth.net.getId();
    document.getElementById('network-badge').textContent = '↢ Network ' + netId;

    const regAddrInput = document.getElementById('reg-addr');
    if (regAddrInput) regAddrInput.value = currentAccount;

    txLog('info', `✓ Đã kết nối bằng private key: ${currentAccount}`);
    txLog('info', `✓ Network ID: ${netId}`);
    showAlert('success', 'Kết nối blockchain thành công (không dùng MetaMask)');

    // Lưu private key để auto-connect lần sau
    localStorage.setItem('library_private_key', pk);

    // Load saved contract
    const saved = localStorage.getItem('library_contract');
    if (saved) {
      document.getElementById('contract-address-input').value = saved;
      await setContractAddress();
    }

  } catch (e) {
    showAlert('error', 'Kết nối thất bại: ' + (e.message || e));
  }
}


async function setContractAddress() {
  const addr = document.getElementById('contract-address-input').value.trim();
  if (!web3) { showAlert('error','Vui lòng nhập private key để kết nối RPC trước!'); return; }

  if (!addr || !web3.utils.isAddress(addr)) { showAlert('error','Địa chỉ contract không hợp lệ!'); return; }
  try {
    contract = new web3.eth.Contract(CONTRACT_ABI, addr);
    localStorage.setItem('library_contract', addr);
    document.getElementById('info-contract').textContent = shortAddr(addr);
    const adminAddr = await contract.methods.admin().call();
    document.getElementById('info-admin').textContent = shortAddr(adminAddr);
    const netId = await web3.eth.net.getId();
    document.getElementById('info-network').textContent = 'Network ' + netId;
    isAdmin = adminAddr.toLowerCase() === currentAccount.toLowerCase();
    if (isAdmin) {
      document.getElementById('admin-badge').style.display = 'inline-flex';
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    }
    txLog('success', `✓ Contract đã kết nối: ${addr}`);
    txLog('success', `✓ Admin: ${adminAddr}`);
    showAlert('success', 'Đã kết nối contract thành công!');
    await loadDashboard();
    await loadBooksForBorrow();
    await checkMemberStatus();
  } catch(e) {
    showAlert('error', 'Không thể kết nối contract: ' + e.message);
    txLog('error', '✗ ' + e.message);
  }
}

// ==================== ADMIN UI ====================
async function refreshAdminUI() {
  const adminBadge = document.getElementById('admin-badge');
  const adminItems = Array.from(document.querySelectorAll('.admin-only'));

  // Default: hide until we know admin status
  let nextIsAdmin = false;

  try {
    if (!contract || !currentAccount) {
      nextIsAdmin = false;
    } else {
      const adminAddr = await contract.methods.admin().call();
      nextIsAdmin = adminAddr.toLowerCase() === currentAccount.toLowerCase();
    }
  } catch (e) {
    nextIsAdmin = false;
  }

  isAdmin = nextIsAdmin;
  if (adminBadge) adminBadge.style.display = isAdmin ? 'inline-flex' : 'none';
  adminItems.forEach(el => (el.style.display = isAdmin ? 'flex' : 'none'));
}

// ==================== NAVIGATION ====================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  event.currentTarget.classList.add('active');

  // Ensure admin-only button visibility is correct even if user navigates before/after contract load
  if (page === 'add-book' || page === 'members') {
    refreshAdminUI().then(() => {
      if (!isAdmin) {
        // Keep UX: return to books if not admin
        showPage('books');
        showAlert('error', 'Chỉ admin mới có quyền truy cập trang này');
      }
    });
  } else {
    // still sync UI badge/items
    refreshAdminUI();
  }

  const loaders = {
    'books': loadBooks,
    'return': loadActiveRecords,
    'records': loadRecords,
    'members': loadMembers,
    'borrow': loadBooksForBorrow,
  };
  if (loaders[page]) loaders[page]();
}


// ==================== DASHBOARD ====================
async function loadDashboard() {
  if (!contract) return;
  const PAGE = 20;
  try {
    // Bounded queries (avoid getAll* bulk getters)
    const [books, active] = await Promise.all([
      contract.methods.getBooks(1, PAGE).call(),
      contract.methods.getActiveRecordsPaged(1, PAGE).call()
    ]);

    const overdue = active.filter(r => Date.now()/1000 > Number(r.dueDate));

    // Counts: use counters (cheap)
    const [bookCount, recordCount, memberCount] = await Promise.all([
      contract.methods.bookCount().call(),
      contract.methods.recordCount().call(),
      contract.methods.memberCount().call()
    ]);

    document.getElementById('stat-books').textContent = Number(bookCount);
    document.getElementById('stat-borrowed').textContent = Number(active.length);
    document.getElementById('stat-members').textContent = Number(memberCount);
    document.getElementById('stat-overdue').textContent = overdue.length;

    // Recent active (limited)
    const dashActive = document.getElementById('dash-active');
    if (!active || active.length === 0) {
      dashActive.innerHTML = '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Không có sách đang mượn</div></div>';
    } else {
      dashActive.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Sách</th><th>Người mượn</th><th>Hạn trả</th><th>Trạng thái</th></tr></thead><tbody>' +
        [...active].slice(-5).reverse().map(r => {
          const book = books.find(b => Number(b.id) === Number(r.bookId));
          const isOver = Date.now()/1000 > Number(r.dueDate);
          return `<tr>
            <td>${book ? book.title : '#' + r.bookId}</td>
            <td>${r.borrowerName}</td>
            <td>${fmtDate(r.dueDate)}</td>
            <td>${isOver ? '<span class="badge badge-red">⚠️ Quá hạn</span>' : '<span class="badge badge-teal">📤 Đang mượn</span>'}</td>
          </tr>`;
        }).join('') + '</tbody></table></div>';
    }

    // Low stock from the same bounded books page
    const sorted = [...books].sort((a,b) => Number(a.availableCopies) - Number(b.availableCopies)).slice(0,5);
    const dashLow = document.getElementById('dash-low');
    dashLow.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Sách</th><th>Có sẵn</th><th>Tổng</th></tr></thead><tbody>' +
      sorted.map(b => `<tr>
        <td>${b.title}</td>
        <td><span class="${Number(b.availableCopies) === 0 ? 'badge badge-red' : 'badge badge-orange'}">${b.availableCopies}</span></td>
        <td>${b.totalCopies}</td>
      </tr>`).join('') + '</tbody></table></div>';

  } catch(e) { txLog('error', '✗ loadDashboard: ' + e.message); }
}

// ==================== BOOKS ====================
async function loadBooks() {
  if (!contract) { showNoContract('books-grid'); return; }
  document.getElementById('books-grid').innerHTML = '<div class="loading"><div class="spinner"></div>Đang tải...</div>';
  const PAGE = 200;
  try {
    allBooks = await contract.methods.getBooks(1, PAGE).call();
    renderBooks(allBooks);
  } catch(e) { document.getElementById('books-grid').innerHTML = errHtml(e.message); }
}

function renderBooks(books) {
  const grid = document.getElementById('books-grid');
  if (books.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📚</div><div class="empty-text">Chưa có sách nào</div><div class="empty-sub">Admin hãy thêm sách vào hệ thống</div></div>';
    return;
  }
  const cats = ['Khoa học','Văn học','Lịch sử','Công nghệ','Kinh tế','Triết học'];
  grid.innerHTML = books.map((b,i) => {
    const catIdx = cats.indexOf(b.category);
    const colorClass = catColors[catIdx >= 0 ? catIdx : 5];
    const avail = Number(b.availableCopies);
    return `<div class="book-card" onclick="openBookModal(${b.id})">
      <div class="book-spine ${colorClass}"></div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
      <div class="book-meta">
        <div class="book-avail">Còn: <span>${avail}/${b.totalCopies}</span></div>
        ${avail > 0 ? '<span class="badge badge-green">✓ Có sẵn</span>' : '<span class="badge badge-red">✗ Hết</span>'}
      </div>
      <div class="mt-16"><span class="badge ${colorClass.replace('cat','badge')}" style="background:rgba(201,168,76,0.1);color:var(--gold2);border:1px solid rgba(201,168,76,0.2);font-size:10px">${b.category}</span></div>
    </div>`;
  }).join('');
}

function filterBooks() {
  const q = document.getElementById('search-books').value.toLowerCase();
  const filtered = allBooks.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q));
  renderBooks(filtered);
}

function openBookModal(bookId) {
  const b = allBooks.find(bk => Number(bk.id) === Number(bookId));
  if (!b) return;
  // store selected book id for admin actions
  window._selectedBookId = Number(bookId);

  document.getElementById('modal-book-title').textContent = b.title;
  document.getElementById('modal-book-body').innerHTML = `
    <div class="form-grid gap-16">
      <div class="grid-2">
        <div><div class="text-xs" style="color:var(--text3);margin-bottom:4px">TÀI LIỆU</div><div>${b.author}</div></div>
        <div><div class="text-xs" style="color:var(--text3);margin-bottom:4px">THỂ LOẠI</div><div>${b.category}</div></div>
        <div><div class="text-xs" style="color:var(--text3);margin-bottom:4px">ISBN</div><div class="addr-short">${b.isbn || '—'}</div></div>
        <div><div class="text-xs" style="color:var(--text3);margin-bottom:4px">SỐ LƯỢNG</div><div>${b.availableCopies}/${b.totalCopies} bản còn sẵn</div></div>
      </div>
      <div class="divider"></div>
      <div>${Number(b.availableCopies) > 0 ? '<span class="badge badge-green">✓ Có thể mượn</span>' : '<span class="badge badge-red">✗ Hết sách</span>'}</div>
    </div>`;

  const borrowBtn = document.getElementById('modal-borrow-btn');
  borrowBtn.disabled = Number(b.availableCopies) === 0;
  borrowBtn.onclick = () => { closeModal('book-modal'); showPage('borrow'); document.getElementById('borrow-book-select').value = bookId; updateBorrowInfo(); };

  const editBtns = document.getElementById('modal-edit-btns');
  editBtns.style.display = isAdmin ? 'block' : 'none';
  document.getElementById('modal-edit-btn').onclick = () => { closeModal('book-modal'); openEditModal(b); };

  document.getElementById('book-modal').classList.add('open');
}

function deleteBookFromModal() {
  if (!contract || !window._selectedBookId) {
    showAlert('error','Chưa chọn sách hoặc chưa kết nối contract!');
    return;
  }
  const bookId = Number(window._selectedBookId);
  if (!bookId || bookId <= 0) {
    showAlert('error','Book ID không hợp lệ!');
    return;
  }

  deleteBook(bookId);
}

async function deleteBook(bookId) {
  try {
    showAlert('info','Đang xóa sách...');
    const tx = await contract.methods.deleteBook(bookId).send({ from: currentAccount, gas: await estimateGasOrDefault(contract.methods.deleteBook(bookId), { from: currentAccount }) });

    txLog('success', `✓ Xóa sách #${bookId} | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success', `Đã xóa sách #${bookId} thành công!`);

    closeModal('book-modal');
    closeModal('edit-modal');

    await loadDashboard();
    await loadBooks();
    await loadBooksForBorrow();
    await loadActiveRecords();
  } catch (e) {
    showAlert('error', parseError(e));
    txLog('error', `✗ deleteBook: ${e.message || e}`);
  }
}

function openEditModal(b) {
  document.getElementById('edit-book-id').value = b.id;

  document.getElementById('edit-title').value = b.title;
  document.getElementById('edit-author').value = b.author;
  document.getElementById('edit-isbn').value = b.isbn;
  document.getElementById('edit-category').value = b.category;
  document.getElementById('edit-copies').value = b.totalCopies;
  document.getElementById('edit-modal').classList.add('open');
}

async function addBook() {
  if (!contract) { showAlert('error','Chưa kết nối contract!'); return; }
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const isbn = document.getElementById('book-isbn').value.trim();
  const category = document.getElementById('book-category').value;
  const copies = document.getElementById('book-copies').value;
  if (!title || !author || !copies) { showAlert('error','Vui lòng điền đầy đủ thông tin!'); return; }
  try {
    showAlert('info','Đang xử lý giao dịch...');
    const tx = await contract.methods.addBook(title, author, isbn, category, parseInt(copies)).send({ from: currentAccount, gas: await estimateGasOrDefault(contract.methods.addBook(title, author, isbn, category, parseInt(copies)), { from: currentAccount }) });

    txLog('success', `✓ Thêm sách: "${title}" | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success', `Đã thêm sách "${title}" thành công!`);
    document.getElementById('book-title').value = '';
    document.getElementById('book-author').value = '';
    document.getElementById('book-isbn').value = '';
    document.getElementById('book-copies').value = '1';
    await loadDashboard();
  } catch(e) {
    showAlert('error', parseError(e));
    txLog('error', '✗ addBook: ' + e.message);
  }
}

async function updateBook() {
  const id = document.getElementById('edit-book-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const author = document.getElementById('edit-author').value.trim();
  const isbn = document.getElementById('edit-isbn').value.trim();
  const category = document.getElementById('edit-category').value;
  const copies = document.getElementById('edit-copies').value;
  try {
    showAlert('info','Đang xử lý...');
    const tx = await contract.methods.updateBook(id, title, author, isbn, category, parseInt(copies)).send({ from: currentAccount, gas: await estimateGasOrDefault(contract.methods.updateBook(id, title, author, isbn, category, parseInt(copies)), { from: currentAccount }) });

    txLog('success', `✓ Cập nhật sách #${id} | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success','Đã cập nhật sách thành công!');
    closeModal('edit-modal');
    await loadBooks();
  } catch(e) {
    showAlert('error', parseError(e));
    txLog('error', '✗ updateBook: ' + e.message);
  }
}

// ==================== BORROW ====================
async function loadBooksForBorrow() {
  if (!contract) return;
  const PAGE = 200;
  try {
    const books = await contract.methods.getBooks(1, PAGE).call();

    // 1) Build category filter
    const catSel = document.getElementById('borrow-category-filter');
    const categories = [...new Set(books.map(b => b.category))].filter(Boolean);
    const current = catSel?.value || 'all';
    if (catSel) {
      catSel.innerHTML = '<option value="all">Tất cả</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
      if ([...catSel.options].some(o => o.value === current)) catSel.value = current;
    }

    // 2) Filter books by category + availability
    const selectedCat = catSel ? catSel.value : 'all';
    const filteredBooks = books.filter(b =>
      Number(b.availableCopies) > 0 && (selectedCat === 'all' || b.category === selectedCat)
    );

    // 3) Render book select
    const sel = document.getElementById('borrow-book-select');
    sel.innerHTML = '<option value="">-- Chọn sách cần mượn --</option>';
    filteredBooks.forEach(b => {
      sel.innerHTML += `<option value="${b.id}">${b.title} — ${b.author} (còn ${b.availableCopies})</option>`;
    });
    sel.onchange = updateBorrowInfo;

    // Hide info panel when list changes
    const info = document.getElementById('borrow-book-info');
    if (info) info.style.display = 'none';
  } catch(e) {}
}

function updateBorrowInfo() {
  const id = document.getElementById('borrow-book-select').value;
  const info = document.getElementById('borrow-book-info');
  if (!id || !allBooks.length) { info.style.display = 'none'; return; }
  const b = allBooks.find(bk => Number(bk.id) === Number(id));
  if (!b) { info.style.display = 'none'; return; }
  const due = new Date(Date.now() + 14*24*60*60*1000);
  document.getElementById('borrow-book-detail').innerHTML = `
    <div class="grid-2 gap-8">
      <div><span class="text-xs" style="color:var(--text3)">SÁCH</span><br><strong>${b.title}</strong></div>
      <div><span class="text-xs" style="color:var(--text3)">TÀC GIẢ</span><br>${b.author}</div>
      <div><span class="text-xs" style="color:var(--text3)">CÒN LẠI</span><br><span class="badge badge-green">${b.availableCopies} bản</span></div>
      <div><span class="text-xs" style="color:var(--text3)">HẠN TRẢ</span><br><strong style="color:var(--orange)">${due.toLocaleDateString('vi-VN')}</strong></div>
    </div>`;
  info.style.display = 'block';
}

async function borrowBook() {
  if (!contract) { showAlert('error','Chưa kết nối contract!'); return; }
  const name = document.getElementById('borrow-name').value.trim();
  const bookId = document.getElementById('borrow-book-select').value;
  if (!name || !bookId) { showAlert('error','Vui lòng điền tên và chọn sách!'); return; }

  try {
    showAlert('info','Đang gửi giao dịch lên blockchain...');
    const method = contract.methods.borrowBook(parseInt(bookId), name);
    const gas = await estimateGasOrDefault(method, { from: currentAccount });
    const tx = await method.send({ from: currentAccount, gas });

    const book = allBooks.find(b => Number(b.id) === Number(bookId));
    txLog('success', `✓ Mượn sách: "${book?.title}" bởi ${name} | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success', `Đã mượn sách thành công! Hạn trả: 14 ngày`);
    document.getElementById('borrow-name').value = '';
    document.getElementById('borrow-book-select').value = '';
    document.getElementById('borrow-book-info').style.display = 'none';
    await loadBooksForBorrow();
    await loadDashboard();
  } catch(e) {
    showAlert('error', parseError(e));
    txLog('error', '✗ borrowBook: ' + e.message);
  }
}

// ==================== RETURN ====================
async function loadActiveRecords() {
  if (!contract) { showNoContract('return-table'); return; }
  document.getElementById('return-table').innerHTML = '<div class="loading"><div class="spinner"></div>Đang tải...</div>';
  const PAGE = 20;
  try {
    const [records, books] = await Promise.all([
      contract.methods.getActiveRecordsPaged(1, PAGE).call(),
      contract.methods.getBooks(1, PAGE).call()
    ]);

    const wrap = document.getElementById('return-table');
    if (!records || records.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-icon">📌</div><div class="empty-text">Không có sách đang mượn</div></div>';
      return;
    }
    const now = Date.now()/1000;
    wrap.innerHTML = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Sách</th><th>Người mượn</th><th>Ngày mượn</th><th>Hạn trả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>' +
      records.map(r => {
        const book = books.find(b => Number(b.id) === Number(r.bookId));
        const overdue = now > Number(r.dueDate);
        const canReturn = r.borrower.toLowerCase() === currentAccount?.toLowerCase() || isAdmin;
        return `<tr>
          <td><span class="addr-short">#${r.recordId}</span></td>
          <td><strong>${book?.title || '#'+r.bookId}</strong></td>
          <td>${r.borrowerName}<br><span class="addr-short">${shortAddr(r.borrower)}</span></td>
          <td>${fmtDate(r.borrowDate)}</td>
          <td style="color:${overdue?'var(--red)':'var(--orange)'}">${fmtDate(r.dueDate)}</td>
          <td>${overdue ? '<span class="badge badge-red">⚠️ Quá hạn</span>' : '<span class="badge badge-teal">📤 Đang mượn</span>'}</td>
          <td>${canReturn ? `<button class="btn btn-sm btn-primary" onclick="returnBook(${r.recordId})">📥 Trả sách</button>` : '<span class="text-xs" style="color:var(--text3)">—</span>'}</td>
        </tr>`;
      }).join('') + '</tbody></table></div>';
  } catch(e) { document.getElementById('return-table').innerHTML = errHtml(e.message); }
}

async function returnBook(recordId) {
  if (!contract) return;
  try {
    showAlert('info','Đang xử lý trả sách...');
    const tx = await contract.methods.returnBook(recordId).send({ from: currentAccount, gas: await estimateGasOrDefault(contract.methods.returnBook(recordId), { from: currentAccount }) });

    txLog('success', `✓ Trả sách #${recordId} | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success','Đã trả sách thành công!');
    await loadActiveRecords();
    await loadDashboard();
  } catch(e) {
    showAlert('error', parseError(e));
    txLog('error', '✗ returnBook: ' + e.message);
  }
}

// ==================== RECORDS ====================
async function loadRecords() {
  if (!contract) { showNoContract('records-table'); return; }
  document.getElementById('records-table').innerHTML = '<div class="loading"><div class="spinner"></div>Đang tải...</div>';
  const PAGE = 50;
  const start = 1;

  try {
    const [records, books] = await Promise.all([
      contract.methods.getBorrowRecordsPaged(start, PAGE).call(),
      contract.methods.getBooks(1, PAGE).call()
    ]);

    allRecords = records;
    window._allBooks = books;
    filterRecords();
  } catch(e) { document.getElementById('records-table').innerHTML = errHtml(e.message); }
}

function filterRecords() {
  const status = document.getElementById('filter-status').value;

  if (recordsRealtimeTimer) {
    clearInterval(recordsRealtimeTimer);
    recordsRealtimeTimer = null;
  }
  const now = Date.now()/1000;
  let filtered = allRecords;
  if (status === 'active') filtered = allRecords.filter(r => !r.isReturned);
  else if (status === 'returned') filtered = allRecords.filter(r => r.isReturned);
  else if (status === 'overdue') filtered = allRecords.filter(r => !r.isReturned && now > Number(r.dueDate));

  const books = window._allBooks || [];
  const wrap = document.getElementById('records-table');
  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Không có giao dịch</div></div>';
    return;
  }

  if (recordsRealtimeTimer) { clearInterval(recordsRealtimeTimer); recordsRealtimeTimer = null; }

  wrap.innerHTML = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Sách</th><th>Người mượn</th><th>Ngày mượn</th><th>Giờ mượn</th><th>Hạn trả</th><th>Ngày trả</th><th>Giờ trả (realtime)</th><th>Trạng thái</th></tr></thead><tbody>' +
    [...filtered].reverse().map(r => {
      const book = books.find(b => Number(b.id) === Number(r.bookId));

      const overdue = now > Number(r.dueDate) && !r.isReturned;
      let statusHtml;
      if (r.isReturned) {
        statusHtml = r.isOverdue ? '<span class="badge badge-orange">⚠️ Trả trễ</span>' : '<span class="badge badge-green">✓ Đã trả</span>';
      } else {
        statusHtml = overdue ? '<span class="badge badge-red">⚠️ Quá hạn</span>' : '<span class="badge badge-teal">📤 Đang mượn</span>';
      }
      return `<tr id="txrow-${r.recordId}">
        <td><span class="addr-short">#${r.recordId}</span></td>
        <td>${book?.title || '#'+r.bookId}</td>
        <td>${r.borrowerName}<br><span class="addr-short">${shortAddr(r.borrower)}</span></td>
        <td>${fmtDate(r.borrowDate)}</td>
        <td>${fmtTime(r.borrowDate)}</td>
        <td>${fmtDate(r.dueDate)}</td>
        <td>${r.isReturned ? fmtDate(r.returnDate) : '—'}</td>
        <td>
          <span id="return-time-${r.recordId}">${r.isReturned ? fmtTime(r.returnDate) : '—'}</span>
        </td>
        <td>${statusHtml}</td>
      </tr>`;
    }).join('') + '</tbody></table></div>';
}

// ==================== MEMBERS ====================
async function loadMembers() {
  if (!contract) { showNoContract('members-table'); return; }
  document.getElementById('members-table').innerHTML = '<div class="loading"><div class="spinner"></div>Đang tải...</div>';
  try {
    const members = await contract.methods.getAllMembers().call();
    const wrap = document.getElementById('members-table');
    wrap.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Tên</th><th>Địa chỉ ví</th><th>Email</th><th>Đã mượn</th><th>Đã trả</th><th>Đang mượn</th></tr></thead><tbody>' +
      members.map(m => `<tr>
        <td><strong>${m.name}</strong>${m.memberAddress.toLowerCase()===currentAccount?.toLowerCase()?' <span class="badge badge-gold">Bạn</span>':''}</td>
        <td><span class="addr-short">${shortAddr(m.memberAddress)}</span></td>
        <td>${m.email || '—'}</td>
        <td>${m.totalBorrowed}</td>
        <td>${m.totalReturned}</td>
        <td><span class="badge ${Number(m.currentBorrowing)>0?'badge-teal':'badge-green'}">${m.currentBorrowing}</span></td>
      </tr>`).join('') + '</tbody></table></div>';
  } catch(e) { document.getElementById('members-table').innerHTML = errHtml(e.message); }
}

async function registerMember() {
  if (!contract) { showAlert('error','Chưa kết nối contract!'); return; }
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  if (!name) { showAlert('error','Vui lòng nhập tên!'); return; }
  try {
    showAlert('info','Đang đăng ký...');
    const tx = await contract.methods.registerMember(name, email).send({ from: currentAccount, gas: await estimateGasOrDefault(contract.methods.registerMember(name, email), { from: currentAccount }) });

    txLog('success', `✓ Đăng ký thành viên: ${name} | TX: ${shortAddr(tx.transactionHash)}`);
    showAlert('success','Đăng ký thành viên thành công!');
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    await checkMemberStatus();
  } catch(e) {
    showAlert('error', parseError(e));
    txLog('error', '✗ registerMember: ' + e.message);
  }
}

async function checkMemberStatus() {
  if (!contract || !currentAccount) return;
  try {
    const m = await contract.methods.getMember(currentAccount).call();
    const card = document.getElementById('member-status-card');
    const formCard = document.getElementById('register-form-card');
    if (m.isRegistered) {
      card.style.display = 'block';
      document.getElementById('member-status-body').innerHTML = `
        <div class="grid-2">
          <div><span class="text-xs" style="color:var(--text3)">TÊN</span><br><strong>${m.name}</strong></div>
          <div><span class="text-xs" style="color:var(--text3)">EMAIL</span><br>${m.email||'—'}</div>
          <div><span class="text-xs" style="color:var(--text3)">ĐÃ MƯỢN</span><br><span class="badge badge-gold">${m.totalBorrowed} lần</span></div>
          <div><span class="text-xs" style="color:var(--text3)">ĐANG MƯỢN</span><br><span class="badge badge-teal">${m.currentBorrowing} cuốn</span></div>
        </div>`;
      formCard.style.display = 'none';
    } else {
      card.style.display = 'none';
      formCard.style.display = 'block';
    }
    document.getElementById('reg-addr').value = currentAccount;
  } catch(e) {}
}

// ==================== WALLET LOGOUT ====================
function logout() {
  try {
    localStorage.removeItem('library_private_key');
    localStorage.removeItem('library_contract');
  } catch (_) {}

  web3 = null;
  contract = null;
  currentAccount = null;
  isAdmin = false;
  allBooks = [];
  allRecords = [];

  document.getElementById('wallet-addr').textContent = '0x0000...0000';
  document.getElementById('wallet-info').style.display = 'none';
  document.getElementById('connect-btn').style.display = 'inline-flex';

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  document.getElementById('info-contract').textContent = '—';
  document.getElementById('info-admin').textContent = '—';
  document.getElementById('info-network').textContent = '—';

  document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

  showPage('dashboard');
}

// ==================== UTILS ====================
function shortAddr(addr) {
  if (!addr) return '—';
  return addr.slice(0,6) + '...' + addr.slice(-4);
}

function fmtDate(ts) {
  if (!ts || ts === '0') return '—';
  return new Date(Number(ts)*1000).toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'});
}

function fmtTime(ts) {
  if (!ts || ts === '0') return '—';
  return new Date(Number(ts)*1000).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function parseError(e) {
  const msg = e.message || '';
  if (msg.includes('revert')) {
    const m = msg.match(/revert (.+?)(?:"|$)/);
    return m ? m[1] : 'Giao dịch bị từ chối';
  }
  if (msg.includes('User denied')) return 'Người dùng đã từ chối giao dịch';
  return msg.slice(0,120);
}

function showAlert(type, msg) {
  const box = document.getElementById('alert-box');
  const el = document.createElement('div');
  const icons = {success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span class="alert-icon">${icons[type]||'ℹ️'}</span><span class="alert-msg">${msg}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity='0';el.style.transform='translateX(20px)';el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, 4000);
}

function txLog(type, msg) {
  const con = document.getElementById('tx-console');
  const el = document.createElement('div');
  el.className = `tx-line tx-${type}`;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  con.appendChild(el);
  con.scrollTop = con.scrollHeight;
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showNoContract(id) {
  document.getElementById(id).innerHTML = '<div class="empty"><div class="empty-icon">✗</div><div class="empty-text">Chưa kết nối contract</div><div class="empty-sub">Nhập địa chỉ contract và nhấn "Kết nối Contract"</div></div>';
}

function errHtml(msg) {
  return `<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Lỗi tải dữ liệu</div><div class="empty-sub">${msg.slice(0,100)}</div></div>`;
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); });
});

// Auto connect (không cần MetaMask). Nếu đã nhập private key trước đó thì tự kết nối.
window.addEventListener('load', async () => {
  const savedPk = localStorage.getItem('library_private_key');
  if (savedPk) {
    const pkInput = document.getElementById('private-key-input');
    if (pkInput) pkInput.value = savedPk;
    const rpcInput = document.getElementById('rpc-url-input');
    connectWallet();
  }
});

