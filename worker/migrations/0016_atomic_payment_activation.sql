-- Status + entitlement + in-app receipt + retry ledger commit as one SQLite transaction.
-- Existing approved rows are deliberately NOT replayed: audit/reconcile legacy entitlements first.
ALTER TABLE notifications ADD COLUMN event_key TEXT;
CREATE UNIQUE INDEX ix_notification_event ON notifications(event_key) WHERE event_key IS NOT NULL;
ALTER TABLE businesses ADD COLUMN referral_reward_token TEXT;
ALTER TABLE businesses ADD COLUMN referral_reward_kobo INTEGER;
CREATE TABLE payment_activations (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id),
  notification_id INTEGER REFERENCES notifications(id),
  notice_processed_at TEXT,
  referral_processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_activation_pending ON payment_activations(notice_processed_at,referral_processed_at);

CREATE TRIGGER apply_payment_approval AFTER UPDATE OF status ON payments
WHEN NEW.status='approved' AND OLD.status IN ('pending','submitted','reviewing')
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM businesses WHERE id=NEW.business_id AND deleted_at IS NULL)
    THEN RAISE(ABORT,'Payment business unavailable') END;
  SELECT CASE WHEN NEW.kind IN ('activation','subscription_renewal') AND NOT EXISTS (SELECT 1 FROM plans WHERE id=NEW.plan_id)
    THEN RAISE(ABORT,'Payment plan unavailable') END;
  SELECT CASE WHEN NEW.kind='addon' AND NOT EXISTS (SELECT 1 FROM addons WHERE id=NEW.addon_id)
    THEN RAISE(ABORT,'Payment addon unavailable') END;
  INSERT INTO payment_activations (payment_id,created_at) VALUES (NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

  UPDATE subscriptions SET plan_id=NEW.plan_id,status='active',
    starts_at=CASE WHEN NEW.kind='activation' AND (expires_at IS NULL OR expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE starts_at END,
    expires_at=CASE
      WHEN NEW.kind='activation' AND (SELECT interval FROM plans WHERE id=NEW.plan_id) NOT IN ('monthly','quarterly','yearly') THEN NULL
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ',CASE WHEN expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN expires_at ELSE 'now' END,
        '+'||(SELECT CASE interval WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 WHEN 'yearly' THEN 365 ELSE 30 END FROM plans WHERE id=NEW.plan_id)||' days') END,
    grace_until=NULL
    WHERE id=(SELECT id FROM subscriptions WHERE business_id=NEW.business_id ORDER BY id DESC LIMIT 1) AND NEW.kind IN ('activation','subscription_renewal');
  INSERT INTO subscriptions (business_id,plan_id,status,starts_at,expires_at)
    SELECT NEW.business_id,NEW.plan_id,'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      CASE WHEN (SELECT interval FROM plans WHERE id=NEW.plan_id) IN ('monthly','quarterly','yearly')
        THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','+'||(SELECT CASE interval WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 ELSE 365 END FROM plans WHERE id=NEW.plan_id)||' days') ELSE NULL END
    WHERE NEW.kind IN ('activation','subscription_renewal') AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE business_id=NEW.business_id);
  UPDATE subscriptions SET renews_at=expires_at WHERE business_id=NEW.business_id AND id=(SELECT id FROM subscriptions WHERE business_id=NEW.business_id ORDER BY id DESC LIMIT 1) AND NEW.kind IN ('activation','subscription_renewal');
  UPDATE businesses SET status='active' WHERE id=NEW.business_id AND NEW.kind IN ('activation','subscription_renewal') AND status IN ('pending_payment','pending_approval','expired','grace');
  INSERT INTO vendor_addons (business_id,addon_id,quantity,status,payment_id,purchased_at,expires_at)
    SELECT NEW.business_id,NEW.addon_id,1,'active',NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now','+'||duration_days||' days') FROM addons WHERE id=NEW.addon_id AND NEW.kind='addon';

  INSERT INTO notifications (user_id,type,title,body,data,created_at,event_key)
    SELECT owner_user_id,'payment.approved',CASE WHEN NEW.verified_by IS NULL THEN 'Payment confirmed' ELSE 'Your payment has been approved' END,
      NEW.reference||' — '||printf('%.2f',NEW.amount/100.0)||' NGN cash recorded. See your receipt for platform credit applied. Store restrictions, if any, still apply.',json_object('payment_id',NEW.id),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'payment.approved:'||NEW.id
    FROM businesses WHERE id=NEW.business_id;
  UPDATE payment_activations SET notification_id=(SELECT id FROM notifications WHERE event_key='payment.approved:'||NEW.id) WHERE payment_id=NEW.id;
  INSERT INTO audit_logs (actor_user_id,actor_role,action,entity_type,entity_id,meta,created_at)
    VALUES (NEW.verified_by,CASE WHEN NEW.verified_by IS NULL THEN 'system' ELSE 'admin' END,'payment.entitlements_applied','payment',NEW.id,json_object('reference',NEW.reference,'amount',NEW.amount),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
