# Money-Out module: setup

The money-out React screens are in `src/pages` and use `src/moneyApi.js`. The backend module belongs under
`com.school.money`. The small integration edits below connect the screens to the existing app.

## 1. Edits in your existing project

**a) BURSAR role.** Add `BURSAR` to your `Role` enum (the one used by `UserReg.role`). Create the bursar's user with that role.
Roles reach the module as `ROLE_<NAME>` through `UserReg.getAuthorities()`; the module accepts that form.

**b) Security config.** M-Pesa calls the callbacks without a login:
```java
.requestMatchers("/money/mpesa/**").permitAll()
```
Everything else under `/money/**` just needs `.authenticated()`: roles are checked inside the module.

**c) Staff list.** `JpqlStaffDirectory` lists every enabled `UserReg` whose role is not `PARENT` or `STUDENT`. If you have another
non-staff role (for example `STUDENT_GUARDIAN`), add it to the `not in (...)` list in that one class.
The username of a staff member in this module is their email (`UserReg.getUsername()` returns the email).

**d) Fees module hook (carry-forward).** When working out what a student owes in a term, subtract
`FeeCreditService.availableFor(studentId, termId)` (see FUNDS_HOOK.md). Without this, approved carry-forwards are recorded but never used.

**e) Page and access.** The app routes the money-out screen at `/home/money` and shows a sidebar link to eligible roles.
`MoneyOutRoute` fetches the signed-in user's roles from `GET /me`, then passes them to `MoneyOutPage`. Ensure the backend
implements `/me` and returns a user record with `role`, `roles`, or `authorities`. The route accepts app role names such
as `Super Admin`, `Admin`, `Bursar`, `Teacher`, `Staff`, and `Parent`, as well as backend forms such as `ROLE_ADMIN`
and `ROLE_SUPPORT_STAFF`.

Super Admins, Admins, and Bursars see the finance tabs; Teachers and Staff see their own pay, advances, and tokens;
Parents see only their refund choices/history. Students do not have access. App route access is not a substitute for
backend authorization: all `/money/**` endpoints must still enforce their own permissions.

The existing API client is `src/api.js`; it must have `VITE_API_BASE_URL` configured to your backend base URL, including
any `/api` prefix. The screens call `/money/**` relative to that base URL. If your axios instance is exported
differently, change the one `import api from "../api"` in `src/moneyApi.js`.

## 2. Dependencies

Already in a normal Spring Boot project: web, data-jpa, security, validation, webflux, lombok, mail.
For the tests add (test scope): `org.springframework.boot:spring-boot-starter-test` and `com.h2database:h2`.

## 3. application.properties (secrets come from environment variables, never typed in)

```properties
app.money.daily-limit=500000
app.money.advance.max-salary-fraction=0.75
app.money.advance.max-instalments=4
app.money.tender.quotes-from=20000
app.money.tender.tender-from=200000
app.money.tender.min-quotes=3
app.money.tender.tender-open-days=7
app.money.tender.invoice-tolerance=0
app.money.refund.decision-days=14
app.money.refund.auto-scan=true

app.money.notify.enabled=true
app.money.notify.school-name=Your School Name
# app.money.notify.from=finance@yourschool.example   (defaults to the mail account)

# Safaricom's charge per M-Pesa payment, from your own tariff. Empty = no charges recorded.
# app.money.fees.tiers[0].up-to=100
# app.money.fees.tiers[0].fee=0

app.money.b2b.enabled=${MONEY_MPESA_ENABLED:false}
app.money.b2b.base-url=${MPESA_BASE_URL:https://sandbox.safaricom.co.ke}
app.money.b2b.consumer-key=${MPESA_CONSUMER_KEY:}
app.money.b2b.consumer-secret=${MPESA_CONSUMER_SECRET:}
app.money.b2b.shortcode=${B2C_SHORTCODE:}
app.money.b2b.initiator=${B2C_INITIATOR:}
app.money.b2b.initiator-password=${B2C_INITIATOR_PASSWORD:}
app.money.b2b.cert-path=${B2C_CERT_PATH:}
app.money.b2b.callback-base=${MONEY_CALLBACK_BASE:}
app.money.b2b.callback-secret=${MONEY_CALLBACK_SECRET:}
```
`MONEY_CALLBACK_SECRET` must be a new random string of 24+ characters. `MONEY_CALLBACK_BASE` is the public https address of your server (ngrok while testing).
Alerts use your existing `spring.mail.*` settings; with no mail server configured they are skipped quietly.

