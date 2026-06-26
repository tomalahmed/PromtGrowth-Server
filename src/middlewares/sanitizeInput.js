/**
 * Express 5-compatible NoSQL injection sanitizer.
 * express-mongo-sanitize mutates req.query (read-only in Express 5).
 */
function sanitizeValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  const sanitized = {};

  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      continue;
    }
    sanitized[key] = sanitizeValue(nested);
  }

  return sanitized;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }

  return next();
}

module.exports = sanitizeInput;
