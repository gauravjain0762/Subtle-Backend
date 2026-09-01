const Subscription = require("../models/Subscription");
const Order = require("../models/Order");
const { generateDailyRef } = require("../utils/generateRef");
const getNextSequence = require("../utils/getNextSequence");

// Helper: Get delivery dates for CURRENT BILLING CYCLE ONLY (first 7 days)
const getDeliveryDatesForCurrentWeek = (subscription) => {
  const dates = [];
  const startDate = new Date(subscription.startDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7); // Only 7 days ahead for current billing cycle

  const WEEKDAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (subscription.plan.type === "weekly") {
    // Weekly: Mon-Fri pattern
    let current = new Date(startDate);
    while (current < endDate) {
      const dayCode = WEEKDAY_CODES[current.getDay()];
      if (subscription.pattern.includes(dayCode)) {
        dates.push(toDateStr(current));
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (subscription.plan.type === "one-off") {
    // One-off: alternate days (only for first week)
    let current = new Date(startDate);
    let dayCount = 0;
    while (current < endDate) {
      const dayCode = WEEKDAY_CODES[current.getDay()];
      if (dayCount % 2 === 0) {
        const selectedPattern = subscription.pattern;
        if (selectedPattern.includes(dayCode)) {
          dates.push(toDateStr(current));
        }
      }
      current.setDate(current.getDate() + 1);
      dayCount++;
    }
  }

  return dates;
};

// Helper: Convert date to YYYY-MM-DD string
const toDateStr = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Helper: Check if date has passed (for cutoff logic)
const isPastCutoff = (deliveryDate) => {
  const CUTOFF_HOUR = 22;
  const [year, month, day] = deliveryDate.split("-").map(Number);
  const cutoff = new Date(year, month - 1, day - 1, CUTOFF_HOUR, 0, 0, 0);
  return new Date() > cutoff;
};

// Main function: Generate orders for all active subscriptions
const generateSubscriptionOrders = async () => {
  try {
    console.log("🔄 Starting subscription order generation...");

    // Find all active subscriptions
    const subscriptions = await Subscription.find({ status: "active" })
      .populate("plan")
      .populate("meal")
      .populate("user", "firstName lastName email workspaceCode")
      .populate("workspace");

    console.log(`📦 Found ${subscriptions.length} active subscriptions`);

    let generatedCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptions) {
      try {
        // Check if subscription is recurring (backwards compatible: default to true if missing)
        const isRecurring = subscription.isRecurring ?? true;
        if (!isRecurring) {
          console.log(`⏭️ Sub ${subscription._id}: Non-recurring, skipping order generation`);
          continue;
        }

        // Check if plan exists (might be deleted)
        if (!subscription.plan) {
          console.log(`⚠️ Sub ${subscription._id}: Plan not found, skipping`);
          errorCount++;
          continue;
        }

        // Get workspace info if not already set
        let workspaceId = subscription.workspace;
        let workspaceCode = subscription.workspaceCode;
        let workspaceName = subscription.workspaceName;

        if (!workspaceCode && subscription.user && subscription.user.workspaceCode) {
          const Workspace = require("../models/Workspace");
          const workspace = await Workspace.findOne({ code: subscription.user.workspaceCode.toUpperCase() });
          if (workspace) {
            workspaceId = workspace._id;
            workspaceCode = workspace.code;
            workspaceName = workspace.name;
          }
        }

        // Skip if no workspace info found
        if (!workspaceCode || !workspaceId) {
          console.log(`⚠️ Sub ${subscription._id}: No workspace info, skipping`);
          errorCount++;
          continue;
        }

        // Get delivery dates for CURRENT BILLING CYCLE ONLY (first week)
        const pattern = subscription.pattern || [];
        const items = subscription.items || [];
        const startDate = new Date(subscription.startDate);
        const deliveryDates = [];

        const dayIndices = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        const WEEKDAY_CODES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        // Generate dates for CURRENT WEEK ONLY
        let current = new Date(startDate);
        let itemIndex = 0;

        while (current < endDate && itemIndex < pattern.length) {
          const dayCode = WEEKDAY_CODES[current.getDay()];

          if (pattern.includes(dayCode)) {
            deliveryDates.push({
              date: current.toISOString().split('T')[0],
              dayName: dayCode,
              itemIndex: itemIndex,
            });
            itemIndex++;
          }

          current.setDate(current.getDate() + 1);
        }

        console.log(`📅 Generated ${deliveryDates.length} delivery dates for CURRENT WEEK ONLY (billing cycle)`);
        console.log(`⏳ Future weeks' orders will be created after next billing cycle payment succeeds`);

        // Filter out dates that already have orders
        const existingOrders = await Order.find({
          user: subscription.user._id || subscription.user,
          subscription: subscription._id,
          paymentMethod: "subscription",
          deliveryDate: { $in: deliveryDates.map((d) => d.date) },
        }).select("deliveryDate");

        const existingDates = new Set(existingOrders.map((o) => o.deliveryDate));
        const newDates = deliveryDates.filter((d) => !existingDates.has(d.date));

        if (newDates.length === 0) {
          console.log(`✓ Sub ${subscription._id}: No new dates to generate`);
          continue;
        }

        // Create orders for new delivery dates and collect them for consolidated email
        const createdOrders = [];
        const Dish = require("../models/Dish");

        for (const dateInfo of newDates) {
          const deliveryDate = dateInfo.date;
          const itemIndex = dateInfo.itemIndex;

          // Skip past cutoff dates
          if (isPastCutoff(deliveryDate)) {
            console.log(`⏸️ Sub ${subscription._id}: Skipping ${deliveryDate} (past cutoff)`);
            continue;
          }

          try {
            const item = items[itemIndex];
            if (!item) {
              console.warn(`⚠️ No item found for index ${itemIndex}`);
              errorCount++;
              continue;
            }

            const dateStr = deliveryDate.replace(/-/g, "");
            const orderRef = await generateDailyRef(Order, "orderRef", "SK", dateStr);
            const orderNumber = `ORD-${await getNextSequence("orderNumber")}`;

            const totalPrice = Number(item.mealPrice) * item.quantity;

            // Fetch meal details
            const dish = await Dish.findById(item.mealId);

            if (!dish) {
              console.warn(`⚠️ Dish not found: ${item.mealId}`);
              errorCount++;
              continue;
            }

            const order = await Order.create({
              orderRef,
              orderNumber,
              user: subscription.user._id || subscription.user,
              subscription: subscription._id,
              workspace: workspaceId,
              workspaceCode: workspaceCode,
              workspaceName: workspaceName,
              deliveryDate,
              lunchTime: "12:00 PM",
              items: [
                {
                  dishId: dish._id,
                  dishName: dish.name,
                  portionSize: "Regular",
                  qty: item.quantity,
                  addons: [],
                  unitPrice: item.mealPrice,
                  images: dish.images || [],
                },
              ],
              subtotal: totalPrice,
              total: totalPrice,
              planType: subscription.plan.type,
              paymentMethod: "subscription",
              paid: true,
              status: "new",
            });

            generatedCount++;
            console.log(`✅ Created order ${orderNumber} for ${deliveryDate} (${dateInfo.dayName}): ${dish.name}`);

            // Collect order for consolidated email
            createdOrders.push({
              orderNumber,
              deliveryDate,
              dayName: dateInfo.dayName,
              dishName: dish.name,
              quantity: item.quantity,
              unitPrice: item.mealPrice,
              totalPrice,
            });

            // Create admin notification for generated order
            try {
              const Notification = require("../models/Notification");
              const userName = subscription.user.firstName ? `${subscription.user.firstName} ${subscription.user.lastName}` : subscription.user.email;

              await Notification.create({
                type: "order_generated",
                title: `Order Generated - ${userName}`,
                message: `New subscription order ${orderNumber} for ${deliveryDate}: ${dish.name}`,
                data: {
                  orderId: order._id,
                  orderNumber: orderNumber,
                  subscriptionId: subscription._id,
                  userId: subscription.user._id || subscription.user,
                  customerName: userName,
                  contactEmail: subscription.user.email,
                  orderTotal: totalPrice,
                  planType: subscription.plan.type,
                  planName: subscription.plan.name,
                },
                read: false,
              });
            } catch (notifyError) {
              console.error(`⚠️ Failed to create notification for order ${orderNumber}:`, notifyError.message);
            }
          } catch (error) {
            errorCount++;
            console.error(`❌ Failed to create order for ${deliveryDate}:`, error.message);
          }
        }

        // Send consolidated admin email with all orders for this subscription
        if (createdOrders.length > 0) {
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

              const userName = subscription.user.firstName ? `${subscription.user.firstName} ${subscription.user.lastName}` : subscription.user.email;
              const userEmail = subscription.user.email || "N/A";
              const totalOrderAmount = createdOrders.reduce((sum, o) => sum + o.totalPrice, 0);

              // Build meal details table rows
              const mealRows = createdOrders.map(order => `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                  <td style="padding: 10px; text-align: left;">${order.dayName}, ${new Date(order.deliveryDate).toLocaleDateString()}</td>
                  <td style="padding: 10px; text-align: left;">${order.dishName}</td>
                  <td style="padding: 10px; text-align: center;">${order.quantity}</td>
                  <td style="padding: 10px; text-align: right;">£${order.unitPrice.toFixed(2)}</td>
                  <td style="padding: 10px; text-align: right;">£${order.totalPrice.toFixed(2)}</td>
                </tr>
              `).join('');

              const emailHTML = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <div style="border-left: 4px solid #2196F3; padding-left: 15px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #2196F3;">📦 New Subscription Orders Generated</h2>
                    <p style="margin: 5px 0; font-size: 14px; color: #666;">Automatic recurring orders created for this billing cycle</p>
                  </div>

                  <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
                    <h3 style="margin-top: 0;">CUSTOMER DETAILS</h3>
                    <p><strong>Name:</strong> ${userName}</p>
                    <p><strong>Email:</strong> ${userEmail}</p>
                    <p><strong>Company Code:</strong> ${workspaceCode}</p>
                  </div>

                  <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
                    <h3 style="margin-top: 0;">ORDER DETAILS</h3>
                    <p><strong>Total Orders in Cycle:</strong> ${createdOrders.length}</p>
                    <p><strong>Order Numbers:</strong> ${createdOrders.map(o => o.orderNumber).join(', ')}</p>
                    <p><strong>Delivery Dates:</strong> ${subscription.plan.type === 'weekly' ? 'Weekly deliveries for current billing cycle' : 'One-off delivery'}</p>
                  </div>

                  <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
                    <h3 style="margin-top: 0;">MEAL DETAILS</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <thead>
                        <tr style="background-color: #f0f0f0; border-bottom: 2px solid #2196F3;">
                          <th style="padding: 10px; text-align: left;">Delivery Date & Day</th>
                          <th style="padding: 10px; text-align: left;">Dish Name</th>
                          <th style="padding: 10px; text-align: center;">Quantity</th>
                          <th style="padding: 10px; text-align: right;">Unit Price</th>
                          <th style="padding: 10px; text-align: right;">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${mealRows}
                        <tr style="background-color: #f9f9f9; font-weight: bold; border-top: 2px solid #2196F3;">
                          <td colspan="4" style="padding: 10px; text-align: right;">Total Amount:</td>
                          <td style="padding: 10px; text-align: right; color: #2196F3;">£${totalOrderAmount.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style="border: 1px solid #e0e0e0; padding: 15px; margin: 15px 0; background: #f5f5f5;">
                    <h3 style="margin-top: 0;">SUBSCRIPTION DETAILS</h3>
                    <p><strong>Plan Name:</strong> ${subscription.plan.name}</p>
                    <p><strong>Plan Type:</strong> ${subscription.plan.type === "weekly" ? "Weekly" : "One-Off"}</p>
                  </div>

                  <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification from Subtle Kitchen admin system.</p>
                </div>
              `;

              await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: adminEmail,
                subject: `📦 ORDERS GENERATED: ${createdOrders.length} orders for ${userName} (${subscription.plan.name})`,
                html: emailHTML,
              });

              console.log(`✅ Consolidated admin email sent for ${createdOrders.length} orders`);
            }
          } catch (emailError) {
            console.error(`⚠️ Failed to send consolidated admin email:`, emailError.message);
          }
        }

        // Update subscription's lastOrderGenerationDate
        subscription.lastOrderGenerationDate = new Date();
        await subscription.save();
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing subscription ${subscription._id}:`, error.message);
      }
    }

    console.log(`✅ Order generation complete: ${generatedCount} created, ${errorCount} errors`);
    return { success: true, generated: generatedCount, errors: errorCount };
  } catch (error) {
    console.error("❌ Fatal error in generateSubscriptionOrders:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { generateSubscriptionOrders };
