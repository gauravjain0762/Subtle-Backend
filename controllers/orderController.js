const Order = require("../models/Order");
const Workspace = require("../models/Workspace");
const Cart = require("../models/Cart");
const Notification = require("../models/Notification");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { generateDailyRef } = require("../utils/generateRef");
const getNextSequence = require("../utils/getNextSequence");
const { calculateOrderPricing } = require("../utils/calculateOrderPricing");
const { getStripe } = require("../config/stripe");

exports.createOrder = catchAsync(async (req, res) => {
  const {
    workspaceCode,
    deliveryDate,
    lunchTime,
    items,
    planType,
    promoCode,
    paymentMethod,
    paymentIntentId,
    useStripeCheckout,
  } = req.body || {};

  if (!workspaceCode || !deliveryDate || !lunchTime || !Array.isArray(items) || items.length === 0) {
    throw new AppError("Missing required order fields", 400);
  }

  const MIN_QUANTITY = 1;
  const MAX_QUANTITY = 100;

  for (const item of items) {
    if (!item.qty || item.qty < MIN_QUANTITY || item.qty > MAX_QUANTITY) {
      throw new AppError(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}. ${item.dishName || "Item"} has ${item.qty || 0}.`, 400);
    }

    if (Array.isArray(item.addons) && item.addons.length > 0) {
      for (const addon of item.addons) {
        const addonQty = addon.qty || 1;
        if (addonQty < MIN_QUANTITY || addonQty > MAX_QUANTITY) {
          throw new AppError(`Add-on quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}. ${addon.name} has ${addonQty}.`, 400);
        }
      }
    }
  }

  const workspace = await Workspace.findOne({ code: workspaceCode.trim().toUpperCase(), status: "active" });
  if (!workspace) {
    throw new AppError("Workspace code is not active", 400);
  }

  const { orderItems, subtotal, discount, appliedPromoCode, total } = await calculateOrderPricing({
    workspaceCode,
    deliveryDate,
    items,
    promoCode,
  });

  if (paymentMethod && !["card", "apple_pay", "google_pay", "subscription"].includes(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
  }

  if (planType && !["one-time", "weekly", "one-off"].includes(planType)) {
    throw new AppError("Invalid planType. Must be 'one-time', 'weekly', or 'one-off'", 400);
  }

  let paid = false;
  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      throw new AppError("Payment has not been completed", 400);
    }

    const expectedAmount = Math.round(total * 100);
    if (paymentIntent.amount !== expectedAmount) {
      throw new AppError("Payment amount does not match order total", 400);
    }

    paid = true;
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
    planType: planType || "one-time",
    paymentMethod: paymentMethod || "card",
    paymentIntentId: paymentIntentId || undefined,
    paid,
  });

  // Create recurring orders based on planType
  if (planType === "weekly") {
    await createWeeklyRecurringOrders(order);
  } else if (planType === "one-off") {
    await createOneOffRecurringOrders(order);
  }
  // For one-time, no recurring orders needed

  // Create notification for admin
  const planTypeLabel = planType === "one-time" ? "Single Order" : planType === "weekly" ? "Weekly Plan" : "One-Off Plan";
  await Notification.create({
    type: "new_order",
    title: "New Order Placed",
    message: `New ${planTypeLabel} order from ${workspace.name} - £${total}`,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderTotal: total,
      planType: planType || "one-time",
    },
  });

  // Send admin email notification for new order
  try {
    const nodemailer = require("nodemailer");
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;

    if (adminEmail) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const userName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email;
      const userEmail = req.user.email || "N/A";

      // Build meal details table rows
      const mealRows = orderItems.map(item => `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 10px; text-align: left;">${item.dishName}</td>
          <td style="padding: 10px; text-align: center;">${item.qty}</td>
          <td style="padding: 10px; text-align: right;">£${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 10px; text-align: right;">£${(item.unitPrice * item.qty).toFixed(2)}</td>
        </tr>
      `).join('');

      const planTypeText = planType === "one-time" ? "Single Order" : planType === "weekly" ? "Weekly Plan" : "One-Off Plan";

      const emailHTML = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="border-left: 4px solid #2196F3; padding-left: 15px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #2196F3;">📦 New Order Placed</h2>
            <p style="margin: 5px 0; font-size: 14px; color: #666;">Order from ${workspace.name}</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">CUSTOMER DETAILS</h3>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>Company Code:</strong> ${workspace.code}</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">ORDER DETAILS</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Delivery Date:</strong> ${new Date(deliveryDate).toLocaleDateString()}</p>
            <p><strong>Delivery Time:</strong> ${lunchTime}</p>
            <p><strong>Payment Method:</strong> ${paymentMethod || "card"}</p>
            <p><strong>Payment Status:</strong> ${paid ? "✅ Paid" : "⏳ Pending"}</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">MEAL DETAILS</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f0f0f0; border-bottom: 2px solid #2196F3;">
                  <th style="padding: 10px; text-align: left;">Dish Name</th>
                  <th style="padding: 10px; text-align: center;">Quantity</th>
                  <th style="padding: 10px; text-align: right;">Unit Price</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${mealRows}
                <tr style="background-color: #f9f9f9; font-weight: bold; border-top: 2px solid #2196F3;">
                  <td colspan="3" style="padding: 10px; text-align: right;">Subtotal:</td>
                  <td style="padding: 10px; text-align: right;">£${subtotal.toFixed(2)}</td>
                </tr>
                ${discount > 0 ? `
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td colspan="3" style="padding: 10px; text-align: right;">Discount (${appliedPromoCode || 'Promo'}):</td>
                  <td style="padding: 10px; text-align: right; color: #4caf50;">-£${discount.toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr style="background-color: #e8f5e9; font-weight: bold; border-top: 2px solid #2196F3;">
                  <td colspan="3" style="padding: 10px; text-align: right; color: #2196F3;">TOTAL:</td>
                  <td style="padding: 10px; text-align: right; color: #2196F3; font-size: 16px;">£${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">ORDER TYPE</h3>
            <p><strong>Plan Type:</strong> ${planTypeText}</p>
            <p><strong>Workspace:</strong> ${workspace.name}</p>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification from Subtle Kitchen admin system.</p>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: adminEmail,
        subject: `📦 NEW ORDER: ${order.orderNumber} - ${userName} (${workspace.name})`,
        html: emailHTML,
      });

      console.log(`✅ Admin email sent for order ${order.orderNumber}`);
    }
  } catch (emailError) {
    console.error(`⚠️ Failed to send admin email for order ${order.orderNumber}:`, emailError.message);
  }

  await Cart.deleteOne({ user: req.user._id });

  if (useStripeCheckout) {
    const redirectUrl = process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : "http://localhost:3000";

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      currency: "gbp",
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: `Subtle Kitchen order ${orderNumber}` },
            unit_amount: Math.round(total * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${redirectUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${redirectUrl}/review`,
      metadata: { orderId: order._id.toString(), userId: req.user._id.toString() },
      locale: "en",
    });

    order.checkoutSessionId = session.id;
    await order.save();

    return res.status(201).json({
      success: true,
      order,
      checkoutUrl: session.url,
    });
  }

  res.status(201).json({
    success: true,
    order,
  });
});

exports.getOrderBySession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const order = await Order.findOne({ checkoutSessionId: sessionId });
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!order.paid) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") {
      order.paid = true;
      await order.save();
    }
  }

  const orderData = order.toObject();
  orderData.items = (orderData.items || []).map(item => ({
    ...item,
    price: item.unitPrice,
  }));

  res.status(200).json({
    success: true,
    order: {
      _id: orderData._id,
      orderRef: orderData.orderRef,
      orderNumber: orderData.orderNumber,
      deliveryDate: orderData.deliveryDate,
      lunchTime: orderData.lunchTime,
      total: orderData.total,
      subtotal: orderData.subtotal,
      discount: orderData.discount,
      items: orderData.items,
      workspaceCode: orderData.workspaceCode,
      workspaceName: orderData.workspaceName,
      paid: orderData.paid,
      createdAt: orderData.createdAt,
    },
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

// Helper: Create weekly recurring orders (4 weeks)
async function createWeeklyRecurringOrders(order) {
  try {
    const startDate = new Date(order.deliveryDate);
    const dayOfWeek = startDate.getDay();

    for (let week = 1; week < 4; week++) {
      const nextDate = new Date(startDate);
      nextDate.setDate(nextDate.getDate() + week * 7);
      const dateStr = nextDate.toISOString().slice(0, 10);

      const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr.replace(/-/g, ""));

      await Order.create({
        orderRef,
        orderNumber: `ORD-${await getNextSequence("orderNumber")}`,
        user: order.user,
        workspace: order.workspace,
        workspaceCode: order.workspaceCode,
        workspaceName: order.workspaceName,
        deliveryDate: dateStr,
        lunchTime: order.lunchTime,
        items: order.items,
        subtotal: order.subtotal,
        promoCode: order.promoCode,
        discount: order.discount,
        total: order.total,
        planType: "weekly",
        paymentMethod: order.paymentMethod,
        paid: true,
      });
    }
  } catch (error) {
    console.error("Error creating weekly recurring orders:", error);
  }
}

// Helper: Create one-off recurring orders (2 weeks on alternate days)
async function createOneOffRecurringOrders(order) {
  try {
    const startDate = new Date(order.deliveryDate);
    const alternateDates = [];

    // Create 2 weeks of alternate day orders
    for (let day = 2; day <= 14; day += 2) {
      const nextDate = new Date(startDate);
      nextDate.setDate(nextDate.getDate() + day);
      alternateDates.push(nextDate);
    }

    for (const date of alternateDates) {
      const dateStr = date.toISOString().slice(0, 10);
      const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr.replace(/-/g, ""));

      await Order.create({
        orderRef,
        orderNumber: `ORD-${await getNextSequence("orderNumber")}`,
        user: order.user,
        workspace: order.workspace,
        workspaceCode: order.workspaceCode,
        workspaceName: order.workspaceName,
        deliveryDate: dateStr,
        lunchTime: order.lunchTime,
        items: order.items,
        subtotal: order.subtotal,
        promoCode: order.promoCode,
        discount: order.discount,
        total: order.total,
        planType: "one-off",
        paymentMethod: order.paymentMethod,
        paid: true,
      });
    }
  } catch (error) {
    console.error("Error creating one-off recurring orders:", error);
  }
}
