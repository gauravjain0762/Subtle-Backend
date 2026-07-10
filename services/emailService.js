const transporter = require("../config/mailer");

const FROM = `"Subtle Kitchen" <${process.env.EMAIL_USER}>`;

const sendMail = async (options) => {
  try {
    await transporter.sendMail({ from: FROM, ...options });
  } catch (error) {
    console.error(`[emailService] Failed to send email to ${options.to}:`, error.message);
  }
};

const sendWorkspaceApprovedEmail = async (email, code) => {
  await sendMail({
    to: email,
    subject: "Your Subtle Kitchen workspace has been approved",
    text: `Good news — your workspace application has been approved!\n\nYour workspace code is: ${code}\n\nUse this code to sign up in the app.`,
  });
};

const sendWorkspaceRejectedEmail = async (email, reason) => {
  await sendMail({
    to: email,
    subject: "Update on your Subtle Kitchen workspace application",
    text: `We're sorry — your workspace application was not approved.\n\nReason: ${reason}`,
  });
};

const sendNewWorkspaceRequestAdminEmail = async ({ referenceId, workspaceName, contactName, contactEmail }) => {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) return;

  await sendMail({
    to: adminEmail,
    subject: `New workspace request: ${workspaceName} (${referenceId})`,
    text: `A new workspace application has been submitted.\n\nReference: ${referenceId}\nCompany: ${workspaceName}\nContact: ${contactName} <${contactEmail}>\n\nReview it in the admin panel.`,
  });
};

module.exports = {
  sendWorkspaceApprovedEmail,
  sendWorkspaceRejectedEmail,
  sendNewWorkspaceRequestAdminEmail,
};
