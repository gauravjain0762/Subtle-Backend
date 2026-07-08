const WorkspaceRequest = require("../models/WorkspaceRequest");
const Workspace = require("../models/Workspace");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const generateWorkspaceCode = require("../utils/generateWorkspaceCode");
const { sendWorkspaceApprovedEmail, sendWorkspaceRejectedEmail } = require("../services/emailService");

exports.listWorkspaceRequests = catchAsync(async (req, res) => {
  const { status } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);

  const filter = {};
  if (status && status !== "all") {
    filter.status = status;
  }

  const [requests, total] = await Promise.all([
    WorkspaceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    WorkspaceRequest.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    requests,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

exports.approveWorkspaceRequest = catchAsync(async (req, res) => {
  const request = await WorkspaceRequest.findById(req.params.id);
  if (!request) {
    throw new AppError("Workspace request not found", 404);
  }
  if (request.status !== "pending") {
    throw new AppError("Request has already been reviewed", 400);
  }

  let code = (req.body && (req.body.code || req.body.codeOverride)) || null;

  if (code) {
    code = code.trim().toUpperCase();
    const existing = await Workspace.findOne({ code });
    if (existing) {
      throw new AppError("Workspace code already in use", 409);
    }
  } else {
    code = await generateWorkspaceCode();
  }

  const workspace = await Workspace.create({
    code,
    name: request.workspace.name,
    address1: request.workspace.address1,
    town: request.workspace.town,
    city: request.workspace.city,
    postcode: request.workspace.postcode,
    country: request.workspace.country,
    deliveryTimes: request.workspace.deliveryTimes,
    employees: request.workspace.employees,
    premiseType: request.workspace.premiseType,
    contact: request.contact,
    status: "active",
  });

  request.status = "approved";
  await request.save();

  await sendWorkspaceApprovedEmail(request.contact.email, code);

  res.status(200).json({
    success: true,
    workspace,
    message: `Workspace approved. Code ${code} sent to ${request.contact.email}.`,
  });
});

exports.rejectWorkspaceRequest = catchAsync(async (req, res) => {
  const request = await WorkspaceRequest.findById(req.params.id);
  if (!request) {
    throw new AppError("Workspace request not found", 404);
  }
  if (request.status !== "pending") {
    throw new AppError("Request has already been reviewed", 400);
  }

  const reason = (req.body && req.body.reason) || "Not specified";

  request.status = "rejected";
  await request.save();

  await sendWorkspaceRejectedEmail(request.contact.email, reason);

  res.status(200).json({
    success: true,
    message: `Request rejected. Notification sent to ${request.contact.email}.`,
  });
});
