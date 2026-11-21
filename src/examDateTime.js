export const localDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const localTimeString = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const isFutureDateTime = (date, time, now = new Date()) => {
  if (!date || !time) return false;
  const scheduled = new Date(`${date}T${time}:00`);
  return !Number.isNaN(scheduled.getTime()) && scheduled > now;
};
