const generateDailyRef = async (Model, field, prefix, dateStr) => {
  const regex = new RegExp(`^${prefix}-${dateStr}-`);
  const count = await Model.countDocuments({ [field]: regex });
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}-${dateStr}-${seq}`;
};

module.exports = { generateDailyRef };
