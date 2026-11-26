import { lazy, Suspense, useState } from "react";
import MyPayPage from "./MyPayPage";
import OrdersPage from "./OrdersPage";
import PayeesPage from "./PayeesPage";
import PayrollPage from "./PayrollPage";
import AdvancesAdminPage from "./AdvancesAdminPage";
import TokensPage from "./TokensPage";
import ExpensesPage from "./ExpensesPage";
import RefundsPage, { ParentRefunds } from "./RefundsPage";

const ProcurementDesk = lazy(() => import("./procurement/Desk"));

/**
 * One page for everything money-out. Pass the signed-in user's roles, e.g.
 *   <MoneyOutPage roles={["ADMIN"]} />
 * The server enforces every rule; the roles here only decide which tabs and buttons appear.
 */
export default function MoneyOutPage({ roles = [], user = null }) {
  const normalizeRole = (role) => {
    const normalized = String(role ?? "").trim().replace(/^ROLE_/i, "").replace(/[\s-]+/g, "_").toUpperCase();
    if (normalized === "SUPERADMIN") return "SUPER_ADMIN";
    if (normalized === "SUPPORT_STAFF") return "STAFF";
    return normalized;
  };
  const has = (r) => roles.some((role) => normalizeRole(role) === r);
  const superAdmin = has("SUPER_ADMIN");
  const admin = has("ADMIN") || superAdmin;
  const bursar = has("BURSAR");
  const finance = admin || bursar;
  const parent = has("PARENT");
  const staff = roles.some((role) => ["SUPER_ADMIN", "ADMIN", "BURSAR", "TEACHER", "STAFF"].includes(normalizeRole(role)));

  const tabs = [
    ["mypay", "My pay", staff, () => <MyPayPage />],
    ["refunds-parent", "My refunds", parent, () => <ParentRefunds />],
    ["orders", "Payments", finance, () => <OrdersPage />],
    ["payees", "Payment details", finance, () => <PayeesPage isSuperAdmin={superAdmin} currentUser={user} />],
    ["payroll", "Payroll", finance, () => <PayrollPage canApprove={admin} />],
    ["advances", "Advances", finance, () => <AdvancesAdminPage canApprove={admin} />],
    ["tokens", "Tokens", admin, () => <TokensPage isAdmin={has("ADMIN")} isSuperAdmin={superAdmin} />],
    ["purchases", "Purchases", admin, () => (
      <Suspense fallback={<p role="status">Loading purchases…</p>}>
        <ProcurementDesk />
      </Suspense>
    )],
    ["expenses", "Expenses", finance, () => <ExpensesPage canApprove={admin} isSuperAdmin={superAdmin} />],
    ["refunds", "Refunds", finance, () => <RefundsPage canApprove={admin} />],
  ].filter((t) => t[2]);

  const [tab, setTab] = useState(tabs[0][0]);
  const current = tabs.find((t) => t[0] === tab) || tabs[0];

  return (
    <div style={{ padding: 16 }}>
      <h2>Money out</h2>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #ddd", marginBottom: 12 }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === current[0]}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 14px",
              border: "none",
              cursor: "pointer",
              background: "none",
              color: "#1f2937",
              fontWeight: key === current[0] ? 700 : 400,
              borderBottom: key === current[0] ? "3px solid #1b6fb3" : "3px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {current[3]()}
    </div>
  );
}
