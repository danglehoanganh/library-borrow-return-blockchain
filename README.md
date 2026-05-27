<div align="center">

# 🎓 Faculty of Information Technology (Dai Nam University)

## 📚 BUILDING A BLOCKCHAIN-BASED LIBRARY BORROW/RETURN SYSTEM USING GANACHE

</div>

<p align="center">
  <img src="fitdnu_logo.png" alt="FIT DNU" width="150"/>
  <img src="dnu_logo.png" alt="Dai Nam University" width="150"/>
</p>

---

<p align="center">
  <a href="#">
    <img src="https://img.shields.io/badge/Blockchain-Ethereum-blue?style=for-the-badge" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Smart%20Contract-Solidity-green?style=for-the-badge" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Ganache-Local%20Blockchain-orange?style=for-the-badge" />
  </a>
</p>

## 🛠️ Yêu cầu hệ thống

- **Node.js** >= 16
- **Truffle** (đã tích hợp trong devDependencies)
- **Ganache** (GUI hoặc CLI) — https://trufflesuite.com/ganache/
- **MetaMask** extension trên trình duyệt

---

## 🚀 Hướng dẫn chạy

### Bước 1 — Cài đặt dependencies
```bash
npm install
```

### Bước 2 — Khởi động Ganache
- Mở **Ganache GUI** → New Workspace
- Hoặc dùng CLI: `npx ganache --port 7545`
- Đảm bảo chạy ở port **7545**

### Bước 3 — Compile & Deploy Smart Contract
```bash
# Compile Solidity
npm run compile

# Deploy lên Ganache
npm run migrate

# Nếu đã deploy trước, dùng lệnh này để reset:
npm run migrate:reset
```

Sau khi deploy, **copy Contract Address** hiển thị trong terminal.

### Bước 4 — Cấu hình MetaMask
1. Mở MetaMask → Add Network:
   - Network Name: `Ganache`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency: `ETH`
2. Import account từ Ganache (copy Private Key từ Ganache GUI)


### Bước 5 — Chạy Web Frontend
```bash
npm start
# Hoặc: cd frontend && npx http-server -p 8080
```
Mở trình duyệt: **http://localhost:8080**

### Bước 6 — Kết nối Contract
1. Nhấn **"Kết nối MetaMask"**
2. Paste **Contract Address** vào ô "Contract Address" ở sidebar
3. Nhấn **"Kết nối Contract"**
4. Bắt đầu sử dụng hệ thống!

---

## 📋 Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📊 Dashboard | Thống kê tổng quan hệ thống |
| 📚 Danh sách sách | Xem & tìm kiếm tất cả sách |
| ➕ Thêm sách | Admin thêm sách mới (có số lượng) |
| ✏️ Sửa sách | Admin chỉnh sửa thông tin sách |
| 📤 Mượn sách | Thành viên mượn sách (tối đa 3 cuốn) |
| 📥 Trả sách | Trả sách và ghi nhận lên blockchain |
| 📋 Lịch sử | Toàn bộ giao dịch mượn/trả |
| 👤 Đăng ký | Đăng ký thành viên bằng ví MetaMask |
| 👥 Quản lý | Admin xem danh sách thành viên |
| 🔗 TX Log | Nhật ký giao dịch blockchain |

---

## 📄 Smart Contract

File: `contracts/LibrarySystem.sol`

**Key functions:**
- `addBook(title, author, isbn, category, copies)` — Admin thêm sách
- `updateBook(id, ...)` — Admin cập nhật sách
- `registerMember(name, email)` — Đăng ký thành viên
- `borrowBook(bookId, borrowerName)` — Mượn sách
- `returnBook(recordId)` — Trả sách
- `getAllBooks()` — Lấy tất cả sách
- `getAllBorrowRecords()` — Lấy tất cả giao dịch
- `getActiveRecords()` — Giao dịch đang mượn
- `getAllMembers()` — Tất cả thành viên

**Rules:**
- Hạn mượn: **14 ngày**
- Tối đa: **3 cuốn/thành viên**
- Mượn/trả được ghi vĩnh viễn trên blockchain

---

## 📁 Cấu trúc project

```
blockchain-library/
├── contracts/
│   └── LibrarySystem.sol      # Smart Contract chính
├── migrations/
│   └── 1_deploy_library.js    # Script deploy
├── frontend/
│   ├── index.html             # Web app chính
│   └── LibraryABI.js          # ABI của contract
├── build/
│   └── contracts/             # ABI JSON sau khi compile
├── truffle-config.js          # Cấu hình Truffle/Ganache
├── package.json
└── README.md
```


