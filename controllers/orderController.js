const Order = require("../models/Order");
const Workspace = require("../models/Workspace");
const Cart = require("../models/Cart");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { generateDailyRef } = require("../utils/generateRef");
const getNextSequence = require("../utils/getNextSequence");
const validatePromoCode = require("../utils/validatePromoCode");
const { getWeekdayCode, getStandardDishesForDay } = require("../utils/standardMenu");

const CUTOFF_HOUR = 22;

const isPastCutoff = (deliveryDate) => {
  const [year, month, day] = deliveryDate.split("-").map(Number);
  const cutoff = new Date(year, month - 1, day - 1, CUTOFF_HOUR, 0, 0, 0);
  return new Date() > cutoff;
};

exports.createOrder = catchAsync(async (req, res) => {
  const {
    workspaceCode,
    deliveryDate,
    lunchTime,
    items,
    isWeeklySubscription,
    promoCode,
    paymentMethod,
  } = req.body || {};

  if (!workspaceCode || !deliveryDate || !lunchTime || !Array.isArray(items) || items.length === 0) {
    throw new AppError("Missing required order fields", 400);
  }

  const workspace = await Workspace.findOne({ code: workspaceCode.trim().toUpperCase(), status: "active" });
  if (!workspace) {
    throw new AppError("Workspace code is not active", 400);
  }

  if (isPastCutoff(deliveryDate)) {
    throw new AppError("Order cutoff passed. Please order before 10:00 PM the night before.", 400);
  }

  const weekdayCode = getWeekdayCode(deliveryDate);
  if (weekdayCode === "Sat" || weekdayCode === "Sun") {
    throw new AppError("Kitchen is closed on the selected delivery date", 400);
  }

  const availableDishes = await getStandardDishesForDay(weekdayCode);
  if (availableDishes.length === 0) {
    throw new AppError("Menu not available for the selected delivery date", 400);
  }

  let subtotal = 0;
  const orderItems = items.map((item) => {
    const dish = availableDishes.find((d) => d._id.toString() === String(item.dishId));
    if (!dish) {
      throw new AppError(`Dish not found: ${item.dishId}`, 400);
    }

    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;

    let portionSize = null;
    let unitPrice;

    if (Array.isArray(dish.portions) && dish.portions.length > 0) {
      const matchedPortion = item.portionSize
        ? dish.portions.find((p) => p.size.toLowerCase() === String(item.portionSize).toLowerCase())
        : dish.portions[0];

      if (!matchedPortion) {
        throw new AppError(`Invalid portion size: ${item.portionSize}`, 400);
      }

      portionSize = matchedPortion.size;
      unitPrice = Number(matchedPortion.price);
    } else {
      unitPrice = Number(dish.price);
    }

    if (Number.isNaN(unitPrice)) {
      throw new AppError(`Dish ${dish.name} has an invalid price`, 400);
    }

    const rawAddons = Array.isArray(item.addons) ? item.addons : [];
    const addonNames = rawAddons.map((addon) => (typeof addon === "string" ? addon : addon?.name));

    addonNames.forEach((addonName) => {
      const ingredient = (dish.ingredients || []).find((i) => i.name === addonName);
      if (!ingredient || ingredient.price === undefined || ingredient.price === null || ingredient.price === "") {
        throw new AppError(`Invalid addon: ${addonName}`, 400);
      }

      const addonPrice = Number(ingredient.price);
      if (Number.isNaN(addonPrice)) {
        throw new AppError(`Addon ${addonName} has an invalid price`, 400);
      }

      unitPrice += addonPrice;
    });

    subtotal += unitPrice * qty;

    return {
      dishId: dish._id,
      dishName: dish.name,
      portionSize,
      qty,
      addons: addonNames,
      unitPrice,
      images: dish.images,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;

  let discount;
  let appliedPromoCode;
  let total = subtotal;

  if (promoCode) {
    const promoResult = await validatePromoCode(promoCode, workspaceCode);
    if (!promoResult.valid) {
      throw new AppError(promoResult.error, 400);
    }

    const { type, value, label } = promoResult.discount;
    const rawAmount = type === "percentage" ? subtotal * (value / 100) : value;
    const amount = Math.min(Math.round(rawAmount * 100) / 100, subtotal);

    appliedPromoCode = promoResult.code;
    discount = { type, value, amount, label };
    total = Math.round((subtotal - amount) * 100) / 100;
  }

  if (paymentMethod && !["card", "apple_pay", "google_pay"].includes(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
  }

  const dateStr = deliveryDate.replace(/-/g, "");
  const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr);
  const orderNumber = `ORD-${await getNextSequence("orderNumber")}`;

  const order = await Order.create({
    orderRef,
    orderNumber,
    user: req.user._id,
    workspace: workspace._id,
    workspaceCode: workspace.code,
    workspaceName: workspace.name,
    deliveryDate,
    lunchTime,
    items: orderItems,
    subtotal,
    promoCode: appliedPromoCode,
    discount,
    total,
    isWeeklySubscription: Boolean(isWeeklySubscription),
    paymentMethod: paymentMethod || "card",
  });

  await Cart.deleteOne({ user: req.user._id });

  res.status(201).json({
    success: true,
    order,
  });
});

exports.getMyOrders = catchAsync(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const [orders, total] = await Promise.all([
    Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ user: req.user._id }),
  ]);

  res.status(200).json({
    success: true,
    orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
