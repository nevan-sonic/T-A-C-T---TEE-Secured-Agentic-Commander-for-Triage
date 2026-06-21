const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const pk = process.env.T3_PRIVATE_KEY || process.env.T3N_API_KEY || ethers.Wallet.createRandom().privateKey;
const wallet = new ethers.Wallet(pk);
console.log("Derived Address:", wallet.address);
