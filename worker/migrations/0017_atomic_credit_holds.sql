-- Referral credit is a platform discount, not cash. Reserve/return it in the
-- same SQLite statement as the payment transition; preserve its original owner.
CREATE TABLE payment_credit_holds (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  gross_kobo INTEGER NOT NULL CHECK(gross_kobo>0),
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo>=0 AND amount_kobo<=gross_kobo),
  returned_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_credit_holds_user ON payment_credit_holds(user_id);

-- Historical terminal rows are NOT credited again. Their historical balance
-- correctness still requires reconciliation; a migration must not mint credit.
INSERT INTO payment_credit_holds (payment_id,user_id,gross_kobo,amount_kobo,returned_at,created_at)
WITH legacy AS (
  SELECT p.*,b.owner_user_id,
    CASE WHEN json_valid(p.metadata) THEN p.metadata ELSE '{}' END AS meta FROM payments p JOIN businesses b ON b.id=p.business_id
), amounts AS (
  SELECT *,CASE WHEN json_type(meta,'$.credit_kobo')='integer' THEN MAX(0,json_extract(meta,'$.credit_kobo')) ELSE 0 END AS held,
    CASE WHEN json_type(meta,'$.gross')='integer' AND json_extract(meta,'$.gross')>0 THEN json_extract(meta,'$.gross') ELSE MAX(1,amount) END AS gross FROM legacy
)
SELECT id,owner_user_id,gross,MIN(held,gross),CASE WHEN status IN ('failed','rejected','refunded') THEN created_at ELSE NULL END,created_at FROM amounts;

CREATE TRIGGER return_payment_credit AFTER UPDATE OF status ON payments
WHEN NEW.status IN ('failed','rejected','refunded') AND OLD.status IN ('pending','submitted','reviewing','approved')
BEGIN
  UPDATE users SET referral_credit_kobo=referral_credit_kobo+COALESCE((SELECT amount_kobo FROM payment_credit_holds WHERE payment_id=NEW.id AND returned_at IS NULL),0)
    WHERE id=(SELECT user_id FROM payment_credit_holds WHERE payment_id=NEW.id AND returned_at IS NULL);
  UPDATE payment_credit_holds SET returned_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE payment_id=NEW.id AND returned_at IS NULL;
END;

CREATE TRIGGER validate_payment_intent BEFORE INSERT ON payments
BEGIN
  SELECT CASE WHEN NEW.status!='pending' OR typeof(NEW.amount)!='integer' OR NEW.amount<=0
    THEN RAISE(ABORT,'Invalid new payment intent') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM businesses b JOIN users u ON u.id=b.owner_user_id WHERE b.id=NEW.business_id AND b.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status='active')
    THEN RAISE(ABORT,'Payment owner unavailable') END;
  -- Do not invalidate a possibly live hosted checkout. A replacement could
  -- otherwise take real money against an intent already marked failed locally.
  SELECT CASE WHEN NEW.plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM payments WHERE business_id=NEW.business_id AND plan_id IS NOT NULL AND method='paystack' AND status='pending')
    THEN RAISE(ABORT,'A provider payment is already pending') END;
END;

CREATE TRIGGER reserve_payment_credit AFTER INSERT ON payments
BEGIN
  -- Replacing an unpaid bank draft also returns its credit, atomically.
  UPDATE payments SET status='failed',rejection_reason='Replaced by a newer payment.'
    WHERE business_id=NEW.business_id AND id!=NEW.id AND plan_id IS NOT NULL AND status='pending' AND method='bank_transfer' AND NEW.plan_id IS NOT NULL;
  INSERT INTO payment_credit_holds (payment_id,user_id,gross_kobo,amount_kobo,created_at)
    SELECT NEW.id,u.id,NEW.amount,CASE WHEN NEW.plan_id IS NOT NULL THEN MIN(MAX(0,u.referral_credit_kobo),NEW.amount) ELSE 0 END,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM businesses b JOIN users u ON u.id=b.owner_user_id WHERE b.id=NEW.business_id;
  UPDATE payments SET amount=NEW.amount-(SELECT amount_kobo FROM payment_credit_holds WHERE payment_id=NEW.id),
    metadata=json_set(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END,'$.gross',NEW.amount,'$.credit_kobo',(SELECT amount_kobo FROM payment_credit_holds WHERE payment_id=NEW.id)),
    method=CASE WHEN NEW.amount=(SELECT amount_kobo FROM payment_credit_holds WHERE payment_id=NEW.id) THEN 'manual' ELSE NEW.method END,
    kind=CASE WHEN NEW.kind='activation' AND (SELECT status FROM businesses WHERE id=NEW.business_id) NOT IN ('pending_payment','pending_approval') THEN 'subscription_renewal' ELSE NEW.kind END
    WHERE id=NEW.id;
  UPDATE users SET referral_credit_kobo=referral_credit_kobo-(SELECT amount_kobo FROM payment_credit_holds WHERE payment_id=NEW.id)
    WHERE id=(SELECT user_id FROM payment_credit_holds WHERE payment_id=NEW.id);
  -- A fully credit-funded plan has zero cash due. Approval and its entitlement,
  -- audit and receipt trigger are part of this same transaction, not a later call.
  UPDATE payments SET status='approved',verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id AND amount=0 AND plan_id IS NOT NULL;
