const WorkspaceRequest = require("../models/WorkspaceRequest");
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { isValidEmail } = require("../utils/validators");
const { isPostcodeInDeliveryArea } = require("../config/deliveryAreas");
const { generateDailyRef } = require("../utils/generateRef");

const todayCompact = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

exports.createWorkspaceRequest = catchAsync(async (req, res) => {
  const { workspace, contact } = req.body || {};
  const errors = {};

  if (!workspace || !workspace.name || !workspace.address1 || !workspace.city || !workspace.postcode || !workspace.country) {
    throw new AppError("Missing required workspace fields", 422, {
      workspace: "Workspace details are incomplete",
    });
  }

  if (!contact || !contact.firstName || !contact.lastName || !contact.email) {
    throw new AppError("Missing required contact fields", 422, {
      contact: "Contact details are incomplete",
    });
  }

  if (!isValidEmail(contact.email)) {
    errors.email = "Invalid email address";
  } else {
    const normalizedEmail = contact.email.trim().toLowerCase();
    const [existingUser, existingRequest] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      WorkspaceRequest.findOne({ "contact.email": normalizedEmail, status: { $ne: "rejected" } }),
    ]);
    if (existingUser || existingRequest) {
      errors.email = "This email is already registered";
    }
  }

  if (!isPostcodeInDeliveryArea(workspace.postcode)) {
    errors.postcode = "Outside our current delivery area";
  }

  if (Object.keys(errors).length > 0) {
    throw new AppError("Validation failed", 422, errors);
  }

  const referenceId = await generateDailyRef(WorkspaceRequest, "referenceId", "WS-REQ", todayCompact());

  await WorkspaceRequest.create({
    referenceId,
    workspace,
    contact: {
      ...contact,
      email: contact.email.trim().toLowerCase(),
    },
  });

  res.status(201).json({
    success: true,
    message: "Application received. We'll review and email your workspace code within 1–2 business days.",
    referenceId,
  });
});

exports.getWorkspaceByCode = catchAsync(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();

  const workspace = await Workspace.findOne({ code, status: "active" });

  if (!workspace) {
    throw new AppError("Workspace code not found or not yet activated", 404);
  }

  res.status(200).json({
    success: true,
    workspace: {
      code: workspace.code,
      name: workspace.name,
      town: workspace.town,
      city: workspace.city,
      deliveryTimes: workspace.deliveryTimes,
    },
  });
});
