const MAX_PAGE_LIMIT = 100;

function clampPage(page) {
  return Math.max(parseInt(page, 10) || 1, 1);
}

function clampLimit(limit, max = MAX_PAGE_LIMIT) {
  const parsed = parseInt(limit, 10) || 10;
  return Math.min(Math.max(parsed, 1), max);
}

module.exports = {
  MAX_PAGE_LIMIT,
  clampPage,
  clampLimit,
};
