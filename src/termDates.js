export const termDateRange = (term) => ({
  startDate: typeof term?.startDate === 'string' ? term.startDate.slice(0, 10) : '',
  endDate: typeof term?.endDate === 'string' ? term.endDate.slice(0, 10) : '',
});

export const isDateWithinTerm = (date, term) => {
  const { startDate, endDate } = termDateRange(term);
  return Boolean(date && startDate && endDate && startDate <= endDate && date >= startDate && date <= endDate);
};

export const isDateWithinAnyTerm = (date, terms) =>
  terms.some((term) => isDateWithinTerm(date, term));
