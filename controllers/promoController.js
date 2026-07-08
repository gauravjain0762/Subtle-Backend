const catchAsync = require("../utils/catchAsync");
const validatePromoCode = require("../utils/validatePromoCode");

exports.validatePromo = catchAsync(async (req, res) => {
  const { code, workspaceCode } = req.body || {};

  const result = await validatePromoCode(code, workspaceCode);

  res.status(200).json(result);
});