END;

CREATE TABLE payment_settlements (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id),
  status TEXT NOT NULL CHECK(status IN ('rejected','refunded')),
  notification_id INTEGER NOT NULL REFERENCES notifications(id),
  notice_processed_at TEXT,
  referral_processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_settlement_pending ON payment_settlements(notice_processed_at,referral_processed_at);
CREATE TRIGGER commit_payment_settlement AFTER UPDATE OF status ON payments
WHEN (NEW.status='refunded' AND OLD.status='approved') OR (NEW.status='rejected' AND OLD.status IN ('pending','submitted','reviewing'))
BEGIN
  UPDATE businesses SET status='pending_payment' WHERE id=NEW.business_id AND NEW.status='rejected' AND NEW.kind='activation' AND status='pending_approval';
  UPDATE vendor_addons SET status='expired' WHERE payment_id=NEW.id AND NEW.status='refunded' AND status='active';
  INSERT INTO notifications (user_id,type,title,body,data,created_at,event_key)
    SELECT owner_user_id,'payment.'||NEW.status,
      CASE WHEN NEW.status='refunded' THEN 'A plan payment was marked refunded' ELSE 'Your payment was not approved' END,
      CASE WHEN NEW.status='refunded' THEN NEW.reference||' — '||COALESCE(NEW.rejection_reason,'')||'. CyberShop does not move the money; the operator returns it. Your store stays as it is unless they also revoke the plan.' ELSE COALESCE(NEW.rejection_reason,'Payment was not approved.') END,
      json_object('payment_id',NEW.id),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'payment.'||NEW.status||':'||NEW.id FROM businesses WHERE id=NEW.business_id;
  INSERT INTO payment_settlements (payment_id,status,notification_id,referral_processed_at,created_at)
    SELECT NEW.id,NEW.status,id,CASE WHEN NEW.status='refunded' AND NEW.plan_id IS NOT NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM notifications WHERE event_key='payment.'||NEW.status||':'||NEW.id;
  INSERT INTO audit_logs (actor_user_id,actor_role,action,entity_type,entity_id,meta,created_at)
    VALUES (NEW.verified_by,CASE WHEN NEW.verified_by IS NULL THEN 'system' ELSE 'admin' END,'payment.settlement_committed','payment',NEW.id,json_object('status',NEW.status),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- Rotate stuck follow-ups fairly instead of letting ten failed emails starve
-- every newer paid receipt or referral. No entitlement is replayed here.
ALTER TABLE payment_activations ADD COLUMN last_attempt_at TEXT;
ALTER TABLE payment_settlements ADD COLUMN last_attempt_at TEXT;

-- Referral balances and their in-app explanations must commit together too.
-- Historical rewards are not replayed. These events are deliberately in-app;
-- optional email delivery is not a prerequisite to earning/returning credit.
CREATE TRIGGER record_referral_reward AFTER UPDATE OF referral_rewarded_at ON businesses
WHEN OLD.referral_rewarded_at IS NULL AND NEW.referral_rewarded_at IS NOT NULL AND NEW.referred_by_user_id IS NOT NULL
BEGIN
  INSERT INTO notifications (user_id,type,title,body,data,created_at,event_key)
    VALUES (NEW.referred_by_user_id,'referral.rewarded',printf('%.2f NGN referral credit',NEW.referral_reward_kobo/100.0),
      NEW.name||' paid for a plan. The credit comes off your next plan payment. It is not cash.',json_object('business_id',NEW.id,'credit_kobo',NEW.referral_reward_kobo),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'referral.rewarded:'||NEW.referral_reward_token);
END;
CREATE TRIGGER record_referral_reversal AFTER UPDATE OF referral_rewarded_at ON businesses
WHEN OLD.referral_rewarded_at IS NOT NULL AND NEW.referral_rewarded_at IS NULL AND NEW.referred_by_user_id IS NOT NULL
BEGIN
  INSERT INTO notifications (user_id,type,title,body,data,created_at,event_key)
    VALUES (NEW.referred_by_user_id,'referral.reversed','Referral credit adjusted',
      NEW.name||'''s plan payment was refunded, so that credit was taken back. It was never cash.',json_object('business_id',NEW.id),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'referral.reversed:'||OLD.referral_reward_token);
END;
