# RailFlow — Railway Ticket Management System

RailFlow is a full-stack railway ticket booking and operations platform powered by Node.js, Express, PostgreSQL, and an interactive Single-Page Application (SPA) frontend.

---

## 📁 Project Architecture

The backend has been completely modularized into dedicated directories for easy navigation and maintainability:

```text
railflow-ticket-ui-main/
├── controllers/                  # Backend Business Logic Controllers
│   ├── analyticsController.js    # Complex Queries, Aggregations & Audit Logs
│   ├── authController.js         # Authentication, Registration & Profile (Explicit Transactions)
│   ├── bookingController.js      # Booking Creation & Stored Procedure Cancellation
│   ├── scheduleController.js     # Schedules, Stations, Seats & DB Function Fare Calculation
│   ├── ticketController.js       # Multi-Table Ticket Queries & Ticket Cancellations
│   └── userController.js         # Admin User Management (Explicit Transactions)
├── middleware/                   # Authentication & Authorization Middleware
│   └── auth.js                   # requireAuth, requireRole, Session & Scrypt Password Hashing
├── routes/                       # Express Modular Routes
│   ├── analyticsRoutes.js        # /api/analytics/...
│   ├── api.js                    # Main Central API Router
│   ├── authRoutes.js             # /api/auth/...
│   ├── bookingRoutes.js          # /api/bookings/...
│   ├── scheduleRoutes.js         # /api/schedules/...
│   ├── ticketRoutes.js           # /api/tickets/...
│   └── userRoutes.js             # /api/users/...
├── scripts/                      # Database Schema & Migration Scripts
│   ├── database_features.sql     # Stored Procedures, Functions, Triggers & Audit Tables
│   ├── migrate-passwords.js      # Password Hash Migration Script
│   └── restore-constraints.sql   # Domain Constraints
├── app.js                        # Frontend Single Page Application
├── connection.js                 # PostgreSQL Pool Connection
├── index.html                    # HTML Shell
├── index.js                      # Express HTTP Server Entry Point
└── package.json
```

---

## 📋 Evaluation Checklist Coverage

### 1. User Authentication ✅
* Handled exclusively by custom in-house code without third-party authentication services.
* Password hashing uses Node.js native `crypto.scryptSync` with cryptographic salts (`crypto.randomBytes(16)`).
* Session management uses secure 32-byte hex session tokens with sliding TTL in [`middleware/auth.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/middleware/auth.js).

### 2. Authentication Validation on Every Page ✅
* All protected backend endpoints enforce the `requireAuth` middleware. Requests lacking valid session tokens return `401 Unauthorized`.
* The client-side SPA router in [`app.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/app.js) checks session status on every route render (`if (!state.auth) route = 'login'`) and immediately redirects unauthenticated users to the sign-in page.

### 3. Explicit Transaction Control ✅
* **100% of DML operations** (INSERT, UPDATE, DELETE) implement explicit transaction blocks (`BEGIN`, `COMMIT`, and `ROLLBACK`):
  - `register` ([`controllers/authController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/authController.js)): `BEGIN` → duplicate checks → `INSERT INTO users` → `COMMIT` / `ROLLBACK`.
  - `updateProfile` ([`controllers/authController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/authController.js)): `BEGIN` → `UPDATE users` → `INSERT/UPDATE passenger` → `COMMIT` / `ROLLBACK`.
  - `login` password upgrade ([`controllers/authController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/authController.js)): `BEGIN` → `UPDATE users` → `COMMIT` / `ROLLBACK`.
  - `createBooking` ([`controllers/bookingController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/bookingController.js)): `BEGIN` → `INSERT passenger` → `UPDATE seat_availability` → `INSERT ticket` → `INSERT payment` → `COMMIT` / `ROLLBACK`.
  - `cancelBookingByReference` ([`controllers/bookingController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/bookingController.js)): `BEGIN` → calls `CALL sp_cancel_booking(...)` → `COMMIT` / `ROLLBACK`.
  - `cancelTicket` ([`controllers/ticketController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/ticketController.js)): `BEGIN` → `INSERT cancellation` → `UPDATE ticket` → `UPDATE seat_availability` → `UPDATE payment` → `COMMIT` / `ROLLBACK`.
  - `createUser` ([`controllers/userController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/userController.js)): `BEGIN` → `INSERT INTO users` → `COMMIT` / `ROLLBACK`.

### 4. Use of Triggers ✅
Defined and documented in [`scripts/database_features.sql`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/scripts/database_features.sql) and active in PostgreSQL:
* **`trg_ticket_status_audit`** on table `ticket`: An `AFTER INSERT OR UPDATE OF ticket_status` trigger executing `fn_audit_ticket_status()`. Sensitive actions (booking, cancellation, state transitions) are automatically logged into the shadow table `ticket_audit_log`.
* **`schedule_create_seat_availability`** on table `schedule`: Automatically generates initial `Available` seat records for all coaches when a new schedule is created.

### 5. Use of Functions ✅
Defined and documented in [`scripts/database_features.sql`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/scripts/database_features.sql) and active in PostgreSQL:
* **`fn_calculate_ticket_fare(p_base_fare, p_fare_per_km, p_distance_km)`**: Computes mathematical fare amounts directly inside SQL queries.
* **`fn_calculate_cancellation_refund(p_fare_amount, p_journey_date, p_departure_time)`**: Computes tiered refunds (0%, 10%, 20%, 30%, 100% deduction) according to departure time directly in the database engine.
* **`fn_get_schedule_occupancy(p_schedule_id)`**: Statistical function calculating real-time percentage occupancy of a train schedule.

### 6. Use of Procedures ✅
Defined and documented in [`scripts/database_features.sql`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/scripts/database_features.sql) and active in PostgreSQL:
* **`sp_cancel_booking(p_booking_reference, p_reason, INOUT p_refund_total, INOUT p_fee_percent)`**:
  - Implements the complete multi-step cancellation workflow within the database.
  - Updates multiple tables in a single operation: `cancellation`, `ticket`, `seat_availability`, and `payment`.
  - Automatically activates the shadow audit trigger `trg_ticket_status_audit`.

### 7. Use of Complex Queries ✅
Exposed via [`controllers/analyticsController.js`](file:///c:/Users/Asus/Downloads/railflow-ticket-ui-main/railflow-ticket-ui-main/controllers/analyticsController.js) and displayed in the frontend **Analytics & Statistics** dashboard:
1. **Top Routes by Revenue & Volume:** Joins `route`, `schedule`, `seat_availability`, and `ticket` using `COUNT`, `SUM`, `AVG`, `GROUP BY`, and `ORDER BY`.
2. **Train Performance & Occupancy:** Joins `train`, `schedule`, `coach`, `seat`, and `seat_availability`, utilizing the database function `fn_get_schedule_occupancy`.
3. **Financial & Booking Summary:** Aggregates gross revenue, cancellations, refund deductions, and net revenue across `ticket`, `payment`, and `cancellation`.
4. **Schedule Search Query:** 8-table join with multiple lateral subqueries, `COUNT(*) FILTER`, and `string_agg`.

### 8. Appropriate Use of Database Features ✅
* Features are applied strictly where logically sound:
  - **Stored Procedures** for atomic multi-table transactional workflows.
  - **Functions** for reusable business math and statistics.
  - **Triggers** for non-intrusive shadow audit logging and automatic relational inventory seeding.

---

## 🚀 How to Run

1. **Install dependencies (if not already installed):**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open the application:**
   Navigate to [http://localhost:8000](http://localhost:8000) in your web browser.
