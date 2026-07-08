const sendOtpEmail = async (email, otp) => {
  console.log(`[emailService] OTP for ${email}: ${otp} (valid 10 minutes)`);
};

const sendWorkspaceApprovedEmail = async (email, code) => {
  console.log(`[emailService] Workspace approved for ${email} — code: ${code}`);
};

const sendWorkspaceRejectedEmail = async (email, reason) => {
  console.log(`[emailService] Workspace request rejected for ${email} — reason: ${reason}`);
};

module.exports = { sendOtpEmail, sendWorkspaceApprovedEmail, sendWorkspaceRejectedEmail };
