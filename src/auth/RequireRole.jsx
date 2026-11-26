import { Navigate } from "react-router-dom";
import { hasAnyRole } from "./auth";

export default function RequireRole({ roles = [], children }) {
  if (!sessionStorage.getItem("token")) return <Navigate to="/login" replace />;
  if (!hasAnyRole(...roles)) {
    return <p className="alert error">You do not have access to this page.</p>;
  }
  return children;
}
