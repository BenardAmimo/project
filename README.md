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

## Authentication flow

- `/login` is the first page.
- After login, the app stores `token` and `user` in `localStorage`.
- Protected routes check for `token`; if missing, they redirect to `/login`.
- If the app is reloaded, it restores the current user from `localStorage`.

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
