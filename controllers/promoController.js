const PromoCode = require("../models/PromoCode");
const catchAsync = require("../utils/catchAsync");
const validatePromoCode = require("../utils/validatePromoCode");

exports.validatePromo = catchAsync(async (req, res) => {
  const { code, workspaceCode } = req.body || {};
  const userId = req.user?._id;

  const result = await validatePromoCode(code, workspaceCode, userId);

  res.status(200).json(result);
});

// Mark promo as used (called after successful order/payment)
exports.markPromoAsUsed = catchAsync(async (req, res) => {
  const { code } = req.body || {};
  const userId = req.user._id;

  if (!code) {
    return res.status(400).json({ success: false, error: "Code is required" });
  }

  const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() });

  if (!promo) {
    return res.status(404).json({ success: false, error: "Promo code not found" });
  }

  // Add user to usedBy if not already there (one-time use)
  if (promo.oneTimeUse && !promo.usedBy.includes(userId)) {
    promo.usedBy.push(userId);
  }

  // Increment usage count
  promo.usageCount = (promo.usageCount || 0) + 1;

  await promo.save();

  console.log(`✅ Promo marked as used: ${code} by user ${userId}`);

  res.status(200).json({
    success: true,
    message: "Promo code marked as used",
  });
});

exports.listActivePromoCodes = catchAsync(async (req, res) => {
  const { workspaceCode } = req.query;

  const promos = await PromoCode.find({
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gte: new Date() } }],
  }).sort({ createdAt: -1 });

  const normalizedWorkspace = workspaceCode ? workspaceCode.trim().toUpperCase() : null;

  const visible = promos.filter((p) => {
    if (p.workspaceCodes.length === 0) return true;
    return normalizedWorkspace && p.workspaceCodes.includes(normalizedWorkspace);
  });

  res.status(200).json({
    success: true,
    promoCodes: visible.map((p) => ({
      code: p.code,
      type: p.type,
      value: p.value,
      label: p.label,
      description: p.description,
      expiresAt: p.expiresAt,
    })),
  });
});
