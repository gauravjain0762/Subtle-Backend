const User = require("../models/User");
const Subscription = require("../models/Subscription");
const Workspace = require("../models/Workspace");
const Order = require("../models/Order");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const buildCustomerJSON = (user, subscription, workspace, orderCount) => {
  const hasSubscription = Boolean(subscription);

  return {
    _id: user._id,
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    email: user.email,
    phone: user.phone,
    workspaceId: workspace ? workspace._id : undefined,
    workspaceCode: user.workspaceCode || undefined,
    workspaceName: user.workspaceName || undefined,
    type: hasSubscription ? "weekly" : "one-off",
    subscriptionStatus: hasSubscription ? subscription.status : null,
    status: user.status,
    orderCount,
    createdAt: user.createdAt,
  };
};

const getCustomerContext = async (user) => {
  const [subscription, workspace, orderCount] = await Promise.all([
    Subscription.findOne({ user: user._id }),
    user.workspaceCode ? Workspace.findOne({ code: user.workspaceCode }) : null,
    Order.countDocuments({ user: user._id }),
  ]);

  return buildCustomerJSON(user, subscription, workspace, orderCount);
};

exports.listCustomers = catchAsync(async (req, res) => {
  const { search, type, workspaceId, status } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const filter = {};

  if (status) filter.status = status;

  if (search) {
    const regex = new RegExp(search, "i");
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  if (workspaceId) {
    const workspace = await Workspace.findById(workspaceId);
    filter.workspaceCode = workspace ? workspace.code : "__NO_MATCH__";
  }

  if (type === "weekly" || type === "one-off") {
    const subscribedUserIds = await Subscription.distinct("user");
    filter._id = type === "weekly" ? { $in: subscribedUserIds } : { $nin: subscribedUserIds };
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const userIds = users.map((u) => u._id);
  const codes = [...new Set(users.map((u) => u.workspaceCode).filter(Boolean))];

  const [subscriptions, workspaces, orderCounts] = await Promise.all([
    Subscription.find({ user: { $in: userIds } }),
    Workspace.find({ code: { $in: codes } }),
    Order.aggregate([{ $match: { user: { $in: userIds } } }, { $group: { _id: "$user", count: { $sum: 1 } } }]),
  ]);

  const subscriptionMap = Object.fromEntries(subscriptions.map((s) => [s.user.toString(), s]));
  const workspaceMap = Object.fromEntries(workspaces.map((w) => [w.code, w]));
  const orderCountMap = Object.fromEntries(orderCounts.map((o) => [o._id.toString(), o.count]));

  const customers = users.map((user) =>
    buildCustomerJSON(
      user,
      subscriptionMap[user._id.toString()],
      user.workspaceCode ? workspaceMap[user.workspaceCode] : null,
      orderCountMap[user._id.toString()] || 0
    )
  );

  res.status(200).json({
    success: true,
    customers,
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});

exports.getCustomer = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError("Customer not found", 404);
  }

  res.status(200).json({ success: true, customer: await getCustomerContext(user) });
});

exports.updateCustomerStatus = catchAsync(async (req, res) => {
  const { status } = req.body || {};

  if (!["active", "blocked"].includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!user) {
    throw new AppError("Customer not found", 404);
  }

  res.status(200).json({ success: true, customer: await getCustomerContext(user) });
});
