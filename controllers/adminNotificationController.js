const Notification = require("../models/Notification");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.listNotifications = catchAsync(async (req, res) => {
  const { type, read, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (read !== undefined) filter.read = read === "true";

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Notification.countDocuments(filter),
    Notification.countDocuments({ read: false }),
  ]);

  const totalPages = Math.max(Math.ceil(total / limitNum), 1);

  res.status(200).json({
    success: true,
    notifications,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: totalPages,
    },
    unreadCount,
  });
});

exports.getNotification = catchAsync(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.status(200).json({ success: true, notification });
});

exports.markAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { read: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.status(200).json({ success: true, notification });
});

exports.markAllAsRead = catchAsync(async (req, res) => {
  const result = await Notification.updateMany(
    { read: false },
    { read: true, readAt: new Date() }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
  });
});

exports.getUnreadCount = catchAsync(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ read: false });

  res.status(200).json({
    success: true,
    unreadCount,
  });
});

exports.deleteNotification = catchAsync(async (req, res) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted",
  });
});
