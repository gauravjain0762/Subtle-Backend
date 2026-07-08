const Workspace = require("../models/Workspace");

const generateWorkspaceCode = async () => {
  const year = new Date().getFullYear();
  let seq = await Workspace.countDocuments({ code: new RegExp(`^SK-${year}-`) });

  let code;
  let exists = true;
  while (exists) {
    seq += 1;
    code = `SK-${year}-${String(seq).padStart(4, "0")}`;
    exists = await Workspace.exists({ code });
  }

  return code;
};

module.exports = generateWorkspaceCode;
