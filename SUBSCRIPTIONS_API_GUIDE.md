# 📋 Subscription Management System - Complete API Guide

## Quick Start Setup

### 1. Install Required Dependencies
```bash
npm install node-cron
```

### 2. Add to server.js
Add this line in `server.js` after database connection:
```javascript
const { initializeSchedulers } = require("./jobs/scheduler");
initializeSchedulers();
```

### 3. Verify Database Indexes
The system uses MongoDB indexes. Run these commands in MongoDB shell:
```javascript
db.plans.createIndex({ type: 1 });
db.subscriptions.createIndex({ user: 1 }, { unique: true });
db.subscriptions.createIndex({ plan: 1 });
db.subscriptions.createIndex({ nextBillingDate: 1 });
db.recurringorders.createIndex({ subscription: 1, scheduledDate: 1 });
db.recurringorders.createIndex({ user: 1, status: 1 });
db.recurringorders.createIndex({ scheduledDate: 1, status: 1 });
```

---

## Admin API Endpoints

### Plans Management

#### POST /api/admin/plans
Create a new plan
```json
{
  "type": "weekly",
  "name": "Weekly Meal Plan",
  "description": "Mon-Fri delivery",
  "price": 47.50,
  "deliveryDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "status": "active"
}
```

#### GET /api/admin/plans
List all plans
```
Query params: ?type=weekly&status=active
```

#### GET /api/admin/plans/:id
Get single plan details

#### PATCH /api/admin/plans/:id
Update plan
```json
{
  "price": 50.00,
  "status": "active"
}
```

#### DELETE /api/admin/plans/:id
Deactivate plan (soft delete)

---

### Subscriptions Management

#### GET /api/admin/subscriptions
List all subscriptions
```
Query params: ?page=1&limit=25&status=active&planType=weekly
```

#### GET /api/admin/subscriptions/:id
Get subscription details with billing history and upcoming orders

#### GET /api/admin/subscription-orders
List all orders generated from subscriptions
```
Query params: ?from=2026-07-28&to=2026-08-04
```

#### GET /api/admin/billing/report
Get billing analytics
```
Query params: ?from=2026-07-28&to=2026-08-04
```

---

## User API Endpoints

### Browse & Select Plans

#### GET /api/subscriptions/available-plans
Get all active plans available to users
**No authentication required**

#### POST /api/subscriptions/select-plan
Select a plan and get payment details
```json
{
  "planId": "6a68...",
  "patternId": "pattern-1"
}
```
**Requires authentication**

---

### Checkout & Create Subscription

#### POST /api/subscriptions/checkout
Complete payment and create subscription
```json
{
  "planId": "6a68...",
  "patternId": "pattern-1",
  "paymentIntentId": "pi_..."
}
```
**Requires authentication**

---

### View & Manage Subscription

#### GET /api/subscriptions/my-plan
Get current subscription + billing history + upcoming orders
**Requires authentication**

#### GET /api/subscriptions/upcoming-orders
Get next 4 weeks of scheduled orders
```
Query params: ?weeks=4
```
**Requires authentication**

#### POST /api/subscriptions/pause
Pause subscription from a specific date
```json
{
  "startDate": "2026-08-11",
  "reason": "Vacation"
}
```
**Requires authentication**

#### POST /api/subscriptions/resume
Resume paused subscription
**Requires authentication**

---

## Database Models

### Plan Model
```javascript
{
  _id: ObjectId,
  type: "weekly" | "one-off",
  name: String,
  description: String,
  price: Number,
  deliveryDays: [String],  // ["Mon", "Tue", ...]
  patterns: [{
    id: String,
    name: String,
    days: [String]
  }],
  status: "active" | "inactive",
  createdAt: Date,
  updatedAt: Date
}
```

