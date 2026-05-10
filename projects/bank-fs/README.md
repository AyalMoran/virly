# Bank FS

Full-stack banking MVP built with:

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- MongoDB + Mongoose
- JWT authentication
- Email-button verification with a short-lived signed token

## Features

- User registration with email, password, and phone number
- Email verification link flow
- Secure login with hashed passwords and JWT
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

3. Start MongoDB locally or point `BANK_FS_MONGODB_URI` to your database.

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

## Default API

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`
