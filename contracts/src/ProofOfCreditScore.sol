// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ECDSAServiceManagerBase} from "@eigenlayer-middleware/src/unaudited/ECDSAServiceManagerBase.sol";
import {ECDSAStakeRegistry} from "@eigenlayer-middleware/src/unaudited/ECDSAStakeRegistry.sol";
import {IServiceManager} from "@eigenlayer-middleware/src/interfaces/IServiceManager.sol";
import {ECDSAUpgradeable} from "@openzeppelin-upgrades/contracts/utils/cryptography/ECDSAUpgradeable.sol";
import {IERC1271Upgradeable} from "@openzeppelin-upgrades/contracts/interfaces/IERC1271Upgradeable.sol";
import {IProofOfCreditScore} from "./IProofOfCreditScore.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@eigenlayer/contracts/interfaces/IRewardsCoordinator.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @title ProofOfCreditScore
 * @dev Manages the creation and response handling of credit score tasks.
 */
contract ProofOfCreditScore is
    ECDSAServiceManagerBase,
    IProofOfCreditScore
{
    using ECDSAUpgradeable for bytes32;

    uint32 public latestTaskNum;

    // mapping of task indices to all tasks hashes
    mapping(uint32 => bytes32) public override allTaskHashes;

    // mapping of operator responses by task index
    mapping(address => mapping(uint32 => bytes)) private taskResponses;

    mapping(address => uint256) public addressToCreditScore;

    modifier onlyOperator() {
        require(
            ECDSAStakeRegistry(stakeRegistry).operatorRegistered(msg.sender),
            "Operator must be the caller"
        );
        _;
    }

    constructor(
        address _avsDirectory,
        address _stakeRegistry,
        address _rewardsCoordinator,
        address _delegationManager
    )
        ECDSAServiceManagerBase(
            _avsDirectory,
            _stakeRegistry,
            _rewardsCoordinator,
            _delegationManager
        )
    {}

    /**
     * @notice Retrieves the response for a specific task from a particular operator.
     * @param operator The address of the operator who responded.
     * @param taskIndex The index of the task whose response is requested.
     * @return The response data in bytes format.
     */
    function allTaskResponses(
        address operator,
        uint32 taskIndex
    ) external view override returns (bytes memory) {
        return taskResponses[operator][taskIndex];
    }

    function createNewTask(
        string memory name,
        string memory username,
        address userAddress
    ) external override returns (Task memory) {
        Task memory newTask = Task({
            name: name,
            taskCreatedBlock: uint32(block.number),
            username: username,
            userAddress: userAddress
        });

        allTaskHashes[latestTaskNum] = keccak256(abi.encode(newTask));
        emit NewTaskCreated(latestTaskNum, newTask);
        latestTaskNum += 1;

        return newTask;
    }

    /**
     * @notice Allows an operator to respond to an existing credit score task.
     * @param task The Task struct with task details, including the credit score.
     * @param referenceTaskIndex The index of the task to which the response applies.
     * @param signature The operator's signature validating the task response.
     */
    function respondToTask(
        Task calldata task,
        uint32 referenceTaskIndex,
        bytes memory signature,
        uint256 creditScore
    ) external override onlyOperator {
        require(
            keccak256(abi.encode(task)) == allTaskHashes[referenceTaskIndex],
            "Task does not match stored hash"
        );
        require(
            taskResponses[msg.sender][referenceTaskIndex].length == 0,
            "Operator has already responded to this task"
        );

        bytes32 messageHash = keccak256(abi.encodePacked("Validation: ", task.name));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        bytes4 magicValue = IERC1271Upgradeable.isValidSignature.selector;

        require(
            magicValue ==
                ECDSAStakeRegistry(stakeRegistry).isValidSignature(
                    ethSignedMessageHash,
                    signature
                ),
            "Invalid operator signature"
        );

        taskResponses[msg.sender][referenceTaskIndex] = signature;
        addressToCreditScore[task.userAddress] = creditScore;

        emit TaskResponded(referenceTaskIndex, task, msg.sender);
    }
}
