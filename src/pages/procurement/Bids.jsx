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
} from "../../components/ui";

function ScoreForm({ bid, onDone }) {
  const [f, setF] = useState({ score: "", comments: "", recommended: false });
  const act = useAction();
  const set = (k) => (e) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <div className="row">
      <Field label="Score (0-100)">
        <input type="number" min="0" max="100" value={f.score} onChange={set("score")} />
      </Field>
      <Field label="Comments">
        <input value={f.comments} onChange={set("comments")} />
      </Field>
      <label>
        <input type="checkbox" checked={f.recommended} onChange={set("recommended")} />
        Recommend
      </label>
      <button
        disabled={act.busy || f.score === ""}
        onClick={() =>
          act.run(async () => {
            await api.evaluate(bid.id, {
              score: Number(f.score),
              comments: f.comments,
              recommended: f.recommended,
            });
            onDone();
          }, "Score saved")
        }
      >
        Save score
      </button>
      <Alert>{act.error}</Alert>
      <Alert kind="ok">{act.ok}</Alert>
    </div>
  );
}

function Evaluate({ request, onChanged }) {
  const { data, error, reload } = useLoad(() => api.bids(request.id), [request.id]);
  const act = useAction();
  return (
    <Card title={request.title} actions={<Badge value={request.status} />}>
      <Alert>{error || act.error}</Alert>
      {data?.length === 0 && <Empty>No bids were submitted.</Empty>}
      {data?.map((b) => (
        <div key={b.id} className="card">
          <b>{b.supplierName}</b> — {money(b.amount)} · {b.deliveryDays ?? "?"} days
          {b.notes && <p className="muted">{b.notes}</p>}
          <ScoreForm bid={b} onDone={reload} />
        </div>
      ))}
      <button
        disabled={act.busy}
        onClick={() =>
          act.run(async () => {
            await api.completeEvaluation(request.id);
            await onChanged();
          })
        }
      >
        Complete evaluation and send to approver
      </button>
    </Card>
  );
}

function Award({ request, onChanged }) {
  const { data, error } = useLoad(() => api.ranking(request.id), [request.id]);
  const [why, setWhy] = useState("");
  const act = useAction();
  return (
    <Card title={request.title} actions={<Badge value={request.status} />}>
      <Alert>{error || act.error}</Alert>
      <Field label="Justification (required if you do not pick the top-ranked bid)">
        <input value={why} onChange={(e) => setWhy(e.target.value)} />
      </Field>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Supplier</th>
            <th>Amount</th>
            <th>Avg score</th>
            <th>Evaluators</th>
            <th>Recommended</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((row, i) => (
            <tr key={row.bid.id}>
              <td>{i + 1}</td>
              <td>{row.bid.supplierName}</td>
              <td>{money(row.bid.amount)}</td>
              <td>{row.averageScore.toFixed(1)}</td>
              <td>{row.evaluatorCount}</td>
              <td>{row.recommendations}</td>
              <td>
                <button
                  disabled={act.busy}
                  onClick={() =>
                    act.run(async () => {
                      await api.award(request.id, {
                        bidId: row.bid.id,
                        justification: why,
                      });
                      await onChanged();
                    })
                  }
                >
                  Award
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** mode="evaluate" for the committee, mode="award" for the approver. */
export default function Bids({ mode }) {
  const status = mode === "award" ? "EVALUATED" : "BIDDING_CLOSED";
  const { data, error, reload } = useLoad(() => api.requests(status), [status]);
  return (
    <div className="page school-feature">
      <h2>{mode === "award" ? "Award tenders" : "Bid evaluation"}</h2>
      <Alert>{error}</Alert>
      {data?.length === 0 && <Empty>Nothing waiting for you.</Empty>}
      {data?.map((r) =>
        mode === "award" ? (
          <Award key={r.id} request={r} onChanged={reload} />
        ) : (
          <Evaluate key={r.id} request={r} onChanged={reload} />
        )
      )}
    </div>
  );
}
