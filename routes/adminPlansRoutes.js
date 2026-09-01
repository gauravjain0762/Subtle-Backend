const express = require("express");
const adminProtect = require("../middleware/adminAuth");
const {
  createPlan,
  listPlans,
  getPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/adminPlansController");

const router = express.Router();

router.use(adminProtect);

router.post("/", createPlan);
router.get("/", listPlans);
router.get("/:id", getPlan);
router.patch("/:id", updatePlan);
router.delete("/:id", deletePlan);

module.exports = router;
