# TODO

## Step 1 — Fix out-of-gas on Records page
- [x] Add Solidity paged getter: `getBorrowRecordsPaged(start, limit)` to avoid bulk `getAllBorrowRecords()`.
- [x] Update frontend `loadRecords()` to use `getBorrowRecordsPaged` instead of `getAllBorrowRecords`.


## Step 2 — UI additions requested
- [x] Add “Xóa sách” (delete book) button in book modal.
- [x] Add “Đăng suất” (logout) button in the header.


## Step 3 — Build & verify
- [ ] `truffle compile`
- [ ] `truffle migrate` (if contract changed)
- [ ] Regenerate `frontend/LibraryABI.js` from `build/contracts/LibrarySystem.json`
- [ ] Manual test: open UI → Records page should no longer throw OOG.
