const mongoose = require("mongoose");
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
    planType: order.planType,
    paymentMethod: order.paymentMethod,
    orderDate: order.createdAt,
    deliveryDate: order.deliveryDate,
    preferredTime: order.lunchTime,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

exports.listOrders = catchAsync(async (req, res) => {
  const { status, type, workspaceId, customerId, dayFilter, startDate, endDate, search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const filter = {};

  if (status) filter.status = status;
  if (type) filter.planType = type;
  if (workspaceId) filter.workspace = workspaceId;
  if (customerId) filter.user = customerId;

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

  // Send delivery notification to customer automatically
  if (status === "delivered" && order.user && order.user.email) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const customerName = `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() || order.user.email;
      const itemsList = order.items
        .map((item) => `  • ${item.dishName}\n    Quantity: ${item.qty}\n    Portion: ${item.portionSize || "Regular"}\n    Add-ons: ${item.addons?.length > 0 ? item.addons.map((a) => a.name).join(", ") : "None"}`)
        .join("\n\n");

      const emailHTML = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Your Order Has Been Delivered 🎉</h2>

          <p>Hi ${customerName},</p>

          <p>Great news! Your order has been delivered.</p>

          <div style="border: 1px solid #ddd; padding: 15px; margin: 20px 0; background: #f9f9f9;">
            <h3 style="margin-top: 0;">ORDER DETAILS</h3>

            <p><strong>Order ID:</strong> ${order.orderNumber}</p>
            <p><strong>Delivery Date:</strong> ${new Date(order.deliveryDate).toLocaleDateString()}</p>
            <p><strong>Subscription:</strong> ${order.planType === "weekly" ? "Weekly Plan" : "One-Off Plan"}</p>

            <h3>Items Ordered:</h3>
            <pre style="white-space: pre-wrap; font-family: Arial; background: white; padding: 10px;">${itemsList}</pre>

            <p><strong>Total Amount:</strong> £${order.total.toFixed(2)}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === "subscription" ? "Subscription" : "Card"}</p>
          </div>

          <p>Thank you for your order! We hope you enjoyed your meal.</p>

          <p>If you have any questions or concerns, please contact us.</p>

          <p>Best regards,<br><strong>Subtle Kitchen Team</strong><br>support@subtlekitchen.com</p>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: order.user.email,
        subject: `Your Order Has Been Delivered - Order #${order.orderNumber}`,
        html: emailHTML,
      });

      console.log(`✅ Delivery email sent to ${order.user.email} for order ${order.orderNumber}`);
    } catch (error) {
      console.error(`⚠️ Failed to send delivery email for order ${order.orderNumber}:`, error.message);
    }
  }

  res.status(200).json({ success: true, order: toAdminOrderJSON(order) });
});

