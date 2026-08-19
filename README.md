# RailFlow ticket UI

## Run locally

1. Open this folder in VS Code.
2. In its terminal, run `npm install`.
3. Run `npm run dev` and open the address Vite prints.

## Backend integration points

The screens use mock data in `src/App.jsx`. Replace the `trains` array and the ticket objects with API calls. Recommended endpoints:

- `POST /auth/login`
- `GET /trains?from=&to=&date=`
- `POST /bookings` (journey, passenger, selected seat)
- `POST /payments` (booking ID, payment token)
- `GET /bookings/me`
- `POST /bookings/:id/cancel`
- `GET/PATCH /me`

Keep payment card data tokenized through a payment gateway; do not send raw card details to your server.
