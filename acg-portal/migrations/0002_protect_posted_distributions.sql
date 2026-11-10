-- A paid row is the financial record, including any legacy paid rows. The
-- note-terms writer replaces the schedule in a batch. Rejecting a deletion
-- here rolls back that entire batch even if the payment was just recorded.
CREATE TRIGGER distributions_keep_paid_delete
BEFORE DELETE ON distributions
WHEN OLD.paid_date IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'posted distribution is locked');
END;

CREATE TRIGGER distributions_keep_paid_update
BEFORE UPDATE ON distributions
WHEN OLD.paid_date IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'posted distribution is locked');
END;
