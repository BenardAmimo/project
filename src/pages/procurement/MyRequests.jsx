import { useState } from "react";
import { procurementApi } from "../../api/schoolApi";
import {
  Alert,
  Badge,
  Card,
  Empty,
  Field,
  money,
  useAction,
  useLoad,
} from "../../components/ui";

const blank = { title: "", description: "", department: "", estimatedCost: "" };

export default function MyRequests() {
  const { data, error, reload } = useLoad(procurementApi.mine);
  const [f, setF] = useState(blank);
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    const r = await act.run(
      async () => {
        await procurementApi.create({ ...f, estimatedCost: Number(f.estimatedCost) });
        return true;
      },
      "Draft saved."
    );
    if (r) {
      setF(blank);
      reload();
    }
  };

  return (
    <div className="page school-feature">
      <h2>My purchase requests</h2>
      <Card title="New request">
        <form onSubmit={create}>
          <div className="row">
            <Field label="What do you need?">
              <input required value={f.title} onChange={set("title")} />
            </Field>
            <Field label="Department">
              <input required value={f.department} onChange={set("department")} />
            </Field>
            <Field label="Estimated cost (KES)">
              <input
                required
                type="number"
                min="1"
                value={f.estimatedCost}
                onChange={set("estimatedCost")}
              />
            </Field>
          </div>
          <Field label="Details">
            <textarea rows={3} value={f.description} onChange={set("description")} />
          </Field>
          <Alert>{act.error}</Alert>
          <Alert kind="ok">{act.ok}</Alert>
          <button disabled={act.busy}>Save draft</button>
        </form>
      </Card>

      <Alert>{error}</Alert>
      {data?.length === 0 && <Empty>You have not raised any requests.</Empty>}
      {data?.map((r) => (
        <Card key={r.id} title={r.title} actions={<Badge value={r.status} />}>
          <p>{r.department} · estimate {money(r.estimatedCost)}</p>
          {r.status === "DRAFT" && (
            <button
              disabled={act.busy}
              onClick={() =>
                act.run(async () => {
                  await procurementApi.submit(r.id);
                  await reload();
                })
              }
            >
              Submit for review
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}
