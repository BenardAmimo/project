import { useState } from "react";
import { supplierApi } from "../../api/schoolApi";
import { Alert, Card, Field, useAction } from "../../components/ui";

const blank = {
  businessName: "",
  registrationNumber: "",
  contactEmail: "",
  phoneNumber: "",
  address: "",
  documents: "",
  username: "",
  password: "",
};

export default function SupplierRegister() {
  const [f, setF] = useState(blank);
  const [done, setDone] = useState(false);
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const { documents, ...rest } = f;
    const documentUrls = documents.split("\n").map((s) => s.trim()).filter(Boolean);
    const r = await act.run(async () => {
      await supplierApi.register({ ...rest, documentUrls });
      return true;
    });
    if (r) setDone(true);
  };

  if (done)
    return (
      <div className="page school-feature">
        <Alert kind="ok">
          Application received. The procurement office will review it, and you can use the supplier
          portal once it is approved.
        </Alert>
      </div>
    );

  return (
    <div className="page school-feature">
      <Card title="Become a supplier">
        <form onSubmit={submit}>
          <div className="row">
            <Field label="Business name">
              <input required value={f.businessName} onChange={set("businessName")} />
            </Field>
            <Field label="Registration number">
              <input required value={f.registrationNumber} onChange={set("registrationNumber")} />
            </Field>
          </div>
          <div className="row">
            <Field label="Contact email">
              <input required type="email" value={f.contactEmail} onChange={set("contactEmail")} />
            </Field>
            <Field label="Phone">
              <input value={f.phoneNumber} onChange={set("phoneNumber")} />
            </Field>
            <Field label="Address">
              <input value={f.address} onChange={set("address")} />
            </Field>
          </div>
          <Field label="Document links (one per line: certificate, tax PIN…)">
            <textarea rows={3} value={f.documents} onChange={set("documents")} />
          </Field>
          <div className="row">
            <Field label="Username">
              <input required value={f.username} onChange={set("username")} />
            </Field>
            <Field label="Password (8+ characters)">
              <input
                required
                minLength={8}
                type="password"
                value={f.password}
                onChange={set("password")}
              />
            </Field>
          </div>
          <Alert>{act.error}</Alert>
          <button disabled={act.busy}>{act.busy ? "Sending…" : "Submit application"}</button>
        </form>
      </Card>
    </div>
  );
}
