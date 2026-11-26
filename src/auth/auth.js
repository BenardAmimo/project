// Reads the role from the same "user" object your App.jsx saves at login.
// "Super Admin" -> SUPER_ADMIN, "Department Head" -> DEPARTMENT_HEAD, "ROLE_ADMIN" -> ADMIN
const toEnum = (r) =>
  String(typeof r === "object" && r ? r.name || r.role || "" : r || "")
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, "")
    .replace(/\s+/g, "_");

export const getRoles = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem("user") || "null");
    return [user?.role, user?.roles, user?.roleName]
      .flatMap((r) => (Array.isArray(r) ? r : [r]))
      .filter(Boolean)
      .map(toEnum);
  } catch {
    return [];
  }
};

export const hasAnyRole = (...wanted) => getRoles().some((r) => wanted.includes(r));