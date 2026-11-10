
# Personal Deposit & Expense Finance Tracker — Product Context and Future Roadmap

## 1. Product Overview

I have built a personal finance management web application focused on tracking where my money goes, managing individual deposits, monitoring savings, and reviewing financial activity over time.

The original motivation was simple:

**I want to know exactly where every rupee from a particular deposit went.**

Unlike conventional expense trackers that primarily track monthly income and expenditure, this application follows a deposit-centric accounting approach.

Every deposit is independently recorded and monitored. Expenses are linked to their respective deposits, allowing me to understand how each amount was utilized.

The application is designed primarily for personal use, with a mobile-friendly experience.

## 2. Existing Technology Stack

The application is built using:

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- MongoDB
- Mongoose
- Next.js API routes
- Vercel for deployment
- Recharts for analytics (planned/in the original implementation architecture)

The existing website should remain the primary finance management interface. Future automation should integrate with its existing backend rather than requiring a complete rewrite.

## 3. Core Financial Concept: Deposit-Centric Tracking

### A. Deposit Management

Whenever I receive money, I create a new deposit record.

Each deposit has:

- Unique deposit ID (e.g. DEP-001, DEP-002).
- Deposit amount.
- Source of money.
- Description or purpose.
- Deposit date.
- Savings amount decided at the time of deposit.
- Spendable amount.

Formula:

`Spendable Amount = Deposit Amount - Initial Savings`

For example:

| Attribute        |    Value |
| ---------------- | -------: |
| Deposit ID       |  DEP-001 |
| Deposit amount   | ₹10,000 |
| Initial savings  |  ₹2,000 |
| Spendable amount |  ₹8,000 |

### B. Expense Management

Every expense should be associated with a particular deposit.

An expense contains:

- Amount.
- Description.
- Category.
- Transaction date.
- Associated deposit ID.
- Payment method (future enhancement).
- Source (manual or automated).

For example:

| Expense  |  Amount |
| -------- | ------: |
| Food     |   ₹500 |
| Travel   |   ₹300 |
| Shopping | ₹1,000 |
| Other    |   ₹200 |
| Total    | ₹2,000 |

The application should show exactly how much was spent from each deposit.

### C. Deposit Balance Monitoring

For every deposit:

`Remaining Balance = Spendable Amount - Total Confirmed Expenses`

The application should maintain:

- Original deposit amount.
- Initial savings.
- Total expenses.
- Remaining spendable balance.
- Savings allocation.
- Transaction history.

The system should preserve the relationship between deposits and expenses rather than treating all expenses as an undifferentiated monthly total.

## 4. Five-Month Deposit Monitoring and Review

An important part of the application is monitoring each deposit over a five-month period.

Every deposit should have its own monitoring lifecycle.

The system should:

1. Record the deposit creation date.
2. Start a five-month monitoring period.
3. Track all expenses associated with the deposit.
4. Calculate remaining balance automatically.
5. Monitor the rate of expenditure.
6. Track savings utilization.
7. Generate a financial review after five months.

The five-month review should ideally include:

- Original deposited amount.
- Initial savings allocation.
- Total expenditure.
- Remaining balance.
- Monthly expenditure breakdown.
- Category-wise spending.
- Average monthly spending.
- Spending trends.
- Savings performance.
- Unusual or excessive expenditure.

The objective is to understand how efficiently I utilized the money over the entire deposit lifecycle.

## 5. Current Problem: Manual Transaction Entry

The biggest limitation of the current application is that I have to manually enter transactions.

This becomes difficult because almost every UPI payment or bank transaction requires another manual entry into the website.

I want to eliminate this repetitive work.

**The goal is to automate expense tracking using bank SMS messages received on my Samsung Android phone.**

I want transactions to flow from my phone directly into my existing Next.js application.

## 6. Future Feature: Automatic Bank SMS Integration

I want to develop a dedicated Android companion application that works alongside the existing Next.js website.

### Proposed architecture

Samsung Android Phone → Android Companion App → Next.js API → MongoDB → Existing Finance Dashboard

