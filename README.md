# School System Frontend

A React + Vite frontend built for a school management system.

## Run locally

```bash
cd c:\Users\HP\Downloads\project
npm install
npm run dev
```

Open http://localhost:3000

## Demo account

Use the demo login if your backend is not running:

- username: `admin`
- password: `admin123`

## Backend configuration

By default, the app expects the backend API at `http://localhost:5000/api`.

To change the backend base URL, create a `.env` file:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

The procurement, academic, and promotion APIs use `VITE_API_URL` as the backend
origin (without the `/api` path), for example `VITE_API_URL=http://localhost:8084`.
If it is not set, they derive the origin from `VITE_API_BASE_URL` by removing a
trailing `/api`, then fall back to `http://localhost:8084`.

## Supplier, procurement, and academic pages

- Supplier applications are public at `/suppliers/register`. Approved suppliers use `/home/supplier`.
- Department heads use `/home/procurement/my-requests`; procurement staff use `/home/procurement/desk`.
- Evaluation committee members use `/home/procurement/evaluation`; approvers use `/home/procurement/awards`.
- Receiving and finance staff use `/home/procurement/orders`.
- Admins and registrars use `/home/academic/setup`; academic officers and registrars use `/home/academic/promotions`.
- The original shorter procurement, academic, and supplier portal paths redirect into the authenticated app layout.

## Authentication flow

- `/login` is the first page.
- After login, the app stores `token` and `user` in `sessionStorage`.
- Protected routes check for `token`; if missing, they redirect to `/login`.
- If the app is reloaded in the same browser session, it restores the current user from `sessionStorage`.

## Admin invite flow

Admins can invite teachers, parents, and support staff from their respective roster pages.
- Enter the person's name and email; support staff also have a job title.
- Support staff invitations use the `STAFF` account role.
- The app sends invitations through `POST /admin/invite-user`.
- The backend sends an email with a tokenized invite link.
- Invitees complete setup at `/setup-password`; support staff accounts can then sign in with the `STAFF` role.

## Money out pages

After signing in, use **Money out** in the sidebar or open `/home/money`.
Super Admins, Admins, and Bursars can manage finance tasks; Teachers and Staff can view their own pay details;
Parents can view refund choices and history. Students are not granted access. The pages call the backend's `/money/**`
endpoints through `VITE_API_BASE_URL`, so configure that variable with the backend base URL before using these features.
The Money Out **Purchases** tab opens the supplier-application and procurement-request desk; the former supplier-and-expense workflow remains available under **Expenses**.
