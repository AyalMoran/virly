# Bank FS MVP Sequence Diagrams

This document captures the main Bank FS MVP interactions as Mermaid sequence diagrams.
It is based on the current repository documentation in `README.md` and `docs/bank-fs-project.md`.

## Participants

- `User`: End user interacting with the banking UI
- `Frontend`: React client application
- `Backend API`: Node.js + Express server
- `Database`: MongoDB persistence layer
- `Email Service`: SMTP provider or development fallback

## 1. Registration and Verification Link Dispatch

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database
    participant EmailService as Email Service

    User->>Frontend: Fill registration form<br/>email, password, phone
    Frontend->>BackendAPI: POST /api/auth/register
    BackendAPI->>BackendAPI: Validate email, password, phone format

    alt Invalid input
        BackendAPI-->>Frontend: 400 Validation error
        Frontend-->>User: Show field errors
    else Input valid
        BackendAPI->>Database: Check existing user by email
        alt Email already exists
            Database-->>BackendAPI: Matching user found
            BackendAPI-->>Frontend: 400 Duplicate email
            Frontend-->>User: Show duplicate email error
        else Email is unique
            Database-->>BackendAPI: No existing user
            BackendAPI->>BackendAPI: Hash password
            BackendAPI->>BackendAPI: Generate signed verification token
            BackendAPI->>BackendAPI: Create random starting balance
            BackendAPI->>Database: Save pending user with token hash and expiry
            Database-->>BackendAPI: Pending user created

            alt SMTP configured
                BackendAPI->>EmailService: Send verification link email
                EmailService-->>BackendAPI: Delivery accepted
                BackendAPI-->>Frontend: 201 Registration started
            else SMTP not configured
                BackendAPI->>BackendAPI: Log verification link locally for development
                BackendAPI-->>Frontend: 201 Registration started
            end

            Frontend-->>User: Ask user to check email
        end
    end
```

## 2. Email Verification and Account Activation

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database

    User->>BackendAPI: Click email link<br/>GET /api/auth/verify?token=...
    BackendAPI->>BackendAPI: Validate signed token
    BackendAPI->>Database: Find pending user by token subject

    alt User not found
        Database-->>BackendAPI: No matching user
        BackendAPI-->>Frontend: 400 Verification failed
        Frontend-->>User: Show verification error
    else User found
        Database-->>BackendAPI: Pending user record
        BackendAPI->>BackendAPI: Compare token hash and expiry

        alt Invalid or expired token
            BackendAPI-->>Frontend: 400 Invalid or expired token
            Frontend-->>User: Show verification error
        else Token valid
            BackendAPI->>Database: Mark user as verified
            Database-->>BackendAPI: User updated
            BackendAPI->>BackendAPI: Generate JWT token
            BackendAPI-->>Frontend: Redirect with auth token
            Frontend->>Frontend: Store JWT
            Frontend-->>User: Redirect to dashboard
        end
    end
```

## 3. Login and JWT Issuance

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database

    User->>Frontend: Submit email and password
    Frontend->>BackendAPI: POST /api/auth/login
    BackendAPI->>Database: Find user by email

    alt User not found
        Database-->>BackendAPI: No matching user
        BackendAPI-->>Frontend: 401 Invalid credentials
        Frontend-->>User: Show login error
    else User found
        Database-->>BackendAPI: User record
        BackendAPI->>BackendAPI: Compare password hash

        alt Password mismatch
            BackendAPI-->>Frontend: 401 Invalid credentials
            Frontend-->>User: Show login error
        else Password valid
            alt User not verified
                BackendAPI-->>Frontend: 403 Account not verified
                Frontend-->>User: Prompt for verification
            else User verified
                BackendAPI->>BackendAPI: Generate JWT token
                BackendAPI-->>Frontend: 200 Auth success + token + user data
                Frontend->>Frontend: Store JWT
                Frontend-->>User: Redirect to dashboard
            end
        end
    end