### Transaction capture

When I make a UPI payment or receive a bank transaction alert:

1. My bank sends an SMS or notification.
2. The Android companion app detects the relevant transaction.
3. It extracts the transaction information.
4. It sends structured transaction data to my Next.js API.
5. The backend validates and processes the transaction.
6. The transaction appears in the finance dashboard.

### Technologies for Android companion

- Kotlin.
- Android Studio.
- Jetpack Compose.
- Android SMS Broadcast Receiver, subject to permission and distribution requirements.
- NotificationListenerService as an alternative capture mechanism.
- Retrofit or OkHttp for API communication.

### Important phone constraints

I use a Samsung Android phone.

I do not want to:

- Root my phone.
- Keep Developer Options enabled.
- Keep USB Debugging enabled.
- Compromise Google Pay, PhonePe or other UPI applications.
- Make changes that could cause Indian UPI security checks to block payments.

The application should work as a normal installed Android application, without requiring developer settings during everyday use.

NotificationListenerService is worth investigating because it can capture displayed bank notifications without requesting direct SMS-reading permission. However, it may miss suppressed notifications.

Direct SMS access must also account for Android permissions and Google Play policies.

## 7. Future Backend: Transaction Processing Engine

The Next.js application should receive transactions through an authenticated endpoint.

Proposed API:

`POST /api/sms`

The incoming payload should contain only the required information:

- Sender identifier.
- SMS or notification content, processed locally where possible.
- Received timestamp.
- Extracted transaction details.

### Transaction parser

The backend should support different bank SMS formats.

Proposed transaction structure:

```typescript
interface ParsedTransaction {
  amount: number;
  transactionType: "DEBIT" | "CREDIT";
  merchant?: string;
  bank?: string;
  reference?: string;
  timestamp: Date;
}
```

The processing pipeline should handle:

1. Bank identification.
2. Transaction parsing.
3. Debit and credit detection.
4. Merchant extraction.
5. UPI reference extraction.
6. Duplicate transaction detection.
7. Expense categorization.
8. Deposit association.
9. Balance recalculation.
10. Audit logging.

### Proposed transaction categories

- Food.
- Travel.
- Shopping.
- Education.
- Entertainment.
- Bills.
- Transfers.
- Cash withdrawals.
- Other.

Categories should be extensible.

## 8. Deposit Matching Intelligence

An important challenge is identifying which deposit a transaction belongs to.

Initially, the system should suggest the most appropriate active deposit and let me confirm it.

Future options include:

- Automatic matching based on deposit dates and available balances.
- FIFO allocation across active deposits.
- Rules based on bank accounts and payment sources.
- Manual reassignment.

The system must distinguish between actual expenses and money movements.

Examples:

| Transaction                      | Treatment            |
| -------------------------------- | -------------------- |
| UPI payment to a merchant        | Expense              |
| Transfer between my own accounts | Internal transfer    |
| ATM withdrawal                   | Cash movement        |
| Refund                           | Credit/reversal      |
| Bank interest                    | Income               |
| Unknown transaction              | Pending verification |

A transaction should not automatically reduce a deposit's spendable balance unless it is classified and confirmed appropriately.

## 9. Proposed Database Enhancements

The existing Deposit and Expense models should be preserved.

Potential additional models:

### BankTransaction

- amount
- transactionType
- merchant
- bank
- reference
- timestamp
- depositId
- category
- status
- fingerprint
- source

Possible statuses:

- PENDING
- CONFIRMED
- IGNORED
- REVERSED

### SMSIngestionLog

- sender
- receivedAt
- processingStatus
- errorMessage
- transactionReference

The BankTransaction record should be linked to its corresponding Expense record.

The Expense model should remain the source of confirmed expense accounting entries. Avoid creating duplicate expense records when processing the same bank transaction.

## 10. Dashboard Improvements

The existing website should evolve into a more comprehensive financial monitoring dashboard.

Potential additions:

### Overall Financial Overview

