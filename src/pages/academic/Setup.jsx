import { useState } from "react";
import { academicApi as api } from "../../api/schoolApi";
import {
  Alert,
  Badge,
  Card,
  Empty,
  Field,
  useAction,
  useLoad,
} from "../../components/ui";

function Years({ yearId, setYearId }) {
  const { data, error, reload } = useLoad(api.years);
  const [f, setF] = useState({ name: "", startDate: "", endDate: "" });
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Try normally; if the server says an override is possible, ask for a reason and retry.
  const withOverride = (fn) =>
    act.run(async () => {
      try {
        await fn({});
      } catch (e) {
        const msg = errorMessage(e);
        if (!msg.includes("override")) throw e;
        const reason = window.prompt(`${msg}\n\nEnter a reason to override:`);
        if (!reason) return;
        await fn({ override: true, reason });
      }
      await reload();
    });

  return (
    <Card title="Academic years">
      <Alert>{error || act.error}</Alert>
      <div className="row">
        <Field label="Name (e.g. 2027)"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Starts"><input type="date" value={f.startDate} onChange={set("startDate")} /></Field>
        <Field label="Ends"><input type="date" value={f.endDate} onChange={set("endDate")} /></Field>
        <button disabled={act.busy || !f.name || !f.startDate || !f.endDate}
          onClick={() => act.run(async () => { await api.createYear(f); setF({ name: "", startDate: "", endDate: "" }); await reload(); })}>
          Create year
        </button>
      </div>
      {data?.length === 0 && <Empty>No academic years yet.</Empty>}
      <table>
        <tbody>
          {data?.map((y) => (
            <tr key={y.id}>
              <td><input type="radio" checked={yearId === y.id} onChange={() => setYearId(y.id)} /></td>
              <td>{y.name}</td><td>{y.startDate} → {y.endDate}</td>
              <td><Badge value={y.status} /></td>
              <td>
                {y.status === "PLANNED" && (
                  <>
                    <span className="muted">Starts by itself on {y.startDate}. </span>
                    <button className="secondary" disabled={act.busy}
                      onClick={() => withOverride((b) => api.activateYear(y.id, b))}>Activate now</button>
                  </>
                )}
                {y.status === "ACTIVE" && (
                  <button className="danger" disabled={act.busy}
                    onClick={() => withOverride((b) => api.closeYear(y.id, b))}>Close year</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Select a year (radio) to manage its terms and classes below.</p>
    </Card>
  );
}

function Terms({ yearId }) {
  const { data, error, reload } = useLoad(() => (yearId ? api.terms(yearId) : Promise.resolve([])), [yearId]);
  const [f, setF] = useState({ name: "", startDate: "", endDate: "" });
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!yearId) return null;

  const nextNo = (data?.length ? Math.max(...data.map((t) => t.termNumber)) : 0) + 1;

  const move = (t, override) => {
    let body = {};
    if (override) {
      const reason = window.prompt(
        `Moving "${t.name}" to ${t.next} before its conditions are met:\n- ${t.warnings.join("\n- ")}\n\nEnter a reason:`
      );
      if (!reason) return;
      body = { override: true, reason };
    }
    return act.run(async () => { await api.advanceTerm(t.id, body); await reload(); });
  };

  return (
    <Card title="Terms">
      <Alert>{error || act.error}</Alert>
      <div className="row">
        <Field label="No."><input value={nextNo} readOnly style={{ width: 70 }} /></Field>
        <Field label="Name"><input value={f.name} onChange={set("name")} placeholder={`Term ${nextNo}`} /></Field>
        <Field label="Starts"><input type="date" value={f.startDate} onChange={set("startDate")} /></Field>
        <Field label="Ends"><input type="date" value={f.endDate} onChange={set("endDate")} /></Field>
        <button disabled={act.busy || !f.name || !f.startDate || !f.endDate}
          onClick={() => act.run(async () => {
            await api.addTerm(yearId, f);
            setF({ name: "", startDate: "", endDate: "" });
            await reload();
          })}>
          Add term
        </button>
      </div>
      <table>
        <tbody>
          {data?.map((t) => (
            <tr key={t.id}>
              <td>{t.termNumber}</td>
              <td>{t.name}</td>
              <td>{t.startDate} → {t.endDate}</td>
              <td><Badge value={t.status} /></td>
              <td>
                {t.next && (t.ready ? (
                  <button disabled={act.busy} onClick={() => move(t, false)}>Move to {t.next}</button>
                ) : t.blockers.length > 0 ? (
                  <span className="muted">Not yet: {t.blockers.join("; ")}</span>
                ) : (
                  <>
                    <span className="muted">{t.warnings.join("; ")}{t.automatic ? " · moves automatically" : ""} </span>
                    <button className="secondary" disabled={act.busy} onClick={() => move(t, true)}>Override…</button>
                  </>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Grades() {
  const { data, error, reload } = useLoad(api.gradeLevels);
  const [f, setF] = useState({ name: "", orderIndex: "", nextGradeLevelId: "" });
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Grade levels">
      <Alert>{error || act.error}</Alert>
      <div className="row">
        <Field label="Name (e.g. Grade 6)">
          <input value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Order">
          <input
            type="number"
            value={f.orderIndex}
            onChange={set("orderIndex")}
            style={{ width: 80 }}
          />
        </Field>
        <Field label="Next grade (blank = final grade)">
          <select value={f.nextGradeLevelId} onChange={set("nextGradeLevelId")}>
            <option value="">— none (final) —</option>
            {data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <button
          disabled={act.busy || !f.name}
          onClick={() =>
            act.run(async () => {
              await api.createGradeLevel({
                name: f.name,
                orderIndex: Number(f.orderIndex || 0),
                nextGradeLevelId: f.nextGradeLevelId ? Number(f.nextGradeLevelId) : null,
              });
              setF({ name: "", orderIndex: "", nextGradeLevelId: "" });
              await reload();
            })
          }
        >
          Add grade
        </button>
      </div>
      <p className="muted">
        Create the highest grade first, then point each lower grade at the one above it.
      </p>
      <table>
        <tbody>
          {data?.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td>{g.finalGrade ? "Final grade" : `→ ${g.nextGrade}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Classes({ yearId }) {
  const grades = useLoad(api.gradeLevels);
  const { data, error, reload } = useLoad(
    () => (yearId ? api.classrooms(yearId) : Promise.resolve([])),
    [yearId]
  );
  const [f, setF] = useState({ stream: "", gradeLevelId: "" });
  const [enr, setEnr] = useState({ studentId: "", classRoomId: "" });
  const act = useAction();
  const enrol = useAction();
  if (!yearId) return null;
  return (
    <Card title="Classes and enrolment">
      <Alert>{error || act.error}</Alert>
      <div className="row">
        <Field label="Grade">
          <select
            value={f.gradeLevelId}
            onChange={(e) => setF({ ...f, gradeLevelId: e.target.value })}
          >
            <option value="">Select…</option>
            {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Stream (e.g. East)">
          <input
            value={f.stream}
            onChange={(e) => setF({ ...f, stream: e.target.value })}
          />
        </Field>
        <button
          disabled={act.busy || !f.gradeLevelId || !f.stream}
          onClick={() =>
            act.run(async () => {
              await api.createClassroom({
                stream: f.stream,
                academicYearId: yearId,
                gradeLevelId: Number(f.gradeLevelId),
              });
              setF({ ...f, stream: "" });
              await reload();
            })
          }
        >
          Create class
        </button>
      </div>
      {data?.length === 0 && <Empty>No classes in this year yet.</Empty>}
      <ul>
        {data?.map((c) => (
          <li key={c.id}>{c.name} <span className="muted">({c.grade})</span></li>
        ))}
      </ul>

      <h4>Enrol a student</h4>
      <div className="row">
        <Field label="Student ID">
          <input
            type="number"
            value={enr.studentId}
            onChange={(e) => setEnr({ ...enr, studentId: e.target.value })}
          />
        </Field>
        <Field label="Class">
          <select
            value={enr.classRoomId}
            onChange={(e) => setEnr({ ...enr, classRoomId: e.target.value })}
          >
            <option value="">Select…</option>
            {data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <button
          disabled={enrol.busy || !enr.studentId || !enr.classRoomId}
          onClick={() =>
            enrol.run(
              () =>
                api.enroll({
                  studentId: Number(enr.studentId),
                  classRoomId: Number(enr.classRoomId),
                }),
              "Student enrolled"
            )
          }
        >
          Enrol
        </button>
      </div>
      <Alert>{enrol.error}</Alert>
      <Alert kind="ok">{enrol.ok}</Alert>
    </Card>
  );
}

function Policy() {
  const grades = useLoad(api.gradeLevels);
  const [f, setF] = useState({
    gradeLevelId: "",
    minimumAverage: "50",
    subjects: "",
    requireAllResults: true,
  });
  const act = useAction();
  const save = () => {
    const subjectMinimums = {};
    f.subjects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [name, value] = pair.split(":").map((x) => x.trim());
        if (name && value) subjectMinimums[name] = Number(value);
      });
    return act.run(
      () =>
        api.savePolicy({
          gradeLevelId: f.gradeLevelId ? Number(f.gradeLevelId) : null,
          minimumAverage: f.minimumAverage === "" ? null : Number(f.minimumAverage),
          subjectMinimums,
          requireAllResults: f.requireAllResults,
        }),
      "Policy saved"
    );
  };
  return (
    <Card title="Promotion policy">
      <div className="row">
        <Field label="Applies to">
          <select
            value={f.gradeLevelId}
            onChange={(e) => setF({ ...f, gradeLevelId: e.target.value })}
          >
            <option value="">Default for all grades</option>
            {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Minimum average %">
          <input
            type="number"
            value={f.minimumAverage}
            onChange={(e) => setF({ ...f, minimumAverage: e.target.value })}
          />
        </Field>
        <Field label="Subject minimums (Maths:40, English:40)">
          <input value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={f.requireAllResults}
            onChange={(e) => setF({ ...f, requireAllResults: e.target.checked })}
          />
          All results required
        </label>
        <button disabled={act.busy} onClick={save}>Save policy</button>
      </div>
      <Alert>{act.error}</Alert>
      <Alert kind="ok">{act.ok}</Alert>
    </Card>
  );
}

export default function AcademicSetup() {
  const [yearId, setYearId] = useState(null);
  return (
    <div className="page school-feature">
      <h2>Academic setup</h2>
      <Years yearId={yearId} setYearId={setYearId} />
      <Terms yearId={yearId} />
      <Grades />
      <Classes yearId={yearId} />
      <Policy />
    </div>
  );
}
