// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {

  // Contracts are deployed using the first signer/account by default
  const [owner, lossAccount_1, lossAccount_2] = await ethers.getSigners();
  const initialLossAccounts = [owner.address, lossAccount_1.address, lossAccount_2.address];

  const DaysInARow = await hre.ethers.getContractFactory("DaysInARow");
  const daysInARow = await DaysInARow.deploy(initialLossAccounts);

  await daysInARow.deployed();

  console.log("DaysInARow deployed to:", daysInARow.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