- Total deposits.
- Total savings.
- Total expenditure.
- Available balance.
- Monthly spending.
- Recent transactions.

### Individual Deposit Dashboard

- Deposit information.
- Associated expenses.
- Spending timeline.
- Category breakdown.
- Remaining balance.
- Five-month progress.
- Review report.

### Automated Transaction Inbox

- Newly detected transactions.
- Pending deposit assignment.
- Unknown merchants.
- Duplicate alerts.
- Failed parsing records.
- Manual confirmation and correction.

### Analytics

- Monthly expenditure charts.
- Category-wise spending.
- Deposit utilization.
- Spending trends.
- Savings performance.
- Unusual spending patterns.

## 11. Five-Month Review Automation

The application should eventually have a scheduled backend job.

It should periodically check deposits whose five-month review dates have arrived.

The job should:

1. Identify eligible deposits.
2. Calculate their financial summaries.
3. Generate individual deposit review reports.
4. Identify unusual spending patterns.
5. Update review status.
6. Notify me through the application.

The review should be generated independently for every deposit.

## 12. Security Requirements

Financial data is sensitive, so security is a core requirement.

- HTTPS-only API communication.
- Authenticated phone-to-server requests.
- Revocable device tokens.
- Request timestamp validation.
- HMAC signatures where appropriate.
- Idempotency and duplicate protection.
- Rate limiting.
- No OTP forwarding.
- No UPI PIN or banking credentials.
- Avoid storing full SMS bodies unnecessarily.
- Audit logs for transaction changes.
- Manual correction of incorrectly parsed transactions.

The Android application should send only the information required for transaction tracking.

## 13. Longer-Term Product Ideas

Beyond the original expense tracker, I would like to evolve this into a personal financial intelligence platform.

Potential future features:

1. Multiple savings funds.
2. Savings goals and progress tracking.
3. Budget allocation.
4. Automatic recurring income detection.
5. Receipt scanning using OCR.
6. Smart merchant recognition.
7. Expense categorization using rules or ML.
8. Monthly financial reports.
9. Spending anomaly detection.
10. Searchable financial history.
11. Export to CSV or Excel.
12. Recurring expense tracking.
13. Financial health scoring.
14. Cash-flow forecasting.
15. Natural-language queries such as "Where did my last ₹5,000 go?"

These are future possibilities, not necessarily part of the current implementation.

## 14. Suggested Development Roadmap

### Phase 1 — Understand and stabilize existing tracker

- Review existing database models.
- Understand deposit and expense relationships.
- Preserve existing functionality.
- Verify balance calculations.

### Phase 2 — Android companion MVP

- Create Kotlin application.
- Set up notification capture.
- Parse a few common bank transaction formats.
- Test on the Samsung device.
- Ensure UPI applications continue working normally.

### Phase 3 — Backend integration

- Implement authenticated transaction ingestion API.
- Create transaction parser.
- Add duplicate detection.
- Store transaction records.
- Link transactions to expenses.

### Phase 4 — Transaction verification

- Build pending transaction inbox.
- Implement deposit suggestions.
- Allow manual confirmation and correction.
- Add exception handling.

### Phase 5 — Financial intelligence

- Automatic deposit monitoring.
- Spending analytics.
- Five-month review reports.
- Scheduled notifications.
- Financial summaries.

### Phase 6 — Advanced automation

- Better transaction classification.
- Receipt OCR.
- Spending anomaly detection.
- Forecasting.
- Natural-language financial assistant.

---

## 15. Overall Product Vision

I want a system where I don't have to maintain my finances manually.

Whenever I receive money, I create a deposit and decide how much to save.

After that, whenever I spend money using UPI, debit card or other supported payment methods, the system should automatically detect the transaction, classify it, associate it with the appropriate deposit, and update my financial records.

The application should continuously monitor my deposits and generate meaningful financial reviews after five months.

**The ultimate objective: Turn a manually maintained deposit and expense tracker into an automated, intelligent personal finance management system, with my existing Next.js website as the central dashboard and a lightweight Android companion as the transaction capture layer.**
