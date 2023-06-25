// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract DaysInARow is Ownable, Pausable {
    struct Commitment {
        address payable user;
        uint256 deposit;
        uint256 fee;
        uint256 targetDays;
        uint256 checkedInDays;
        bool completed;
        bool failed;
        uint256 startDate;
        address lossAccountAddress;
        string habitTitle;
    }
    mapping(uint256 => Commitment) public commitments;
    uint256 public numCommitments;

    mapping(address => uint256[]) public accountCommitments;
    mapping(address => uint256[]) public lossAccountCommitments;

    address payable public treasury;
    uint256 public rakeBasisPoints = 0;

    constructor() {
        // set the treasury to the owner initially
        treasury = payable(msg.sender);

        // set the treasury to the owner initially
        setRakeBasisPoints(250);
    }

    // function to set a rake percentage in basis points
    function setRakeBasisPoints(
        uint256 _rakeBasisPoints
    ) public onlyOwner whenNotPaused {
        require(
            _rakeBasisPoints <= 10000,
            "Rake must be less than or equal to 10000"
        );
        rakeBasisPoints = _rakeBasisPoints;
    }

    // function to set treasury address to a new address
    function setTreasury(
        address payable _treasury
    ) public onlyOwner whenNotPaused {
        treasury = _treasury;
    }

    function getAccountCommitments(
        address _account
    ) public view returns (uint256[] memory) {
        console.log("getAccountCommitments: %s", _account);
        return accountCommitments[_account];
    }

    // createCommitment
    event CommitmentCreated(address indexed user, uint256 indexed commitmentId);

    function createCommitment(
        uint256 _targetDays,
        address _lossAccountAddress,
        uint256 _startDate,
        string memory _habitTitle
    ) public payable whenNotPaused {
        require(msg.value > 0, "Deposit is required");
        require(_targetDays > 0, "Target days must be greater than 0");

        // require loss account address
        require(
            _lossAccountAddress != address(0),
            "Invalid loss account address"
        );

        console.log("Start date: %s", _startDate);
        console.log("Block timestamp: %s", block.timestamp);
        require(
            _startDate > block.timestamp,
            "Start date must be in the future"
        );
        require(bytes(_habitTitle).length > 0, "Habit Title cannot be empty");

        uint256 rakeAmount = (msg.value * rakeBasisPoints) / 10000;
        require(
            rakeAmount < msg.value,
            "Total rake fee must be less than deposit"
        );

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
            lossAccountAddress: _lossAccountAddress,
            habitTitle: _habitTitle
        });

        accountCommitments[msg.sender].push(commitmentId);
        lossAccountCommitments[_lossAccountAddress].push(commitmentId);

        numCommitments++;

        emit CommitmentCreated(msg.sender, commitmentId);

        if (rakeAmount > 0) {
            // transfer the rake to the treasury
            (bool sent, ) = treasury.call{value: rakeAmount}("");
            require(sent, "Failed to send rake to treasury");
        }
    }

    event CheckIn(address indexed user, uint256 indexed commitmentId);
    event CommitmentCompleted(
        address indexed user,
        uint256 indexed commitmentId
    );

    function checkIn(uint256 _commitmentId) public whenNotPaused {
        Commitment storage commitment = commitments[_commitmentId];
        require(msg.sender == commitment.user, "Only the user can check in");
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");

        uint256 dayNum = getDayNum(_commitmentId);
        require(dayNum > 0, "You can't check in before the start date");
        require(dayNum > commitment.checkedInDays, "You can't check in twice for the same day");

        if (isAbandoned(_commitmentId)) {
            commitmentFailed(_commitmentId);
            return;
        }

        if (dayNum == commitment.checkedInDays + 1) {
            commitment.checkedInDays = dayNum;
        }

        if (commitment.checkedInDays == commitment.targetDays) {
            commitment.completed = true;
            emit CommitmentCompleted(commitment.user, _commitmentId);

            uint256 totalAmount = commitment.deposit - commitment.fee;

            (bool sent, ) = commitment.user.call{value: totalAmount}("");
            require(sent, "Failed to send deposit back to user");
        }
        emit CheckIn(commitment.user, _commitmentId);
    }

    // function return the current timestamp
    function getTimestamp() public view returns (uint256) {
        return block.timestamp;
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

    // function that finalizes a commitment after it has been aboandoned and transfers the deposit to the loss account
    // - Anyone can call this function and pay gas to finalize the commitment
    function finalizeCommitment(uint256 _commitmentId) public whenNotPaused {
        Commitment storage commitment = commitments[_commitmentId];
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");
        require(isAbandoned(_commitmentId), "This commitment is still active");

        commitmentFailed(_commitmentId);
    }

    event Claimed(address indexed lossAccountAddress, uint256 amount);

    function claimAllForLossAccount(
        address _lossAccountAddress
    ) public whenNotPaused {
        require(
            _lossAccountAddress != address(0),
            "Loss account address is required"
        );

        uint256[] memory commitmentsForLossAccount = lossAccountCommitments[
            _lossAccountAddress
        ];
        require(
            commitmentsForLossAccount.length > 0,
            "No commitments to claim for this address"
        );

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < commitmentsForLossAccount.length; i++) {
            uint256 commitmentId = commitmentsForLossAccount[i];
            Commitment storage commitment = commitments[commitmentId];

            if (!commitment.failed && !commitment.completed) {
                // only able to claim if the commitment has been abandoned for more than 1 day
                if (isAbandoned(commitmentId)) {
                    commitmentFailed(commitmentId);
                    totalAmount =
                        totalAmount +
                        commitment.deposit -
                        commitment.fee;
                }
            }
        }
        require(totalAmount > 0, "No commitments to claim");
        emit Claimed(_lossAccountAddress, totalAmount);
    }

    // function call commitmentFailed to fail a commitment
    event CommitmentFailed(address indexed user, uint256 indexed commitmentId);

    function commitmentFailed(uint256 _commitmentId) internal {
        Commitment storage commitment = commitments[_commitmentId];
        require(!commitment.completed, "Commitment already completed");
        require(!commitment.failed, "Commitment already failed");

        uint256 totalAmount = commitment.deposit - commitment.fee;

        commitment.failed = true;
        emit CommitmentFailed(commitment.user, _commitmentId);

        (bool sent, ) = commitment.lossAccountAddress.call{value: totalAmount}(
            ""
        );
        require(sent, "Failed to send deposit to loss account address");
    }

    function isAbandoned(uint256 _commitmentId) public view returns (bool) {
        Commitment storage commitment = commitments[_commitmentId];

        uint256 dayNum = getDayNum(_commitmentId);
        bool late = dayNum > commitment.checkedInDays + 1;

        return (late && !commitment.completed && !commitment.failed);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    fallback() external {
        revert("Operation not supported");
    }
}
