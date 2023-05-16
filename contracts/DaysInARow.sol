// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DaysInARow is Ownable {
    struct Commitment {
        address payable user;
        uint256 deposit;
        uint256 fee;
        uint256 targetDays;
        uint256 checkedInDays;
        bool completed;
        bool failed;
        uint256 startDate;
        uint256 lossAccountIndex;
        string habitTitle;
    }
    mapping(uint256 => Commitment) public commitments;
    uint256 public numCommitments;

    struct LossAccount {
        address payable accountAddress;
        uint256[] commitments;
    }
    LossAccount[] public lossAccounts;

    address payable public treasury;
    uint256 public rakeBasisPoints = 0;

    constructor(address payable[] memory _lossAccounts) {
        setLossAccountsInternal(_lossAccounts);

        // set the treasury to the owner
        treasury = payable(msg.sender);
    }

    // function to set a rake percentage in basis points 
    function setRakeBasisPoints(uint256 _rakeBasisPoints) public onlyOwner {
        require(_rakeBasisPoints <= 10000, "Rake must be less than or equal to 10000");
        rakeBasisPoints = _rakeBasisPoints;
    }

    // function to set treasury address to a new address
    function setTreasury(address payable _treasury) public onlyOwner {
        treasury = _treasury;
    }

    // this function returns an array of address of the loss accounts
    function getLossAccounts() public view returns (address payable[] memory) {
        address payable[] memory lossAccountAddresses = new address payable[](lossAccounts.length);
        for (uint i = 0; i < lossAccounts.length; i++) {
            lossAccountAddresses[i] = lossAccounts[i].accountAddress;
        }
        return lossAccountAddresses;
    }

    function setLossAccountsInternal(
        address payable[] memory _lossAccounts
    ) internal {
        delete lossAccounts;
        for (uint i = 0; i < _lossAccounts.length; i++) {
            lossAccounts.push(
                LossAccount({
                    accountAddress: _lossAccounts[i],
                    commitments: new uint256[](0)
                })
            );
        }
    }

    // function to wrap setLossAccounts as a public function that can be called by the owner
    function setLossAccountsPublic(
        address payable[] memory _lossAccounts
    ) public onlyOwner {
        setLossAccountsInternal(_lossAccounts);
    }

    event CommitmentCreated(address indexed user, uint256 indexed commitmentId);
    function createCommitment(
        uint256 _targetDays,
        uint256 _lossAccountIndex,
        uint256 _startDate,
        string memory _habitTitle
    ) public payable {
        require(msg.value > 0, "Deposit is required");
        require(_targetDays > 0, "Target days must be greater than 0");
        require(
            _lossAccountIndex < lossAccounts.length,
            "Invalid loss account index"
        );
        require(_startDate > block.timestamp, "Start date must be in the future");

        uint256 habitTitleLength = bytes(_habitTitle).length;
        require(habitTitleLength > 0, "Habit Title cannot be empty");

        // transfer the rake to the treasury
        uint256 rakeAmount = (msg.value * rakeBasisPoints) / 10000;
        if (rakeAmount > 0) {
            (bool sent, ) = treasury.call{value: rakeAmount}("");
            require(sent, "Failed to send rake to treasury");
        }

        uint256 commitmentId = numCommitments;
        commitments[commitmentId] = Commitment({
            user: payable(msg.sender),
            deposit: msg.value,
            fee: rakeAmount,
            targetDays: _targetDays,
            checkedInDays: 0,
            completed: false,
            failed: false,
            startDate: _startDate,
            lossAccountIndex: _lossAccountIndex,
            habitTitle: _habitTitle
        });

        lossAccounts[_lossAccountIndex].commitments.push(commitmentId);

        numCommitments++;

        emit CommitmentCreated(msg.sender, commitmentId);
    }

    event CheckIn(address indexed user, uint256 indexed commitmentId);
    event CommitmentCompleted(address indexed user, uint256 indexed commitmentId);
    function checkIn(uint256 _commitmentId) public {
        Commitment storage commitment = commitments[_commitmentId];
        require(msg.sender == commitment.user, "Only the user can check in");
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");

        uint256 dayNum = getDayNum(_commitmentId);

        require(dayNum > 0, "You can't check in before the start date");

        if (isAbandoned(_commitmentId)) {
            commitmentFailed(_commitmentId);
            return;
        }

        if (dayNum == commitment.checkedInDays + 1) {
            commitment.checkedInDays = dayNum;
        }

        if (commitment.checkedInDays == commitment.targetDays) {
            (bool sent, ) = commitment.user.call{value: commitment.deposit}("");
            require(sent, "Failed to send deposit back to user");

            commitment.completed = true;
            emit CommitmentCompleted(commitment.user, _commitmentId);
        }

        emit CheckIn(commitment.user, _commitmentId);
    }

    function getDayNum(uint256 _commitmentId) public view returns (uint256) {
        Commitment storage commitment = commitments[_commitmentId];
        int256 secondsSinceStart = int256(block.timestamp) -
            int256(commitment.startDate);

        uint256 dayNum;
        if (secondsSinceStart < 0) {
            dayNum = 0;
        } else {
            // division will always round down
            dayNum = uint256(secondsSinceStart / 86400) + 1;
        }

        return (dayNum);
    }

    event Claimed(address indexed lossAccount, uint256 amount);
    function claimAll() public {
        // find lossAccount from msg.sender
        uint lossAccountIndex = 0;
        for (uint i = 0; i < lossAccounts.length; i++) {
            if (lossAccounts[i].accountAddress == msg.sender) {
                lossAccountIndex = i;
                break;
            }
        }

        LossAccount storage lossAccount = lossAccounts[lossAccountIndex];
        address lossAccountAddress = lossAccount.accountAddress;

        require(msg.sender == lossAccountAddress, "Only the loss account can claim");
        uint256 totalAmount = 0;

        for (uint i = 0; i < lossAccount.commitments.length; i++) {
            uint256 _commitmentId = lossAccount.commitments[i];
            Commitment storage commitment = commitments[_commitmentId];

            if (!commitment.failed && !commitment.completed) {
                // only able to claim if the commitment has been abandoned for more than 1 day
                if (isAbandoned(_commitmentId)) {
                    commitmentFailed(_commitmentId);
                    totalAmount += commitment.deposit;
                }
            }
        }
        require(totalAmount > 0, "No commitments to claim");
        emit Claimed(msg.sender, totalAmount);
    }

    // function that finalizes a commitment after it has been aboandoned and transfers the deposit to the loss account
    // - Anyone can call this function and pay gas to finalize the commitment
    function finalizeCommitment(uint256 _commitmentId) public {
        Commitment storage commitment = commitments[_commitmentId];
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");

        require(isAbandoned(_commitmentId), "This commitment is still active");

        commitmentFailed(_commitmentId);
    }

    // function call commitmentFailed to fail a commitment
    event CommitmentFailed(address indexed user, uint256 indexed commitmentId);
    function commitmentFailed(uint256 _commitmentId) internal {
        Commitment storage commitment = commitments[_commitmentId];
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");

        LossAccount storage lossAccount = lossAccounts[commitment.lossAccountIndex];

        (bool sent, ) = lossAccount.accountAddress.call{value: commitment.deposit}("");
        require(sent, "Failed to send deposit to loss account");

        commitment.failed = true;
        emit CommitmentFailed(commitment.user, _commitmentId);
    }

    function isAbandoned(uint256 _commitmentId) public view returns (bool) {
        Commitment storage commitment = commitments[_commitmentId];

        uint256 dayNum = getDayNum(_commitmentId);

        bool late = dayNum > commitment.checkedInDays + 1;

        return (late && !commitment.completed && !commitment.failed);
    }
}
