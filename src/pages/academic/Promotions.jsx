import { useState } from "react";
import { academicApi, promotionApi as api } from "../../api/schoolApi";
import {
  Alert,
  Badge,
  Card,
  Empty,
  Field,
  useAction,
  useLoad,
} from "../../components/ui";

const STATUSES = ["", "ELIGIBLE", "UNDER_REVIEW", "BLOCKED", "APPROVED", "APPLIED"];

function Row({ p, onChanged }) {
  const [outcome, setOutcome] = useState(p.outcome || "PROMOTE");
  const [remarks, setRemarks] = useState("");
  const act = useAction();
  const decidable = p.status !== "BLOCKED" && p.status !== "APPLIED";
  return (
    <tr>
      <td>{p.studentId}</td>
      <td>{p.className}</td>
      <td>{p.finalAverage == null ? "—" : `${p.finalAverage.toFixed(1)}%`}</td>
      <td><Badge value={p.status} /> {p.outcome && <Badge value={p.outcome} />}</td>
      <td className="muted">{p.notes}{p.remarks ? ` · ${p.remarks}` : ""}</td>
      <td>
        {decidable && (
          <>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option>PROMOTE</option>
              <option>REPEAT</option>
              <option>GRADUATE</option>
            </select>{" "}
            <input
              placeholder="Remark"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={{ width: 130 }}
            />{" "}
            <button
              disabled={act.busy}
              onClick={() =>
                act.run(async () => {
                  await api.decide(p.id, { outcome, remarks });
                  await onChanged();
                })
              }
            >
              Decide
            </button>
            <Alert>{act.error}</Alert>
          </>
        )}
      </td>
    </tr>
  );
}

export default function Promotions() {
  const years = useLoad(academicApi.years);
  const [yearId, setYearId] = useState("");
  const [toYearId, setToYearId] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const act = useAction();

  const summary = useLoad(
    () => (yearId ? api.summary(yearId) : Promise.resolve(null)),
    [yearId]
  );
  const list = useLoad(
    () => (yearId ? api.list(yearId, status) : Promise.resolve([])),
    [yearId, status]
  );
  const classes = useLoad(
    () => (yearId ? academicApi.classrooms(yearId) : Promise.resolve([])),
    [yearId]
  );

  const refresh = async () => {
    await Promise.all([summary.reload(), list.reload()]);
  };

  return (
    <div className="page school-feature">
      <h2>Year-end promotion</h2>
      <Card title="1 · Choose the year and evaluate">
        <div className="row">
          <Field label="Year being closed">
            <select
              value={yearId}
              onChange={(e) => {
                setYearId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Select…</option>
              {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>
          <button
            disabled={!yearId || act.busy}
            onClick={() =>
              act.run(async () => {
                await api.evaluate(yearId);
                await refresh();
              }, "Evaluation finished")
            }
          >
            Run evaluation
          </button>
        </div>
        <p className="muted">
          All terms of the year must be closed. Re-running never overwrites a decision you already
          approved.
        </p>
        <Alert>{act.error || years.error}</Alert>
        <Alert kind="ok">{act.ok}</Alert>
        {summary.data && (
          <div className="row">
            {Object.entries(summary.data).map(([k, v]) => (
              <span key={k}><Badge value={k} /> {v}</span>
            ))}
          </div>
        )}
      </Card>

      {yearId && (
        <Card title="2 · Review and approve">
          <div className="row">
            <Field label="Filter">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s || "All"}</option>)}
              </select>
            </Field>
          </div>
          <Alert>{list.error || classes.error}</Alert>
          <p className="muted">Approve everyone who met the policy in a class at once:</p>
          <div className="row">
            {classes.data?.map((c) => (
              <button
                key={c.id}
                className="secondary"
                disabled={act.busy}
                onClick={() =>
                  act.run(
                    async () => {
                      const r = await api.approveEligible(yearId, c.id);
                      await refresh();
                      return r;
                    },
                    `Approved eligible students in ${c.name}`
                  )
                }
              >
                Approve eligible · {c.name}
              </button>
            ))}
          </div>
          {list.data?.length === 0 && <Empty>No promotion records. Run the evaluation first.</Empty>}
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Average</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>{list.data?.map((p) => <Row key={p.id} p={p} onChanged={refresh} />)}</tbody>
          </table>
        </Card>
      )}

      {yearId && (
        <Card title="3 · Apply to the new year">
          <div className="row">
            <Field label="Promote into">
              <select value={toYearId} onChange={(e) => setToYearId(e.target.value)}>
                <option value="">Select…</option>
                {years.data
                  ?.filter((y) => String(y.id) !== String(yearId))
                  .map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </Field>
            <button
              disabled={!toYearId || act.busy}
              onClick={async () => {
                const r = await act.run(() => api.apply(yearId, toYearId));
                if (r) {
                  setResult(r);
                  await refresh();
                }
              }}
            >
              Apply approved decisions
            </button>
          </div>
          <p className="muted">
            The target year needs a class for every grade the students move into.
          </p>
          {result && (
            <>
              <Alert kind="ok">{result.applied} student(s) moved.</Alert>
              {result.failures?.map((f) => <Alert key={f}>{f}</Alert>)}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