exports.bulkUpdateStatus = catchAsync(async (req, res) => {
  const { orderIds, status, sendNotification = false } = req.body || {};

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError("orderIds must be a non-empty array", 400);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  const invalidIds = orderIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    throw new AppError(`Invalid order id(s): ${invalidIds.join(", ")}`, 400);
  }

  // Update orders
  console.log(`📦 Updating ${orderIds.length} orders to status: ${status}`);
  const result = await Order.updateMany({ _id: { $in: orderIds } }, { status, updatedAt: new Date() });

  // Fetch updated orders with customer details
  const updatedOrders = await Order.find({ _id: { $in: orderIds } })
    .populate("user", "email firstName lastName")
    .populate("subscription");

  const emailsSent = [];
  const failedEmails = [];

  // Send emails automatically when order is marked as delivered
  if (status === "delivered") {
    console.log(`📧 Sending delivery notifications to ${updatedOrders.length} customers...`);

    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      for (const order of updatedOrders) {
        try {
          if (!order.user || !order.user.email) {
            console.warn(`⚠️ Order ${order.orderNumber} - no customer email found`);
            failedEmails.push({
              orderId: order.orderNumber,
              reason: "No customer email found",
            });
            continue;
          }

          const customerName = `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() || order.user.email;
          const itemsList = order.items
            .map((item) => `  • ${item.dishName}\n    Quantity: ${item.qty}\n    Portion: ${item.portionSize || "Regular"}\n    Add-ons: ${item.addons?.length > 0 ? item.addons.map((a) => a.name).join(", ") : "None"}`)
            .join("\n\n");

          const emailHTML = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2>Your Order Has Been Delivered 🎉</h2>

              <p>Hi ${customerName},</p>

              <p>Great news! Your order has been delivered.</p>

              <div style="border: 1px solid #ddd; padding: 15px; margin: 20px 0; background: #f9f9f9;">
                <h3 style="margin-top: 0;">ORDER DETAILS</h3>

                <p><strong>Order ID:</strong> ${order.orderNumber}</p>
                <p><strong>Delivery Date:</strong> ${new Date(order.deliveryDate).toLocaleDateString()}</p>
                <p><strong>Subscription:</strong> ${order.planType === "weekly" ? "Weekly Plan" : "One-Off Plan"}</p>

                <h3>Items Ordered:</h3>
                <pre style="white-space: pre-wrap; font-family: Arial; background: white; padding: 10px;">${itemsList}</pre>

                <p><strong>Total Amount:</strong> £${order.total.toFixed(2)}</p>
                <p><strong>Payment Method:</strong> ${order.paymentMethod === "subscription" ? "Subscription" : "Card"}</p>
              </div>

              <p>Thank you for your order! We hope you enjoyed your meal.</p>

              <p>If you have any questions or concerns, please contact us.</p>

              <p>Best regards,<br><strong>Subtle Kitchen Team</strong><br>support@subtlekitchen.com</p>
            </div>
          `;

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: order.user.email,
            subject: `Your Order Has Been Delivered - Order #${order.orderNumber}`,
            html: emailHTML,
          });

          emailsSent.push({
            orderId: order.orderNumber,
            customerEmail: order.user.email,
            status: "sent",
          });

          console.log(`✅ Email sent to ${order.user.email} for order ${order.orderNumber}`);
        } catch (error) {
          console.error(`❌ Failed to send email for order ${order.orderNumber}:`, error.message);
          failedEmails.push({
            orderId: order.orderNumber,
            reason: error.message,
          });
        }
      }
    } catch (error) {
      console.error(`❌ Email service error:`, error.message);
    }
  }

  res.status(200).json({
    success: true,
    updatedCount: result.modifiedCount,
    notificationsSent: emailsSent.length,
    failedNotifications: failedEmails.length,
    message: `${result.modifiedCount} orders updated to ${status}. ${emailsSent.length} emails sent successfully.`,
    details: {
      updatedOrders: updatedOrders.map((o) => o.orderNumber),
      emailsSent,
      failedEmails,
    },
  });
});

// Get grouped subscription orders (one entry per subscription with all delivery dates)
exports.getGroupedSubscriptionOrders = catchAsync(async (req, res) => {
  const { status, workspaceId, customerId, dayFilter, startDate, endDate, search } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const filter = {
    subscription: { $exists: true, $ne: null },
  };

  if (status) filter.status = status;
  if (workspaceId) filter.workspace = workspaceId;
  if (customerId) filter.user = customerId;

  const deliveryDateFilter = buildDeliveryDateFilter(dayFilter, startDate, endDate);
  if (deliveryDateFilter) filter.deliveryDate = deliveryDateFilter;

  if (search) {
    const regex = new RegExp(search, "i");
    const matchingUsers = await User.find({ $or: [{ firstName: regex }, { lastName: regex }] }).select("_id");
    filter.$or = [{ workspaceCode: regex }, { user: { $in: matchingUsers.map((u) => u._id) } }];
  }

  // Get all matching orders
  const allOrders = await Order.find(filter)
    .populate("user", "firstName lastName email")
    .populate("workspace", "code name")
    .populate("subscription")
    .sort({ createdAt: -1 });

  // Group by subscription
  const groupedMap = new Map();
  allOrders.forEach((order) => {
    const subId = order.subscription._id.toString();
    if (!groupedMap.has(subId)) {
      groupedMap.set(subId, {
        subscriptionId: order.subscription._id,
        orderNumber: order.orderNumber,
        customerName: order.user ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() || order.user.email : undefined,
        customerId: order.user._id,
        workspaceId: order.workspace._id,
        workspaceCode: order.workspaceCode,
        workspaceName: order.workspace.name,
        items: order.items,
        totalAmount: order.total,
        status: order.status,
        planType: order.planType,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        deliveryDates: [],
      });
    }
    groupedMap.get(subId).deliveryDates.push({
      date: order.deliveryDate,
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  });

  // Convert to array and paginate
  const grouped = Array.from(groupedMap.values());
  const total = grouped.length;
  const start = (page - 1) * limit;
  const paginatedGrouped = grouped.slice(start, start + limit);

  res.status(200).json({
    success: true,
    orders: paginatedGrouped,
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});
