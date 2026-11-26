import { useState } from "react";
import { procurementApi as api } from "../../api/schoolApi";
import {
  Alert,
  Badge,
  Card,
  Empty,
  Field,
  money,
  useAction,
  useLoad,
  when,
} from "../../components/ui";

const SUPPLIER_STATUSES = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"];
const REQUEST_STATUSES = [
  "SUBMITTED",
  "REVIEWED",
  "OPEN_FOR_BIDS",
  "BIDDING_CLOSED",
  "EVALUATED",
  "AWARDED",
  "PO_ISSUED",
  "DELIVERED",
  "INVOICED",
  "PAID",
  "REJECTED",
];

function Suppliers() {
  const [status, setStatus] = useState("PENDING");
  const { data, error, reload } = useLoad(() => api.suppliers(status), [status]);
  const [notes, setNotes] = useState({});
  const act = useAction();
  const go = (id, action) =>
    act.run(async () => {
      await api.supplierAction(id, action, notes[id] || "");
      await reload();
    });

  return (
    <>
      <Field label="Show">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {SUPPLIER_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Alert>{error || act.error}</Alert>
      {data?.length === 0 && <Empty>No suppliers with this status.</Empty>}
      {data?.map((s) => (
        <Card key={s.id} title={s.businessName} actions={<Badge value={s.status} />}>
          <p>Reg. {s.registrationNumber} · {s.contactEmail} · {s.phoneNumber || "no phone"}</p>
          <p className="muted">{s.address}</p>
          {s.reviewNotes && <p className="muted">Notes: {s.reviewNotes}</p>}
          <div className="row">
            <Field label="Notes">
              <input
                value={notes[s.id] || ""}
                onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
              />
            </Field>
            {s.status === "PENDING" && (
              <button disabled={act.busy} onClick={() => go(s.id, "start-review")}>
                Start review
              </button>
            )}
            {s.status === "UNDER_REVIEW" && (
              <>
                <button disabled={act.busy} onClick={() => go(s.id, "approve")}>Approve</button>
                <button className="danger" disabled={act.busy} onClick={() => go(s.id, "reject")}>
                  Reject
                </button>
              </>
            )}
            {s.status === "APPROVED" && (
              <button className="danger" disabled={act.busy} onClick={() => go(s.id, "suspend")}>
                Suspend
              </button>
            )}
            {s.status === "SUSPENDED" && (
              <button disabled={act.busy} onClick={() => go(s.id, "reinstate")}>
                Reinstate
              </button>
            )}
          </div>
        </Card>
      ))}
    </>
  );
}

function RequestCard({ r, onChanged }) {
  const act = useAction();
  const [form, setForm] = useState({
    approve: true,
    notes: "",
    budgetCode: "",
    method: "QUOTATION",
    deadline: "",
  });
  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const run = (fn) =>
    act.run(async () => {
      await fn();
      await onChanged();
    });

  return (
    <Card title={r.title} actions={<Badge value={r.status} />}>
      <p>{r.department} · {money(r.estimatedCost)} · requested by {r.requestedBy}</p>
      {r.biddingDeadline && (
        <p className="muted">Bidding deadline: {when(r.biddingDeadline)} ({r.method})</p>
      )}
      {r.budgetCode && <p className="muted">Budget code: {r.budgetCode}</p>}
      <Alert>{act.error}</Alert>

      {r.status === "SUBMITTED" && (
        <div className="row">
          <Field label="Decision">
            <select
              value={form.approve ? "yes" : "no"}
              onChange={(e) => setForm({ ...form, approve: e.target.value === "yes" })}
            >
              <option value="yes">Approve for tender</option>
              <option value="no">Reject</option>
            </select>
          </Field>
          <Field label="Budget code">
            <input value={form.budgetCode} onChange={set("budgetCode")} />
          </Field>
          <Field label="Notes">
            <input value={form.notes} onChange={set("notes")} />
          </Field>
          <button
            disabled={act.busy}
            onClick={() =>
              run(() =>
                api.review(r.id, {
                  approve: form.approve,
                  notes: form.notes,
                  budgetCode: form.budgetCode,
                })
              )
            }
          >
            Save review
          </button>
        </div>
      )}

      {r.status === "REVIEWED" && (
        <div className="row">
          <Field label="Method">
            <select value={form.method} onChange={set("method")}>
              <option>QUOTATION</option>
              <option>TENDER</option>
            </select>
          </Field>
          <Field label="Bidding closes">
            <input type="datetime-local" value={form.deadline} onChange={set("deadline")} />
          </Field>
          <button
            disabled={act.busy || !form.deadline}
            onClick={() =>
              run(() =>
                api.open(r.id, {
                  method: form.method,
                  deadline: new Date(form.deadline).toISOString(),
                })
              )
            }
          >
            Open for bids
          </button>
        </div>
      )}

      {r.status === "OPEN_FOR_BIDS" && (
        <button disabled={act.busy} onClick={() => run(() => api.closeBidding(r.id))}>
          Close bidding
        </button>
      )}
      {r.status === "BIDDING_CLOSED" && (
        <p className="muted">Waiting for the evaluation committee to score the bids.</p>
      )}
      {r.status === "AWARDED" && (
        <button disabled={act.busy} onClick={() => run(() => api.issuePo(r.id))}>
          Issue purchase order
        </button>
      )}
    </Card>
  );
}

function Requests() {
  const [status, setStatus] = useState("SUBMITTED");
  const { data, error, reload } = useLoad(() => api.requests(status), [status]);
  return (
    <>
      <Field label="Show">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {REQUEST_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Alert>{error}</Alert>
      {data?.length === 0 && <Empty>No requests with this status.</Empty>}
      {data?.map((r) => <RequestCard key={r.id} r={r} onChanged={reload} />)}
    </>
  );
}

export default function Desk() {
  const [tab, setTab] = useState("requests");
  return (
    <div className="page school-feature">
      <h2>Procurement desk</h2>
      <div className="tabs">
        <button
          className={tab === "requests" ? "on" : ""}
          onClick={() => setTab("requests")}
        >
          Purchase requests
        </button>
        <button
          className={tab === "suppliers" ? "on" : ""}
          onClick={() => setTab("suppliers")}
        >
          Supplier applications
        </button>
      </div>
      {tab === "requests" ? <Requests /> : <Suppliers />}
    </div>
  );
}
