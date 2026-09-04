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

  // For gym premises, skip menu date restrictions - allow any available dish
  let orderItems, subtotal, discount, appliedPromoCode, total;

  if (workspace.premiseType === "Gym") {
    // Gym orders: validate dishes exist but don't enforce menu date restrictions
    const Dish = require("../models/Dish");
    let subtotalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const dish = await Dish.findById(item.dishId);
      if (!dish) {
        throw new AppError(`Dish not found: ${item.dishId}`, 400);
      }

      if (!dish.available) {
        throw new AppError(`Dish ${dish.name} is not available`, 400);
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
      const addonsWithPrices = [];

      addonNames.forEach((addonName) => {
        const ingredient = (dish.ingredients || []).find((i) => i.name === addonName);
        if (!ingredient || ingredient.price === undefined || ingredient.price === null || ingredient.price === "") {
          throw new AppError(`Invalid addon: ${addonName}`, 400);
        }

        const addonPrice = Number(ingredient.price);
        if (Number.isNaN(addonPrice)) {
          throw new AppError(`Addon ${addonName} has an invalid price`, 400);
        }

        addonsWithPrices.push({
          name: addonName,
          price: addonPrice,
          qty: 1,
        });

        unitPrice += addonPrice;
      });

      subtotalAmount += unitPrice * qty;

      processedItems.push({
        dishId: dish._id,
        dishName: dish.name,
        portionSize,
        qty,
        addons: addonsWithPrices,
        unitPrice,
        images: dish.images,
      });
    }

    orderItems = processedItems;
    subtotal = Math.round(subtotalAmount * 100) / 100;
    total = subtotal;
    discount = null;
    appliedPromoCode = null;
  } else {
    // Regular orders: use standard pricing with menu date restrictions
    const result = await calculateOrderPricing({
      workspaceCode,
      deliveryDate,
      items,
      promoCode,
    });
    orderItems = result.orderItems;
    subtotal = result.subtotal;
    discount = result.discount;
    appliedPromoCode = result.appliedPromoCode;
    total = result.total;
  }

  if (paymentMethod && !["card", "apple_pay", "google_pay", "subscription"].includes(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
  }

  if (planType && !["one-time", "weekly", "one-off", "gym-bulk"].includes(planType)) {
    throw new AppError("Invalid planType. Must be 'one-time', 'weekly', 'one-off', or 'gym-bulk'", 400);
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
      id: orderData._id,
      orderRef: orderData.orderRef,
      orderNumber: orderData.orderNumber,
      type: orderData.planType,
      status: orderData.status || "completed",
      deliveryDate: orderData.deliveryDate,
      deliveryTime: orderData.lunchTime,
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

exports.createGymBulkOrder = catchAsync(async (req, res) => {
  const {
    workspaceCode,
    deliveryDate,
    lunchTime,
    meals,
  } = req.body || {};

  if (!workspaceCode || !deliveryDate || !lunchTime || !Array.isArray(meals) || meals.length === 0) {
    throw new AppError("Missing required order fields: workspaceCode, deliveryDate, lunchTime, meals", 400);
  }

  // Validate minimum 5 meals
  const totalQty = meals.reduce((sum, meal) => sum + (meal.qty || 0), 0);
  if (totalQty < 5) {
    throw new AppError("Minimum 5 meals required for gym bulk orders", 400);
  }

  const workspace = await Workspace.findOne({ code: workspaceCode.trim().toUpperCase(), status: "active" });
  if (!workspace) {
    throw new AppError("Workspace code is not active", 400);
  }

  // Validate workspace is a gym
  if (workspace.premiseType !== "Gym") {
    throw new AppError("This workspace is not a gym", 400);
  }

  // Calculate total and prepare items
  let subtotal = 0;
  const orderItems = [];

  for (const meal of meals) {
    if (!meal.dishId || !meal.dishName || !meal.qty || meal.qty < 1 || !meal.price) {
      throw new AppError("Invalid meal data: each meal must have dishId, dishName, qty, and price", 400);
    }

    const mealTotal = meal.price * meal.qty;
    subtotal += mealTotal;

    orderItems.push({
      dishId: meal.dishId,
      dishName: meal.dishName,
      portionSize: meal.portion || "Regular",
      qty: meal.qty,
      addons: meal.addons || [],
      unitPrice: meal.price,
      images: [],
    });
  }

  const dateStr = deliveryDate.replace(/-/g, "");
  const orderRef = await generateDailyRef(Order, "orderRef", "GYM", dateStr);
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
    discount: null,
    total: subtotal,
    planType: "gym-bulk",
    paymentMethod: "card",
    paid: false,
  });

  console.log(`✅ Created gym bulk order ${orderNumber} for ${workspace.name}`);

  // Create notification for admin
  await Notification.create({
    type: "new_order",
    title: "New Gym Bulk Order",
    message: `Gym bulk order ${orderNumber} from ${workspace.name} - ${totalQty} meals - £${subtotal.toFixed(2)}`,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderTotal: subtotal,
      planType: "gym-bulk",
      workspaceName: workspace.name,
    },
  });

  // Create Stripe checkout session
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
          product_data: { name: `Subtle Kitchen gym bulk order ${orderNumber}` },
          unit_amount: Math.round(subtotal * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${redirectUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${redirectUrl}/gym-orders`,
    metadata: { orderId: order._id.toString(), userId: req.user._id.toString(), type: "gym-bulk" },
    locale: "en",
  });

  order.checkoutSessionId = session.id;
  await order.save();

  // Send admin email notification for gym bulk order
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

      const emailHTML = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="border-left: 4px solid #FF9800; padding-left: 15px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #FF9800;">🏋️ New Gym Bulk Order</h2>
            <p style="margin: 5px 0; font-size: 14px; color: #666;">Gym order with ${totalQty} meals</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">GYM DETAILS</h3>
            <p><strong>Gym Name:</strong> ${workspace.name}</p>
            <p><strong>Gym Code:</strong> ${workspace.code}</p>
            <p><strong>Contact Person:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">ORDER DETAILS</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Delivery Date:</strong> ${new Date(deliveryDate).toLocaleDateString()}</p>
            <p><strong>Delivery Time:</strong> ${lunchTime}</p>
            <p><strong>Total Meals:</strong> ${totalQty}</p>
            <p><strong>Payment Status:</strong> ⏳ Pending Payment</p>
          </div>

          <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
            <h3 style="margin-top: 0;">MEAL DETAILS</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f0f0f0; border-bottom: 2px solid #FF9800;">
                  <th style="padding: 10px; text-align: left;">Dish Name</th>
                  <th style="padding: 10px; text-align: center;">Quantity</th>
                  <th style="padding: 10px; text-align: right;">Unit Price</th>
                  <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${mealRows}
                <tr style="background-color: #fff3e0; font-weight: bold; border-top: 2px solid #FF9800;">
                  <td colspan="3" style="padding: 10px; text-align: right; color: #FF9800;">TOTAL:</td>
                  <td style="padding: 10px; text-align: right; color: #FF9800; font-size: 16px;">£${subtotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification from Subtle Kitchen admin system.</p>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: adminEmail,
        subject: `🏋️ NEW GYM BULK ORDER: ${order.orderNumber} - ${workspace.name} (${totalQty} meals)`,
        html: emailHTML,
      });

      console.log(`✅ Admin email sent for gym bulk order ${order.orderNumber}`);
    }
  } catch (emailError) {
    console.error(`⚠️ Failed to send admin email for gym bulk order ${order.orderNumber}:`, emailError.message);
  }

  res.status(201).json({
    success: true,
    order: {
      id: order._id,
      orderNumber: order.orderNumber,
      type: "gym-bulk",
      total: subtotal,
    },
    checkoutUrl: session.url,
    sessionId: session.id,
  });
});
