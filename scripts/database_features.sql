-- =============================================================================
-- RAILFLOW DATABASE FEATURES: TRIGGERS, FUNCTIONS, PROCEDURES & AUDIT LOG
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SHADOW / AUDIT TABLE & TRIGGER (Requirement 4)
-- Purpose: Automatically track and log sensitive actions (status changes, cancellations)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ticket_audit_log (
  audit_id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by VARCHAR(100) DEFAULT CURRENT_USER,
  action_note TEXT
);

-- Trigger Function: captures state transition on ticket_status
CREATE OR REPLACE FUNCTION fn_audit_ticket_status()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.ticket_status IS DISTINCT FROM NEW.ticket_status) THEN
      INSERT INTO ticket_audit_log (ticket_id, old_status, new_status, changed_at, action_note)
      VALUES (
        NEW.ticket_id,
        OLD.ticket_status,
        NEW.ticket_status,
        CURRENT_TIMESTAMP,
        'Ticket status transitioned from ' || COALESCE(OLD.ticket_status, 'NULL') || ' to ' || COALESCE(NEW.ticket_status, 'NULL')
      );
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO ticket_audit_log (ticket_id, old_status, new_status, changed_at, action_note)
    VALUES (
      NEW.ticket_id,
      NULL,
      NEW.ticket_status,
      CURRENT_TIMESTAMP,
      'Initial ticket booking created'
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_status_audit ON ticket;
CREATE TRIGGER trg_ticket_status_audit
AFTER INSERT OR UPDATE OF ticket_status ON ticket
FOR EACH ROW
EXECUTE FUNCTION fn_audit_ticket_status();


-- Trigger: Automatic Seat Availability Population on New Schedule Creation
CREATE OR REPLACE FUNCTION create_schedule_seat_availability()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.seat_availability (seat_status, schedule_id, seat_id)
  SELECT 'Available', NEW.schedule_id, st.seat_id
  FROM public.coach c
  JOIN public.seat st ON st.coach_id = c.coach_id
  WHERE c.train_id = NEW.train_id
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_availability sa
      WHERE sa.schedule_id = NEW.schedule_id AND sa.seat_id = st.seat_id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedule_create_seat_availability ON schedule;
CREATE TRIGGER schedule_create_seat_availability
AFTER INSERT ON schedule
FOR EACH ROW
EXECUTE FUNCTION create_schedule_seat_availability();


-- -----------------------------------------------------------------------------
-- 2. DATABASE FUNCTIONS (Requirement 5)
-- Purpose: Return computed and statistical values directly from the database engine
-- -----------------------------------------------------------------------------

-- Function 1: Compute ticket fare based on base fare, per-km rate, and route distance
CREATE OR REPLACE FUNCTION fn_calculate_ticket_fare(
  p_base_fare NUMERIC,
  p_fare_per_km NUMERIC,
  p_distance_km NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN CEIL(COALESCE(p_base_fare, 0) + (COALESCE(p_fare_per_km, 0) * COALESCE(p_distance_km, 0)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Function 2: Compute refund amount and fee percentage based on departure time
CREATE OR REPLACE FUNCTION fn_calculate_cancellation_refund(
  p_fare_amount NUMERIC,
  p_journey_date DATE,
  p_departure_time TIME
)
RETURNS TABLE (
  fee_percentage NUMERIC,
  refund_amount NUMERIC,
  hours_to_departure NUMERIC
) AS $$
DECLARE
  v_departure TIMESTAMP;
  v_now TIMESTAMP;
  v_hours NUMERIC;
  v_fee_rate NUMERIC;
BEGIN
  v_departure := (p_journey_date + p_departure_time);
  v_now := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka');
  v_hours := EXTRACT(EPOCH FROM (v_departure - v_now)) / 3600.0;
  
  IF v_hours < 6 THEN
    v_fee_rate := 1.0;   -- No refund within 6 hours (100% fee)
  ELSIF v_hours < 12 THEN
    v_fee_rate := 0.30;  -- 30% fee within 12 hours
  ELSIF v_hours < 24 THEN
    v_fee_rate := 0.20;  -- 20% fee within 24 hours
  ELSIF v_hours < 48 THEN
    v_fee_rate := 0.10;  -- 10% fee within 48 hours
  ELSE
    v_fee_rate := 0.0;   -- Full refund if > 48 hours
  END IF;

  fee_percentage := v_fee_rate * 100.0;
  refund_amount := GREATEST(0, ROUND(COALESCE(p_fare_amount, 0) * (1.0 - v_fee_rate), 2));
  hours_to_departure := ROUND(v_hours, 2);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Overload Function 2: Compute refund amount from direct TIMESTAMP
CREATE OR REPLACE FUNCTION fn_calculate_cancellation_refund(
  p_fare_amount NUMERIC,
  p_departure_timestamp TIMESTAMP
)
RETURNS TABLE (
  fee_percentage NUMERIC,
  refund_amount NUMERIC,
  hours_to_departure NUMERIC
) AS $$
BEGIN
  RETURN QUERY SELECT * FROM fn_calculate_cancellation_refund(
    p_fare_amount,
    p_departure_timestamp::date,
    p_departure_timestamp::time
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- Function 3: Statistical function calculating train schedule occupancy rate (%)
CREATE OR REPLACE FUNCTION fn_get_schedule_occupancy(p_schedule_id INT)
RETURNS NUMERIC AS $$
DECLARE
  v_total_seats INT;
  v_booked_seats INT;
BEGIN
  SELECT COUNT(*) INTO v_total_seats
  FROM seat_availability
  WHERE schedule_id = p_schedule_id;

  IF v_total_seats IS NULL OR v_total_seats = 0 THEN
    RETURN 0.0;
  END IF;

  SELECT COUNT(*) INTO v_booked_seats
  FROM seat_availability
  WHERE schedule_id = p_schedule_id AND UPPER(seat_status) = 'BOOKED';

  RETURN ROUND((v_booked_seats::NUMERIC / v_total_seats::NUMERIC) * 100.0, 2);
END;
$$ LANGUAGE plpgsql STABLE;


-- -----------------------------------------------------------------------------
-- 3. STORED PROCEDURES (Requirement 6)
-- Purpose: Multi-step workflows modifying multiple tables in a single operation
-- -----------------------------------------------------------------------------

-- Procedure: Complete Booking Cancellation
-- Handles multi-table updates: cancellation, ticket, seat_availability, payment
CREATE OR REPLACE PROCEDURE sp_cancel_booking(
  p_booking_reference VARCHAR,
  p_reason TEXT,
  INOUT p_refund_total NUMERIC DEFAULT 0,
  INOUT p_fee_percent NUMERIC DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec RECORD;
  v_hours NUMERIC;
  v_fee_rate NUMERIC;
BEGIN
  -- Verify booking exists and has booked tickets
  IF NOT EXISTS (
    SELECT 1 FROM ticket
    WHERE COALESCE(booking_reference, 'LEGACY-' || ticket_id::text) = p_booking_reference
      AND ticket_status = 'Booked'
  ) THEN
    RAISE EXCEPTION 'Booking % cannot be cancelled (it may already be cancelled or not exist).', p_booking_reference;
  END IF;

  -- Determine hours remaining until departure
  SELECT EXTRACT(EPOCH FROM ((s.journey_date + s.departure_time) - timezone('Asia/Dhaka', now()))) / 3600.0
  INTO v_hours
  FROM ticket t
  JOIN seat_availability sa ON sa.seat_avail_id = t.seat_avail_id
  JOIN schedule s ON s.schedule_id = sa.schedule_id
  WHERE COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) = p_booking_reference
  LIMIT 1;

  IF v_hours IS NULL THEN
    RAISE EXCEPTION 'Schedule details not found for booking %.', p_booking_reference;
  END IF;

  -- Tiered cancellation fee calculation
  IF v_hours < 6 THEN
    v_fee_rate := 1.0;
  ELSIF v_hours < 12 THEN
    v_fee_rate := 0.30;
  ELSIF v_hours < 24 THEN
    v_fee_rate := 0.20;
  ELSIF v_hours < 48 THEN
    v_fee_rate := 0.10;
  ELSE
    v_fee_rate := 0.0;
  END IF;

  p_fee_percent := v_fee_rate * 100.0;
  p_refund_total := 0;

  -- Multi-table updates for each ticket in the booking
  FOR v_rec IN
    SELECT t.ticket_id, t.fare_amount, t.seat_avail_id
    FROM ticket t
    WHERE COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) = p_booking_reference
      AND t.ticket_status = 'Booked'
    FOR UPDATE
  LOOP
    DECLARE
      v_ticket_refund NUMERIC := GREATEST(0, ROUND(v_rec.fare_amount * (1.0 - v_fee_rate), 2));
    BEGIN
      p_refund_total := p_refund_total + v_ticket_refund;

      -- Step 1: Record in cancellation table
      INSERT INTO cancellation (cancellation_date, reason, refund_amount, ticket_id)
      VALUES (CURRENT_TIMESTAMP, COALESCE(p_reason, 'Change of travel plan'), v_ticket_refund, v_rec.ticket_id);

      -- Step 2: Update ticket status (triggers shadow audit log)
      UPDATE ticket
      SET ticket_status = 'Cancelled'
      WHERE ticket_id = v_rec.ticket_id;

      -- Step 3: Release seat_availability back to Available
      UPDATE seat_availability
      SET seat_status = 'Available'
      WHERE seat_avail_id = v_rec.seat_avail_id;

      -- Step 4: Update payment status to Refunded
      UPDATE payment
      SET payment_status = 'Refunded'
      WHERE ticket_id = v_rec.ticket_id;
    END;
  END LOOP;
END;
$$;
