const ALLOWED_POSTCODE_PREFIXES = ["E1", "E14", "EC", "SE1", "SW1", "WC", "N1"];

const isPostcodeInDeliveryArea = (postcode) => {
  if (!postcode) return false;
  const normalized = postcode.replace(/\s+/g, "").toUpperCase();
  return ALLOWED_POSTCODE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

module.exports = { isPostcodeInDeliveryArea };
