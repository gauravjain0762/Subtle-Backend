const Order = require("../models/Order");
const Menu = require("../models/Menu");
const Workspace = require("../models/Workspace");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { generateDailyRef } = require("../utils/generateRef");

const CUTOFF_HOUR = 22;

const isPastCutoff = (deliveryDate) => {
  const [year, month, day] = deliveryDate.split("-").map(Number);
  const cutoff = new Date(year, month - 1, day - 1, CUTOFF_HOUR, 0, 0, 0);
  return new Date() > cutoff;
};

exports.createOrder = catchAsync(async (req, res) => {
  const { workspaceCode, deliveryDate, lunchTime, items, isWeeklySubscription } = req.body || {};

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

  const menu = await Menu.findOne({ "days.date": deliveryDate }).populate("days.dishes");
  if (!menu) {
    throw new AppError("Menu not available for the selected delivery date", 400);
  }

  const day = menu.days.find((d) => d.date === deliveryDate);
  if (!day || day.closed) {
    throw new AppError("Kitchen is closed on the selected delivery date", 400);
  }

  let subtotal = 0;
  const orderItems = items.map((item) => {
    const dish = day.dishes.find((d) => d._id.toString() === String(item.dishId));
    if (!dish) {
      throw new AppError(`Dish not found: ${item.dishId}`, 400);
    }

    const portion = item.portion === "large" ? "large" : "regular";
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;
    const addonNames = Array.isArray(item.addons) ? item.addons : [];

    let unitPrice = portion === "large" ? dish.price + (dish.largePriceExtra || 0) : dish.price;

    addonNames.forEach((addonName) => {
      const addon = dish.addons.find((a) => a.name === addonName);
      if (!addon) {
        throw new AppError(`Invalid addon: ${addonName}`, 400);
      }
      unitPrice += addon.price;
    });

    subtotal += unitPrice * qty;

    return {
      dishId: dish._id,
      dishName: dish.name,
      portion,
      qty,
      addons: addonNames,
      unitPrice,
      images: dish.images,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const total = subtotal;

  const dateStr = deliveryDate.replace(/-/g, "");
  const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr);

  const order = await Order.create({
    orderRef,
    user: req.user._id,
    workspace: workspace._id,
    workspaceCode: workspace.code,
    deliveryDate,
    lunchTime,
    items: orderItems,
    subtotal,
    total,
    isWeeklySubscription: Boolean(isWeeklySubscription),
  });

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
