const PromoCode = require("../models/PromoCode");
const catchAsync = require("../utils/catchAsync");
const validatePromoCode = require("../utils/validatePromoCode");

exports.validatePromo = catchAsync(async (req, res) => {
  const { code, workspaceCode } = req.body || {};

  const result = await validatePromoCode(code, workspaceCode);

  res.status(200).json(result);
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
      expiresAt: p.expiresAt,
    })),
  });
});
