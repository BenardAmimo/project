import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../api/http";

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const run = async (fn, okMessage) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const result = await fn();
      if (okMessage) setOk(okMessage);
      return result;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, ok, run };
}

export const Alert = ({ kind = "error", children }) =>
  children ? <div className={`alert ${kind}`}>{children}</div> : null;

export const Badge = ({ value }) =>
  value ? (
    <span className={`badge ${String(value).toLowerCase()}`}>
      {String(value).replaceAll("_", " ")}
    </span>
  ) : null;

export const Card = ({ title, actions, children }) => (
  <section className="card">
    {(title || actions) && (
      <header>
        <h3>{title}</h3>
        <div>{actions}</div>
      </header>
    )}
    {children}
  </section>
);

export const Field = ({ label, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);

export const money = (n) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(Number(n ?? 0));
export const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
export const Empty = ({ children = "Nothing here yet." }) => <p className="muted">{children}</p>;
