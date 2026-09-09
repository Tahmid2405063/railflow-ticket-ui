# RailFlow - Railway Ticket Management System

## Project Overview

RailFlow is a full-stack railway ticket management system designed to manage:

- User authentication
- Role-based authorization
- Train schedules
- Seat availability
- Ticket booking
- Payment processing
- Ticket cancellation


The system uses:

Frontend:
- React

Backend:
- Node.js
- Express.js

Database:
- PostgreSQL


Important design decision:

ORM libraries are NOT used.
All database operations are implemented using raw SQL queries with parameterized statements.

---

# Technology Stack

## Frontend

- React
- JavaScript
- CSS


## Backend

- Node.js
- Express.js
- JWT Authentication


## Database

- PostgreSQL


## Security

- bcrypt password hashing
- JWT signed tokens
- Parameterized SQL queries
- Role-based middleware

---

# Project Structure
railflow-ticket-management-system

│
├── controllers
│ ├── authController.js
│ ├── passengerController.js
│ ├── scheduleController.js
│ ├── bookingController.js
│ ├── cancellationController.js
│ └── adminController.js
│
├── middleware
│ ├── auth.js
│ └── role.js
│
├── routes
│ ├── authRoutes.js
│ ├── passengerRoutes.js
│ ├── scheduleRoutes.js
│ ├── bookingRoutes.js
│ ├── cancellationRoutes.js
│ └── adminRoutes.js
│
├── database
│ └── triggers.sql
│
├── utils
│ └── password.js
│
├── connection.js
├── index.js
└── package.json


---

# Installation

## 1. Clone repository
git clone <https://github.com/Tahmid2405063/railflow-ticket-ui>

---
## 2. Install dependencies
npm install

---

## 3. Configure environment variables

Create:
.env



---

# Running Application

Start backend:
npm start