### Subscription Model
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  plan: ObjectId (ref: Plan),
  planType: "weekly" | "one-off",
  planName: String,
  price: Number,
  selectedDays: [String],
  selectedPattern: String,
  status: "active" | "paused",
  startDate: Date,
  nextBillingDate: Date,
  pausedFrom: Date,
  stripeSubscriptionId: String,
  totalCharges: Number,
  billingHistory: [{
    date: Date,
    amount: Number,
    status: "succeeded" | "failed" | "pending",
    stripeChargeId: String,
    errorMessage: String
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### RecurringOrder Model
```javascript
{
  _id: ObjectId,
  subscription: ObjectId (ref: Subscription),
  user: ObjectId (ref: User),
  scheduledDate: Date,
  dayOfWeek: String,
  status: "scheduled" | "created" | "delivered" | "cancelled",
  actualOrderId: ObjectId (ref: Order),
  price: Number,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Scheduled Jobs

### Job 1: Generate Weekly Recurring Orders
- **When**: Every Sunday at 8 PM
- **What**: Creates 28 RecurringOrder docs (4 weeks × subscription days)
- **File**: `jobs/subscriptionJobs.js` → `generateWeeklyRecurringOrders()`

### Job 2: Create Daily Orders
- **When**: Every day at 6 AM
- **What**: Creates actual Order docs from RecurringOrders scheduled for today
- **File**: `jobs/subscriptionJobs.js` → `createOrdersFromSchedule()`

### Job 3: Auto-Charge Subscriptions
- **When**: Every Monday at 1 AM
- **What**: Charges users via Stripe for the next week
- **File**: `jobs/subscriptionJobs.js` → `chargeSubscriptions()`

### Job 4: Resume Paused Subscriptions
- **When**: Every day at 1 AM
- **What**: Reactivates subscriptions that reach their pause end date
- **File**: `jobs/subscriptionJobs.js` → `resumePausedSubscriptions()`

---

## Stripe Integration

### One-Time Charge (Checkout)
Used when user selects and pays for a subscription
```javascript
stripe.paymentIntents.create({
  amount: price * 100,
  currency: "gbp",
  automatic_payment_methods: { enabled: true }
})
```

### Weekly Recurring Charge
Used to auto-charge every Monday
```javascript
stripe.charges.create({
  amount: price * 100,
  currency: "gbp",
  customer: stripeCustomerId,
  metadata: { subscriptionId, userId }
})
```

---

## Error Handling

### Common Errors
- `"You already have an active subscription"` - User tries to create 2nd subscription
- `"Subscription not found"` - User has no active subscription
- `"Plan not found or inactive"` - Selected plan was deactivated
- `"Payment not completed"` - Stripe payment failed
- `"Invalid pattern selected"` - Pattern ID doesn't exist for one-off plans

---

## Testing Endpoints

### 1. Create a Plan (Admin)
```bash
curl -X POST http://localhost:5000/api/admin/plans \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "weekly",
    "name": "Weekly Plan",
    "price": 47.50,
    "deliveryDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "status": "active"
  }'
```

### 2. Get Available Plans (User)
```bash
curl http://localhost:5000/api/subscriptions/available-plans
```

### 3. Select a Plan (User)
```bash
curl -X POST http://localhost:5000/api/subscriptions/select-plan \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "<plan_id>",
    "patternId": null
  }'
```

### 4. Checkout (User)
```bash
curl -X POST http://localhost:5000/api/subscriptions/checkout \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "<plan_id>",
    "paymentIntentId": "<pi_...>"
  }'
```

---

## Notes for Admin Dashboard

1. **Plan Creation**: Admins create weekly or one-off plans with fixed patterns
2. **Subscription Viewing**: See all active subscriptions, billing history, and upcoming orders
3. **Reports**: View revenue, charges, failed payments by date range
4. **Order Tracking**: All orders generated from subscriptions are tracked separately
5. **No Cancellation**: Users can only pause, not cancel (as per requirements)

---

## Version
- Created: 2026-07-29
- Backend API v1.0
- Ready for Admin & User UI Integration
