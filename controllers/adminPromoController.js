const PromoCode = require("../models/PromoCode");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const ALLOWED_FIELDS = ["type", "value", "label", "description", "active", "expiresAt", "workspaceCodes"];

const normalizeWorkspaceCodes = (codes) =>
  Array.isArray(codes) ? codes.map((c) => String(c).trim().toUpperCase()) : [];

exports.createPromoCode = catchAsync(async (req, res) => {
  const { code, type, value, label, description, active, expiresAt, workspaceCodes } = req.body || {};

  if (!code || !["percentage", "fixed"].includes(type) || value === undefined) {
    throw new AppError("code, type (percentage|fixed) and value are required", 400);
  }

  const normalizedCode = code.trim().toUpperCase();

  const existing = await PromoCode.findOne({ code: normalizedCode });
  if (existing) {
    throw new AppError("Promo code already exists", 409);
  }

  const promoCode = await PromoCode.create({
    code: normalizedCode,
    type,
    value,
    label,
    description,
    active: active !== undefined ? Boolean(active) : true,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    workspaceCodes: normalizeWorkspaceCodes(workspaceCodes),
  });

  res.status(201).json({ success: true, promoCode });
});

exports.listPromoCodes = catchAsync(async (req, res) => {
  const promoCodes = await PromoCode.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, promoCodes });
});

exports.updatePromoCode = catchAsync(async (req, res) => {
  const body = req.body || {};
  const updates = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  if (updates.expiresAt) updates.expiresAt = new Date(updates.expiresAt);
  if (updates.workspaceCodes) updates.workspaceCodes = normalizeWorkspaceCodes(updates.workspaceCodes);

  const promoCode = await PromoCode.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!promoCode) {
    throw new AppError("Promo code not found", 404);
  }

  res.status(200).json({ success: true, promoCode });
});

exports.deletePromoCode = catchAsync(async (req, res) => {
  const promoCode = await PromoCode.findByIdAndDelete(req.params.id);

  if (!promoCode) {
    throw new AppError("Promo code not found", 404);
  }

  res.status(200).json({ success: true, message: "Promo code deleted" });
});
