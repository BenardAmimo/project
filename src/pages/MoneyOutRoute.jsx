import { useEffect, useState } from "react";
import { currentUser } from "../api";
import MoneyOutPage from "./MoneyOutPage";

const roleValues = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(roleValues);
  if (!value || typeof value !== "object") return [];
  return roleValues(value.authority ?? value.name ?? value.role);
};

const userFromResponse = (response) => {
  const body = response?.data ?? response;
  return (
    body?.user ??
    body?.profile ??
    body?.data?.user ??
    body?.data?.profile ??
    body?.data ??
    body
  );
};

const rolesFromResponse = (response) => {
  const user = userFromResponse(response);
  return [...new Set([
    ...roleValues(user?.role),
    ...roleValues(user?.roles),
    ...roleValues(user?.authorities),
    ...roleValues(user?.authority),
  ])];
};

const normalizeRole = (role) => {
  const normalized = String(role).trim().replace(/^ROLE_/i, "").replace(/[\s-]+/g, "_").toUpperCase();
  if (normalized === "SUPERADMIN") return "SUPER_ADMIN";
  if (normalized === "SUPPORT_STAFF") return "STAFF";
  return normalized;
};

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "BURSAR", "TEACHER", "STAFF", "PARENT"]);

export default function MoneyOutRoute() {
  const [roles, setRoles] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    currentUser()
      .then((response) => {
        const fetchedUser = userFromResponse(response);
        const fetchedRoles = rolesFromResponse(response);
        if (fetchedRoles.length === 0) {
          throw new Error("The /me response did not include the signed-in user's role.");
        }
        if (active) {
          setRoles(fetchedRoles);
          setUser(fetchedUser);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError?.response?.data?.message || requestError?.message || "Unable to load your role.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p role="status">Loading money pages…</p>;
  if (error) return <div role="alert">{error}</div>;
  if (!roles.some((role) => ALLOWED_ROLES.has(normalizeRole(role)))) {
    return <div role="alert">You do not have access to money pages.</div>;
  }

  return <MoneyOutPage roles={roles} user={user} />;
}
