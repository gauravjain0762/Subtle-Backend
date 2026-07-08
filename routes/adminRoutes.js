const express = require("express");
const adminProtect = require("../middleware/adminAuth");

const { login } = require("../controllers/adminAuthController");
const {
  listWorkspaceRequests,
  approveWorkspaceRequest,
  rejectWorkspaceRequest,
} = require("../controllers/adminWorkspaceRequestController");
const { listWorkspaces, updateWorkspaceStatus } = require("../controllers/adminWorkspaceController");
const { listOrders, updateOrderStatus } = require("../controllers/adminOrderController");
const { publishMenu } = require("../controllers/adminMenuController");

const router = express.Router();

router.post("/auth/login", login);

router.use(adminProtect);

router.get("/workspace-requests", listWorkspaceRequests);
router.post("/workspace-requests/:id/approve", approveWorkspaceRequest);
router.post("/workspace-requests/:id/reject", rejectWorkspaceRequest);

router.get("/workspaces", listWorkspaces);
router.patch("/workspaces/:id", updateWorkspaceStatus);

router.get("/orders", listOrders);
router.patch("/orders/:id/status", updateOrderStatus);

router.put("/menu", publishMenu);

module.exports = router;
