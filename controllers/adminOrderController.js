const Order = require("../models/Order");
const User = require("../models/User");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const VALID_STATUSES = ["new", "delivered", "cancelled"];

const toDateStr = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const buildDeliveryDateFilter = (dayFilter, startDate, endDate) => {
  const today = new Date();
  const todayStr = toDateStr(today);

  if (dayFilter === "today") {
    return todayStr;
  }
  if (dayFilter === "yesterday") {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    return toDateStr(y);
  }
  if (dayFilter === "last7days") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { $gte: toDateStr(start), $lte: todayStr };
  }
  if (dayFilter === "custom" && startDate && endDate) {
    return { $gte: startDate, $lte: endDate };
  }
  return null;
};

const toAdminOrderItem = (item) => ({
  dishId: item.dishId,
  dishName: item.dishName,
  quantity: item.qty,
  unitPrice: Number(item.unitPrice).toFixed(2),
  portion: item.portionSize || undefined,
  addOns: item.addons || [],
});

const toAdminOrderJSON = (order) => {
  const user = order.user && typeof order.user === "object" ? order.user : null;
  const workspace = order.workspace && typeof order.workspace === "object" ? order.workspace : null;

  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    customerName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : undefined,
    customerId: user ? user._id : order.user,
    workspaceId: workspace ? workspace._id : order.workspace,
    workspaceCode: order.workspaceCode,
    workspaceName: workspace ? workspace.name : order.workspaceName,
    items: order.items.map(toAdminOrderItem),
    totalAmount: order.total,
    status: order.status,
    subscriptionType: order.isWeeklySubscription ? "weekly" : "one-off",
    paymentMethod: order.paymentMethod,
    orderDate: order.createdAt,
    deliveryDate: order.deliveryDate,
    preferredTime: order.lunchTime,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

exports.listOrders = catchAsync(async (req, res) => {
  const { status, type, workspaceId, dayFilter, startDate, endDate, search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const filter = {};

  if (status) filter.status = status;
  if (type) filter.isWeeklySubscription = type === "weekly";
  if (workspaceId) filter.workspace = workspaceId;

  const deliveryDateFilter = buildDeliveryDateFilter(dayFilter, startDate, endDate);
  if (deliveryDateFilter) filter.deliveryDate = deliveryDateFilter;

  if (search) {
    const regex = new RegExp(search, "i");
    const matchingUsers = await User.find({ $or: [{ firstName: regex }, { lastName: regex }] }).select("_id");
    filter.$or = [{ workspaceCode: regex }, { user: { $in: matchingUsers.map((u) => u._id) } }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "firstName lastName email")
      .populate("workspace", "code name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    orders: orders.map(toAdminOrderJSON),
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});

exports.getOrder = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "firstName lastName email")
    .populate("workspace", "code name");

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  res.status(200).json({ success: true, order: toAdminOrderJSON(order) });
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body || {};

  if (!VALID_STATUSES.includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate("user", "firstName lastName email")
    .populate("workspace", "code name");

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  res.status(200).json({ success: true, order: toAdminOrderJSON(order) });
});

exports.bulkUpdateStatus = catchAsync(async (req, res) => {
  const { orderIds, status } = req.body || {};

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError("orderIds must be a non-empty array", 400);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  const result = await Order.updateMany({ orderNumber: { $in: orderIds } }, { status });

  res.status(200).json({ success: true, updatedCount: result.modifiedCount });
});
