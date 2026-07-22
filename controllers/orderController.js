const Order = require("../models/Order");
const Workspace = require("../models/Workspace");
const Cart = require("../models/Cart");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { generateDailyRef } = require("../utils/generateRef");
const getNextSequence = require("../utils/getNextSequence");
const { calculateOrderPricing } = require("../utils/calculateOrderPricing");
const stripe = require("../config/stripe");

exports.createOrder = catchAsync(async (req, res) => {
  const {
    workspaceCode,
    deliveryDate,
    lunchTime,
    items,
    isWeeklySubscription,
    promoCode,
    paymentMethod,
    paymentIntentId,
    useStripeCheckout,
  } = req.body || {};

  if (!workspaceCode || !deliveryDate || !lunchTime || !Array.isArray(items) || items.length === 0) {
    throw new AppError("Missing required order fields", 400);
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

  if (paymentMethod && !["card", "apple_pay", "google_pay"].includes(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
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
    isWeeklySubscription: Boolean(isWeeklySubscription),
    paymentMethod: paymentMethod || "card",
    paymentIntentId: paymentIntentId || undefined,
    paid,
  });

  await Cart.deleteOne({ user: req.user._id });

  if (useStripeCheckout) {
    const session = await stripe.checkout.sessions.create({
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
      success_url: `${process.env.FRONTEND_URL}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/review`,
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

  const order = await Order.findOne({ checkoutSessionId: sessionId, user: req.user._id });
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

  res.status(200).json({ success: true, order });
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
