const express = require("express");
const adminProtect = require("../middleware/adminAuth");
const upload = require("../middleware/upload");

const { login } = require("../controllers/adminAuthController");
const {
  listWorkspaceRequests,
  approveWorkspaceRequest,
  rejectWorkspaceRequest,
  deleteWorkspaceRequest,
} = require("../controllers/adminWorkspaceRequestController");
const {
  listWorkspaces,
  updateWorkspaceStatus,
  deleteWorkspace,
} = require("../controllers/adminWorkspaceController");
const {
  listOrders,
  getOrder,
  updateOrderStatus,
  bulkUpdateStatus,
} = require("../controllers/adminOrderController");
const { publishMenu, assignDishesToDay, deleteMenu } = require("../controllers/adminMenuController");
const {
  createDish,
  listDishes,
  getDish,
  updateDish,
  setDishAvailability,
  deleteDish,
} = require("../controllers/adminDishController");
const {
  createPromoCode,
  listPromoCodes,
  updatePromoCode,
  deletePromoCode,
} = require("../controllers/adminPromoController");

const router = express.Router();

router.post("/auth/login", login);

router.use(adminProtect);

router.get("/workspace-requests", listWorkspaceRequests);
router.post("/workspace-requests/:id/approve", approveWorkspaceRequest);
router.post("/workspace-requests/:id/reject", rejectWorkspaceRequest);
router.delete("/workspace-requests/:id", deleteWorkspaceRequest);

router.get("/workspaces", listWorkspaces);
router.patch("/workspaces/:id", updateWorkspaceStatus);
router.delete("/workspaces/:id", deleteWorkspace);

router.get("/orders", listOrders);
router.get("/orders/:id", getOrder);
router.patch("/orders/bulk-status", bulkUpdateStatus);
router.patch("/orders/:id/status", updateOrderStatus);

router.post("/dishes", upload.array("images", 5), createDish);
router.get("/dishes", listDishes);
router.get("/dishes/:id", getDish);
router.patch("/dishes/:id", upload.array("images", 5), updateDish);
router.patch("/dishes/:id/availability", setDishAvailability);
router.delete("/dishes/:id", deleteDish);

router.put("/menu", publishMenu);
router.patch("/menu/:weekStart/days/:day/dishes", assignDishesToDay);
router.delete("/menu/:weekStart", deleteMenu);

router.post("/promo-codes", createPromoCode);
router.get("/promo-codes", listPromoCodes);
router.patch("/promo-codes/:id", updatePromoCode);
router.delete("/promo-codes/:id", deletePromoCode);

module.exports = router;