```

## 4. Protected Dashboard and Recent Transactions

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database

    User->>Frontend: Open dashboard
    Frontend->>BackendAPI: GET /api/account/me<br/>Authorization: Bearer JWT
    BackendAPI->>BackendAPI: Validate JWT

    alt Missing or invalid token
        BackendAPI-->>Frontend: 401 Unauthorized
        Frontend-->>User: Redirect to login
    else Token valid
        BackendAPI->>Database: Load user profile and balance
        Database-->>BackendAPI: User account data
        BackendAPI->>Database: Load recent transactions
        Database-->>BackendAPI: Transaction list
        BackendAPI-->>Frontend: 200 Account summary + transactions
        Frontend-->>User: Render balance and recent activity
    end
```

## 5. Money Transfer Between Registered Users

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database

    User->>Frontend: Submit recipient email and amount
    Frontend->>BackendAPI: POST /api/transfers<br/>Authorization: Bearer JWT
    BackendAPI->>BackendAPI: Validate JWT and amount

    alt Missing token or invalid JWT
        BackendAPI-->>Frontend: 401 Unauthorized
        Frontend-->>User: Redirect to login
    else Invalid amount
        BackendAPI-->>Frontend: 400 Invalid amount
        Frontend-->>User: Show amount validation error
    else Request valid
        BackendAPI->>Database: Load sender account
        Database-->>BackendAPI: Sender data
        BackendAPI->>Database: Find recipient by email

        alt Recipient not found
            Database-->>BackendAPI: No matching recipient
            BackendAPI-->>Frontend: 404 Recipient not found
            Frontend-->>User: Show recipient error
        else Recipient found
            Database-->>BackendAPI: Recipient data
            BackendAPI->>BackendAPI: Check sender balance

            alt Insufficient balance
                BackendAPI-->>Frontend: 400 Insufficient balance
                Frontend-->>User: Show transfer error
            else Sufficient balance
                BackendAPI->>Database: Debit sender balance
                BackendAPI->>Database: Credit recipient balance
                BackendAPI->>Database: Create sender debit transaction
                BackendAPI->>Database: Create recipient credit transaction
                Database-->>BackendAPI: Transfer persisted
                BackendAPI-->>Frontend: 201 Transfer success + updated balance
                Frontend-->>User: Show success and refreshed activity
            end
        end
    end
```

## 6. Recent Transactions Refresh

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API
    participant Database

    User->>Frontend: Refresh transaction history
    Frontend->>BackendAPI: GET /api/transactions?limit=10<br/>Authorization: Bearer JWT
    BackendAPI->>BackendAPI: Validate JWT

    alt Missing or invalid token
        BackendAPI-->>Frontend: 401 Unauthorized
        Frontend-->>User: Redirect to login
    else Token valid
        BackendAPI->>Database: Query recent transactions for user
        Database-->>BackendAPI: Transaction list
        BackendAPI-->>Frontend: 200 Transactions response
        Frontend-->>User: Render recent transactions
    end
```

## 7. Logout

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant BackendAPI as Backend API

    User->>Frontend: Click Sign Out
    Frontend->>BackendAPI: POST /api/auth/logout<br/>Authorization: Bearer JWT

    alt Logout endpoint available
        BackendAPI-->>Frontend: 200 Logout acknowledged
    else Client-side JWT logout only
        Frontend->>Frontend: Skip server call
    end

    Frontend->>Frontend: Remove stored JWT and session state
    Frontend-->>User: Redirect to login page
```

## Notes

- The diagrams reflect the documented MVP, not later planned phases such as Socket.IO notifications, Jitsi calls, or chatbot flows.
- Email verification is shown as the active path because the current repo documentation explicitly mentions email-based verification.
- The exact internal module names may change once the backend source is added; these diagrams focus on stable user-visible behavior and service boundaries.
