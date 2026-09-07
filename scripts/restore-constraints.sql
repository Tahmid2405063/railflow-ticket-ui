-- Course-required domain constraints. Run after checking existing data.
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Admin','Manager','Staff','Customer')) NOT VALID;
ALTER TABLE train ADD CONSTRAINT train_train_type_check CHECK (train_type IN ('Express','Intercity','Passenger','Freight','Superfast')) NOT VALID;
ALTER TABLE coach ADD CONSTRAINT coach_coach_class_check CHECK (coach_class IN ('AC First Class','AC 2-Tier','AC 3-Tier','Sleeper','General','Chair Car')) NOT VALID;
ALTER TABLE fare_rule ADD CONSTRAINT fare_rule_coach_class_check CHECK (coach_class IN ('AC First Class','AC 2-Tier','AC 3-Tier','Sleeper','General','Chair Car')) NOT VALID;
ALTER TABLE seat ADD CONSTRAINT seat_seat_type_check CHECK (seat_type IN ('Lower','Middle','Upper','Side Lower','Side Upper','Window')) NOT VALID;
ALTER TABLE seat_availability ADD CONSTRAINT seat_availability_seat_status_check CHECK (seat_status IN ('Available','Booked','Reserved','Blocked','Waitlisted')) NOT VALID;
ALTER TABLE passenger ADD CONSTRAINT passenger_gender_check CHECK (gender IN ('Male','Female','Other')) NOT VALID;
ALTER TABLE ticket ADD CONSTRAINT ticket_ticket_status_check CHECK (ticket_status IN ('Booked','Cancelled','Completed','Waitlisted')) NOT VALID;
ALTER TABLE payment ADD CONSTRAINT payment_payment_method_check CHECK (payment_method IN ('Credit Card','Debit Card','UPI','Net Banking','Wallet')) NOT VALID;
ALTER TABLE payment ADD CONSTRAINT payment_payment_status_check CHECK (payment_status IN ('Success','Failed','Pending','Refunded')) NOT VALID;
