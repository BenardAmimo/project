import { useState } from "react";
import { procurementApi as api } from "../../api/schoolApi";
import { hasAnyRole } from "../../auth/auth";
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

export default function Orders() {
  const defaultStatus = hasAnyRole("RECEIVING_OFFICER")
    ? "PO_ISSUED"
    : hasAnyRole("FINANCE_OFFICER")
      ? "INVOICED"
      : "PO_ISSUED";
  const [status, setStatus] = useState(defaultStatus);
  const { data, error, reload } = useLoad(() => api.orders(status), [status]);
  const [text, setText] = useState({});
  const act = useAction();
  const canReceive = hasAnyRole("RECEIVING_OFFICER");
  const canPay = hasAnyRole("FINANCE_OFFICER");

  return (
    <div className="page school-feature">
      <h2>Purchase orders</h2>
      <Field label="Show">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["PO_ISSUED", "DELIVERED", "INVOICED", "PAID"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Alert>{error || act.error}</Alert>
      {data?.length === 0 && <Empty />}
      {data?.map((po) => (
        <Card
          key={po.id}
          title={`${po.poNumber} · ${po.requestTitle}`}
          actions={<Badge value={po.requestStatus} />}
        >
          <p>{po.supplierName} · {money(po.amount)}</p>
          <p className="muted">
            Delivered: {when(po.deliveredAt)} · Paid: {when(po.paidAt)}{" "}
            {po.paymentReference && `(${po.paymentReference})`}
          </p>
          {po.invoiceNumber && <p>Invoice {po.invoiceNumber}: {money(po.invoiceAmount)}</p>}

          {canReceive && po.requestStatus === "PO_ISSUED" && (
            <div className="row">
              <Field label="Delivery notes">
                <input
                  value={text[po.id] || ""}
                  onChange={(e) => setText({ ...text, [po.id]: e.target.value })}
                />
              </Field>
              <button
                disabled={act.busy}
                onClick={() =>
                  act.run(async () => {
                    await api.delivery(po.id, text[po.id] || "");
                    await reload();
                  })
                }
              >
                Confirm goods received
              </button>
            </div>
          )}
          {canPay && po.requestStatus === "INVOICED" && (
            <div className="row">
              <Field label="Payment reference">
                <input
                  value={text[po.id] || ""}
                  onChange={(e) => setText({ ...text, [po.id]: e.target.value })}
                />
              </Field>
              <button
                disabled={act.busy || !text[po.id]}
                onClick={() =>
                  act.run(async () => {
                    await api.pay(po.id, text[po.id]);
                    await reload();
                  })
                }
              >
                Record payment
              </button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
