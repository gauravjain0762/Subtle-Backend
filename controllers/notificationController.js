const Notification = require("../models/Notification");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

// Get all notifications with filters
exports.getNotifications = catchAsync(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const { type, read } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (read !== undefined) filter.read = read === "true";

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  const unread = await Notification.countDocuments({ read: false });

  res.status(200).json({
    success: true,
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount: unread,
  });
});

// Get unread count only
exports.getUnreadCount = catchAsync(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ read: false });

  res.status(200).json({
    success: true,
    unreadCount,
  });
});

// Mark single notification as read
exports.markAsRead = catchAsync(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findByIdAndUpdate(
    notificationId,
    {
      read: true,
      readAt: new Date(),
    },
    { new: true }
  );

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    notification,
  });
});

// Mark all notifications as read
exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ read: false }, { read: true, readAt: new Date() });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
  });
});

// Delete notification
exports.deleteNotification = catchAsync(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findByIdAndDelete(notificationId);

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted",
  });
});

// Delete all notifications
exports.deleteAllNotifications = catchAsync(async (req, res) => {
  await Notification.deleteMany({});

  res.status(200).json({
    success: true,
    message: "All notifications deleted",
  });
});
