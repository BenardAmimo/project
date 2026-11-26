import { http } from "./http";

const d = (p) => p.then((r) => r.data);

export const supplierApi = {
  register: (body) => d(http.post("/api/public/suppliers/register", body)),
  me: () => d(http.get("/api/supplier/me")),
  opportunities: () => d(http.get("/api/supplier/opportunities")),
  submitBid: (requestId, body) =>
    d(http.post(`/api/supplier/opportunities/${requestId}/bids`, body)),
  myBids: () => d(http.get("/api/supplier/bids")),
  withdraw: (bidId) => d(http.post(`/api/supplier/bids/${bidId}/withdraw`)),
  myOrders: () => d(http.get("/api/supplier/orders")),
  invoice: (orderId, body) =>
    d(http.post(`/api/supplier/orders/${orderId}/invoice`, body)),
};

export const procurementApi = {
  suppliers: (status) =>
    d(http.get("/api/procurement/suppliers", { params: status ? { status } : {} })),
  supplierAction: (id, action, notes) =>
    d(http.post(`/api/procurement/suppliers/${id}/${action}`, { notes })),

  create: (body) => d(http.post("/api/procurement/requests", body)),
  mine: () => d(http.get("/api/procurement/requests/mine")),
  submit: (id) => d(http.post(`/api/procurement/requests/${id}/submit`)),
  requests: (status) =>
    d(http.get("/api/procurement/requests", { params: status ? { status } : {} })),
  review: (id, body) => d(http.post(`/api/procurement/requests/${id}/review`, body)),
  open: (id, body) => d(http.post(`/api/procurement/requests/${id}/open`, body)),
  closeBidding: (id) => d(http.post(`/api/procurement/requests/${id}/close-bidding`)),
  issuePo: (id) => d(http.post(`/api/procurement/requests/${id}/purchase-order`)),

  bids: (id) => d(http.get(`/api/procurement/requests/${id}/bids`)),
  evaluate: (bidId, body) =>
    d(http.post(`/api/procurement/bids/${bidId}/evaluation`, body)),
  completeEvaluation: (id) =>
    d(http.post(`/api/procurement/requests/${id}/complete-evaluation`)),
  ranking: (id) => d(http.get(`/api/procurement/requests/${id}/ranking`)),
  award: (id, body) => d(http.post(`/api/procurement/requests/${id}/award`, body)),

  orders: (status) =>
    d(http.get("/api/procurement/orders", { params: { status } })),
  delivery: (id, notes) =>
    d(http.post(`/api/procurement/orders/${id}/delivery`, { notes })),
  pay: (id, reference) =>
    d(http.post(`/api/procurement/orders/${id}/payment`, { reference })),
};

export const academicApi = {
  years: () => d(http.get("/api/academic/years")),
  createYear: (body) => d(http.post("/api/academic/years", body)),
  activateYear: (id, body) => d(http.post(`/api/academic/years/${id}/activate`, body || {})),
closeYear: (id, body) => d(http.post(`/api/academic/years/${id}/close`, body || {})),

  terms: (yearId) => d(http.get(`/api/academic/years/${yearId}/terms`)),
  addTerm: (yearId, body) =>
    d(http.post(`/api/academic/years/${yearId}/terms`, body)),
  advanceTerm: (id, body) => d(http.post(`/api/academic/terms/${id}/advance`, body || {})),

  gradeLevels: () => d(http.get("/api/academic/grade-levels")),
  createGradeLevel: (body) => d(http.post("/api/academic/grade-levels", body)),
  classrooms: (yearId) =>
    d(http.get("/api/academic/classrooms", { params: { yearId } })),
  createClassroom: (body) => d(http.post("/api/academic/classrooms", body)),
  enroll: (body) => d(http.post("/api/academic/enrollments", body)),
  backfill: () => d(http.post("/api/academic/enrollments/backfill")),
  savePolicy: (body) => d(http.put("/api/academic/promotion-policy", body)),
};

export const promotionApi = {
  evaluate: (yearId) => d(http.post(`/api/promotions/years/${yearId}/evaluate`)),
  summary: (yearId) => d(http.get(`/api/promotions/years/${yearId}/summary`)),
  list: (yearId, status) =>
    d(http.get(`/api/promotions/years/${yearId}`, { params: status ? { status } : {} })),
  decide: (id, body) => d(http.post(`/api/promotions/${id}/decision`, body)),
  approveEligible: (yearId, classId) =>
    d(http.post(`/api/promotions/years/${yearId}/classes/${classId}/approve-eligible`)),
  apply: (fromYearId, toYearId) =>
    d(http.post(`/api/promotions/years/${fromYearId}/apply`, null, { params: { toYearId } })),
};
