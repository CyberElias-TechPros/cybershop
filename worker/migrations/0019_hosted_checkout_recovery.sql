-- Private checkout capability: never included in payment listings or receipts.
CREATE TABLE payment_checkouts (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  checkout_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
