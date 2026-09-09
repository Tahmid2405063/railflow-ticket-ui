
CREATE OR REPLACE FUNCTION release_seat_after_cancellation()

RETURNS TRIGGER

AS $$

BEGIN


    IF
        NEW.ticket_status = 'Cancelled'
        AND
        OLD.ticket_status <> 'Cancelled'

    THEN


        UPDATE seat_availability

        SET seat_status = 'AVAILABLE'

        WHERE seat_avail_id = NEW.seat_avail_id;


    END IF;



    RETURN NEW;


END;

$$ LANGUAGE plpgsql;




DROP TRIGGER IF EXISTS trigger_release_seat_cancel
ON ticket;



CREATE TRIGGER trigger_release_seat_cancel


AFTER UPDATE OF ticket_status

ON ticket


FOR EACH ROW


EXECUTE FUNCTION release_seat_after_cancellation();



CREATE OR REPLACE FUNCTION validate_seat_status()

RETURNS TRIGGER

AS $$

BEGIN



    NEW.seat_status :=
    UPPER(NEW.seat_status);



    IF NEW.seat_status NOT IN
    (
        'AVAILABLE',
        'BOOKED'
    )

    THEN

        RAISE EXCEPTION
        'Invalid seat status: %',
        NEW.seat_status;


    END IF;



    RETURN NEW;


END;

$$ LANGUAGE plpgsql;





DROP TRIGGER IF EXISTS trigger_validate_seat_status

ON seat_availability;



CREATE TRIGGER trigger_validate_seat_status


BEFORE INSERT OR UPDATE

ON seat_availability


FOR EACH ROW


EXECUTE FUNCTION validate_seat_status();



CREATE OR REPLACE FUNCTION release_completed_journey_seats()

RETURNS VOID

AS $$


BEGIN



    UPDATE seat_availability sa


    SET seat_status = 'AVAILABLE'


    FROM schedule s



    WHERE

    sa.schedule_id = s.schedule_id



    AND



    (
        s.journey_date::timestamp
        +
        s.arrival_time
    )

    < CURRENT_TIMESTAMP;



END;


$$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION open_future_train_seats()

RETURNS VOID

AS $$


BEGIN



    UPDATE seat_availability sa


    SET seat_status = 'AVAILABLE'


    FROM schedule s



    WHERE


    sa.schedule_id = s.schedule_id



    AND



    s.journey_date - CURRENT_DATE <= 3



    AND



    s.journey_date >= CURRENT_DATE



    AND



    sa.seat_status <> 'BOOKED';



END;


$$ LANGUAGE plpgsql;







