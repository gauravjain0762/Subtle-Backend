const PromoCode = require("../models/PromoCode");
const Order = require("../models/Order");

const validatePromoCode = async (code, workspaceCode, userId = null) => {
  if (!code) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), active: true });

  if (!promo) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { valid: false, error: "Promo code has expired" };
  }

  if (promo.workspaceCodes.length > 0) {
    const normalizedWorkspace = (workspaceCode || "").trim().toUpperCase();
    if (!promo.workspaceCodes.includes(normalizedWorkspace)) {
      return { valid: false, error: "Invalid or expired promo code" };
    }
  }

  // Check one-time use
  if (promo.oneTimeUse && userId) {
    if (promo.usedBy.includes(userId)) {
      return { valid: false, error: "You have already used this promo code" };
    }
  }

  // Check max uses limit
  if (promo.maxUses && promo.usageCount >= promo.maxUses) {
    return { valid: false, error: "Promo code usage limit reached" };
  }

  // Check first-time user only
  if (promo.firstTimeUserOnly && userId) {
    const userOrders = await Order.countDocuments({ user: userId });
    if (userOrders > 0) {
      return { valid: false, error: "This promo code is for first-time users only" };
    }
  }

  return {
    valid: true,
    code: promo.code,
    discount: { type: promo.type, value: promo.value, label: promo.label, description: promo.description },
  };
};

module.exports = validatePromoCode;
