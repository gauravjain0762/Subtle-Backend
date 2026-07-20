const bcrypt = require("bcryptjs");

const RESET_CODE_TTL_SECONDS = 600;

const generateResetCode = () => String(Math.floor(100000 + Math.random() * 900000));

const hashResetCode = async (code) => bcrypt.hash(code, 10);

const compareResetCode = async (code, hash) => bcrypt.compare(code, hash);

module.exports = { generateResetCode, hashResetCode, compareResetCode, RESET_CODE_TTL_SECONDS };
