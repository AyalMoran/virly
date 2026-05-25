# Virly

Full-stack banking MVP built with:

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- HttpOnly cookie authentication with signed JWT sessions
- Email-button verification with a short-lived signed token

## Features

- User registration with email, password, and phone number
- Email verification link flow
- Secure login with hashed passwords, HttpOnly auth cookies, and CSRF protection
- Protected dashboard
- Random starting balance for new accounts
- Money transfer between registered users
- Recent transaction history

## Project Structure

- `client/` React frontend
- `server/` Express backend

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Copy the server environment file:

```bash
cp server/.env.example server/.env
```

3. Start MongoDB locally or point `VIRLY_MONGODB_URI` to your database.

4. Run the backend:

```bash
npm run dev:server
```

5. In another terminal, run the frontend:

```bash
npm run dev:client
```

## Email Verification

If SMTP credentials are configured, the backend sends a real email containing a verification button.

If SMTP is not configured, the backend logs the verification link to the server console so the flow is still easy to test locally.

Registration uses:

```http
POST /api/auth/register
```

```json
{
  "email": "user@example.com",
  "password": "password123",
  "phone": "+972501234567"
}
```

The email link points to:

```http
GET /api/auth/verify?token=<verificationToken>
```

Successful login and email verification set two cookies:

- `virly_auth`: HttpOnly, Secure JWT session cookie
- `virly_csrf`: Secure CSRF cookie readable by the frontend

Cookies use `SameSite=Lax` locally by default. For cross-site deployments such as Vercel frontend + Render API, set `VIRLY_COOKIE_SAME_SITE=none` on the backend so browser `fetch` requests can include the auth cookies.

On login, the Remember me checkbox controls cookie persistence. When checked, both cookies are persistent for 30 days and the expiration is refreshed on each successful login. When unchecked, the backend sets browser-session cookies without `Max-Age`; browsers generally clear those when the browser session ends, although "restore previous session" settings may preserve them.

Email verification auto-login uses browser-session cookies by default. The frontend sends API requests with credentials included. Authenticated unsafe requests (`POST`, `PUT`, `PATCH`, `DELETE`) also send `X-CSRF-Token` with the value from `virly_csrf`.

## Deploy

For Vercel + Render + Atlas:

- Vercel client env: `VITE_API_BASE_URL=https://<your-render-api>.onrender.com`
- Render server env: `VIRLY_CLIENT_URL=https://<your-vercel-app>.vercel.app`
- Render server env: `VIRLY_SERVER_URL=https://<your-render-api>.onrender.com`
- Render server env: `VIRLY_COOKIE_SAME_SITE=none`
- Render server env: `VIRLY_MONGODB_URI=<your-atlas-uri>`
- Render server env: `VIRLY_JWT_SECRET=<long-random-secret>`

`VIRLY_CLIENT_URL` may contain comma-separated origins if you need both production and preview frontend URLs. Do not use a wildcard when `credentials: "include"` is enabled.

## Default API

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`
