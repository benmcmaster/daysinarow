# Days in a Row

See it live at https://www.daysinarow.io/

This was built from a sample hardhat project.

Contract: DaysInRow.sol
Test: test/DaysInARow.js (`npx hardhat test`)

Utility Scripts
1. Deploy: scripts/deploy.js
   Example: `npx hardhat run --network sepolia scripts/deploy.js`
  
2. nextDay: scripts/nextDay.js (advances the time of the Hardhat blockchain by one day)
   Example: `npx hardhat run --network localhost scripts/nextDay.js`
   
4. mine: scripts/mine.js (mines a block to set the correct blocktime)
   Example: `npx hardhat run --network localhost scripts/mine.js`

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.js
```
