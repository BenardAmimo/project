import { useState } from "react";
import { moneyApi } from "../moneyApi";
import StaffSelect from "./StaffSelect";
import { Card, Table, Pill, Err, Field, inputStyle, btn, useLoad, useAct } from "./ui";

const EMPTY = { payeeType: "STAFF", payeeRef: "", displayName: "", channel: "MPESA_B2C", phone: "", businessNumber: "", accountReference: "", bankName: "", bankAccountNumber: "", bankAccountName: "" };

const normalizeIdentifier = (value) => String(value ?? "").trim().toLowerCase();

const isOwnStaffPayee = (payee, currentUser) => {
  if (String(payee.payeeType ?? "").toUpperCase() !== "STAFF") return false;
  const identifiers = [currentUser?.username, currentUser?.userName, currentUser?.email]
    .map(normalizeIdentifier)
    .filter(Boolean);
  return identifiers.includes(normalizeIdentifier(payee.payeeRef));
};

/** Payment details require independent verification; Super Admins can verify others' details after saving. */
export default function PayeesPage({ isSuperAdmin = false, currentUser = null }) {
  const { data, error, reload } = useLoad(() => moneyApi.payees());
  const { act, error: aerr, busy } = useAct(reload);
  const [f, setF] = useState(EMPTY);
  const [editingPayee, setEditingPayee] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const editPayee = (payee) => {
    setEditingPayee(payee);
    setF({
      ...EMPTY,
      payeeType: payee.payeeType,
      payeeRef: payee.payeeRef,
      displayName: payee.displayName || "",
      channel: payee.channel,
      phone: payee.phone || "",
      businessNumber: payee.businessNumber || "",
      accountReference: payee.accountReference || "",
      bankName: payee.bankName || "",
      bankAccountNumber: payee.bankAccountNumber || "",
      bankAccountName: payee.bankAccountName || "",
    });
  };

  const clearForm = () => {
    setF(EMPTY);
    setEditingPayee(null);
  };

  const saveAndVerifyForAnotherPerson = async () => {
    if (f.payeeType === "STAFF" && isOwnStaffPayee({ payeeType: f.payeeType, payeeRef: f.payeeRef }, currentUser)) {
      throw new Error("You cannot verify your own payment details.");
    }

    const saved = await moneyApi.savePayee(f);
    const savedPayee = saved?.payee ?? saved?.data?.payee ?? saved?.data ?? saved;
    let payeeId = savedPayee?.id;

    if (!payeeId) {
      const payees = await moneyApi.payees();
      const target = payees.find((payee) =>
        String(payee.payeeType ?? "").toUpperCase() === f.payeeType &&
        normalizeIdentifier(payee.payeeRef) === normalizeIdentifier(f.payeeRef) &&
        !payee.verified
      );
      payeeId = target?.id;
    }

    await reload();
    if (!payeeId) {
      throw new Error("Payment details were saved, but the updated record could not be found to verify.");
    }

    await moneyApi.verifyPayee(payeeId);
    clearForm();
  };

  return (
    <div>
      <Err text={error || aerr} />
      <Card title={editingPayee ? `Edit payment details · ${editingPayee.displayName || editingPayee.payeeRef}` : "Add or change how someone is paid"}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {editingPayee ? (
            <Field label={f.payeeType === "STAFF" ? "Staff member" : "Supplier"}>
              <input style={inputStyle} value={editingPayee.displayName || editingPayee.payeeRef} readOnly />
            </Field>
          ) : (
            <>
              <Field label="Who"><select style={inputStyle} value={f.payeeType} onChange={set("payeeType")}><option value="STAFF">Staff member</option><option value="SUPPLIER">Supplier</option></select></Field>
              {f.payeeType === "STAFF" ? (
                <Field label="Staff member"><StaffSelect value={f.payeeRef} onChange={(m) => setF({ ...f, payeeRef: m?.username || "", displayName: m?.name || "" })} /></Field>
              ) : (<>
                <Field label="Supplier id (from the Suppliers list)"><input style={inputStyle} value={f.payeeRef} onChange={set("payeeRef")} /></Field>
                <Field label="Name to show"><input style={inputStyle} value={f.displayName} onChange={set("displayName")} /></Field>
              </>)}
            </>
          )}
          <Field label="Paid by">
            <select style={inputStyle} value={f.channel} onChange={set("channel")}>
              <option value="MPESA_B2C">M-Pesa to phone</option><option value="MPESA_PAYBILL">M-Pesa Paybill</option><option value="MPESA_TILL">M-Pesa Till</option>
              <option value="BANK">Bank transfer</option><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option>
            </select>
          </Field>
        </div>
        {f.channel === "MPESA_B2C" && <Field label="M-Pesa phone"><input style={inputStyle} placeholder="0712345678" value={f.phone} onChange={set("phone")} /></Field>}
        {f.channel === "MPESA_PAYBILL" && <div style={{ display: "flex", gap: 12 }}>
          <Field label="Paybill number"><input style={inputStyle} value={f.businessNumber} onChange={set("businessNumber")} /></Field>
          <Field label="Account number"><input style={inputStyle} value={f.accountReference} onChange={set("accountReference")} /></Field></div>}
        {f.channel === "MPESA_TILL" && <Field label="Till number"><input style={inputStyle} value={f.businessNumber} onChange={set("businessNumber")} /></Field>}
        {f.channel === "BANK" && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field label="Bank"><input style={inputStyle} value={f.bankName} onChange={set("bankName")} /></Field>
          <Field label="Account number"><input style={inputStyle} value={f.bankAccountNumber} onChange={set("bankAccountNumber")} /></Field>
          <Field label="Account name"><input style={inputStyle} value={f.bankAccountName} onChange={set("bankAccountName")} /></Field></div>}
        <button style={btn()} disabled={busy} onClick={() => act(async () => { await moneyApi.savePayee(f); clearForm(); })}>{editingPayee ? "Save changes (needs verification)" : "Save (needs verification)"}</button>
        {editingPayee && <button style={btn("ghost")} disabled={busy} onClick={clearForm}>Cancel edit</button>}
        {isSuperAdmin && (
          <button
            style={btn()}
            disabled={busy}
            onClick={() => act(saveAndVerifyForAnotherPerson)}
          >
            Save and verify
          </button>
        )}
      </Card>

      <Card title="Payment details on file">
        <Table
          head={["Type", "Reference", "Name", "How", "Details", "Verified", "Actions"]}
          rows={(data || []).map((p) => [p.payeeType, p.payeeRef, p.displayName, p.channel.replaceAll("_", " "),
            p.phone || [p.businessNumber, p.accountReference].filter(Boolean).join(" / ") || [p.bankName, p.bankAccountNumber].filter(Boolean).join(" "),
            p.verified ? <Pill s="APPROVED" /> : <Pill s="NEEDS_REVIEW" />,
            <>
              <button style={btn("ghost")} disabled={busy} onClick={() => editPayee(p)}>Edit</button>
              {!p.verified && !isOwnStaffPayee(p, currentUser) && <button style={btn()} disabled={busy} onClick={() => act(() => moneyApi.verifyPayee(p.id))}>Verify</button>}
            </>])}
        />
        <p style={{ fontSize: 12, color: "#777" }}>A staff member cannot verify their own payment details, even if someone else entered them. Super Admins can save and verify payment details for other people. Phone-call the supplier or see the cheque book / bank letter first.</p>
      </Card>
    </div>
  );
}
