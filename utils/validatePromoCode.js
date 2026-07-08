const PromoCode = require("../models/PromoCode");

const validatePromoCode = async (code, workspaceCode) => {
  if (!code) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), active: true });

  if (!promo) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  if (promo.workspaceCodes.length > 0) {
    const normalizedWorkspace = (workspaceCode || "").trim().toUpperCase();
    if (!promo.workspaceCodes.includes(normalizedWorkspace)) {
      return { valid: false, error: "Invalid or expired promo code" };
    }
  }

  return {
    valid: true,
    code: promo.code,
    discount: { type: promo.type, value: promo.value, label: promo.label },
  };
};

module.exports = validatePromoCode;
