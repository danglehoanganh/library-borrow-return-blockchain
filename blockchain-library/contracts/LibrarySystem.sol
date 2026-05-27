// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract LibrarySystem {
    address public admin;

    // ============================
    // NEW: Library Transaction
    // ============================
    struct Transaction {
        address user;
        uint256 bookId;
        string action; // "BORROW" | "RETURN"
        uint256 timestamp;
    }


    struct Book {
        uint256 id;
        string title;
        string author;
        string isbn;
        string category;
        uint256 totalCopies;
        uint256 availableCopies;
        bool exists;
    }

    struct BorrowRecord {
        uint256 recordId;
        uint256 bookId;
        address borrower;
        string borrowerName;
        uint256 borrowDate;
        uint256 dueDate;
        uint256 returnDate;
        bool isReturned;
        bool isOverdue;
    }

    struct Member {
        address memberAddress;
        string name;
        string email;
        bool isRegistered;
        uint256 totalBorrowed;
        uint256 totalReturned;
        uint256 currentBorrowing;
    }

    uint256 public bookCount;
    uint256 public recordCount;
    uint256 public memberCount;

    // Transaction storage
    uint256 public transactionCount;
    mapping(uint256 => Transaction) public transactions;

    uint256 public constant MAX_BORROW_DAYS = 14;

    uint256 public constant MAX_BORROW_PER_MEMBER = 3;

    mapping(uint256 => Book) public books;
    mapping(uint256 => BorrowRecord) public borrowRecords;
    mapping(address => Member) public members;
    mapping(address => uint256[]) public memberBorrowHistory;
    mapping(uint256 => uint256[]) public bookBorrowHistory;
    address[] public memberList;

    event BookAdded(uint256 indexed bookId, string title, string author, uint256 copies);
    event BookBorrowed(uint256 indexed recordId, uint256 indexed bookId, address indexed borrower, uint256 dueDate);
    event BookReturned(uint256 indexed recordId, uint256 indexed bookId, address indexed borrower, bool wasOverdue);

    event TransactionRecorded(
        uint256 indexed txId,
        address indexed user,
        uint256 indexed bookId,
        string action,
        uint256 timestamp
    );

    event MemberRegistered(address indexed memberAddress, string name);
    event BookUpdated(uint256 indexed bookId, string title, uint256 totalCopies);
    event BookDeleted(uint256 indexed bookId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    // Record a borrow/return as a Transaction struct + event
    function _recordTransaction(address _user, uint256 _bookId, string memory _action) internal {
        transactionCount++;
        transactions[transactionCount] = Transaction({
            user: _user,
            bookId: _bookId,
            action: _action,
            timestamp: block.timestamp
        });
        emit TransactionRecorded(transactionCount, _user, _bookId, _action, block.timestamp);
    }


    modifier onlyRegistered() {
        require(members[msg.sender].isRegistered, "You must be a registered member");
        _;
    }

    constructor() {
        admin = msg.sender;
        members[msg.sender] = Member({
            memberAddress: msg.sender,
            name: "Admin",
            email: "admin@library.eth",
            isRegistered: true,
            totalBorrowed: 0,
            totalReturned: 0,
            currentBorrowing: 0
        });
        memberList.push(msg.sender);
        memberCount = 1;
    }

    function addBook(string memory _title, string memory _author, string memory _isbn, string memory _category, uint256 _copies) public onlyAdmin {
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(_copies > 0, "Must add at least 1 copy");
        bookCount++;
        books[bookCount] = Book({ id: bookCount, title: _title, author: _author, isbn: _isbn, category: _category, totalCopies: _copies, availableCopies: _copies, exists: true });
        emit BookAdded(bookCount, _title, _author, _copies);
    }

    function updateBook(uint256 _bookId, string memory _title, string memory _author, string memory _isbn, string memory _category, uint256 _totalCopies) public onlyAdmin {
        require(books[_bookId].exists, "Book does not exist");
        Book storage book = books[_bookId];
        uint256 borrowedCopies = book.totalCopies - book.availableCopies;
        require(_totalCopies >= borrowedCopies, "Cannot reduce below currently borrowed copies");
        book.title = _title; book.author = _author; book.isbn = _isbn; book.category = _category;
        book.availableCopies = _totalCopies - borrowedCopies; book.totalCopies = _totalCopies;
        emit BookUpdated(_bookId, _title, _totalCopies);
    }

    function registerMember(string memory _name, string memory _email) public {
        require(!members[msg.sender].isRegistered, "Already registered");
        require(bytes(_name).length > 0, "Name cannot be empty");
        members[msg.sender] = Member({ memberAddress: msg.sender, name: _name, email: _email, isRegistered: true, totalBorrowed: 0, totalReturned: 0, currentBorrowing: 0 });
        memberList.push(msg.sender);
        memberCount++;
        emit MemberRegistered(msg.sender, _name);
    }

    function borrowBook(uint256 _bookId, string memory _borrowerName) public onlyRegistered {
        require(books[_bookId].exists, "Book does not exist");
        require(books[_bookId].availableCopies > 0, "No copies available");
        require(members[msg.sender].currentBorrowing < MAX_BORROW_PER_MEMBER, "Borrow limit reached (max 3)");

        books[_bookId].availableCopies--;
        recordCount++;

        uint256 dueDate = block.timestamp + (MAX_BORROW_DAYS * 1 days);
        borrowRecords[recordCount] = BorrowRecord({ recordId: recordCount, bookId: _bookId, borrower: msg.sender, borrowerName: _borrowerName, borrowDate: block.timestamp, dueDate: dueDate, returnDate: 0, isReturned: false, isOverdue: false });
        memberBorrowHistory[msg.sender].push(recordCount);
        bookBorrowHistory[_bookId].push(recordCount);
        members[msg.sender].totalBorrowed++;
        members[msg.sender].currentBorrowing++;
        emit BookBorrowed(recordCount, _bookId, msg.sender, dueDate);

        _recordTransaction(msg.sender, _bookId, "BORROW");
    }


    function returnBook(uint256 _recordId) public {
        BorrowRecord storage record = borrowRecords[_recordId];

        require(record.borrower == msg.sender || msg.sender == admin, "Not authorized");
        require(!record.isReturned, "Book already returned");
        bool overdue = block.timestamp > record.dueDate;
        record.isReturned = true; record.returnDate = block.timestamp; record.isOverdue = overdue;
        books[record.bookId].availableCopies++;
        members[record.borrower].totalReturned++;
        members[record.borrower].currentBorrowing--;
        emit BookReturned(_recordId, record.bookId, record.borrower, overdue);
        _recordTransaction(msg.sender, record.bookId, "RETURN");
    }


    function getBook(uint256 _bookId) public view returns (Book memory) { require(books[_bookId].exists, "Book does not exist"); return books[_bookId]; }

    function getTransactions(uint256 start, uint256 limit) public view returns (Transaction[] memory) {
        if (start == 0) start = 1;
        if (start > transactionCount) return new Transaction[](0);

        uint256 endExclusive = start + limit;
        if (endExclusive > transactionCount + 1) endExclusive = transactionCount + 1;
        uint256 size = endExclusive - start;

        Transaction[] memory page = new Transaction[](size);
        uint256 idx = 0;
        for (uint256 i = start; i < endExclusive; i++) {
            page[idx] = transactions[i];
            idx++;
        }
        return page;
    }


    // Bulk getters (legacy; may fail as data grows)
    function getAllBooks() public view returns (Book[] memory) { Book[] memory allBooks = new Book[](bookCount); for (uint256 i = 1; i <= bookCount; i++) { allBooks[i - 1] = books[i]; } return allBooks; }
    function getAllBorrowRecords() public view returns (BorrowRecord[] memory) { BorrowRecord[] memory records = new BorrowRecord[](recordCount); for (uint256 i = 1; i <= recordCount; i++) { records[i - 1] = borrowRecords[i]; } return records; }

    // Paged borrow records (prevents out-of-gas from bulk getters as data grows)
    function getBorrowRecordsPaged(uint256 start, uint256 limit) public view returns (BorrowRecord[] memory) {
        if (start == 0) start = 1;
        if (start > recordCount) return new BorrowRecord[](0);

        uint256 endExclusive = start + limit;
        if (endExclusive > recordCount + 1) endExclusive = recordCount + 1;
        uint256 size = endExclusive - start;

        BorrowRecord[] memory page = new BorrowRecord[](size);
        uint256 idx = 0;
        for (uint256 i = start; i < endExclusive; i++) {
            page[idx] = borrowRecords[i];
            idx++;
        }
        return page;
    }

    function getAllMembers() public view returns (Member[] memory) { Member[] memory allMembers = new Member[](memberList.length); for (uint256 i = 0; i < memberList.length; i++) { allMembers[i] = members[memberList[i]]; } return allMembers; }
    function getActiveRecords() public view returns (BorrowRecord[] memory) { uint256 count = 0; for (uint256 i = 1; i <= recordCount; i++) { if (!borrowRecords[i].isReturned) count++; } BorrowRecord[] memory active = new BorrowRecord[](count); uint256 idx = 0; for (uint256 i = 1; i <= recordCount; i++) { if (!borrowRecords[i].isReturned) { active[idx] = borrowRecords[i]; idx++; } } return active; }

    // --------------------
    // Bounded getters (recommended)
    // --------------------
    function getBooks(uint256 start, uint256 limit) public view returns (Book[] memory) {
        if (start == 0) start = 1;
        if (start > bookCount) return new Book[](0);

        uint256 endExclusive = start + limit;
        if (endExclusive > bookCount + 1) endExclusive = bookCount + 1;
        uint256 size = endExclusive - start;

        Book[] memory page = new Book[](size);
        uint256 idx = 0;
        for (uint256 i = start; i < endExclusive; i++) {
            page[idx] = books[i];
            idx++;
        }
        return page;
    }

    function getMembers(uint256 start, uint256 limit) public view returns (Member[] memory) {
        if (start >= memberList.length) return new Member[](0);
        uint256 endExclusive = start + limit;
        if (endExclusive > memberList.length) endExclusive = memberList.length;
        uint256 size = endExclusive - start;

        Member[] memory page = new Member[](size);
        uint256 idx = 0;
        for (uint256 i = start; i < endExclusive; i++) {
            page[idx] = members[memberList[i]];
            idx++;
        }
        return page;
    }

    // Paged active records by scanning from start..recordCount (bounded by limit for output)
    function getActiveRecordsPaged(uint256 start, uint256 limit) public view returns (BorrowRecord[] memory) {
        if (start == 0) start = 1;
        if (start > recordCount) return new BorrowRecord[](0);

        // Worst-case allocation: limit records returned (still safe because we slice by idx)
        BorrowRecord[] memory page = new BorrowRecord[](limit);
        uint256 idx = 0;

        for (uint256 i = start; i <= recordCount && idx < limit; i++) {
            if (!borrowRecords[i].isReturned) {
                page[idx] = borrowRecords[i];
                idx++;
            }
        }

        if (idx == limit) return page;

        // Trim to actual idx
        BorrowRecord[] memory trimmed = new BorrowRecord[](idx);
        for (uint256 j = 0; j < idx; j++) {
            trimmed[j] = page[j];
        }
        return trimmed;
    }

    function deleteBook(uint256 _bookId) public onlyAdmin {
        require(books[_bookId].exists, "Book does not exist");

        // Prevent deleting books that still have outstanding borrowed copies
        // borrowedCopies = totalCopies - availableCopies
        uint256 borrowedCopies = books[_bookId].totalCopies - books[_bookId].availableCopies;
        require(borrowedCopies == 0, "Cannot delete: book has active borrows");

        // Mark as deleted and zero out copies.
        // Keep record/history indexes stable.
        books[_bookId].exists = false;
        books[_bookId].totalCopies = 0;
        books[_bookId].availableCopies = 0;

        emit BookDeleted(_bookId);

    }

    function getBorrowRecord(uint256 _recordId) public view returns (BorrowRecord memory) { return borrowRecords[_recordId]; }

    function getMemberHistory(address _member) public view returns (uint256[] memory) { return memberBorrowHistory[_member]; }
    function getMember(address _addr) public view returns (Member memory) { return members[_addr]; }

    // Legacy admin helper
    function isAdmin(address _addr) public view returns (bool) { return _addr == admin; }
}
