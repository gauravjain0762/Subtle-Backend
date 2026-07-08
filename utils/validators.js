const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (email) => typeof email === "string" && EMAIL_REGEX.test(email.trim());

module.exports = { isValidEmail };
