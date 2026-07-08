const Order = require("../models/Order");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const STATUS_ORDER = ["confirmed", "preparing", "out_for_delivery", "delivered"];

exports.listOrders = catchAsync(async (req, res) => {
  const { date, workspaceId, status } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);

  const filter = {};
  if (date) filter.deliveryDate = date;
  if (status) filter.status = status;
  if (workspaceId) filter.workspace = workspaceId;

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
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body || {};

  const order = await Order.findById(req.params.id);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (status === "cancelled") {
    if (order.status === "delivered") {
      throw new AppError("Cannot cancel a delivered order", 400);
    }
    order.status = "cancelled";
    await order.save();
    return res.status(200).json({
      success: true,
      order: { _id: order._id, orderRef: order.orderRef, status: order.status },
    });
  }

  const currentIndex = STATUS_ORDER.indexOf(order.status);
  const nextIndex = STATUS_ORDER.indexOf(status);

  if (nextIndex === -1) {
    throw new AppError("Invalid status", 400);
  }
  if (currentIndex === -1) {
    throw new AppError(`Cannot update a ${order.status} order`, 400);
  }
  if (nextIndex !== currentIndex + 1) {
    throw new AppError(`Cannot move order from ${order.status} to ${status}`, 400);
  }

  order.status = status;
  await order.save();

  res.status(200).json({
    success: true,
    order: { _id: order._id, orderRef: order.orderRef, status: order.status },
  });
});
