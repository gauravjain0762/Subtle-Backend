const express = require("express");
const { createWorkspaceRequest, getWorkspaceByCode } = require("../controllers/workspaceController");

const router = express.Router();

router.post("/", createWorkspaceRequest);
router.get("/:code", getWorkspaceByCode);

module.exports = router;