## 4. Things to check against your own entities (only these classes know your tables)

`port/JpqlStaffDirectory.java`: `UserReg.email, firstName, lastName, enabled, role`.
`port/JpqlStudentLedger.java`: lines marked `CHECK`: `MpesaTransactions.amount, .status, .phoneNumber, .student, .funds`;
`Funds.term.termId`; `Student.studentId, .classes, .parent.userReg.email`; `Term.termId`.
A wrong name does not stop the app from starting; the screen shows a clear message only when that feature is used.

`DarajaClient` field names (marked `CHECK`, especially the Transaction Status request) must be compared with Safaricom's
current Daraja documentation before going live. Paybill and Till payments need Safaricom to enable B2B for your shortcode.

## 5. What happens automatically

| When | What |
|---|---|
| A payment is sent and no answer comes in 15 minutes | It becomes NEEDS REVIEW and Admins and the Bursar are emailed. It is never resent by itself. "Ask Safaricom" asks for the real result |
| Payroll is prepared | Admins are emailed; when approved, every staff member gets their payslip by email |
| An advance, token, purchase or refund needs a decision | The approvers are emailed; the requester is told the outcome |
| Every night | Overpayments in the two most recent terms are found; the parent is emailed to choose; no answer in 14 days carries the money forward |

## 6. Rules in force

| Area | Rule |
|---|---|
| Payment details | A staff member cannot verify their own payee details, even if another admin entered them. Super Admins may save and verify details for another person, but never their own. The backend must enforce both rules on every save/verify request. |
| Pay | Bursar prepares and sends; whoever approved a payment cannot also pay it; daily limit applies to M-Pesa and bank |
| Payroll | Net salary only. Bursar prepares, a different Admin approves. A starter, a leaver or a raise part-way through a month is paid for the days at each salary |
| Leaving | An Admin stops pay after the last day; the last payroll takes back what is still owed on an advance, up to that pay |
| Advance | Up to 3/4 of one month's net salary, whole shillings, 1 to 4 monthly deductions from payroll, one open advance per person, cannot approve your own. Cash/bank repayments can be recorded; refused while an open payroll already holds an instalment |
| Token | Admin nominates and sets the amount, only a Super Admin approves (never the nominator); paid with payroll on its own payslip line |
| Purchases | Below 20,000: one approval. 20,000 and above: 3 quotes + one approval. 200,000 and above: tender open 7 days, 3 bids, Admin then a different Super Admin. Picking a dearer quote needs a written reason. The invoice must match the award |
| Refunds | Credit = paid + carried in - due. Parent chooses refund (back to the number that paid, never more than that payer paid) or carry-forward. No answer in 14 days = carry-forward. An Admin approves every outcome. One credit per student and term |
| Safaricom charges | Recorded per paid M-Pesa payment from your tariff and shown per month |

### Where to request, approve, and pay

- Staff submit their own advance under **Money out → My pay**. An Admin sets each staff member's net salary under
  **Payroll → Net monthly salary**; that salary determines the advance limit.
- An Admin approves or rejects the request under **Advances**. Approval creates a payment order; a Bursar sends it
  under **Payments** using the staff member's verified payment details. Repayments are deducted through payroll.
- An Admin nominates an appreciation token under **Tokens**; a different Super Admin approves it. It is not sent as
  a separate transfer: it is added to the staff member's next payroll and appears as a separate payslip line. The
  Bursar prepares payroll, an Admin approves it, and the Bursar sends the resulting payment orders under **Payments**.

## 7. Tests

`mvnw test` runs the rule and flow tests (48 checks) and `EntityMappingTest`, which builds every entity on in-memory H2 to catch column-name and mapping mistakes.
