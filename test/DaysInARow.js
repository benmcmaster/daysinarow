const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { BigNumber } = ethers;

describe("DaysInARow", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployDaysInARowFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, lossAccount_1, lossAccount_2, testUser1, testUser2] = await ethers.getSigners();
        const initialLossAccounts = [owner.address, lossAccount_1.address, lossAccount_2.address];

        const DaysInARow = await hre.ethers.getContractFactory("DaysInARow");
        const daysInARow = await DaysInARow.deploy(initialLossAccounts);

        await daysInARow.deployed();

        return { daysInARow, owner, initialLossAccounts, lossAccount_1, lossAccount_2, testUser1, testUser2 };
    }

    async function deployDaysInARowCreateCommitmentFixture() {
        const { daysInARow, owner, initialLossAccounts, lossAccount_1, lossAccount_2, testUser1, testUser2 } = await loadFixture(deployDaysInARowFixture);

        // User creates a commitment for 7 days
        const targetDays = 7;
        const lossAccountIndex = 1; // lossAccount_1
        const startDateUnixTimestamp = await getStartDateUnixTimestamp();
        const habitTitle = "Test Commitment";
        const value = ethers.utils.parseEther("1");

        // set the rake to 250 basis points
        const rakeBasisPoints = 250;
        await daysInARow.setRakeBasisPoints(rakeBasisPoints);
        
        // calculate the rake amount
        const expectedRakeAmount = value.mul(rakeBasisPoints).div(10000);

        await daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value });

        const commitmentId = 0; // we expect this to be the first commitment created

        return { 
            daysInARow, 
            value, 
            expectedRakeAmount, 
            lossAccountIndex, 
            commitmentId, 
            habitTitle, 
            targetDays, 
            owner, 
            startDateUnixTimestamp, 
            initialLossAccounts, 
            lossAccount_1, 
            lossAccount_2, 
            testUser1, 
            testUser2 
        };
    }

    async function getStartDateUnixTimestamp() {
        // startDate is tonight at midnight local time
        // const startDate = new Date();

        // get the system time of the current hardhat time object
        const systemTime = await time.latest();
        // console.log("getStartDateUnixTimestamp: systemTime: ", systemTime);

        // convert system time to javascript date object
        const startDate = new Date(systemTime * 1000);

        startDate.setHours(0, 0, 0, 0);
        // console log start date in local time
        // console.log("getStartDateUnixTimestamp: startDate: ", startDate.toLocaleString());

        startDate.setDate(startDate.getDate() + 1);
        // format start date as unix timestamp
        return Math.floor(startDate.getTime() / 1000);
    }

    describe("Deployment", function () {
        it("Should set the loss accounts", async function () {
            const { daysInARow, initialLossAccounts } = await loadFixture(deployDaysInARowFixture);

            const lossAccounts = await daysInARow.getLossAccounts();

            //Create an array of loss account addresses
            const lossAccountAddressArray = [];
            for (let i = 0; i < lossAccounts.length; i++) {
                lossAccountAddressArray.push(lossAccounts[i].accountAddress);
            }

            expect(lossAccountAddressArray).to.eql(initialLossAccounts);
        });

        it("Should add a new loss account correctly", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            const newLossAccount = testUser1.address;
            await daysInARow.addLossAccount(newLossAccount);

            const lossAccounts = await daysInARow.getLossAccounts();

            // loop through lossAccounts to make sure the new loss account was added
            let found = false;
            for (let i = 0; i < lossAccounts.length; i++) {
                if (lossAccounts[i].accountAddress === newLossAccount) {
                    found = true;
                    break;
                }
            }
            expect(found).to.equal(true);
        });

        it("Should remove a loss account correctly", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            const newLossAccount = testUser1.address;

            // add the new loss account
            await daysInARow.addLossAccount(newLossAccount);

            // remove the new loss account
            await daysInARow.removeLossAccount(newLossAccount);

            const lossAccounts = await daysInARow.getLossAccounts();

            // loop through lossAccounts to make sure the new loss account was removed
            let found = false;
            for (let i = 0; i < lossAccounts.length; i++) {
                if (lossAccounts[i].accountAddress === newLossAccount) {
                    found = true;
                    break;
                }
            }
            expect(found).to.equal(false);
        });

        it("Should set the right owner", async function () {
            const { daysInARow, owner } = await loadFixture(deployDaysInARowFixture);

            expect(await daysInARow.owner()).to.equal(owner.address);
        });

        it("Should set the rake correctly", async function () {
            const { daysInARow } = await loadFixture(deployDaysInARowFixture);

            const rakeBasisPoints = 250;
            await daysInARow.setRakeBasisPoints(rakeBasisPoints);

            expect(await daysInARow.rakeBasisPoints()).to.equal(rakeBasisPoints);
        });

        it("Should only let owner set rake", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            const rakeBasisPoints = 250;

            // should revert because testUser1 is not the owner
            await expect(daysInARow.connect(testUser1).setRakeBasisPoints(rakeBasisPoints)).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should set the treasury address correctly", async function () {
            const { daysInARow, testUser2 } = await loadFixture(deployDaysInARowFixture);

            const treasuryAddress = testUser2.address;
            await daysInARow.setTreasury(treasuryAddress);

            expect(await daysInARow.treasury()).to.equal(treasuryAddress);
        });


        it("Should only let owner set the treasury", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            const treasuryAddress = testUser1.address;

            // should revert because testUser1 is not the owner
            await expect(daysInARow.connect(testUser1).setTreasury(treasuryAddress)).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Create Commitment", function () {
        it("Should create a commitment with correct values", async function () {
            const { daysInARow, value, expectedRakeAmount, commitmentId, lossAccountIndex, habitTitle, targetDays, startDateUnixTimestamp, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            const commitment = await daysInARow.commitments(commitmentId);

            expect(commitment.user).to.equal(testUser1.address);
            expect(commitment.deposit).to.equal(value);
            expect(commitment.fee).to.equal(expectedRakeAmount);
            expect(commitment.targetDays).to.equal(targetDays);
            expect(commitment.checkedInDays).to.equal(0);
            expect(commitment.completed).to.equal(false);
            expect(commitment.failed).to.equal(false);
            expect(commitment.lossAccountIndex).to.equal(lossAccountIndex);
            expect(commitment.startDate).to.equal(startDateUnixTimestamp);
            expect(commitment.habitTitle).to.equal(habitTitle);
        });

        it("Should fail if no deposit is provided", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // User creates a commitment with 0 deposit
            const value = 0;
            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";

            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Deposit is required");
        });

        it("Should fail if no habit is provided", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // User creates a commitment with no habit title
            const value = ethers.utils.parseEther("1");
            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "";

            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Habit Title cannot be empty");
        });

        it("Should fail if target days is zero", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // User creates a commitment for 0 days
            const targetDays = 0;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";
            const value = ethers.utils.parseEther("1");
            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Target days must be greater than 0");
        });

        it("Should fail if invalid loss account index is provided", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // User creates a commitment with invalid loss account index
            const targetDays = 7;
            const lossAccountIndex = 3;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";
            const value = ethers.utils.parseEther("1");
            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Invalid loss account index");
        });

        it("Should fail if invalid habit title is provided", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // User creates a commitment with invalid habit title;
            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "";
            const value = ethers.utils.parseEther("1");
            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Habit Title cannot be empty");
        });

        it("Should take the correct rake", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            // set the rake to 2.5% or 250 basis points
            const rakeBasisPoints = 250;
            await daysInARow.setRakeBasisPoints(rakeBasisPoints);

            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";
            const value = ethers.utils.parseEther("1");
            const commitmentId = 0; // first commitment

            // check the treasury balance to make sure the rake was transferred
            const treasuryAddress = await daysInARow.treasury();
            const initialTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);

            await daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value });

            // check to make sure that the rake was set correctly
            const commitment = await daysInARow.commitments(commitmentId);

            // calculate the expected rake
            const expectedRake = value.mul(rakeBasisPoints).div(10000);
            expect(commitment.fee).to.equal(expectedRake);

            // check the treasury balance to make sure the rake was transferred
            const finalTreasuryBalance = await ethers.provider.getBalance(treasuryAddress);

            // check to make sure that the rake was taken
            expect(finalTreasuryBalance.sub(initialTreasuryBalance)).to.equal(expectedRake);
        });

        it("Should emit CommitmentCreated event", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";
            const value = ethers.utils.parseEther("1");
            const commitmentId = 0; // first commitment

            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.emit(daysInARow, "CommitmentCreated").withArgs(testUser1.address, commitmentId);
        });

        it("Should revert when the contract is paused", async function() {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowFixture);

            await daysInARow.pause();

            const targetDays = 7;
            const lossAccountIndex = 1;
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle = "Test Commitment";
            const value = ethers.utils.parseEther("1");

            await expect(daysInARow.connect(testUser1).createCommitment(targetDays, lossAccountIndex, startDateUnixTimestamp, habitTitle, { value }))
                .to.be.revertedWith("Pausable: paused");
        });
    });
    describe("Checkin", function () {
        it('Should not allow someone else to check in for a user', async function () {
            const { daysInARow, commitmentId, owner } = await loadFixture(deployDaysInARowCreateCommitmentFixture);
            await expect(daysInARow.connect(owner).checkIn(commitmentId)).to.be.revertedWith('Only the user can check in');
        });

        it('Should not allow a user to check before the start date', async function () {
            const { daysInARow, commitmentId, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId)).to.be.revertedWith("You can't check in before the start date");
        });

        it('Should not allow a user to check in if the commitment has already been completed', async function () {
            const { daysInARow, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId)).to.be.revertedWith('Commitment already completed');
        });

        it("Should emit Checkin event", async function () {
            const { daysInARow, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            await time.increase(86400); // Increase time by 1 day
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId))
                .to.emit(daysInARow, "CheckIn")
                .withArgs(testUser1.address, commitmentId);
        });

        it('Should not allow a user to check in if the commitment has already failed', async function () {
            const { daysInARow, commitmentId, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            // Increase time by 2 days
            await time.increase(86400 * 2);

            // check in too late... this will set to failed
            await daysInARow.connect(testUser1).checkIn(commitmentId);

            // check in again after failure
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId)).to.be.revertedWith('Commitment already failed');
        });

        it('Should emit a commitment failed event', async function () {
            const { daysInARow, commitmentId, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            // Increase time by 2 days
            await time.increase(86400 * 2);

            // This checkin will fail and emit a CommitmentFailed event
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId)).to.emit(daysInARow, "CommitmentFailed").withArgs(testUser1.address, commitmentId);
        });

        it('Should mark the commitment as completed if user checks in for the target number of days', async function () {
            const { daysInARow, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }

            const commitment = await daysInARow.commitments(commitmentId);
            expect(commitment.completed).to.equal(true);
        });

        it('Should emit a completed event', async function () {
            const { daysInARow, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays - 1; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }

            await time.increase(86400); // Increase time by 1 day
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId))
                .to.emit(daysInARow, "CommitmentCompleted")
                .withArgs(testUser1.address, commitmentId);
        });

        it('Should transfer the deposit to the loss account if the commitment fails', async function () {
            const { daysInARow, lossAccountIndex, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            // Increase time by 2 days
            await time.increase(86400 * 2);

            // get the balance of loss account before checkin
            const lossAccountAddress = await daysInARow.lossAccounts(lossAccountIndex);
            const lossAccountInitialBalance = await ethers.provider.getBalance(lossAccountAddress);

            // This checkin will fail and transfer the deposit to the loss account
            await daysInARow.connect(testUser1).checkIn(commitmentId);

            // get the balance of loss account after checkin
            const lossAccountFinalBalance = await ethers.provider.getBalance(lossAccountAddress);

            const commitment = await daysInARow.commitments(commitmentId);

            // expected final balance
            const expectedFinalBalance = lossAccountInitialBalance.add(commitment.deposit).sub(commitment.fee);

            expect(lossAccountFinalBalance).to.equal(expectedFinalBalance);
        });

        it('Should transfer the deposit back to the user if the commitment is completed successfully', async function () {
            const { daysInARow, value, expectedRakeAmount, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays - 1; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }

            await time.increase(86400); // Increase time by 1 day

            const testUser1InitialBalance = await ethers.provider.getBalance(testUser1.address);
            const gasPrice = ethers.utils.parseUnits('1', 'gwei');
            const tx = await daysInARow.connect(testUser1).checkIn(commitmentId, { gasPrice });
            const txReceipt = await tx.wait();
            const gasUsed = txReceipt.cumulativeGasUsed.mul(txReceipt.effectiveGasPrice);
            const userFinalBalance = await ethers.provider.getBalance(testUser1.address);
            const expectedFinalBalance = testUser1InitialBalance.sub(gasUsed).add(value).sub(expectedRakeAmount);

            expect(expectedFinalBalance).to.equal(userFinalBalance);
        });

        it("Should revert when the contract is paused", async function() {
            const { daysInARow, commitmentId, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            await daysInARow.pause();

            await expect(daysInARow.connect(testUser1).checkIn(commitmentId)).to.be.revertedWith("Pausable: paused");
        });
    });
    describe("Finalize Commitment", function () {
        it("Should revert when commitment is still active", async function () {
            const { daysInARow, value, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            await time.increase(86400); // Increase time by 1 day
            await expect(daysInARow.finalizeCommitment(commitmentId)).to.be.revertedWith("This commitment is still active");
        });

        it("Should revert when commitment is still active up to the last second", async function () {
            const { daysInARow, value, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            // get the number of seconds from now until 12:00 AM tomorrow using javascript date functions
            const now = new Date();
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const secondsUntilTomorrow = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

            await time.increase(86400 + secondsUntilTomorrow - 1); // Increase time by 1 day and the number of seconds until 12:00 AM tomorrow
            await expect(daysInARow.finalizeCommitment(commitmentId)).to.be.revertedWith("This commitment is still active");
        });

        it("Should revert when commitment has already failed", async function () {
            const { daysInARow, value, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);
            await time.increase(86400 * 2); // Increase time by 2 days to fail the commitment

            await daysInARow.finalizeCommitment(commitmentId); // This should cause the commitment to fail
            await expect(daysInARow.finalizeCommitment(commitmentId)).to.be.revertedWith("Commitment already failed");
        });

        it("Should revert when commitment has already been completed", async function () {
            const { daysInARow, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }

            const commitment = await daysInARow.commitments(commitmentId);
            expect(commitment.completed).to.equal(true);

            await expect(daysInARow.finalizeCommitment(commitmentId)).to.be.revertedWith("Commitment already completed");
        });

        it("Should finalize and fail the commitment when it has been abandoned", async function () {
            const { daysInARow, value, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);
            await time.increase(86400 * 3); // Increase time by 3 days to fail the commitment

            await expect(daysInARow.finalizeCommitment(commitmentId))
                .to.emit(daysInARow, 'CommitmentFailed')
                .withArgs(testUser1.address, 0);

            const commitment = await daysInARow.commitments(commitmentId);
            expect(commitment.failed).to.equal(true);
        });

        it("Should finalize and fail the commitment when it is 20 seconds late", async function () {
            const { daysInARow, value, commitmentId, testUser1, targetDays } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            // get the number of seconds from now until 12:00 AM tomorrow using javascript date functions
            const now = new Date();
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const secondsUntilTomorrow = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

            await time.increase(86400 + secondsUntilTomorrow + 20); // Increase time by 1 day and the number of seconds until 12:00 AM tomorrow plus 2 seconds
            await expect(daysInARow.finalizeCommitment(commitmentId))
                .to.emit(daysInARow, 'CommitmentFailed')
                .withArgs(testUser1.address, 0);

            const commitment = await daysInARow.commitments(commitmentId);
            expect(commitment.failed).to.equal(true);
        });
        it("Should revert when the contract is paused", async function() {
            const { daysInARow, commitmentId, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            await daysInARow.pause();

            await expect(daysInARow.finalizeCommitment(commitmentId)).to.be.revertedWith("Pausable: paused");
        });
    });
    describe("Claim All", function () {

        async function createMultipleCommitmentsFixture() {
            const { daysInARow, owner, initialLossAccounts, lossAccount_1, lossAccount_2, testUser1, testUser2 } = await loadFixture(deployDaysInARowFixture);

            // set the rake to 2.5% or 250 basis points
            const rakeBasisPoints = 250;
            await daysInARow.setRakeBasisPoints(rakeBasisPoints);

            const targetDays1 = 3; // User creates a commitment for 3 days
            const lossAccountIndex = 1; // lossAccount_1
            const startDateUnixTimestamp = await getStartDateUnixTimestamp();
            const habitTitle1 = "Test Commitment 1";
            const value = ethers.utils.parseEther("1");

            await daysInARow.connect(testUser1).createCommitment(targetDays1, lossAccountIndex, startDateUnixTimestamp, habitTitle1, { value });
            const commitmentID1 = 0; // we expect this to be the first commitment created

            const targetDays2 = 4; // User creates a commitment for 4 days
            const habitTitle2 = "Test Commitment 2";
            await daysInARow.connect(testUser2).createCommitment(targetDays2, lossAccountIndex, startDateUnixTimestamp, habitTitle2, { value });
            const commitmentID2 = 1; // we expect this to be the second commitment created

            // expected total rake amount
            const expectedTotalRakeAmount = value.mul(rakeBasisPoints).div(10000).mul(2);

            return {
                daysInARow,
                value,
                expectedTotalRakeAmount,
                lossAccountIndex,
                commitmentID1,
                commitmentID2,
                habitTitle1,
                habitTitle2,
                targetDays1,
                targetDays2,
                owner,
                startDateUnixTimestamp,
                initialLossAccounts,
                lossAccount_1,
                lossAccount_2,
                testUser1,
                testUser2
            };
        }

        it("Should claim all abandoned commitments", async function () {
            const { daysInARow, value, expectedTotalRakeAmount, lossAccount_1 } = await loadFixture(createMultipleCommitmentsFixture);

            await time.increase(86400 * 6); // Increase time by 6 days to abandon the commitments

            const expectedTotalDeposit = value.mul(2);

            const initialLossAccountBalance = await ethers.provider.getBalance(lossAccount_1.address);

            const gasPrice = ethers.utils.parseUnits('1', 'gwei');
            const tx = await daysInARow.connect(lossAccount_1).claimAll({ gasPrice });

            const txReceipt = await tx.wait();
            const gasUsed = txReceipt.cumulativeGasUsed.mul(txReceipt.effectiveGasPrice);

            const expectedTotalAccountBalance = initialLossAccountBalance.add(expectedTotalDeposit).sub(gasUsed).sub(expectedTotalRakeAmount);
            const finalLossAccountBalance = await ethers.provider.getBalance(lossAccount_1.address);

            expect(finalLossAccountBalance).to.equal(expectedTotalAccountBalance);
        });

        it("Should emit a claim event", async function () {
            const { daysInARow, commitmentID1, commitmentID2, value, expectedTotalRakeAmount, lossAccount_1 } = await loadFixture(createMultipleCommitmentsFixture);

            await time.increase(86400 * 3); // Increase time by 3 days to abandon the commitments

            const expectedTotalDeposit = value.mul(2).sub(expectedTotalRakeAmount);

            await expect(daysInARow.connect(lossAccount_1).claimAll())
                .to.emit(daysInARow, "Claimed")
                .withArgs(lossAccount_1.address, expectedTotalDeposit);
        });

        it("Should not claim active commitments", async function () {
            const { daysInARow, commitmentID1, commitmentID2, lossAccount_1} = await loadFixture(createMultipleCommitmentsFixture);

            await time.increase(86400 * 1); // Increase time by 1 days. Commitments are still active

            await expect(daysInARow.connect(lossAccount_1).claimAll()).to.be.revertedWith("No commitments to claim");
        });

        it("Should not claim completed commitments", async function () {
            const { daysInARow, commitmentId, testUser1, targetDays, lossAccount_1} = await loadFixture(deployDaysInARowCreateCommitmentFixture);

            for (let i = 0; i < targetDays - 1; i++) {
                await time.increase(86400); // Increase time by 1 day
                await daysInARow.connect(testUser1).checkIn(commitmentId);
            }

            await time.increase(86400); // Increase time by 1 day
            await expect(daysInARow.connect(testUser1).checkIn(commitmentId));

            await expect(daysInARow.connect(lossAccount_1).claimAll()).to.be.revertedWith("No commitments to claim");
        });

        it("Should revert when non-loss account calls claimAll", async function () {
            const { daysInARow, testUser1 } = await loadFixture(deployDaysInARowCreateCommitmentFixture);
            
            await expect(daysInARow.connect(testUser1).claimAll()).to.be.revertedWith("Only the loss account can claim");
        });

        it("Should revert when the contract is paused", async function() {
            const { daysInARow, lossAccount_1 } = await loadFixture(createMultipleCommitmentsFixture);

            await daysInARow.pause();

            await expect(daysInARow.connect(lossAccount_1).claimAll()).to.be.revertedWith("Pausable: paused");
        });
    });
});
