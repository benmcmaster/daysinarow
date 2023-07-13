const {
    time,
} = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    await time.increase(86400); // Increase time by 1 day
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});