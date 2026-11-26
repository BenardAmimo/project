import axios from "axios";

// Same backend your existing ./api uses (your Network tab shows localhost:8084).
// Port 3000 suggests Create React App, which has no import.meta.env, so no env variable is used here.
export const http = axios.create({ baseURL: "http://localhost:8084" });

http.interceptors.request.use((cfg) => {
  const token = sessionStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const errorMessage = (e) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || "Something went wrong";
