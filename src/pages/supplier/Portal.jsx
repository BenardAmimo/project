import { useState } from "react";
import { supplierApi } from "../../api/schoolApi";
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

function Opportunities() {
  const { data, error, reload } = useLoad(supplierApi.opportunities);
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ amount: "", deliveryDays: "", notes: "" });
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const send = async (id) => {
    const r = await act.run(
      async () => {
        await supplierApi.submitBid(id, {
          amount: Number(f.amount),
          deliveryDays: f.deliveryDays ? Number(f.deliveryDays) : null,
          notes: f.notes,
        });
        return true;
      },
      "Bid submitted. It stays sealed until bidding closes."
    );
    if (r) {
      setOpen(null);
      setF({ amount: "", deliveryDays: "", notes: "" });
      reload();
    }
  };

  return (
    <>
      <Alert>{error}</Alert>
      <Alert kind="ok">{act.ok}</Alert>
      {data?.length === 0 && <Empty>No open opportunities right now.</Empty>}
      {data?.map((o) => (
        <Card key={o.id} title={o.title} actions={<Badge value={o.method} />}>
          <p>{o.description}</p>
          <p className="muted">Deadline: {when(o.biddingDeadline)}</p>
          {open === o.id ? (
            <>
              <div className="row">
                <Field label="Amount (KES)">
                  <input type="number" min="1" value={f.amount} onChange={set("amount")} />
                </Field>
                <Field label="Delivery days">
                  <input type="number" min="1" value={f.deliveryDays} onChange={set("deliveryDays")} />
                </Field>
                <Field label="Notes">
                  <input value={f.notes} onChange={set("notes")} />
                </Field>
              </div>
              <Alert>{act.error}</Alert>
              <button disabled={act.busy || !f.amount} onClick={() => send(o.id)}>
                Submit bid
              </button>{" "}
              <button className="secondary" onClick={() => setOpen(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setOpen(o.id)}>Place bid</button>
          )}
        </Card>
      ))}
    </>
  );
}

function MyBids() {
  const { data, error, reload } = useLoad(supplierApi.myBids);
  const act = useAction();
  return (
    <Card title="My bids">
      <Alert>{error || act.error}</Alert>
      {data?.length === 0 && <Empty />}
      <table>
        <tbody>
          {data?.map((b) => (
            <tr key={b.id}>
              <td>{b.requestTitle}</td>
              <td>{money(b.amount)}</td>
              <td>{b.deliveryDays ? `${b.deliveryDays} days` : "—"}</td>
              <td><Badge value={b.status} /></td>
              <td>
                {b.status === "SUBMITTED" && (
                  <button
                    className="danger"
                    disabled={act.busy}
                    onClick={() =>
                      act.run(async () => {
                        await supplierApi.withdraw(b.id);
                        await reload();
                      })
                    }
                  >
                    Withdraw
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Orders() {
  const { data, error, reload } = useLoad(supplierApi.myOrders);
  const [inv, setInv] = useState({});
  const act = useAction();
  const set = (id, k) => (e) => setInv({ ...inv, [id]: { ...inv[id], [k]: e.target.value } });

  return (
    <>
      <Alert>{error || act.error}</Alert>
      {data?.length === 0 && <Empty>No purchase orders yet.</Empty>}
      {data?.map((po) => (
        <Card
          key={po.id}
          title={`${po.poNumber} · ${po.requestTitle}`}
          actions={<Badge value={po.requestStatus} />}
        >
          <p>Order value: <b>{money(po.amount)}</b></p>
          <p className="muted">Delivered: {when(po.deliveredAt)} · Paid: {when(po.paidAt)}</p>
          {po.invoiceNumber && <p>Invoice {po.invoiceNumber}: {money(po.invoiceAmount)}</p>}
          {po.deliveredAt && !po.invoiceNumber && (
            <div className="row">
              <Field label="Invoice number">
                <input value={inv[po.id]?.number || ""} onChange={set(po.id, "number")} />
              </Field>
              <Field label="Invoice amount">
                <input
                  type="number"
                  value={inv[po.id]?.amount || ""}
                  onChange={set(po.id, "amount")}
                />
              </Field>
              <button
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    await supplierApi.invoice(po.id, {
                      invoiceNumber: inv[po.id]?.number,
                      amount: Number(inv[po.id]?.amount),
                    });
                    await reload();
                  })
                }
              >
                Submit invoice
              </button>
            </div>
          )}
          {!po.deliveredAt && (
            <p className="muted">You can invoice once the school confirms delivery.</p>
          )}
        </Card>
      ))}
    </>
  );
}

export default function SupplierPortal() {
  const [tab, setTab] = useState("opportunities");
  const me = useLoad(supplierApi.me);
  const approved = me.data?.status === "APPROVED";

  return (
    <div className="page school-feature">
      <h2>Supplier portal {me.data && <Badge value={me.data.status} />}</h2>
      <Alert>{me.error}</Alert>
      {me.data && !approved && (
        <Alert>
          Your account is {me.data.status.replaceAll("_", " ").toLowerCase()}.
          {me.data.reviewNotes ? ` Note from the school: ${me.data.reviewNotes}` : ""} You can bid
          once it is approved.
        </Alert>
      )}
      {approved && (
        <>
          <div className="tabs">
            {[
              ["opportunities", "Opportunities"],
              ["bids", "My bids"],
              ["orders", "Orders & invoices"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "opportunities" && <Opportunities />}
          {tab === "bids" && <MyBids />}
          {tab === "orders" && <Orders />}
        </>
      )}
    </div>
  );
}
